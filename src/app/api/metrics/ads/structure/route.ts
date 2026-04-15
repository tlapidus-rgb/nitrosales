// Estructura jerarquica de cuenta de ads (Campanas -> AdSets) con metricas
// agregadas en el rango de fechas. Pensado para el drill-down navigation
// del Creativos Lab (Meta especialmente).
//
// Query params:
//   - from / to: rango de fechas (YYYY-MM-DD)
//   - platform: META | GOOGLE (default: ambas)
//
// Respuesta:
//   {
//     campaigns: [{
//       id, externalId, name, status, objective, funnelStage, platform,
//       spend, impressions, clicks, conversions, conversionValue, roas,
//       ctr, cpc, cpm, cpa,
//       adSetsCount, adsCount,
//       adSets: [{
//         id, externalId, name, status, optimizationGoal, dailyBudget,
//         targetingInfo, bidStrategy,
//         spend, impressions, clicks, conversions, conversionValue, roas,
//         ctr, cpc, cpm, cpa, frequency, reach,
//         adsCount, isVideoCount,
//         topAdId (preview)
//       }]
//     }]
//   }

export const dynamic = "force-dynamic";

// @ts-nocheck
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const revalidate = 0;

const OBJECTIVE_TO_FUNNEL: Record<string, string> = {
  OUTCOME_AWARENESS: "TOF", REACH: "TOF", BRAND_AWARENESS: "TOF",
  VIDEO_VIEWS: "TOF", POST_ENGAGEMENT: "TOF",
  OUTCOME_TRAFFIC: "MOF", LINK_CLICKS: "MOF", TRAFFIC: "MOF",
  ENGAGEMENT: "MOF", APP_INSTALLS: "MOF", LEAD_GENERATION: "MOF",
  MESSAGES: "MOF", OUTCOME_ENGAGEMENT: "MOF", OUTCOME_LEADS: "MOF",
  OUTCOME_APP_PROMOTION: "MOF",
  OUTCOME_SALES: "BOF", CONVERSIONS: "BOF", CATALOG_SALES: "BOF",
  PRODUCT_CATALOG_SALES: "BOF", STORE_VISITS: "BOF",
  // Google
  SEARCH: "BOF", SHOPPING: "BOF", PERFORMANCE_MAX: "BOF",
  DISPLAY: "TOF", VIDEO: "TOF", DEMAND_GEN: "MOF", LOCAL: "BOF",
};

function safeDiv(a: number, b: number) { return b > 0 ? a / b : 0; }
function r2(n: number) { return Math.round(n * 100) / 100; }
function r4(n: number) { return Math.round(n * 10000) / 100; }

export async function GET(request: Request) {
  try {
    const ORG_ID = await getOrganizationId();
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const platformParam = searchParams.get("platform"); // META | GOOGLE

    const now = new Date();
    const dateTo = toParam ? new Date(toParam + "T23:59:59.999-03:00") : now;
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const platformWhere = platformParam ? { platform: platformParam as any } : {};

    // ── 1) Traer todas las campanas con sus adSets ──
    const campaigns = await prisma.adCampaign.findMany({
      where: { organizationId: ORG_ID, ...platformWhere } as any,
      include: {
        adSets: {
          select: {
            id: true,
            externalId: true,
            name: true,
            status: true,
            optimizationGoal: true,
            dailyBudget: true,
            bidStrategy: true,
            targetingInfo: true,
          },
        },
      },
    });

    if (campaigns.length === 0) {
      return NextResponse.json({ campaigns: [], totals: null });
    }

    const campaignIds = campaigns.map((c) => c.id);
    const adSetIds = campaigns.flatMap((c) => c.adSets.map((s) => s.id));

    // ── 2) Aggregar metricas de campanas (agregando por campaignId) ──
    const campaignMetricsRaw = await prisma.adMetricDaily.groupBy({
      by: ["campaignId"],
      where: {
        organizationId: ORG_ID,
        campaignId: { in: campaignIds },
        date: { gte: dateFrom, lte: dateTo },
      },
      _sum: {
        spend: true, impressions: true, clicks: true,
        conversions: true, conversionValue: true,
      },
    });
    const campaignMetricsMap: Record<string, any> = {};
    campaignMetricsRaw.forEach((m) => {
      campaignMetricsMap[m.campaignId] = {
        spend: Number(m._sum.spend || 0),
        impressions: Number(m._sum.impressions || 0),
        clicks: Number(m._sum.clicks || 0),
        conversions: Number(m._sum.conversions || 0),
        conversionValue: Number(m._sum.conversionValue || 0),
      };
    });

    // ── 3) Aggregar metricas de adSets ──
    const adSetMetricsRaw = adSetIds.length > 0
      ? await prisma.adSetMetricDaily.groupBy({
          by: ["adSetId"],
          where: {
            organizationId: ORG_ID,
            adSetId: { in: adSetIds },
            date: { gte: dateFrom, lte: dateTo },
          },
          _sum: {
            spend: true, impressions: true, clicks: true,
            conversions: true, conversionValue: true, reach: true,
          },
          _avg: { frequency: true },
        })
      : [];
    const adSetMetricsMap: Record<string, any> = {};
    adSetMetricsRaw.forEach((m) => {
      adSetMetricsMap[m.adSetId] = {
        spend: Number(m._sum.spend || 0),
        impressions: Number(m._sum.impressions || 0),
        clicks: Number(m._sum.clicks || 0),
        conversions: Number(m._sum.conversions || 0),
        conversionValue: Number(m._sum.conversionValue || 0),
        reach: m._sum.reach ? Number(m._sum.reach) : null,
        frequency: m._avg.frequency ? Number(m._avg.frequency) : null,
      };
    });

    // ── 4) Conteo de ads (creatives) por adSet + por campaign ──
    const adsByAdSetRaw = await prisma.adCreative.groupBy({
      by: ["adSetId", "campaignId", "type"],
      where: { organizationId: ORG_ID, campaignId: { in: campaignIds } } as any,
      _count: { _all: true },
    });
    const adsCountByCampaign: Record<string, number> = {};
    const adsCountByAdSet: Record<string, number> = {};
    const videoCountByAdSet: Record<string, number> = {};
    const adsCountByCampaignType: Record<string, Record<string, number>> = {};
    adsByAdSetRaw.forEach((g: any) => {
      const cId = g.campaignId;
      const sId = g.adSetId;
      const t = g.type || "UNKNOWN";
      const n = g._count?._all || 0;
      adsCountByCampaign[cId] = (adsCountByCampaign[cId] || 0) + n;
      if (sId) adsCountByAdSet[sId] = (adsCountByAdSet[sId] || 0) + n;
      if (sId && t === "VIDEO") videoCountByAdSet[sId] = (videoCountByAdSet[sId] || 0) + n;
      if (!adsCountByCampaignType[cId]) adsCountByCampaignType[cId] = {};
      adsCountByCampaignType[cId][t] = (adsCountByCampaignType[cId][t] || 0) + n;
    });

    // ── 5) Top creative por adSet (mas spend) — para preview ──
    const topAdsRaw = adSetIds.length > 0
      ? await prisma.$queryRawUnsafe<Array<{ adset_id: string; creative_id: string; media_url: string | null; type: string; name: string | null; total_spend: number }>>(
          // Postgres exige que todas las columnas no-agregadas esten en GROUP BY.
          // Agregamos ac."mediaUrls", ac.type, ac.name al GROUP BY.
          `SELECT DISTINCT ON (ac."adSetId")
            ac."adSetId" AS adset_id,
            ac.id AS creative_id,
            CASE WHEN array_length(ac."mediaUrls", 1) > 0 THEN ac."mediaUrls"[1] ELSE NULL END AS media_url,
            ac.type,
            ac.name,
            COALESCE(SUM(acmd.spend), 0) AS total_spend
          FROM ad_creatives ac
          LEFT JOIN ad_creative_metrics_daily acmd
            ON acmd."creativeId" = ac.id
            AND acmd.date >= $2 AND acmd.date <= $3
          WHERE ac."organizationId" = $1 AND ac."adSetId" = ANY($4)
          GROUP BY ac."adSetId", ac.id, ac."mediaUrls", ac.type, ac.name
          ORDER BY ac."adSetId", total_spend DESC NULLS LAST`,
          ORG_ID, dateFrom, dateTo, adSetIds
        )
      : [];
    const topAdByAdSet: Record<string, any> = {};
    topAdsRaw.forEach((row) => {
      topAdByAdSet[row.adset_id] = {
        creativeId: row.creative_id,
        mediaUrl: row.media_url,
        type: row.type,
        name: row.name,
      };
    });

    // ── 6) Construir respuesta ──
    const out = campaigns.map((c) => {
      const cm = campaignMetricsMap[c.id] || { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 };
      const objective = c.objective || "UNKNOWN";
      const funnelStage = OBJECTIVE_TO_FUNNEL[objective] || "UNKNOWN";

      const adSets = c.adSets
        .map((s) => {
          const sm = adSetMetricsMap[s.id] || { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, reach: null, frequency: null };
          return {
            id: s.id,
            externalId: s.externalId,
            name: s.name,
            status: s.status,
            optimizationGoal: s.optimizationGoal,
            dailyBudget: s.dailyBudget ? Number(s.dailyBudget) : null,
            bidStrategy: s.bidStrategy,
            targetingInfo: s.targetingInfo,
            spend: r2(sm.spend),
            impressions: sm.impressions,
            clicks: sm.clicks,
            conversions: sm.conversions,
            conversionValue: r2(sm.conversionValue),
            roas: r2(safeDiv(sm.conversionValue, sm.spend)),
            ctr: r4(safeDiv(sm.clicks, sm.impressions)),
            cpc: r2(safeDiv(sm.spend, sm.clicks)),
            cpm: r2(safeDiv(sm.spend, sm.impressions) * 1000),
            cpa: sm.conversions > 0 ? r2(sm.spend / sm.conversions) : 0,
            reach: sm.reach,
            frequency: sm.frequency ? r2(sm.frequency) : null,
            adsCount: adsCountByAdSet[s.id] || 0,
            isVideoCount: videoCountByAdSet[s.id] || 0,
            topAd: topAdByAdSet[s.id] || null,
          };
        })
        // Filtrar adsets sin actividad ni ads
        .filter((s) => s.spend > 0 || s.impressions > 0 || s.adsCount > 0)
        .sort((a, b) => b.spend - a.spend);

      return {
        id: c.id,
        externalId: c.externalId,
        name: c.name,
        status: c.status,
        platform: c.platform,
        objective,
        funnelStage,
        spend: r2(cm.spend),
        impressions: cm.impressions,
        clicks: cm.clicks,
        conversions: cm.conversions,
        conversionValue: r2(cm.conversionValue),
        roas: r2(safeDiv(cm.conversionValue, cm.spend)),
        ctr: r4(safeDiv(cm.clicks, cm.impressions)),
        cpc: r2(safeDiv(cm.spend, cm.clicks)),
        cpm: r2(safeDiv(cm.spend, cm.impressions) * 1000),
        cpa: cm.conversions > 0 ? r2(cm.spend / cm.conversions) : 0,
        adSetsCount: adSets.length,
        adsCount: adsCountByCampaign[c.id] || 0,
        adsByType: adsCountByCampaignType[c.id] || {},
        adSets,
      };
    })
    // Filtrar campanas sin actividad
    .filter((c) => c.spend > 0 || c.impressions > 0 || c.adsCount > 0)
    .sort((a, b) => b.spend - a.spend);

    // Totales
    const totals = out.reduce(
      (acc, c) => ({
        spend: acc.spend + c.spend,
        impressions: acc.impressions + c.impressions,
        clicks: acc.clicks + c.clicks,
        conversions: acc.conversions + c.conversions,
        conversionValue: acc.conversionValue + c.conversionValue,
        campaigns: acc.campaigns + 1,
        adSets: acc.adSets + c.adSetsCount,
        ads: acc.ads + c.adsCount,
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, campaigns: 0, adSets: 0, ads: 0 }
    );

    return NextResponse.json({
      campaigns: out,
      totals: {
        ...totals,
        roas: r2(safeDiv(totals.conversionValue, totals.spend)),
        ctr: r4(safeDiv(totals.clicks, totals.impressions)),
        cpc: r2(safeDiv(totals.spend, totals.clicks)),
        cpm: r2(safeDiv(totals.spend, totals.impressions) * 1000),
      },
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
    });
  } catch (e: any) {
    console.error("Error in /api/metrics/ads/structure:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
