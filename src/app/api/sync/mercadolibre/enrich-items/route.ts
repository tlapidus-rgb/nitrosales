export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min Vercel Pro

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSellerToken, fetchSellerOrders } from "@/lib/connectors/mercadolibre-seller";

// ══════════════════════════════════════════════════════════════
// GET /api/sync/mercadolibre/enrich-items?days=7&offset=0
// ══════════════════════════════════════════════════════════════
// Fetches ML orders for a date window, collects all order_items,
// and does BULK SQL inserts (products + order_items) in 2 queries.
// Much faster than individual inserts.
//
// Params:
//   days    — how many days back to fetch (default: 7, max: 180)
//   offset  — day offset from today (default: 0)
//             e.g. days=7&offset=7 → 7-14 days ago
//   force   — "true" to re-enrich orders that already have items
// ══════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);
  const days = Math.min(180, Math.max(1, parseInt(searchParams.get("days") || "7")));
  const dayOffset = Math.max(0, parseInt(searchParams.get("offset") || "0"));
  const force = searchParams.get("force") === "true";

  try {
    const { token, mlUserId } = await getSellerToken();
    const connection = await prisma.connection.findFirst({
      where: { platform: "MERCADOLIBRE" as any },
    });
    if (!connection) {
      return NextResponse.json({ error: "No ML connection" }, { status: 404 });
    }
    const orgId = connection.organizationId;

    // Calculate date window
    const DAY = 24 * 60 * 60 * 1000;
    const dateEnd = new Date(Date.now() - dayOffset * DAY);
    const dateStart = new Date(dateEnd.getTime() - days * DAY);
    const label = `${dateStart.toISOString().split("T")[0]} → ${dateEnd.toISOString().split("T")[0]}`;

    // Fetch orders from ML (this paginates automatically, cap at 10k)
    const mlOrders = await fetchSellerOrders(token, mlUserId, {
      dateFrom: dateStart.toISOString(),
      maxOrders: 10000,
    });

    // Filter to our window (fetchSellerOrders uses dateFrom but not dateTo)
    const filtered = mlOrders.filter((o: any) => {
      const d = new Date(o.date_created);
      return d >= dateStart && d <= dateEnd;
    });

    // Collect all items with their order IDs
    const allItems: Array<{
      orderId: string;
      mlItemId: string;
      title: string;
      sku: string;
      unitPrice: number;
      quantity: number;
      thumbnail: string | null;
    }> = [];

    for (const order of filtered) {
      const items = order.order_items || [];
      for (const it of items) {
        allItems.push({
          orderId: String(order.id),
          mlItemId: String(it.item?.id || it.item_id || ""),
          title: it.item?.title || it.title || "ML Item",
          sku: it.item?.seller_sku || "",
          unitPrice: it.unit_price || it.full_unit_price || 0,
          quantity: it.quantity || 1,
          thumbnail: it.item?.thumbnail || null,
        });
      }
    }

    if (allItems.length === 0) {
      return NextResponse.json({
        ok: true, label, fetched: filtered.length,
        enriched: 0, itemsCreated: 0,
        elapsed: `${((Date.now() - t0) / 1000).toFixed(1)}s`,
      });
    }

    // Get unique order IDs and find which exist in DB
    const uniqueOrderIds = [...new Set(allItems.map((i) => i.orderId))];
    const PH = uniqueOrderIds.map((_, i) => `$${i + 2}`).join(",");

    // Find orders that exist and optionally don't have items
    const whereClause = force
      ? `o."organizationId" = $1 AND o."externalId" IN (${PH})`
      : `o."organizationId" = $1 AND o."externalId" IN (${PH}) AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi."orderId" = o.id)`;

    const dbOrders: { id: string; externalId: string }[] = await prisma.$queryRawUnsafe(
      `SELECT o.id, o."externalId" FROM orders o WHERE ${whereClause}`,
      orgId,
      ...uniqueOrderIds
    );

    if (dbOrders.length === 0) {
      return NextResponse.json({
        ok: true, label, fetched: filtered.length,
        enriched: 0, itemsCreated: 0,
        message: "All orders already have items",
        elapsed: `${((Date.now() - t0) / 1000).toFixed(1)}s`,
      });
    }

    const dbMap = new Map<string, string>();
    for (const o of dbOrders) dbMap.set(o.externalId, o.id);

    // If force mode, delete existing items first
    if (force && dbOrders.length > 0) {
      const dbIds = dbOrders.map((o) => o.id);
      const delPH = dbIds.map((_, i) => `$${i + 1}`).join(",");
      await prisma.$queryRawUnsafe(
        `DELETE FROM order_items WHERE "orderId" IN (${delPH})`,
        ...dbIds
      );
    }

    // Step 1: Bulk upsert products
    // Build VALUES list for products
    const productSet = new Map<string, typeof allItems[0]>();
    for (const item of allItems) {
      if (!dbMap.has(item.orderId)) continue;
      const extId = item.mlItemId || `meli-csv-${item.orderId}-${item.title.substring(0, 20)}`;
      if (!productSet.has(extId)) {
        productSet.set(extId, item);
      }
    }

    // Insert products in batches of 200
    const productExtIds = [...productSet.keys()];
    const PROD_BATCH = 200;
    for (let b = 0; b < productExtIds.length; b += PROD_BATCH) {
      const batch = productExtIds.slice(b, b + PROD_BATCH);
      const values = batch.map((extId) => {
        const item = productSet.get(extId)!;
        const name = item.title.replace(/'/g, "''");
        const sku = (item.sku || item.mlItemId).replace(/'/g, "''");
        const thumb = item.thumbnail ? `'${item.thumbnail.replace(/'/g, "''")}'` : "NULL";
        return `(gen_random_uuid()::text, '${orgId}', '${extId.replace(/'/g, "''")}', '${name}', '${sku}', ${item.unitPrice}, ${thumb}, NOW(), NOW())`;
      });

      await prisma.$executeRawUnsafe(`
        INSERT INTO products ("id", "organizationId", "externalId", "name", "sku", "price", "imageUrl", "createdAt", "updatedAt")
        VALUES ${values.join(",\n")}
        ON CONFLICT ("organizationId", "externalId")
        DO UPDATE SET "name" = EXCLUDED."name", "price" = EXCLUDED."price", "updatedAt" = NOW()
      `);
    }

    // Step 2: Get product IDs for all our extIds
    const prodPH = productExtIds.map((_, i) => `$${i + 2}`).join(",");
    const products: { id: string; externalId: string }[] = productExtIds.length > 0
      ? await prisma.$queryRawUnsafe(
          `SELECT id, "externalId" FROM products WHERE "organizationId" = $1 AND "externalId" IN (${prodPH})`,
          orgId,
          ...productExtIds
        )
      : [];
    const prodMap = new Map<string, string>();
    for (const p of products) prodMap.set(p.externalId, p.id);

    // Step 3: Bulk insert order items
    const itemValues: string[] = [];
    for (const item of allItems) {
      const dbOrderId = dbMap.get(item.orderId);
      if (!dbOrderId) continue;
      const prodExtId = item.mlItemId || `meli-csv-${item.orderId}-${item.title.substring(0, 20)}`;
      const productId = prodMap.get(prodExtId);
      if (!productId) continue;

      const totalPrice = item.unitPrice * item.quantity;
      itemValues.push(
        `(gen_random_uuid()::text, '${dbOrderId}', '${productId}', ${item.quantity}, ${item.unitPrice}, ${totalPrice})`
      );
    }

    // Insert order items in batches of 500
    const ITEM_BATCH = 500;
    let totalCreated = 0;
    for (let b = 0; b < itemValues.length; b += ITEM_BATCH) {
      const batch = itemValues.slice(b, b + ITEM_BATCH);
      await prisma.$executeRawUnsafe(`
        INSERT INTO order_items ("id", "orderId", "productId", "quantity", "unitPrice", "totalPrice")
        VALUES ${batch.join(",\n")}
      `);
      totalCreated += batch.length;
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    return NextResponse.json({
      ok: true,
      label,
      fetched: filtered.length,
      ordersToEnrich: dbOrders.length,
      enriched: dbOrders.length,
      productsUpserted: productSet.size,
      itemsCreated: totalCreated,
      elapsed: `${elapsed}s`,
    });
  } catch (err: any) {
    console.error("[ML Enrich Items] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
