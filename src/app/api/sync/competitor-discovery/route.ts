// ══════════════════════════════════════════════════════════════
// Resumable Competitor Discovery Cron
// ══════════════════════════════════════════════════════════════
// Two modes:
//   1. Default (offset): paginated search (limited to ~180 products for VTEX)
//   2. byCategory=true (catIndex): iterates VTEX categories for FULL catalog
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
const SAFETY_TIMEOUT_MS = 30000;
const BATCH_SIZE = 80; // Products per run (conservative for 60s Vercel limit)

export async function GET(req: NextRequest) {
  const start = Date.now();
  const { searchParams } = new URL(req.url);

  // Auth
  if (searchParams.get("key") !== CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const catIndex = parseInt(searchParams.get("catIndex") || "0", 10);
  const byCategory = searchParams.get("byCategory") === "true";
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

    // Run discovery
    const { platform, discovered, lastCategoryIndex, totalCategories } =
      await discoverCompetitorProducts(store.website, ownProducts, {
        maxProducts: BATCH_SIZE,
        maxRuntimeMs: SAFETY_TIMEOUT_MS,
        ...(byCategory
          ? { byCategory: true, startCategoryIndex: catIndex }
          : { startFrom: offset }),
      });

    // Filter new (not already monitored)
    const newProducts = discovered.filter((d) => !existingUrls.has(d.url));
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

    // Determine if there are more to fetch
    const totalFetched = discovered.length;
    let hasMore: boolean;
    let nextParams: string;

    if (byCategory) {
      hasMore = (lastCategoryIndex ?? 0) + 1 < (totalCategories ?? 0);
      const nextCatIdx = (lastCategoryIndex ?? 0) + 1;
      nextParams = `byCategory=true&catIndex=${nextCatIdx}`;
    } else {
      hasMore = totalFetched >= BATCH_SIZE;
      const nextOff = offset + BATCH_SIZE;
      nextParams = `offset=${nextOff}`;
    }

    // Match method stats
    const eanMatches = matchedProducts.filter((p) => p.matchMethod === "EAN_EXACT").length;
    const fuzzyMatches = matchedProducts.filter((p) => p.matchMethod === "FUZZY_TEXT").length;
    const skuMatches = matchedProducts.filter((p) => p.matchMethod === "SKU_MATCH").length;

    return NextResponse.json({
      ok: true,
      store: store.name,
      platform,
      mode: byCategory ? "byCategory" : "offset",
      ...(byCategory
        ? { catIndex, lastCategoryIndex, totalCategories }
        : { offset }),
      batchSize: BATCH_SIZE,
      totalFetched,
      newDiscovered: newProducts.length,
      matched: matchedProducts.length,
      created,
      matchMethods: { EAN_EXACT: eanMatches, SKU_MATCH: skuMatches, FUZZY_TEXT: fuzzyMatches },
      hasMore,
      elapsedMs: Date.now() - start,
      ...(hasMore ? {
        nextUrl: `/api/sync/competitor-discovery?key=${CRON_KEY}&${nextParams}&store=${store.id}`,
      } : {}),
    });
  } catch (error: any) {
    console.error("[CompetitorDiscovery]", error);
    return NextResponse.json({ ok: false, error: error.message, elapsedMs: Date.now() - start }, { status: 500 });
  }
}
