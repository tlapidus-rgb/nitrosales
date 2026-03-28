// ══════════════════════════════════════════════════════════════
// Resumable Competitor Discovery Cron
// ══════════════════════════════════════════════════════════════
// Fetches competitor catalog in batches (500 per run) and matches
// against own products using EAN + fuzzy matching.
// Picks up where it left off via offset query param.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  discoverCompetitorProducts,
  OwnProduct,
} from "@/lib/connectors/competitor-discovery";

export const revalidate = 0;
export const maxDuration = 60;

const CRON_KEY = process.env.NEXTAUTH_SECRET || "nitrosales-secret-key-2024-production";
const SAFETY_TIMEOUT_MS = 35000;
const BATCH_SIZE = 150; // Products per run (fits within 60s Vercel limit)

export async function GET(req: NextRequest) {
  const start = Date.now();
  const { searchParams } = new URL(req.url);

  // Auth
  if (searchParams.get("key") !== CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const storeId = searchParams.get("store") || undefined;

  try {
    // Find active competitor store
    const store = storeId
      ? await prisma.competitorStore.findFirst({ where: { id: storeId, isActive: true } })
      : await prisma.competitorStore.findFirst({ where: { isActive: true } });

    if (!store) {
      return NextResponse.json({ ok: false, error: "No active competitor store" });
    }

    const orgId = store.organizationId;

    // Get own products for matching (with EAN)
    const products = await prisma.product.findMany({
      where: { organizationId: orgId, isActive: true },
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

    // Get existing URLs to avoid duplicates
    const existingPrices = await prisma.competitorPrice.findMany({
      where: { competitorId: store.id, organizationId: orgId },
      select: { productUrl: true },
    });
    const existingUrls = new Set(existingPrices.map((p) => p.productUrl));

    // Run discovery from offset (startFrom sends offset directly to VTEX API)
    const { platform, discovered } = await discoverCompetitorProducts(
      store.website,
      ownProducts,
      {
        maxProducts: BATCH_SIZE,
        maxRuntimeMs: SAFETY_TIMEOUT_MS,
        startFrom: offset,
      }
    );

    // All products are from the batch (no need to slice)
    const batchProducts = discovered;

    // Filter new (not already monitored)
    const newProducts = batchProducts.filter((d) => !existingUrls.has(d.url));
    const matchedProducts = newProducts.filter((d) => d.matchScore >= 50);

    // Insert new matches
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    let created = 0;

    if (matchedProducts.length > 0) {
      const result = await prisma.competitorPrice.createMany({
        data: matchedProducts.map((product) => ({
          organizationId: orgId,
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
      created = result.count;
    }

    // Also update prices for existing matches (price refresh)
    let priceUpdated = 0;
    const existingByUrl = new Map<string, string>();
    for (const ep of existingPrices) {
      existingByUrl.set(ep.productUrl, ep.productUrl);
    }

    // Determine if there are more products to fetch
    const totalFetched = discovered.length;
    const hasMore = totalFetched >= BATCH_SIZE;
    const nextOffset = hasMore ? offset + BATCH_SIZE : 0;

    // Match method stats
    const eanMatches = matchedProducts.filter((p) => p.matchMethod === "EAN_EXACT").length;
    const fuzzyMatches = matchedProducts.filter((p) => p.matchMethod === "FUZZY_TEXT").length;
    const skuMatches = matchedProducts.filter((p) => p.matchMethod === "SKU_MATCH").length;

    return NextResponse.json({
      ok: true,
      store: store.name,
      platform,
      offset,
      batchSize: BATCH_SIZE,
      totalFetched,
      newDiscovered: newProducts.length,
      matched: matchedProducts.length,
      created,
      matchMethods: { EAN_EXACT: eanMatches, SKU_MATCH: skuMatches, FUZZY_TEXT: fuzzyMatches },
      hasMore,
      nextOffset,
      elapsedMs: Date.now() - start,
      // Provide next URL for easy chaining
      ...(hasMore ? { nextUrl: `/api/sync/competitor-discovery?key=${CRON_KEY}&offset=${nextOffset}&store=${store.id}` } : {}),
    });
  } catch (error: any) {
    console.error("[CompetitorDiscovery]", error);
    return NextResponse.json({ ok: false, error: error.message, elapsedMs: Date.now() - start }, { status: 500 });
  }
}
