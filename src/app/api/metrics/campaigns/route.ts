import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const ORG_ID = await getOrganizationId();
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const platformParam = searchParams.get("platform"); // META, GOOGLE, or null (all)

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

    // Build platform filter
    const platformFilter = platformParam
      ? { platform: platformParam as any }
      : {};

    // ── Current period campaigns with daily metrics ──
    const campaigns = await prisma.adCampaign.findMany({
      where: { organizationId: ORG_ID, ...platformFilter },
      include: {
        dailyMetrics: {
          where: { date: { gte: dateFrom, lte: dateTo } },
          orderBy: { date: "asc" },
        },
      },
    });

    // ── Previous period metrics — aggregated in DB instead of loading all rows ──
    const platformWhere = platformParam ? `AND platform = '${platformParam}'` : "";
    const prevAgg = await prisma.$queryRawUnsafe<[{
      spend: string; impressions: string; clicks: string;
      conversions: string; conversion_value: string; reach: string;
    }]>(
      `SELECT
        COALESCE(SUM(spend), 0)::text AS spend,
        COALESCE(SUM(impressions), 0)::text AS impressions,
        COALESCE(SUM(clicks), 0)::text AS clicks,
        COALESCE(SUM(conversions), 0)::text AS conversions,
        COALESCE(SUM("conversionValue"), 0)::text AS conversion_value,
        COALESCE(SUM(COALESCE(reach, 0)), 0)::text AS reach
      FROM ad_metric_daily
      WHERE "organizationId" = $1 AND date >= $2 AND date <= $3 ${platformWhere}`,
      ORG_ID, prevFrom, prevTo
    );

    const prevTotals = {
      spend: Number(prevAgg[0].spend),
      impressions: Number(prevAgg[0].impressions),
      clicks: Number(prevAgg[0].clicks),
      conversions: Number(prevAgg[0].conversions),
      conversionValue: Number(prevAgg[0].conversion_value),
      reach: Number(prevAgg[0].reach),
    };

    // ── Build campaign results with platform-specific metrics ──
    const result = campaigns
      .map((c) => {
        const spend = c.dailyMetrics.reduce((s, m) => s + Number(m.spend), 0);
        const impressions = c.dailyMetrics.reduce((s, m) => s + m.impressions, 0);
        const clicks = c.dailyMetrics.reduce((s, m) => s + m.clicks, 0);
        const conversions = c.dailyMetrics.reduce((s, m) => s + m.conversions, 0);
        const conversionValue = c.dailyMetrics.reduce((s, m) => s + Number(m.conversionValue), 0);
        const reach = c.dailyMetrics.reduce((s, m) => s + (m.reach || 0), 0);
        const frequencyArr = c.dailyMetrics.filter((m) => m.frequency != null);
        const frequency = frequencyArr.length > 0
          ? frequencyArr.reduce((s, m) => s + (m.frequency || 0), 0) / frequencyArr.length
          : 0;
        const qualityScoreArr = c.dailyMetrics.filter((m) => m.qualityScore != null);
        const qualityScore = qualityScoreArr.length > 0
          ? qualityScoreArr.reduce((s, m) => s + (m.qualityScore || 0), 0) / qualityScoreArr.length
          : null;
        const impressionShareArr = c.dailyMetrics.filter((m) => m.impressionShare != null);
        const impressionShare = impressionShareArr.length > 0
          ? impressionShareArr.reduce((s, m) => s + (m.impressionShare || 0), 0) / impressionShareArr.length
          : null;

        // Detect funnel stage from objective or campaign name
        const funnelStage = detectFunnelStage(c.objective, c.name);

        return {
          id: c.id,
          name: c.name,
          platform: c.platform,
          status: c.status,
          objective: c.objective,
          funnelStage,
          spend,
          impressions,
          clicks,
          ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
          cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
          cpm: impressions > 0 ? Math.round((spend / impressions) * 100000) / 100 : 0,
          conversions,
          conversionValue,
          roas: spend > 0 ? Math.round((conversionValue / spend) * 100) / 100 : 0,
          costPerConversion: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : 0,
          convRate: clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : 0,
          // Meta-specific
          reach,
          frequency: Math.round(frequency * 100) / 100,
          // Google-specific
          qualityScore: qualityScore ? Math.round(qualityScore * 10) / 10 : null,
          impressionShare: impressionShare ? Math.round(impressionShare * 100) / 100 : null,
          daysWithData: c.dailyMetrics.length,
        };
      })
      .filter((c) => c.spend > 0 || c.impressions > 0)
      .sort((a, b) => b.spend - a.spend);

    // ── Daily trend (aggregated by date, split by platform) ──
    const dailyMap = new Map<string, {
      date: string; META: number; GOOGLE: number; TIKTOK: number;
      impressions: number; clicks: number; conversions: number; conversionValue: number;
      reach: number; metaImpressions: number; googleImpressions: number;
    }>();

    campaigns.forEach((c) => {
      c.dailyMetrics.forEach((m) => {
        const dateKey = m.date.toISOString().split("T")[0];
        if (!dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, {
            date: dateKey, META: 0, GOOGLE: 0, TIKTOK: 0,
            impressions: 0, clicks: 0, conversions: 0, conversionValue: 0,
            reach: 0, metaImpressions: 0, googleImpressions: 0,
          });
        }
        const entry = dailyMap.get(dateKey)!;
        const spend = Number(m.spend);
        if (c.platform === "META") {
          entry.META += spend;
          entry.metaImpressions += m.impressions;
          entry.reach += m.reach || 0;
        } else if (c.platform === "GOOGLE") {
          entry.GOOGLE += spend;
          entry.googleImpressions += m.impressions;
        } else {
          entry.TIKTOK += spend;
        }
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
        spend: totalSpend,
      };
    });

    // ── Platform totals ──
    const platformTotals: Record<string, {
      spend: number; impressions: number; clicks: number;
      conversions: number; conversionValue: number; campaigns: number;
      reach: number;
    }> = {};
    result.forEach((c) => {
      if (!platformTotals[c.platform]) {
        platformTotals[c.platform] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, campaigns: 0, reach: 0 };
      }
      const p = platformTotals[c.platform];
      p.spend += c.spend;
      p.impressions += c.impressions;
      p.clicks += c.clicks;
      p.conversions += c.conversions;
      p.conversionValue += c.conversionValue;
      p.reach += c.reach;
      p.campaigns++;
    });

    const platformSummary = Object.entries(platformTotals).map(([platform, t]) => ({
      platform,
      ...t,
      ctr: t.impressions > 0 ? Math.round((t.clicks / t.impressions) * 10000) / 100 : 0,
      cpc: t.clicks > 0 ? Math.round((t.spend / t.clicks) * 100) / 100 : 0,
      cpm: t.impressions > 0 ? Math.round((t.spend / t.impressions) * 100000) / 100 : 0,
      roas: t.spend > 0 ? Math.round((t.conversionValue / t.spend) * 100) / 100 : 0,
      convRate: t.clicks > 0 ? Math.round((t.conversions / t.clicks) * 10000) / 100 : 0,
    }));

    // ── Funnel stage aggregation ──
    const funnelAgg: Record<string, {
      spend: number; impressions: number; clicks: number;
      conversions: number; conversionValue: number; campaigns: number;
    }> = { TOF: { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, campaigns: 0 },
           MOF: { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, campaigns: 0 },
           BOF: { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, campaigns: 0 },
           UNKNOWN: { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, campaigns: 0 } };

    result.forEach((c) => {
      const stage = c.funnelStage || "UNKNOWN";
      if (!funnelAgg[stage]) funnelAgg[stage] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, campaigns: 0 };
      funnelAgg[stage].spend += c.spend;
      funnelAgg[stage].impressions += c.impressions;
      funnelAgg[stage].clicks += c.clicks;
      funnelAgg[stage].conversions += c.conversions;
      funnelAgg[stage].conversionValue += c.conversionValue;
      funnelAgg[stage].campaigns++;
    });

    const funnelSummary = Object.entries(funnelAgg)
      .filter(([, v]) => v.campaigns > 0)
      .map(([stage, t]) => ({
        stage,
        ...t,
        roas: t.spend > 0 ? Math.round((t.conversionValue / t.spend) * 100) / 100 : 0,
        ctr: t.impressions > 0 ? Math.round((t.clicks / t.impressions) * 10000) / 100 : 0,
        cpc: t.clicks > 0 ? Math.round((t.spend / t.clicks) * 100) / 100 : 0,
        costPerConversion: t.conversions > 0 ? Math.round((t.spend / t.conversions) * 100) / 100 : 0,
      }));

    // ── Totals ──
    const totals = {
      spend: result.reduce((s, c) => s + c.spend, 0),
      impressions: result.reduce((s, c) => s + c.impressions, 0),
      clicks: result.reduce((s, c) => s + c.clicks, 0),
      conversions: result.reduce((s, c) => s + c.conversions, 0),
      conversionValue: result.reduce((s, c) => s + c.conversionValue, 0),
      reach: result.reduce((s, c) => s + c.reach, 0),
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
      reach: pctChange(totals.reach, prevTotals.reach),
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
      funnelSummary,
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString(), days: daysDiff },
    });
  } catch (e: any) {
    console.error("Error fetching campaign metrics:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── PATCH: Update campaign funnel stage ──
export async function PATCH(request: Request) {
  try {
    const ORG_ID = await getOrganizationId();
    const body = await request.json();
    const { campaignId, funnelStage } = body;

    if (!campaignId || !["TOF", "MOF", "BOF"].includes(funnelStage)) {
      return NextResponse.json({ error: "Invalid campaignId or funnelStage" }, { status: 400 });
    }

    // We store funnel stage in the objective field with a prefix
    // Format: "FUNNEL:TOF|original_objective"
    const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Extract original objective (remove any existing funnel prefix)
    const originalObjective = campaign.objective?.replace(/^FUNNEL:(TOF|MOF|BOF)\|/, "") || "";
    const newObjective = `FUNNEL:${funnelStage}|${originalObjective}`;

    await prisma.adCampaign.update({
      where: { id: campaignId },
      data: { objective: newObjective },
    });

    return NextResponse.json({ ok: true, funnelStage });
  } catch (e: any) {
    console.error("Error updating campaign funnel:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** Detect funnel stage from objective string or campaign name */
function detectFunnelStage(objective: string | null, name: string): string {
  // Check for manual assignment first (FUNNEL:TOF|...)
  if (objective?.startsWith("FUNNEL:")) {
    const match = objective.match(/^FUNNEL:(TOF|MOF|BOF)\|/);
    if (match) return match[1];
  }

  const obj = (objective || "").toUpperCase();
  const nm = (name || "").toUpperCase();
  const combined = `${obj} ${nm}`;

  // Top of Funnel
  if (/AWARENESS|REACH|BRAND|VIDEO_VIEW|VIDEO VIEW|IMPRESSIONS|TOF|TOFU|PROSPECTING/.test(combined)) return "TOF";
  // Middle of Funnel
  if (/CONSIDERATION|TRAFFIC|ENGAGEMENT|APP_INSTALL|LEAD|MOF|MOFU|INTEREST/.test(combined)) return "MOF";
  // Bottom of Funnel
  if (/CONVERSION|PURCHASE|CATALOG|SALE|ROAS|BOF|BOFU|RETARGET|REMARKET|CART/.test(combined)) return "BOF";

  return "UNKNOWN";
}
