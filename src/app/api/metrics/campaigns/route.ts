import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const revalidate = 0;
const ORG_ID = "cmmmga1uq0000sb43w0krvvys";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const now = new Date();
    const dateTo = toParam
      ? new Date(toParam + "T23:59:59.999-03:00")
      : now;
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const daysDiff = Math.max(
      1,
      Math.round((dateTo.getTime() - dateFrom.getTime()) / (24 * 60 * 60 * 1000))
    );

    // Previous period for comparison
    const prevFrom = new Date(dateFrom.getTime() - daysDiff * 24 * 60 * 60 * 1000);
    const prevTo = new Date(dateFrom.getTime() - 1);

    // ── Current period campaigns with daily metrics ──
    const campaigns = await prisma.adCampaign.findMany({
      where: { organizationId: ORG_ID },
      include: {
        dailyMetrics: {
          where: { date: { gte: dateFrom, lte: dateTo } },
          orderBy: { date: "asc" },
        },
      },
    });

    // ── Previous period metrics for comparison ──
    const prevMetrics = await prisma.adMetricDaily.findMany({
      where: {
        organizationId: ORG_ID,
        date: { gte: prevFrom, lte: prevTo },
      },
    });

    const prevTotals = {
      spend: prevMetrics.reduce((s, m) => s + Number(m.spend), 0),
      impressions: prevMetrics.reduce((s, m) => s + m.impressions, 0),
      clicks: prevMetrics.reduce((s, m) => s + m.clicks, 0),
      conversions: prevMetrics.reduce((s, m) => s + m.conversions, 0),
      conversionValue: prevMetrics.reduce((s, m) => s + Number(m.conversionValue), 0),
    };

    // ── Build campaign results ──
    const result = campaigns
      .map((c) => {
        const spend = c.dailyMetrics.reduce((s, m) => s + Number(m.spend), 0);
        const impressions = c.dailyMetrics.reduce((s, m) => s + m.impressions, 0);
        const clicks = c.dailyMetrics.reduce((s, m) => s + m.clicks, 0);
        const conversions = c.dailyMetrics.reduce((s, m) => s + m.conversions, 0);
        const conversionValue = c.dailyMetrics.reduce((s, m) => s + Number(m.conversionValue), 0);
        const reach = c.dailyMetrics.reduce((s, m) => s + (m.reach || 0), 0);
        const frequency = c.dailyMetrics.length > 0
          ? c.dailyMetrics.reduce((s, m) => s + (m.frequency || 0), 0) / c.dailyMetrics.length
          : 0;

        return {
          id: c.id,
          name: c.name,
          platform: c.platform,
          status: c.status,
          objective: c.objective,
          spend,
          impressions,
          clicks,
          ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
          cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
          conversions,
          conversionValue,
          roas: spend > 0 ? Math.round((conversionValue / spend) * 100) / 100 : 0,
          reach,
          frequency: Math.round(frequency * 100) / 100,
          daysWithData: c.dailyMetrics.length,
        };
      })
      .filter((c) => c.spend > 0 || c.impressions > 0)
      .sort((a, b) => b.spend - a.spend);

    // ── Daily spend trend (aggregated by date, split by platform) ──
    const dailyMap = new Map<string, { date: string; META: number; GOOGLE: number; TIKTOK: number; impressions: number; clicks: number; conversions: number; conversionValue: number }>();

    campaigns.forEach((c) => {
      c.dailyMetrics.forEach((m) => {
        const dateKey = m.date.toISOString().split("T")[0];
        if (!dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, { date: dateKey, META: 0, GOOGLE: 0, TIKTOK: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 });
        }
        const entry = dailyMap.get(dateKey)!;
        const spend = Number(m.spend);
        if (c.platform === "META") entry.META += spend;
        else if (c.platform === "GOOGLE") entry.GOOGLE += spend;
        else entry.TIKTOK += spend;
        entry.impressions += m.impressions;
        entry.clicks += m.clicks;
        entry.conversions += m.conversions;
        entry.conversionValue += Number(m.conversionValue);
      });
    });

    const dailyTrend = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    // ── Daily ROAS trend ──
    const dailyRoas = dailyTrend.map((d) => {
      const totalSpend = d.META + d.GOOGLE + d.TIKTOK;
      return {
        date: d.date,
        roas: totalSpend > 0 ? Math.round((d.conversionValue / totalSpend) * 100) / 100 : 0,
        metaRoas: d.META > 0 ? Math.round((d.conversionValue * (d.META / totalSpend) / d.META) * 100) / 100 : 0,
        spend: totalSpend,
      };
    });

    // ── Platform totals ──
    const platformTotals: Record<string, { spend: number; impressions: number; clicks: number; conversions: number; conversionValue: number; campaigns: number }> = {};
    result.forEach((c) => {
      if (!platformTotals[c.platform]) {
        platformTotals[c.platform] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, campaigns: 0 };
      }
      const p = platformTotals[c.platform];
      p.spend += c.spend;
      p.impressions += c.impressions;
      p.clicks += c.clicks;
      p.conversions += c.conversions;
      p.conversionValue += c.conversionValue;
      p.campaigns++;
    });

    // Add derived metrics to platform totals
    const platformSummary = Object.entries(platformTotals).map(([platform, t]) => ({
      platform,
      ...t,
      ctr: t.impressions > 0 ? Math.round((t.clicks / t.impressions) * 10000) / 100 : 0,
      cpc: t.clicks > 0 ? Math.round((t.spend / t.clicks) * 100) / 100 : 0,
      roas: t.spend > 0 ? Math.round((t.conversionValue / t.spend) * 100) / 100 : 0,
      convRate: t.clicks > 0 ? Math.round((t.conversions / t.clicks) * 10000) / 100 : 0,
    }));

    // ── Totals ──
    const totals = {
      spend: result.reduce((s, c) => s + c.spend, 0),
      impressions: result.reduce((s, c) => s + c.impressions, 0),
      clicks: result.reduce((s, c) => s + c.clicks, 0),
      conversions: result.reduce((s, c) => s + c.conversions, 0),
      conversionValue: result.reduce((s, c) => s + c.conversionValue, 0),
    };

    // ── % change vs previous period ──
    const pctChange = (curr: number, prev: number) =>
      prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : 0;

    const changes = {
      spend: pctChange(totals.spend, prevTotals.spend),
      impressions: pctChange(totals.impressions, prevTotals.impressions),
      clicks: pctChange(totals.clicks, prevTotals.clicks),
      conversions: pctChange(totals.conversions, prevTotals.conversions),
      conversionValue: pctChange(totals.conversionValue, prevTotals.conversionValue),
      roas: pctChange(
        totals.spend > 0 ? totals.conversionValue / totals.spend : 0,
        prevTotals.spend > 0 ? prevTotals.conversionValue / prevTotals.spend : 0
      ),
    };

    return NextResponse.json({
      campaigns: result,
      totals,
      changes,
      dailyTrend,
      dailyRoas,
      platformSummary,
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString(), days: daysDiff },
    });
  } catch (e: any) {
    console.error("Error fetching campaign metrics:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
