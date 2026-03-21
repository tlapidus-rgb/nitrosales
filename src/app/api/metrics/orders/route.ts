// ══════════════════════════════════════════════════════════════
// Orders API v2 — Dashboard de Órdenes (fixed)
// ══════════════════════════════════════════════════════════════
// GET /api/metrics/orders?from=2026-03-01&to=2026-03-16&source=VTEX
// Timezone: Argentina (UTC-3)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const revalidate = 0; // No cache while debugging
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Auto-migrate: add source column if it doesn't exist
async function ensurePromotionColumn() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS "promotionNames" TEXT
    `);
  } catch (e) {
    // Column likely already exists
  }
}

async function ensureSourceColumn() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'VTEX'
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "orders_organizationId_source_orderDate_idx"
      ON orders ("organizationId", "source", "orderDate")
    `);
  } catch (e) {
    // Column likely already exists, ignore
  }
}

let migrated = false;

export async function GET(request: NextRequest) {
  try {
    const ORG_ID = await getOrganizationId();
    if (!migrated) {
      await ensureSourceColumn();
      await ensurePromotionColumn();
      migrated = true;
    }
    const { searchParams } = new URL(request.url);

    // ── Parse date range (defaults to last 30 days, Argentina timezone UTC-3) ──
    const now = new Date();
    const toParam = searchParams.get("to");
    const fromParam = searchParams.get("from");

    // Use Argentina timezone (UTC-3) for date boundaries
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

    // ── Previous period for comparison ──
    const periodMs = dateTo.getTime() - dateFrom.getTime();
    const prevFrom = new Date(dateFrom.getTime() - periodMs);
    const prevTo = new Date(dateFrom.getTime() - 1);

    // ── Build source WHERE fragment (safe: sourceFilter validated against whitelist) ──
    const srcWhere = sourceFilter ? `AND o."source" = '${sourceFilter}'` : "";
    const srcWhereSimple = sourceFilter ? `AND "source" = '${sourceFilter}'` : "";

    // ── Count days in period for averages ──
    const daysInPeriod = Math.max(1, Math.ceil(periodMs / MS_PER_DAY));

    /* ── Run ALL queries in PARALLEL ────────────────────────── */
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
    ] = await Promise.all([

      /* 1) Current period KPIs — simple WHERE, no FILTER */
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

      /* 1b) Cancelled/returned count */
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

      /* 4) Sales by day of week — PROMEDIO diario */
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
            WHEN 3 THEN 'Mié' WHEN 4 THEN 'Jue' WHEN 5 THEN 'Vie'
            WHEN 6 THEN 'Sáb' END AS day_name,
          SUM(orders)::text AS total_orders,
          SUM(revenue)::text AS total_revenue,
          COUNT(*)::text AS num_days
        FROM daily
        GROUP BY dow
        ORDER BY dow
      `, dateFrom, dateTo),

      /* 5) Sales by hour — PROMEDIO por hora */
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

      /* 7) Status breakdown */
      prisma.$queryRawUnsafe<Array<{
        status: string;
        count: string;
      }>>(`
        SELECT
          status,
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
          COALESCE(p.category, 'Sin categoría') AS category,
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

      /* 10) Recent orders with customer names and items */
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
      }>>(`
        SELECT
          o.id,
          o."externalId" AS external_id,
          o.status,
          o."totalValue"::text AS total_value,
          o."itemCount"::text AS item_count,
          COALESCE(o."paymentMethod", '-') AS payment_method,
          COALESCE(o."source", 'VTEX') AS source,
          TO_CHAR(o."orderDate" - INTERVAL '3 hours', 'YYYY-MM-DD HH24:MI') AS order_date,
          TRIM(CONCAT(COALESCE(c."firstName", ''), ' ', COALESCE(c."lastName", ''))) AS customer_name,
          COALESCE(c.email, '') AS customer_email,
          COALESCE(
            (SELECT json_agg(json_build_object(
              'name', p.name,
              'imageUrl', p."imageUrl",
              'quantity', oi.quantity,
              'unitPrice', oi."unitPrice",
              'totalPrice', oi."totalPrice"
            ))
            FROM order_items oi
            LEFT JOIN products p ON p.id = oi."productId"
            WHERE oi."orderId" = o.id),
            '[]'
          )::text AS items_json,
          COALESCE(o."promotionNames", '') AS promotion_names
        FROM orders o
        LEFT JOIN customers c ON c.id = o."customerId"
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."orderDate" >= $1
          AND o."orderDate" <= $2
          ${srcWhere.replace(/o\."source"/g, 'o."source"')}
        ORDER BY o."orderDate" DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `, dateFrom, dateTo),
    ]);

    // ── Process results ──
    const curr = currentPeriod[0];
    const prev = previousPeriod[0];

    // Count cancelled separately
    const cancelledResult = await prisma.$queryRawUnsafe<[{ cnt: string }]>(`
      SELECT COUNT(*)::text AS cnt FROM orders
      WHERE "organizationId" = '${ORG_ID}'
        AND "orderDate" >= $1 AND "orderDate" <= $2
        AND status IN ('CANCELLED', 'RETURNED')
        ${srcWhereSimple}
    `, dateFrom, dateTo);
    const cancelledOrders = Number(cancelledResult[0].cnt);

    // Previous period daily sales for comparison chart
    const prevDailySales = await prisma.$queryRawUnsafe<Array<{
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
    `, prevFrom, prevTo);

    // Promotion breakdown for pie chart
    const promotionBreakdown = await prisma.$queryRawUnsafe<Array<{
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
    `, dateFrom, dateTo);


    // Total orders count (for pagination)
    const totalCountResult = await prisma.$queryRawUnsafe<[{ cnt: string }]>(`
      SELECT COUNT(*)::text AS cnt FROM orders
      WHERE "organizationId" = '${ORG_ID}'
        AND "orderDate" >= $1 AND "orderDate" <= $2
        ${srcWhereSimple}
    `, dateFrom, dateTo);
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

    return NextResponse.json({
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
    });
  } catch (error: any) {
    console.error("Orders API error:", error);
    return NextResponse.json(
      { error: "Error fetching orders data", detail: error.message },
      { status: 500 }
    );
  }
}
