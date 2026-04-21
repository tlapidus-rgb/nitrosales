import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { getVtexConfig } from "@/lib/vtex-credentials";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES = 10; // 500 products per call — safe within 60s

/* ── helpers ─────────────────────────────────────── */

function calcStock(items: any[]): number {
  let total = 0;
  for (const item of items || []) {
    for (const seller of item.sellers || []) {
      total += seller.commertialOffer?.AvailableQuantity || 0;
    }
  }
  return total;
}

function extractCategory(categories: string[] | undefined): string | null {
  if (!categories || categories.length === 0) return null;
  const last = categories[categories.length - 1] || categories[0] || "";
  const parts = last.replace(/^\/|\/$/g, "").split("/");
  return parts[parts.length - 1] || null;
}

function extractImage(items: any[]): string | null {
  for (const item of items || []) {
    for (const img of item.images || []) {
      if (img.imageUrl) return img.imageUrl;
    }
  }
  return null;
}

function extractPrice(items: any[]): number {
  for (const item of items || []) {
    for (const seller of item.sellers || []) {
      const price = seller.commertialOffer?.Price;
      if (price && price > 0) return price;
    }
  }
  return 0;
}

function extractCostPrice(items: any[]): number | null {
  // VTEX Search API: items[].sellers[].commertialOffer no expone CostPrice directamente.
  // El CostPrice viene del SKU Detail API (catalog_system/pvt/sku/stockkeepingunitbyid).
  // Aquí intentamos extraerlo si está presente en la respuesta extendida.
  for (const item of items || []) {
    for (const seller of item.sellers || []) {
      const cost = seller.commertialOffer?.CostPrice;
      if (cost && cost > 0) return cost;
    }
  }
  return null;
}

/* ── main sync (with pagination support) ─────────── */

async function syncCatalog(startPage: number, maxPages: number, ORG_ID: string) {
  const syncedAt = new Date();
  const vtexIds: string[] = [];
  let created = 0;
  let updated = 0;
  let page = startPage;
  let pagesProcessed = 0;
  let reachedEnd = false;

  // Multi-tenant: resolver account VTEX de la org (no hardcodear mundojuguete)
  const vtexConfig = await getVtexConfig(ORG_ID);
  const searchBase = `${vtexConfig.baseUrl}/api/catalog_system/pub/products/search`;

  while (pagesProcessed < maxPages) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const url = `${searchBase}?_from=${from}&_to=${to}`;

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      console.error(`VTEX search page ${page} error: ${res.status}`);
      break;
    }

    const products: any[] = await res.json();
    if (!products || products.length === 0) {
      reachedEnd = true;
      break;
    }

    // Build upsert data and execute in a transaction for speed
    const upsertOps = products.map((p: any) => {
      const externalId = String(p.productId);
      vtexIds.push(externalId);

      const costPrice = extractCostPrice(p.items);
      const extractedPrice = extractPrice(p.items);
      const baseData = {
        name: p.productName || "Sin nombre",
        brand: p.brand || null,
        category: extractCategory(p.categories),
        imageUrl: extractImage(p.items),
        stock: calcStock(p.items),
        stockUpdatedAt: syncedAt,
        isActive: true,
        // Solo setear costPrice si VTEX devuelve el dato (no pisar valor manual)
        ...(costPrice !== null ? { costPrice } : {}),
      };

      return prisma.product.upsert({
        where: {
          organizationId_externalId: {
            organizationId: ORG_ID,
            externalId,
          },
        },
        // UPDATE: solo pisar price si VTEX devuelve un precio válido (>0)
        update: {
          ...baseData,
          ...(extractedPrice > 0 ? { price: extractedPrice } : {}),
        },
        // CREATE: siempre setear price (incluso 0 para productos nuevos)
        create: { organizationId: ORG_ID, externalId, ...baseData, price: extractedPrice },
      });
    });

    // Execute as transaction (faster than individual queries)
    const results = await prisma.$transaction(upsertOps);
    for (const prod of results) {
      if (Math.abs(prod.createdAt.getTime() - prod.updatedAt.getTime()) < 1000) {
        created++;
      } else {
        updated++;
      }
    }

    if (products.length < PAGE_SIZE) {
      reachedEnd = true;
      break;
    }
    page++;
    pagesProcessed++;
  }

  // Only deactivate if we've synced the ENTIRE catalog (reachedEnd from page 0)
  let deactivated = 0;
  if (reachedEnd && startPage === 0 && vtexIds.length > 0) {
    const result = await prisma.product.updateMany({
      where: {
        organizationId: ORG_ID,
        isActive: true,
        externalId: { notIn: vtexIds },
        stockUpdatedAt: { not: null },
      },
      data: { isActive: false },
    });
    deactivated = result.count;
  }

  // Update connector lastSyncAt + marcar sync exitoso (limpia error previo)
  try {
    await prisma.connection.updateMany({
      where: { organizationId: ORG_ID, platform: "VTEX" },
      data: { lastSyncAt: syncedAt, lastSuccessfulSyncAt: syncedAt, lastSyncError: null },
    });
  } catch (_) {}

  return {
    ok: true,
    stats: {
      total: vtexIds.length,
      created,
      updated,
      deactivated,
      pagesProcessed: pagesProcessed + (reachedEnd ? 1 : 0),
      startPage,
      reachedEnd,
    },
    nextPage: reachedEnd ? null : page,
    syncedAt: syncedAt.toISOString(),
  };
}

/* ── route handlers ──────────────────────────────── */

export async function GET(req: NextRequest) {
  const ORG_ID = await getOrganizationId();
  const key = req.nextUrl.searchParams.get("key");
  if (key !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const startPage = parseInt(req.nextUrl.searchParams.get("from") || "0");
  const maxPages = parseInt(req.nextUrl.searchParams.get("pages") || String(DEFAULT_MAX_PAGES));
  try {
    const result = await syncCatalog(startPage, maxPages, ORG_ID);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Catalog sync error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ORG_ID = await getOrganizationId();
  try {
    const body = await req.json().catch(() => ({}));
    const syncKey = body.syncKey || body.key;
    if (syncKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const startPage = body.from || 0;
    const maxPages = body.pages || DEFAULT_MAX_PAGES;
    const result = await syncCatalog(startPage, maxPages, ORG_ID);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Catalog sync error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
