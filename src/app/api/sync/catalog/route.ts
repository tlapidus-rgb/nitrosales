import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ORG_ID = "cmmmga1uq0000sb43w0krvvys";
const VTEX_SEARCH_BASE = "https://mundojuguete.vtexcommercestable.com.br/api/catalog_system/pub/products/search";
const PAGE_SIZE = 50;

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
  // VTEX categories come as "/Cat1/Cat2/Cat3/" — take last meaningful segment
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

/* ── main sync ───────────────────────────────────── */

async function syncCatalog() {
  const syncedAt = new Date();
  const vtexIds = new Set<string>();
  let created = 0;
  let updated = 0;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const url = `${VTEX_SEARCH_BASE}?_from=${from}&_to=${to}`;

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
      hasMore = false;
      break;
    }

    // Upsert batch
    const upserts = products.map((p: any) => {
      const externalId = String(p.productId);
      vtexIds.add(externalId);

      return prisma.product.upsert({
        where: {
          organizationId_externalId: {
            organizationId: ORG_ID,
            externalId,
          },
        },
        update: {
          name: p.productName || "Sin nombre",
          brand: p.brand || null,
          category: extractCategory(p.categories),
          imageUrl: extractImage(p.items),
          price: extractPrice(p.items),
          stock: calcStock(p.items),
          stockUpdatedAt: syncedAt,
          isActive: true,
        },
        create: {
          organizationId: ORG_ID,
          externalId,
          name: p.productName || "Sin nombre",
          brand: p.brand || null,
          category: extractCategory(p.categories),
          imageUrl: extractImage(p.items),
          price: extractPrice(p.items),
          stock: calcStock(p.items),
          stockUpdatedAt: syncedAt,
          isActive: true,
        },
      });
    });

    const results = await Promise.allSettled(upserts);
    for (const r of results) {
      if (r.status === "fulfilled") {
        // Check if createdAt equals updatedAt (within 1s) to determine if created
        const prod = r.value;
        if (Math.abs(prod.createdAt.getTime() - prod.updatedAt.getTime()) < 1000) {
          created++;
        } else {
          updated++;
        }
      }
    }

    if (products.length < PAGE_SIZE) {
      hasMore = false;
    }
    page++;
  }

  // Mark products not in VTEX catalog as inactive
  let deactivated = 0;
  if (vtexIds.size > 0) {
    const result = await prisma.product.updateMany({
      where: {
        organizationId: ORG_ID,
        isActive: true,
        externalId: { notIn: [...vtexIds] },
        // Only deactivate products that were previously synced (have stockUpdatedAt)
        stockUpdatedAt: { not: null },
      },
      data: { isActive: false },
    });
    deactivated = result.count;
  }

  // Update connector lastSyncAt
  try {
    await prisma.connection.updateMany({
      where: {
        organizationId: ORG_ID,
        platform: "VTEX",
      },
      data: {
        lastSyncAt: syncedAt,
      },
    });
  } catch (_) { /* ignore if connection record doesn't exist */ }

  return {
    ok: true,
    stats: {
      total: vtexIds.size,
      created,
      updated,
      deactivated,
      pages: page,
    },
    syncedAt: syncedAt.toISOString(),
  };
}

/* ── route handlers ──────────────────────────────── */

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const result = await syncCatalog();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Catalog sync error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const syncKey = body.syncKey || body.key;
    if (syncKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const result = await syncCatalog();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Catalog sync error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
