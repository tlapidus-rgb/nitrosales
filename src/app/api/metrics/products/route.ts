import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const revalidate = 300;
const ORG_ID = "cmmmga1uq0000sb43w0krvvys";

type ProductMetrics = {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  category: string | null;
  brand: string | null;
  stock: number | null;
  unitsSold: number;
  revenue: number;
  orders: number;
  avgPrice: number;
  trendData: {
    weeklyTrend: Array<{ weekStart: string; units: number; revenue: number }>;
    wowUnitsPct: number;
    wowRevenuePct: number;
    trendSlope: number;
    abcClass: "A" | "B" | "C";
  };
  stockData: {
    dailySalesRate: number;
    daysOfStock: number | null;
    stockoutDate: string | null;
    stockHealth: "critical" | "low" | "optimal" | "excessive" | null;
    isDead: boolean;
    lastSaleDate: string | null;
  };
};

type StockSummary = {
  criticalCount: number;
  lowCount: number;
  optimalCount: number;
  excessiveCount: number;
  deadCount: number;
  totalStockUnits: number;
  totalStockValue: number;
  productsAtRisk: number;
};

type TrendSummary = {
  growingCount: number;
  decliningCount: number;
  stableCount: number;
};

type BagsAnalytics = {
  totalBagsSold: number;
  bagsRevenue: number;
  currentStock: { grande: number; chica: number; total: number };
  ordersWithBags: number;
  totalOrders: number;
  bagAdoptionPct: number;
  breakdown: Array<{ name: string; unitsSold: number; revenue: number; stock: number | null }>;
};

type APIResponse = {
  products: ProductMetrics[];
  brands: Array<{ name: string; count: number }>;
  categories: Array<{ name: string; count: number }>;
  stockSyncedAt: string;
  totalActiveProducts: number;
  summary: {
    totalOrders30d: number;
    totalItems30d: number;
    totalRevenue30d: number;
  };
  stockSummary: StockSummary;
  trendSummary: TrendSummary;
  bagsAnalytics: BagsAnalytics;
};

export async function GET(): Promise<NextResponse<APIResponse>> {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Execute all 6 queries in parallel
    const [
      orderTotals,
      ordersWithItems,
      productAggregation,
      stockSyncMetadata,
      weeklySalesByProduct,
      lastSaleDateByProduct,
    ] = await Promise.all([
      // Query 1: Order totals (30 days)
      prisma.$queryRaw<
        Array<{
          totalOrders: bigint;
          totalItems: bigint;
          totalRevenue: number;
        }>
      >`
        SELECT
          COUNT(DISTINCT id)::bigint AS "totalOrders",
          SUM("itemCount")::bigint AS "totalItems",
          SUM("totalValue")::numeric AS "totalRevenue"
        FROM orders
        WHERE "organizationId" = ${ORG_ID}
          AND "orderDate" >= ${thirtyDaysAgo}
          AND status NOT IN ('CANCELLED')
      `,

      // Query 2: Orders with items count
      prisma.$queryRaw<
        Array<{
          orderId: string;
          itemCount: number;
        }>
      >`
        SELECT
          id AS "orderId",
          "itemCount"
        FROM orders
        WHERE "organizationId" = ${ORG_ID}
          AND "orderDate" >= ${thirtyDaysAgo}
          AND status NOT IN ('CANCELLED')
      `,

      // Query 3: Product aggregation (30 days)
      prisma.$queryRaw<
        Array<{
          productId: string;
          productName: string;
          sku: string;
          imageUrl: string | null;
          category: string | null;
          brand: string | null;
          stock: number | null;
          units: bigint;
          revenue: number;
          orders: bigint;
        }>
      >`
        SELECT
          oi."productId" AS "productId",
          p.name AS "productName",
          p.sku,
          p."imageUrl",
          p.category,
          p.brand,
          p.stock,
          SUM(oi.quantity)::bigint AS units,
          ROUND(SUM(oi."totalPrice")::numeric) AS revenue,
          COUNT(DISTINCT oi."orderId")::bigint AS orders
        FROM order_items oi
        JOIN orders o ON oi."orderId" = o.id
        JOIN products p ON oi."productId" = p.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${thirtyDaysAgo}
          AND o.status NOT IN ('CANCELLED')
        GROUP BY oi."productId", p.name, p.sku, p."imageUrl", p.category, p.brand, p.stock
      `,

      // Query 4: Stock sync metadata
      prisma.$queryRaw<
        Array<{
          stockUpdatedAt: Date;
          activeProducts: bigint;
        }>
      >`
        SELECT
          MAX("stockUpdatedAt") AS "stockUpdatedAt",
          COUNT(*)::bigint AS "activeProducts"
        FROM products
        WHERE "organizationId" = ${ORG_ID}
          AND stock IS NOT NULL
          AND stock >= 0
      `,

      // Query 5: Weekly sales by product (last 60 days)
      prisma.$queryRaw<
        Array<{
          productId: string;
          weekStart: Date;
          units: bigint;
          revenue: number;
          orders: bigint;
        }>
      >`
        SELECT
          oi."productId" AS "productId",
          date_trunc('week', o."orderDate")::date AS "weekStart",
          SUM(oi.quantity)::bigint AS units,
          ROUND(SUM(oi."totalPrice")::numeric) AS revenue,
          COUNT(DISTINCT oi."orderId")::bigint AS orders
        FROM order_items oi
        JOIN orders o ON oi."orderId" = o.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${sixtyDaysAgo}
          AND o.status NOT IN ('CANCELLED')
        GROUP BY oi."productId", date_trunc('week', o."orderDate")
        ORDER BY date_trunc('week', o."orderDate")
      `,

      // Query 6: Last sale date per product
      prisma.$queryRaw<
        Array<{
          productId: string;
          lastSaleDate: Date;
        }>
      >`
        SELECT
          oi."productId" AS "productId",
          MAX(o."orderDate") AS "lastSaleDate"
        FROM order_items oi
        JOIN orders o ON oi."orderId" = o.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o.status NOT IN ('CANCELLED')
        GROUP BY oi."productId"
      `,
    ]);

    // Extract summary data
    const summary = {
      totalOrders30d: Number(orderTotals[0]?.totalOrders || 0),
      totalItems30d: Number(orderTotals[0]?.totalItems || 0),
      totalRevenue30d: orderTotals[0]?.totalRevenue || 0,
    };

    const stockSyncedAt = stockSyncMetadata[0]?.stockUpdatedAt?.toISOString() || new Date().toISOString();
    const totalActiveProducts = Number(stockSyncMetadata[0]?.activeProducts || 0);

    // Build lookup maps for fast access
    const weeklyTrendMap = new Map<string, Array<{ weekStart: Date; units: bigint; revenue: number }>>();
    weeklySalesByProduct.forEach((row) => {
      const key = row.productId;
      if (!weeklyTrendMap.has(key)) {
        weeklyTrendMap.set(key, []);
      }
      weeklyTrendMap.get(key)!.push({
        weekStart: row.weekStart,
        units: row.units,
        revenue: row.revenue,
      });
    });

    const lastSaleDateMap = new Map<string, Date>();
    lastSaleDateByProduct.forEach((row) => {
      lastSaleDateMap.set(row.productId, row.lastSaleDate);
    });

    // Helper function: linear regression for trend slope
    function calculateTrendSlope(
      weeklyData: Array<{ weekStart: Date; units: bigint; revenue: number }>
    ): number {
      if (weeklyData.length < 2) return 0;

      // Use revenue for trend calculation
      const revenues = weeklyData.map((w) => Number(w.revenue));
      if (revenues.length < 2) return 0;

      const lastFourWeeks = revenues.slice(-4);
      if (lastFourWeeks.length === 0) return 0;

      const first2WeeksAvg = lastFourWeeks.slice(0, Math.ceil(lastFourWeeks.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(lastFourWeeks.length / 2);
      const last2WeeksAvg = lastFourWeeks.slice(Math.ceil(lastFourWeeks.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(lastFourWeeks.length / 2);

      if (first2WeeksAvg === 0) return 0;

      return ((last2WeeksAvg - first2WeeksAvg) / first2WeeksAvg) * 100;
    }

    // Helper function: calculate WoW percentages
    function calculateWoWPct(
      weeklyData: Array<{ weekStart: Date; units: bigint; revenue: number }>,
      field: "units" | "revenue"
    ): number {
      if (weeklyData.length < 2) return 0;

      const sortedWeeks = [...weeklyData].sort((a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime());
      const currentWeek = sortedWeeks[sortedWeeks.length - 1];
      const prevWeek = sortedWeeks[sortedWeeks.length - 2];

      if (!currentWeek || !prevWeek) return 0;

      const currentVal = field === "units" ? Number(currentWeek.units) : currentWeek.revenue;
      const prevVal = field === "units" ? Number(prevWeek.units) : prevWeek.revenue;

      if (prevVal === 0) return 0;

      return ((currentVal - prevVal) / prevVal) * 100;
    }

    // Map products with trend and stock data
    let products: ProductMetrics[] = productAggregation.map((prod) => {
      const weeklyData = weeklyTrendMap.get(prod.productId) || [];
      const unitsSold = Number(prod.units);
      const dailySalesRate = unitsSold / 30;
      const lastSaleDate = lastSaleDateMap.get(prod.productId);

      // Calculate daysOfStock
      let daysOfStock: number | null = null;
      if (prod.stock !== null && dailySalesRate > 0) {
        daysOfStock = prod.stock / dailySalesRate;
      }

      // Calculate stockoutDate
      let stockoutDate: string | null = null;
      if (daysOfStock !== null) {
        const stockoutDateObj = new Date(now.getTime() + daysOfStock * 24 * 60 * 60 * 1000);
        stockoutDate = stockoutDateObj.toISOString();
      }

      // Determine stockHealth
      let stockHealth: "critical" | "low" | "optimal" | "excessive" | null = null;
      if (daysOfStock !== null) {
        if (daysOfStock < 7) {
          stockHealth = "critical";
        } else if (daysOfStock < 14) {
          stockHealth = "low";
        } else if (daysOfStock <= 90) {
          stockHealth = "optimal";
        } else {
          stockHealth = "excessive";
        }
      }

      // Determine isDead
      const isDead = prod.stock !== null && prod.stock > 0 && (unitsSold === 0 || (lastSaleDate && now.getTime() - lastSaleDate.getTime() > 30 * 24 * 60 * 60 * 1000));

      // Build weeklyTrend for response
      const weeklyTrend = weeklyData.map((w) => ({
        weekStart: new Date(w.weekStart).toISOString().split("T")[0],
        units: Number(w.units),
        revenue: w.revenue,
      }));

      return {
        id: prod.productId,
        name: prod.productName,
        sku: prod.sku,
        imageUrl: prod.imageUrl,
        category: prod.category,
        brand: prod.brand,
        stock: prod.stock,
        unitsSold,
        revenue: prod.revenue,
        orders: Number(prod.orders),
        avgPrice: unitsSold > 0 ? prod.revenue / unitsSold : 0,
        trendData: {
          weeklyTrend,
          wowUnitsPct: calculateWoWPct(weeklyData, "units"),
          wowRevenuePct: calculateWoWPct(weeklyData, "revenue"),
          trendSlope: calculateTrendSlope(weeklyData),
          abcClass: "C", // Will be assigned after ABC analysis
        },
        stockData: {
          dailySalesRate: Math.round(dailySalesRate * 100) / 100,
          daysOfStock,
          stockoutDate,
          stockHealth,
          isDead,
          lastSaleDate: lastSaleDate ? lastSaleDate.toISOString() : null,
        },
      };
    });

    // ABC Classification
    const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0);
    let cumulativeRevenue = 0;
    const productsByRevenue = [...products].sort((a, b) => b.revenue - a.revenue);

    productsByRevenue.forEach((prod) => {
      cumulativeRevenue += prod.revenue;
      const percentage = totalRevenue > 0 ? (cumulativeRevenue / totalRevenue) * 100 : 0;

      if (percentage <= 80) {
        prod.trendData.abcClass = "A";
      } else if (percentage <= 95) {
        prod.trendData.abcClass = "B";
      } else {
        prod.trendData.abcClass = "C";
      }
    });

    // === SEPARATE BAGS, GIFT CARDS, AND REAL PRODUCTS ===
    const isBag = (name: string) => {
      const lower = name.toLowerCase();
      return lower.includes("shopping bag") || lower.includes("bolsa de compra") || lower.includes("bolsa de regalo");
    };
    const isGiftCard = (name: string) => {
      const lower = name.toLowerCase();
      return lower.includes("gift card") || lower.includes("tarjeta de regalo");
    };
    const bags = products.filter((p) => isBag(p.name));
    const giftCards = products.filter((p) => isGiftCard(p.name));
    const realProducts = products.filter((p) => !isBag(p.name) && !isGiftCard(p.name));

    // Calculate stock summary (REAL PRODUCTS ONLY - excludes bags and gift cards)
    const stockSummary: StockSummary = {
      criticalCount: realProducts.filter((p) => p.stockData.stockHealth === "critical").length,
      lowCount: realProducts.filter((p) => p.stockData.stockHealth === "low").length,
      optimalCount: realProducts.filter((p) => p.stockData.stockHealth === "optimal").length,
      excessiveCount: realProducts.filter((p) => p.stockData.stockHealth === "excessive").length,
      deadCount: realProducts.filter((p) => p.stockData.isDead).length,
      totalStockUnits: realProducts.reduce((sum, p) => sum + (p.stock || 0), 0),
      totalStockValue: realProducts.reduce((sum, p) => sum + ((p.stock || 0) * p.avgPrice), 0),
      productsAtRisk: realProducts.filter((p) => p.stockData.stockHealth === "critical" || p.stockData.stockHealth === "low").length,
    };

    // Calculate trend summary (REAL PRODUCTS ONLY)
    const trendSummary: TrendSummary = {
      growingCount: realProducts.filter((p) => p.trendData.wowRevenuePct > 5).length,
      decliningCount: realProducts.filter((p) => p.trendData.wowRevenuePct < -5).length,
      stableCount: realProducts.filter((p) => p.trendData.wowRevenuePct >= -5 && p.trendData.wowRevenuePct <= 5).length,
    };

    // === BAGS ANALYTICS ===
    const totalBagsSold = bags.reduce((sum: number, b: ProductMetrics) => sum + b.unitsSold, 0);
    const bagsRevenue = bags.reduce((sum: number, b: ProductMetrics) => sum + b.revenue, 0);
    const grandeStock = bags
      .filter((b: ProductMetrics) => b.name.toLowerCase().includes("grande") || b.name.toLowerCase().includes("large"))
      .reduce((sum: number, b: ProductMetrics) => sum + (b.stock || 0), 0);
    const chicaStock = bags
      .filter((b: ProductMetrics) => !b.name.toLowerCase().includes("grande") && !b.name.toLowerCase().includes("large"))
      .reduce((sum: number, b: ProductMetrics) => sum + (b.stock || 0), 0);
    const ordersWithBagsCount = bags.reduce((sum: number, b: ProductMetrics) => sum + b.orders, 0);
    const totalOrdersCount = summary.totalOrders30d;
    const bagAdoptionPct = totalOrdersCount > 0
      ? Math.round((ordersWithBagsCount / totalOrdersCount) * 10000) / 100
      : 0;
    const bagsAnalytics: BagsAnalytics = {
      totalBagsSold,
      bagsRevenue,
      currentStock: { grande: grandeStock, chica: chicaStock, total: grandeStock + chicaStock },
      ordersWithBags: ordersWithBagsCount,
      totalOrders: totalOrdersCount,
      bagAdoptionPct,
      breakdown: bags.map((b: ProductMetrics) => ({ name: b.name, unitsSold: b.unitsSold, revenue: b.revenue, stock: b.stock })),
    };

    // Extract brands and categories
    const brandMap = new Map<string, number>();
    const categoryMap = new Map<string, number>();

    products.forEach((prod) => {
      if (prod.brand) {
        brandMap.set(prod.brand, (brandMap.get(prod.brand) || 0) + 1);
      }
      if (prod.category) {
        categoryMap.set(prod.category, (categoryMap.get(prod.category) || 0) + 1);
      }
    });

    const brands = Array.from(brandMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const categories = Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const response: APIResponse = {
      products,
      brands,
      categories,
      stockSyncedAt,
      totalActiveProducts,
      summary,
      stockSummary,
      trendSummary,
      bagsAnalytics,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching product metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch product metrics" },
      { status: 500 }
    );
  }
}
