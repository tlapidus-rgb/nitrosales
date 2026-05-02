export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Pixel Metrics API — NitroPixel Dashboard
// ══════════════════════════════════════════════════════════════
// ⛔ CORE PROTEGIDO — NO MODIFICAR SIN AUTORIZACION DEL FUNDADOR
// Ver CORE-ATTRIBUTION.md para documentacion completa.
// Estabilizado: 26 de Marzo de 2026
// CRITICO: La query de "Ordenes en Vivo" (#15) usa LEFT JOIN para
// mostrar todas las ordenes, incluyendo las no atribuidas. NO cambiar
// a INNER JOIN — eso oculta ventas que el pixel no pudo vincular.
// ══════════════════════════════════════════════════════════════
// GET /api/metrics/pixel?from=2026-03-23&to=2026-03-30
// Timezone: Argentina (UTC-3)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { getCached, setCache } from "@/lib/api-cache";

export const revalidate = 0;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Materialized view refresh (at most every 60 min) ──
let _lastMvRefresh = 0;
const MV_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour

async function maybeRefreshMaterializedView() {
  const now = Date.now();
  if (now - _lastMvRefresh < MV_REFRESH_INTERVAL) return;
  _lastMvRefresh = now;
  try {
    await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY pixel_daily_summary');
  } catch {
    // Non-fatal — view may not exist or concurrent refresh not supported
    try {
      await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW pixel_daily_summary');
    } catch { /* ignore */ }
  }
}

export async function GET(request: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const ORG_ID = orgId;
    const { searchParams } = new URL(request.url);

    // Refresh materialized view if stale (non-blocking, fire-and-forget)
    maybeRefreshMaterializedView().catch(() => {});

    // ── Parse date range (defaults to last 7 days, Argentina timezone UTC-3) ──
    const now = new Date();
    const toParam = searchParams.get("to");
    const fromParam = searchParams.get("from");

    // Cache check (v3: busted after adding conversion rates 2026-04-12)
    const cacheKey = [orgId, fromParam || "default", toParam || "default", "v7"];
    const cached = getCached("pixel", ...cacheKey);
    if (cached) return NextResponse.json(cached);

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
    const VALID_WINDOWS = [7, 14, 30, 60];
    const attributionWindowDays = VALID_WINDOWS.includes(orgSettings.attributionWindowDays)
      ? orgSettings.attributionWindowDays
      : 30;
    const wFirst = nitroWeights.first;
    const wLast = nitroWeights.last;
    const wMiddle = nitroWeights.middle;

    // ── Pixel install date: first event ever for this org ──
    // Used as floor for CR queries (pixel visitors vs orders).
    // Without this, orgs with orders pre-pixel would show 0 visitors for old sales.
    const pixelInstallResult = await prisma.$queryRaw`
      SELECT MIN(timestamp) as "installedAt"
      FROM pixel_events
      WHERE "organizationId" = ${ORG_ID}
    ` as Array<{ installedAt: Date | null }>;
    const pixelInstalledAt = pixelInstallResult[0]?.installedAt || null;

    // crDateFrom = effective start for Conversion Rate queries
    // MAX(user-selected dateFrom, pixel install date) — so we never compare
    // pixel visitors against orders from before the pixel existed
    const crDateFrom = pixelInstalledAt && pixelInstalledAt.getTime() > dateFrom.getTime()
      ? pixelInstalledAt
      : dateFrom;

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
      // ── NEW: 6 queries for redesigned dashboard ──
      totalOrdersResult,
      adSpendBySourceResult,
      recentJourneysResult,
      clickIdCoverageResult,
      dailyRevenueResult,
      prevAttrRevenueResult,
      // ── Per-day coverage for accurate ROAS scaling ──
      perDayCoverageResult,
      // ── Per-day per-source breakdown for daily trend table ──
      dailyChannelRevenueResult,
      dailyChannelSpendResult,
      // ── Channel role breakdown (first/assist/last touch per source) ──
      channelRolesResult,
      // ── Conversion Rates queries ──
      visitorsBySourceResult,
      ordersByDeviceResult,
      productViewersResult,
      productPurchasesResult,
      // ── Journey Intelligence queries ──
      journeyComplexityResult,
      channelPairsResult,
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
          COUNT(*) FILTER (WHERE pe.type = 'PAGE_VIEW')::int as "totalPageViews",
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
          COUNT(*) FILTER (WHERE pe.type = 'PAGE_VIEW')::int as "totalPageViews"
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
          COUNT(*) FILTER (WHERE pe.type = 'PAGE_VIEW')::int as "pageViews"
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

      // 7. Popular pages — group by clean path (no query params), use unique visitors
      //    Uses SPLIT_PART to strip query params (avoids regex escape issues in template literals)
      //    Excludes checkout (transactional, not content pages)
      prisma.$queryRaw`
        SELECT
          SPLIT_PART(pe."pageUrl", '?', 1) as url,
          COUNT(DISTINCT pe."visitorId")::int as visitors,
          COUNT(*)::int as "pageViews"
        FROM pixel_events pe
        WHERE pe."organizationId" = ${ORG_ID}
          AND pe.timestamp >= ${dateFrom}
          AND pe.timestamp <= ${dateTo}
          AND pe."pageUrl" IS NOT NULL
          AND pe.type = 'PAGE_VIEW'
          AND pe."pageUrl" NOT LIKE '%/checkout%'
        GROUP BY 1
        ORDER BY visitors DESC
        LIMIT 30
      ` as Promise<Array<{ url: string; visitors: number; pageViews: number }>>,

      // 8. Attribution by model
      prisma.$queryRaw`
        SELECT
          pa.model,
          COUNT(*)::int as "ordersAttributed",
          SUM(pa."attributedValue")::float as revenue,
          AVG(pa."attributedValue")::float as "avgValue",
          AVG(pa."touchpointCount")::float as "avgTouchpoints"
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND o.status NOT IN ('CANCELLED', 'PENDING')
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1
        ORDER BY revenue DESC
      ` as Promise<Array<{
        model: string; ordersAttributed: number; revenue: number;
        avgValue: number; avgTouchpoints: number;
      }>>,

      // 9. Attribution by source (weighted for NITRO, simple for others)
      // NOTE: Filter by o."orderDate" (not pa."createdAt") so date filters work correctly
      (selectedModel === "NITRO"
        ? prisma.$queryRaw`
            SELECT
              CASE
                WHEN COALESCE(tp->>'medium','') IN ('organic','social','referral')
                  AND COALESCE(tp->>'source','direct') IN ('google','bing','yahoo','duckduckgo')
                THEN COALESCE(tp->>'source','direct') || '_organic'
                ELSE COALESCE(tp->>'source', 'direct')
              END as source,
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
            FROM pixel_attributions pa
            JOIN orders o ON o.id = pa."orderId"
            , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
            WHERE pa."organizationId" = ${ORG_ID}
              AND o."orderDate" >= ${dateFrom}
              AND o."orderDate" <= ${dateTo}
              AND pa.model::text = 'NITRO'
              AND o.status NOT IN ('CANCELLED', 'PENDING')
              AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
              AND o.source IS DISTINCT FROM 'MELI'
              AND o.channel IS DISTINCT FROM 'marketplace'
              AND o."externalId" NOT LIKE 'FVG-%'
              AND o."externalId" NOT LIKE 'BPR-%'
            GROUP BY 1
            ORDER BY revenue DESC
            LIMIT 10
          `
        : selectedModel === "LAST_CLICK"
        ? prisma.$queryRaw`
            SELECT
              CASE
                WHEN COALESCE(tp->>'medium','') IN ('organic','social','referral')
                  AND COALESCE(tp->>'source','direct') IN ('google','bing','yahoo','duckduckgo')
                THEN COALESCE(tp->>'source','direct') || '_organic'
                ELSE COALESCE(tp->>'source', 'direct')
              END as source,
              COUNT(DISTINCT pa."orderId")::int as orders,
              SUM(CASE WHEN tp_ord = pa."touchpointCount" THEN pa."attributedValue" ELSE 0 END)::float as revenue
            FROM pixel_attributions pa
            JOIN orders o ON o.id = pa."orderId"
            , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
            WHERE pa."organizationId" = ${ORG_ID}
              AND o."orderDate" >= ${dateFrom}
              AND o."orderDate" <= ${dateTo}
              AND pa.model::text = ${selectedModel}
              AND o.status NOT IN ('CANCELLED', 'PENDING')
              AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
              AND o.source IS DISTINCT FROM 'MELI'
              AND o.channel IS DISTINCT FROM 'marketplace'
              AND o."externalId" NOT LIKE 'FVG-%'
              AND o."externalId" NOT LIKE 'BPR-%'
            GROUP BY 1
            ORDER BY revenue DESC
            LIMIT 10
          `
        : selectedModel === "FIRST_CLICK"
        ? prisma.$queryRaw`
            SELECT
              CASE
                WHEN COALESCE(tp->>'medium','') IN ('organic','social','referral')
                  AND COALESCE(tp->>'source','direct') IN ('google','bing','yahoo','duckduckgo')
                THEN COALESCE(tp->>'source','direct') || '_organic'
                ELSE COALESCE(tp->>'source', 'direct')
              END as source,
              COUNT(DISTINCT pa."orderId")::int as orders,
              SUM(CASE WHEN tp_ord = 1 THEN pa."attributedValue" ELSE 0 END)::float as revenue
            FROM pixel_attributions pa
            JOIN orders o ON o.id = pa."orderId"
            , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
            WHERE pa."organizationId" = ${ORG_ID}
              AND o."orderDate" >= ${dateFrom}
              AND o."orderDate" <= ${dateTo}
              AND pa.model::text = ${selectedModel}
              AND o.status NOT IN ('CANCELLED', 'PENDING')
              AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
              AND o.source IS DISTINCT FROM 'MELI'
              AND o.channel IS DISTINCT FROM 'marketplace'
              AND o."externalId" NOT LIKE 'FVG-%'
              AND o."externalId" NOT LIKE 'BPR-%'
            GROUP BY 1
            ORDER BY revenue DESC
            LIMIT 10
          `
        : prisma.$queryRaw`
            SELECT
              CASE
                WHEN COALESCE(tp->>'medium','') IN ('organic','social','referral')
                  AND COALESCE(tp->>'source','direct') IN ('google','bing','yahoo','duckduckgo')
                THEN COALESCE(tp->>'source','direct') || '_organic'
                ELSE COALESCE(tp->>'source', 'direct')
              END as source,
              COUNT(DISTINCT pa."orderId")::int as orders,
              SUM(pa."attributedValue" / GREATEST(pa."touchpointCount", 1))::float as revenue
            FROM pixel_attributions pa
            JOIN orders o ON o.id = pa."orderId"
            , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
            WHERE pa."organizationId" = ${ORG_ID}
              AND o."orderDate" >= ${dateFrom}
              AND o."orderDate" <= ${dateTo}
              AND pa.model::text = ${selectedModel}
              AND o.status NOT IN ('CANCELLED', 'PENDING')
              AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
              AND o.source IS DISTINCT FROM 'MELI'
              AND o.channel IS DISTINCT FROM 'marketplace'
              AND o."externalId" NOT LIKE 'FVG-%'
              AND o."externalId" NOT LIKE 'BPR-%'
            GROUP BY 1
            ORDER BY revenue DESC
            LIMIT 10
          `
      ) as Promise<Array<{ source: string; orders: number; revenue: number }>>,

      // 10. Conversion lag distribution
      // Negative lags are treated as 0 (same-session: pixel fires after VTEX order)
      prisma.$queryRaw`
        SELECT
          CASE
            WHEN pa."conversionLag" IS NULL THEN 'unknown'
            WHEN pa."conversionLag" <= 0 THEN 'Mismo día'
            WHEN pa."conversionLag" BETWEEN 1 AND 3 THEN '1-3 días'
            WHEN pa."conversionLag" BETWEEN 4 AND 7 THEN '4-7 días'
            WHEN pa."conversionLag" BETWEEN 8 AND 14 THEN '8-14 días'
            WHEN pa."conversionLag" BETWEEN 15 AND 30 THEN '15-30 días'
            ELSE '30+ días'
          END as bucket,
          COUNT(*)::int as orders,
          SUM(pa."attributedValue")::float as revenue
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
          AND o.status NOT IN ('CANCELLED', 'PENDING')
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1
        ORDER BY MIN(COALESCE(GREATEST(pa."conversionLag", 0), 999))
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

      // ── NEW QUERIES FOR REDESIGNED DASHBOARD ──

      // 13. Total orders in period (for attribution rate)
      // Exclude cancelled/pending/zero-value AND marketplace orders (MercadoLibre)
      // Marketplace orders cannot be tracked by the pixel (checkout happens on ML)
      // NOTE: Marketplace detection uses trafficSource='Marketplace' OR source='MELI' OR channel='marketplace'
      //        because MELI-synced orders don't always have trafficSource set
      prisma.$queryRaw`
        SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE "trafficSource" = 'Marketplace' OR source = 'MELI' OR channel = 'marketplace' OR "externalId" LIKE 'FVG-%' OR "externalId" LIKE 'BPR-%')::int as "marketplaceOrders",
          SUM("totalValue") FILTER (WHERE "trafficSource" = 'Marketplace' OR source = 'MELI' OR channel = 'marketplace' OR "externalId" LIKE 'FVG-%' OR "externalId" LIKE 'BPR-%')::float as "marketplaceRevenue",
          COUNT(*) FILTER (WHERE "trafficSource" IS DISTINCT FROM 'Marketplace' AND source IS DISTINCT FROM 'MELI' AND channel IS DISTINCT FROM 'marketplace' AND "externalId" NOT LIKE 'FVG-%' AND "externalId" NOT LIKE 'BPR-%')::int as "webOrders",
          SUM("totalValue") FILTER (WHERE "trafficSource" IS DISTINCT FROM 'Marketplace' AND source IS DISTINCT FROM 'MELI' AND channel IS DISTINCT FROM 'marketplace' AND "externalId" NOT LIKE 'FVG-%' AND "externalId" NOT LIKE 'BPR-%')::float as "webRevenue"
        FROM orders
        WHERE "organizationId" = ${ORG_ID}
          AND "orderDate" >= ${dateFrom}
          AND "orderDate" <= ${dateTo}
          AND status NOT IN ('CANCELLED', 'PENDING')
          AND "totalValue" > 0
      ` as Promise<Array<{ total: number; marketplaceOrders: number; marketplaceRevenue: number; webOrders: number; webRevenue: number }>>,

      // 14. Ad spend + platform metrics grouped by source (META/GOOGLE)
      prisma.$queryRaw`
        SELECT
          LOWER(amd.platform::text) as source,
          SUM(amd.spend)::float as spend,
          SUM(amd.conversions)::int as "platformConversions",
          SUM(amd."conversionValue")::float as "platformRevenue"
        FROM ad_metrics_daily amd
        WHERE amd."organizationId" = ${ORG_ID}
          AND amd.date >= ${dateFrom}::date
          AND amd.date <= ${dateTo}::date
        GROUP BY 1
      ` as Promise<Array<{ source: string; spend: number; platformConversions: number; platformRevenue: number }>>,

      // 15. Recent journeys (all orders — LEFT JOIN attribution so unmatched orders also appear)
      // S60 EXT: agregar filtro de prefijos VTEX marketplace (FVG-, BPR-) que escapan
      // a los flags channel/trafficSource si el enrichment no los marco.
      prisma.$queryRaw`
        SELECT
          o.id as "orderId",
          o."externalId" as "orderExternalId",
          COALESCE(pa."attributedValue", o."totalValue")::float as revenue,
          COALESCE(pa."touchpointCount", 0) as "touchpointCount",
          pa."conversionLag",
          pa.touchpoints,
          o."orderDate",
          o.status::text as "orderStatus",
          CASE WHEN pa.id IS NOT NULL THEN true ELSE false END as "isAttributed"
        FROM orders o
        LEFT JOIN pixel_attributions pa ON pa."orderId" = o.id AND pa.model::text = ${selectedModel}
        WHERE o."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND o.status NOT IN ('CANCELLED', 'PENDING')
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        ORDER BY o."orderDate" DESC
        LIMIT 15
      ` as Promise<Array<{
        orderId: string; orderExternalId: string; revenue: number;
        touchpointCount: number; conversionLag: number | null;
        touchpoints: any; orderDate: Date; orderStatus: string;
        isAttributed: boolean;
      }>>,

      // 16. Click ID coverage (pixel health)
      prisma.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE pe."clickIds" IS NOT NULL AND pe."clickIds"::text != '{}' AND pe."clickIds"::text != 'null')::int as "withClickId",
          COUNT(*)::int as total
        FROM pixel_events pe
        WHERE pe."organizationId" = ${ORG_ID}
          AND pe.timestamp >= ${dateFrom}
          AND pe.timestamp <= ${dateTo}
      ` as Promise<Array<{ withClickId: number; total: number }>>,

      // 17. Daily revenue from attributions (for revenue chart)
      prisma.$queryRaw`
        SELECT
          TO_CHAR(DATE(o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') as day,
          SUM(pa."attributedValue")::float as revenue,
          COUNT(*)::int as orders
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
          AND o.status NOT IN ('CANCELLED', 'PENDING')
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1
        ORDER BY 1
      ` as Promise<Array<{ day: string; revenue: number; orders: number }>>,

      // 18. Previous period attribution revenue (for business KPI changes)
      prisma.$queryRaw`
        SELECT
          COUNT(*)::int as "ordersAttributed",
          SUM(pa."attributedValue")::float as revenue
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${prevFrom}
          AND o."orderDate" <= ${prevTo}
          AND pa.model::text = ${selectedModel}
          AND o.status NOT IN ('CANCELLED', 'PENDING')
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
      ` as Promise<Array<{ ordersAttributed: number; revenue: number }>>,

      // 19. Per-day coverage: total orders vs attributed orders per day
      //     Used for accurate ROAS scaling instead of uniform coverage ratio
      //     Excludes marketplace orders which can't be pixel-tracked:
      //       - MercadoLibre (source = MELI)
      //       - Marketplace flag (channel/trafficSource)
      //       - VTEX marketplaces que el seller publica via VTEX (Fravega, Banco Provincia)
      //         se identifican por prefijo en externalId (FVG-, BPR-)
      prisma.$queryRaw`
        SELECT
          TO_CHAR(DATE(o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') as day,
          COUNT(*)::int as "totalOrders",
          COUNT(DISTINCT pa."orderId")::int as "attributedOrders"
        FROM orders o
        LEFT JOIN (
          SELECT DISTINCT "orderId"
          FROM pixel_attributions
          WHERE "organizationId" = ${ORG_ID}
            AND model::text = ${selectedModel}
        ) pa ON pa."orderId" = o.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND o.status NOT IN ('CANCELLED', 'PENDING')
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1
        ORDER BY 1
      ` as Promise<Array<{ day: string; totalOrders: number; attributedOrders: number }>>,

      // 20. Per-day per-source pixel revenue (for daily trend table)
      // Uses LAST_CLICK logic here; model-specific SQL would add too much complexity.
      // The selected model is respected via the model filter.
      prisma.$queryRaw`
        SELECT
          TO_CHAR(DATE(o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') as day,
          CASE
            WHEN COALESCE(tp->>'medium','') IN ('organic','social','referral')
              AND COALESCE(tp->>'source','direct') IN ('google','bing','yahoo','duckduckgo')
            THEN COALESCE(tp->>'source','direct') || '_organic'
            ELSE COALESCE(tp->>'source', 'direct')
          END as source,
          COUNT(DISTINCT pa."orderId")::int as orders,
          SUM(
            CASE
              WHEN pa."touchpointCount" = 1 THEN pa."attributedValue"
              WHEN tp_ord = pa."touchpointCount" THEN pa."attributedValue"
              ELSE 0
            END
          )::float as revenue
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
          AND o.status NOT IN ('CANCELLED', 'PENDING')
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1, 2
        ORDER BY 1 DESC, revenue DESC
      ` as Promise<Array<{ day: string; source: string; orders: number; revenue: number }>>,

      // 21. Per-day per-platform ad spend (for daily trend table)
      prisma.$queryRaw`
        SELECT
          TO_CHAR(amd.date, 'YYYY-MM-DD') as day,
          LOWER(amd.platform::text) as source,
          SUM(amd.spend)::float as spend
        FROM ad_metrics_daily amd
        WHERE amd."organizationId" = ${ORG_ID}
          AND amd.date >= ${dateFrom}::date
          AND amd.date <= ${dateTo}::date
        GROUP BY 1, 2
      ` as Promise<Array<{ day: string; source: string; spend: number }>>,

      // 22. Channel roles — first/assist/last touch counts per source across ALL journeys
      prisma.$queryRaw`
        SELECT
          CASE
            WHEN COALESCE(tp->>'medium','') IN ('organic','social','referral')
              AND COALESCE(tp->>'source','direct') IN ('google','bing','yahoo','duckduckgo')
            THEN COALESCE(tp->>'source','direct') || '_organic'
            ELSE COALESCE(tp->>'source', 'direct')
          END as source,
          COUNT(*) FILTER (WHERE tp_ord = 1)::int as "firstTouch",
          COUNT(*) FILTER (WHERE tp_ord > 1 AND tp_ord < pa."touchpointCount")::int as "assistTouch",
          COUNT(*) FILTER (WHERE tp_ord = pa."touchpointCount" AND pa."touchpointCount" > 1)::int as "lastTouch",
          COUNT(*) FILTER (WHERE pa."touchpointCount" = 1)::int as "soloTouch"
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
          AND o.status NOT IN ('CANCELLED', 'PENDING')
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1
        ORDER BY "firstTouch" DESC
      ` as Promise<Array<{ source: string; firstTouch: number; assistTouch: number; lastTouch: number; soloTouch: number }>>,

      // 23. Visitors per source from NitroPixel (for CR by channel)
      // Per-visitor source: prioritize UTM params, fallback to referrer classification
      // Uses crDateFrom (pixel install date floor) to avoid comparing against pre-pixel orders
      prisma.$queryRaw`
        WITH visitor_source AS (
          SELECT DISTINCT ON (pe."visitorId")
            pe."visitorId",
            pe."utmParams",
            pe.referrer
          FROM pixel_events pe
          WHERE pe."organizationId" = ${ORG_ID}
            AND pe.timestamp >= ${crDateFrom}
            AND pe.timestamp <= ${dateTo}
          ORDER BY pe."visitorId",
            CASE WHEN pe."utmParams"->>'source' IS NOT NULL AND pe."utmParams"->>'source' != '' THEN 0 ELSE 1 END,
            pe.timestamp ASC
        )
        SELECT
          CASE
            WHEN COALESCE(vs."utmParams"->>'medium','') IN ('organic','social','referral')
              AND COALESCE(vs."utmParams"->>'source','') IN ('google','bing','yahoo','duckduckgo')
            THEN COALESCE(vs."utmParams"->>'source','') || '_organic'
            WHEN vs."utmParams"->>'source' IS NOT NULL AND vs."utmParams"->>'source' != ''
            THEN vs."utmParams"->>'source'
            WHEN vs.referrer LIKE '%google.%' THEN 'google_organic'
            WHEN vs.referrer LIKE '%bing.%' THEN 'bing_organic'
            WHEN vs.referrer LIKE '%instagram.%' OR vs.referrer LIKE '%l.instagram.%' THEN 'instagram'
            WHEN vs.referrer LIKE '%facebook.%' OR vs.referrer LIKE '%m.facebook.%' OR vs.referrer LIKE '%l.facebook.%' THEN 'facebook'
            WHEN vs.referrer LIKE '%tiktok.%' THEN 'tiktok'
            WHEN vs.referrer LIKE '%twitter.%' OR vs.referrer LIKE '%t.co%' THEN 'twitter'
            WHEN vs.referrer LIKE '%youtube.%' THEN 'youtube'
            WHEN vs.referrer IS NOT NULL AND vs.referrer != '' THEN 'referral'
            ELSE 'direct'
          END as source,
          COUNT(*)::int as visitors
        FROM visitor_source vs
        GROUP BY 1
        ORDER BY visitors DESC
        LIMIT 20
      ` as Promise<Array<{ source: string; visitors: number }>>,

      // 24. Orders by device — derive device from pixel_attributions → pixel_visitors
      // Uses crDateFrom to only count orders from when pixel was active
      prisma.$queryRaw`
        SELECT
          COALESCE(pv."deviceTypes"[1], 'unknown') as device,
          COUNT(DISTINCT pa."orderId")::int as orders,
          SUM(pa."attributedValue")::float as revenue
        FROM pixel_attributions pa
        JOIN pixel_visitors pv ON pv."visitorId" = pa."visitorId" AND pv."organizationId" = pa."organizationId"
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${crDateFrom}
          AND o."orderDate" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
          AND o.status NOT IN ('CANCELLED', 'PENDING')
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1
        ORDER BY orders DESC
      ` as Promise<Array<{ device: string; orders: number; revenue: number }>>,

      // 25. Product viewers from NitroPixel (VIEW_PRODUCT events)
      // Uses crDateFrom to align viewer data with pixel coverage period
      prisma.$queryRaw`
        SELECT
          pe.props->>'productId' as "productExternalId",
          COUNT(DISTINCT pe."visitorId")::int as viewers
        FROM pixel_events pe
        WHERE pe."organizationId" = ${ORG_ID}
          AND pe.timestamp >= ${crDateFrom}
          AND pe.timestamp <= ${dateTo}
          AND pe.type = 'VIEW_PRODUCT'
          AND pe.props->>'productId' IS NOT NULL
        GROUP BY 1
        ORDER BY viewers DESC
        LIMIT 500
      ` as Promise<Array<{ productExternalId: string; viewers: number }>>,

      // 26. Product purchases with name/category/brand (for CR by product/category/brand)
      // Uses crDateFrom so purchases align with pixel visitor coverage period
      prisma.$queryRaw`
        SELECT
          COALESCE(p."externalId", oi."productId") as "productExternalId",
          COALESCE(p.name, 'Producto desconocido') as "productName",
          COALESCE(p.category, 'Sin categoría') as category,
          COALESCE(p.brand, 'Sin marca') as brand,
          COUNT(DISTINCT oi."orderId")::int as orders,
          SUM(oi.quantity)::int as units,
          SUM(oi."totalPrice")::float as revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        LEFT JOIN products p ON p.id = oi."productId"
        WHERE o."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${crDateFrom}
          AND o."orderDate" <= ${dateTo}
          AND o.status NOT IN ('CANCELLED', 'PENDING')
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1, 2, 3, 4
        ORDER BY revenue DESC
        LIMIT 500
      ` as Promise<Array<{ productExternalId: string; productName: string; category: string; brand: string; orders: number; units: number; revenue: number }>>,

      // ── Journey Intelligence queries (use crDateFrom for pixel coverage) ──

      // 27. Journey complexity distribution (touchpoint count → journeys, revenue, AOV)
      prisma.$queryRaw`
        SELECT
          CASE
            WHEN pa."touchpointCount" = 1 THEN 1
            WHEN pa."touchpointCount" = 2 THEN 2
            WHEN pa."touchpointCount" = 3 THEN 3
            WHEN pa."touchpointCount" BETWEEN 4 AND 6 THEN 4
            ELSE 5
          END as bucket,
          COUNT(*)::int as journeys,
          SUM(pa."attributedValue")::float as revenue,
          AVG(pa."attributedValue")::float as aov
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${crDateFrom}
          AND o."orderDate" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
          AND o.status NOT IN ('CANCELLED', 'PENDING')
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
        GROUP BY 1
        ORDER BY 1
      ` as Promise<Array<{ bucket: number; journeys: number; revenue: number; aov: number }>>,

      // 28. Top channel pairs (first touch → last touch for multi-touch journeys)
      prisma.$queryRaw`
        SELECT
          CASE
            WHEN COALESCE(pa.touchpoints::jsonb->0->>'medium','') IN ('organic','social','referral')
              AND COALESCE(pa.touchpoints::jsonb->0->>'source','') IN ('google','bing','yahoo','duckduckgo')
            THEN COALESCE(pa.touchpoints::jsonb->0->>'source','') || '_organic'
            ELSE COALESCE(pa.touchpoints::jsonb->0->>'source', 'direct')
          END as first_channel,
          CASE
            WHEN COALESCE(pa.touchpoints::jsonb->(-1)->>'medium','') IN ('organic','social','referral')
              AND COALESCE(pa.touchpoints::jsonb->(-1)->>'source','') IN ('google','bing','yahoo','duckduckgo')
            THEN COALESCE(pa.touchpoints::jsonb->(-1)->>'source','') || '_organic'
            ELSE COALESCE(pa.touchpoints::jsonb->(-1)->>'source', 'direct')
          END as last_channel,
          COUNT(*)::int as journeys,
          SUM(pa."attributedValue")::float as revenue,
          AVG(pa."attributedValue")::float as aov
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${crDateFrom}
          AND o."orderDate" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
          AND pa."touchpointCount" >= 2
          AND o.status NOT IN ('CANCELLED', 'PENDING')
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
        GROUP BY 1, 2
        ORDER BY revenue DESC
        LIMIT 10
      ` as Promise<Array<{ first_channel: string; last_channel: string; journeys: number; revenue: number; aov: number }>>,
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

    // Payment gateway sources to exclude (safety net — attribution engine already filters these,
    // but historical data may contain them before the exclusion was added)
    const PAYMENT_GATEWAY_SOURCES = ["gocuotas", "mercadopago", "mobbex", "decidir", "payway", "todopago", "naranjax", "rapipago", "pagofacil"];
    const filteredAttrBySource = attributionBySourceResult.filter(
      (a) => !PAYMENT_GATEWAY_SOURCES.includes((a.source || "").toLowerCase())
    );

    // Attribution source with percentages
    const totalAttrRevenue = filteredAttrBySource.reduce((sum, a) => sum + (a.revenue || 0), 0);
    const attributionBySource = filteredAttrBySource.map((a) => ({
      ...a,
      percentage: totalAttrRevenue > 0 ? Math.round(((a.revenue || 0) / totalAttrRevenue) * 100) : 0,
    }));

    // Pages/session calc
    const pagesPerSession =
      kpisCurr.totalSessions > 0
        ? Math.round((kpisCurr.totalPageViews / kpisCurr.totalSessions) * 10) / 10
        : 0;

    const totalEvents = eventCountResult[0]?.total || 0;

    // ── NEW: Process business KPIs ──
    const selectedModelData = attributionByModelResult.find((m) => m.model === selectedModel);
    const pixelRevenue = selectedModelData?.revenue || 0;
    const ordersAttributed = selectedModelData?.ordersAttributed || 0;
    const totalOrders = totalOrdersResult[0]?.total || 0;
    const webOrders = totalOrdersResult[0]?.webOrders || 0;
    const webRevenue = totalOrdersResult[0]?.webRevenue || 0;
    const marketplaceOrders = totalOrdersResult[0]?.marketplaceOrders || 0;
    const marketplaceRevenue = totalOrdersResult[0]?.marketplaceRevenue || 0;
    const totalAdSpend = adSpendBySourceResult.reduce((sum, s) => sum + (s.spend || 0), 0);
    // Attribution rate uses web-only orders (marketplace orders can't be pixel-tracked)
    const attributionRate = webOrders > 0 ? Math.round((ordersAttributed / webOrders) * 100) : 0;
    const aov = ordersAttributed > 0 ? Math.round(pixelRevenue / ordersAttributed) : 0;

    // ── ROAS calculation: per-day coverage scaling ──
    // Instead of a single uniform coverage ratio (which is distorted when some
    // days have 0% and others 98% coverage), we compute an "effective coverage"
    // using only days where the pixel was active (attributedOrders > 0).
    // This avoids pre-pixel-deployment days from dragging down the ratio.
    const perDayCoverage = (perDayCoverageResult as Array<{ day: string; totalOrders: number; attributedOrders: number }>);
    const activeDays = perDayCoverage.filter(d => d.attributedOrders > 0);
    const effectiveTotalOrders = activeDays.reduce((s, d) => s + d.totalOrders, 0);
    const effectiveAttributedOrders = activeDays.reduce((s, d) => s + d.attributedOrders, 0);
    const coverageRatio = effectiveTotalOrders > 0 ? effectiveAttributedOrders / effectiveTotalOrders : 0;
    const projectedRevenue = coverageRatio > 0 ? pixelRevenue / coverageRatio : 0;
    const pixelRoasRaw = totalAdSpend > 0 ? Math.round((pixelRevenue / totalAdSpend) * 100) / 100 : 0;
    const pixelRoas = totalAdSpend > 0 ? Math.round((projectedRevenue / totalAdSpend) * 100) / 100 : 0;

    const prevAttr = prevAttrRevenueResult[0];
    const prevPixelRevenue = prevAttr?.revenue || 0;
    const prevOrdersAttr = prevAttr?.ordersAttributed || 0;
    const prevRoas = totalAdSpend > 0 ? (prevPixelRevenue / totalAdSpend) : 0;

    // ── Manual channel spend (S60) ──
    // Para canales sin integracion (TV, omnichannel, etc) el cliente puede
    // cargar inversion manual con un rango fromDate/toDate. Aca prorrateamos
    // el monto segun el overlap con el rango query del dashboard.
    const manualSpends = await prisma.manualChannelSpend.findMany({
      where: {
        organizationId: ORG_ID,
        fromDate: { lte: dateTo },
        toDate: { gte: dateFrom },
      },
    });
    const manualSpendByChannel = new Map<string, number>();
    for (const ms of manualSpends) {
      const totalDur = ms.toDate.getTime() - ms.fromDate.getTime();
      if (totalDur <= 0) continue;
      const overlapStart = Math.max(ms.fromDate.getTime(), dateFrom.getTime());
      const overlapEnd = Math.min(ms.toDate.getTime(), dateTo.getTime());
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const prorated = (overlap / totalDur) * Number(ms.amount);
      const current = manualSpendByChannel.get(ms.channel) || 0;
      manualSpendByChannel.set(ms.channel, current + prorated);
    }

    // ── NEW: Build channelRoas (merge pixel attribution + platform metrics + manual spend) ──
    const adSpendMap = new Map(adSpendBySourceResult.map((s) => [s.source, s]));
    const channelRoas = attributionBySource.map((ch) => {
      const platform = adSpendMap.get(ch.source) || { spend: 0, platformConversions: 0, platformRevenue: 0 };
      const manualSpend = manualSpendByChannel.get(ch.source) || 0;
      const chSpend = (platform.spend || 0) + manualSpend;
      // Scale channel revenue by overall attribution coverage
      const chProjectedRevenue = coverageRatio > 0 ? (ch.revenue || 0) / coverageRatio : 0;
      return {
        source: ch.source,
        orders: ch.orders,
        pixelRevenue: ch.revenue || 0,
        projectedRevenue: Math.round(chProjectedRevenue),
        platformRevenue: platform.platformRevenue || 0,
        spend: chSpend,
        platformSpend: platform.spend || 0,
        manualSpend: manualSpend,
        platformConversions: platform.platformConversions || 0,
        pixelRoas: chSpend > 0 ? Math.round((chProjectedRevenue / chSpend) * 100) / 100 : 0,
        pixelRoasRaw: chSpend > 0 ? Math.round(((ch.revenue || 0) / chSpend) * 100) / 100 : 0,
        platformRoas: chSpend > 0 ? Math.round(((platform.platformRevenue || 0) / chSpend) * 100) / 100 : 0,
        diffPercent: (platform.platformRevenue || 0) > 0 && chProjectedRevenue > 0
          ? Math.round(((chProjectedRevenue - (platform.platformRevenue || 0)) / (platform.platformRevenue || 0)) * 100)
          : null,
      };
    });

    // ── Funnel from NitroPixel (S60 EXT — decision producto) ──
    // El funnel se arma desde pixel_events propios. NitroSales es fuente de verdad.
    // Cuenta visitors UNICOS por etapa, excluyendo eventos creados server-side por
    // el webhook (sessionId LIKE 'webhook-%') que no representan humanos.
    //
    // Mapping estandar:
    //   Visitas       → PAGE_VIEW
    //   Vio Producto  → VIEW_PRODUCT
    //   Carrito       → ADD_TO_CART
    //   Checkout      → INITIATE_CHECKOUT o CHECKOUT_SHIPPING
    //   Compra        → PURCHASE
    const funnelRaw = await prisma.$queryRaw<Array<{
      pageView: number; viewProduct: number; addToCart: number;
      checkoutStart: number; purchase: number;
    }>>`
      SELECT
        COUNT(DISTINCT CASE WHEN pe.type = 'PAGE_VIEW' THEN pe."visitorId" END)::int as "pageView",
        COUNT(DISTINCT CASE WHEN pe.type = 'VIEW_PRODUCT' THEN pe."visitorId" END)::int as "viewProduct",
        COUNT(DISTINCT CASE WHEN pe.type = 'ADD_TO_CART' THEN pe."visitorId" END)::int as "addToCart",
        COUNT(DISTINCT CASE WHEN pe.type IN ('INITIATE_CHECKOUT', 'CHECKOUT_SHIPPING') THEN pe."visitorId" END)::int as "checkoutStart",
        COUNT(DISTINCT CASE WHEN pe.type = 'PURCHASE' THEN pe."visitorId" END)::int as "purchase"
      FROM pixel_events pe
      WHERE pe."organizationId" = ${ORG_ID}
        AND pe.timestamp >= ${dateFrom}
        AND pe.timestamp <= ${dateTo}
        AND (pe."sessionId" IS NULL OR pe."sessionId" NOT LIKE 'webhook-%')
    `;
    const fRow = funnelRaw[0] || { pageView: 0, viewProduct: 0, addToCart: 0, checkoutStart: 0, purchase: 0 };
    const funnel = {
      pageView: fRow.pageView || 0,
      viewProduct: fRow.viewProduct || 0,
      addToCart: fRow.addToCart || 0,
      checkoutStart: fRow.checkoutStart || 0,
      purchase: fRow.purchase || 0,
    };

    // ── NEW: Daily revenue merged with daily spend ──
    const dailySpendResult = await prisma.$queryRaw`
      SELECT
        TO_CHAR(amd.date, 'YYYY-MM-DD') as day,
        SUM(amd.spend)::float as spend
      FROM ad_metrics_daily amd
      WHERE amd."organizationId" = ${ORG_ID}
        AND amd.date >= ${dateFrom}::date
        AND amd.date <= ${dateTo}::date
      GROUP BY 1
    ` as Array<{ day: string; spend: number }>;
    const spendByDay = new Map(dailySpendResult.map((d) => [d.day, d.spend]));
    const dailyRevenue = dailyRevenueResult.map((d) => {
      const daySpend = spendByDay.get(d.day) || 0;
      return {
        ...d,
        spend: daySpend,
        roas: daySpend > 0 ? Math.round((d.revenue / daySpend) * 100) / 100 : 0,
      };
    });

    // ── Daily channel breakdown (for trend table) ──
    const dailyChRevenue = dailyChannelRevenueResult as Array<{ day: string; source: string; orders: number; revenue: number }>;
    const dailyChSpend = dailyChannelSpendResult as Array<{ day: string; source: string; spend: number }>;
    const visitorsMap = new Map((dailyVisitorsResult as Array<{ day: string; visitors: number }>).map(d => [d.day, d.visitors]));

    // Build day → source → { revenue, orders, spend }
    const dayChannelMap = new Map<string, Map<string, { revenue: number; orders: number; spend: number }>>();
    for (const row of dailyChRevenue) {
      if (!dayChannelMap.has(row.day)) dayChannelMap.set(row.day, new Map());
      const ch = dayChannelMap.get(row.day)!;
      const existing = ch.get(row.source) || { revenue: 0, orders: 0, spend: 0 };
      existing.revenue += row.revenue || 0;
      existing.orders += row.orders || 0;
      ch.set(row.source, existing);
    }
    for (const row of dailyChSpend) {
      if (!dayChannelMap.has(row.day)) dayChannelMap.set(row.day, new Map());
      const ch = dayChannelMap.get(row.day)!;
      const existing = ch.get(row.source) || { revenue: 0, orders: 0, spend: 0 };
      existing.spend += row.spend || 0;
      ch.set(row.source, existing);
    }

    const dailyChannelBreakdown = Array.from(dayChannelMap.entries())
      .sort(([a], [b]) => b.localeCompare(a)) // newest first
      .map(([day, channelMap]) => {
        const channels = Array.from(channelMap.entries())
          .map(([source, data]) => ({
            source,
            revenue: Math.round(data.revenue * 100) / 100,
            orders: data.orders,
            spend: Math.round(data.spend * 100) / 100,
            roas: data.spend > 0 ? Math.round((data.revenue / data.spend) * 100) / 100 : 0,
          }))
          .sort((a, b) => b.revenue - a.revenue);

        const totalRevenue = channels.reduce((s, c) => s + c.revenue, 0);
        const totalSpend = channels.reduce((s, c) => s + c.spend, 0);
        return {
          day,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalOrders: channels.reduce((s, c) => s + c.orders, 0),
          totalSpend: Math.round(totalSpend * 100) / 100,
          totalRoas: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : 0,
          visitors: visitorsMap.get(day) || 0,
          channels,
        };
      });

    // ── NEW: Pixel health ──
    const clickCov = clickIdCoverageResult[0];
    // Pixel age: days since first event (for contextualizing conversion lag)
    const firstEventDate = ls?.lastEventAt ? new Date(ls.lastEventAt) : null;
    // Use the earliest event timestamp from the liveStatus query
    const pixelAgeDays = perDayCoverage.length > 0
      ? Math.floor((Date.now() - new Date(perDayCoverage.find(d => d.attributedOrders > 0)?.day || Date.now()).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const pixelHealth = {
      attributionRate,
      clickCoverage: {
        clickIdRate: (clickCov?.total || 0) > 0 ? Math.round(((clickCov?.withClickId || 0) / clickCov.total) * 100) : 0,
        total: clickCov?.total || 0,
        withClickId: clickCov?.withClickId || 0,
      },
      eventsInPeriod: totalEvents,
      pixelAgeDays,
    };

    // ── NEW: Recent journeys ──
    const recentJourneys = recentJourneysResult.map((j) => ({
      ...j,
      orderDate: new Date(j.orderDate).toISOString(),
      touchpoints: Array.isArray(j.touchpoints) ? j.touchpoints : (typeof j.touchpoints === "string" ? JSON.parse(j.touchpoints) : j.touchpoints || []),
    }));

    const response = {
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

      // ── NEW: Business-focused KPIs ──
      businessKpis: {
        pixelRevenue,
        projectedRevenue: Math.round(projectedRevenue),
        pixelRoas,
        pixelRoasRaw,
        ordersAttributed,
        attributionRate,
        aov,
        totalAdSpend,
        totalOrders,
        webOrders,
        webRevenue: Math.round(webRevenue),
        marketplaceOrders,
        marketplaceRevenue: Math.round(marketplaceRevenue),
        changes: {
          pixelRevenue: pctChange(pixelRevenue, prevPixelRevenue),
          ordersAttributed: pctChange(ordersAttributed, prevOrdersAttr),
          pixelRoas: pctChange(pixelRoas * 100, prevRoas * 100),
        },
      },
      channelRoas,
      perDayCoverage: perDayCoverage.map(d => ({
        ...d,
        coverage: d.totalOrders > 0 ? Math.round((d.attributedOrders / d.totalOrders) * 100) : 0,
      })),
      funnel,
      dailyRevenue,
      dailyChannelBreakdown,
      recentJourneys,
      channelRoles: channelRolesResult.filter(
        (r) => !PAYMENT_GATEWAY_SOURCES.includes((r.source || "").toLowerCase())
      ),
      pixelHealth,

      // ── Existing fields (unchanged) ──
      dailyVisitors: dailyVisitorsResult,
      deviceBreakdown,
      eventTypes,
      popularPages: popularPagesResult,

      // ── Conversion Rates data (100% NitroPixel + VTEX orders) ──
      conversionRates: (() => {
        // CR by Channel: pixel visitors per source + attribution orders per source
        // Merge both directions: sources with purchases AND sources with only visitors
        const pixelVisitorsBySource = visitorsBySourceResult as Array<{ source: string; visitors: number }>;
        const visitorMap = new Map(pixelVisitorsBySource.map(v => [v.source.toLowerCase(), v.visitors]));
        const attrMap = new Map(attributionBySource.map(ch => [ch.source.toLowerCase(), ch]));

        // Start with attribution sources (have purchases)
        const channelMap = new Map<string, { source: string; visitors: number; purchases: number; revenue: number }>();
        for (const ch of attributionBySource) {
          const key = ch.source.toLowerCase();
          const visitors = visitorMap.get(key) || 0;
          channelMap.set(key, { source: ch.source, visitors, purchases: ch.orders, revenue: ch.revenue || 0 });
        }
        // Add sources that have visitors but 0 purchases (important for seeing all traffic sources)
        for (const vs of pixelVisitorsBySource) {
          const key = vs.source.toLowerCase();
          if (!channelMap.has(key) && vs.visitors > 5) { // skip tiny sources
            channelMap.set(key, { source: vs.source, visitors: vs.visitors, purchases: 0, revenue: 0 });
          }
        }
        const byChannel = Array.from(channelMap.values())
          .map(ch => ({ ...ch, cr: ch.visitors > 0 ? Math.round((ch.purchases / ch.visitors) * 10000) / 100 : 0 }))
          .sort((a, b) => b.visitors - a.visitors);

        // CR by Device: pixel visitors (deviceBreakdown from query #5) + pixel-attributed orders by device (query #24)
        // Both use the same device naming from pixel (Mobile, Desktop, etc.)
        const deviceVisitorMap = new Map(deviceBreakdown.map(d => [(d as any).device?.toLowerCase(), (d as any).count || 0]));
        const byDevice = (ordersByDeviceResult as Array<{ device: string; orders: number; revenue: number }>).map(d => {
          const visitors = deviceVisitorMap.get(d.device?.toLowerCase()) || 0;
          return {
            device: d.device,
            visitors,
            orders: d.orders,
            revenue: d.revenue || 0,
            cr: visitors > 0 ? Math.round((d.orders / visitors) * 10000) / 100 : 0,
          };
        });

        // Merge product viewers (pixel) + product purchases (VTEX) by externalId
        const viewers = productViewersResult as Array<{ productExternalId: string; viewers: number }>;
        const purchases = productPurchasesResult as Array<{ productExternalId: string; productName: string; category: string; brand: string; orders: number; units: number; revenue: number }>;
        const viewerMap = new Map(viewers.map(v => [v.productExternalId, v.viewers]));

        // Sesion 22: excluir productos con 0 visitantes del pixel.
        // Si un producto tiene ventas pero 0 vistas del pixel, significa
        // que la compra vino de un canal no trackeado (directo al checkout,
        // link externo, etc.) — el ratio 0 visits / 1 sale es incoherente
        // como CR y distorsiona el promedio por categoria/marca.
        const products = purchases
          .map(p => {
            const pViewers = viewerMap.get(p.productExternalId) || 0;
            return {
              ...p,
              viewers: pViewers,
              cr: pViewers > 0 ? Math.round((p.orders / pViewers) * 10000) / 100 : 0,
            };
          })
          .filter(p => p.viewers > 0);

        // Aggregate by category
        const catMap = new Map<string, { category: string; viewers: number; buyers: number; revenue: number }>();
        for (const p of products) {
          const existing = catMap.get(p.category) || { category: p.category, viewers: 0, buyers: 0, revenue: 0 };
          existing.viewers += p.viewers;
          existing.buyers += p.orders;
          existing.revenue += p.revenue || 0;
          catMap.set(p.category, existing);
        }
        const byCategory = Array.from(catMap.values())
          .map(c => ({ ...c, cr: c.viewers > 0 ? Math.round((c.buyers / c.viewers) * 10000) / 100 : 0 }))
          .sort((a, b) => b.revenue - a.revenue);

        // Aggregate by brand
        const brandMap = new Map<string, { brand: string; viewers: number; buyers: number; revenue: number }>();
        for (const p of products) {
          const existing = brandMap.get(p.brand) || { brand: p.brand, viewers: 0, buyers: 0, revenue: 0 };
          existing.viewers += p.viewers;
          existing.buyers += p.orders;
          existing.revenue += p.revenue || 0;
          brandMap.set(p.brand, existing);
        }
        const byBrand = Array.from(brandMap.values())
          .map(b => ({ ...b, cr: b.viewers > 0 ? Math.round((b.buyers / b.viewers) * 10000) / 100 : 0 }))
          .sort((a, b) => b.revenue - a.revenue);

        return { byChannel, byDevice, byCategory, byBrand, byProduct: products };
      })(),

      attribution: {
        byModel: attributionByModelResult,
        bySource: attributionBySource,
        conversionLag: conversionLagResult,
      },

      // ── Journey Intelligence ──
      journeyIntelligence: (() => {
        const BUCKET_LABELS: Record<number, string> = { 1: "1 toque", 2: "2 toques", 3: "3 toques", 4: "4-6 toques", 5: "7+ toques" };
        const complexity = (journeyComplexityResult as Array<{ bucket: number; journeys: number; revenue: number; aov: number }>)
          .map(b => ({ label: BUCKET_LABELS[b.bucket] || `${b.bucket}`, ...b }));

        const totalJourneys = complexity.reduce((s, c) => s + c.journeys, 0);
        const singleTouch = complexity.find(c => c.bucket === 1);
        const multiTouch = complexity.filter(c => c.bucket > 1);
        const multiTouchJourneys = multiTouch.reduce((s, c) => s + c.journeys, 0);
        const multiTouchRevenue = multiTouch.reduce((s, c) => s + c.revenue, 0);
        const singleTouchRevenue = singleTouch?.revenue || 0;
        const multiTouchAOV = multiTouchJourneys > 0 ? Math.round(multiTouchRevenue / multiTouchJourneys) : 0;
        const singleTouchAOV = singleTouch ? Math.round(singleTouch.revenue / singleTouch.journeys) : 0;

        // Channel pairs: filter out payment gateways
        const pairs = (channelPairsResult as Array<{ first_channel: string; last_channel: string; journeys: number; revenue: number; aov: number }>)
          .filter(p => !PAYMENT_GATEWAY_SOURCES.includes(p.first_channel.toLowerCase()) && !PAYMENT_GATEWAY_SOURCES.includes(p.last_channel.toLowerCase()));

        // Conversion lag (already have conversionLagResult)
        const lag = conversionLagResult as Array<{ bucket: string; orders: number; revenue: number }>;

        return {
          complexity,
          totalJourneys,
          multiTouchPercent: totalJourneys > 0 ? Math.round((multiTouchJourneys / totalJourneys) * 100) : 0,
          multiTouchRevenue: Math.round(multiTouchRevenue),
          singleTouchRevenue: Math.round(singleTouchRevenue),
          multiTouchAOV,
          singleTouchAOV,
          aovLift: singleTouchAOV > 0 ? Math.round(((multiTouchAOV - singleTouchAOV) / singleTouchAOV) * 100) : 0,
          channelPairs: pairs,
          conversionLag: lag,
          channelRoles: (channelRolesResult as Array<{ source: string; firstTouch: number; assistTouch: number; lastTouch: number; soloTouch: number }>)
            .filter(r => !PAYMENT_GATEWAY_SOURCES.includes((r.source || "").toLowerCase()))
            .slice(0, 8),
        };
      })(),

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
        attributionWindowDays,
        nitroWeights,
        // Pixel coverage: when the pixel was first installed + effective CR date range
        pixelInstalledAt: pixelInstalledAt ? pixelInstalledAt.toISOString() : null,
        crDateFrom: crDateFrom.toISOString(),
        crDateAdjusted: pixelInstalledAt ? pixelInstalledAt.getTime() > dateFrom.getTime() : false,
      },
    };

    setCache("pixel", response, ...cacheKey);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[Pixel Metrics API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pixel metrics", details: String(error) },
      { status: 500 }
    );
  }
}
