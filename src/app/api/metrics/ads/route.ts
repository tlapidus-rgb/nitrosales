// @ts-nocheck
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { classifyCreative, CLASSIFICATION_TYPES } from "@/lib/classification/ad-classifier";
import { getOrganizationId } from "@/lib/auth-guard";

export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const ORG_ID = await getOrganizationId();
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const platformParam = searchParams.get("platform"); // META, GOOGLE, or null
    const campaignParam = searchParams.get("campaign"); // campaignId filter
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

    // Build creative results
    const result = creatives
      .map((c) => {
        const spend = c.dailyMetrics.reduce((s, m) => s + Number(m.spend), 0);
        const impressions = c.dailyMetrics.reduce((s, m) => s + m.impressions, 0);
        const clicks = c.dailyMetrics.reduce((s, m) => s + m.clicks, 0);
        const conversions = c.dailyMetrics.reduce((s, m) => s + m.conversions, 0);
        const conversionValue = c.dailyMetrics.reduce((s, m) => s + Number(m.conversionValue), 0);
        const reach = c.dailyMetrics.reduce((s, m) => s + (m.reach || 0), 0);

        // ── Video engagement metrics (null for image ads) ──
        const videoPlays = c.dailyMetrics.reduce((s, m) => s + ((m as any).videoPlays || 0), 0) || null;
        const videoP25 = c.dailyMetrics.reduce((s, m) => s + ((m as any).videoP25Watched || 0), 0) || null;
        const videoP50 = c.dailyMetrics.reduce((s, m) => s + ((m as any).videoP50Watched || 0), 0) || null;
        const videoP75 = c.dailyMetrics.reduce((s, m) => s + ((m as any).videoP75Watched || 0), 0) || null;
        const videoP100 = c.dailyMetrics.reduce((s, m) => s + ((m as any).videoP100Watched || 0), 0) || null;

        const isVideo = videoPlays !== null && videoPlays > 0;

        // ── Video Efficiency Score ──
        // hookRate: % de impresiones que paran a mirar 3s+ (thumb stop rate)
        // holdRate: % de viewers que siguen mirando después del 50%
        // actionRate: % de viewers que clickean (MEJOR señal — pesa 50%)
        // completionRate: % que ve todo el video (informativo, NO entra en score)
        // convRate: % de clicks que convierten
        // Score = (hookRate × 0.25) + (actionRate × 0.50) + (convRate × 0.25)
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

        // Video Efficiency Score (0-100 scale)
        // Solo para video ads con datos suficientes
        let videoEfficiencyScore: number | null = null;
        if (isVideo && hookRate !== null && actionRate !== null) {
          const hookNorm = Math.min(hookRate / 100, 1);      // Normalizar a 0-1
          const actionNorm = Math.min(actionRate / 100, 1);
          const convNorm = Math.min(convRateFromClicks / 100, 1);
          videoEfficiencyScore = Math.round(
            ((hookNorm * 0.25) + (actionNorm * 0.50) + (convNorm * 0.25)) * 100 * 100
          ) / 100; // Score 0-100 con 2 decimales
        }

        // ── Drop-off Analysis ──
        // Identifica dónde se pierde la audiencia
        let dropOffAnalysis: any = null;
        if (isVideo && videoPlays > 0) {
          const retention25 = videoP25 !== null ? Math.round((videoP25 / videoPlays) * 100) : null;
          const retention50 = videoP50 !== null ? Math.round((videoP50 / videoPlays) * 100) : null;
          const retention75 = videoP75 !== null ? Math.round((videoP75 / videoPlays) * 100) : null;
          const retention100 = videoP100 !== null ? Math.round((videoP100 / videoPlays) * 100) : null;

          // Diagnóstico automático
          let diagnosis: string | null = null;
          if (retention25 !== null && retention25 < 50) {
            diagnosis = "WEAK_HOOK"; // Hook débil — pierde >50% antes del 25%
          } else if (retention50 !== null && retention25 !== null && (retention25 - retention50) > 30) {
            diagnosis = "WEAK_CONTENT"; // Contenido no engancha — caída fuerte 25%→50%
          } else if (retention75 !== null && retention75 > 50 && actionRate !== null && actionRate < 2) {
            diagnosis = "WEAK_CTA"; // Llegan al 75%+ pero no clickean — falta CTA
          } else if (retention75 !== null && retention75 > 50 && actionRate !== null && actionRate >= 2) {
            diagnosis = "STRONG_PERFORMER"; // Buena retención + buen click rate
          }

          dropOffAnalysis = {
            retention25,
            retention50,
            retention75,
            retention100,
            diagnosis,
            // Texto legible para el diagnóstico
            diagnosisLabel: diagnosis === "WEAK_HOOK" ? "Hook débil — la gente no para a mirar"
              : diagnosis === "WEAK_CONTENT" ? "Contenido no engancha — caen entre 25% y 50%"
              : diagnosis === "WEAK_CTA" ? "Falta CTA — miran pero no clickean"
              : diagnosis === "STRONG_PERFORMER" ? "Video performer — buena retención y acción"
              : null,
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
          campaignId: c.campaignId,
          campaignName: c.campaign?.name,
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
          reach,
          daysWithData: c.dailyMetrics.length,
          // ── Video Metrics ──
          isVideo,
          videoMetrics: isVideo ? {
            videoPlays,
            videoP25Watched: videoP25,
            videoP50Watched: videoP50,
            videoP75Watched: videoP75,
            videoP100Watched: videoP100,
            hookRate,          // % impresiones → 3s play
            holdRate,          // % plays → 50% watched
            actionRate,        // % plays → click (KEY METRIC)
            completionRate,    // % plays → 100% watched (informativo)
            videoEfficiencyScore,  // Score 0-100
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
