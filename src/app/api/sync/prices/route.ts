// ══════════════════════════════════════════════════════════════
// Sync de Precios de Venta – VTEX Public API
// ══════════════════════════════════════════════════════════════
// Actualiza el campo `price` de los productos propios usando la
// API pública de VTEX que devuelve el precio REAL de venta
// (commertialOffer.Price), no el precio base del módulo de pricing.
//
// Uso:
//   GET /api/sync/prices?key=<NEXTAUTH_SECRET>&offset=0
//   GET /api/sync/prices?key=<NEXTAUTH_SECRET>&offset=0&dry=true  (sin escribir)
//   GET /api/sync/prices?key=<NEXTAUTH_SECRET>&offset=0&cat=14    (por categoría)
//
// Procesa ~200 productos por llamada (~45s). Llamar múltiples
// veces incrementando offset para cubrir todo el catálogo.
// VTEX limita a 2500 resultados sin filtro; usar &cat=ID para
// acceder a productos más allá de ese límite.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";
import { getVtexCredentials } from "@/lib/vtex-credentials";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Constantes ──
const PAGE_SIZE = 50; // VTEX devuelve max 50 productos por página
const PAGES_PER_RUN = 4; // 4 páginas × 50 = 200 productos por ejecución
const SAFETY_TIMEOUT_MS = 45000; // Detenerse a los 45s (15s margen)
const DELAY_BETWEEN_PAGES_MS = 200; // Ser respetuoso con la API

interface VtexPublicItem {
  itemId: string;
  sellers?: Array<{
    commertialOffer?: {
      Price?: number;
      ListPrice?: number;
      AvailableQuantity?: number;
    };
  }>;
}

interface VtexPublicProduct {
  productId: string;
  productName: string;
  items?: VtexPublicItem[];
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Auth (mismo patrón que inventory sync)
    const key = req.nextUrl.searchParams.get("key") || "";
    if (key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0", 10);
    const isDryRun = req.nextUrl.searchParams.get("dry") === "true";
    const categoryId = req.nextUrl.searchParams.get("cat") || ""; // Filtrar por categoría VTEX

    // 2. Org + VTEX account name
    const org = await getOrganization();
    const vtexCreds = await getVtexCredentials(org.id);
    const accountName = vtexCreds.accountName;

    // 3. Fetch products from VTEX public API
    const priceMap: Map<string, { price: number; listPrice: number; productName: string }> = new Map();
    let vtexTotal = 0;
    let pagesProcessed = 0;

    for (let page = 0; page < PAGES_PER_RUN; page++) {
      // Safety: no exceder timeout
      if (Date.now() - startTime > SAFETY_TIMEOUT_MS) {
        console.log(`[PriceSync] Timeout safety reached after ${page} pages`);
        break;
      }

      const from = offset + page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const catFilter = categoryId ? `&fq=C:/${categoryId}/` : "";
      const url = `https://${accountName}.vtexcommercestable.com.br/api/catalog_system/pub/products/search/?_from=${from}&_to=${to}${catFilter}`;

      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "NitroSales/1.0",
        },
        signal: AbortSignal.timeout(10000), // 10s timeout por request
      });

      // VTEX retorna 206 para paginación y a veces 400 cerca del final
      // pero aún devuelve datos válidos en ambos casos
      if (!res.ok && res.status !== 206 && res.status !== 416) {
        // Intentar parsear de todas formas — VTEX 400 a veces tiene data
        let maybeProducts: VtexPublicProduct[] = [];
        try { maybeProducts = await res.json(); } catch { /* ignore */ }
        if (!Array.isArray(maybeProducts) || maybeProducts.length === 0) {
          console.log(`[PriceSync] VTEX API returned ${res.status} with no data at offset ${from}`);
          break;
        }
        // Tenemos data a pesar del status code, procesar normalmente
        for (const product of maybeProducts) {
          for (const item of product.items || []) {
            const seller = item.sellers?.[0];
            const price = seller?.commertialOffer?.Price;
            const listPrice = seller?.commertialOffer?.ListPrice;
            if (price && price > 0) {
              priceMap.set(item.itemId, { price, listPrice: listPrice || price, productName: product.productName });
            }
          }
        }
        pagesProcessed++;
        continue;
      }

      // Parse total from resources header (format: "0-49/4919")
      const resources = res.headers.get("resources") || "";
      const totalMatch = resources.match(/\/(\d+)/);
      if (totalMatch) vtexTotal = parseInt(totalMatch[1], 10);

      const products: VtexPublicProduct[] = await res.json();

      if (!products || products.length === 0) {
        console.log(`[PriceSync] No more products at offset ${from}`);
        break;
      }

      // Extract prices from each product's items (SKUs)
      for (const product of products) {
        for (const item of product.items || []) {
          const seller = item.sellers?.[0];
          const price = seller?.commertialOffer?.Price;
          const listPrice = seller?.commertialOffer?.ListPrice;

          if (price && price > 0) {
            priceMap.set(item.itemId, {
              price,
              listPrice: listPrice || price,
              productName: product.productName,
            });
          }
        }
      }

      pagesProcessed++;

      // Delay entre páginas para no saturar la API
      if (page < PAGES_PER_RUN - 1) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_PAGES_MS));
      }
    }

    console.log(
      `[PriceSync] Fetched ${priceMap.size} SKU prices from ${pagesProcessed} pages (offset=${offset}, vtexTotal=${vtexTotal})`
    );

    // 4. Match con productos en DB y actualizar precios
    let updated = 0;
    let skipped = 0;
    let notFound = 0;
    const updates: Array<{ name: string; oldPrice: number; newPrice: number }> = [];

    if (priceMap.size > 0) {
      const externalIds = Array.from(priceMap.keys());

      const dbProducts = await prisma.product.findMany({
        where: {
          organizationId: org.id,
          externalId: { in: externalIds },
        },
        select: { id: true, externalId: true, name: true, price: true },
      });

      const dbByExtId = new Map(dbProducts.map((p) => [p.externalId, p]));

      for (const [itemId, vtexData] of priceMap.entries()) {
        const dbProduct = dbByExtId.get(itemId);

        if (!dbProduct) {
          notFound++;
          continue;
        }

        const oldPrice = dbProduct.price ? Number(dbProduct.price) : 0;
        const newPrice = vtexData.price;

        // Solo actualizar si el precio cambió
        if (Math.abs(oldPrice - newPrice) < 0.01) {
          skipped++;
          continue;
        }

        // Escribir solo si NO es dry-run
        if (!isDryRun) {
          await prisma.product.update({
            where: { id: dbProduct.id },
            data: { price: newPrice },
          });
        }

        updated++;
        if (updates.length < 20) {
          updates.push({
            name: dbProduct.name.substring(0, 50),
            oldPrice,
            newPrice,
          });
        }
      }
    }

    const elapsed = Date.now() - startTime;
    const nextOffset = offset + pagesProcessed * PAGE_SIZE;
    const hasMore = vtexTotal > 0 && nextOffset < vtexTotal;

    return NextResponse.json({
      ok: true,
      dryRun: isDryRun,
      offset,
      nextOffset: hasMore ? nextOffset : null,
      vtexTotal,
      pagesProcessed,
      skusFetched: priceMap.size,
      updated,
      skipped,
      notFound,
      hasMore,
      elapsedMs: elapsed,
      sampleUpdates: updates,
    });
  } catch (error) {
    console.error("[PriceSync] Error:", error);
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
