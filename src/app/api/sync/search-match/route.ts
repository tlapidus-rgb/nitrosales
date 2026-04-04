// ══════════════════════════════════════════════════════════════
// Search-First Price Matching — Cron & Manual Endpoint
// ══════════════════════════════════════════════════════════════
// NEW approach: instead of scraping competitor catalog and fuzzy
// matching, we search for EACH of our products on the competitor.
//
// Usage:
//   GET /api/sync/search-match?key=...&store=STORE_ID
//   GET /api/sync/search-match?key=...&store=STORE_ID&maxProducts=50
//   GET /api/sync/search-match?key=...&platform=mercadolibre&maxProducts=30
//   GET /api/sync/search-match?key=...&store=STORE_ID&offset=100
//   GET /api/sync/search-match?key=...&dry=true  (test without writing)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { OwnProduct } from "@/lib/connectors/competitor-discovery";
import {
  searchFirstMatch,
  detectCompetitorPlatform,
  CompetitorPlatform,
  SearchMatch,
} from "@/lib/connectors/search-first-matcher";
import { getAccessToken, MLCredentials } from "@/lib/connectors/mercadolibre";

export const dynamic = "force-dynamic";

export const revalidate = 0;
export const maxDuration = 60;

const CRON_KEY = process.env.NEXTAUTH_SECRET || "nitrosales-secret-key-2024-production";
const SAFETY_TIMEOUT_MS = 45000;
const DEFAULT_BATCH = 50;

export async function GET(req: NextRequest) {
  const start = Date.now();
  const { searchParams } = new URL(req.url);

  // Auth
  if (searchParams.get("key") !== CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storeId = searchParams.get("store") || undefined;
  const platformOverride = searchParams.get("platform") as CompetitorPlatform | null;
  const maxProducts = Math.min(
    parseInt(searchParams.get("maxProducts") || String(DEFAULT_BATCH), 10),
    200
  );
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const dryRun = searchParams.get("dry") === "true";

  try {
    // ── 1. Determine org and target ────────────────────────────

    let orgId: string;
    let targetUrl: string;
    let storeName: string;
    let competitorStoreId: string;
    let platform: CompetitorPlatform;

    if (platformOverride === "mercadolibre") {
      // MercadoLibre mode: search across ML
      const firstOrg = await prisma.organization.findFirst({
        where: { products: { some: { isActive: true } } },
        select: { id: true },
      });
      if (!firstOrg) {
        return NextResponse.json({ ok: false, error: "No organization found" });
      }
      orgId = firstOrg.id;
      targetUrl = "mercadolibre";
      storeName = "MercadoLibre";
      platform = "mercadolibre";

      // Ensure ML store exists
      let mlStore = await prisma.competitorStore.findFirst({
        where: { organizationId: orgId, website: { contains: "mercadolibre" } },
      });
      if (!mlStore) {
        mlStore = await prisma.competitorStore.create({
          data: {
            organizationId: orgId,
            name: "MercadoLibre Argentina",
            website: "https://www.mercadolibre.com.ar",
            isActive: true,
          },
        });
      }
      competitorStoreId = mlStore.id;
    } else {
      // Store-based mode
      const store = storeId
        ? await prisma.competitorStore.findFirst({ where: { id: storeId, isActive: true } })
        : await prisma.competitorStore.findFirst({
            where: { isActive: true, website: { not: { contains: "mercadolibre" } } },
          });

      if (!store) {
        return NextResponse.json({ ok: false, error: "No active competitor store found" });
      }

      orgId = store.organizationId;
      targetUrl = store.website;
      storeName = store.name;
      competitorStoreId = store.id;

      // Auto-detect platform
      const detected = platformOverride || await detectCompetitorPlatform(store.website);
      if (detected === "unknown") {
        return NextResponse.json({
          ok: false,
          error: `Cannot detect platform for ${store.website}. Only VTEX, Shopify, and MercadoLibre are supported for search-first.`,
        });
      }
      platform = detected;
    }

    // ── 2. Get own products (paginated) ────────────────────────

    const allProducts = await prisma.product.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true, sku: true, ean: true, brand: true, category: true, price: true },
      orderBy: [
        // Products with EAN first (highest match probability)
        { ean: "desc" },
        { name: "asc" },
      ],
      skip: offset,
      take: maxProducts,
    });

    const ownProducts: OwnProduct[] = allProducts.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      ean: p.ean,
      brand: p.brand,
      category: p.category,
      price: Number(p.price),
    }));

    if (ownProducts.length === 0) {
      return NextResponse.json({ ok: true, message: "No more products to search", offset, searched: 0, matched: 0 });
    }

    // ── 3. Get already tracked URLs to avoid duplicates ────────

    const existingPrices = await prisma.competitorPrice.findMany({
      where: { organizationId: orgId, competitorId: competitorStoreId },
      select: { productUrl: true, ownProductId: true },
    });
    const existingUrls = new Set(existingPrices.map((p) => p.productUrl));
    const existingOwnIds = new Set(
      existingPrices.filter((p) => p.ownProductId).map((p) => p.ownProductId!)
    );

    // Filter out products that already have a match for this store
    const productsToSearch = ownProducts.filter((p) => !existingOwnIds.has(p.id));

    if (productsToSearch.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "All products in this batch already have matches",
        offset,
        searched: 0,
        matched: 0,
        alreadyMatched: ownProducts.length,
        hasMore: offset + maxProducts < await prisma.product.count({ where: { organizationId: orgId, isActive: true } }),
        nextUrl: `/api/sync/search-match?key=${CRON_KEY}&store=${competitorStoreId}&offset=${offset + maxProducts}&maxProducts=${maxProducts}`,
      });
    }

    // ── 4. Get ML access token if needed ───────────────────────

    let mlAccessToken: string | undefined;
    if (platform === "mercadolibre") {
      try {
        const connection = await prisma.connection.findFirst({
          where: { platform: "MERCADOLIBRE" as any, status: "ACTIVE" },
        });
        if (connection) {
          const creds = connection.credentials as unknown as MLCredentials;
          mlAccessToken = await getAccessToken(creds);
        }
      } catch (authErr: any) {
        console.warn(`[SearchMatch] ML auth failed: ${authErr.message}`);
      }
    }

    // ── 5. Run search-first matching ───────────────────────────

    const result = await searchFirstMatch(productsToSearch, targetUrl, platform, {
      maxProducts: productsToSearch.length,
      maxRuntimeMs: SAFETY_TIMEOUT_MS,
      delayMs: platform === "mercadolibre" ? (mlAccessToken ? 150 : 350) : 300,
      mlAccessToken,
    });

    // ── 6. Filter new matches (not already tracked) ────────────

    const newMatches = result.matches.filter((m) => !existingUrls.has(m.competitorUrl));

    // ── 7. Write to DB (unless dry run) ────────────────────────

    let created = 0;
    const sampleMatches: Array<{ own: string; comp: string; method: string; confidence: number; price: number }> = [];

    if (!dryRun && newMatches.length > 0) {
      const today = new Date().toISOString().split("T")[0];
      const now = new Date();

      // For ML matches, group by seller and create stores
      if (platform === "mercadolibre") {
        // Group by URL domain to find sellers
        const byStore = new Map<string, SearchMatch[]>();
        for (const m of newMatches) {
          // ML URLs contain seller info — use the default ML store
          const key = competitorStoreId;
          if (!byStore.has(key)) byStore.set(key, []);
          byStore.get(key)!.push(m);
        }

        for (const [storeKey, matches] of byStore) {
          const res = await prisma.competitorPrice.createMany({
            data: matches.map((m) => ({
              organizationId: orgId,
              competitorId: storeKey,
              productUrl: m.competitorUrl,
              productName: m.competitorName,
              currentPrice: m.competitorPrice,
              currency: m.currency || "ARS",
              imageUrl: m.competitorImageUrl || null,
              lastScrapedAt: now,
              scrapeStatus: "OK",
              ownProductId: m.ownProduct.id,
              competitorEan: m.competitorEan || null,
              matchMethod: m.matchMethod,
              scrapedData: [{ date: today, price: m.competitorPrice }],
            })),
            skipDuplicates: true,
          });
          created += res.count;
        }
      } else {
        // VTEX/Shopify — single store
        const res = await prisma.competitorPrice.createMany({
          data: newMatches.map((m) => ({
            organizationId: orgId,
            competitorId: competitorStoreId,
            productUrl: m.competitorUrl,
            productName: m.competitorName,
            currentPrice: m.competitorPrice,
            currency: m.currency || "ARS",
            imageUrl: m.competitorImageUrl || null,
            lastScrapedAt: now,
            scrapeStatus: "OK",
            ownProductId: m.ownProduct.id,
            competitorEan: m.competitorEan || null,
            matchMethod: m.matchMethod,
            scrapedData: [{ date: today, price: m.competitorPrice }],
          })),
          skipDuplicates: true,
        });
        created = res.count;
      }
    }

    // Sample matches for debugging
    for (const m of newMatches.slice(0, 10)) {
      sampleMatches.push({
        own: m.ownProduct.name.substring(0, 50),
        comp: m.competitorName.substring(0, 50),
        method: m.matchMethod,
        confidence: m.matchConfidence,
        price: m.competitorPrice,
      });
    }

    // ── 8. Stats ───────────────────────────────────────────────

    const methodCounts: Record<string, number> = {};
    for (const m of newMatches) {
      methodCounts[m.matchMethod] = (methodCounts[m.matchMethod] || 0) + 1;
    }

    const totalOwnProducts = await prisma.product.count({
      where: { organizationId: orgId, isActive: true },
    });
    const hasMore = offset + maxProducts < totalOwnProducts;

    return NextResponse.json({
      ok: true,
      dryRun,
      store: storeName,
      platform,
      ...(platform === "mercadolibre" ? { hasMLAuth: !!mlAccessToken } : {}),
      offset,
      batchSize: maxProducts,
      productsInBatch: ownProducts.length,
      productsSearched: result.searched,
      skippedAlreadyMatched: ownProducts.length - productsToSearch.length,
      totalMatches: result.matches.length,
      newMatches: newMatches.length,
      created,
      matchMethods: methodCounts,
      errors: result.errors,
      sampleMatches,
      hasMore,
      totalOwnProducts,
      elapsedMs: Date.now() - start,
      ...(hasMore ? {
        nextUrl: `/api/sync/search-match?key=${CRON_KEY}&store=${competitorStoreId}&offset=${offset + maxProducts}&maxProducts=${maxProducts}${platformOverride ? `&platform=${platformOverride}` : ""}`,
      } : {}),
    });
  } catch (error: any) {
    console.error("[SearchMatch]", error);
    return NextResponse.json(
      { ok: false, error: error.message, elapsedMs: Date.now() - start },
      { status: 500 }
    );
  }
}
