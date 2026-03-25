// ══════════════════════════════════════════════════════════════
// Pixel Revenue Discrepancy Report — NitroPixel Exclusive
// ══════════════════════════════════════════════════════════════
// GET /api/metrics/pixel/discrepancy?from=2026-03-17&to=2026-03-24&model=LAST_CLICK
//
// Compares pixel-attributed revenue vs platform-reported revenue
// (Meta, Google) to expose over/under-reporting by ad platforms.
// This is THE differentiator — no native platform offers this.
//
// Returns per-source and per-campaign breakdown with delta analysis.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const revalidate = 0;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const ORG_ID = await getOrganizationId();
    const { searchParams } = new URL(request.url);

    // ── Parse params ──
    const now = new Date();
    const toParam = searchParams.get("to");
    const fromParam = searchParams.get("from");
    const dateTo = toParam
      ? new Date(toParam + "T23:59:59.999-03:00")
      : now;
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(now.getTime() - 7 * MS_PER_DAY);

    const validModels = ["LAST_CLICK", "FIRST_CLICK", "LINEAR", "NITRO"];
    const modelParam = (searchParams.get("model") || "LAST_CLICK").toUpperCase();
    const selectedModel = validModels.includes(modelParam) ? modelParam : "LAST_CLICK";

    // ── Org settings for Nitro weights ──
    const org = await prisma.organization.findUnique({
      where: { id: ORG_ID },
      select: { settings: true },
    });
    const orgSettings = (org?.settings as Record<string, any>) || {};
    const nitroWeights = orgSettings.nitroWeights || { first: 30, last: 40, middle: 30 };
    const wFirst = nitroWeights.first;
    const wLast = nitroWeights.last;
    const wMiddle = nitroWeights.middle;

    // ══════════════════════════════════════════════════════════
    // PARALLEL QUERIES
    // ══════════════════════════════════════════════════════════
    const [
      pixelBySourceResult,
      pixelByCampaignResult,
      platformBySourceResult,
      platformByCampaignResult,
      dailyPixelResult,
      dailyPlatformResult,
    ] = await Promise.all([

      // 1. Pixel revenue by source (from attribution touchpoints)
      (selectedModel === "NITRO"
        ? prisma.$queryRaw`
            SELECT
              COALESCE(tp->>'source', 'direct') as source,
              COUNT(DISTINCT pa."orderId")::int as orders,
              SUM(
                CASE
                  WHEN pa."touchpointCount" = 1 THEN pa."attributedValue"
                  WHEN pa."touchpointCount" = 2 AND tp_ord = 1 THEN pa."attributedValue" * ${wFirst}::float / (${wFirst}::float + ${wLast}::float)
                  WHEN pa."touchpointCount" = 2 AND tp_ord = 2 THEN pa."attributedValue" * ${wLast}::float / (${wFirst}::float + ${wLast}::float)
                  WHEN tp_ord = 1 THEN pa."attributedValue" * ${wFirst} / 100.0
                  WHEN tp_ord = pa."touchpointCount" THEN pa."attributedValue" * ${wLast} / 100.0
                  ELSE pa."attributedValue" * ${wMiddle} / 100.0 / GREATEST(pa."touchpointCount" - 2, 1)
                END
              )::float as revenue
            FROM pixel_attributions pa,
            jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
            WHERE pa."organizationId" = ${ORG_ID}
              AND pa."createdAt" >= ${dateFrom}
              AND pa."createdAt" <= ${dateTo}
              AND pa.model::text = 'NITRO'
            GROUP BY 1
            ORDER BY revenue DESC
          `
        : selectedModel === "LAST_CLICK"
        ? prisma.$queryRaw`
            SELECT
              COALESCE(tp->>'source', 'direct') as source,
              COUNT(DISTINCT pa."orderId")::int as orders,
              SUM(CASE WHEN tp_ord = pa."touchpointCount" THEN pa."attributedValue" ELSE 0 END)::float as revenue
            FROM pixel_attributions pa,
            jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
            WHERE pa."organizationId" = ${ORG_ID}
              AND pa."createdAt" >= ${dateFrom}
              AND pa."createdAt" <= ${dateTo}
              AND pa.model::text = ${selectedModel}
            GROUP BY 1
            ORDER BY revenue DESC
          `
        : selectedModel === "FIRST_CLICK"
        ? prisma.$queryRaw`
            SELECT
              COALESCE(tp->>'source', 'direct') as source,
              COUNT(DISTINCT pa."orderId")::int as orders,
              SUM(CASE WHEN tp_ord = 1 THEN pa."attributedValue" ELSE 0 END)::float as revenue
            FROM pixel_attributions pa,
            jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
            WHERE pa."organizationId" = ${ORG_ID}
              AND pa."createdAt" >= ${dateFrom}
              AND pa."createdAt" <= ${dateTo}
              AND pa.model::text = ${selectedModel}
            GROUP BY 1
            ORDER BY revenue DESC
          `
        : prisma.$queryRaw`
            SELECT
              COALESCE(tp->>'source', 'direct') as source,
              COUNT(DISTINCT pa."orderId")::int as orders,
              SUM(pa."attributedValue" / GREATEST(pa."touchpointCount", 1))::float as revenue
            FROM pixel_attributions pa,
            jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
            WHERE pa."organizationId" = ${ORG_ID}
              AND pa."createdAt" >= ${dateFrom}
              AND pa."createdAt" <= ${dateTo}
              AND pa.model::text = ${selectedModel}
            GROUP BY 1
            ORDER BY revenue DESC
          `
      ) as Promise<Array<{ source: string; orders: number; revenue: number }>>,

      // 2. Pixel revenue by campaign (last-click campaign from touchpoints)
      prisma.$queryRaw`
        SELECT
          COALESCE(tp->>'campaign', '(sin campaña)') as campaign,
          COALESCE(tp->>'source', 'direct') as source,
          COUNT(DISTINCT pa."orderId")::int as orders,
          SUM(CASE WHEN tp_ord = pa."touchpointCount" THEN pa."attributedValue" ELSE 0 END)::float as revenue
        FROM pixel_attributions pa,
        jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
        WHERE pa."organizationId" = ${ORG_ID}
          AND pa."createdAt" >= ${dateFrom}
          AND pa."createdAt" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
          AND tp->>'campaign' IS NOT NULL
        GROUP BY 1, 2
        ORDER BY revenue DESC
        LIMIT 20
      ` as Promise<Array<{ campaign: string; source: string; orders: number; revenue: number }>>,

      // 3. Platform-reported revenue by source (Meta, Google)
      prisma.$queryRaw`
        SELECT
          LOWER(amd.platform::text) as source,
          SUM(amd.spend)::float as spend,
          SUM(amd.conversions)::int as conversions,
          SUM(amd."conversionValue")::float as revenue,
          SUM(amd.impressions)::bigint as impressions,
          SUM(amd.clicks)::int as clicks
        FROM ad_metrics_daily amd
        WHERE amd."organizationId" = ${ORG_ID}
          AND amd.date >= ${dateFrom}::date
          AND amd.date <= ${dateTo}::date
        GROUP BY 1
      ` as Promise<Array<{
        source: string; spend: number; conversions: number; revenue: number;
        impressions: bigint; clicks: number;
      }>>,

      // 4. Platform-reported revenue by campaign
      prisma.$queryRaw`
        SELECT
          ac.name as campaign,
          LOWER(amd.platform::text) as source,
          SUM(amd.spend)::float as spend,
          SUM(amd.conversions)::int as conversions,
          SUM(amd."conversionValue")::float as revenue
        FROM ad_metrics_daily amd
        JOIN ad_campaigns ac ON ac.id = amd."campaignId"
        WHERE amd."organizationId" = ${ORG_ID}
          AND amd.date >= ${dateFrom}::date
          AND amd.date <= ${dateTo}::date
        GROUP BY 1, 2
        ORDER BY revenue DESC
        LIMIT 20
      ` as Promise<Array<{ campaign: string; source: string; spend: number; conversions: number; revenue: number }>>,

      // 5. Daily pixel revenue (for trend chart)
      prisma.$queryRaw`
        SELECT
          TO_CHAR(DATE(o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') as day,
          COALESCE(tp->>'source', 'direct') as source,
          SUM(CASE WHEN tp_ord = pa."touchpointCount" THEN pa."attributedValue" ELSE 0 END)::float as revenue
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
        WHERE pa."organizationId" = ${ORG_ID}
          AND pa."createdAt" >= ${dateFrom}
          AND pa."createdAt" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
        GROUP BY 1, 2
        ORDER BY 1
      ` as Promise<Array<{ day: string; source: string; revenue: number }>>,

      // 6. Daily platform revenue (for trend chart)
      prisma.$queryRaw`
        SELECT
          TO_CHAR(amd.date, 'YYYY-MM-DD') as day,
          LOWER(amd.platform::text) as source,
          SUM(amd."conversionValue")::float as revenue,
          SUM(amd.spend)::float as spend
        FROM ad_metrics_daily amd
        WHERE amd."organizationId" = ${ORG_ID}
          AND amd.date >= ${dateFrom}::date
          AND amd.date <= ${dateTo}::date
        GROUP BY 1, 2
        ORDER BY 1
      ` as Promise<Array<{ day: string; source: string; revenue: number; spend: number }>>,
    ]);

    // ══════════════════════════════════════════════════════════
    // BUILD DISCREPANCY ANALYSIS
    // ══════════════════════════════════════════════════════════

    // Source-level discrepancy (Meta vs NitroPixel, Google vs NitroPixel)
    const platformMap = new Map(platformBySourceResult.map(p => [p.source, p]));

    const sourceDiscrepancy = pixelBySourceResult
      .filter(p => p.source !== 'direct') // Only compare paid/organic sources
      .map(pixel => {
        const platform = platformMap.get(pixel.source);
        const platformRevenue = platform?.revenue || 0;
        const platformConversions = platform?.conversions || 0;
        const platformSpend = platform?.spend || 0;

        const delta = pixel.revenue - platformRevenue;
        const deltaPercent = platformRevenue > 0
          ? Math.round((delta / platformRevenue) * 100)
          : (pixel.revenue > 0 ? 100 : 0);

        return {
          source: pixel.source,
          pixelRevenue: Math.round(pixel.revenue * 100) / 100,
          pixelOrders: pixel.orders,
          platformRevenue: Math.round(platformRevenue * 100) / 100,
          platformConversions,
          spend: Math.round(platformSpend * 100) / 100,
          delta: Math.round(delta * 100) / 100,
          deltaPercent,
          // ROAS comparison
          pixelRoas: platformSpend > 0 ? Math.round((pixel.revenue / platformSpend) * 100) / 100 : 0,
          platformRoas: platformSpend > 0 ? Math.round((platformRevenue / platformSpend) * 100) / 100 : 0,
          // Verdict: platform over-reports if delta is negative
          verdict: deltaPercent < -15 ? 'PLATFORM_OVER_REPORTS'
                 : deltaPercent > 15 ? 'PLATFORM_UNDER_REPORTS'
                 : 'ALIGNED',
        };
      });

    // Campaign-level discrepancy
    const platformCampaignMap = new Map(
      platformByCampaignResult.map(p => [`${p.campaign.toLowerCase()}|${p.source}`, p])
    );

    const campaignDiscrepancy = pixelByCampaignResult
      .filter(p => p.campaign !== '(sin campaña)')
      .map(pixel => {
        // Try exact match, then fuzzy match
        const key = `${pixel.campaign.toLowerCase()}|${pixel.source}`;
        let platform = platformCampaignMap.get(key);

        // Fuzzy: try to find platform campaign that contains the pixel campaign name
        if (!platform) {
          for (const [k, v] of platformCampaignMap) {
            if (k.includes(pixel.campaign.toLowerCase()) || pixel.campaign.toLowerCase().includes(k.split('|')[0])) {
              platform = v;
              break;
            }
          }
        }

        const platformRevenue = platform?.revenue || 0;
        const platformSpend = platform?.spend || 0;
        const delta = pixel.revenue - platformRevenue;
        const deltaPercent = platformRevenue > 0
          ? Math.round((delta / platformRevenue) * 100)
          : (pixel.revenue > 0 ? 100 : 0);

        return {
          campaign: pixel.campaign,
          source: pixel.source,
          pixelRevenue: Math.round(pixel.revenue * 100) / 100,
          pixelOrders: pixel.orders,
          platformRevenue: Math.round(platformRevenue * 100) / 100,
          spend: Math.round(platformSpend * 100) / 100,
          delta: Math.round(delta * 100) / 100,
          deltaPercent,
          pixelRoas: platformSpend > 0 ? Math.round((pixel.revenue / platformSpend) * 100) / 100 : 0,
          platformRoas: platformSpend > 0 ? Math.round((platformRevenue / platformSpend) * 100) / 100 : 0,
        };
      });

    // Daily trend for chart overlay (pixel vs platform per day)
    const dailyMap = new Map<string, { pixelRevenue: number; platformRevenue: number; spend: number }>();

    for (const row of dailyPixelResult) {
      const existing = dailyMap.get(row.day) || { pixelRevenue: 0, platformRevenue: 0, spend: 0 };
      existing.pixelRevenue += row.revenue || 0;
      dailyMap.set(row.day, existing);
    }
    for (const row of dailyPlatformResult) {
      const existing = dailyMap.get(row.day) || { pixelRevenue: 0, platformRevenue: 0, spend: 0 };
      existing.platformRevenue += row.revenue || 0;
      existing.spend += row.spend || 0;
      dailyMap.set(row.day, existing);
    }

    const dailyTrend = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, data]) => ({
        day,
        pixelRevenue: Math.round(data.pixelRevenue * 100) / 100,
        platformRevenue: Math.round(data.platformRevenue * 100) / 100,
        spend: Math.round(data.spend * 100) / 100,
        delta: Math.round((data.pixelRevenue - data.platformRevenue) * 100) / 100,
      }));

    // Summary totals
    const totalPixelRevenue = sourceDiscrepancy.reduce((s, r) => s + r.pixelRevenue, 0);
    const totalPlatformRevenue = sourceDiscrepancy.reduce((s, r) => s + r.platformRevenue, 0);
    const totalSpend = sourceDiscrepancy.reduce((s, r) => s + r.spend, 0);
    const totalDelta = totalPixelRevenue - totalPlatformRevenue;

    return NextResponse.json({
      summary: {
        totalPixelRevenue: Math.round(totalPixelRevenue * 100) / 100,
        totalPlatformRevenue: Math.round(totalPlatformRevenue * 100) / 100,
        totalSpend: Math.round(totalSpend * 100) / 100,
        totalDelta: Math.round(totalDelta * 100) / 100,
        totalDeltaPercent: totalPlatformRevenue > 0
          ? Math.round((totalDelta / totalPlatformRevenue) * 100) : 0,
        pixelRoas: totalSpend > 0 ? Math.round((totalPixelRevenue / totalSpend) * 100) / 100 : 0,
        platformRoas: totalSpend > 0 ? Math.round((totalPlatformRevenue / totalSpend) * 100) / 100 : 0,
        verdict: totalDelta < 0 ? 'Las plataformas sobre-reportan revenue' : 'Las plataformas sub-reportan revenue',
      },
      bySource: sourceDiscrepancy,
      byCampaign: campaignDiscrepancy,
      dailyTrend,
      meta: {
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        attributionModel: selectedModel,
        timezone: "America/Argentina/Buenos_Aires",
      },
    });
  } catch (error) {
    console.error("[Pixel Discrepancy API] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate discrepancy report", details: String(error) },
      { status: 500 }
    );
  }
}
