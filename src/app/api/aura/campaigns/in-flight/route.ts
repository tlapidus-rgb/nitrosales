export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Campañas en vuelo
// ══════════════════════════════════════════════════════════════
// Devuelve las campañas ACTIVE con métricas de progreso:
//   - revenue acumulado en vida de la campaña
//   - conversions
//   - bonusTarget + bonusAmount + % progress
//   - time progress (día X de Y)
//   - status calculado: ahead / on_track / behind / no_target / no_time_limit
//   - creator (name + avatar)
// Orden: las que están por vencer antes + las más cerca del target.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

const DAY = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const now = new Date();

    const campaigns = await prisma.influencerCampaign.findMany({
      where: { organizationId: org.id, status: "ACTIVE" },
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        bonusAmount: true,
        bonusTarget: true,
        influencer: {
          select: {
            id: true,
            name: true,
            code: true,
            profileImage: true,
          },
        },
      },
    });

    if (campaigns.length === 0) {
      return NextResponse.json({
        generatedAt: now.toISOString(),
        total: 0,
        unlocked: 0,
        flights: [],
      });
    }

    const ids = campaigns.map((c) => c.id);

    const attrGrouped = await prisma.influencerAttribution.groupBy({
      by: ["campaignId"],
      where: {
        organizationId: org.id,
        campaignId: { in: ids },
      },
      _sum: { attributedValue: true },
      _count: { id: true },
    });
    const revMap = new Map<string, { revenue: number; conversions: number }>();
    for (const r of attrGrouped) {
      if (!r.campaignId) continue;
      revMap.set(r.campaignId, {
        revenue: Number(r._sum.attributedValue || 0),
        conversions: r._count.id || 0,
      });
    }

    const flights = campaigns.map((c) => {
      const stats = revMap.get(c.id) || { revenue: 0, conversions: 0 };
      const target = c.bonusTarget ? Number(c.bonusTarget) : null;
      const bonus = c.bonusAmount ? Number(c.bonusAmount) : null;

      const start = c.startDate.getTime();
      const end = c.endDate ? c.endDate.getTime() : null;
      const nowMs = now.getTime();

      const totalDays = end
        ? Math.max(1, Math.round((end - start) / DAY))
        : null;
      const daysElapsed = Math.max(
        0,
        Math.round((nowMs - start) / DAY),
      );
      const daysRemaining = end
        ? Math.max(0, Math.round((end - nowMs) / DAY))
        : null;

      const revenuePct = target && target > 0
        ? Math.min(1, stats.revenue / target)
        : null;
      const timePct = totalDays
        ? Math.min(1, daysElapsed / totalDays)
        : null;

      // Status calculado
      let status:
        | "unlocked"
        | "ahead"
        | "on_track"
        | "behind"
        | "at_risk"
        | "no_target"
        | "no_time_limit";
      if (target === null && end === null) {
        status = "no_time_limit";
      } else if (target === null) {
        status = "no_target";
      } else if (revenuePct !== null && revenuePct >= 1) {
        status = "unlocked";
      } else if (timePct === null) {
        // target sin tiempo
        status = revenuePct! >= 0.75
          ? "ahead"
          : revenuePct! >= 0.4
            ? "on_track"
            : "behind";
      } else {
        const delta = (revenuePct || 0) - timePct;
        if (delta >= 0.08) status = "ahead";
        else if (delta >= -0.08) status = "on_track";
        else if (delta >= -0.25) status = "behind";
        else status = "at_risk";
      }

      return {
        id: c.id,
        name: c.name,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate ? c.endDate.toISOString() : null,
        revenue: stats.revenue,
        conversions: stats.conversions,
        bonusTarget: target,
        bonusAmount: bonus,
        revenuePct,
        timePct,
        totalDays,
        daysElapsed,
        daysRemaining,
        status,
        creator: {
          id: c.influencer?.id ?? "",
          name: c.influencer?.name ?? "—",
          code: c.influencer?.code ?? "",
          avatarUrl: c.influencer?.profileImage ?? null,
        },
      };
    });

    // Orden: unlocked último, luego por urgencia (días restantes ASC) y gap al target
    const priorityRank: Record<string, number> = {
      at_risk: 0,
      behind: 1,
      on_track: 2,
      ahead: 3,
      no_target: 4,
      no_time_limit: 5,
      unlocked: 6,
    };
    flights.sort((a, b) => {
      const r = priorityRank[a.status] - priorityRank[b.status];
      if (r !== 0) return r;
      // misma prioridad → días restantes ASC (más urgente primero)
      if (a.daysRemaining !== null && b.daysRemaining !== null)
        return a.daysRemaining - b.daysRemaining;
      return 0;
    });

    const unlocked = flights.filter((f) => f.status === "unlocked").length;

    return NextResponse.json({
      generatedAt: now.toISOString(),
      total: flights.length,
      unlocked,
      flights,
    });
  } catch (error) {
    console.error("[aura/campaigns/in-flight] error:", error);
    return NextResponse.json(
      { error: "internal", message: (error as Error).message },
      { status: 500 },
    );
  }
}
