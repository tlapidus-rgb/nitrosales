// ══════════════════════════════════════════════════════════════
// Influencer Leaderboard API
// ══════════════════════════════════════════════════════════════
// GET — Returns ranked influencers with comparative metrics
// Params: ?period=month|quarter|year|all  &sort=revenue|conversions|commission|roi
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    if (!org) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "month";
    const sort = url.searchParams.get("sort") || "revenue";

    // Date range
    const now = new Date();
    let dateFrom: Date;
    switch (period) {
      case "quarter":
        dateFrom = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        break;
      case "year":
        dateFrom = new Date(now.getFullYear(), 0, 1);
        break;
      case "all":
        dateFrom = new Date(2020, 0, 1);
        break;
      default: // month
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Previous period for comparison
    const periodMs = now.getTime() - dateFrom.getTime();
    const prevFrom = new Date(dateFrom.getTime() - periodMs);
    const prevTo = dateFrom;

    // Get all active influencers
    const influencers = await prisma.influencer.findMany({
      where: { organizationId: org.id, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        code: true,
        profileImage: true,
        commissionPercent: true,
      },
    });

    if (influencers.length === 0) {
      return NextResponse.json({ leaderboard: [], totals: null, period });
    }

    const infIds = influencers.map((i) => i.id);

    // Current period aggregations per influencer
    const currentAgg = await prisma.influencerAttribution.groupBy({
      by: ["influencerId"],
      where: {
        organizationId: org.id,
        influencerId: { in: infIds },
        createdAt: { gte: dateFrom },
      },
      _sum: { attributedValue: true, commissionAmount: true },
      _count: { id: true },
    });

    // Previous period aggregations per influencer
    const prevAgg = await prisma.influencerAttribution.groupBy({
      by: ["influencerId"],
      where: {
        organizationId: org.id,
        influencerId: { in: infIds },
        createdAt: { gte: prevFrom, lt: prevTo },
      },
      _sum: { attributedValue: true, commissionAmount: true },
      _count: { id: true },
    });

    // Unique visitors per influencer (from pixel events)
    const visitorCounts = await prisma.$queryRaw<
      Array<{ source: string; count: number }>
    >(Prisma.sql`
      SELECT "utmParams"->>'source' as source, COUNT(DISTINCT "visitorId")::int as count
      FROM "pixel_events"
      WHERE "organizationId" = ${org.id}
        AND "timestamp" >= ${dateFrom}
        AND "utmParams"->>'source' LIKE 'inf_%'
      GROUP BY "utmParams"->>'source'
    `);

    const visitorMap = new Map(
      visitorCounts.map((v) => [v.source.replace("inf_", ""), v.count])
    );

    // Best day per influencer
    const bestDays = await prisma.$queryRaw<
      Array<{ influencerId: string; date: string; sales: number }>
    >(Prisma.sql`
      SELECT "influencerId", DATE("createdAt") as date,
        COALESCE(SUM("attributedValue"), 0)::float as sales
      FROM "influencer_attributions"
      WHERE "organizationId" = ${org.id}
        AND "influencerId" = ANY(${infIds})
        AND "createdAt" >= ${dateFrom}
      GROUP BY "influencerId", DATE("createdAt")
      ORDER BY sales DESC
    `);

    const bestDayMap = new Map<string, { date: string; sales: number }>();
    for (const bd of bestDays) {
      if (!bestDayMap.has(bd.influencerId)) {
        bestDayMap.set(bd.influencerId, { date: bd.date, sales: bd.sales });
      }
    }

    // Build maps
    const currentMap = new Map(
      currentAgg.map((a) => [
        a.influencerId,
        {
          revenue: Number(a._sum.attributedValue || 0),
          commission: Number(a._sum.commissionAmount || 0),
          conversions: a._count.id || 0,
        },
      ])
    );

    const prevMap = new Map(
      prevAgg.map((a) => [
        a.influencerId,
        {
          revenue: Number(a._sum.attributedValue || 0),
          commission: Number(a._sum.commissionAmount || 0),
          conversions: a._count.id || 0,
        },
      ])
    );

    // Build leaderboard
    const leaderboard = influencers.map((inf) => {
      const curr = currentMap.get(inf.id) || { revenue: 0, commission: 0, conversions: 0 };
      const prev = prevMap.get(inf.id) || { revenue: 0, commission: 0, conversions: 0 };
      const visitors = visitorMap.get(inf.code) || 0;
      const bestDay = bestDayMap.get(inf.id) || null;

      const revenueChange = prev.revenue > 0
        ? ((curr.revenue - prev.revenue) / prev.revenue) * 100
        : curr.revenue > 0 ? 100 : 0;

      const conversionRate = visitors > 0 ? (curr.conversions / visitors) * 100 : 0;
      const avgOrderValue = curr.conversions > 0 ? curr.revenue / curr.conversions : 0;
      // ROI = (revenue - commission) / commission * 100
      const roi = curr.commission > 0
        ? ((curr.revenue - curr.commission) / curr.commission) * 100
        : 0;

      return {
        id: inf.id,
        name: inf.name,
        code: inf.code,
        profileImage: inf.profileImage,
        commissionPercent: Number(inf.commissionPercent),
        revenue: curr.revenue,
        commission: curr.commission,
        conversions: curr.conversions,
        visitors,
        conversionRate,
        avgOrderValue,
        roi,
        revenueChange,
        prevRevenue: prev.revenue,
        bestDay,
      };
    });

    // Sort
    const sortKey = sort as keyof (typeof leaderboard)[0];
    leaderboard.sort((a, b) => {
      const av = (a as any)[sortKey] ?? 0;
      const bv = (b as any)[sortKey] ?? 0;
      return bv - av;
    });

    // Totals
    const totals = {
      revenue: leaderboard.reduce((s, l) => s + l.revenue, 0),
      commission: leaderboard.reduce((s, l) => s + l.commission, 0),
      conversions: leaderboard.reduce((s, l) => s + l.conversions, 0),
      visitors: leaderboard.reduce((s, l) => s + l.visitors, 0),
      influencerCount: leaderboard.filter((l) => l.revenue > 0).length,
    };

    return NextResponse.json({ leaderboard, totals, period });
  } catch (error: any) {
    console.error("[Leaderboard API]", error?.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
