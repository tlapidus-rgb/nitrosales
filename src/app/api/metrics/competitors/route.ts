// ══════════════════════════════════════════════════════════════
// Competitors Metrics API — Dashboard Data
// ══════════════════════════════════════════════════════════════
// Returns: summary KPIs, price comparison table, alerts, changes
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const orgId = org.id;

    // Parallel queries
    const [stores, competitorPrices, ownProducts] = await Promise.all([
      prisma.competitorStore.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, name: true, website: true },
      }),
      prisma.competitorPrice.findMany({
        where: { organizationId: orgId, competitor: { isActive: true } },
        include: {
          competitor: { select: { id: true, name: true } },
        },
      }),
      prisma.product.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, name: true, sku: true, price: true, imageUrl: true },
      }),
    ]);

    const ownProductMap = Object.fromEntries(ownProducts.map(p => [p.id, p]));

    // Group competitor prices by own product
    const byOwnProduct: Record<string, typeof competitorPrices> = {};
    const unmapped: typeof competitorPrices = [];

    for (const cp of competitorPrices) {
      if (cp.ownProductId && ownProductMap[cp.ownProductId]) {
        if (!byOwnProduct[cp.ownProductId]) byOwnProduct[cp.ownProductId] = [];
        byOwnProduct[cp.ownProductId].push(cp);
      } else {
        unmapped.push(cp);
      }
    }

    // Build price comparison for mapped products
    let cheaperCount = 0;
    let moreExpensiveCount = 0;
    let totalDiffSum = 0;
    let totalDiffCount = 0;

    // Umbral mínimo de precio propio para considerar válido en comparaciones.
    // Precios debajo de esto son datos corruptos del sync legacy (precio base, no venta).
    const MIN_VALID_OWN_PRICE = 1000;

    const priceComparison = Object.entries(byOwnProduct).map(([productId, prices]) => {
      const own = ownProductMap[productId];
      const ownPrice = Number(own.price);

      const competitors = prices
        .filter(p => p.scrapeStatus === "OK" && Number(p.currentPrice) > 0)
        .map(p => {
          const cPrice = Number(p.currentPrice);
          // Solo calcular diff si el precio propio es válido (>= umbral mínimo)
          const diff = ownPrice >= MIN_VALID_OWN_PRICE ? Math.round(((cPrice - ownPrice) / ownPrice) * 1000) / 10 : 0;
          // Only count valid diffs (both prices above minimum threshold) for average
          if (ownPrice >= MIN_VALID_OWN_PRICE && cPrice > 0) {
            totalDiffSum += diff;
            totalDiffCount++;
          }
          return {
            store: p.competitor.name,
            storeId: p.competitor.id,
            price: cPrice,
            diff,
            previousPrice: p.previousPrice ? Number(p.previousPrice) : null,
            url: p.productUrl,
            productName: p.productName,
            imageUrl: p.imageUrl,
            lastScrapedAt: p.lastScrapedAt,
          };
        })
        .sort((a, b) => a.price - b.price);

      // Determine position (rank by price, 1 = cheapest)
      // Only rank if own price is > 0 (otherwise position is meaningless)
      const validPrices = [...competitors.map(c => c.price), ...(ownPrice >= MIN_VALID_OWN_PRICE ? [ownPrice] : [])].filter(p => p > 0).sort((a, b) => a - b);
      const position = ownPrice >= MIN_VALID_OWN_PRICE ? validPrices.indexOf(ownPrice) + 1 : 0;

      if (ownPrice >= MIN_VALID_OWN_PRICE && position === 1) cheaperCount++;
      else if (ownPrice >= MIN_VALID_OWN_PRICE && position > Math.ceil(validPrices.length / 2)) moreExpensiveCount++;

      const bestPrice = competitors.length > 0 ? competitors[0] : null;

      return {
        ownProduct: {
          id: own.id,
          name: own.name,
          sku: own.sku,
          price: ownPrice,
          imageUrl: own.imageUrl,
        },
        competitors,
        position,
        totalInComparison: validPrices.length,
        bestPrice,
      };
    }).sort((a, b) => b.position - a.position); // Most expensive first (alerts priority)

    // Recent price changes
    const recentChanges = competitorPrices
      .filter(p => p.previousPrice && Number(p.currentPrice) !== Number(p.previousPrice) && p.lastScrapedAt)
      .map(p => ({
        competitor: p.competitor.name,
        product: p.productName,
        oldPrice: Number(p.previousPrice),
        newPrice: Number(p.currentPrice),
        change: Number(p.previousPrice) > 0
          ? Math.round(((Number(p.currentPrice) - Number(p.previousPrice)) / Number(p.previousPrice)) * 100)
          : 0,
        date: p.lastScrapedAt?.toISOString().split("T")[0],
      }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 20);

    // Alerts
    const alerts: { type: string; product: string; diff?: number; competitor?: string; drop?: number }[] = [];

    for (const item of priceComparison) {
      // Solo alertar si el precio propio es válido (no corrupto)
      if (item.ownProduct.price >= MIN_VALID_OWN_PRICE && item.bestPrice && item.bestPrice.diff < -10) {
        alerts.push({
          type: "OVERPRICED",
          product: item.ownProduct.name,
          diff: Math.abs(item.bestPrice.diff),
          competitor: item.bestPrice.store,
        });
      }
    }

    for (const change of recentChanges) {
      if (change.change < -5) {
        alerts.push({
          type: "COMPETITOR_DROP",
          product: change.product,
          competitor: change.competitor,
          drop: change.change,
        });
      }
    }

    const avgPriceDiff = totalDiffCount > 0 ? Math.round((totalDiffSum / totalDiffCount) * 10) / 10 : 0;

    return NextResponse.json({
      summary: {
        totalMonitored: competitorPrices.length,
        competitorCount: stores.length,
        mappedProducts: Object.keys(byOwnProduct).length,
        cheaperCount,
        moreExpensiveCount,
        avgPriceDiff,
        successRate: competitorPrices.length > 0
          ? Math.round((competitorPrices.filter(p => p.scrapeStatus === "OK").length / competitorPrices.length) * 100)
          : 0,
      },
      stores,
      priceComparison,
      unmappedProducts: unmapped.map(p => ({
        id: p.id,
        competitor: p.competitor.name,
        productName: p.productName,
        price: Number(p.currentPrice),
        url: p.productUrl,
        imageUrl: p.imageUrl,
        scrapeStatus: p.scrapeStatus,
      })),
      recentChanges,
      alerts,
    });
  } catch (error: any) {
    console.error("[Competitors Metrics]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
