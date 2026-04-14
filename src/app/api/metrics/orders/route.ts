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
// enrichment moved to /api/metrics/orders/enrich (non-blocking)

export const revalidate = 0;
export const maxDuration = 120; // Vercel Pro: up to 120s (250k orders + 170k items need headroom)
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Resilience helper: wraps each query so a single failure doesn't kill the whole API ──
async function safeQuery<T>(queryPromise: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await queryPromise;
  } catch (e: any) {
    console.error(`[Orders API] Query "${label}" failed:`, e.message);
    return fallback;
  }
}

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
    // Ensure order_items indexes exist (critical for LATERAL JOIN + top products query)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "order_items_orderId_idx" ON order_items ("orderId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "order_items_productId_idx" ON order_items ("productId")`);
    // Index on products.sku for cross-referencing MELI→VTEX costs by SKU
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "products_org_sku_idx" ON products ("organizationId", sku) WHERE sku IS NOT NULL AND sku != ''`);
    // Tanda 9: marketplaceFee column for ML commission tracking
    await prisma.$executeRawUnsafe(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS "marketplaceFee" DECIMAL(12, 2) NULL`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS orders_marketplace_fee_idx ON orders ("organizationId", "orderDate") WHERE "marketplaceFee" IS NOT NULL`);
  } catch (e) {
    // Columns/indexes likely already exist
  }
}

let migrated = false;

// Payment label translation — makes PieChart labels human-friendly
function getPaymentLabel(method: string, source: string): string {
  const isMeli = source === "MELI";
  const lower = method.toLowerCase();
  if (isMeli) {
    if (lower === "account_money") return "Mercado Pago (MELI)";
    if (lower === "credit_card") return "Tarjeta crédito (MELI)";
    if (lower === "debit_card") return "Tarjeta débito (MELI)";
    if (lower === "ticket") return "Efectivo (MELI)";
    if (lower === "atm") return "ATM (MELI)";
    return `${method} (MELI)`;
  }
  // VTEX
  if (lower.includes("mercado") || lower.includes("mercadopago")) return "Mercado Pago (VTEX)";
  if (lower === "sin dato") return "Sin dato";
  return `${method} (VTEX)`;
}

export async function GET(request: NextRequest) {
  try {
    const ORG_ID = await getOrganizationId();
    if (!migrated) {
      // Await to avoid competing for connections with the query batches below.
      // Only runs once per cold start — subsequent requests skip this.
      await ensureColumns().catch(() => {});
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
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 50));

    // ── Comparison mode ──
    // compMode: "prev" (default — period immediately before), "yoy", "mom", "wow"
    // compOffset: integer, 0 = default position, +1 = shift right (more recent), -1 = shift left (further back)
    const VALID_COMP_MODES = ["prev", "yoy", "mom", "wow"];
    const compModeParam = searchParams.get("compMode") || "prev";
    const compMode = VALID_COMP_MODES.includes(compModeParam) ? compModeParam : "prev";
    const compOffset = Number(searchParams.get("compOffset")) || 0;

    // Cache check
    const cacheKey = [ORG_ID, fromParam || "default", toParam || "default", sourceParam || "default", page, compMode, compOffset];
    const cached = getCached("orders", ...cacheKey);
    if (cached) return NextResponse.json(cached);

    // ── Previous period for comparison ──
    const periodMs = dateTo.getTime() - dateFrom.getTime();
    let prevFrom: Date;
    let prevTo: Date;

    if (compMode === "yoy") {
      // Interanual: same dates, 1 year back, then shift by offset * 7 days
      const offsetMs = compOffset * 7 * MS_PER_DAY;
      prevFrom = new Date(dateFrom.getTime() - 365 * MS_PER_DAY + offsetMs);
      prevTo = new Date(dateTo.getTime() - 365 * MS_PER_DAY + offsetMs);
    } else if (compMode === "mom") {
      // Intermensual: same duration, 1 month back, then shift by offset * 7 days
      const offsetMs = compOffset * 7 * MS_PER_DAY;
      prevFrom = new Date(dateFrom.getTime() - 30 * MS_PER_DAY + offsetMs);
      prevTo = new Date(prevFrom.getTime() + periodMs);
    } else if (compMode === "wow") {
      // Intersemanal: same duration, 1 week back, then shift by offset * 7 days
      const offsetMs = compOffset * 7 * MS_PER_DAY;
      prevFrom = new Date(dateFrom.getTime() - 7 * MS_PER_DAY + offsetMs);
      prevTo = new Date(prevFrom.getTime() + periodMs);
    } else {
      // Default: previous period of same length immediately before
      prevFrom = new Date(dateFrom.getTime() - periodMs);
      prevTo = new Date(dateFrom.getTime() - 1);
    }

    // ── Build source WHERE fragment (safe: sourceFilter validated against whitelist) ──
    const srcWhere = sourceFilter ? `AND o."source" = '${sourceFilter}'` : "";
    const srcWhereSimple = sourceFilter ? `AND "source" = '${sourceFilter}'` : "";

    // ── Count days in period for averages ──
    const daysInPeriod = Math.max(1, Math.ceil(periodMs / MS_PER_DAY));

    /* ══════════════════════════════════════════════════════════
       QUERIES IN BATCHES of 3 — Railway default pool_limit=5
       Max 3 parallel = always safe with any pool config.
       ══════════════════════════════════════════════════════════ */

    // ── BATCH 1a: KPIs current + previous (2 queries) ──
    const [
      currentPeriod,
      previousPeriod,
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
          COALESCE(SUM(COALESCE("discountValue", 0)), 0)::text AS total_discounts,
          COALESCE(SUM(COALESCE("marketplaceFee", 0)), 0)::text AS total_marketplace_fee,
          COUNT(CASE WHEN "marketplaceFee" IS NOT NULL AND "marketplaceFee" > 0 THEN 1 END)::text AS orders_with_fee
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
    ]);

    // ── BATCH 1b: Daily sales (1 query, separate to stay within pool limit) ──
    const [dailySales] = await Promise.all([
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
    ]);

    // ── BATCH 1c: Daily sales by source (only when source=ALL, resilient) ──
    const dailySalesBySource = !sourceFilter ? await safeQuery(
      prisma.$queryRawUnsafe<Array<{
        day: string; source: string; orders: string; revenue: string;
      }>>(`
        SELECT
          TO_CHAR("orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') AS day,
          COALESCE("source", 'VTEX') AS source,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
        GROUP BY TO_CHAR("orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'), COALESCE("source", 'VTEX')
        ORDER BY day ASC
      `, dateFrom, dateTo), [] as any[], "daily-by-source"
    ) : [];

    // ── BATCH 2: Charts (2 queries) ──
    const [
      salesByDayOfWeek,
      salesByHour,
    ] = await Promise.all([

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
    ]);

    // ── BATCH 3: Payment + status (2 queries) ──
    const [
      topPaymentMethods,
      statusBreakdown,
    ] = await Promise.all([

      /* 6) Payment methods — with source for label translation */
      prisma.$queryRawUnsafe<Array<{
        payment_method: string;
        source: string;
        orders: string;
        revenue: string;
      }>>(`
        SELECT
          COALESCE("paymentMethod", 'Sin dato') AS payment_method,
          COALESCE("source", 'VTEX') AS source,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhereSimple}
        GROUP BY "paymentMethod", COALESCE("source", 'VTEX')
        ORDER BY SUM("totalValue") DESC
        LIMIT 15
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
    ]);

    // ── BATCH 3b: Top products (heavy JOIN, runs alone, resilient) ──
    const [topProducts] = await Promise.all([
      /* 8) Top products */
      safeQuery(prisma.$queryRawUnsafe<Array<{
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
          COALESCE(p."imageUrl", ml."thumbnailUrl") AS image_url,
          SUM(oi.quantity)::text AS units_sold,
          SUM(oi."totalPrice")::text AS revenue,
          COUNT(DISTINCT o.id)::text AS order_count
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        JOIN products p ON p.id = oi."productId"
        LEFT JOIN ml_listings ml ON ml."mlItemId" = p."externalId" AND ml."organizationId" = o."organizationId"
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."orderDate" >= $1
          AND o."orderDate" <= $2
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhere}
        GROUP BY p.id, p.name, p.brand, p.category, p."imageUrl", ml."thumbnailUrl"
        ORDER BY SUM(oi."totalPrice") DESC
        LIMIT 15
      `, dateFrom, dateTo), [] as any[], "top-products"),
    ]);

    // ── BATCH 4: Customers + recent orders (2 queries) ──
    const [
      topCustomers,
      recentOrders,
    ] = await Promise.all([

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

      /* 10) Recent orders — optimized with lateral join, enriched for detail view */
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
        discount_value: string;
        shipping_cost: string;
        channel: string;
        delivery_type: string;
        shipping_carrier: string;
        pickup_store_name: string;
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
          CASE
            WHEN o."customerId" IS NULL AND COALESCE(o."source", 'VTEX') = 'MELI' THEN 'Cliente MercadoLibre'
            WHEN o."customerId" IS NULL THEN 'Cliente sin datos'
            WHEN TRIM(CONCAT(COALESCE(c."firstName", ''), ' ', COALESCE(c."lastName", ''))) = '' THEN 'Cliente sin nombre'
            ELSE TRIM(CONCAT(COALESCE(c."firstName", ''), ' ', COALESCE(c."lastName", '')))
          END AS customer_name,
          COALESCE(c.email, '') AS customer_email,
          COALESCE(items_agg.items_json, '[]') AS items_json,
          COALESCE(o."promotionNames", '') AS promotion_names,
          COALESCE(o."discountValue", 0)::text AS discount_value,
          COALESCE(o."shippingCost", 0)::text AS shipping_cost,
          COALESCE(o."channel", '') AS channel,
          COALESCE(o."deliveryType", '') AS delivery_type,
          COALESCE(o."shippingCarrier", '') AS shipping_carrier,
          COALESCE(o."pickupStoreName", '') AS pickup_store_name,
          COALESCE(o."realShippingCost", 0)::text AS real_shipping_cost,
          COALESCE(mc."commissionAmount", 0)::text AS ml_commission_amount,
          COALESCE(mc."commissionRate", 0)::text AS ml_commission_rate,
          COALESCE(mc."taxWithholdings", 0)::text AS ml_tax_withholdings,
          COALESCE(mc."netAmount", 0)::text AS ml_net_amount
        FROM orders o
        LEFT JOIN customers c ON c.id = o."customerId"
        LEFT JOIN ml_commissions mc ON mc."mlOrderId" = o."externalId" AND mc."organizationId" = o."organizationId"
        LEFT JOIN LATERAL (
          SELECT json_agg(json_build_object(
            'name', p.name,
            -- Sesion 22: si p.sku esta vacio, para VTEX usamos externalId
            -- (que es el SKU id numerico de VTEX, valido como identificador).
            -- Para MELI no, porque externalId es MLA listing id (no util).
            'sku', COALESCE(
              NULLIF(p.sku, ''),
              CASE WHEN o.source = 'VTEX' THEN NULLIF(p."externalId", '') ELSE NULL END
            ),
            'imageUrl', COALESCE(
              p."imageUrl",
              mll."thumbnailUrl",
              -- Sesion 22: cuando la orden MELI no tiene imagen propia,
              -- buscar un producto hermano con el mismo SKU (tipicamente
              -- el del catalogo VTEX, que siempre tiene imagen).
              (SELECT p2."imageUrl" FROM products p2
               WHERE p2."organizationId" = o."organizationId"
                 AND p2.sku IS NOT NULL AND p2.sku != ''
                 AND p2.sku = p.sku AND p2.id != p.id
                 AND p2."imageUrl" IS NOT NULL AND p2."imageUrl" != ''
               LIMIT 1)
            ),
            'brand', COALESCE(p.brand,
              (SELECT p2.brand FROM products p2
               WHERE p2."organizationId" = o."organizationId"
                 AND p2.sku IS NOT NULL AND p2.sku != ''
                 AND p2.sku = p.sku AND p2.id != p.id
                 AND p2.brand IS NOT NULL
               LIMIT 1)),
            'quantity', oi.quantity,
            'unitPrice', oi."unitPrice",
            'totalPrice', oi."totalPrice",
            'costPrice', COALESCE(oi."costPrice", p."costPrice",
              (SELECT p2."costPrice" FROM products p2
               WHERE p2."organizationId" = o."organizationId"
                 AND p2.sku IS NOT NULL AND p2.sku != ''
                 AND p2.sku = p.sku AND p2.id != p.id
                 AND p2."costPrice" IS NOT NULL AND p2."costPrice" > 0
               LIMIT 1))
          ))::text AS items_json
          FROM order_items oi
          LEFT JOIN products p ON p.id = oi."productId"
          LEFT JOIN ml_listings mll ON mll."mlItemId" = p."externalId" AND mll."organizationId" = o."organizationId"
          WHERE oi."orderId" = o.id
        ) items_agg ON true
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."orderDate" >= $1
          AND o."orderDate" <= $2
          ${srcWhere}
        ORDER BY o."orderDate" DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `, dateFrom, dateTo),
    ]);

    // ── BATCH 5: Cancelled + prevDaily (2 queries) ──
    const [
      cancelledResult,
      prevDailySales,
    ] = await Promise.all([

      /* 11) Cancelled count */
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
    ]);

    // ── BATCH 5b: Promotions (1 query, resilient) ──
    const [promotionBreakdown] = await Promise.all([
      /* 13) Promotion breakdown — with source for "Sin promo" distinction */
      safeQuery(prisma.$queryRawUnsafe<Array<{
        promo: string;
        source: string;
        orders: string;
        revenue: string;
      }>>(`
        SELECT
          COALESCE(NULLIF(TRIM("promotionNames"), ''), 'Sin promo') AS promo,
          COALESCE("source", 'VTEX') AS source,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1 AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          ${srcWhereSimple}
        GROUP BY COALESCE(NULLIF(TRIM("promotionNames"), ''), 'Sin promo'), COALESCE("source", 'VTEX')
        ORDER BY SUM("totalValue") DESC
        LIMIT 15
      `, dateFrom, dateTo), [] as any[], "promotions"),
    ]);

    // ── BATCH 6: Pagination count + source counts (2 queries) ──
    const [
      totalCountResult,
      sourceCountsRaw,
    ] = await Promise.all([

      /* 14) Total count for pagination */
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
    ]);

    // ── BATCH 7a: Cohorts + profitability (2 queries, resilient) ──
    const [
      cohortsRaw,
      profitabilityRaw,
    ] = await Promise.all([

      /* 16) Cohorts — new / returning / VIP / anonymous (split by source) */
      safeQuery(prisma.$queryRawUnsafe<Array<{
        cohort: string; customers: string; orders: string; revenue: string;
      }>>(`
        WITH customer_history AS (
          SELECT
            o."customerId",
            COALESCE(o."source", 'VTEX') AS src,
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
          GROUP BY o."customerId", o."source", first_order.first_date
        ),
        classified AS (
          SELECT
            CASE
              WHEN "customerId" IS NULL THEN CONCAT('anonymous_', src)
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
      `, dateFrom, dateTo), [] as any[], "cohorts"),

      /* 17) Profitability — gross, COGS, net, margin */
      safeQuery(prisma.$queryRawUnsafe<[{
        gross_revenue: string; gross_with_cost: string; gross_without_cost: string;
        total_cogs: string; orders_with_cost: string; orders_total: string;
      }]>(`
        WITH item_costs AS (
          SELECT oi."orderId", oi."totalPrice", oi.quantity,
            COALESCE(oi."costPrice", p."costPrice",
              (SELECT p2."costPrice" FROM products p2
               WHERE p2."organizationId" = o."organizationId"
                 AND p2.sku IS NOT NULL AND p2.sku != ''
                 AND p2.sku = p.sku AND p2.id != p.id
                 AND p2."costPrice" IS NOT NULL AND p2."costPrice" > 0
               LIMIT 1)
            ) AS effective_cost
          FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          LEFT JOIN products p ON p.id = oi."productId"
          WHERE o."organizationId" = '${ORG_ID}'
            AND o."orderDate" >= $1 AND o."orderDate" <= $2
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            ${srcWhere}
        )
        SELECT
          COALESCE(SUM("totalPrice"), 0)::text AS gross_revenue,
          COALESCE(SUM(CASE WHEN effective_cost IS NOT NULL AND effective_cost > 0 THEN "totalPrice" ELSE 0 END), 0)::text AS gross_with_cost,
          COALESCE(SUM(CASE WHEN effective_cost IS NULL OR effective_cost = 0 THEN "totalPrice" ELSE 0 END), 0)::text AS gross_without_cost,
          COALESCE(SUM(CASE WHEN effective_cost IS NOT NULL AND effective_cost > 0 THEN quantity * effective_cost ELSE 0 END), 0)::text AS total_cogs,
          COUNT(DISTINCT CASE WHEN effective_cost IS NOT NULL AND effective_cost > 0 THEN "orderId" END)::text AS orders_with_cost,
          COUNT(DISTINCT "orderId")::text AS orders_total
        FROM item_costs
      `, dateFrom, dateTo), [{ gross_revenue: "0", gross_with_cost: "0", gross_without_cost: "0", total_cogs: "0", orders_with_cost: "0", orders_total: "0" }] as any, "profitability"),
    ]);

    // ── BATCH 7b: Logistics by delivery (1 query, resilient) ──
    const [logisticsByDelivery] = await Promise.all([
      /* 18) Logistics — by delivery type */
      safeQuery(prisma.$queryRawUnsafe<Array<{
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
      `, dateFrom, dateTo), [] as any[], "logistics-delivery"),
    ]);

    // ── BATCH 8a: Logistics + device (2 queries, resilient) ──
    const [
      logisticsByCarrier,
      segByDevice,
    ] = await Promise.all([

      /* 19) Logistics — by carrier */
      safeQuery(prisma.$queryRawUnsafe<Array<{
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
      `, dateFrom, dateTo), [] as any[], "logistics-carrier"),

      /* 20) Segmentation — by device (enriched from NitroPixel when order field is NULL) */
      safeQuery(prisma.$queryRawUnsafe<Array<{
        bucket: string; orders: string; revenue: string;
      }>>(`
        WITH order_device AS (
          SELECT DISTINCT ON (o.id)
            o.id,
            o."totalValue",
            COALESCE(
              o."deviceType",
              pv."deviceTypes"[1]
            ) AS device
          FROM orders o
          LEFT JOIN pixel_attributions pa ON pa."orderId" = o.id
          LEFT JOIN pixel_visitors pv ON pv.id = pa."visitorId"
          WHERE o."organizationId" = '${ORG_ID}'
            AND o."orderDate" >= $1 AND o."orderDate" <= $2
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            ${srcWhere}
          ORDER BY o.id, pa."createdAt" DESC NULLS LAST
        )
        SELECT
          COALESCE(device, 'Sin dato') AS bucket,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM order_device
        GROUP BY device
        ORDER BY COUNT(*) DESC
      `, dateFrom, dateTo), [] as any[], "seg-device"),
    ]);

    // ── BATCH 8b: Channel segmentation (1 query, resilient) ──
    const [segByChannel] = await Promise.all([
      /* 21) Segmentation — by channel */
      safeQuery(prisma.$queryRawUnsafe<Array<{
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
      `, dateFrom, dateTo), [] as any[], "seg-channel"),
    ]);

    // ── BATCH 9: Traffic + coupons (2 queries, resilient) ──
    const [
      segByTraffic,
      couponsRaw,
    ] = await Promise.all([

      /* 22) Segmentation — by traffic source (enriched from NitroPixel touchpoints) */
      safeQuery(prisma.$queryRawUnsafe<Array<{
        bucket: string; orders: string; revenue: string;
      }>>(`
        WITH order_traffic AS (
          SELECT DISTINCT ON (o.id)
            o.id,
            o."totalValue",
            COALESCE(
              o."trafficSource",
              (pa.touchpoints::jsonb->0->>'source')
            ) AS traffic_src
          FROM orders o
          LEFT JOIN pixel_attributions pa ON pa."orderId" = o.id
          WHERE o."organizationId" = '${ORG_ID}'
            AND o."orderDate" >= $1 AND o."orderDate" <= $2
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            ${srcWhere}
          ORDER BY o.id, pa."createdAt" DESC NULLS LAST
        )
        SELECT
          COALESCE(traffic_src, 'Sin dato') AS bucket,
          COUNT(*)::text AS orders,
          COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM order_traffic
        GROUP BY traffic_src
        ORDER BY COUNT(*) DESC
      `, dateFrom, dateTo), [] as any[], "seg-traffic"),

      /* 23) Coupons — top coupon codes */
      safeQuery(prisma.$queryRawUnsafe<Array<{
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
      `, dateFrom, dateTo), [] as any[], "coupons"),
    ]);

    // ── BATCH 10: Geography (2 queries, resilient) ──
    const [
      geoProvinces,
      geoPostalCodes,
    ] = await Promise.all([

      /* 24) Geography — top provinces (first 4 digits of postal code as proxy) */
      safeQuery(prisma.$queryRawUnsafe<Array<{
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
      `, dateFrom, dateTo), [] as any[], "geo-provinces"),

      /* 25) Geography — postal codes (same data, kept separate for type clarity) */
      safeQuery(prisma.$queryRawUnsafe<Array<{
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
      `, dateFrom, dateTo), [] as any[], "geo-postal"),
    ]);

    // ── BATCH 11: MELI catalog breakdown (only when source=MELI, resilient) ──
    const meliCatalogRaw = sourceFilter === "MELI" ? await safeQuery(prisma.$queryRawUnsafe<Array<{
      catalog_type: string; orders: string; revenue: string; units: string;
    }>>(`
      SELECT
        CASE WHEN ml."catalogListing" = true THEN 'Catálogo' ELSE 'Fuera de catálogo' END AS catalog_type,
        COUNT(DISTINCT o.id)::text AS orders,
        COALESCE(SUM(oi."totalPrice"), 0)::text AS revenue,
        SUM(oi.quantity)::text AS units
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      JOIN products p ON p.id = oi."productId"
      LEFT JOIN ml_listings ml ON ml."mlItemId" = p."externalId" AND ml."organizationId" = o."organizationId"
      WHERE o."organizationId" = '${ORG_ID}'
        AND o."orderDate" >= $1 AND o."orderDate" <= $2
        AND o.status NOT IN ('CANCELLED', 'RETURNED')
        AND o."source" = 'MELI'
      GROUP BY CASE WHEN ml."catalogListing" = true THEN 'Catálogo' ELSE 'Fuera de catálogo' END
    `, dateFrom, dateTo), [] as any[], "meli-catalog") : [];

    // ── Process results ──
    const curr = currentPeriod[0];
    const prev = previousPeriod[0];
    const cancelledOrders = Number(cancelledResult[0].cnt);
    const totalOrderCount = Number(totalCountResult[0].cnt);

    const totalOrders = Number(curr.total_orders);
    const totalRevenue = Number(curr.total_revenue);
    const avgTicket = Number(curr.avg_ticket);
    const totalMarketplaceFee = Number((curr as any).total_marketplace_fee || 0);
    const ordersWithFee = Number((curr as any).orders_with_fee || 0);
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
      dailySalesBySource: dailySalesBySource.length > 0 ? dailySalesBySource.map(d => ({
        day: d.day,
        source: d.source,
        orders: Number(d.orders),
        revenue: Number(d.revenue),
      })) : undefined,
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
        method: getPaymentLabel(pm.payment_method, pm.source),
        orders: Number(pm.orders),
        revenue: Number(pm.revenue),
      })),
      statusBreakdown: statusBreakdown.map(s => ({
        status: s.status,
        count: Number(s.count),
      })),

      promotionBreakdown: promotionBreakdown.map(p => ({
        promo: p.promo === "Sin promo" ? `Sin promo (${p.source === "MELI" ? "MELI" : "VTEX"})` : p.promo,
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
      recentOrders: recentOrders.map(formatOrder),
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
        const anonMeli = get("anonymous_MELI");
        const anonVtex = get("anonymous_VTEX");
        const toStats = (r: typeof newC) => ({
          customers: Number(r?.customers || 0),
          orders: Number(r?.orders || 0),
          revenue: Number(r?.revenue || 0),
        });
        const anonMeliStats = toStats(anonMeli);
        const anonVtexStats = toStats(anonVtex);
        return {
          new: toStats(newC),
          returning: toStats(ret),
          vip: { customers: 0, orders: 0, revenue: 0 },
          anonymous: {
            customers: anonMeliStats.customers + anonVtexStats.customers,
            orders: anonMeliStats.orders + anonVtexStats.orders,
            revenue: anonMeliStats.revenue + anonVtexStats.revenue,
          },
          anonymousMeli: anonMeliStats.orders > 0 ? anonMeliStats : undefined,
          anonymousVtex: anonVtexStats.orders > 0 ? anonVtexStats : undefined,
          vipCriteria: { minOrders: 5, minSpentArs: 500000, description: "5+ compras o $500k+ gastados" },
          mlPrivacyNote: anonMeliStats.orders > 0 ? "MercadoLibre no comparte datos del comprador" : undefined,
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
        // MELI: real net = gross - marketplace fee - |shipping|.
        // Note: shippingCost is stored as NEGATIVE, so we use Math.abs.
        const totalShippingAbs = Math.abs(Number(curr.total_shipping));
        const realNetRevenue = sourceFilter === "MELI"
          ? totalRevenue - totalMarketplaceFee - totalShippingAbs
          : netRevenue;
        const feeCoveragePct = totalOrders > 0 ? (ordersWithFee / totalOrders) * 100 : 0;
        return {
          grossRevenue,
          grossWithCost: grossWithCost > 0 ? grossWithCost : undefined,
          grossWithoutCost: grossWithoutCost > 0 ? grossWithoutCost : undefined,
          netRevenue,
          realNetRevenue: Math.round(realNetRevenue),
          totalMarketplaceFee,
          feeCoveragePct: Math.round(feeCoveragePct * 10) / 10,
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
      meliCatalog: meliCatalogRaw.length > 0 ? meliCatalogRaw.map(r => ({
        type: r.catalog_type,
        orders: Number(r.orders),
        revenue: Number(r.revenue),
        units: Number(r.units),
      })) : undefined,
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
        compMode,
        compOffset,
        compFrom: prevFrom.toISOString(),
        compTo: prevTo.toISOString(),
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

// enrichRecentOrders moved to /api/metrics/orders/enrich route

function formatOrder(o: any) {
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
    discountValue: Number(o.discount_value),
    shippingCost: Number(o.shipping_cost),
    channel: o.channel || null,
    deliveryType: o.delivery_type || null,
    shippingCarrier: o.shipping_carrier || null,
    pickupStoreName: o.pickup_store_name || null,
    realShippingCost: Number(o.real_shipping_cost) || 0,
    mlCommissionAmount: Number(o.ml_commission_amount) || 0,
    mlCommissionRate: Number(o.ml_commission_rate) || 0,
    mlTaxWithholdings: Number(o.ml_tax_withholdings) || 0,
    mlNetAmount: Number(o.ml_net_amount) || 0,
  };
}
