export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { getCached, setCache } from "@/lib/api-cache";

export const revalidate = 0;
export const maxDuration = 60; // Vercel Pro: hasta 60s para queries pesadas en producción

type ProductMetrics = {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  category: string | null;
  categoryPath: string | null;
  brand: string | null;
  stock: number | null;
  unitsSold: number;
  revenue: number;
  revenueNeto: number;
  orders: number;
  avgPrice: number;
  avgPriceNeto: number;
  costPrice: number | null;
  marginPct: number | null;
  marginAbs: number | null;
  cogs: number | null;
  listPrice: number | null;
  viewers: number;
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

type MarginBucket = { range: string; count: number; revenue: number; avgMargin: number };
type MarginByGroup = { name: string; revenue: number; cogs: number; marginPct: number; productCount: number };

type MarginAnalysis = {
  weightedMarginPct: number;
  totalRevenueWithCost: number;
  totalCogs: number;
  grossProfit: number;
  productsWithCost: number;
  productsWithoutCost: number;
  distribution: MarginBucket[];
  byBrand: MarginByGroup[];
  byCategory: MarginByGroup[];
  topMargin: Array<ProductMetrics>;
  bottomMargin: Array<ProductMetrics>;
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
  marginAnalysis: MarginAnalysis;
};

export async function GET(request: Request) {
  try {
    const ORG_ID = await getOrganizationId();
    const now = new Date();

    // Parse optional from/to date params (default: last 30 days)
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    // Cache check
    const cacheKey = [ORG_ID, fromParam || "default", toParam || "default"];
    const cached = getCached("products", ...cacheKey);
    if (cached) return NextResponse.json(cached);

    const dateTo = toParam ? new Date(toParam + "T23:59:59.999-03:00") : now;
    const dateFrom = fromParam ? new Date(fromParam + "T00:00:00.000-03:00") : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const daysDiff = Math.max(1, Math.round((dateTo.getTime() - dateFrom.getTime()) / (24 * 60 * 60 * 1000)));
    
    const thirtyDaysAgo = dateFrom;
    const sixtyDaysAgo = new Date(dateFrom.getTime() - daysDiff * 24 * 60 * 60 * 1000);

    // Execute all 6 queries in parallel
    const [
      orderTotals,
      ordersWithItems,
      productAggregation,
      stockSyncMetadata,
      weeklySalesByProduct,
      lastSaleDateByProduct,
      viewersBySku,
      imagesBySku,
      historicalPriceBySku,
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
          AND "orderDate" <= ${dateTo}
          AND status NOT IN ('CANCELLED', 'RETURNED')
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
          AND "orderDate" <= ${dateTo}
          AND status NOT IN ('CANCELLED', 'RETURNED')
      `,

      // Query 3: Product aggregation (30 days) CONSOLIDATED BY SKU (Sesion 20).
      // 1. master_products: 1 fila por SKU, priorizando el producto VTEX (tiene imagen,
      //    categoryPath y costPrice) sobre el MELI (no tiene imagen).
      // 2. sales_by_sku: agrega ventas por SKU (consolida MELI + VTEX + otros canales).
      // 3. Join final: trae metadata del producto maestro + datos de ventas.
      prisma.$queryRaw<
        Array<{
          productId: string;
          productName: string;
          sku: string;
          imageUrl: string | null;
          category: string | null;
          categoryPath: string | null;
          brand: string | null;
          stock: number | null;
          costPrice: number | null;
          listPrice: number | null;
          units: bigint;
          revenue: number;
          cogs: number | null;
          orders: bigint;
        }>
      >`
        WITH master_products AS (
          SELECT DISTINCT ON (sku)
            id, sku, name, "imageUrl", category, "categoryPath", brand, stock, "costPrice", price
          FROM products
          WHERE "organizationId" = ${ORG_ID}
            AND sku IS NOT NULL AND sku != ''
          ORDER BY sku,
            CASE WHEN "imageUrl" IS NOT NULL AND "imageUrl" != '' THEN 0 ELSE 1 END,
            CASE WHEN "categoryPath" IS NOT NULL AND "categoryPath" != '' THEN 0 ELSE 1 END,
            CASE WHEN "costPrice" IS NOT NULL THEN 0 ELSE 1 END,
            "createdAt" ASC
        ),
        sales_by_sku AS (
          SELECT
            p.sku AS sku,
            SUM(oi.quantity)::bigint AS units,
            ROUND(SUM(oi."totalPrice")::numeric) AS revenue,
            COUNT(DISTINCT oi."orderId")::bigint AS orders
          FROM order_items oi
          JOIN orders o ON oi."orderId" = o.id
          JOIN products p ON oi."productId" = p.id
          WHERE o."organizationId" = ${ORG_ID}
            AND o."orderDate" >= ${thirtyDaysAgo}
            AND o."orderDate" <= ${dateTo}
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND p.sku IS NOT NULL AND p.sku != ''
          GROUP BY p.sku
        )
        SELECT
          m.id AS "productId",
          m.name AS "productName",
          m.sku,
          m."imageUrl",
          m.category,
          m."categoryPath",
          m.brand,
          m.stock,
          m."costPrice"::numeric AS "costPrice",
          m.price::numeric AS "listPrice",
          -- Sesion 22: LEFT JOIN + COALESCE para incluir todo el catalogo
          -- (antes era INNER JOIN y escondiamos los productos sin venta,
          -- lo que rompia la deteccion de stock muerto).
          COALESCE(s.units, 0)::bigint AS units,
          COALESCE(s.revenue, 0) AS revenue,
          CASE WHEN m."costPrice" IS NOT NULL AND s.units IS NOT NULL
            THEN ROUND((s.units * m."costPrice")::numeric)
            ELSE NULL END AS cogs,
          COALESCE(s.orders, 0)::bigint AS orders
        FROM master_products m
        LEFT JOIN sales_by_sku s ON m.sku = s.sku
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

      // Query 5: Weekly sales by SKU (last 60 days) - consolidado MELI+VTEX
      prisma.$queryRaw<
        Array<{
          sku: string;
          weekStart: Date;
          units: bigint;
          revenue: number;
          orders: bigint;
        }>
      >`
        SELECT
          p.sku AS sku,
          date_trunc('week', o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS "weekStart",
          SUM(oi.quantity)::bigint AS units,
          ROUND(SUM(oi."totalPrice")::numeric) AS revenue,
          COUNT(DISTINCT oi."orderId")::bigint AS orders
        FROM order_items oi
        JOIN orders o ON oi."orderId" = o.id
        JOIN products p ON oi."productId" = p.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${sixtyDaysAgo}
          AND o."orderDate" <= ${dateTo}
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND p.sku IS NOT NULL AND p.sku != ''
        GROUP BY p.sku, date_trunc('week', o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires')
        ORDER BY date_trunc('week', o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires')
      `,

      // Query 6: Last sale date per SKU - consolidado MELI+VTEX
      prisma.$queryRaw<
        Array<{
          sku: string;
          lastSaleDate: Date;
        }>
      >`
        SELECT
          p.sku AS sku,
          MAX(o."orderDate") AS "lastSaleDate"
        FROM order_items oi
        JOIN orders o ON oi."orderId" = o.id
        JOIN products p ON oi."productId" = p.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND p.sku IS NOT NULL AND p.sku != ''
        GROUP BY p.sku
      `,

      // Query 7 (Sesion 22): Pixel viewers per SKU en el periodo
      // Consolidamos vistas por SKU (un SKU puede existir como producto
      // VTEX y MELI con distinto externalId, asi que matcheamos pe.productId
      // -> products.externalId y agrupamos por products.sku).
      prisma.$queryRaw<
        Array<{
          sku: string;
          viewers: bigint;
        }>
      >`
        SELECT
          p.sku AS sku,
          COUNT(DISTINCT pe."visitorId")::bigint AS viewers
        FROM pixel_events pe
        JOIN products p
          ON p."externalId" = pe.props->>'productId'
          AND p."organizationId" = pe."organizationId"
        WHERE pe."organizationId" = ${ORG_ID}
          AND pe.timestamp >= ${thirtyDaysAgo}
          AND pe.timestamp <= ${dateTo}
          AND pe.type = 'VIEW_PRODUCT'
          AND pe.props->>'productId' IS NOT NULL
          AND p.sku IS NOT NULL AND p.sku != ''
        GROUP BY p.sku
      `,

      // Query 8 (Sesion 22): Mejor imagen + costPrice + listPrice por SKU.
      // El master_products CTE elige UN row por SKU (prioriza el que tiene
      // imagen), pero ese row puede no tener costPrice ni price cargados.
      // Agregamos por SKU tomando el mejor valor non-null de CUALQUIER row
      // hermano (VTEX o MELI). En JS aplicamos como fallback.
      prisma.$queryRaw<
        Array<{
          sku: string;
          imageUrl: string | null;
          costPrice: number | null;
          listPrice: number | null;
        }>
      >`
        SELECT
          sku,
          MAX("imageUrl") FILTER (WHERE "imageUrl" IS NOT NULL AND "imageUrl" != '') AS "imageUrl",
          (MAX("costPrice") FILTER (WHERE "costPrice" IS NOT NULL AND "costPrice" > 0))::numeric AS "costPrice",
          (MAX(price) FILTER (WHERE price IS NOT NULL AND price > 0))::numeric AS "listPrice"
        FROM products
        WHERE "organizationId" = ${ORG_ID}
          AND sku IS NOT NULL AND sku != ''
        GROUP BY sku
      `,

      // Query 9 (Sesion 22): Ultimo precio de venta historico por SKU.
      // Fallback final cuando el producto no tiene price cargado en la tabla
      // products (puede pasar con items creados via webhook MELI sin precio).
      // Usamos el precio unitario de la venta mas reciente.
      prisma.$queryRaw<
        Array<{
          sku: string;
          lastUnitPrice: number;
        }>
      >`
        SELECT DISTINCT ON (p.sku)
          p.sku AS sku,
          (oi."totalPrice" / NULLIF(oi.quantity, 0))::numeric AS "lastUnitPrice"
        FROM order_items oi
        JOIN orders o ON oi."orderId" = o.id
        JOIN products p ON oi."productId" = p.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND p.sku IS NOT NULL AND p.sku != ''
          AND oi.quantity > 0
          AND oi."totalPrice" > 0
        ORDER BY p.sku, o."orderDate" DESC
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

    // Build lookup maps keyed by SKU (Sesion 20: consolidacion multi-canal)
    const weeklyTrendMap = new Map<string, Array<{ weekStart: Date; units: bigint; revenue: number }>>();
    weeklySalesByProduct.forEach((row) => {
      const key = row.sku;
      if (!key) return;
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
      if (row.sku) lastSaleDateMap.set(row.sku, row.lastSaleDate);
    });

    // Sesion 22: viewers por SKU desde pixel_events
    const viewersBySkuMap = new Map<string, number>();
    viewersBySku.forEach((row) => {
      if (row.sku) viewersBySkuMap.set(row.sku, Number(row.viewers));
    });

    // Sesion 22: fallback cross-source por SKU para imagen, costPrice y listPrice.
    const imageBySkuMap = new Map<string, string>();
    const costBySkuMap = new Map<string, number>();
    const priceBySkuMap = new Map<string, number>();
    imagesBySku.forEach((row) => {
      if (!row.sku) return;
      if (row.imageUrl) imageBySkuMap.set(row.sku, row.imageUrl);
      if (row.costPrice != null) costBySkuMap.set(row.sku, Number(row.costPrice));
      if (row.listPrice != null) priceBySkuMap.set(row.sku, Number(row.listPrice));
    });
    // Sesion 22: fallback final de precio por SKU usando el ultimo precio
    // de venta historico (desde order_items). Sirve para productos sin
    // price en la tabla products pero que alguna vez se vendieron.
    const historicalPriceMap = new Map<string, number>();
    historicalPriceBySku.forEach((row) => {
      if (row.sku && row.lastUnitPrice != null) {
        historicalPriceMap.set(row.sku, Number(row.lastUnitPrice));
      }
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
    let products = productAggregation.map((prod): ProductMetrics => {
      const weeklyData = weeklyTrendMap.get(prod.sku) || [];
      const unitsSold = Number(prod.units);
      const dailySalesRate = unitsSold / daysDiff;
      const lastSaleDate = lastSaleDateMap.get(prod.sku);

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

      // Margin calculations — prices include 21% IVA, costs do NOT
      const IVA_RATE = 1.21;
      // Sesion 22: si el master_products row no tiene costPrice/price (porque
      // fue elegido por tener imagen pero era el row MELI sin costos), cruzar
      // por SKU con cualquier hermano (VTEX) que si los tenga.
      const costPrice = prod.costPrice != null
        ? Number(prod.costPrice)
        : (costBySkuMap.get(prod.sku) ?? null);
      // Chain de fallbacks: row elegido → cross-source products → ultimo precio de venta historico.
      const listPriceRaw = (prod.listPrice != null && Number(prod.listPrice) > 0)
        ? Number(prod.listPrice)
        : (priceBySkuMap.get(prod.sku)
          ?? historicalPriceMap.get(prod.sku)
          ?? null);
      const listPrice = (listPriceRaw != null && listPriceRaw > 0) ? listPriceRaw : null;
      // Recalcular cogs si el costPrice vino del fallback (no del row elegido).
      const cogs = (prod.cogs != null)
        ? Number(prod.cogs)
        : (costPrice != null && unitsSold > 0 ? Math.round(unitsSold * costPrice) : null);
      const revenueNeto = prod.revenue / IVA_RATE; // Revenue sin IVA
      const marginAbs = (costPrice != null && cogs != null && revenueNeto > 0) ? revenueNeto - cogs : null;
      // Sesion 22: si hay costo + precio de lista pero no hubo ventas,
      // calcular margen teorico a partir del precio de lista (sin IVA).
      // Sirve para la tabla de Stock Muerto (productos sin venta).
      let marginPct = (marginAbs != null && revenueNeto > 0) ? (marginAbs / revenueNeto) * 100 : null;
      if (marginPct == null && costPrice != null && listPrice != null && listPrice > 0) {
        const listNeto = listPrice / IVA_RATE;
        if (listNeto > 0) marginPct = ((listNeto - costPrice) / listNeto) * 100;
      }
      // Sesion 22: para productos sin ventas en el periodo, usar el listPrice
      // del catalogo como avgPrice — asi el capital inmovilizado del stock
      // muerto (stock * avgPrice) no se subestima.
      const avgPriceFallback =
        unitsSold > 0 ? prod.revenue / unitsSold : (listPrice ?? 0);

      return {
        id: prod.productId,
        name: prod.productName,
        sku: prod.sku,
        // Sesion 22: si el master_products row no tiene imagen, cruzar por SKU
        // con cualquier producto hermano que si tenga (priorizando VTEX).
        imageUrl: prod.imageUrl || imageBySkuMap.get(prod.sku) || null,
        category: prod.category,
        categoryPath: prod.categoryPath,
        brand: prod.brand,
        stock: prod.stock,
        unitsSold,
        revenue: prod.revenue,
        revenueNeto,
        orders: Number(prod.orders),
        avgPrice: avgPriceFallback,
        avgPriceNeto: unitsSold > 0 ? revenueNeto / unitsSold : (listPrice ? listPrice / IVA_RATE : 0),
        costPrice,
        marginPct: marginPct != null ? Math.round(marginPct * 10) / 10 : null,
        marginAbs,
        cogs,
        listPrice,
        viewers: viewersBySkuMap.get(prod.sku) || 0,
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
          isDead: !!isDead,
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
    const totalBagsSold = bags.reduce((sum: number, b: ProductMetrics) => sum + Number(b.unitsSold), 0);
    const bagsRevenue = bags.reduce((sum: number, b: ProductMetrics) => sum + Number(b.revenue), 0);
    const grandeStock = bags
      .filter((b: ProductMetrics) => b.name.toLowerCase().includes("grande") || b.name.toLowerCase().includes("large"))
      .reduce((sum: number, b: ProductMetrics) => sum + (b.stock || 0), 0);
    const chicaStock = bags
      .filter((b: ProductMetrics) => !b.name.toLowerCase().includes("grande") && !b.name.toLowerCase().includes("large"))
      .reduce((sum: number, b: ProductMetrics) => sum + (b.stock || 0), 0);
    const ordersWithBagsCount = bags.reduce((sum: number, b: ProductMetrics) => sum + Number(b.orders), 0);
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
      breakdown: bags.map((b: ProductMetrics) => ({ name: b.name, unitsSold: Number(b.unitsSold), revenue: Number(b.revenue), stock: b.stock })),
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

    // === MARGIN ANALYSIS (real products only) — all margin calcs use revenue neto (sin IVA) ===
    const productsWithCost = realProducts.filter((p) => p.costPrice != null && p.marginPct != null);
    const productsWithoutCost = realProducts.filter((p) => p.costPrice == null);

    const totalRevenueNetoWithCost = productsWithCost.reduce((s, p) => s + p.revenueNeto, 0);
    const totalCogs = productsWithCost.reduce((s, p) => s + (p.cogs || 0), 0);
    const grossProfit = totalRevenueNetoWithCost - totalCogs;
    const weightedMarginPct = totalRevenueNetoWithCost > 0 ? (grossProfit / totalRevenueNetoWithCost) * 100 : 0;

    // Distribution buckets
    const bucketDefs = [
      { range: "Negativo", min: -Infinity, max: 0 },
      { range: "0-30%", min: 0, max: 30 },
      { range: "30-50%", min: 30, max: 50 },
      { range: "50-70%", min: 50, max: 70 },
      { range: "70%+", min: 70, max: Infinity },
    ];
    const distribution: MarginBucket[] = bucketDefs.map((b) => {
      const inBucket = productsWithCost.filter(
        (p) => p.marginPct! >= b.min && p.marginPct! < b.max
      );
      const bucketRevenueNeto = inBucket.reduce((s, p) => s + p.revenueNeto, 0);
      const bucketCogs = inBucket.reduce((s, p) => s + (p.cogs || 0), 0);
      return {
        range: b.range,
        count: inBucket.length,
        revenue: bucketRevenueNeto,
        avgMargin: bucketRevenueNeto > 0 ? ((bucketRevenueNeto - bucketCogs) / bucketRevenueNeto) * 100 : 0,
      };
    });

    // Margin by brand (revenue-weighted, using revenueNeto)
    const brandMarginMap = new Map<string, { revenueNeto: number; cogs: number; count: number }>();
    productsWithCost.forEach((p) => {
      if (!p.brand) return;
      const existing = brandMarginMap.get(p.brand) || { revenueNeto: 0, cogs: 0, count: 0 };
      existing.revenueNeto += p.revenueNeto;
      existing.cogs += p.cogs || 0;
      existing.count += 1;
      brandMarginMap.set(p.brand, existing);
    });
    const byBrand: MarginByGroup[] = Array.from(brandMarginMap.entries())
      .map(([name, d]) => ({
        name,
        revenue: d.revenueNeto,
        cogs: d.cogs,
        marginPct: d.revenueNeto > 0 ? ((d.revenueNeto - d.cogs) / d.revenueNeto) * 100 : 0,
        productCount: d.count,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);

    // Margin by category (revenue-weighted, using revenueNeto)
    const catMarginMap = new Map<string, { revenueNeto: number; cogs: number; count: number }>();
    productsWithCost.forEach((p) => {
      if (!p.category) return;
      const existing = catMarginMap.get(p.category) || { revenueNeto: 0, cogs: 0, count: 0 };
      existing.revenueNeto += p.revenueNeto;
      existing.cogs += p.cogs || 0;
      existing.count += 1;
      catMarginMap.set(p.category, existing);
    });
    const byCategory: MarginByGroup[] = Array.from(catMarginMap.entries())
      .map(([name, d]) => ({
        name,
        revenue: d.revenueNeto,
        cogs: d.cogs,
        marginPct: d.revenueNeto > 0 ? ((d.revenueNeto - d.cogs) / d.revenueNeto) * 100 : 0,
        productCount: d.count,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);

    // Top/Bottom margin (minimum revenue threshold to avoid noise)
    const minRevenue = totalRevenueNetoWithCost * 0.001; // 0.1% of total
    const significantProducts = productsWithCost.filter((p) => p.revenueNeto >= minRevenue);
    const sortedByMargin = [...significantProducts].sort((a, b) => (b.marginPct || 0) - (a.marginPct || 0));
    const topMargin = sortedByMargin.slice(0, 10);
    const bottomMargin = sortedByMargin.slice(-10).reverse();

    const marginAnalysis: MarginAnalysis = {
      weightedMarginPct: Math.round(weightedMarginPct * 10) / 10,
      totalRevenueWithCost: totalRevenueNetoWithCost,
      totalCogs,
      grossProfit,
      productsWithCost: productsWithCost.length,
      productsWithoutCost: productsWithoutCost.length,
      distribution,
      byBrand,
      byCategory,
      topMargin,
      bottomMargin,
    };

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
      marginAnalysis,
    };

    setCache("products", response, ...cacheKey);
    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching product metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch product metrics" },
      { status: 500 }
    );
  }
}
