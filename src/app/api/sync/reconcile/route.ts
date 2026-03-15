// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Ruta de reconciliaciÃ³n: fusionar productos duplicados y
// re-linkear order_items al producto correcto (con stock data)
// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Endpoint: GET /api/sync/reconcile?key=SECRET
//
// Este script soluciona el problema de IDs desalineados:
// - Order sync creÃ³ productos con externalId = VTEX Product ID
// - Inventory sync creÃ³ productos con externalId = VTEX SKU ID
// - Resultado: duplicados donde uno tiene ventas y otro tiene stock
//
// Estrategia:
// 1. Buscar productos "huÃ©rfanos" (tienen order_items pero stock IS NULL)
// 2. Para cada uno, buscar el match por SKU en productos con stock
// 3. Re-linkear los order_items al producto con stock
// 4. Marcar el huÃ©rfano como inactivo

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ORG_ID = "cmmmga1uq0000sb43w0krvvys";

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    const key = req.nextUrl.searchParams.get("key") || "";
    if (key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const dryRun = req.nextUrl.searchParams.get("dryrun") !== "false";
    const batchSize = parseInt(req.nextUrl.searchParams.get("batch") || "100");

    // ââ DiagnÃ³stico ââ
    // Productos huÃ©rfanos: tienen order_items pero no stock
    const orphanProducts = await prisma.$queryRaw<
      Array<{
        id: string;
        externalId: string;
        name: string;
        sku: string | null;
        itemCount: bigint;
      }>
    >`
      SELECT p.id, p."externalId", p.name, p.sku,
        COUNT(oi.id)::bigint AS "itemCount"
      FROM products p
      JOIN order_items oi ON oi."productId" = p.id
      WHERE p."organizationId" = ${ORG_ID}
        AND (p.stock IS NULL OR p."stockUpdatedAt" IS NULL)
      GROUP BY p.id, p."externalId", p.name, p.sku
      ORDER BY COUNT(oi.id) DESC
      LIMIT ${batchSize}
    `;

    // Ãrdenes sin items (no procesadas por vtex-details)
    const ordersMissingItems = await prisma.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT COUNT(*)::bigint AS count
      FROM orders o
      LEFT JOIN order_items oi ON oi."orderId" = o.id
      WHERE o."organizationId" = ${ORG_ID}
        AND o."orderDate" >= NOW() - INTERVAL '30 days'
        AND o.status NOT IN ('CANCELLED')
        AND oi.id IS NULL
    `;

    // Items sin productId
    const itemsNoProduct = await prisma.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT COUNT(*)::bigint AS count
      FROM order_items oi
      JOIN orders o ON oi."orderId" = o.id
      WHERE o."organizationId" = ${ORG_ID}
        AND oi."productId" IS NULL
    `;

    let relinked = 0;
    let merged = 0;
    let noMatch = 0;
    const examples: any[] = [];

    if (!dryRun) {
      // ââ Re-linkear por SKU match ââ
      for (const orphan of orphanProducts) {
        if (!orphan.sku) {
          noMatch++;
          continue;
        }

        // Buscar producto del inventory sync con mismo SKU
        const inventoryProduct = await prisma.product.findFirst({
          where: {
            organizationId: ORG_ID,
            sku: orphan.sku,
            id: { not: orphan.id },
            stock: { not: null },
          },
        });

        if (!inventoryProduct) {
          noMatch++;
          if (examples.length < 5) {
            examples.push({
              type: "no_match",
              orphanId: orphan.id,
              orphanExtId: orphan.externalId,
              name: orphan.name,
              sku: orphan.sku,
              itemCount: Number(orphan.itemCount),
            });
          }
          continue;
        }

        // Re-linkear todos los order_items del huÃ©rfano al producto con stock
        const updateResult = await prisma.orderItem.updateMany({
          where: { productId: orphan.id },
          data: { productId: inventoryProduct.id },
        });

        // Transferir brand/category si el inventory product no los tiene
        if (!inventoryProduct.brand && orphan.name) {
          // El huÃ©rfano puede tener brand/category del order sync
          const orphanFull = await prisma.product.findUnique({
            where: { id: orphan.id },
          });
          if (orphanFull?.brand || orphanFull?.category) {
            await prisma.product.update({
              where: { id: inventoryProduct.id },
              data: {
                ...(orphanFull.brand && !inventoryProduct.brand
                  ? { brand: orphanFull.brand }
                  : {}),
                ...(orphanFull.category && !inventoryProduct.category
                  ? { category: orphanFull.category }
                  : {}),
              },
            });
          }
        }

        // Desactivar el huÃ©rfano
        await prisma.product.update({
          where: { id: orphan.id },
          data: { isActive: false },
        });

        relinked += updateResult.count;
        merged++;

        if (examples.length < 5) {
          examples.push({
            type: "merged",
            orphanId: orphan.id,
            orphanExtId: orphan.externalId,
            targetId: inventoryProduct.id,
            targetExtId: inventoryProduct.externalId,
            name: orphan.name,
            sku: orphan.sku,
            itemsRelinked: updateResult.count,
            targetStock: inventoryProduct.stock,
          });
        }
      }
    }

    const elapsed = Date.now() - startTime;

    return NextResponse.json({
      ok: true,
      dryRun,
      diagnosis: {
        orphanProducts: orphanProducts.length,
        orphanTotalItems: orphanProducts.reduce(
          (s, p) => s + Number(p.itemCount),
          0
        ),
        ordersMissingItems30d: Number(ordersMissingItems[0]?.count || 0),
        itemsWithNullProductId: Number(itemsNoProduct[0]?.count || 0),
      },
      actions: dryRun
        ? "Dry run - no changes made. Add ?dryrun=false to execute."
        : {
            merged,
            relinked,
            noMatch,
          },
      examples: dryRun
        ? orphanProducts.slice(0, 10).map((p) => ({
            id: p.id,
            externalId: p.externalId,
            name: p.name,
            sku: p.sku,
            itemCount: Number(p.itemCount),
          }))
        : examples,
      elapsedMs: elapsed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
