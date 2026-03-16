// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Products API v3: Trend Data + Stock Intelligence
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Extends v2 with:
// - Weekly sales by product (60 days) for sparklines + WoW
// - Stock health predictions (days of stock, stockout date)
// - ABC classification
// - Dead stock detection
// - Category/brand weekly trends for area charts
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const revalidate = 300; // CDN cache 5 min
const ORG_ID = "cmmmga1uq0000sb43w0krvvys";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * MS_PER_DAY);

    /* â”€â”€ Run ALL 6 queries in PARALLEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    const [
      orderTotals,
      ordersWithItems,
      productStats,
      stockMeta,
      weeklyTrendRaw,
      lastSaleDatesRaw,
    ] = await Promise.all([
      /* 1) Aggregate order totals â€” 30 days */
      prisma.$queryRaw<
        [{ total_orders: bigint; total_units: bigint; total_revenue: number }]
      >`
        SELECT
          COUNT(*)::bigint                       AS total_orders,
          SUM(COALESCE("itemCount", 1))::bigint  AS total_units,
          SUM("totalValue")                      AS total_revenue
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

      /* 3) Product aggregation â€” 30 days (same as v2) */
      prisma.$queryRaw<
        {
          id: string;
          name: string;
          sku: string | null;
          imageUrl: string | null;
          category: string | null;
          brand: string | null;
          stock: number | null;
          unitsSold: bigint;
          revenue: number;
          orders: bigint;
        }[]
      >`
        SELECT
          oi."productId"                          AS id,
          COALESCE(p.name, 'Sin nombre')          AS name,
          p.sku,
          p."imageUrl"                            AS "imageUrl",
          p.category,
          p.brand,
          p.stock,
          SUM(oi.quantity)::bigint                AS "unitsSold",
          ROUND(SUM(oi."totalPrice")::numeric)    AS revenue,
          COUNT(DISTINCT oi."orderId")::bigint    AS orders
        FROM order_items oi
        JOIN orders o ON oi."orderId" = o.id
        LEFT JOIN products p ON oi."productId" = p.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o."orderDate"    >= ${thirtyDaysAgo}
          AND o.status NOT IN ('CANCELLED')
        GROUP BY oi."productId", p.name, p.sku, p."imageUrl", p.category, p.brand, p.stock
        ORDER BY SUM(oi."totalPrice") DESC
      `,

      /* 4) Stock sync freshness */
      prisma.$queryRaw<[{ max_stock_updated: Date | null; total_active: bigint }]>`
        SELECT
          MAX("stockUpdatedAt") AS max_stock_updated,
          COUNT(*)::bigint AS total_active
        FROM products
        WHERE "organizationId" = ${ORG_ID} AND "isActive" = true
      `,

      /* 5) NEW: Weekly sales by product â€” 60 days */
      prisma.$queryRaw<
        {
          productId: string;
          week_start: Date;
          units: bigint;
          revenue: number;
          orders: bigint;
        }[]
      >`
        SELECT
          oi."productId"                              AS "productId",
          date_trunc('week', o."orderDate")::date     AS week_start,
          SUM(oi.quantity)::bigint                     AS units,
          ROUND(SUM(oi."totalPrice")::numeric)         AS revenue,
          COUNT(DISTINCT oi."orderId")::bigint         AS orders
        FROM order_items oi
        JOIN orders o ON oi."orderId" = o.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${sixtyDaysAgo}
          AND o.status NOT IN ('CANCELLED')
        GROUP BY oi."productId", date_trunc('week', o."orderDate")
        ORDER BY date_trunc('week', o."orderDate")
      `,

      /* 6) NEW: Last sale date per product */
      prisma.$queryRaw<
        { productId: string; lastSaleDate: Date }[]
      >`
        SELECT
          oi."productId"        AS "productId",
          MAX(o."orderDate")    AS "lastSaleDate"
        FROM order_items oi
        JOIN orders o ON oi."orderId" = o.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o.status NOT IN ('CANCELLED')
        GROUP BY oi."productId"
      `,
    ]);

    /* â”€â”€ Unpack order totals (v2 compatible) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    const row = orderTotals[0];
    const totalOrders = Number(row.total_orders);
    const estimatedTotalUnits = Number(row.total_units) || totalOrders;
    const estimatedTotalRevenue = Math.round(Number(row.total_revenue) || 0);
    const processedPct =
      totalOrders > 0
        ? Math.round((ordersWithItems / totalOrders) * 100)
        : 0;

    /* â”€â”€ Stock sync freshness â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    const stockRow = stockMeta[0];
    const stockSyncedAt = stockRow?.max_stock_updated
      ? new Date(stockRow.max_stock_updated).toISOString()
      : null;
    const totalActiveProducts = Number(stockRow?.total_active || 0);

    /* â”€â”€ Build weekly trend lookup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    const trendMap = new Map<
      string,
      { weekStart: string; units: number; revenue: number; orders: number }[]
    >();
    for (const r of weeklyTrendRaw) {
      const pid = r.productId;
      if (!trendMap.has(pid)) trendMap.set(pid, []);
      trendMap.get(pid)!.push({
        weekStart: new Date(r.week_start).toISOString().slice(0, 10),
        units: Number(r.units),
        revenue: Number(r.revenue),
        orders: Number(r.orders),
      });
    }

    /* â”€â”€ Build last sale lookup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    const lastSaleMap = new Map<string, Date>();
    for (const r of lastSaleDatesRaw) {
      lastSaleMap.set(r.productId, new Date(r.lastSaleDate));
    }

    /* â”€â”€ Collect all unique weeks for chart x-axis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    const allWeeks = [
      ...new Set(
        weeklyTrendRaw.map((r) =>
          new Date(r.week_start).toISOString().slice(0, 10)
        )
      ),
    ].sort();

    /* â”€â”€ Get week boundaries for WoW calc â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    const dayOfWeek = now.getDay(); // 0=Sun
    const currentWeekStart = new Date(now.getTime() - dayOfWeek * MS_PER_DAY);
    currentWeekStart.setHours(0, 0, 0, 0);
    const prevWeekStart = new Date(currentWeekStart.getTime() - 7 * MS_PER_DAY);
    const currentWeekStr = currentWeekStart.toISOString().slice(0, 10);
    const prevWeekStr = prevWeekStart.toISOString().slice(0, 10);

    /* â”€â”€ Map products with trend + stock intelligence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    let cumulativeRevenue = 0;
    const totalRevenue30d = productStats.reduce(
      (s, p) => s + Number(p.revenue),
      0
    );

    const products = productStats.map((p) => {
      const units = Number(p.unitsSold);
      const rev = Number(p.revenue);
      const stock = p.stock != null ? Number(p.stock) : null;

      // ABC classification (products come sorted by revenue DESC)
      cumulativeRevenue += rev;
      const cumPct = totalRevenue30d > 0 ? (cumulativeRevenue / totalRevenue30d) * 100 : 0;
      let abcClass: "A" | "B" | "C" = "C";
      if (cumPct <= 80) abcClass = "A";
      else if (cumPct <= 95) abcClass = "B";

      // Daily sales rate
      const dailySalesRate = units / 30;

      // Days of stock
      const daysOfStock =
        stock != null && dailySalesRate > 0
          ? Math.round(stock / dailySalesRate)
          : null;

      // Stockout date
      const stockoutDate =
        daysOfStock != null
          ? new Date(now.getTime() + daysOfStock * MS_PER_DAY)
              .toISOString()
              .slice(0, 10)
          : null;

      // Stock health
      let stockHealth: "critical" | "low" | "optimal" | "excessive" | "no_data" =
        "no_data";
      if (daysOfStock != null) {
        if (daysOfStock < 7) stockHealth = "critical";
        else if (daysOfStock < 14) stockHealth = "low";
        else if (daysOfStock <= 90) stockHealth = "optimal";
        else stockHealth = "excessive";
      }

      // Dead stock
      const lastSale = lastSaleMap.get(p.id);
      const daysSinceLastSale = lastSale
        ? Math.round((now.getTime() - lastSale.getTime()) / MS_PER_DAY)
        : null;
      const isDead =
        stock != null &&
        stock > 0 &&
        (daysSinceLastSale === null || daysSinceLastSale > 30);

      // Weekly trend data
      const weeklyData = trendMap.get(p.id) || [];

      // WoW calc
      const curW = weeklyData.find((w) => w.weekStart === currentWeekStr);
      const prvW = weeklyData.find((w) => w.weekStart === prevWeekStr);
      const curUnits = curW?.units || 0;
      const prvUnits = prvW?.units || 0;
      const curRev = curW?.revenue || 0;
      const prvRev = prvW?.revenue || 0;

      const wowUnitsPct =
        prvUnits > 0
          ? Math.round(((curUnits - prvUnits) / prvUnits) * 100)
          : curUnits > 0
          ? 100
          : 0;

      const wowRevenuePct =
        prvRev > 0
          ? Math.round(((curRev - prvRev) / prvRev) * 100)
          : curRev > 0
          ? 100
          : 0;

      return {
        // â”€â”€ v2 compatible fields â”€â”€
        id: p.id || "unknown",
        name: p.name,
        sku: p.sku || null,
        imageUrl: p.imageUrl || null,
        category: p.category || null,
        brand: p.brand || null,
        stock,
        unitsSold: units,
        revenue: Math.round(rev),
        orders: Number(p.orders),
        avgPrice: units > 0 ? Math.round(rev / units) : 0,
        // â”€â”€ NEW: Trend data â”€â”€
        trendData: {
          weeklyData,
          wowUnitsPct,
          wowRevenuePct,
          currentWeekUnits: curUnits,
          prevWeekUnits: prvUnits,
          currentWeekRevenue: curRev,
          prevWeekRevenue: prvRev,
        },
        // â”€â”€ NEW: Stock intelligence â”€â”€
        stockData: {
          dailySalesRate: Math.round(dailySalesRate * 100) / 100,
          daysOfStock,
          stockoutDate,
          stockHealth,
          isDead,
          daysSinceLastSale,
          abcClass,
        },
      };
    });

    /* â”€â”€ v2 compatible aggregates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    const detailedRevenue = products.reduce((s, p) => s + p.revenue, 0);
    const detailedUnits = products.reduce((s, p) => s + p.unitsSold, 0);
    const uniqueProducts = products.length;

    const top20pctCount = Math.max(1, Math.ceil(products.length * 0.2));
    const top20pctRevenue = products
      .slice(0, top20pctCount)
      .reduce((s, p) => s + p.revenue, 0);
    const paretoConcentration =
      detailedRevenue > 0
        ? Math.round((top20pctRevenue / detailedRevenue) * 100)
        : 0;

    // Brands and categories as string arrays (v2 compatible)
    const brands = [
      ...new Set(products.map((p) => p.brand).filter(Boolean) as string[]),
    ].sort();
    const categories = [
      ...new Set(products.map((p) => p.category).filter(Boolean) as string[]),
    ].sort();

    /* â”€â”€ NEW: Stock health summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ $,€)½¹ÍĞÍÑ½­!•…±Ñ¡MÕµµ…Éä€ôì(€€€€€É¥Ñ¥…°èÁÉ½‘ÕÑÌ¹™¥±Ñ•È ¡À¤€ôøÀ¹ÍÑ½­…Ñ„¹ÍÑ½­!•…±Ñ €ôôô€‰É¥Ñ¥…°ˆ¤¹±•¹Ñ °(€€€€€±½ÜèÁÉ½‘ÕÑÌ¹™¥±Ñ•È ¡À¤€ôøÀ¹ÍÑ½­…Ñ„¹ÍÑ½­!•…±Ñ €ôôô€‰±½Üˆ¤¹±•¹Ñ °(€€€€€½ÁÑ¥µ…°èÁÉ½‘ÕÑÌ¹™¥±Ñ•È ¡À¤€ôøÀ¹ÍÑ½­…Ñ„¹ÍÑ½­!•…±Ñ €ôôô€‰½ÁÑ¥µ…°ˆ¤¹±•¹Ñ °(€€€€€•á•ÍÍ¥Ù”èÁÉ½‘ÕÑÌ¹™¥±Ñ•È ¡À¤€ôøÀ¹ÍÑ½­…Ñ„¹ÍÑ½­!•…±Ñ €ôôô€‰•á•ÍÍ¥Ù”ˆ¤¹±•¹Ñ °(€€€€€¹½…Ñ„èÁÉ½‘ÕÑÌ¹™¥±Ñ•È ¡À¤€ôøÀ¹ÍÑ½­…Ñ„¹ÍÑ½­!•…±Ñ €ôôô€‰¹½}‘…Ñ„ˆ¤¹±•¹Ñ °(€€€€€‘•…èÁÉ½‘ÕÑÌ¹™¥±Ñ•È ¡À¤€ôøÀ¹ÍÑ½­…Ñ„¹¥Í•…¤¹±•¹Ñ °(€€€ôì((€€€€¼¨ƒŠRŠR 9\è	ÍÕµµ…ÉäƒŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠR €¨¼(€€€½¹ÍĞ…‰MÕµµ…Éä€ôì(€€€€€èÁÉ½‘ÕÑÌ¹™¥±Ñ•È ¡À¤€ôøÀ¹ÍÑ½­…Ñ„¹…‰±…ÍÌ€ôôô€‰ˆ¤¹±•¹Ñ °(€€€€€èÁÉ½‘ÕÑÌ¹™¥±Ñ•È ¡À¤€ôøÀ¹ÍÑ½­…Ñ„¹…‰±…ÍÌ€ôôô€‰ˆ¤¹±•¹Ñ °(€€€€€èÁÉ½‘ÕÑÌ¹™¥±Ñ•È ¡À¤€ôøÀ¹ÍÑ½­…Ñ„¹…‰±…ÍÌ€ôôô€‰ˆ¤¹±•¹Ñ °(€€€ôì((€€€€¼¨ƒŠRŠR 9\è%¹Ù•¹Ñ½ÉäÙ…±Õ”ƒŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠR €¨¼(€€€½¹ÍĞÑ½Ñ…±%¹Ù•¹Ñ½ÉåU¹¥ÑÌ€ôÁÉ½‘ÕÑÌ¹É•‘Õ” ¡Ì°À¤€ôøÌ€¬€¡À¹ÍÑ½¬ñğ€À¤°€À¤ì(€€€½¹ÍĞÑ½Ñ…±%¹Ù•¹Ñ½ÉåY…±Õ”€ô5…Ñ ¹É½Õ¹ (€€€€€ÁÉ½‘ÕÑÌ¹É•‘Õ” ¡Ì°À¤€ôøÌ€¬€¡À¹ÍÑ½¬ñğ€À¤€¨À¹…ÙAÉ¥”°€À¤(€€€€¤ì((€€€€¼¨ƒŠRŠR 9\èQÉ•¹ÍÕµµ…ÉäƒŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠR  */
    const trendSummary = {
      growing: products.filter((p) => p.trendData.wowRevenuePct > 5).length,
      declining: products.filter((p) => p.trendData.wowRevenuePct < -5).length,
      stable: products.filter(
        (p) =>
          p.trendData.wowRevenuePct >= -5 && p.trendData.wowRevenuePct <= 5
      ).length,
    };

    /* â”€â”€ NEW: Category weekly trend (top 8) for AreaChart â”€â”€ */
    const catWeekMap = new Map<string, Map<string, { units: number; revenue: number }>>();
    for (const p of products) {
      const cat = p.category || "Sin categorÃ­a";
      if (!catWeekMap.has(cat)) catWeekMap.set(cat, new Map());
      const m = catWeekMap.get(cat)!;
      for (const w of p.trendData.weeklyData) {
        const ex = m.get(w.weekStart) || { units: 0, revenue: 0 };
        m.set(w.weekStart, {
          units: ex.units + w.units,
          revenue: ex.revenue + w.revenue,
        });
      }
    }
    const categoryWeeklyTrend = [...catWeekMap.entries()]
      .map(([category, wm]) => ({
        category,
        totalRevenue: [...wm.values()].reduce((s, w) => s + w.revenue, 0),
        weeks: allWeeks.map((ws) => ({
          weekStart: ws,
          ...(wm.get(ws) || { units: 0, revenue: 0 }),
        })),
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 8)
      .map(({ category, weeks }) => ({ category, weeks }));

    /* â”€â”€ NEW: Brand weekly trend (top 8) for AreaChart â”€â”€â”€â”€ */
    const brWeekMap = new Map<string, Map<string, { units: number; revenue: number }>>();
    for (const p of products) {
      const br = p.brand || "Sin marca";
      if (!brWeekMap.has(br)) brWeekMap.set(br, new Map());
      const m = brWeekMap.get(br)!;
      for (const w of p.trendData.weeklyData) {
        const ex = m.get(w.weekStart) || { units: 0, revenue: 0 };
        m.set(w.weekStart, {
          units: ex.units + w.units,
          revenue: ex.revenue + w.revenue,
        });
      }
    }
    const brandWeeklyTrend = [...brWeekMap.entries()]
      .map(([brand, wm]) => ({
        brand,
        totalRevenue: [...wm.values()].reduce((s, w) => s + w.revenue, 0),
        weeks: allWeeks.map((ws) => ({
          weekStart: ws,
          ...(wm.get(ws) || { units: 0, revenue: 0 }),
        })),
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 8)
      .map(({ brand, weeks }) => ({ brand, weeks }));

    return NextResponse.json({
      // â”€â”€ v2 compatible fields â”€â”€
      products,
      brands,
      categories,
      stockSyncedAt,
      totalActiveProducts,
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
      // â”€â”€ NEW: v3 additions â”€â”€
      allWeeks,
      categoryWeeklyTrend,
      brandWeeklyTrend,
      stockHealthSummary,
      abcSummary,
      trendSummary,
      totalInventoryUnits,
      totalInventoryValue,
    });
  } catch (error: any) {
    console.error("[Products API v3] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
enue: ex.revenue + w.revenue,
        });
      }
    }
    const categoryWeeklyTrend = [...catWeekMap.entries()]
      .map(([category, wm]) => ({
        category,
        totalRevenue: [...wm.values()].reduce((s, w) => s + w.revenue, 0),
        weeks: allWeeks.map((ws) => ({
          weekStart: ws,
          ...(wm.get(ws) || { units: 0, revenue: 0 }),
        })),
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 8)
      .map(({ category, weeks }) => ({ category, weeks }));

    /* â”€â”€ NEW: Brand weekly trend (top 8) for AreaChart â”€â”€â”€â”€ */
    const brWeekMap = new Map<string, Map<string, { units: number; revenue: number }>>();
    for (const p of products) {
      const br = p.brand || "Sin marca";
      if (!brWeekMap.has(br)) brWeekMap.set(br, new Map());
      const m = brWeekMap.get(br)!;
      for (const w of p.trendData.weeklyData) {
        const ex = m.get(w.weekStart) || { units: 0, revenue: 0 };
        m.set(w.weekStart, {
          units: ex.units + w.units,
          revenue: ex.revenue + w.revenue,
        });
      }
    }
    const brandWeeklyTrend = [...brWeekMap.entries()]
      .map(([brand, wm]) => ({
        brand,
        totalRevenue: [...wm.values()].reduce((s, w) => s + w.revenue, 0),
        weeks: allWeeks.map((ws) => ({
          weekStart: ws,
          ...(wm.get(ws) || { units: 0, revenue: 0 }),
        })),
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 8)
      .map(({ brand, weeks }) => ({ brand, weeks }));

    return NextResponse.json({
      // â”€â”€ v2 compatible fields â”€â”€
      products,
      brands,
      categories,
      stockSyncedAt,
      totalActiveProducts,
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
      // â”€â”€ NEW: v3 additions â”€â”€
      allWeeks,
      categoryWeeklyTrend,
      brandWeeklyTrend,
      stockHealthSummary,
      abcSummary,
      trendSummary,
      totalInventoryUnits,
      totalInventoryValue,
    });
  } catch (error: any) {
    console.error("[Products API v3] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
