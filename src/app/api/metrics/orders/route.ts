// ══════════════════════════════════════════════════════════════
// Orders API — Dashboard de Órdenes
// ══════════════════════════════════════════════════════════════
// Returns order metrics with flexible date range and source filter
// GET /api/metrics/orders?from=2025-01-01&to=2025-12-31&source=VTEX
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const revalidate = 300;
const ORG_ID = "cmmmga1uq0000sb43w0krvvys";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Auto-migrate: add source column if it doesn't exist
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
    if (!migrated) {
      await ensureSourceColumn();
      migrated = true;
    }
    const { searchParams } = new URL(request.url);

    // ── Parse date range (defaults to last 30 days) ──
    const now = new Date();
    const toParam = searchParams.get("to");
    const fromParam = searchParams.get("from");
    const dateTo = toParam ? new Date(toParam + "T23:59:59.999Z") : now;
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00.000Z")
      : new Date(now.getTime() - 30 * MS_PER_DAY);

    // ── Source filter (VTEX, MELI, or ALL) ──
    const sourceParam = searchParams.get("source")?.toUpperCase();
    const sourceFilter = sourceParam && sourceParam !== "ALL" ? sourceParam : null;

    // ── Calculate previous period for comparison ──
    const periodMs = dateTo.getTime() - dateFrom.getTime();
    const prevFrom = new Date(dateFrom.getTime() - periodMs);
    const prevTo = new Date(dateFrom.getTime() - 1);

    // Build WHERE clause fragments for raw queries
    const sourceWhere = sourceFilter ? `AND "source" = '${sourceFilter}'` : "";

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

      /* 1) Current period KPIs */
      prisma.$queryRawUnsafe<[{
        total_orders: bigint;
        total_revenue: number;
        avg_ticket: number;
        total_items: bigint;
        total_shipping: number;
        total_discounts: number;
        cancelled_orders: bigint;
      }]>(`
        SELECT
          COUNT(*) FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED'))::bigint AS total_orders,
          COALESCE(SUM("totalValue") FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED')), 0) AS total_revenue,
          COALESCE(AVG("totalValue") FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED')), 0) AS avg_ticket,
          COALESCE(SUM("itemCount") FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED')), 0)::bigint AS total_items,
          COALESCE(SUM("shippingCost") FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED')), 0) AS total_shipping,
          COALESCE(SUM("discountValue") FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED')), 0) AS total_discounts,
          COUNT(*) FILTER (WHERE status IN ('CANCELLED', 'RETURNED'))::bigint AS cancelled_orders
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          ${sourceWhere}
      `, dateFrom, dateTo),

      /* 2) Previous period KPIs (for comparison) */
      prisma.$queryRawUnsafe<[{
        total_orders: bigint;
        total_revenue: number;
        avg_ticket: number;
      }]>(`
        SELECT
          COUNT(*) FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED'))::bigint AS total_orders,
          COALESCE(SUM("totalValue") FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED')), 0) AS total_revenue,
          COALESCE(AVG("totalValue") FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED')), 0) AS avg_ticket
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          ${sourceWhere}
      `, prevFrom, prevTo),

      /* 3) Daily sales for the chart */
      prisma.$queryRawUnsafe<Array<{
        day: string;
        orders: bigint;
        revenue: number;
        items: bigint;
      }>>(`
        SELECT
          TO_CHAR("orderDate", 'YYYY-MM-DD') AS day,
          COUNT(*) FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED'))::bigint AS orders,
          COALESCE(SUM("totalValue") FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED')), 0) AS revenue,
          COALESCE(SUM("itemCount") FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED')), 0)::bigint AS items
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          ${sourceWhere}
        GROUP BY TO_CHAR("orderDate", 'YYYY-MM-DD')
        ORDER BY day ASC
      `, dateFrom, dateTo),

      /* 4) Sales by day of week */
      prisma.$queryRawUnsafe<Array<{
        day_of_week: number;
        orders: bigint;
        revenue: number;
      }>>(`
        SELECT
          EXTRACT(DOW FROM "orderDate")::int AS day_of_week,
          COUNT(*) FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED'))::bigint AS orders,
          COALESCE(SUM("totalValue") FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED')), 0) AS revenue
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          ${sourceWhere}
        GROUP BY EXTRACT(DOW FROM "orderDate")
        ORDER BY day_of_week
      `, dateFrom, dateTo),

      /* 5) Sales by hour of day */
      prisma.$queryRawUnsafe<Array<{
        hour: number;
        orders: bigint;
        revenue: number;
      }>>(`
        SELECT
          EXTRACT(HOUR FROM "orderDate")::int AS hour,
          COUNT(*) FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED'))::bigint AS orders,
          COALESCE(SUM("totalValue") FILTER (WHERE status NOT IN ('CANCELLED', 'RETURNED')), 0) AS revenue
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          ${sourceWhere}
        GROUP BY EXTRACT(HOUR FROM "orderDate")
        ORDER BY hour
      `, dateFrom, dateTo),

      /* 6) Top payment methods */
      prisma.$queryRawUnsafe<Array<{
        payment_method: string;
        orders: bigint;
        revenue: number;
      }>>(`
        SELECT
          COALESCE("paymentMethod", 'Sin dato') AS payment_method,
          COUNT(*)::bigint AS orders,
          COALESCE(SUM("totalValue"), 0) AS revenue
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          AND status NOT IN ('CANCELLED', 'RETURNED')
          ${sourceWhere}
        GROUP BY "paymentMethod"
        ORDER BY revenue DESC
        LIMIT 10
      `, dateFrom, dateTo),

      /* 7) Status breakdown */
      prisma.$queryRawUnsafe<Array<{
        status: string;
        count: bigint;
      }>>(`
        SELECT
          status,
          COUNT(*)::bigint AS count
        FROM orders
        WHERE "organizationId" = '${ORG_ID}'
          AND "orderDate" >= $1
          AND "orderDate" <= $2
          ${sourceWhere}
        GROUP BY status
        ORDER BY count DESC
      `, dateFrom, dateTo),

      /* 8) Top products by revenue */
      prisma.$queryRawUnsafe<Array<{
        product_id: string;
        product_name: string;
        brand: string;
        category: string;
        units_sold: bigint;
        revenue: number;
        orders: bigint;
      }>>(`
        SELECT
          p.id AS product_id,
          p.name AS product_name,
          COALESCE(p.brand, 'Sin marca') AS brand,
          COALESCE(p.category, 'Sin categoría') AS category,
          SUM(oi.quantity)::bigint AS units_sold,
          SUM(oi."totalPrice") AS revenue,
          COUNT(DISTINCT o.id)::bigint AS orders
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        JOIN products p ON p.id = oi."productId"
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."orderDate" >= $1
          AND o."orderDate" <= $2
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          ${sourceWhere.replace(/"source"/g, 'o."source"')}
        GROUP BY p.id, p.name, p.brand, p.category
        ORDER BY revenue DESC
        LIMIT 15
      `, dateFrom, dateTo),

      /* 9) Top customers */
      prisma.$queryRawUnsafe<Array<{
        customer_id: string;
        customer_name: string;
        email: string;
        total_orders: bigint;
        total_spent: number;
      }>>(`
        SELECT
          c.id AS customer_id,
          CONCAT(COALESCE(c."firstName", ''), ' ', COALESCE(c."lastName", '')) AS customer_name,
          COALESCE(c.email, 'Sin email') AS email,
          COUNT(o.id)::bigint AS total_orders,
          SUM(o."totalValue") AS total_spent
        FROM orders o
        JOIN customers c ON c.id = o."customerId"
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."orderDate" >= $1
          AND o."orderDate" <= $2
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          ${sourceWhere.replace(/"source"/g, 'o."source"')}
        GROUP BY c.id, c."firstName", c."lastName", c.email
        ORDER BY total_spent DESC
        LIMIT 10
      `, dateFrom, dateTo),

      /* 10) Recent orders (last 50) */
      prisma.$queryRawUnsafe<Array<{
        id: string;
        external_id: string;
        status: string;
        total_value: number;
        item_count: number;
        payment_method: string;
        source: string;
        order_date: string;
        customer_name: string;
      }>>(`
        SELECT
          o.id,
          o."externalId" AS external_id,
          o.status,
          o."totalValue" AS total_value,
          o."itemCount" AS item_count,
          COALESCE(o."paymentMethod", '-') AS payment_method,
          COALESCE(o."source", 'VTEX') AS source,
          TO_CHAR(o."orderDate", 'YYYY-MM-DD HH24:MI') AS order_date,
          CONCAT(COALESCE(c."firstName", ''), ' ', COALESCE(c."lastName", '')) AS customer_name
        FROM orders o
        LEFT JOIN customers c ON c.id = o."customerId"
        WHERE o."organizationId" = '${ORG_ID}'
          AND o."orderDate" >= $1
          AND o."orderDate" <= $2
          ${sourceWhere.replace(/"source"/g, 'o."source"')}
        ORDER BY o."orderDate" DESC
        LIMIT 50
      `, dateFrom, dateTo),
    ]);

    // ── Process results ──
    const curr = currentPeriod[0];
    const prev = previousPeriod[0];

    const totalOrders = Number(curr.total_orders);
    const totalRevenue = Number(curr.total_revenue);
    const avgTicket = Number(curr.avg_ticket);
    const cancelledOrders = Number(curr.cancelled_orders);
    const cancellationRate = totalOrders + cancelledOrders > 0
      ? (cancelledOrders / (totalOrders + cancelledOrders)) * 100
      : 0;

    const prevTotalOrders = Number(prev.total_orders);
    const prevTotalRevenue = Number(prev.total_revenue);
    const prevAvgTicket = Number(prev.avg_ticket);

    const pctChange = (curr: number, prev: number) =>
      prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;

    // Day of week names in Spanish
    const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

    return NextResponse.json({
      kpis: {
        totalOrders,
        totalRevenue,
        avgTicket,
        totalItems: Number(curr.total_items),
        totalShipping: Number(curr.total_shipping),
        totalDiscounts: Number(curr.total_discounts),
        cancellationRate: Math.round(cancellationRate * 10) / 10,
        cancelledOrders,
        changes: {
          orders: Math.round(pctChange(totalOrders, prevTotalOrders) * 10) / 10,
          revenue: Math.round(pctChange(totalRevenue, prevTotalRevenue) * 10) / 10,
          avgTicket: Math.round(pctChange(avgTicket, prevAvgTicket) * 10) / 10,
        },
      },
      dailySales: dailySales.map(d => ({
        day: d.day,
        orders: Number(d.orders),
        revenue: Number(d.revenue),
        items: Number(d.items),
      })),
      salesByDayOfWeek: salesByDayOfWeek.map(d => ({
        dayName: dayNames[d.day_of_week] || `Día ${d.day_of_week}`,
        dayOfWeek: d.day_of_week,
        orders: Number(d.orders),
        revenue: Number(d.revenue),
      })),
      salesByHour: salesByHour.map(h => ({
        hour: h.hour,
        label: `${h.hour}:00`,
        orders: Number(h.orders),
        revenue: Number(h.revenue),
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
      topProducts: topProducts.map(p => ({
        id: p.product_id,
        name: p.product_name,
        brand: p.brand,
        category: p.category,
        unitsSold: Number(p.units_sold),
        revenue: Number(p.revenue),
        orders: Number(p.orders),
      })),
      topCustomers: topCustomers.map(c => ({
        id: c.customer_id,
        name: c.customer_name.trim() || "Sin nombre",
        email: c.email,
        totalOrders: Number(c.total_orders),
        totalSpent: Number(c.total_spent),
      })),
      recentOrders: recentOrders.map(o => ({
        id: o.id,
        externalId: o.external_id,
        status: o.status,
        totalValue: Number(o.total_value),
        itemCount: Number(o.item_count),
        paymentMethod: o.payment_method,
        source: o.source,
        orderDate: o.order_date,
        customerName: o.customer_name.trim() || "Sin nombre",
      })),
      meta: {
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        source: sourceFilter || "ALL",
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
