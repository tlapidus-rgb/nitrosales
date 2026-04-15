export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Hero Metrics
// ══════════════════════════════════════════════════════════════
// 4 KPIs vivos para la Zona 2 de Inicio:
//   1. Revenue atribuido     (ARS, + delta vs período anterior)
//   2. Creators activos      (creators que vendieron en el período)
//   3. Contenido publicado   (piezas aprobadas publicadas en el período)
//   4. EMV estimado          (Earned Media Value — LATAM formula)
//
// Cada KPI incluye:
//   - current: valor del período actual
//   - previous: valor del período anterior (mismo largo, inmediatamente antes)
//   - delta: % de cambio (null si previous = 0)
//
// Además devolvemos un "top creators" chip (avatares/iniciales) para
// usarlo como micro-animación en la card de Creators activos.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

// EMV — Earned Media Value LATAM
// CPM promedio ponderado Meta + Google + TikTok LATAM ≈ USD 4.67 / 1000 impr.
// Conversión ARS aproximada abril 2026 (1 USD ≈ 1000 ARS) → ARS 4.67 / view.
const EMV_ARS_PER_VIEW = 4.67;

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
  // Período anterior: mismo ancho, inmediatamente antes
  const span = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - span);
  return { from, to, prevFrom, prevTo };
}

function delta(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
}

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const url = new URL(req.url);
    const { from, to, prevFrom, prevTo } = getPeriod(url);

    // ─── Queries paralelizadas (pool = 8) ──────────────
    const [
      currAttrAgg,
      prevAttrAgg,
      currCreatorsWhoSold,
      prevCreatorsWhoSold,
      currPublished,
      prevPublished,
      currViewsContent,
      prevViewsContent,
      topCreators,
    ] = await Promise.all([
      prisma.influencerAttribution.aggregate({
        where: {
          organizationId: org.id,
          createdAt: { gte: from, lte: to },
        },
        _sum: { attributedValue: true },
      }),
      prisma.influencerAttribution.aggregate({
        where: {
          organizationId: org.id,
          createdAt: { gte: prevFrom, lte: prevTo },
        },
        _sum: { attributedValue: true },
      }),
      prisma.influencerAttribution.groupBy({
        by: ["influencerId"],
        where: {
          organizationId: org.id,
          createdAt: { gte: from, lte: to },
        },
      }),
      prisma.influencerAttribution.groupBy({
        by: ["influencerId"],
        where: {
          organizationId: org.id,
          createdAt: { gte: prevFrom, lte: prevTo },
        },
      }),
      prisma.contentSubmission.count({
        where: {
          organizationId: org.id,
          status: { in: ["APPROVED", "PUBLISHED"] },
          publishedAt: { gte: from, lte: to },
        },
      }),
      prisma.contentSubmission.count({
        where: {
          organizationId: org.id,
          status: { in: ["APPROVED", "PUBLISHED"] },
          publishedAt: { gte: prevFrom, lte: prevTo },
        },
      }),
      prisma.contentSubmission.findMany({
        where: {
          organizationId: org.id,
          status: { in: ["APPROVED", "PUBLISHED"] },
          publishedAt: { gte: from, lte: to },
        },
        select: { metrics: true },
      }),
      prisma.contentSubmission.findMany({
        where: {
          organizationId: org.id,
          status: { in: ["APPROVED", "PUBLISHED"] },
          publishedAt: { gte: prevFrom, lte: prevTo },
        },
        select: { metrics: true },
      }),
      // Top creators del período por revenue (para avatares)
      prisma.influencerAttribution.groupBy({
        by: ["influencerId"],
        where: {
          organizationId: org.id,
          createdAt: { gte: from, lte: to },
        },
        _sum: { attributedValue: true },
        orderBy: { _sum: { attributedValue: "desc" } },
        take: 5,
      }),
    ]);

    // Revenue
    const revenueCurrent = Number(currAttrAgg._sum.attributedValue || 0);
    const revenuePrevious = Number(prevAttrAgg._sum.attributedValue || 0);

    // Active creators (que vendieron)
    const activeCurrent = currCreatorsWhoSold.length;
    const activePrevious = prevCreatorsWhoSold.length;

    // Contenido publicado
    const contentCurrent = currPublished;
    const contentPrevious = prevPublished;

    // EMV — sumamos views de metrics JSON
    function sumViews(rows: { metrics: any }[]): number {
      let total = 0;
      for (const r of rows) {
        const m = r.metrics as any;
        if (m && typeof m === "object") {
          const v =
            Number(m.views) ||
            Number(m.reach) ||
            Number(m.impressions) ||
            0;
          if (isFinite(v)) total += v;
        }
      }
      return total;
    }
    const viewsCurrent = sumViews(currViewsContent);
    const viewsPrevious = sumViews(prevViewsContent);
    const emvCurrent = Math.round(viewsCurrent * EMV_ARS_PER_VIEW);
    const emvPrevious = Math.round(viewsPrevious * EMV_ARS_PER_VIEW);

    // Top creators con nombre
    const topIds = topCreators.map((t) => t.influencerId);
    const topInfluencers = topIds.length
      ? await prisma.influencer.findMany({
          where: { id: { in: topIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const byId = new Map(topInfluencers.map((i) => [i.id, i]));
    const topAvatars = topCreators.map((t) => {
      const inf = byId.get(t.influencerId);
      return {
        id: t.influencerId,
        name: inf?.name ?? "—",
        code: inf?.code ?? "",
        revenue: Number(t._sum.attributedValue || 0),
      };
    });

    return NextResponse.json({
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        prevFrom: prevFrom.toISOString(),
        prevTo: prevTo.toISOString(),
      },
      kpis: {
        revenue: {
          current: revenueCurrent,
          previous: revenuePrevious,
          delta: delta(revenueCurrent, revenuePrevious),
        },
        activeCreators: {
          current: activeCurrent,
          previous: activePrevious,
          delta: delta(activeCurrent, activePrevious),
        },
        publishedContent: {
          current: contentCurrent,
          previous: contentPrevious,
          delta: delta(contentCurrent, contentPrevious),
        },
        emv: {
          current: emvCurrent,
          previous: emvPrevious,
          delta: delta(emvCurrent, emvPrevious),
          totalViews: viewsCurrent,
        },
      },
      topAvatars,
    });
  } catch (error: any) {
    console.error("[aura/metrics/hero GET]", error);
    return NextResponse.json(
      { error: error?.message || "hero_failed" },
      { status: 500 }
    );
  }
}
