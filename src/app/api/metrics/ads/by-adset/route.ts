// @ts-nocheck
// Endpoint dedicado y simple: devuelve TODOS los AdCreative de un adSet
// con sus metricas agregadas en el rango. No filtra por spend ni nada,
// asi siempre devuelve algo si el adSet tiene creativos asignados.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ORG_ID = await getOrganizationId();
    const { searchParams } = new URL(req.url);
    const adSetId = searchParams.get("adSet");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    if (!adSetId) {
      return NextResponse.json({ error: "Missing adSet param" }, { status: 400 });
    }

    const dateFrom = fromParam ? new Date(fromParam + "T00:00:00") : new Date(Date.now() - 30 * 86400000);
    const dateTo = toParam ? new Date(toParam + "T23:59:59") : new Date();

    const creatives = await prisma.adCreative.findMany({
      where: { organizationId: ORG_ID, adSetId } as any,
      include: {
        dailyMetrics: {
          where: { date: { gte: dateFrom, lte: dateTo } },
        },
        campaign: { select: { name: true, objective: true } },
        adSet: { select: { id: true, name: true, optimizationGoal: true } },
      },
    });

    const result = creatives.map((c) => {
      const spend = c.dailyMetrics.reduce((s, m) => s + Number(m.spend), 0);
      const impressions = c.dailyMetrics.reduce((s, m) => s + m.impressions, 0);
      const clicks = c.dailyMetrics.reduce((s, m) => s + m.clicks, 0);
      const conversions = c.dailyMetrics.reduce((s, m) => s + m.conversions, 0);
      const conversionValue = c.dailyMetrics.reduce((s, m) => s + Number(m.conversionValue), 0);
      const reach = c.dailyMetrics.reduce((s, m) => s + (m.reach || 0), 0);
      const isVideo = c.type === "VIDEO";
      const roas = spend > 0 ? Math.round((conversionValue / spend) * 100) / 100 : 0;
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
        classification: c.classificationManual || c.classificationAuto || "OTHER",
        campaignId: c.campaignId,
        campaignName: c.campaign?.name || null,
        adSetId: c.adSetId,
        adSetName: c.adSet?.name || null,
        spend, impressions, clicks, conversions, conversionValue, reach,
        ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
        cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
        cpm: impressions > 0 ? Math.round((spend / impressions) * 100000) / 100 : 0,
        roas,
        costPerConversion: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : 0,
        convRate: clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : 0,
        daysWithData: c.dailyMetrics.length,
        isVideo,
        videoMetrics: null,
      };
    }).sort((a, b) => b.spend - a.spend);

    return NextResponse.json({ creatives: result, count: result.length, adSetId });
  } catch (e: any) {
    console.error("[by-adset] error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
