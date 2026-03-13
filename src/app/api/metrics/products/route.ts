import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const revalidate = 300; // CDN cache 5 min, then revalidate in background

const ORG_ID = "cmmmga1uq0000sb43w0krvvys";

export async function GET() {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    /* ── Run all 3 queries in PARALLEL ──────────────────────────── */
    const [orderTotals, ordersWithItems, productStats] = await Promise.all([
      /* 1) Aggregate order totals — single row, no data loaded into JS */
      prisma.$queryRaw<
        [{ total_orders: bigint; total_units: bigint; total_revenue: number }]
      >`
        SELECT
          COUNT(*)::bigint           AS total_orders,
          SUM(COALESCE("itemCount", 1))::bigint AS total_units,
          SUM("totalValue")          AS total_revenue
        FROM orders
        WHERE "organizationId" = ${ORG_ID}
          AND "orderDate" >= ${thirtyDaysAgo}
          AND status NOT IN ('CANCELLED')
      `,

      /* 2) Count orders that have detailed items */
      prisma.order.count({
        where: {
          organizationId: ORG_ID,
          orderDate: { gte: thirtyDaysAgo },
          status: { notIn: ["CANCELLED"] },
          items: { some: {} },
        },
      }),

      /* 3) Product aggregation in SQL — the big win.
         Instead of loading ALL OrderItems + Products into JS,
         the DB does GROUP BY and returns ~one row per product. */
      prisma.$queryRaw<
        {
          id: string;
          name: string;
          sku: string | null;
          imageUrl: string | null;
          category: string | null;
          brand: string | null;
          stock: number | null;
          stockUpdatedAt: Date | null;
          unitsSold: bigint;
          revenue: number;
          orders: bigint;
        }[]
      >`
        SELECT
          oi."productId"                       AS id,
          COALESCE(p.name, 'Sin nombre')       AS name,
          p.sku,
          p."imageUrl"                         AS "imageUrl",
          p.category,
          p.brand,
          p.stock,
          p."stockUpdatedAt"                   AS "stockUpdatedAt",
          SUM(oi.quantity)::bigint              AS "unitsSold",
          ROUND(SUM(oi."totalPrice")::numeric) AS revenue,
          COUNT(DISTINCT oi."orderId")::bigint  AS orders
        FROM order_items oi
        JOIN orders  o ON oi."orderId"   = o.id
        LEFT JOIN products p ON oi."productId" = p.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${thirtyDaysAgo}
          AND o.status NOT IN ('CANCELLED')
        GROUP BY oi."productId", p.name, p.sku, p."imageUrl",
                 p.category, p.brand, p.stock, p."stockUpdatedAt"
        ORDER BY SUM(oi."totalPrice") DESC
      `,
    ]);

    /* ── Unpack order totals ────────────────────────────────────── */
    const row = orderTotals[0];
    const totalOrders = Number(row.total_orders);
    const estimatedTotalUnits = Number(row.total_units) || totalOrders;
    const estimatedTotalRevenue = Math.round(Number(row.total_revenue) || 0);

    const processedPct =
      totalOrders > 0
        ? Math.round((ordersWithItems / totalOrders) * 100)
        : 0;

    /* ── Map product rows (already aggregated by DB) ────────────── */
    const products = productStats.map((p) => {
      const units = Number(p.unitsSold);
      const rev = Number(p.revenue);
      return {
        id: p.id || "unknown",
        name: p.name,
        sku: p.sku || null,
        imageUrl: p.imageUrl || null,
        category: p.category || null,
        brand: p.brand || null,
        stock: p.stock ?? null,
        stockUpdatedAt: p.stockUpdatedAt || null,
        unitsSold: units,
        revenue: Math.round(rev),
        orders: Number(p.orders),
        avgPrice: units > 0 ? Math.round(rev / units) : 0,
      };
    });

    const detailedRevenue = products.reduce((s, p) => s + p.revenue, 0);
    const detailedUnits = products.reduce((s, p) => s + p.unitsSold, 0);
    const uniqueProducts = products.length;

    /* ── Pareto concentration ───────────────────────────────────── */
    const top20pctCount = Math.max(1, Math.ceil(products.length * 0.2));
    const top20pctRevenue = products
      .slice(0, top20pctCount)
      .reduce((s, p) => s + p.revenue, 0);
    const paretoConcentration =
      detailedRevenue > 0
        ? Math.round((top20pctRevenue / detailedRevenue) * 100)
        : 0;

    /* ── Unique brands & categories for filters ─────────────────── */
    const brands = [
      ...new Set(products.map((p) => p.brand).filter(Boolean)),
    ].sort();
    const categories = [
      ...new Set(products.map((p) => p.category).filter(Boolean)),
    ].sort();

    return NextResponse.json({
      products,
      brands,
      categories,
      summary: {
        estimatedTotalUnits,
        estimatedTotalRevenue,
        totalOrders,
        detailedUnits,
        detailedRevenue: Math.round(detailedRevenue),
        uniqueProducts,
        paretoConcentration,
        ordersWithItems,
        processedPct,
        isComplete: processedPct >= 99,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
