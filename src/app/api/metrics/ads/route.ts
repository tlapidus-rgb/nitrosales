// @ts-nocheck
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { classifyCreative, CLASSIFICATION_TYPES } from "@/lib/classification/ad-classifier";
import { getOrganizationId } from "@/lib/auth-guard";

export const revalidate = 0;

/* ── Funnel Stage Classification ─────────────────────────
   Maps Meta campaign objectives to funnel stages.
   TOF = Brand awareness, reach, video views
   MOF = Traffic, engagement, leads, app installs
   BOF = Conversions, catalog sales, store visits
   ──────────────────────────────────────────────────────── */
const OBJECTIVE_TO_FUNNEL: Record<string, string> = {
  // TOF - Awareness
  OUTCOME_AWARENESS: "TOF",
  REACH: "TOF",
  BRAND_AWARENESS: "TOF",
  VIDEO_VIEWS: "TOF",
  POST_ENGAGEMENT: "TOF",
  // MOF - Consideration
  OUTCOME_TRAFFIC: "MOF",
  LINK_CLICKS: "MOF",
  TRAFFIC: "MOF",
  ENGAGEMENT: "MOF",
  APP_INSTALLS: "MOF",
  LEAD_GENERATION: "MOF",
  MESSAGES: "MOF",
  // BOF - Conversions
  OUTCOME_SALES: "BOF",
  CONVERSIONS: "BOF",
  CATALOG_SALES: "BOF",
  PRODUCT_CATALOG_SALES: "BOF",
  STORE_VISITS: "BOF",
  OUTCOME_ENGAGEMENT: "MOF",
  OUTCOME_LEADS: "MOF",
  OUTCOME_APP_PROMOTION: "MOF",
};

const FUNNEL_LABELS: Record<string, string> = {
  TOF: "Top of Funnel",
  MOF: "Middle of Funnel",
  BOF: "Bottom of Funnel",
  UNKNOWN: "Sin clasificar",
};

/* ── Funnel-aware Scoring ────────────────────────────────
   Each funnel stage weights metrics differently:
   - TOF: hookRate matters most (people stopping to watch)
   - MOF: actionRate matters most (people engaging/clicking)
   - BOF: convRate + ROAS matter most (people buying)
   ──────────────────────────────────────────────────────── */
function calculateFunnelScore(
  funnelStage: string,
  hookRate: number | null,
  actionRate: number | null,
  convRateFromClicks: number,
  roas: number,
  holdRate: number | null,
  completionRate: number | null,
): { score: number; weights: Record<string, number>; breakdown: Record<string, number> } | null {
  // Need at least hookRate and actionRate for video scoring
  if (hookRate === null || actionRate === null) return null;

  const hookNorm = Math.min(hookRate / 100, 1);
  const actionNorm = Math.min(actionRate / 100, 1);
  const convNorm = Math.min(convRateFromClicks / 100, 1);
  const holdNorm = holdRate !== null ? Math.min(holdRate / 100, 1) : 0;
  const completionNorm = completionRate !== null ? Math.min(completionRate / 100, 1) : 0;
  // ROAS normalized: 0x=0, 2x=0.5, 4x=1.0
  const roasNorm = Math.min(roas / 4, 1);

  let weights: Record<string, number>;
  switch (funnelStage) {
    case "TOF":
      // Awareness: hook + completion matter — did people stop and watch?
      weights = { hook: 0.35, hold: 0.25, completion: 0.20, action: 0.15, conv: 0.05 };
      break;
    case "MOF":
      // Consideration: action + hook matter — did people click?
      weights = { hook: 0.20, hold: 0.15, completion: 0.10, action: 0.40, conv: 0.15 };
      break;
    case "BOF":
      // Conversions: conv + ROAS matter — did people buy?
      weights = { hook: 0.10, hold: 0.05, completion: 0.05, action: 0.25, conv: 0.30, roas: 0.25 };
      break;
    default:
      // Unknown: balanced mix leaning toward conversions
      weights = { hook: 0.20, hold: 0.10, completion: 0.10, action: 0.30, conv: 0.20, roas: 0.10 };
  }

  const breakdown: Record<string, number> = {
    hook: Math.round(hookNorm * (weights.hook || 0) * 10000) / 100,
    hold: Math.round(holdNorm * (weights.hold || 0) * 10000) / 100,
    completion: Math.round(completionNorm * (weights.completion || 0) * 10000) / 100,
    action: Math.round(actionNorm * (weights.action || 0) * 10000) / 100,
    conv: Math.round(convNorm * (weights.conv || 0) * 10000) / 100,
    roas: Math.round(roasNorm * (weights.roas || 0) * 10000) / 100,
  };

  const score = Math.round(
    (
      hookNorm * (weights.hook || 0) +
      holdNorm * (weights.hold || 0) +
      completionNorm * (weights.completion || 0) +
      actionNorm * (weights.action || 0) +
      convNorm * (weights.conv || 0) +
      roasNorm * (weights.roas || 0)
    ) * 100 * 100
  ) / 100;

  return { score, weights, breakdown };
}

/* ── Diagnosis per funnel ────────────────────────────────
   Different thresholds per funnel stage
   ──────────────────────────────────────────────────────── */
function diagnoseVideo(
  funnelStage: string,
  retention25: number | null,
  retention50: number | null,
  retention75: number | null,
  actionRate: number | null,
  convRate: number,
  roas: number,
): { diagnosis: string; label: string } | null {
  if (retention25 === null) return null;

  // BOF-specific: good metrics but low conversions/ROAS
  if (funnelStage === "BOF") {
    if (roas >= 2 && convRate >= 2) {
      return { diagnosis: "STRONG_CONVERTER", label: "Convierte bien - ROAS y conv rate altos" };
    }
    if (actionRate !== null && actionRate >= 2 && convRate < 1) {
      return { diagnosis: "WEAK_CONVERSION", label: "Clickean pero no compran - revisar landing/producto" };
    }
    if (roas < 1 && convRate < 1) {
      return { diagnosis: "LOW_ROI", label: "ROI bajo - considerar pausar o cambiar audiencia" };
    }
  }

  // MOF-specific
  if (funnelStage === "MOF") {
    if (actionRate !== null && actionRate >= 3) {
      return { diagnosis: "STRONG_ENGAGER", label: "Alta interaccion - buen contenido para consideracion" };
    }
    if (retention75 !== null && retention75 > 50 && actionRate !== null && actionRate < 1.5) {
      return { diagnosis: "WEAK_CTA", label: "Miran pero no clickean - mejorar call to action" };
    }
  }

  // Universal video health checks
  if (retention25 < 40) {
    return { diagnosis: "WEAK_HOOK", label: "Hook debil - la gente no para a mirar los primeros segundos" };
  }
  if (retention50 !== null && retention25 - retention50 > 35) {
    return { diagnosis: "WEAK_CONTENT", label: "Contenido no engancha - caida fuerte entre 25% y 50%" };
  }
  if (retention75 !== null && retention75 > 50 && actionRate !== null && actionRate < 2) {
    return { diagnosis: "WEAK_CTA", label: "Miran pero no clickean - falta call to action claro" };
  }
  if (retention75 !== null && retention75 > 50 && actionRate !== null && actionRate >= 2) {
    return { diagnosis: "STRONG_PERFORMER", label: "Video performer - buena retencion y accion" };
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const ORG_ID = await getOrganizationId();
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const platformParam = searchParams.get("platform"); // META, GOOGLE, or null
    const campaignParam = searchParams.get("campaign"); // campaignId filter
    const funnelParam = searchParams.get("funnel"); // TOF, MOF, BOF filter
    const classificationParam = searchParams.get("classification"); // PRODUCT, UGC, etc.
    const analyzedParam = searchParams.get("analyzed"); // "true" to filter only vision-analyzed

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

    // Build filters
    const platformFilter = platformParam ? { platform: platformParam as any } : {};
    const campaignFilter = campaignParam ? { campaignId: campaignParam } : {};
    const analyzedFilter = analyzedParam === "true" ? { visionAnalyzedAt: { not: null } } : {};

    // Fetch creatives with their daily metrics
    const creatives = await prisma.adCreative.findMany({
      where: {
        organizationId: ORG_ID,
        ...platformFilter,
        ...campaignFilter,
        ...analyzedFilter,
      } as any,
      include: {
        dailyMetrics: {
          where: { date: { gte: dateFrom, lte: dateTo } },
          orderBy: { date: "asc" },
        },
        campaign: { select: { name: true, objective: true } },
      },
    });

    // Previous period metrics
    const prevMetrics = await prisma.adCreativeMetricDaily.findMany({
      where: {
        organizationId: ORG_ID,
        date: { gte: prevFrom, lte: prevTo },
        ...platformFilter,
      },
    });

    const prevTotals = {
      spend: prevMetrics.reduce((s, m) => s + Number(m.spend), 0),
      impressions: prevMetrics.reduce((s, m) => s + m.impressions, 0),
      clicks: prevMetrics.reduce((s, m) => s + m.clicks, 0),
      conversions: prevMetrics.reduce((s, m) => s + m.conversions, 0),
      conversionValue: prevMetrics.reduce((s, m) => s + Number(m.conversionValue), 0),
    };

    // ── Build campaigns list for filter dropdown ──
    const campaignsMap = new Map<string, { id: string; name: string; objective: string; funnelStage: string }>();
    creatives.forEach((c) => {
      if (c.campaignId && c.campaign) {
        const objective = c.campaign.objective || "UNKNOWN";
        const funnelStage = OBJECTIVE_TO_FUNNEL[objective] || "UNKNOWN";
        campaignsMap.set(c.campaignId, {
          id: c.campaignId,
          name: c.campaign.name || "Sin nombre",
          objective,
          funnelStage,
        });
      }
    });
    const campaigns = [...campaignsMap.values()].sort((a, b) => a.name.localeCompare(b.name));

    // Build creative results
    const result = creatives
      .map((c) => {
        const spend = c.dailyMetrics.reduce((s, m) => s + Number(m.spend), 0);
        const impressions = c.dailyMetrics.reduce((s, m) => s + m.impressions, 0);
        const clicks = c.dailyMetrics.reduce((s, m) => s + m.clicks, 0);
        const conversions = c.dailyMetrics.reduce((s, m) => s + m.conversions, 0);
        const conversionValue = c.dailyMetrics.reduce((s, m) => s + Number(m.conversionValue), 0);
        const reach = c.dailyMetrics.reduce((s, m) => s + (m.reach || 0), 0);

        // ── Funnel stage from campaign objective ──
        const campaignObjective = c.campaign?.objective || "UNKNOWN";
        const funnelStage = OBJECTIVE_TO_FUNNEL[campaignObjective] || "UNKNOWN";

        // ── Video engagement metrics (null for image ads) ──
        const videoPlays = c.dailyMetrics.reduce((s, m) => s + ((m as any).videoPlays || 0), 0) || null;
        const videoP25 = c.dailyMetrics.reduce((s, m) => s + ((m as any).videoP25Watched || 0), 0) || null;
        const videoP50 = c.dailyMetrics.reduce((s, m) => s + ((m as any).videoP50Watched || 0), 0) || null;
        const videoP75 = c.dailyMetrics.reduce((s, m) => s + ((m as any).videoP75Watched || 0), 0) || null;
        const videoP100 = c.dailyMetrics.reduce((s, m) => s + ((m as any).videoP100Watched || 0), 0) || null;

        const isVideo = videoPlays !== null && videoPlays > 0;
        const roas = spend > 0 ? Math.round((conversionValue / spend) * 100) / 100 : 0;

        // ── Video metrics ──
        const hookRate = isVideo && impressions > 0
          ? Math.round((videoPlays / impressions) * 10000) / 100 : null;
        const holdRate = isVideo && videoPlays > 0 && videoP50 !== null
          ? Math.round((videoP50 / videoPlays) * 10000) / 100 : null;
        const actionRate = isVideo && videoPlays > 0
          ? Math.round((clicks / videoPlays) * 10000) / 100 : null;
        const completionRate = isVideo && videoPlays > 0 && videoP100 !== null
          ? Math.round((videoP100 / videoPlays) * 10000) / 100 : null;
        const convRateFromClicks = clicks > 0
          ? Math.round((conversions / clicks) * 10000) / 100 : 0;

        // ── Funnel-aware Video Efficiency Score ──
        const scoreResult = isVideo
          ? calculateFunnelScore(funnelStage, hookRate, actionRate, convRateFromClicks, roas, holdRate, completionRate)
          : null;

        // ── Drop-off Analysis with funnel-aware diagnosis ──
        let dropOffAnalysis: any = null;
        if (isVideo && videoPlays > 0) {
          const retention25 = videoP25 !== null ? Math.round((videoP25 / videoPlays) * 100) : null;
          const retention50 = videoP50 !== null ? Math.round((videoP50 / videoPlays) * 100) : null;
          const retention75 = videoP75 !== null ? Math.round((videoP75 / videoPlays) * 100) : null;
          const retention100 = videoP100 !== null ? Math.round((videoP100 / videoPlays) * 100) : null;

          const diag = diagnoseVideo(funnelStage, retention25, retention50, retention75, actionRate, convRateFromClicks, roas);

          dropOffAnalysis = {
            retention25,
            retention50,
            retention75,
            retention100,
            diagnosis: diag?.diagnosis || null,
            diagnosisLabel: diag?.label || null,
          };
        }

        // Use manual classification if available, otherwise auto
        const classification = c.classificationManual || c.classificationAuto || "OTHER";

        return {
          id: c.id,
          externalId: c.externalId,
          name: c.name,
          platform: c.platform,
          status: c.status,
          type: c.type,
          mediaUrls: c.mediaUrls,
          headline: c.headline,
          description: c.description,
          ctaType: c.ctaType,
          classification,
          classificationAuto: c.classificationAuto,
          classificationManual: c.classificationManual,
          classificationScore: c.classificationScore,
          // Vision analysis data
          visionClassification: (c as any).visionClassification || null,
          visionConfidence: (c as any).visionConfidence || null,
          visionAnalyzedAt: (c as any).visionAnalyzedAt || null,
          visionAnalysis: (c as any).visionAnalysis ? JSON.parse((c as any).visionAnalysis) : null,
          // Campaign & Funnel
          campaignId: c.campaignId,
          campaignName: c.campaign?.name,
          campaignObjective,
          funnelStage,
          funnelLabel: FUNNEL_LABELS[funnelStage] || funnelStage,
          // Performance
          spend,
          impressions,
          clicks,
          ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
          cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
          cpm: impressions > 0 ? Math.round((spend / impressions) * 100000) / 100 : 0,
          conversions,
          conversionValue,
          roas,
          costPerConversion: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : 0,
          convRate: convRateFromClicks,
          reach,
          daysWithData: c.dailyMetrics.length,
          // ── Video Metrics (funnel-aware) ──
          isVideo,
          videoMetrics: isVideo ? {
            videoPlays,
            videoP25Watched: videoP25,
            videoP50Watched: videoP50,
            videoP75Watched: videoP75,
            videoP100Watched: videoP100,
            hookRate,
            holdRate,
            actionRate,
            completionRate,
            videoEfficiencyScore: scoreResult?.score ?? null,
            scoreWeights: scoreResult?.weights ?? null,
            scoreBreakdown: scoreResult?.breakdown ?? null,
            dropOffAnalysis,
          } : null,
          // Daily trend for sparklines
          dailySpend: c.dailyMetrics.map((m) => ({
            date: m.date.toISOString().split("T")[0],
            spend: Number(m.spend),
            impressions: m.impressions,
            clicks: m.clicks,
          })),
        };
      })
      .filter((c) => {
        // Apply classification filter
        if (classificationParam && c.classification !== classificationParam) return false;
        // Apply funnel filter
        if (funnelParam && c.funnelStage !== funnelParam) return false;
        return c.spend > 0 || c.impressions > 0;
      })
      .sort((a, b) => b.spend - a.spend);

    // ── Classification breakdown ──
    const classificationAgg: Record<string, {
      spend: number; impressions: number; clicks: number;
      conversions: number; conversionValue: number; count: number;
    }> = {};

    result.forEach((c) => {
      const cls = c.classification;
      if (!classificationAgg[cls]) {
        classificationAgg[cls] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, count: 0 };
      }
      classificationAgg[cls].spend += c.spend;
      classificationAgg[cls].impressions += c.impressions;
      classificationAgg[cls].clicks += c.clicks;
      classificationAgg[cls].conversions += c.conversions;
      classificationAgg[cls].conversionValue += c.conversionValue;
      classificationAgg[cls].count++;
    });

    const classificationBreakdown = Object.entries(classificationAgg)
      .map(([type, t]) => {
        const typeInfo = CLASSIFICATION_TYPES.find((ct) => ct.value === type);
        return {
          type,
          label: typeInfo?.label || type,
          color: typeInfo?.color || "#6B7280",
          ...t,
          roas: t.spend > 0 ? Math.round((t.conversionValue / t.spend) * 100) / 100 : 0,
          ctr: t.impressions > 0 ? Math.round((t.clicks / t.impressions) * 10000) / 100 : 0,
          cpc: t.clicks > 0 ? Math.round((t.spend / t.clicks) * 100) / 100 : 0,
          costPerConversion: t.conversions > 0 ? Math.round((t.spend / t.conversions) * 100) / 100 : 0,
        };
      })
      .sort((a, b) => b.spend - a.spend);

    // ── Daily trend by classification ──
    const dailyByClassification = new Map<string, Record<string, number>>();
    result.forEach((c) => {
      c.dailySpend.forEach((d) => {
        if (!dailyByClassification.has(d.date)) {
          dailyByClassification.set(d.date, {});
        }
        const entry = dailyByClassification.get(d.date)!;
        const cls = c.classification;
        entry[cls] = (entry[cls] || 0) + d.spend;
      });
    });

    const dailyClassificationTrend = [...dailyByClassification.entries()]
      .map(([date, types]) => ({ date, ...types }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── Funnel breakdown ──
    const funnelAgg: Record<string, {
      spend: number; impressions: number; clicks: number;
      conversions: number; conversionValue: number; count: number;
      videoCount: number;
    }> = {};
    result.forEach((c) => {
      const f = c.funnelStage;
      if (!funnelAgg[f]) {
        funnelAgg[f] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, count: 0, videoCount: 0 };
      }
      funnelAgg[f].spend += c.spend;
      funnelAgg[f].impressions += c.impressions;
      funnelAgg[f].clicks += c.clicks;
      funnelAgg[f].conversions += c.conversions;
      funnelAgg[f].conversionValue += c.conversionValue;
      funnelAgg[f].count++;
      if (c.isVideo) funnelAgg[f].videoCount++;
    });

    const funnelBreakdown = Object.entries(funnelAgg)
      .map(([stage, t]) => ({
        stage,
        label: FUNNEL_LABELS[stage] || stage,
        ...t,
        roas: t.spend > 0 ? Math.round((t.conversionValue / t.spend) * 100) / 100 : 0,
        ctr: t.impressions > 0 ? Math.round((t.clicks / t.impressions) * 10000) / 100 : 0,
      }))
      .sort((a, b) => {
        const order = { TOF: 0, MOF: 1, BOF: 2, UNKNOWN: 3 };
        return (order[a.stage as keyof typeof order] ?? 9) - (order[b.stage as keyof typeof order] ?? 9);
      });

    // ── Totals ──
    const totals = {
      spend: result.reduce((s, c) => s + c.spend, 0),
      impressions: result.reduce((s, c) => s + c.impressions, 0),
      clicks: result.reduce((s, c) => s + c.clicks, 0),
      conversions: result.reduce((s, c) => s + c.conversions, 0),
      conversionValue: result.reduce((s, c) => s + c.conversionValue, 0),
      creatives: result.length,
    };

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
      creatives: result,
      totals,
      changes,
      classificationBreakdown,
      dailyClassificationTrend,
      classificationTypes: CLASSIFICATION_TYPES,
      campaigns,
      funnelBreakdown,
      funnelLabels: FUNNEL_LABELS,
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString(), days: daysDiff },
    });
  } catch (e: any) {
    console.error("Error fetching ad metrics:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── PATCH: Update creative classification ──
export async function PATCH(request: Request) {
  try {
    const ORG_ID = await getOrganizationId();
    const body = await request.json();
    const { creativeId, classification } = body;

    if (!creativeId || !classification) {
      return NextResponse.json({ error: "Missing creativeId or classification" }, { status: 400 });
    }

    const creative = await prisma.adCreative.findUnique({ where: { id: creativeId } });
    if (!creative) {
      return NextResponse.json({ error: "Creative not found" }, { status: 404 });
    }

    // Store the previous classification
    const previousClassification = creative.classificationManual || creative.classificationAuto;

    // Update the creative with manual classification
    await prisma.adCreative.update({
      where: { id: creativeId },
      data: { classificationManual: classification },
    });

    // Create audit trail
    await prisma.adCreativeClassification.create({
      data: {
        creativeId,
        organizationId: creative.organizationId,
        classificationBefore: previousClassification,
        classificationAfter: classification,
        source: "MANUAL",
        reason: body.reason || null,
      },
    });

    return NextResponse.json({ ok: true, classification });
  } catch (e: any) {
    console.error("Error updating classification:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
