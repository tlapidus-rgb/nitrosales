export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Orders API v3 — Dashboard de Órdenes (optimized for 60K+ orders)
// ══════════════════════════════════════════════════════════════
// GET /api/metrics/orders?from=2026-03-01&to=2026-03-16&source=VTEX
// Timezone: Argentina (UTC-3)
// ══════════════════════════════════════════════════════════════
// OPTIMIZATION NOTES (v3):
// - ALL 14 queries now run in parallel (was 10 parallel + 4 sequential)
// - recentOrders uses lateral join instead of correlated subquery
// - status::text cast prevents enum serialization issues
// - promotion_names included in TS type
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { getCached, setCache } from "@/lib/api-cache";

export const revalidate = 0;
export const maxDuration = 60; // Vercel Pro: hasta 60s para queries pesadas en producción
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Auto-migrate: ensure columns exist (runs once per cold start)
async function ensureColumns() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS "promotionNames" TEXT
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'VTEX'
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "orders_organizationId_source_orderDate_idx"
      ON orders ("organizationId", "source", "orderDate")
    `);
  } catch (e) {
    // Columns/indexes likely already exist
  }
}

let migrated = false;

export async function GET(request: NextRequest) {
  try {
    const ORG_ID = await getOrganizationId();
    if (!migrated) {
      await ensureColumns();
      migrated = true;
    }
    const { searchParams } = new URL(request.url);

    // ── Parse date range (defaults to last 30 days, Argentina timezone UTC-3) ──
    const now = new Date();
    const toParam = searchParams.get("to");
    const fromParam = searchParams.get("from");

    const dateTo = toParam
      ? new Date(toParam + "T23:59:59.999-03:00")
      : now;
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(now.getTime() - 30 * MS_PER_DAY);

    // ── Source filter (validated whitelist to prevent SQL injection) ──
    const VALID_SOURCES = ["VTEX", "MELI"];
    const sourceParam = searchParams.get("source")?.toUpperCase();
    const sourceFilter = sourceParam && VALID_SOURCES.includes(sourceParam) ? sourceParam : null;

    // ── Pagination ──
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));

    // Cache check
    const cacheKey = [ORG_ID, fromParam || "default", toParam || "default", sourceParam || "default", page];
    const cached = getCached("orders", ...cacheKey);
    if (cached) return NextResponse.json(cached);

    // ── Previous period for comparison ──
    const periodMs = dateTo.getTime() - dateFrom.getTime();
    const prevFrom = new Date(dateFrom.getTime() - periodMs);
    const prevTo = new Date(dateFrom.getTime() - 1);

    // ── Build source WHERE fragment (safe: sourceFilter validated against whitelist) ──
    const srcWhere = sourceFilter ? `AND o."source" = '${sourceFilter}'` : "";
    const srcWhereSimple = sourceFilter ? `AND "source" = '${sourceFilter}'` : "";

    // ── Count days in period for averages ──
    const daysInPeriod = Math.max(1, Math.ceil(periodMs / MS_PER_DAY));

    /* ══════════════════════════════════════════════════════════
       ALL 14 QUERIES IN PARALLEL — no sequential queries
       ══════════════════════════════════════════════════════════ */
    const [
      currentPeriod,
      previousPeriod,
      dailySales,
      salesByDayOfWeek,
      salesByHour,
      topPaymentMethods,
      statusBreakdown,
      topProducts,
      topCustomers,
      recentOrders,
      cancelledResult,
      prevDailySales,
      promotionBreakdown,
      totalCountResult,
      // ── Tanda 2 (v4): fundación de datos ──
      marginAndNet,
      logisticsBreakdown,
      segmentationBreakdown,
      couponsBreakdown,
      dsoStats,
      customerCohortsRows,
      geographyBreakdown,
      orderAnomalies,
      periodAnomaliesRow,
    ] = await Promise.all([

      /* 1) Current period KPIs */
      prisma.$queryRawUnsafe<[{
        total_orders: string;
        total_revenue: string;
        avg_ticket: string;
        total_items: string;
        total_shipping: string;
        total_discounts: string;
      }]>(`
        SELECT
          COUNT(*)::text AS total_orders,
          COALESCE(SUM("totalValue"), 0)::text AS total_revenue,
          COALESCE(AVG("totalValue"), 0)::text AS avg_ticket,
          COALESCE(SUM("itemCount"), 0)::text AS total_items,
          COALESCE(SUM(COALESCE("shippingCost", 0)), 0)::text AS total_shipping,
          COALESCE(SUM(COALESCE("discountValue", 0)), 0)::text AS total_discounts
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhereSimple}
      `, dateFrom, dateTo),

      /* 2) Previous period KPIs */
      prisma.$queryRawUnsafe<[{
        total_orders: string;
        total_revenue: string;
        avg_ticket: string;
      }]>(`
        SELECT
          COUNT(*)::text AS total_orders,
          COALESCE(SUM("totalValue"), 0)::text AS total_revenue,
          COALESCE(AVG("totalValue"), 0)::text AS avg_ticket
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhereSimple}
      `, prevFrom, prevTo),

      /* 3) Daily sales */
      prisma.$queryRawUnsafe<Array<{
        day: string;
        orders: string;
        revenue: string;
        items: string;
      }>>(`
        SELECT
          TO_CHAR("orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') AS day,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue,
          COALESCE(SUM("itemCount"), 0)::text AS items
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhereSimple}
        GROUP BY TO_CHAR("orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')
        ORDER BY day ASC
      `, dateFrom, dateTo),

      /* 4) Sales by day of week */
      prisma.$queryRawUnsafe<Array<{
        day_of_week: number;
        day_name: string;
        total_orders: string;
        total_revenue: string;
        num_days: string;
      }>>(`
        WITH daily AS (
          SELECT
            TO_CHAR("orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') AS day,
            EXTRACT(DOW FROM "orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS dow,
            COUNT(*) AS orders,
            COALESCE(SUM("totalValue"), 0) AS revenue
          FROM orders
          WHERE "organizationId" = '${ORG_ID}'
            AND "orderDate" >= $1
            AND "orderDate" <= $2
            AND status NOT IN ('CANCELLED', 'RETURNED')
            ${srcWhereSimple}
          GROUP BY day, dow
        )
        SELECT
          dow AS day_of_week,
          CASE dow
            WHEN 0 THEN 'Dom' WHEN 1 THEN 'Lun' WHEN 2 THEN 'Mar'
            WHEN 3 THEN 'Mie' WHEN 4 THEN 'Jue' WHEN 5 THEN 'Vie'
            WHEN 6 THEN 'Sab' END AS day_name,
          SUM(orders)::text AS total_orders,
          SUM(revenue)::text AS total_revenue,
          COUNT(*)::text AS num_days
        FROM daily
        GROUP BY dow
        ORDER BY dow
      `, dateFrom, dateTo),

      /* 5) Sales by hour */
      prisma.$queryRawUnsafe<Array<{
        hour: number;
        total_orders: string;
        total_revenue: string;
        num_days: string;
      }>>(`
        WITH daily_hours AS (
          SELECT
            TO_CHAR("orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') AS day,
            EXTRACT(HOUR FROM "orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS hr,
            COUNT(*) AS orders,
            COALESCE(SUM("totalValue"), 0) AS revenue
          FROM orders
          WHERE "organizationId" = '${ORG_ID}'
            AND "orderDate" >= $1
            AND "orderDate" <= $2
            AND status NOT IN ('CANCELLED', 'RETURNED')
            ${srcWhereSimple}
          GROUP BY day, hr
        )
        SELECT
          hr AS hour,
          SUM(orders)::text AS total_orders,
          SUM(revenue)::text AS total_revenue,
          COUNT(DISTINCT day)::text AS num_days
        FROM daily_hours
        GROUP BY hr
        ORDER BY hr
      `, dateFrom, dateTo),

      /* 6) Payment methods */
      prisma.$queryRawUnsafe<Array<{
        payment_method: string;
        orders: string;
        revenue: string;
      }>>(`
        SELECT
          COALESCE("paymentMethod", 'Sin dato') AS payment_method,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhereSimple}
        GROUP BY "paymentMethod"
        ORDER BY SUM("totalValue") DESC
        LIMIT 10
      `, dateFrom, dateTo),

      /* 7) Status breakdown — cast to text to avoid enum serialization issues */
      prisma.$queryRawUnsafe<Array<{
        status: string;
        count: string;
      }>>(`
        SELECT
          status::text AS status,
          COUNT(*)::text AS count
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          ${srcWhereSimple}
        GROUP BY status
        ORDER BY COUNT(*) DESC
      `, dateFrom, dateTo),

      /* 8) Top products */
      prisma.$queryRawUnsafe<Array<{
        product_id: string;
        product_name: string;
        brand: string;
        category: string;
        image_url: string | null;
        units_sold: string;
        revenue: string;
        order_count: string;
      }>>(`
        SELECT
          p.id AS product_id,
          p.name AS product_name,
          COALESCE(p.brand, 'Sin marca') AS brand,
          COALESCE(p.category, 'Sin categoria') AS category,
          p."imageUrl" AS image_url,
          SUM(oi.quantity)::text AS units_sold,
          SUM(oi."totalPrice")::text AS revenue,
          COUNT(DISTINCT o.id)::text AS order_count
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        JOIN products p ON p.id = oi."productId"
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."orderDate" >= $1
          AND o."orderDate" <= $2
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhere}
        GROUP BY p.id, p.name, p.brand, p.category, p."imageUrl"
        ORDER BY SUM(oi."totalPrice") DESC
        LIMIT 15
      `, dateFrom, dateTo),

      /* 9) Top customers */
      prisma.$queryRawUnsafe<Array<{
        customer_id: string;
        customer_name: string;
        email: string;
        total_orders: string;
        total_spent: string;
      }>>(`
        SELECT
          c.id AS customer_id,
          TRIM(CONCAT(COALESCE(c."firstName", ''), ' ', COALESCE(c."lastName", ''))) AS customer_name,
          COALESCE(c.email, 'Sin email') AS email,
          COUNT(o.id)::text AS total_orders,
          SUM(o."totalValue")::text AS total_spent
        FROM orders o
        JOIN customers c ON c.id = o."customerId"
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."orderDate" >= $1
          AND o."orderDate" <= $2
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhere}
        GROUP BY c.id, c."firstName", c."lastName", c.email
        ORDER BY SUM(o."totalValue") DESC
        LIMIT 10
      `, dateFrom, dateTo),

      /* 10) Recent orders — optimized with lateral join instead of correlated subquery */
      prisma.$queryRawUnsafe<Array<{
        id: string;
        external_id: string;
        status: string;
        total_value: string;
        item_count: string;
        payment_method: string;
        source: string;
        order_date: string;
        customer_name: string;
        customer_email: string;
        items_json: string;
        promotion_names: string;
      }>>(`
        SELECT
          o.id,
          o."externalId" AS external_id,
          o.status::text AS status,
          o."totalValue"::text AS total_value,
          o."itemCount"::text AS item_count,
          COALESCE(o."paymentMethod", '-') AS payment_method,
          COALESCE(o."source", 'VTEX') AS source,
          TO_CHAR(o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI') AS order_date,
          TRIM(CONCAT(COALESCE(c."firstName", ''), ' ', COALESCE(c."lastName", ''))) AS customer_name,
          COALESCE(c.email, '') AS customer_email,
          COALESCE(items_agg.items_json, '[]') AS items_json,
          COALESCE(o."promotionNames", '') AS promotion_names
        FROM orders o
        LEFT JOIN customers c ON c.id = o."customerId"
        LEFT JOIN LATERAL (
          SELECT json_agg(json_build_object(
            'name', p.name,
            'imageUrl', p."imageUrl",
            'quantity', oi.quantity,
            'unitPrice', oi."unitPrice",
            'totalPrice', oi."totalPrice"
          ))::text AS items_json
          FROM order_items oi
          LEFT JOIN products p ON p.id = oi."productId"
          WHERE oi."orderId" = o.id
        ) items_agg ON true
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."orderDate" >= $1
          AND o."orderDate" <= $2
          ${srcWhere}
        ORDER BY o."orderDate" DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `, dateFrom, dateTo),

      /* 11) Cancelled count — was sequential, now parallel */
      prisma.$queryRawUnsafe<[{ cnt: string }]>(`
        SELECT COUNT(*)::text AS cnt FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1 AND "orderDate" <= $2
          AND status IN ('CANCELLED', 'RETURNED')
          ${srcWhereSimple}
      `, dateFrom, dateTo),

      /* 12) Previous period daily sales — was sequential, now parallel */
      prisma.$queryRawUnsafe<Array<{
        day: string; orders: string; revenue: string;
      }>>(`
        SELECT
          TO_CHAR("orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') AS day,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhereSimple}
        GROUP BY TO_CHAR("orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')
        ORDER BY day ASC
      `, prevFrom, prevTo),

      /* 13) Promotion breakdown — was sequential, now parallel */
      prisma.$queryRawUnsafe<Array<{
        promo: string;
        orders: string;
        revenue: string;
      }>>(`
        SELECT
          COALESCE(NULLIF(TRIM("promotionNames"), ''), 'Sin promo') AS promo,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1 AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhereSimple}
        GROUP BY COALESCE(NULLIF(TRIM("promotionNames"), ''), 'Sin promo')
        ORDER BY SUM("totalValue") DESC
        LIMIT 15
      `, dateFrom, dateTo),

      /* 14) Total count for pagination — was sequential, now parallel */
      prisma.$queryRawUnsafe<[{ cnt: string }]>(`
        SELECT COUNT(*)::text AS cnt FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1 AND "orderDate" <= $2
          ${srcWhereSimple}
      `, dateFrom, dateTo),

      /* ══════════════════════════════════════════════════════════
         TANDA 2 (v4) — FUNDACIÓN DE DATOS PARA /orders OVERHAUL
         Backward compatible: nada se renombra, solo se agrega.
         ══════════════════════════════════════════════════════════ */

      /* 15) Profitability: gross revenue + COGS + coverage (D1 + D2) */
      prisma.$queryRawUnsafe<[{
        gross_revenue: string;
        total_cogs: string;
        orders_total: string;
        orders_with_cost: string;
      }]>(`
        SELECT
          COALESCE(SUM(oi."totalPrice"), 0)::text AS gross_revenue,
          COALESCE(SUM(oi.quantity * COALESCE(oi."costPrice", 0)), 0)::text AS total_cogs,
          COUNT(DISTINCT o.id)::text AS orders_total,
          COUNT(DISTINCT CASE WHEN oi."costPrice" IS NOT NULL AND oi."costPrice" > 0 THEN o.id END)::text AS orders_with_cost
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."orderDate" >= $1
          AND o."orderDate" <= $2
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhere}
      `, dateFrom, dateTo),

      /* 16) Logistics breakdown: delivery type + carrier + shipping gap (D5) */
      prisma.$queryRawUnsafe<Array<{
        dim: string;
        bucket: string;
        orders: string;
        revenue: string;
        shipping_charged: string;
        shipping_real: string;
      }>>(`
        WITH base AS (
          SELECT "deliveryType", "shippingCarrier", "totalValue", "shippingCost", "realShippingCost"
          FROM orders
          WHERE "organizationId" = '${ORG_ID}'
            AND "orderDate" >= $1
            AND "orderDate" <= $2
            AND status NOT IN ('CANCELLED', 'RETURNED')
            ${srcWhereSimple}
        )
        SELECT 'delivery' AS dim, COALESCE("deliveryType", 'Sin dato') AS bucket,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue,
          COALESCE(SUM(COALESCE("shippingCost", 0)), 0)::text AS shipping_charged,
          COALESCE(SUM(COALESCE("realShippingCost", 0)), 0)::text AS shipping_real
        FROM base
        GROUP BY "deliveryType"
        UNION ALL
        SELECT 'carrier', COALESCE("shippingCarrier", 'Sin dato'),
          COUNT(*)::text,
          COALESCE(SUM("totalValue"), 0)::text,
          COALESCE(SUM(COALESCE("shippingCost", 0)), 0)::text,
          COALESCE(SUM(COALESCE("realShippingCost", 0)), 0)::text
        FROM base
        GROUP BY "shippingCarrier"
      `, dateFrom, dateTo),

      /* 17) Segmentation breakdown: device + channel + trafficSource (D6 + D7) */
      prisma.$queryRawUnsafe<Array<{
        dim: string;
        bucket: string;
        orders: string;
        revenue: string;
      }>>(`
        WITH base AS (
          SELECT "deviceType", channel, "trafficSource", "totalValue"
          FROM orders
          WHERE "organizationId" = '${ORG_ID}'
            AND "orderDate" >= $1
            AND "orderDate" <= $2
            AND status NOT IN ('CANCELLED', 'RETURNED')
            ${srcWhereSimple}
        )
        SELECT 'device' AS dim, COALESCE("deviceType", 'Sin dato') AS bucket,
          COUNT(*)::text AS orders, COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM base GROUP BY "deviceType"
        UNION ALL
        SELECT 'channel', COALESCE(channel, 'Sin dato'),
          COUNT(*)::text, COALESCE(SUM("totalValue"), 0)::text
        FROM base GROUP BY channel
        UNION ALL
        SELECT 'traffic', COALESCE("trafficSource", 'Sin dato'),
          COUNT(*)::text, COALESCE(SUM("totalValue"), 0)::text
        FROM base GROUP BY "trafficSource"
      `, dateFrom, dateTo),

      /* 18) Coupons breakdown — top 15 used (D8) */
      prisma.$queryRawUnsafe<Array<{
        code: string;
        orders: string;
        revenue: string;
        discount_total: string;
      }>>(`
        SELECT
          "couponCode" AS code,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue,
          COALESCE(SUM(COALESCE("discountValue", 0)), 0)::text AS discount_total
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          AND "couponCode" IS NOT NULL
          AND "couponCode" <> ''
          ${srcWhereSimple}
        GROUP BY "couponCode"
        ORDER BY SUM("totalValue") DESC
        LIMIT 15
      `, dateFrom, dateTo),

      /* 19) DSO stats — days to finalize order (D9) */
      prisma.$queryRawUnsafe<[{
        avg_days: string;
        median_days: string;
        orders_finalized: string;
      }]>(`
        SELECT
          COALESCE(AVG(EXTRACT(EPOCH FROM ("updatedAt" - "orderDate")) / 86400.0), 0)::text AS avg_days,
          COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("updatedAt" - "orderDate")) / 86400.0), 0)::text AS median_days,
          COUNT(*)::text AS orders_finalized
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          AND status IN ('DELIVERED', 'INVOICED')
          ${srcWhereSimple}
      `, dateFrom, dateTo),

      /* 20) Customer cohorts: new / returning / vip / anonymous (D10) */
      prisma.$queryRawUnsafe<Array<{
        cohort: string;
        customers: string;
        orders: string;
        revenue: string;
      }>>(`
        WITH period_orders AS (
          SELECT
            o.id,
            o."totalValue",
            o."customerId",
            c."firstOrderAt",
            c."totalOrders",
            c."totalSpent"
          FROM orders o
          LEFT JOIN customers c ON c.id = o."customerId"
          WHERE o."organizationId" = '${ORG_ID}'
            AND o."orderDate" >= $1
            AND o."orderDate" <= $2
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            ${srcWhere}
        )
        SELECT
          CASE
            WHEN "customerId" IS NULL THEN 'anonymous'
            WHEN "totalOrders" >= 5 OR "totalSpent" >= 500000 THEN 'vip'
            WHEN "firstOrderAt" >= $1 THEN 'new'
            ELSE 'returning'
          END AS cohort,
          COUNT(DISTINCT "customerId")::text AS customers,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM period_orders
        GROUP BY 1
      `, dateFrom, dateTo),

      /* 21) Geography: top 10 provincias + top 15 postal codes (D12) */
      prisma.$queryRawUnsafe<Array<{
        level: string;
        value: string;
        orders: string;
        revenue: string;
      }>>(`
        WITH base AS (
          SELECT o."totalValue", o."postalCode", c.state
          FROM orders o
          LEFT JOIN customers c ON c.id = o."customerId"
          WHERE o."organizationId" = '${ORG_ID}'
            AND o."orderDate" >= $1
            AND o."orderDate" <= $2
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            ${srcWhere}
        ),
        province_agg AS (
          SELECT COALESCE(state, 'Sin dato') AS value,
            COUNT(*) AS orders_n,
            COALESCE(SUM("totalValue"), 0) AS revenue_n,
            ROW_NUMBER() OVER (ORDER BY SUM("totalValue") DESC) AS rn
          FROM base GROUP BY state
        ),
        postal_agg AS (
          SELECT COALESCE("postalCode", 'Sin dato') AS value,
            COUNT(*) AS orders_n,
            COALESCE(SUM("totalValue"), 0) AS revenue_n,
            ROW_NUMBER() OVER (ORDER BY SUM("totalValue") DESC) AS rn
          FROM base GROUP BY "postalCode"
        )
        SELECT 'province' AS level, value, orders_n::text AS orders, revenue_n::text AS revenue
        FROM province_agg WHERE rn <= 10
        UNION ALL
        SELECT 'postal', value, orders_n::text, revenue_n::text
        FROM postal_agg WHERE rn <= 15
      `, dateFrom, dateTo),

      /* 22) Order-level anomalies (D11 families 1-5, 10) */
      prisma.$queryRawUnsafe<Array<{
        id: string;
        external_id: string;
        total_value: string;
        item_count: string;
        order_date_fmt: string;
        flags: string[];
      }>>(`
        WITH base_stats AS (
          SELECT
            AVG("totalValue") AS avg_ticket,
            COALESCE(STDDEV_POP("totalValue"), 0) AS std_ticket,
            AVG("itemCount"::numeric) AS avg_items,
            COALESCE(STDDEV_POP("itemCount"::numeric), 0) AS std_items
          FROM orders
          WHERE "organizationId" = '${ORG_ID}'
            AND "orderDate" >= $1
            AND "orderDate" <= $2
            AND status NOT IN ('CANCELLED', 'RETURNED')
            ${srcWhereSimple}
        ),
        order_cogs AS (
          SELECT oi."orderId",
            SUM(oi.quantity * COALESCE(oi."costPrice", 0)) AS total_cogs,
            BOOL_OR(p.price > 0 AND oi."unitPrice" < p.price * 0.7) AS has_stale_price
          FROM order_items oi
          LEFT JOIN products p ON p.id = oi."productId"
          GROUP BY oi."orderId"
        ),
        flagged AS (
          SELECT
            o.id,
            o."externalId",
            o."totalValue"::text AS total_value,
            o."itemCount",
            TO_CHAR(o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI') AS order_date_fmt,
            ARRAY_REMOVE(ARRAY[
              CASE WHEN oc.total_cogs > 0 AND o."totalValue" < oc.total_cogs THEN 'negative_margin' END,
              CASE WHEN o."totalValue" > 0 AND COALESCE(o."discountValue", 0) / o."totalValue" > 0.35 THEN 'high_discount' END,
              CASE WHEN oc.has_stale_price THEN 'stale_price' END,
              CASE WHEN bs.std_ticket > 0 AND o."totalValue" > bs.avg_ticket + 3 * bs.std_ticket THEN 'high_ticket' END,
              CASE WHEN bs.std_items > 0 AND o."itemCount"::numeric > bs.avg_items + 3 * bs.std_items THEN 'high_qty' END,
              CASE WHEN COALESCE(o."realShippingCost", 0) - COALESCE(o."shippingCost", 0) > 2000 THEN 'shipping_gap' END
            ], NULL) AS flags
          FROM orders o
          CROSS JOIN base_stats bs
          LEFT JOIN order_cogs oc ON oc."orderId" = o.id
          WHERE o."organizationId" = '${ORG_ID}'
            AND o."orderDate" >= $1
            AND o."orderDate" <= $2
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            ${srcWhere}
        )
        SELECT id, "externalId" AS external_id, total_value, "itemCount"::text AS item_count, order_date_fmt, flags
        FROM flagged
        WHERE array_length(flags, 1) > 0
        ORDER BY array_length(flags, 1) DESC, total_value::numeric DESC
        LIMIT 200
      `, dateFrom, dateTo),

      /* 23) Period-level anomalies: cancel spike + velocity + viral SKU + duplicate suspects (D11 families 6, 7, 9, 11) */
      prisma.$queryRawUnsafe<[{
        cancel_24h: string;
        cancel_baseline: string;
        velocity_last_hour: string;
        velocity_baseline: string;
        dup_count: string;
        viral_skus: string;
      }]>(`
        WITH cancel_stats AS (
          SELECT
            COUNT(*) FILTER (WHERE "orderDate" >= NOW() - INTERVAL '24 hours' AND status IN ('CANCELLED','RETURNED')) AS last_24h_cancelled,
            COUNT(*) FILTER (WHERE "orderDate" >= NOW() - INTERVAL '14 days' AND "orderDate" < NOW() - INTERVAL '24 hours' AND status IN ('CANCELLED','RETURNED'))::numeric / 13.0 AS avg_daily_cancelled_prior
          FROM orders
          WHERE "organizationId" = '${ORG_ID}'
            AND "orderDate" >= NOW() - INTERVAL '14 days'
            ${srcWhereSimple}
        ),
        velocity_stats AS (
          SELECT
            COUNT(*) FILTER (WHERE "orderDate" >= NOW() - INTERVAL '1 hour' AND status NOT IN ('CANCELLED','RETURNED')) AS last_hour_orders,
            COUNT(*) FILTER (WHERE "orderDate" >= NOW() - INTERVAL '8 days' AND "orderDate" < NOW() - INTERVAL '1 hour' AND status NOT IN ('CANCELLED','RETURNED'))::numeric / (7.0 * 24.0) AS avg_hourly_prior
          FROM orders
          WHERE "organizationId" = '${ORG_ID}'
            AND "orderDate" >= NOW() - INTERVAL '8 days'
            ${srcWhereSimple}
        ),
        viral_sku AS (
          SELECT p.name AS sku_name, COUNT(*) AS recent_cnt
          FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          JOIN products p ON p.id = oi."productId"
          WHERE o."organizationId" = '${ORG_ID}'
            AND o."orderDate" >= NOW() - INTERVAL '6 hours'
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            ${srcWhere}
          GROUP BY p.id, p.name
          HAVING COUNT(*) > 10
          ORDER BY COUNT(*) DESC
          LIMIT 3
        ),
        dup_candidates AS (
          SELECT COUNT(*) AS dup_count
          FROM (
            SELECT "customerId", "totalValue", "itemCount"
            FROM orders
            WHERE "organizationId" = '${ORG_ID}'
              AND "orderDate" >= NOW() - INTERVAL '24 hours'
              AND "customerId" IS NOT NULL
              AND status NOT IN ('CANCELLED','RETURNED')
              ${srcWhereSimple}
            GROUP BY "customerId", "totalValue", "itemCount"
            HAVING COUNT(*) >= 2
          ) x
        )
        SELECT
          COALESCE((SELECT last_24h_cancelled FROM cancel_stats), 0)::text AS cancel_24h,
          COALESCE((SELECT avg_daily_cancelled_prior FROM cancel_stats), 0)::text AS cancel_baseline,
          COALESCE((SELECT last_hour_orders FROM velocity_stats), 0)::text AS velocity_last_hour,
          COALESCE((SELECT avg_hourly_prior FROM velocity_stats), 0)::text AS velocity_baseline,
          COALESCE((SELECT dup_count FROM dup_candidates), 0)::text AS dup_count,
          COALESCE((SELECT json_agg(json_build_object('name', sku_name, 'count', recent_cnt))::text FROM viral_sku), '[]') AS viral_skus
      `),
    ]);

    // ── Process results ──
    const curr = currentPeriod[0];
    const prev = previousPeriod[0];
    const cancelledOrders = Number(cancelledResult[0].cnt);
    const totalOrderCount = Number(totalCountResult[0].cnt);

    const totalOrders = Number(curr.total_orders);
    const totalRevenue = Number(curr.total_revenue);
    const avgTicket = Number(curr.avg_ticket);
    const cancellationRate = totalOrders + cancelledOrders > 0
      ? (cancelledOrders / (totalOrders + cancelledOrders)) * 100
      : 0;

    const prevTotalOrders = Number(prev.total_orders);
    const prevTotalRevenue = Number(prev.total_revenue);
    const prevAvgTicket = Number(prev.avg_ticket);

    const pctChange = (c: number, p: number) =>
      p > 0 ? ((c - p) / p) * 100 : c > 0 ? 100 : 0;

    const response = {
      kpis: {
        totalOrders,
        totalRevenue,
        avgTicket: Math.round(avgTicket),
        totalItems: Number(curr.total_items),
        totalShipping: Number(curr.total_shipping),
        totalDiscounts: Number(curr.total_discounts),
        cancellationRate: Math.round(cancellationRate * 10) / 10,
        cancelledOrders,
        daysInPeriod,
        changes: {
          orders: Math.round(pctChange(totalOrders, prevTotalOrders) * 10) / 10,
          revenue: Math.round(pctChange(totalRevenue, prevTotalRevenue) * 10) / 10,
          avgTicket: Math.round(pctChange(avgTicket, prevAvgTicket) * 10) / 10,
        },
      },
      prevDailySales: prevDailySales.map(d => ({
        day: d.day,
        orders: Number(d.orders),
        revenue: Number(d.revenue),
      })),
      dailySales: dailySales.map(d => ({
        day: d.day,
        orders: Number(d.orders),
        revenue: Number(d.revenue),
        items: Number(d.items),
      })),
      salesByDayOfWeek: salesByDayOfWeek.map(d => ({
        dayName: d.day_name,
        dayOfWeek: d.day_of_week,
        totalOrders: Number(d.total_orders),
        avgOrders: Math.round(Number(d.total_orders) / Number(d.num_days)),
        totalRevenue: Number(d.total_revenue),
        avgRevenue: Math.round(Number(d.total_revenue) / Number(d.num_days)),
        numDays: Number(d.num_days),
      })),
      salesByHour: salesByHour.map(h => ({
        hour: h.hour,
        label: `${h.hour}:00`,
        totalOrders: Number(h.total_orders),
        avgOrders: Math.round((Number(h.total_orders) / Number(h.num_days)) * 10) / 10,
        totalRevenue: Number(h.total_revenue),
        avgRevenue: Math.round(Number(h.total_revenue) / Number(h.num_days)),
        numDays: Number(h.num_days),
      })),
      paymentMethods: topPaymentMethods.map(pm => ({
        method: pm.payment_method,
        orders: Number(pm.orders),
        revenue: Number(pm.revenue),
      })),
      statusBreakdown: statusBreakdown.map(s => ({
        status: s.status,
        count: Number(s.count),
      })),

      promotionBreakdown: promotionBreakdown.map(p => ({
        promo: p.promo,
        orders: Number(p.orders),
        revenue: Number(p.revenue),
      })),
      topProducts: topProducts.map(p => ({
        id: p.product_id,
        name: p.product_name,
        brand: p.brand,
        category: p.category,
        imageUrl: p.image_url || null,
        unitsSold: Number(p.units_sold),
        revenue: Number(p.revenue),
        orders: Number(p.order_count),
      })),
      topCustomers: topCustomers.map(c => ({
        id: c.customer_id,
        name: c.customer_name || "Sin nombre",
        email: c.email,
        totalOrders: Number(c.total_orders),
        totalSpent: Number(c.total_spent),
      })),
      recentOrders: recentOrders.map(o => {
        let items: any[] = [];
        try { items = JSON.parse(o.items_json); } catch {}
        return {
          id: o.id,
          externalId: o.external_id,
          status: o.status,
          totalValue: Number(o.total_value),
          itemCount: Number(o.item_count),
          paymentMethod: o.payment_method,
          source: o.source,
          orderDate: o.order_date,
          customerName: o.customer_name || "Sin nombre",
          customerEmail: o.customer_email,
          items,
          promotionNames: o.promotion_names || null,
        };
      }),
      pagination: {
        page,
        pageSize,
        totalCount: totalOrderCount,
        totalPages: Math.ceil(totalOrderCount / pageSize),
      },
      meta: {
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        source: sourceFilter || "ALL",
        daysInPeriod,
        totalOrdersInDB: totalOrders + cancelledOrders,
      },
    } as any;

    // ══════════════════════════════════════════════════════════
    // TANDA 2 (v4) — procesamiento de namespaces nuevos
    // Se mergean al response sin tocar campos existentes
    // ══════════════════════════════════════════════════════════

    // ── Profitability (D1 + D2) ──
    const prof = (marginAndNet as any)[0] || {};
    const grossRevenue = Number(prof.gross_revenue || 0);
    const totalCogs = Number(prof.total_cogs || 0);
    const ordersTotal = Number(prof.orders_total || 0);
    const ordersWithCost = Number(prof.orders_with_cost || 0);
    const netRevenue = Math.round(grossRevenue / 1.21);
    const marginAbs = grossRevenue - totalCogs;
    const marginPct = grossRevenue > 0 ? (marginAbs / grossRevenue) * 100 : 0;
    const coveragePct = ordersTotal > 0 ? (ordersWithCost / ordersTotal) * 100 : 0;

    response.profitability = {
      grossRevenue: Math.round(grossRevenue),
      netRevenue,
      totalCogs: Math.round(totalCogs),
      marginAbs: Math.round(marginAbs),
      marginPct: Math.round(marginPct * 10) / 10,
      ordersWithCost,
      ordersTotal,
      coveragePct: Math.round(coveragePct * 10) / 10,
    };
    // Also expose inside kpis for convenience (backward compatible: adds new fields)
    response.kpis.marginPct = Math.round(marginPct * 10) / 10;
    response.kpis.netRevenue = netRevenue;
    response.kpis.totalCogs = Math.round(totalCogs);

    // ── Logistics (D5) ──
    const logistics = (logisticsBreakdown as any[]) || [];
    response.logistics = {
      byDeliveryType: logistics
        .filter((r: any) => r.dim === "delivery")
        .map((r: any) => ({
          bucket: r.bucket,
          orders: Number(r.orders),
          revenue: Number(r.revenue),
          shippingCharged: Number(r.shipping_charged),
          shippingReal: Number(r.shipping_real),
          shippingGap: Number(r.shipping_real) - Number(r.shipping_charged),
        })),
      byCarrier: logistics
        .filter((r: any) => r.dim === "carrier")
        .map((r: any) => ({
          bucket: r.bucket,
          orders: Number(r.orders),
          revenue: Number(r.revenue),
          shippingCharged: Number(r.shipping_charged),
          shippingReal: Number(r.shipping_real),
          shippingGap: Number(r.shipping_real) - Number(r.shipping_charged),
        })),
      shippingGapTotal: logistics
        .filter((r: any) => r.dim === "delivery")
        .reduce((acc: number, r: any) => acc + (Number(r.shipping_real) - Number(r.shipping_charged)), 0),
    };

    // ── Segmentation (D6 + D7) ──
    const seg = (segmentationBreakdown as any[]) || [];
    const mapSeg = (dim: string) =>
      seg
        .filter((r: any) => r.dim === dim)
        .map((r: any) => ({
          bucket: r.bucket,
          orders: Number(r.orders),
          revenue: Number(r.revenue),
        }))
        .sort((a: any, b: any) => b.revenue - a.revenue);
    response.segmentation = {
      byDevice: mapSeg("device"),
      byChannel: mapSeg("channel"),
      byTrafficSource: mapSeg("traffic"),
    };

    // ── Coupons (D8) ──
    const coupons = (couponsBreakdown as any[]) || [];
    response.coupons = {
      topCoupons: coupons.map((c: any) => ({
        code: c.code,
        orders: Number(c.orders),
        revenue: Number(c.revenue),
        discountTotal: Number(c.discount_total),
      })),
      totalCouponRevenue: coupons.reduce((a: number, c: any) => a + Number(c.revenue), 0),
      totalCouponDiscount: coupons.reduce((a: number, c: any) => a + Number(c.discount_total), 0),
    };

    // ── DSO stats (D9) ──
    const dso = (dsoStats as any)[0] || {};
    response.fulfillment = {
      dsoAvgDays: Math.round(Number(dso.avg_days || 0) * 10) / 10,
      dsoMedianDays: Math.round(Number(dso.median_days || 0) * 10) / 10,
      ordersFinalized: Number(dso.orders_finalized || 0),
    };

    // ── Customer cohorts (D10) ──
    const cohortsRaw = (customerCohortsRows as any[]) || [];
    const emptyC = { customers: 0, orders: 0, revenue: 0 };
    const findCohort = (name: string) => {
      const row = cohortsRaw.find((r: any) => r.cohort === name);
      return row
        ? {
            customers: Number(row.customers),
            orders: Number(row.orders),
            revenue: Number(row.revenue),
          }
        : { ...emptyC };
    };
    response.cohorts = {
      new: findCohort("new"),
      returning: findCohort("returning"),
      vip: findCohort("vip"),
      anonymous: findCohort("anonymous"),
      vipCriteria: {
        minOrders: 5,
        minSpentArs: 500000,
        description: "VIP: 5+ compras O $500.000+ gastados con vos (histórico)",
      },
    };

    // ── Geography (D12) ──
    const geo = (geographyBreakdown as any[]) || [];
    response.geography = {
      topProvinces: geo
        .filter((r: any) => r.level === "province")
        .map((r: any) => ({
          value: r.value,
          orders: Number(r.orders),
          revenue: Number(r.revenue),
        })),
      topPostalCodes: geo
        .filter((r: any) => r.level === "postal")
        .map((r: any) => ({
          value: r.value,
          orders: Number(r.orders),
          revenue: Number(r.revenue),
        })),
    };

    // ── Anomalies (D11) ──
    const orderAnom = (orderAnomalies as any[]) || [];
    const anomCounts: Record<string, number> = {
      negative_margin: 0,
      high_discount: 0,
      stale_price: 0,
      high_ticket: 0,
      high_qty: 0,
      shipping_gap: 0,
    };
    orderAnom.forEach((o: any) => {
      (o.flags || []).forEach((f: string) => {
        if (f in anomCounts) anomCounts[f] = (anomCounts[f] || 0) + 1;
      });
    });

    const periodAnom = (periodAnomaliesRow as any)[0] || {};
    const cancel24h = Number(periodAnom.cancel_24h || 0);
    const cancelBaseline = Number(periodAnom.cancel_baseline || 0);
    const velocityLastHour = Number(periodAnom.velocity_last_hour || 0);
    const velocityBaseline = Number(periodAnom.velocity_baseline || 0);
    const dupCount = Number(periodAnom.dup_count || 0);
    let viralSkus: Array<{ name: string; count: number }> = [];
    try {
      viralSkus = JSON.parse(periodAnom.viral_skus || "[]");
    } catch {}

    const cancelSpikeRatio = cancelBaseline > 0 ? cancel24h / cancelBaseline : cancel24h > 0 ? 999 : 0;
    const velocityRatio = velocityBaseline > 0 ? velocityLastHour / velocityBaseline : velocityLastHour > 0 ? 999 : 0;

    response.anomalies = {
      orderLevel: orderAnom.map((o: any) => ({
        orderId: o.id,
        externalId: o.external_id,
        totalValue: Number(o.total_value),
        itemCount: Number(o.item_count),
        orderDate: o.order_date_fmt,
        flags: o.flags || [],
      })),
      periodLevel: {
        cancelLast24h: cancel24h,
        cancelDailyBaseline: Math.round(cancelBaseline * 10) / 10,
        cancelSpikeRatio: Math.round(cancelSpikeRatio * 100) / 100,
        cancelSpikeActive: cancelSpikeRatio >= 2 && cancel24h >= 3,
        velocityLastHour,
        velocityHourlyBaseline: Math.round(velocityBaseline * 10) / 10,
        velocityRatio: Math.round(velocityRatio * 100) / 100,
        velocityAnomalyActive: (velocityRatio >= 2 || velocityRatio <= 0.3) && velocityLastHour >= 1,
        duplicateSuspectsCount: dupCount,
        viralSkus,
      },
      counts: {
        ...anomCounts,
        viral_sku: viralSkus.length,
        cancel_spike: cancelSpikeRatio >= 2 && cancel24h >= 3 ? 1 : 0,
        velocity_anomaly: (velocityRatio >= 2 || velocityRatio <= 0.3) && velocityLastHour >= 1 ? 1 : 0,
        duplicate_suspect: dupCount,
      },
      thresholds: {
        highDiscountPct: 35,
        stalePricePct: 30,
        shippingGapArs: 2000,
        cancelSpikeMultiplier: 2,
        velocityAnomalyMultiplier: 2,
        ticketOutlierSigma: 3,
        qtyOutlierSigma: 3,
      },
    };

    setCache("orders", response, ...cacheKey);
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Orders API error:", error);
    return NextResponse.json(
      { error: "Error fetching orders data", detail: error.message },
      { status: 500 }
    );
  }
}
