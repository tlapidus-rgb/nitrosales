// ══════════════════════════════════════════════════════════════
// Sync: Cost Prices from VTEX Pricing API
// ══════════════════════════════════════════════════════════════
// Fetches costPrice for all products using VTEX's Pricing API.
// The "Precio de costo" in VTEX admin lives in the Pricing module,
// NOT in the Catalog SKU Detail API.
//
// IMPORTANT: The VTEX API key needs "Pricing" permissions:
//   License Manager > Roles > add "Pricing - Full access" or similar.
//
// Usage:
//   GET /api/sync/cost-prices?key=<NEXTAUTH_SECRET>
//   Optional: &limit=100 (products per batch, default 100)
//   Optional: &offset=0 (skip first N products)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getVtexConfig } from "@/lib/vtex-credentials";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — cost sync can be slow

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch cost price from VTEX Pricing API.
 * Primary: /api/pricing/prices/{skuId} → costPrice field
 * Fallback: /api/catalog_system/pvt/sku/stockkeepingunitbyid/{skuId} → CostPrice field
 * (fallback for stores still on legacy pricing module)
 */
async function fetchCostPrice(
  baseUrl: string,
  headers: Record<string, string>,
  skuId: string
): Promise<{ costPrice: number | null; source: string }> {
  // 1. Try Pricing API (where "Precio de costo" actually lives)
  const pricingUrl = `${baseUrl}/api/pricing/prices/${skuId}`;
  try {
    const res = await fetch(pricingUrl, {
      headers: { ...headers, Accept: "application/json" },
    });

    if (res.ok) {
      const data = await res.json();
      // Pricing API returns: { costPrice, markup, basePrice, fixedPrices, ... }
      if (data.costPrice && data.costPrice > 0) {
        return { costPrice: data.costPrice, source: "pricing-api" };
      }
    } else if (res.status === 403) {
      // No permissions for Pricing API — fall through to catalog
    } else if (res.status !== 404) {
      // Unexpected error
      throw new Error(`VTEX Pricing API ${res.status} for SKU ${skuId}`);
    }
  } catch (err: any) {
    // If it's our thrown error, re-throw
    if (err.message?.includes("VTEX Pricing API")) throw err;
    // Network error, try fallback
  }

  // 2. Fallback: Catalog SKU Detail API (legacy — may have CostPrice)
  const catalogUrl = `${baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`;
  const res = await fetch(catalogUrl, {
    headers: { ...headers, Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`VTEX Catalog ${res.status} for SKU ${skuId}`);
  }

  const detail = await res.json();
  if (detail.CostPrice && detail.CostPrice > 0) {
    return { costPrice: detail.CostPrice, source: "catalog-api" };
  }

  return { costPrice: null, source: "none" };
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100");
  const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0");

  try {
    // Get VTEX connection
    const connection = await prisma.connection.findFirst({
      where: { platform: "VTEX", status: "ACTIVE" },
      include: { organization: true },
    });

    if (!connection) {
      return NextResponse.json({ error: "No active VTEX connection" }, { status: 404 });
    }

    const orgId = connection.organizationId;
    const vtexConfig = await getVtexConfig(orgId);

    // Quick permission check: try Pricing API on one SKU to detect 403
    let pricingApiAvailable = true;
    try {
      const testRes = await fetch(
        `${vtexConfig.baseUrl}/api/pricing/prices/1`,
        { headers: { ...vtexConfig.headers, Accept: "application/json" } }
      );
      if (testRes.status === 403) {
        pricingApiAvailable = false;
      }
    } catch {
      // Network issues — we'll detect per-SKU
    }

    // Get active products to sync costPrice from VTEX
    const products = await prisma.product.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        externalId: { not: "" },
      },
      orderBy: { updatedAt: "desc" },
      skip: offset,
      take: limit,
    });

    if (products.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No products to process",
        stats: { total: 0, updated: 0, skipped: 0, failed: 0 },
      });
    }

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let pricingApiHits = 0;
    let catalogApiHits = 0;
    const errors: Array<{ productId: string; error: string }> = [];

    // Process in batches of 10 (parallel fetches)
    const BATCH_SIZE = 10;
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (product) => {
          const skuId = product.externalId;
          return fetchCostPrice(vtexConfig.baseUrl, vtexConfig.headers, skuId);
        })
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const product = batch[j];

        if (result.status === "fulfilled") {
          const { costPrice, source } = result.value;

          if (costPrice && costPrice > 0) {
            await prisma.product.update({
              where: { id: product.id },
              data: { costPrice } as any,
            });
            updated++;
            if (source === "pricing-api") pricingApiHits++;
            if (source === "catalog-api") catalogApiHits++;
          } else {
            skipped++; // VTEX has no CostPrice for this SKU
          }
        } else {
          failed++;
          errors.push({
            productId: product.externalId || "unknown",
            error: result.reason?.message || "Unknown error",
          });
        }
      }

      // Rate limit: small delay between batches
      if (i + BATCH_SIZE < products.length) {
        await sleep(200);
      }
    }

    // Also snapshot costPrice to historical OrderItems that don't have it
    const snapshotResult = await prisma.$executeRaw`
      UPDATE order_items oi
      SET "costPrice" = p."costPrice"
      FROM products p
      WHERE oi."productId" = p.id
        AND oi."costPrice" IS NULL
        AND p."costPrice" IS NOT NULL
        AND p."organizationId" = ${orgId}
    `;

    return NextResponse.json({
      ok: true,
      pricingApiAvailable,
      stats: {
        total: products.length,
        updated,
        skipped,
        failed,
        pricingApiHits,
        catalogApiHits,
        orderItemsSnapshotted: snapshotResult,
        offset,
        hasMore: products.length === limit,
      },
      ...(!pricingApiAvailable
        ? {
            warning:
              "La API key de VTEX no tiene permisos de Pricing. " +
              "Para sincronizar el 'Precio de costo', agregá el permiso " +
              "'Pricing - Full access' en License Manager > Roles de VTEX admin.",
          }
        : {}),
      ...(errors.length > 0 ? { errors: errors.slice(0, 10) } : {}),
    });
  } catch (error: any) {
    console.error("[CostSync] Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
