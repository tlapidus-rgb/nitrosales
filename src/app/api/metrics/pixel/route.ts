// ══════════════════════════════════════════════════════════════
// Pixel Metrics API — NitroPixel Dashboard
// ══════════════════════════════════════════════════════════════
// GET /api/metrics/pixel?from=2026-03-23&to=2026-03-30
// Timezone: Argentina (UTC-3)
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

    // ── Parse date range (defaults to last 7 days, Argentina timezone UTC-3) ──
    const now = new Date();
    const toParam = searchParams.get("to");
    const fromParam = searchParams.get("from");

    const dateTo = toParam
      ? new Date(toParam + "T23:59:59.999-03:00")
      : now;
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(now.getTime() - 7 * MS_PER_DAY);

    // ── Previous period for comparison ──
    const periodMs = dateTo.getTime() - dateFrom.getTime();
    const prevFrom = new Date(dateFrom.getTime() - periodMs);
    const prevTo = new Date(dateFrom.getTime() - 1);

    // ── Pagination ──
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));
    const offset = (page - 1) * pageSize;

    // ── Attribution model selector ──
    const validModels = ["LAST_CLICK", "FIRST_CLICK", "LINEAR", "NITRO"];
    const modelParam = (searchParams.get("model") || "LAST_CLICK").toUpperCase();
    const selectedModel = validModels.includes(modelParam) ? modelParam : "LAST_CLICK";

    const daysInPeriod = Math.max(1, Math.round(periodMs / MS_PER_DAY));

    // ── Nitro Weights (custom per org, default 30/40/30) ──
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
    // ALL QUERIES IN PARALLEL (10-second Vercel timeout)
    // ══════════════════════════════════════════════════════════
    const [
      liveStatusResult,
      visitorKpisResult,
      prevVisitorKpisResult,
      dailyVisitorsResult,
      deviceBreakdownResult,
      eventTypesResult,
      popularPagesResult,
      attributionByModelResult,
      attributionBySourceResult,
      conversionLagResult,
      recentEventsResult,
      eventCountResult,
    ] = await Promise.all([
      // 1. Live status
      prisma.$queryRaw`
        SELECT
          MAX(timestamp) as "lastEventAt",
          COUNT(*)::int as "totalEvents",
          COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '1 hour')::int as "lastHourEvents"
        FROM pixel_events
        WHERE "organizationId" = ${ORG_ID}
      ` as Promise<Array<{ lastEventAt: Date | null; totalEvents: number; lastHourEvents: number }>>,

      // 2. Visitor KPIs (current period)
      prisma.$queryRaw`
        SELECT
          COUNT(DISTINCT pe."visitorId")::int as "totalVisitors",
          COUNT(DISTINCT pe."sessionId")::int as "totalSessions",
          COUNT(*)::int as "totalPageViews",
          COUNT(DISTINCT CASE WHEN pe.type = 'IDENTIFY' THEN pe."visitorId" END)::int as "identifiedVisitors",
          COUNT(DISTINCT CASE WHEN pe.type = 'ADD_TO_CART' THEN pe."visitorId" END)::int as "cartVisitors",
          COUNT(DISTINCT CASE WHEN pe.type = 'PURCHASE' THEN pe."visitorId" END)::int as "purchaseVisitors"
        FROM pixel_events pe
        WHERE pe."organizationId" = ${ORG_ID}
          AND pe.timestamp >= ${dateFrom}
          AND pe.timestamp <= ${dateTo}
      ` as Promise<Array<{
        totalVisitors: number; totalSessions: number; totalPageViews: number;
        identifiedVisitors: number; cartVisitors: number; purchaseVisitors: number;
      }>>,

      // 3. Previous period KPIs (for comparison)
      prisma.$queryRaw`
        SELECT
          COUNT(DISTINCT pe."visitorId")::int as "totalVisitors",
          COUNT(DISTINCT pe."sessionId")::int as "totalSessions",
          COUNT(*)::int as "totalPageViews"
        FROM pixel_events pe
        WHERE pe."organizationId" = ${ORG_ID}
          AND pe.timestamp >= ${prevFrom}
          AND pe.timestamp <= ${prevTo}
      ` as Promise<Array<{ totalVisitors: number; totalSessions: number; totalPageViews: number }>>,

      // 4. Daily visitors trend
      prisma.$queryRaw`
        SELECT
          TO_CHAR(DATE(pe.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') as day,
          COUNT(DISTINCT pe."visitorId")::int as visitors,
          COUNT(DISTINCT pe."sessionId")::int as sessions,
          COUNT(*)::int as "pageViews"
        FROM pixel_events pe
        WHERE pe."organizationId" = ${ORG_ID}
          AND pe.timestamp >= ${dateFrom}
          AND pe.timestamp <= ${dateTo}
        GROUP BY 1
        ORDER BY 1
      ` as Promise<Array<{ day: string; visitors: number; sessions: number; pageViews: number }>>,

      // 5. Device breakdown
      prisma.$queryRaw`
        SELECT
          COALESCE(pe."deviceType", 'unknown') as device,
          COUNT(DISTINCT pe."visitorId")::int as count
        FROM pixel_events pe
        WHERE pe."organizationId" = ${ORG_ID}
          AND pe.timestamp >= ${dateFrom}
          AND pe.timestamp <= ${dateTo}
        GROUP BY 1
        ORDER BY count DESC
      ` as Promise<Array<{ device: string; count: number }>>,

      // 6. Event types breakdown
      prisma.$queryRaw`
        SELECT
          pe.type,
          COUNT(*)::int as count,
          COUNT(DISTINCT pe."visitorId")::int as "uniqueVisitors"
        FROM pixel_events pe
        WHERE pe."organizationId" = ${ORG_ID}
          AND pe.timestamp >= ${dateFrom}
          AND pe.timestamp <= ${dateTo}
        GROUP BY 1
        ORDER BY count DESC
      ` as Promise<Array<{ type: string; count: number; uniqueVisitors: number }>>,

      // 7. Popular pages (top 10)
      prisma.$queryRaw`
        SELECT
          pe."pageUrl" as url,
          COUNT(*)::int as "pageViews",
          COUNT(DISTINCT pe."visitorId")::int as "uniqueVisitors"
        FROM pixel_events pe
        WHERE pe."organizationId" = ${ORG_ID}
          AND pe.timestamp >= ${dateFrom}
          AND pe.timestamp <= ${dateTo}
          AND pe."pageUrl" IS NOT NULL
          AND pe.type = 'PAGE_VIEW'
        GROUP BY 1
        ORDER BY "pageViews" DESC
        LIMIT 10
      ` as Promise<Array<{ url: string; pageViews: number; uniqueVisitors: number }>>,

      // 8. Attribution by model
      prisma.$queryRaw`
        SELECT
          pa.model,
          COUNT(*)::int as "ordersAttributed",
          SUM(pa."attributedValue")::float as revenue,
          AVG(pa."attributedValue")::float as "avgValue",
          AVG(pa."touchpointCount")::float as "avgTouchpoints"
        FROM pixel_attributions pa
        WHERE pa."organizationId" = ${ORG_ID}
          AND pa."createdAt" >= ${dateFrom}
          AND pa."createdAt" <= ${dateTo}
        GROUP BY 1
        ORDER BY revenue DESC
      ` as Promise<Array<{
        model: string; ordersAttributed: number; revenue: number;
        avgValue: number; avgTouchpoints: number;
      }>>,

      // 9. Attribution by source (weighted for NITRO, simple for others)
      (selectedModel === "NITRO"
        ? prisma.$queryRaw`
            SELECT
              COALESCE(tp->>'source', 'direct') as source,
              COUNT(DISTINCT pa."orderId")::int as orders,
              SUM(
                CASE
                  WHEN pa."touchpointCount" = 1 THEN pa."attributedValue"
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
            LIMIT 10
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
            LIMIT 10
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
            LIMIT 10
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
            LIMIT 10
          `
      ) as Promise<Array<{ source: string; orders: number; revenue: number }>>,

      // 10. Conversion lag distribution
      prisma.$queryRaw`
        SELECT
          CASE
            WHEN pa."conversionLag" IS NULL THEN 'unknown'
            WHEN pa."conversionLag" = 0 THEN '0'
            WHEN pa."conversionLag" BETWEEN 1 AND 3 THEN '1-3'
            WHEN pa."conversionLag" BETWEEN 4 AND 7 THEN '4-7'
            WHEN pa."conversionLag" BETWEEN 8 AND 14 THEN '8-14'
            WHEN pa."conversionLag" BETWEEN 15 AND 30 THEN '15-30'
            ELSE '30+'
          END as bucket,
          COUNT(*)::int as orders,
          SUM(pa."attributedValue")::float as revenue
        FROM pixel_attributions pa
        WHERE pa."organizationId" = ${ORG_ID}
          AND pa."createdAt" >= ${dateFrom}
          AND pa."createdAt" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
        GROUP BY 1
        ORDER BY MIN(COALESCE(pa."conversionLag", 999))
      ` as Promise<Array<{ bucket: string; orders: number; revenue: number }>>,

      // 11. Recent events
      prisma.$queryRaw`
        SELECT
          pe.id,
          pe.type,
          pe."visitorId",
          pe."pageUrl",
          pe."deviceType",
          pe.timestamp,
          pe."sessionId"
        FROM pixel_events pe
        WHERE pe."organizationId" = ${ORG_ID}
          AND pe.timestamp >= ${dateFrom}
          AND pe.timestamp <= ${dateTo}
        ORDER BY pe.timestamp DESC
        LIMIT ${pageSize}
        OFFSET ${offset}
      ` as Promise<Array<{
        id: string; type: string; visitorId: string; pageUrl: string | null;
        deviceType: string | null; timestamp: Date; sessionId: string;
      }>>,

      // 12. Total event count for pagination
      prisma.$queryRaw`
        SELECT COUNT(*)::int as total
        FROM pixel_events
        WHERE "organizationId" = ${ORG_ID}
          AND timestamp >= ${dateFrom}
          AND timestamp <= ${dateTo}
      ` as Promise<Array<{ total: number }>>,
    ]);

    // ══════════════════════════════════════════════════════════
    // PROCESS RESULTS
    // ══════════════════════════════════════════════════════════

    const ls = liveStatusResult[0];
    const kpisCurr = visitorKpisResult[0];
    const kpisPrev = prevVisitorKpisResult[0];

    // Live status
    const lastEventAt = ls?.lastEventAt;
    let status: "LIVE" | "ACTIVE" | "INACTIVE" = "INACTIVE";
    if (lastEventAt) {
      const minutesAgo = (Date.now() - new Date(lastEventAt).getTime()) / 60000;
      if (minutesAgo < 60) status = "LIVE";
      else if (minutesAgo < 1440) status = "ACTIVE";
    }

    // Change calculations
    const pctChange = (curr: number, prev: number) =>
      prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

    // Device breakdown with percentages
    const totalDeviceCount = deviceBreakdownResult.reduce((sum, d) => sum + d.count, 0);
    const deviceBreakdown = deviceBreakdownResult.map((d) => ({
      ...d,
      percentage: totalDeviceCount > 0 ? Math.round((d.count / totalDeviceCount) * 100) : 0,
    }));

    // Event types with percentages
    const totalEventCount = eventTypesResult.reduce((sum, e) => sum + e.count, 0);
    const eventTypes = eventTypesResult.map((e) => ({
      ...e,
      percentage: totalEventCount > 0 ? Math.round((e.count / totalEventCount) * 100) : 0,
    }));

    // Attribution source with percentages
    const totalAttrRevenue = attributionBySourceResult.reduce((sum, a) => sum + (a.revenue || 0), 0);
    const attributionBySource = attributionBySourceResult.map((a) => ({
      ...a,
      percentage: totalAttrRevenue > 0 ? Math.round(((a.revenue || 0) / totalAttrRevenue) * 100) : 0,
    }));

    // Pages/session calc
    const pagesPerSession =
      kpisCurr.totalSessions > 0
        ? Math.round((kpisCurr.totalPageViews / kpisCurr.totalSessions) * 10) / 10
        : 0;

    const totalEvents = eventCountResult[0]?.total || 0;

    return NextResponse.json({
      liveStatus: {
        status,
        lastEventAt: lastEventAt ? new Date(lastEventAt).toISOString() : null,
        totalEvents: ls?.totalEvents || 0,
        lastHourEvents: ls?.lastHourEvents || 0,
      },

      kpis: {
        totalVisitors: kpisCurr.totalVisitors,
        totalSessions: kpisCurr.totalSessions,
        totalPageViews: kpisCurr.totalPageViews,
        identifiedVisitors: kpisCurr.identifiedVisitors,
        cartVisitors: kpisCurr.cartVisitors,
        purchaseVisitors: kpisCurr.purchaseVisitors,
        pagesPerSession,
        daysInPeriod,
        changes: {
          visitors: pctChange(kpisCurr.totalVisitors, kpisPrev.totalVisitors),
          sessions: pctChange(kpisCurr.totalSessions, kpisPrev.totalSessions),
          pageViews: pctChange(kpisCurr.totalPageViews, kpisPrev.totalPageViews),
        },
      },

      dailyVisitors: dailyVisitorsResult,
      deviceBreakdown,
      eventTypes,
      popularPages: popularPagesResult,

      attribution: {
        byModel: attributionByModelResult,
        bySource: attributionBySource,
        conversionLag: conversionLagResult,
      },

      recentEvents: recentEventsResult.map((e) => ({
        ...e,
        timestamp: new Date(e.timestamp).toISOString(),
      })),

      pagination: {
        page,
        pageSize,
        totalCount: totalEvents,
        totalPages: Math.ceil(totalEvents / pageSize),
      },

      meta: {
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        daysInPeriod,
        timezone: "America/Argentina/Buenos_Aires",
        attributionModel: selectedModel,
        nitroWeights,
      },
    });
  } catch (error) {
    console.error("[Pixel Metrics API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pixel metrics", details: String(error) },
      { status: 500 }
    );
  }
}
