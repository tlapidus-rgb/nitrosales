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
      select: { id: true, name: true, sku: true, brand: true, category: true, price: true },
    });

    const ownProducts: OwnProduct[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
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
    const { platform, discovered } = await discoverCompetitorProducts(
      store.website,
      ownProducts,
      {
        maxProducts: 500,
        maxRuntimeMs: 50000,
      }
    );

    // Filter out already-monitored URLs
    const newProducts = discovered.filter((d) => !existingUrls.has(d.url));

    // Auto-create CompetitorPrice entries for matched products (score >= 50)
    const created: Array<{ id: string; url: string; name: string; price: number; matchedTo: string | null; score: number }> = [];

    for (const product of newProducts) {
      if (product.matchScore >= 50) {
        const entry = await prisma.competitorPrice.create({
          data: {
            organizationId: org.id,
            competitorId: store.id,
            productUrl: product.url,
            productName: product.name,
            currentPrice: product.price,
            currency: product.currency || "ARS",
            imageUrl: product.imageUrl || null,
            lastScrapedAt: new Date(),
            scrapeStatus: "OK",
            ownProductId: product.matchedOwnProduct?.id || null,
            scrapedData: [{ date: new Date().toISOString().split("T")[0], price: product.price }],
          },
        });

        created.push({
          id: entry.id,
          url: product.url,
          name: product.name,
          price: product.price,
          matchedTo: product.matchedOwnProduct?.name || null,
          score: product.matchScore,
        });
      }
    }

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
