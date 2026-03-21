// ══════════════════════════════════════════════════════════════
// Sync: Cost Prices from VTEX SKU Detail API
// ══════════════════════════════════════════════════════════════
// Fetches CostPrice for all products using VTEX's private SKU API.
// The Search API (public) doesn't always expose CostPrice, but the
// SKU Detail API (pvt) always has it if configured in VTEX admin.
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
    const errors: Array<{ productId: string; error: string }> = [];

    // Process in batches of 10 (parallel SKU detail fetches)
    const BATCH_SIZE = 10;
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (product) => {
          const skuId = product.externalId;
          const url = `${vtexConfig.baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`;

          const res = await fetch(url, {
            headers: { ...vtexConfig.headers, Accept: "application/json" },
          });

          if (!res.ok) {
            throw new Error(`VTEX ${res.status} for SKU ${skuId}`);
          }

          const detail = await res.json();
          const costPrice = detail.CostPrice;

          return { product, costPrice };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          const { product, costPrice } = result.value;

          if (costPrice && costPrice > 0) {
            await prisma.product.update({
              where: { id: product.id },
              data: { costPrice } as any,
            });
            updated++;
          } else {
            skipped++; // VTEX has no CostPrice for this SKU
          }
        } else {
          failed++;
          errors.push({
            productId: batch[results.indexOf(result)]?.externalId || "unknown",
            error: result.reason?.message || "Unknown error",
          });
        }
      }

      // Rate limit: small delay between batches
      if (i + BATCH_SIZE < products.length) {
        await sleep(100);
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
      stats: {
        total: products.length,
        updated,
        skipped,
        failed,
        orderItemsSnapshotted: snapshotResult,
        offset,
        hasMore: products.length === limit,
      },
      ...(errors.length > 0 ? { errors: errors.slice(0, 10) } : {}),
    });
  } catch (error: any) {
    console.error("[CostSync] Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
