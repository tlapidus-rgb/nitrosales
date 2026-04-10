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
       ALL QUERIES IN PARALLEL — no sequential queries
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
      // v4 namespaces
      sourceCountsRaw,
      cohortsRaw,
      profitabilityRaw,
      logisticsByDelivery,
      logisticsByCarrier,
      segByDevice,
      segByChannel,
      segByTraffic,
      couponsRaw,
      geoProvinces,
      geoPostalCodes,
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

      /* 15) Source counts — VTEX vs MELI split */
      prisma.$queryRawUnsafe<Array<{
        source: string; cnt: string; revenue: string; shipping: string;
      }>>(`
        SELECT
          COALESCE("source", 'VTEX') AS source,
          COUNT(*)::text AS cnt,
          COALESCE(SUM("totalValue"), 0)::text AS revenue,
          COALESCE(SUM(COALESCE("shippingCost", 0)), 0)::text AS shipping
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1 AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
        GROUP BY COALESCE("source", 'VTEX')
      `, dateFrom, dateTo),

      /* 16) Cohorts — new / returning / VIP / anonymous */
      prisma.$queryRawUnsafe<Array<{
        cohort: string; customers: string; orders: string; revenue: string;
      }>>(`
        WITH customer_history AS (
          SELECT
            o."customerId",
            COUNT(*)::int AS period_orders,
            SUM(o."totalValue") AS period_revenue,
            MIN(first_order.first_date) AS first_order_date
          FROM orders o
          LEFT JOIN LATERAL (
            SELECT MIN("orderDate") AS first_date
            FROM orders
            WHERE "organizationId" = '${ORG_ID}'
              AND "customerId" = o."customerId"
              AND "customerId" IS NOT NULL
          ) first_order ON true
          WHERE o."organizationId" = '${ORG_ID}'
            AND o."orderDate" >= $1 AND o."orderDate" <= $2
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            ${srcWhereSimple}
          GROUP BY o."customerId", first_order.first_date
        ),
        classified AS (
          SELECT
            CASE
              WHEN "customerId" IS NULL THEN 'anonymous'
              WHEN first_order_date >= $1 THEN 'new'
              ELSE 'returning'
            END AS cohort,
            "customerId", period_orders, period_revenue
          FROM customer_history
        )
        SELECT
          cohort,
          COUNT(DISTINCT "customerId")::text AS customers,
          SUM(period_orders)::text AS orders,
          SUM(period_revenue)::text AS revenue
        FROM classified
        GROUP BY cohort
      `, dateFrom, dateTo),

      /* 17) Profitability — gross, COGS, net, margin */
      prisma.$queryRawUnsafe<[{
        gross_revenue: string; gross_with_cost: string; gross_without_cost: string;
        total_cogs: string; orders_with_cost: string; orders_total: string;
      }]>(`
        SELECT
          COALESCE(SUM(oi."totalPrice"), 0)::text AS gross_revenue,
          COALESCE(SUM(CASE WHEN p."costPrice" IS NOT NULL AND p."costPrice" > 0 THEN oi."totalPrice" ELSE 0 END), 0)::text AS gross_with_cost,
          COALESCE(SUM(CASE WHEN p."costPrice" IS NULL OR p."costPrice" = 0 THEN oi."totalPrice" ELSE 0 END), 0)::text AS gross_without_cost,
          COALESCE(SUM(CASE WHEN p."costPrice" IS NOT NULL AND p."costPrice" > 0 THEN oi.quantity * p."costPrice" ELSE 0 END), 0)::text AS total_cogs,
          COUNT(DISTINCT CASE WHEN p."costPrice" IS NOT NULL AND p."costPrice" > 0 THEN o.id END)::text AS orders_with_cost,
          COUNT(DISTINCT o.id)::text AS orders_total
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        LEFT JOIN products p ON p.id = oi."productId"
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."orderDate" >= $1 AND o."orderDate" <= $2
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhere}
      `, dateFrom, dateTo),

      /* 18) Logistics — by delivery type */
      prisma.$queryRawUnsafe<Array<{
        bucket: string; orders: string; revenue: string; shipping_charged: string; shipping_real: string;
      }>>(`
        SELECT
          COALESCE("deliveryType", 'Sin dato') AS bucket,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue,
          COALESCE(SUM(COALESCE("shippingCost", 0)), 0)::text AS shipping_charged,
          COALESCE(SUM(COALESCE("realShippingCost", 0)), 0)::text AS shipping_real
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1 AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhereSimple}
        GROUP BY "deliveryType"
        ORDER BY COUNT(*) DESC
      `, dateFrom, dateTo),

      /* 19) Logistics — by carrier */
      prisma.$queryRawUnsafe<Array<{
        bucket: string; orders: string; revenue: string; shipping_charged: string; shipping_real: string;
      }>>(`
        SELECT
          COALESCE("shippingCarrier", 'Sin dato') AS bucket,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue,
          COALESCE(SUM(COALESCE("shippingCost", 0)), 0)::text AS shipping_charged,
          COALESCE(SUM(COALESCE("realShippingCost", 0)), 0)::text AS shipping_real
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1 AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhereSimple}
        GROUP BY "shippingCarrier"
        ORDER BY COUNT(*) DESC
        LIMIT 10
      `, dateFrom, dateTo),

      /* 20) Segmentation — by device */
      prisma.$queryRawUnsafe<Array<{
        bucket: string; orders: string; revenue: string;
      }>>(`
        SELECT
          COALESCE("deviceType", 'Sin dato') AS bucket,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1 AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhereSimple}
        GROUP BY "deviceType"
        ORDER BY COUNT(*) DESC
      `, dateFrom, dateTo),

      /* 21) Segmentation — by channel */
      prisma.$queryRawUnsafe<Array<{
        bucket: string; orders: string; revenue: string;
      }>>(`
        SELECT
          COALESCE("channel", 'Sin dato') AS bucket,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1 AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhereSimple}
        GROUP BY "channel"
        ORDER BY COUNT(*) DESC
      `, dateFrom, dateTo),

      /* 22) Segmentation — by traffic source */
      prisma.$queryRawUnsafe<Array<{
        bucket: string; orders: string; revenue: string;
      }>>(`
        SELECT
          COALESCE("trafficSource", 'Sin dato') AS bucket,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1 AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhereSimple}
        GROUP BY "trafficSource"
        ORDER BY COUNT(*) DESC
      `, dateFrom, dateTo),

      /* 23) Coupons — top coupon codes */
      prisma.$queryRawUnsafe<Array<{
        code: string; orders: string; revenue: string; discount: string;
      }>>(`
        SELECT
          COALESCE("couponCode", 'Sin cupon') AS code,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue,
          COALESCE(SUM(COALESCE("discountValue", 0)), 0)::text AS discount
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1 AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          AND "couponCode" IS NOT NULL AND "couponCode" != ''
          ${srcWhereSimple}
        GROUP BY "couponCode"
        ORDER BY COUNT(*) DESC
        LIMIT 15
      `, dateFrom, dateTo),

      /* 24) Geography — top provinces (first 4 digits of postal code as proxy) */
      prisma.$queryRawUnsafe<Array<{
        value: string; orders: string; revenue: string;
      }>>(`
        SELECT
          COALESCE("postalCode", 'Sin dato') AS value,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1 AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          AND "postalCode" IS NOT NULL AND "postalCode" != ''
          ${srcWhereSimple}
        GROUP BY "postalCode"
        ORDER BY COUNT(*) DESC
        LIMIT 20
      `, dateFrom, dateTo),

      /* 25) Geography — postal codes (same data, kept separate for type clarity) */
      prisma.$queryRawUnsafe<Array<{
        value: string; orders: string; revenue: string;
      }>>(`
        SELECT
          COALESCE("postalCode", 'Sin dato') AS value,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1 AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          AND "postalCode" IS NOT NULL AND "postalCode" != ''
          ${srcWhereSimple}
        GROUP BY "postalCode"
        ORDER BY COUNT(*) DESC
        LIMIT 20
      `, dateFrom, dateTo),
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
      // ── v4 namespaces ──
      sourceCounts: (() => {
        const vtexRow = sourceCountsRaw.find(r => r.source === "VTEX");
        const meliRow = sourceCountsRaw.find(r => r.source === "MELI");
        return {
          vtex: Number(vtexRow?.cnt || 0),
          meli: Number(meliRow?.cnt || 0),
          total: Number(vtexRow?.cnt || 0) + Number(meliRow?.cnt || 0),
          vtexRevenue: Number(vtexRow?.revenue || 0),
          meliRevenue: Number(meliRow?.revenue || 0),
          vtexShipping: Number(vtexRow?.shipping || 0),
          meliShipping: Number(meliRow?.shipping || 0),
        };
      })(),
      cohorts: (() => {
        const get = (c: string) => cohortsRaw.find(r => r.cohort === c);
        const newC = get("new");
        const ret = get("returning");
        const anon = get("anonymous");
        return {
          new: { customers: Number(newC?.customers || 0), orders: Number(newC?.orders || 0), revenue: Number(newC?.revenue || 0) },
          returning: { customers: Number(ret?.customers || 0), orders: Number(ret?.orders || 0), revenue: Number(ret?.revenue || 0) },
          vip: { customers: 0, orders: 0, revenue: 0 }, // TODO: VIP classification requires lifetime query
          anonymous: { customers: Number(anon?.customers || 0), orders: Number(anon?.orders || 0), revenue: Number(anon?.revenue || 0) },
          vipCriteria: { minOrders: 5, minSpentArs: 500000, description: "5+ compras o $500k+ gastados" },
        };
      })(),
      profitability: (() => {
        const p = profitabilityRaw[0];
        const grossRevenue = Number(p?.gross_revenue || 0);
        const grossWithCost = Number(p?.gross_with_cost || 0);
        const grossWithoutCost = Number(p?.gross_without_cost || 0);
        const totalCogs = Number(p?.total_cogs || 0);
        const ordersWithCost = Number(p?.orders_with_cost || 0);
        const ordersTotal = Number(p?.orders_total || 0);
        const marginAbs = grossWithCost - totalCogs;
        const marginPct = grossWithCost > 0 ? (marginAbs / grossWithCost) * 100 : 0;
        const netRevenue = totalRevenue / 1.21;
        return {
          grossRevenue,
          grossWithCost: grossWithCost > 0 ? grossWithCost : undefined,
          grossWithoutCost: grossWithoutCost > 0 ? grossWithoutCost : undefined,
          netRevenue,
          totalCogs,
          marginAbs: Math.round(marginAbs),
          marginPct: Math.round(marginPct * 10) / 10,
          ordersWithCost,
          ordersTotal,
          coveragePct: ordersTotal > 0 ? Math.round((ordersWithCost / ordersTotal) * 1000) / 10 : 0,
        };
      })(),
      logistics: (() => {
        const mapBucket = (r: any) => ({
          bucket: r.bucket,
          orders: Number(r.orders),
          revenue: Number(r.revenue),
          shippingCharged: Number(r.shipping_charged),
          shippingReal: Number(r.shipping_real),
          shippingGap: Number(r.shipping_charged) - Number(r.shipping_real),
        });
        const byDelivery = logisticsByDelivery.map(mapBucket);
        const byCarrier = logisticsByCarrier.map(mapBucket);
        const shippingGapTotal = byDelivery.reduce((sum, b) => sum + b.shippingGap, 0);
        if (byDelivery.length === 0 && byCarrier.length === 0) return undefined;
        return { byDeliveryType: byDelivery, byCarrier: byCarrier, shippingGapTotal };
      })(),
      segmentation: (() => {
        const mapSeg = (r: any) => ({ bucket: r.bucket, orders: Number(r.orders), revenue: Number(r.revenue) });
        const byDevice = segByDevice.map(mapSeg);
        const byChannel = segByChannel.map(mapSeg);
        const byTrafficSource = segByTraffic.map(mapSeg);
        if (byDevice.length === 0 && byChannel.length === 0 && byTrafficSource.length === 0) return undefined;
        return { byDevice, byChannel, byTrafficSource };
      })(),
      coupons: (() => {
        if (couponsRaw.length === 0) return undefined;
        const topCoupons = couponsRaw.map(c => ({
          code: c.code,
          orders: Number(c.orders),
          revenue: Number(c.revenue),
          discountTotal: Number(c.discount),
        }));
        return {
          topCoupons,
          totalCouponRevenue: topCoupons.reduce((s, c) => s + c.revenue, 0),
          totalCouponDiscount: topCoupons.reduce((s, c) => s + c.discountTotal, 0),
        };
      })(),
      geography: (() => {
        if (geoProvinces.length === 0) return undefined;
        const mapGeo = (r: any) => ({ value: r.value, orders: Number(r.orders), revenue: Number(r.revenue) });
        return {
          topProvinces: geoProvinces.map(mapGeo),
          topPostalCodes: geoPostalCodes.map(mapGeo),
        };
      })(),
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
