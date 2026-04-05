export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// MercadoLibre Competitor Discovery
// ══════════════════════════════════════════════════════════════
// Searches ML for products matching own catalog, creates
// CompetitorPrice entries for matches. Safe: uses createMany
// with skipDuplicates — never deletes or updates existing data.
//
// Usage:
//   GET /api/sync/ml-discovery?key=...&maxProducts=30
//   GET /api/sync/ml-discovery?key=...&store=STORE_ID&maxProducts=50
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { OwnProduct } from "@/lib/connectors/competitor-discovery";
import { discoverMLCompetitors, getAccessToken, MLCredentials } from "@/lib/connectors/mercadolibre";

export const revalidate = 0;
export const maxDuration = 60;

const CRON_KEY = process.env.NEXTAUTH_SECRET || "nitrosales-secret-key-2024-production";
const SAFETY_TIMEOUT_MS = 45000; // Leave 15s buffer for Vercel 60s limit
const DEFAULT_MAX_PRODUCTS = 30; // Conservative: 30 products × ~200ms each = ~6s of API calls

// ML "store" name used for CompetitorStore entries
const ML_STORE_PREFIX = "MercadoLibre";

export async function GET(req: NextRequest) {
  const start = Date.now();
  const { searchParams } = new URL(req.url);

  // Auth
  if (searchParams.get("key") !== CRON_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const maxProducts = Math.min(
    parseInt(searchParams.get("maxProducts") || String(DEFAULT_MAX_PRODUCTS), 10),
    100 // Hard cap
  );
  const orgId = searchParams.get("org") || undefined;

  try {
    // 1. Get ML credentials from Connection table
    const connection = await prisma.connection.findFirst({
      where: {
        platform: "MERCADOLIBRE" as any,
        status: "ACTIVE",
        ...(orgId ? { organizationId: orgId } : {}),
      },
    });

    // If no ML connection yet, try without auth (lower rate limit but works)
    let accessToken: string | undefined;
    let effectiveOrgId = orgId;

    if (connection) {
      effectiveOrgId = connection.organizationId;
      try {
        const creds = connection.credentials as unknown as MLCredentials;
        accessToken = await getAccessToken(creds);
      } catch (authErr: any) {
        console.warn("[ML Discovery] Auth failed, continuing without token:", authErr.message);
      }
    }

    // 2. If no orgId, find the first org with products
    if (!effectiveOrgId) {
      const firstOrg = await prisma.organization.findFirst({
        where: { products: { some: { isActive: true } } },
        select: { id: true },
      });
      if (!firstOrg) {
        return NextResponse.json({ ok: false, error: "No organization with products found" });
      }
      effectiveOrgId = firstOrg.id;
    }

    // 3. Get own products for matching
    const products = await prisma.product.findMany({
      where: { organizationId: effectiveOrgId, isActive: true },
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

    if (ownProducts.length === 0) {
      return NextResponse.json({ ok: false, error: "No own products to match against" });
    }

    // 4. Get existing ML URLs to avoid duplicates
    const existingPrices = await prisma.competitorPrice.findMany({
      where: {
        organizationId: effectiveOrgId,
        productUrl: { contains: "mercadolibre.com" },
      },
      select: { productUrl: true },
    });
    const existingUrls = new Set(existingPrices.map((p) => p.productUrl));

    // 5. Run ML discovery
    const { discovered, searchedProducts, totalMLResults } = await discoverMLCompetitors(
      ownProducts,
      {
        accessToken,
        maxProducts,
        maxRuntimeMs: SAFETY_TIMEOUT_MS,
        delayBetweenRequests: accessToken ? 100 : 300, // Slower without auth
      }
    );

    // 6. Filter to only new items (not already tracked)
    const newItems = discovered.filter((d) => !existingUrls.has(d.url));

    // 7. Group by seller and ensure CompetitorStore exists for each
    const sellerMap = new Map<string, { nickname: string; sellerId: number; items: typeof newItems }>();
    for (const item of newItems) {
      const key = `ml-${item.sellerId}`;
      if (!sellerMap.has(key)) {
        sellerMap.set(key, { nickname: item.sellerNickname, sellerId: item.sellerId, items: [] });
      }
      sellerMap.get(key)!.items.push(item);
    }

    let totalCreated = 0;
    const sellerStats: Array<{ seller: string; created: number }> = [];

    for (const [, seller] of sellerMap) {
      // Find or create CompetitorStore for this ML seller
      const storeName = `${ML_STORE_PREFIX} - ${seller.nickname}`;
      const storeWebsite = `https://www.mercadolibre.com.ar/perfil/${seller.nickname}`;

      let store = await prisma.competitorStore.findFirst({
        where: { organizationId: effectiveOrgId, website: storeWebsite },
      });

      if (!store) {
        store = await prisma.competitorStore.create({
          data: {
            organizationId: effectiveOrgId,
            name: storeName,
            website: storeWebsite,
            isActive: true,
          },
        });
      }

      // Insert competitor prices (safe: skipDuplicates)
      const today = new Date().toISOString().split("T")[0];
      const now = new Date();

      if (seller.items.length > 0) {
        const result = await prisma.competitorPrice.createMany({
          data: seller.items.map((item) => ({
            organizationId: effectiveOrgId!,
            competitorId: store!.id,
            productUrl: item.url,
            productName: item.title,
            currentPrice: item.price,
            currency: item.currency || "ARS",
            imageUrl: item.imageUrl || null,
            lastScrapedAt: now,
            scrapeStatus: "OK",
            ownProductId: item.matchedOwnProduct?.id || null,
            competitorEan: item.ean || null,
            matchMethod: item.matchMethod || "FUZZY_TEXT",
            scrapedData: [{ date: today, price: item.price }],
          })),
          skipDuplicates: true,
        });
        totalCreated += result.count;
        sellerStats.push({ seller: seller.nickname, created: result.count });
      }
    }

    // 8. Match method stats
    const eanMatches = newItems.filter((d) => d.matchMethod === "EAN_EXACT").length;
    const fuzzyMatches = newItems.filter((d) => d.matchMethod === "FUZZY_TEXT").length;
    const skuMatches = newItems.filter((d) => d.matchMethod === "SKU_MATCH").length;

    return NextResponse.json({
      ok: true,
      source: "mercadolibre",
      hasAuth: !!accessToken,
      ownProductsSearched: searchedProducts,
      totalMLResults,
      discovered: discovered.length,
      newItems: newItems.length,
      created: totalCreated,
      sellers: sellerStats,
      matchMethods: { EAN_EXACT: eanMatches, SKU_MATCH: skuMatches, FUZZY_TEXT: fuzzyMatches },
      existingTracked: existingUrls.size,
      elapsedMs: Date.now() - start,
    });
  } catch (error: any) {
    console.error("[ML Discovery]", error);
    return NextResponse.json(
      { ok: false, error: error.message, elapsedMs: Date.now() - start },
      { status: 500 }
    );
  }
}
