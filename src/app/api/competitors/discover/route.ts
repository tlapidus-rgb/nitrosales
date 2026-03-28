// ══════════════════════════════════════════════════════════════
// Competitor Auto-Discovery API
// ══════════════════════════════════════════════════════════════
// POST — Detect platform, fetch products via API, auto-match
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import {
  discoverCompetitorProducts,
  OwnProduct,
} from "@/lib/connectors/competitor-discovery";

export const revalidate = 0;
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const { competitorStoreId } = await req.json();

    if (!competitorStoreId) {
      return NextResponse.json({ error: "Missing competitorStoreId" }, { status: 400 });
    }

    const store = await prisma.competitorStore.findFirst({
      where: { id: competitorStoreId, organizationId: org.id },
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Get own products for matching
    const products = await prisma.product.findMany({
      where: { organizationId: org.id, isActive: true },
      select: { id: true, name: true, sku: true, ean: true, brand: true, category: true, price: true },
    });

    const ownProducts: OwnProduct[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      ean: p.ean,
      brand: p.brand,
      category: p.category,
      price: Number(p.price),
    }));

    // Get already-monitored URLs to avoid duplicates
    const existingPrices = await prisma.competitorPrice.findMany({
      where: { competitorId: store.id, organizationId: org.id },
      select: { productUrl: true },
    });
    const existingUrls = new Set(existingPrices.map((p) => p.productUrl));

    // Run discovery pipeline (now with platform detection)
    // Limit to 150 products to stay within Vercel's 60s timeout
    const { platform, discovered } = await discoverCompetitorProducts(
      store.website,
      ownProducts,
      {
        maxProducts: 500,
        maxRuntimeMs: 45000, // 45s safety margin (Vercel limit is 60s)
      }
    );

    // Filter out already-monitored URLs
    const newProducts = discovered.filter((d) => !existingUrls.has(d.url));

    // Auto-create CompetitorPrice entries for matched products (score >= 50)
    const matchedProducts = newProducts.filter((d) => d.matchScore >= 50);
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();

    // Batch insert for speed (avoid individual creates which are slow)
    if (matchedProducts.length > 0) {
      await prisma.competitorPrice.createMany({
        data: matchedProducts.map((product) => ({
          organizationId: org.id,
          competitorId: store.id,
          productUrl: product.url,
          productName: product.name,
          currentPrice: product.price,
          currency: product.currency || "ARS",
          imageUrl: product.imageUrl || null,
          lastScrapedAt: now,
          scrapeStatus: "OK",
          ownProductId: product.matchedOwnProduct?.id || null,
          competitorEan: product.competitorEan || null,
          matchMethod: product.matchMethod || "FUZZY_TEXT",
          scrapedData: [{ date: today, price: product.price }],
        })),
        skipDuplicates: true,
      });
    }

    // Build response summary
    const created = matchedProducts.map((product) => ({
      id: "",
      url: product.url,
      name: product.name,
      price: product.price,
      matchedTo: product.matchedOwnProduct?.name || null,
      score: product.matchScore,
      matchMethod: product.matchMethod,
      competitorEan: product.competitorEan,
    }));

    return NextResponse.json({
      success: true,
      store: store.name,
      platform,
      totalInCatalog: discovered.length,
      discovered: newProducts.length,
      matched: newProducts.filter((d) => d.matchScore >= 50).length,
      created: created.length,
      products: created,
      unmatched: newProducts
        .filter((d) => d.matchScore < 50)
        .slice(0, 20)
        .map((d) => ({
          url: d.url,
          name: d.name,
          price: d.price,
          bestScore: d.matchScore,
        })),
    });
  } catch (error: any) {
    console.error("[Discovery]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
