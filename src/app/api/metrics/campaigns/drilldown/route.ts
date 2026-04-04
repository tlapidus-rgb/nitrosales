// @ts-nocheck
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/metrics/campaigns/drilldown?platform=META&from=YYYY-MM-DD&to=YYYY-MM-DD&campaignId=xxx
 *
 * Returns hierarchical data: Campaign → Ad Sets → Ads
 * If campaignId is provided, returns ad sets + ads for that campaign only.
 * Otherwise returns all campaigns with nested ad sets (ads loaded on demand).
 */
export async function GET(request: Request) {
  try {
    const ORG_ID = await getOrganizationId();
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const platformParam = searchParams.get("platform");
    const campaignIdParam = searchParams.get("campaignId");
    const adSetIdParam = searchParams.get("adSetId");

    const now = new Date();
    const dateTo = toParam
      ? new Date(toParam + "T23:59:59.999-03:00")
      : now;
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const platformFilter = platformParam ? { platform: platformParam as any } : {};

    // ── Case 1: Get ads for a specific ad set ──
    if (adSetIdParam) {
      const ads = await prisma.adCreative.findMany({
        where: {
          organizationId: ORG_ID,
          adSetId: adSetIdParam,
          ...platformFilter,
        },
        include: {
          dailyMetrics: {
            where: { date: { gte: dateFrom, lte: dateTo } },
            orderBy: { date: "asc" },
          },
        },
      });

      const adsResult = ads.map((ad) => {
        const spend = ad.dailyMetrics.reduce((s, m) => s + Number(m.spend), 0);
        const impressions = ad.dailyMetrics.reduce((s, m) => s + m.impressions, 0);
        const clicks = ad.dailyMetrics.reduce((s, m) => s + m.clicks, 0);
        const conversions = ad.dailyMetrics.reduce((s, m) => s + m.conversions, 0);
        const conversionValue = ad.dailyMetrics.reduce((s, m) => s + Number(m.conversionValue), 0);
        const reach = ad.dailyMetrics.reduce((s, m) => s + (m.reach || 0), 0);

        return {
          id: ad.id,
          externalId: ad.externalId,
          name: ad.name,
          platform: ad.platform,
          status: ad.status,
          type: ad.type,
          mediaUrls: ad.mediaUrls,
          headline: ad.headline,
          description: ad.description,
          classification: ad.classificationManual || ad.classificationAuto || "OTHER",
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
          reach,
        };
      })
        .filter((a) => a.spend > 0 || a.impressions > 0)
        .sort((a, b) => b.spend - a.spend);

      return NextResponse.json({ ads: adsResult });
    }

    // ── Case 2: Get ad sets for a specific campaign ──
    if (campaignIdParam) {
      const adSets = await prisma.adSet.findMany({
        where: {
          organizationId: ORG_ID,
          campaignId: campaignIdParam,
          ...platformFilter,
        },
        include: {
          dailyMetrics: {
            where: { date: { gte: dateFrom, lte: dateTo } },
            orderBy: { date: "asc" },
          },
          _count: { select: { adCreatives: true } },
        },
      });

      // Also get ads that have no adSetId but belong to this campaign
      const orphanAds = await prisma.adCreative.findMany({
        where: {
          organizationId: ORG_ID,
          campaignId: campaignIdParam,
          adSetId: null,
          ...platformFilter,
        },
        include: {
          dailyMetrics: {
            where: { date: { gte: dateFrom, lte: dateTo } },
            orderBy: { date: "asc" },
          },
        },
      });

      const adSetsResult = adSets.map((as) => {
        const spend = as.dailyMetrics.reduce((s, m) => s + Number(m.spend), 0);
        const impressions = as.dailyMetrics.reduce((s, m) => s + m.impressions, 0);
        const clicks = as.dailyMetrics.reduce((s, m) => s + m.clicks, 0);
        const conversions = as.dailyMetrics.reduce((s, m) => s + m.conversions, 0);
        const conversionValue = as.dailyMetrics.reduce((s, m) => s + Number(m.conversionValue), 0);
        const reach = as.dailyMetrics.reduce((s, m) => s + (m.reach || 0), 0);
        const freqArr = as.dailyMetrics.filter((m) => m.frequency != null);
        const frequency = freqArr.length > 0
          ? freqArr.reduce((s, m) => s + (m.frequency || 0), 0) / freqArr.length
          : 0;

        return {
          id: as.id,
          externalId: as.externalId,
          name: as.name,
          platform: as.platform,
          status: as.status,
          bidStrategy: as.bidStrategy,
          dailyBudget: as.dailyBudget ? Number(as.dailyBudget) : null,
          optimizationGoal: as.optimizationGoal,
          adsCount: as._count.adCreatives,
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
          reach,
          frequency: Math.round(frequency * 100) / 100,
        };
      })
        .filter((as) => as.spend > 0 || as.impressions > 0)
        .sort((a, b) => b.spend - a.spend);

      // Format orphan ads (ads without ad set)
      const orphanAdsResult = orphanAds.map((ad) => {
        const spend = ad.dailyMetrics.reduce((s, m) => s + Number(m.spend), 0);
        const impressions = ad.dailyMetrics.reduce((s, m) => s + m.impressions, 0);
        const clicks = ad.dailyMetrics.reduce((s, m) => s + m.clicks, 0);
        const conversions = ad.dailyMetrics.reduce((s, m) => s + m.conversions, 0);
        const conversionValue = ad.dailyMetrics.reduce((s, m) => s + Number(m.conversionValue), 0);

        return {
          id: ad.id,
          name: ad.name,
          status: ad.status,
          type: ad.type,
          classification: ad.classificationManual || ad.classificationAuto || "OTHER",
          spend,
          impressions,
          clicks,
          conversions,
          conversionValue,
          roas: spend > 0 ? Math.round((conversionValue / spend) * 100) / 100 : 0,
        };
      })
        .filter((a) => a.spend > 0 || a.impressions > 0)
        .sort((a, b) => b.spend - a.spend);

      return NextResponse.json({ adSets: adSetsResult, orphanAds: orphanAdsResult });
    }

    // ── Case 3: Get all campaigns with ad set counts ──
    const campaigns = await prisma.adCampaign.findMany({
      where: { organizationId: ORG_ID, ...platformFilter },
      include: {
        dailyMetrics: {
          where: { date: { gte: dateFrom, lte: dateTo } },
          orderBy: { date: "asc" },
        },
        adSets: {
          select: { id: true },
        },
      },
    });

    const result = campaigns
      .map((c) => {
        const spend = c.dailyMetrics.reduce((s, m) => s + Number(m.spend), 0);
        const impressions = c.dailyMetrics.reduce((s, m) => s + m.impressions, 0);
        const clicks = c.dailyMetrics.reduce((s, m) => s + m.clicks, 0);
        const conversions = c.dailyMetrics.reduce((s, m) => s + m.conversions, 0);
        const conversionValue = c.dailyMetrics.reduce((s, m) => s + Number(m.conversionValue), 0);
        const reach = c.dailyMetrics.reduce((s, m) => s + (m.reach || 0), 0);
        const freqArr = c.dailyMetrics.filter((m) => m.frequency != null);
        const frequency = freqArr.length > 0
          ? freqArr.reduce((s, m) => s + (m.frequency || 0), 0) / freqArr.length
          : 0;

        return {
          id: c.id,
          name: c.name,
          platform: c.platform,
          status: c.status,
          objective: c.objective,
          funnelStage: detectFunnelStage(c.objective, c.name),
          adSetsCount: c.adSets.length,
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
          reach,
          frequency: Math.round(frequency * 100) / 100,
        };
      })
      .filter((c) => c.spend > 0 || c.impressions > 0)
      .sort((a, b) => b.spend - a.spend);

    return NextResponse.json({ campaigns: result });
  } catch (e: any) {
    console.error("Error fetching drilldown:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function detectFunnelStage(objective: string | null, name: string): string {
  if (objective?.startsWith("FUNNEL:")) {
    const match = objective.match(/^FUNNEL:(TOF|MOF|BOF)\|/);
    if (match) return match[1];
  }
  const combined = `${(objective || "").toUpperCase()} ${(name || "").toUpperCase()}`;
  if (/AWARENESS|REACH|BRAND|VIDEO_VIEW|VIDEO VIEW|IMPRESSIONS|TOF|TOFU|PROSPECTING/.test(combined)) return "TOF";
  if (/CONSIDERATION|TRAFFIC|ENGAGEMENT|APP_INSTALL|LEAD|MOF|MOFU|INTEREST/.test(combined)) return "MOF";
  if (/CONVERSION|PURCHASE|CATALOG|SALE|ROAS|BOF|BOFU|RETARGET|REMARKET|CART/.test(combined)) return "BOF";
  return "UNKNOWN";
}
