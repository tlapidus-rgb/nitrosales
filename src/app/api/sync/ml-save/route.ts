export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// MercadoLibre Save — Receives search results from client-side
// ══════════════════════════════════════════════════════════════
// The ML API blocks datacenter IPs, so searches run in the
// user's browser (residential IP). Results are POSTed here
// for matching and storage. Safe: createMany with skipDuplicates.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { findBestMatch, OwnProduct } from "@/lib/connectors/competitor-discovery";

export const revalidate = 0;
export const maxDuration = 30;

interface MLResultFromClient {
  id: string;         // MLA123456789
  title: string;
  price: number;
  currency_id: string;
  permalink: string;
  thumbnail: string;
  condition: string;
  seller: { id: number; nickname: string };
  shipping?: { free_shipping: boolean };
  attributes?: Array<{ id: string; value_name: string | null }>;
}

export async function POST(req: NextRequest) {
  const start = Date.now();

  try {
    const body = await req.json();
    const { results, orgId } = body as { results: MLResultFromClient[]; orgId?: string };

    if (!results || !Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ ok: false, error: "No results provided" }, { status: 400 });
    }

    // Find org
    const effectiveOrgId = orgId || (await prisma.organization.findFirst({ select: { id: true } }))?.id;
    if (!effectiveOrgId) {
      return NextResponse.json({ ok: false, error: "No organization found" }, { status: 400 });
    }

    // Get own products for matching
    const products = await prisma.product.findMany({
      where: { organizationId: effectiveOrgId, isActive: true },
      select: { id: true, name: true, sku: true, ean: true, brand: true, category: true, price: true },
    });
    const ownProducts: OwnProduct[] = products.map(p => ({
      id: p.id, name: p.name, sku: p.sku, ean: p.ean,
      brand: p.brand, category: p.category, price: Number(p.price),
    }));

    // Build EAN lookup
    const eanLookup = new Map<string, OwnProduct>();
    for (const own of ownProducts) {
      if (own.ean) eanLookup.set(own.ean, own);
    }

    // Get existing URLs
    const existingPrices = await prisma.competitorPrice.findMany({
      where: { organizationId: effectiveOrgId, productUrl: { contains: "mercadolibre.com" } },
      select: { productUrl: true },
    });
    const existingUrls = new Set(existingPrices.map(p => p.productUrl));

    // Process results: extract EAN, match, group by seller
    const matched: Array<{
      item: MLResultFromClient;
      ownProduct: OwnProduct;
      matchScore: number;
      matchReason: string;
      matchMethod: string;
      ean?: string;
    }> = [];

    for (const item of results) {
      if (existingUrls.has(item.permalink)) continue;

      // Extract EAN from attributes
      let ean: string | undefined;
      if (item.attributes) {
        for (const attr of item.attributes) {
          if (["GTIN", "EAN", "UPC"].includes(attr.id) && attr.value_name) {
            const val = attr.value_name.trim();
            if (/^\d{8,14}$/.test(val)) { ean = val; break; }
          }
        }
      }

      // Try EAN match
      if (ean && eanLookup.has(ean)) {
        matched.push({
          item, ownProduct: eanLookup.get(ean)!,
          matchScore: 100, matchReason: `EAN exacto: ${ean}`,
          matchMethod: "EAN_EXACT", ean,
        });
        continue;
      }

      // Fuzzy match
      const match = findBestMatch(item.title, ownProducts, 45, ean);
      if (match) {
        matched.push({
          item, ownProduct: match.product,
          matchScore: match.score, matchReason: match.reason,
          matchMethod: match.method, ean,
        });
      }
    }

    // Group by seller and create CompetitorStore + CompetitorPrice
    const sellerMap = new Map<number, { nickname: string; items: typeof matched }>();
    for (const m of matched) {
      const sid = m.item.seller.id;
      if (!sellerMap.has(sid)) sellerMap.set(sid, { nickname: m.item.seller.nickname, items: [] });
      sellerMap.get(sid)!.items.push(m);
    }

    let totalCreated = 0;
    const sellerStats: Array<{ seller: string; created: number }> = [];

    for (const [sellerId, seller] of sellerMap) {
      const storeName = `MercadoLibre - ${seller.nickname}`;
      const storeWebsite = `https://www.mercadolibre.com.ar/perfil/${seller.nickname}`;

      let store = await prisma.competitorStore.findFirst({
        where: { organizationId: effectiveOrgId, website: storeWebsite },
      });
      if (!store) {
        store = await prisma.competitorStore.create({
          data: { organizationId: effectiveOrgId, name: storeName, website: storeWebsite, isActive: true },
        });
      }

      const today = new Date().toISOString().split("T")[0];
      const now = new Date();

      const result = await prisma.competitorPrice.createMany({
        data: seller.items.map(m => ({
          organizationId: effectiveOrgId,
          competitorId: store!.id,
          productUrl: m.item.permalink,
          productName: m.item.title,
          currentPrice: m.item.price,
          currency: m.item.currency_id || "ARS",
          imageUrl: m.item.thumbnail || null,
          lastScrapedAt: now,
          scrapeStatus: "OK",
          ownProductId: m.ownProduct.id,
          competitorEan: m.ean || null,
          matchMethod: m.matchMethod,
          scrapedData: [{ date: today, price: m.item.price }],
        })),
        skipDuplicates: true,
      });

      totalCreated += result.count;
      sellerStats.push({ seller: seller.nickname, created: result.count });
    }

    return NextResponse.json({
      ok: true,
      received: results.length,
      matched: matched.length,
      created: totalCreated,
      sellers: sellerStats,
      alreadyTracked: results.filter(r => existingUrls.has(r.permalink)).length,
      elapsedMs: Date.now() - start,
    });
  } catch (error: any) {
    console.error("[ML Save]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
