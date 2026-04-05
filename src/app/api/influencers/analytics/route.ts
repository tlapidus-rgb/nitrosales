export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Influencer Analytics API — Cohorts, ROI, Anomalies
// ══════════════════════════════════════════════════════════════
// GET — Returns advanced analytics for the influencer program
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    if (!org) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // ── 1. Monthly cohort: revenue per influencer per month (last 6 months) ──
    const monthlyCohort = await prisma.$queryRaw<
      Array<{ month: string; influencerId: string; revenue: number; conversions: number; commission: number }>
    >(Prisma.sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', ia."createdAt"), 'YYYY-MM') as month,
        ia."influencerId",
        COALESCE(SUM(ia."attributedValue"), 0)::float as revenue,
        COUNT(*)::int as conversions,
        COALESCE(SUM(ia."commissionAmount"), 0)::float as commission
      FROM "influencer_attributions" ia
      WHERE ia."organizationId" = ${org.id}
        AND ia."createdAt" >= ${sixMonthsAgo}
      GROUP BY month, ia."influencerId"
      ORDER BY month ASC
    `);

    // Get influencer names
    const infIds = [...new Set(monthlyCohort.map((c) => c.influencerId))];
    const influencers = infIds.length > 0
      ? await prisma.influencer.findMany({
          where: { id: { in: infIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(influencers.map((i) => [i.id, i.name]));

    // Build cohort matrix
    const months = [...new Set(monthlyCohort.map((c) => c.month))].sort();
    const cohortData = months.map((month) => {
      const monthEntries = monthlyCohort.filter((c) => c.month === month);
      const byInfluencer: Record<string, { revenue: number; conversions: number; commission: number }> = {};
      for (const entry of monthEntries) {
        byInfluencer[nameMap.get(entry.influencerId) || entry.influencerId] = {
          revenue: entry.revenue,
          conversions: entry.conversions,
          commission: entry.commission,
        };
      }
      return {
        month,
        total: monthEntries.reduce((s, e) => s + e.revenue, 0),
        totalCommission: monthEntries.reduce((s, e) => s + e.commission, 0),
        totalConversions: monthEntries.reduce((s, e) => s + e.conversions, 0),
        influencers: byInfluencer,
      };
    });

    // ── 2. ROI per campaign ──
    const campaigns = await prisma.influencerCampaign.findMany({
      where: { organizationId: org.id },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        bonusAmount: true,
        bonusTarget: true,
        influencer: { select: { name: true, commissionPercent: true } },
      },
    });

    const campaignIds = campaigns.map((c) => c.id);
    const campaignRevenues = campaignIds.length > 0
      ? await prisma.influencerAttribution.groupBy({
          by: ["campaignId"],
          where: {
            organizationId: org.id,
            campaignId: { in: campaignIds },
          },
          _sum: { attributedValue: true, commissionAmount: true },
          _count: { id: true },
        })
      : [];

    const campaignRevenueMap = new Map(
      campaignRevenues.map((cr) => [
        cr.campaignId,
        {
          revenue: Number(cr._sum.attributedValue || 0),
          commission: Number(cr._sum.commissionAmount || 0),
          conversions: cr._count.id || 0,
        },
      ])
    );

    const campaignROI = campaigns.map((c) => {
      const metrics = campaignRevenueMap.get(c.id) || { revenue: 0, commission: 0, conversions: 0 };
      const totalCost = metrics.commission + (c.bonusAmount ? Number(c.bonusAmount) : 0);
      const roi = totalCost > 0 ? ((metrics.revenue - totalCost) / totalCost) * 100 : 0;
      const bonusTarget = c.bonusTarget ? Number(c.bonusTarget) : null;
      const progress = bonusTarget && bonusTarget > 0 ? Math.min((metrics.revenue / bonusTarget) * 100, 100) : null;

      return {
        id: c.id,
        name: c.name,
        status: c.status,
        influencer: c.influencer.name,
        revenue: metrics.revenue,
        commission: metrics.commission,
        conversions: metrics.conversions,
        totalCost,
        roi,
        bonusTarget,
        bonusAmount: c.bonusAmount ? Number(c.bonusAmount) : null,
        progress,
      };
    });

    campaignROI.sort((a, b) => b.revenue - a.revenue);

    // ── 3. Anomaly detection (simple: compare last 7 days vs previous 7 days) ──
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const recentDaily = await prisma.$queryRaw<
      Array<{ influencerId: string; revenue: number; conversions: number }>
    >(Prisma.sql`
      SELECT "influencerId",
        COALESCE(SUM("attributedValue"), 0)::float as revenue,
        COUNT(*)::int as conversions
      FROM "influencer_attributions"
      WHERE "organizationId" = ${org.id}
        AND "createdAt" >= ${sevenDaysAgo}
      GROUP BY "influencerId"
    `);

    const prevDaily = await prisma.$queryRaw<
      Array<{ influencerId: string; revenue: number; conversions: number }>
    >(Prisma.sql`
      SELECT "influencerId",
        COALESCE(SUM("attributedValue"), 0)::float as revenue,
        COUNT(*)::int as conversions
      FROM "influencer_attributions"
      WHERE "organizationId" = ${org.id}
        AND "createdAt" >= ${fourteenDaysAgo}
        AND "createdAt" < ${sevenDaysAgo}
      GROUP BY "influencerId"
    `);

    const prevDailyMap = new Map(
      prevDaily.map((d) => [d.influencerId, d])
    );

    const anomalies: Array<{
      influencer: string;
      type: "spike" | "drop";
      metric: string;
      change: number;
      current: number;
      previous: number;
    }> = [];

    for (const recent of recentDaily) {
      const prev = prevDailyMap.get(recent.influencerId);
      const name = nameMap.get(recent.influencerId) || "Unknown";

      if (prev && prev.revenue > 0) {
        const revenueChange = ((recent.revenue - prev.revenue) / prev.revenue) * 100;
        if (revenueChange > 80) {
          anomalies.push({
            influencer: name,
            type: "spike",
            metric: "ventas",
            change: revenueChange,
            current: recent.revenue,
            previous: prev.revenue,
          });
        } else if (revenueChange < -50) {
          anomalies.push({
            influencer: name,
            type: "drop",
            metric: "ventas",
            change: revenueChange,
            current: recent.revenue,
            previous: prev.revenue,
          });
        }
      }

      // New influencer with significant sales (no previous data)
      if (!prev && recent.revenue > 10000) {
        anomalies.push({
          influencer: name,
          type: "spike",
          metric: "ventas",
          change: 100,
          current: recent.revenue,
          previous: 0,
        });
      }
    }

    // Check for influencers that went silent
    for (const prev of prevDaily) {
      const hasRecent = recentDaily.find((r) => r.influencerId === prev.influencerId);
      if (!hasRecent && prev.revenue > 5000) {
        anomalies.push({
          influencer: nameMap.get(prev.influencerId) || "Unknown",
          type: "drop",
          metric: "actividad",
          change: -100,
          current: 0,
          previous: prev.revenue,
        });
      }
    }

    anomalies.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    // ── 4. Program-level KPIs ──
    const thisMonthAgg = await prisma.influencerAttribution.aggregate({
      where: { organizationId: org.id, createdAt: { gte: monthStart } },
      _sum: { attributedValue: true, commissionAmount: true },
      _count: { id: true },
    });

    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthAgg = await prisma.influencerAttribution.aggregate({
      where: { organizationId: org.id, createdAt: { gte: prevMonthStart, lt: monthStart } },
      _sum: { attributedValue: true, commissionAmount: true },
      _count: { id: true },
    });

    const totalOrders = await prisma.order.count({
      where: { organizationId: org.id, createdAt: { gte: monthStart } },
    });

    const influencerRevenue = Number(thisMonthAgg._sum.attributedValue || 0);
    const totalOrderRevenue = await prisma.order.aggregate({
      where: { organizationId: org.id, createdAt: { gte: monthStart } },
      _sum: { totalValue: true },
    });
    const totalRevenue = Number(totalOrderRevenue._sum.totalValue || 0);

    const programKPIs = {
      monthlyRevenue: influencerRevenue,
      monthlyCommission: Number(thisMonthAgg._sum.commissionAmount || 0),
      monthlyConversions: thisMonthAgg._count.id || 0,
      prevMonthRevenue: Number(prevMonthAgg._sum.attributedValue || 0),
      prevMonthCommission: Number(prevMonthAgg._sum.commissionAmount || 0),
      revenueShare: totalRevenue > 0 ? (influencerRevenue / totalRevenue) * 100 : 0,
      totalOrders,
      avgCommissionRate: influencerRevenue > 0
        ? (Number(thisMonthAgg._sum.commissionAmount || 0) / influencerRevenue) * 100
        : 0,
    };

    return NextResponse.json({
      cohort: cohortData,
      campaigns: campaignROI,
      anomalies,
      kpis: programKPIs,
      months,
      influencerNames: Object.fromEntries(nameMap),
    });
  } catch (error: any) {
    console.error("[Analytics API]", error?.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
