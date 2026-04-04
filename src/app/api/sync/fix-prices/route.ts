// ══════════════════════════════════════════════════════════════
// Fix Prices — Actualiza productos con price=0 usando VTEX Search API
// ══════════════════════════════════════════════════════════════
// Busca productos en nuestra DB con precio 0, los busca uno a uno
// en la API pública de VTEX (por productId) y actualiza el precio.
//
// Uso:
//   GET /api/sync/fix-prices?key=<SECRET>&limit=200
//   GET /api/sync/fix-prices?key=<SECRET>&limit=200&dry=true
//
// Procesa hasta 200 productos por llamada (~45s).
// Llamar múltiples veces para cubrir los ~17K con precio 0.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VTEX_ACCOUNT = "mundojuguete";
const SAFETY_TIMEOUT_MS = 50000; // 50s (10s margin)
const CONCURRENT = 10; // Parallel requests
const DELAY_BETWEEN_BATCHES_MS = 100;

interface PriceResult {
  externalId: string;
  name: string;
  oldPrice: number;
  newPrice: number;
}

async function fetchVtexPrice(productId: string): Promise<number> {
  try {
    const url = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br/api/catalog_system/pub/products/search?fq=productId:${productId}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return 0;

    const products = await res.json();
    if (!Array.isArray(products) || products.length === 0) return 0;

    // Extract best price from any item/seller
    for (const product of products) {
      for (const item of product.items || []) {
        for (const seller of item.sellers || []) {
          const price = seller.commertialOffer?.Price;
          if (price && price > 0) return price;
        }
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    const key = req.nextUrl.searchParams.get("key") || "";
    if (key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const ORG_ID = await getOrganizationId();
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "200", 10), 500);
    const isDry = req.nextUrl.searchParams.get("dry") === "true";
    const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0", 10);

    // Get products with price = 0 that have stock > 0 (prioritize active products)
    const zeroPriceProducts = await prisma.product.findMany({
      where: {
        organizationId: ORG_ID,
        price: { equals: 0 },
        isActive: true,
      },
      select: { id: true, externalId: true, name: true, price: true },
      orderBy: { stock: "desc" }, // Products with more stock first
      skip: offset,
      take: limit,
    });

    const totalZero = await prisma.product.count({
      where: {
        organizationId: ORG_ID,
        price: { equals: 0 },
        isActive: true,
      },
    });

    if (zeroPriceProducts.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No more products with price=0",
        totalRemaining: 0,
        elapsedMs: Date.now() - startTime,
      });
    }

    // Process in concurrent batches
    let updated = 0;
    let notFound = 0;
    let errors = 0;
    const updates: PriceResult[] = [];

    for (let i = 0; i < zeroPriceProducts.length; i += CONCURRENT) {
      // Safety timeout
      if (Date.now() - startTime > SAFETY_TIMEOUT_MS) {
        console.log(`[FixPrices] Timeout safety at product ${i}/${zeroPriceProducts.length}`);
        break;
      }

      const batch = zeroPriceProducts.slice(i, i + CONCURRENT);
      const results = await Promise.allSettled(
        batch.map(async (prod) => {
          const newPrice = await fetchVtexPrice(prod.externalId);
          return { prod, newPrice };
        })
      );

      for (const result of results) {
        if (result.status === "rejected") {
          errors++;
          continue;
        }

        const { prod, newPrice } = result.value;
        if (newPrice <= 0) {
          notFound++;
          continue;
        }

        if (!isDry) {
          await prisma.product.update({
            where: { id: prod.id },
            data: { price: newPrice },
          });
        }

        updated++;
        if (updates.length < 20) {
          updates.push({
            externalId: prod.externalId,
            name: prod.name.substring(0, 50),
            oldPrice: 0,
            newPrice,
          });
        }
      }

      // Small delay between batches
      if (i + CONCURRENT < zeroPriceProducts.length) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    const elapsed = Date.now() - startTime;
    const processed = updated + notFound + errors;
    const remaining = totalZero - updated;

    return NextResponse.json({
      ok: true,
      dryRun: isDry,
      processed,
      updated,
      notFoundInVtex: notFound,
      errors,
      totalZeroPrice: totalZero,
      remaining: Math.max(0, remaining),
      hasMore: remaining > 0,
      elapsedMs: elapsed,
      sampleUpdates: updates,
    });
  } catch (error) {
    console.error("[FixPrices] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
        elapsedMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
