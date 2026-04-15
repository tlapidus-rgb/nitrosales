export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Hall of flame (top 3 creators del período)
// ══════════════════════════════════════════════════════════════
// Devuelve el podio: top 3 creators por revenue atribuido en el
// período. Cada slot trae:
//   - id, name, code, commissionPercent
//   - revenue, conversions, avgTicket
//   - vsAverage: % arriba/abajo del promedio del conjunto activo
//   - campaignsCount (campañas activas en el período)
//
// Diseñado para alimentar directamente las "trading cards" del
// Hall of flame sin que el front tenga que hacer cálculos.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

function getPeriod(url: URL) {
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const now = new Date();
  let from: Date;
  let to: Date;
  if (fromParam && toParam) {
    from = new Date(fromParam);
    to = new Date(toParam);
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    to = new Date(now);
  }
  return { from, to };
}

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const url = new URL(req.url);
    const { from, to } = getPeriod(url);

    // Todos los creators que vendieron en el período (para calcular promedio + top 3)
    const grouped = await prisma.influencerAttribution.groupBy({
      by: ["influencerId"],
      where: {
        organizationId: org.id,
        createdAt: { gte: from, lte: to },
      },
      _sum: { attributedValue: true },
      _count: { id: true },
      orderBy: { _sum: { attributedValue: "desc" } },
    });

    if (grouped.length === 0) {
      return NextResponse.json({
        period: { from: from.toISOString(), to: to.toISOString() },
        podium: [],
        stats: { creatorsWhoSold: 0, averageRevenue: 0 },
      });
    }

    // Promedio del grupo activo (para "vs average")
    const totalRevenue = grouped.reduce(
      (s, g) => s + Number(g._sum.attributedValue || 0),
      0
    );
    const averageRevenue = totalRevenue / grouped.length;

    // Top 3
    const top3 = grouped.slice(0, 3);
    const ids = top3.map((t) => t.influencerId);

    const [influencers, campaignsGrouped] = await Promise.all([
      prisma.influencer.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          name: true,
          code: true,
          commissionPercent: true,
          profileImage: true,
        },
      }),
      prisma.influencerCampaign.groupBy({
        by: ["influencerId"],
        where: {
          organizationId: org.id,
          influencerId: { in: ids },
          startDate: { lte: to },
          OR: [{ endDate: null }, { endDate: { gte: from } }],
        },
        _count: { id: true },
      }),
    ]);

    const campaignCountById = new Map<string, number>();
    for (const g of campaignsGrouped) {
      campaignCountById.set(g.influencerId, g._count.id);
    }

    const byId = new Map(influencers.map((i) => [i.id, i]));

    const podium = top3.map((row, idx) => {
      const inf = byId.get(row.influencerId);
      const revenue = Number(row._sum.attributedValue || 0);
      const conversions = row._count.id || 0;
      const avgTicket = conversions > 0 ? revenue / conversions : 0;
      const vsAverage =
        averageRevenue > 0 ? ((revenue - averageRevenue) / averageRevenue) * 100 : 0;
      return {
        rank: idx + 1,
        id: row.influencerId,
        name: inf?.name ?? "Creator",
        code: inf?.code ?? "",
        avatarUrl: inf?.profileImage ?? null,
        commissionPercent: Number(inf?.commissionPercent ?? 0),
        revenue,
        conversions,
        avgTicket,
        vsAverage,
        campaignsCount: campaignCountById.get(row.influencerId) || 0,
      };
    });

    return NextResponse.json({
      period: { from: from.toISOString(), to: to.toISOString() },
      podium,
      stats: {
        creatorsWhoSold: grouped.length,
        averageRevenue,
      },
    });
  } catch (error: any) {
    console.error("[aura/metrics/podium GET]", error);
    return NextResponse.json(
      { error: error?.message || "podium_failed" },
      { status: 500 }
    );
  }
}
