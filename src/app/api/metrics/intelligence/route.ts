// ══════════════════════════════════════════════════════════════
// Competitive Intelligence API — Aggregated Analysis Data
// ══════════════════════════════════════════════════════════════
// Returns: catalog coverage, category analysis, price distribution,
// match quality, opportunities, competitor profiles
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MIN_VALID_PRICE = 1000;

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
        select: {
          id: true,
          productName: true,
          productUrl: true,
          currentPrice: true,
          competitorEan: true,
          matchMethod: true,
          ownProductId: true,
          competitorId: true,
          lastScrapedAt: true,
          competitor: { select: { id: true, name: true } },
        },
      }),
      prisma.product.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, name: true, sku: true, ean: true, price: true, brand: true, category: true, stock: true },
      }),
    ]);

    const ownProductMap = new Map(ownProducts.map(p => [p.id, p]));

    // ── 1. Coverage KPIs ──
    const totalOwnProducts = ownProducts.length;
    const totalCompetitorPrices = competitorPrices.length;
    const matched = competitorPrices.filter(cp => cp.ownProductId);
    const unmatched = competitorPrices.filter(cp => !cp.ownProductId);
    const uniqueOwnMatched = new Set(matched.map(cp => cp.ownProductId));
    const coveragePercent = totalOwnProducts > 0
      ? Math.round((uniqueOwnMatched.size / totalOwnProducts) * 100)
      : 0;

    // ── 2. Match Method Breakdown ──
    const matchMethods: Record<string, number> = {};
    for (const cp of matched) {
      const method = cp.matchMethod || "LEGACY";
      matchMethods[method] = (matchMethods[method] || 0) + 1;
    }

    // ── 3. Competitor Profiles ──
    const competitorProfiles = stores.map(store => {
      const storePrices = competitorPrices.filter(cp => cp.competitorId === store.id);
      const storeMatched = storePrices.filter(cp => cp.ownProductId);
      const withEan = storePrices.filter(cp => cp.competitorEan);

      // Price comparison for matched products
      let cheaper = 0, pricier = 0, equal = 0;
      let totalDiff = 0;
      let diffCount = 0;

      for (const cp of storeMatched) {
        const own = ownProductMap.get(cp.ownProductId!);
        if (!own || Number(own.price) < MIN_VALID_PRICE) continue;
        const ownPrice = Number(own.price);
        const compPrice = Number(cp.currentPrice);
        if (compPrice <= 0) continue;

        const diff = ((compPrice - ownPrice) / ownPrice) * 100;
        totalDiff += diff;
        diffCount++;

        if (diff > 2) pricier++;
        else if (diff < -2) cheaper++;
        else equal++;
      }

      return {
        id: store.id,
        name: store.name,
        website: store.website,
        totalProducts: storePrices.length,
        matchedProducts: storeMatched.length,
        withEan: withEan.length,
        avgPriceDiff: diffCount > 0 ? Math.round(totalDiff / diffCount) : 0,
        cheaper,
        pricier,
        equal,
      };
    });

    // ── 4. Category Analysis ──
    const categoryStats: Record<string, { own: number; matched: number; avgDiff: number; diffs: number[] }> = {};

    for (const cp of matched) {
      const own = ownProductMap.get(cp.ownProductId!);
      if (!own) continue;
      const cat = own.category || "Sin categoría";
      if (!categoryStats[cat]) categoryStats[cat] = { own: 0, matched: 0, avgDiff: 0, diffs: [] };
      categoryStats[cat].matched++;

      if (Number(own.price) >= MIN_VALID_PRICE && Number(cp.currentPrice) > 0) {
        const diff = ((Number(cp.currentPrice) - Number(own.price)) / Number(own.price)) * 100;
        categoryStats[cat].diffs.push(diff);
      }
    }

    // Count own products per category
    for (const p of ownProducts) {
      const cat = p.category || "Sin categoría";
      if (!categoryStats[cat]) categoryStats[cat] = { own: 0, matched: 0, avgDiff: 0, diffs: [] };
      categoryStats[cat].own++;
    }

    const categories = Object.entries(categoryStats)
      .map(([name, stats]) => ({
        name,
        ownProducts: stats.own,
        matchedProducts: stats.matched,
        coverage: stats.own > 0 ? Math.round((stats.matched / stats.own) * 100) : 0,
        avgPriceDiff: stats.diffs.length > 0
          ? Math.round(stats.diffs.reduce((a, b) => a + b, 0) / stats.diffs.length)
          : 0,
      }))
      .filter(c => c.matchedProducts > 0)
      .sort((a, b) => b.matchedProducts - a.matchedProducts)
      .slice(0, 15);

    // ── 5. Price Distribution ──
    const priceRanges = [
      { label: "< $10K", min: 0, max: 10000 },
      { label: "$10K-$25K", min: 10000, max: 25000 },
      { label: "$25K-$50K", min: 25000, max: 50000 },
      { label: "$50K-$100K", min: 50000, max: 100000 },
      { label: "$100K-$250K", min: 100000, max: 250000 },
      { label: "> $250K", min: 250000, max: Infinity },
    ];

    const priceDistribution = priceRanges.map(range => {
      const ownCount = ownProducts.filter(p =>
        Number(p.price) >= range.min && Number(p.price) < range.max && Number(p.price) >= MIN_VALID_PRICE
      ).length;
      const compCount = competitorPrices.filter(p =>
        Number(p.currentPrice) >= range.min && Number(p.currentPrice) < range.max
      ).length;
      return { range: range.label, tuTienda: ownCount, competidores: compCount };
    });

    // ── 6. Opportunities (biggest gaps) ──
    const opportunities: Array<{
      ownProduct: string;
      ownPrice: number;
      competitor: string;
      competitorPrice: number;
      diff: number;
      type: "oportunidad" | "riesgo";
      url: string;
    }> = [];

    for (const cp of matched) {
      const own = ownProductMap.get(cp.ownProductId!);
      if (!own || Number(own.price) < MIN_VALID_PRICE || Number(cp.currentPrice) <= 0) continue;

      const ownPrice = Number(own.price);
      const compPrice = Number(cp.currentPrice);
      const diff = Math.round(((compPrice - ownPrice) / ownPrice) * 100);

      if (Math.abs(diff) >= 10) {
        opportunities.push({
          ownProduct: own.name,
          ownPrice,
          competitor: cp.competitor.name,
          competitorPrice: compPrice,
          diff,
          type: diff > 0 ? "oportunidad" : "riesgo",
          url: cp.productUrl,
        });
      }
    }

    // Sort: biggest opportunities first, then biggest risks
    opportunities.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    // ── 7. Products Without Competition (gaps) ──
    const ownWithoutCompetitor = ownProducts
      .filter(p => !uniqueOwnMatched.has(p.id) && Number(p.price) >= MIN_VALID_PRICE)
      .length;

    return NextResponse.json({
      ok: true,
      kpis: {
        totalOwnProducts,
        totalCompetitorPrices,
        matchedPrices: matched.length,
        unmatchedPrices: unmatched.length,
        uniqueOwnMatched: uniqueOwnMatched.size,
        coveragePercent,
        ownWithoutCompetitor,
        competitorCount: stores.length,
      },
      matchMethods,
      competitorProfiles,
      categories,
      priceDistribution,
      opportunities: opportunities.slice(0, 30),
    });
  } catch (error: any) {
    console.error("[Intelligence]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
