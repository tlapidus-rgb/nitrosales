// ══════════════════════════════════════════════════════════════
// ML Cron Sync — Robust safety net for MercadoLibre data (MULTI-TENANT)
// ══════════════════════════════════════════════════════════════
// Runs every 4 hours (Vercel Cron). Para CADA org con ML activo:
//   1. SYNCS RECENT ORDERS directly from ML /orders/search API (48h)
//   2. Enriches order items (products + order_items rows)
//   3. Snapshots seller reputation metrics
//
// Multi-tenant: itera todas las Connection con platform=MERCADOLIBRE,
// status=ACTIVE. Secuencial (no paralelo). Cuando haya >5 orgs con ML,
// paralelizar con Promise.all pero con batching (~3 a la vez).
//
// SAFETY: READ-ONLY from ML API. Only writes to our DB.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSellerToken, fetchSellerReputation, fetchSellerOrders } from "@/lib/connectors/mercadolibre-seller";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Pro plan — 5 min

function mapMLOrderStatus(mlStatus: string): "PENDING" | "APPROVED" | "SHIPPED" | "DELIVERED" | "CANCELLED" {
  switch (mlStatus) {
    case "confirmed": return "APPROVED";
    case "payment_required": return "PENDING";
    case "payment_in_process": return "PENDING";
    case "paid": return "APPROVED";
    case "partially_paid": return "PENDING";
    case "shipped": return "SHIPPED";
    case "delivered": return "DELIVERED";
    case "cancelled": return "CANCELLED";
    default: return "PENDING";
  }
}

/**
 * Sincroniza UNA org con ML conectado. Captura errores internamente
 * para no bloquear el procesamiento de las otras orgs.
 */
async function syncOneOrg(
  orgId: string,
  connId: string
): Promise<{ ok: boolean; log: string[]; error?: string }> {
  const log: string[] = [];
  try {
    const { token, mlUserId } = await getSellerToken(orgId);
    log.push(`Token OK for user ${mlUserId}`);

    // ── 1. Sync recent orders from ML API (last 48h) ─────────
    try {
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const mlOrders = await fetchSellerOrders(token, mlUserId, {
        dateFrom: twoDaysAgo,
        maxOrders: 5000,
      });
      log.push(`Fetched ${mlOrders.length} orders from ML (last 48h)`);

      let ordersCreated = 0;
      let ordersUpdated = 0;
      for (const order of mlOrders) {
        const status = mapMLOrderStatus(order.status);
        const totalValue = order.total_amount || 0;
        const mlItems = order.order_items || [];
        const itemCount = mlItems.reduce((sum: number, i: any) => sum + (i.quantity || 1), 0);

        const orderPromos: string[] = Array.isArray(order.promotions)
          ? order.promotions.map((p: any) => (p?.name || p?.type || "").toString().trim()).filter(Boolean)
          : [];
        const itemPromos: string[] = mlItems
          .map((it: any) => (it?.promotion?.name || it?.promotion?.type || "").toString().trim())
          .filter(Boolean);
        const allPromos = Array.from(new Set([...orderPromos, ...itemPromos]));
        const promotionNames = allPromos.length ? allPromos.join(", ") : null;

        const existing = await prisma.order.findUnique({
          where: {
            organizationId_externalId: { organizationId: orgId, externalId: String(order.id) },
          },
          select: { id: true, status: true },
        });

        if (existing) {
          if (existing.status !== status) {
            await prisma.order.update({
              where: { id: existing.id },
              data: { status, totalValue, itemCount, promotionNames, paymentMethod: order.payments?.[0]?.payment_type || null },
            });
            ordersUpdated++;
          }
        } else {
          await prisma.order.create({
            data: {
              organizationId: orgId,
              externalId: String(order.id),
              status,
              totalValue,
              currency: order.currency_id || "ARS",
              itemCount,
              promotionNames,
              source: "MELI",
              channel: "marketplace",
              paymentMethod: order.payments?.[0]?.payment_type || null,
              orderDate: new Date(order.date_created),
            },
          });
          ordersCreated++;
        }
      }
      log.push(`Orders: ${ordersCreated} created, ${ordersUpdated} updated`);
    } catch (err: any) {
      log.push(`Order sync error: ${err.message}`);
    }

    // ── 2. Sync reputation snapshot ──────────────────────────
    try {
      const rep = await fetchSellerReputation(token, mlUserId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.mlSellerMetricDaily.upsert({
        where: {
          organizationId_date: { organizationId: orgId, date: today },
        },
        update: {
          reputationLevel: rep.level,
          reputationPower: rep.powerSeller,
          totalSales: rep.transactions.total,
          completedSales: rep.transactions.completed,
          cancelledSales: rep.transactions.canceled,
          claimsRate: rep.metrics.claims.rate,
          delayedHandlingRate: rep.metrics.delayed.rate,
          cancellationRate: rep.metrics.cancellations.rate,
          positiveRatings: rep.ratings.positive,
          negativeRatings: rep.ratings.negative,
          neutralRatings: rep.ratings.neutral,
        },
        create: {
          organizationId: orgId,
          date: today,
          reputationLevel: rep.level,
          reputationPower: rep.powerSeller,
          totalSales: rep.transactions.total,
          completedSales: rep.transactions.completed,
          cancelledSales: rep.transactions.canceled,
          claimsRate: rep.metrics.claims.rate,
          delayedHandlingRate: rep.metrics.delayed.rate,
          cancellationRate: rep.metrics.cancellations.rate,
          positiveRatings: rep.ratings.positive,
          negativeRatings: rep.ratings.negative,
          neutralRatings: rep.ratings.neutral,
        },
      });
      log.push(`Reputation synced: ${rep.level}`);
    } catch (err: any) {
      log.push(`Reputation error: ${err.message}`);
    }

    // ── 3. Enrich order items for recent MELI orders ─────────
    try {
      const DAY = 24 * 60 * 60 * 1000;
      const dateEnd = new Date();
      const dateStart = new Date(Date.now() - 3 * DAY);

      const mlOrders = await fetchSellerOrders(token, mlUserId, {
        dateFrom: dateStart.toISOString(),
        maxOrders: 5000,
      });

      const filtered = mlOrders.filter((o: any) => {
        const d = new Date(o.date_created);
        return d >= dateStart && d <= dateEnd;
      });

      const allItems: Array<{
        orderId: string; mlItemId: string; title: string;
        sku: string; unitPrice: number; quantity: number; thumbnail: string | null;
      }> = [];

      for (const order of filtered) {
        for (const it of (order.order_items || [])) {
          allItems.push({
            orderId: String(order.id),
            mlItemId: String(it.item?.id || ""),
            title: it.item?.title || "ML Item",
            sku: it.item?.seller_sku || "",
            unitPrice: it.unit_price || it.full_unit_price || 0,
            quantity: it.quantity || 1,
            thumbnail: it.item?.thumbnail || null,
          });
        }
      }

      if (allItems.length > 0) {
        const uniqueOrderIds = [...new Set(allItems.map((i) => i.orderId))];
        const PH = uniqueOrderIds.map((_, i) => `$${i + 2}`).join(",");
        const dbOrders: { id: string; externalId: string }[] = await prisma.$queryRawUnsafe(
          `SELECT o.id, o."externalId" FROM orders o WHERE o."organizationId" = $1 AND o."externalId" IN (${PH}) AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi."orderId" = o.id)`,
          orgId, ...uniqueOrderIds
        );

        if (dbOrders.length > 0) {
          const dbMap = new Map<string, string>();
          for (const o of dbOrders) dbMap.set(o.externalId, o.id);

          const productSet = new Map<string, typeof allItems[0]>();
          for (const item of allItems) {
            if (!dbMap.has(item.orderId)) continue;
            const extId = item.mlItemId || `meli-cron-${item.orderId}-${item.title.substring(0, 20)}`;
            if (!productSet.has(extId)) productSet.set(extId, item);
          }

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

          const prodPH = productExtIds.map((_, i) => `$${i + 2}`).join(",");
          const products: { id: string; externalId: string }[] = productExtIds.length > 0
            ? await prisma.$queryRawUnsafe(
                `SELECT id, "externalId" FROM products WHERE "organizationId" = $1 AND "externalId" IN (${prodPH})`,
                orgId, ...productExtIds
              )
            : [];
          const prodMap = new Map<string, string>();
          for (const p of products) prodMap.set(p.externalId, p.id);

          const itemValues: string[] = [];
          for (const item of allItems) {
            const dbOrderId = dbMap.get(item.orderId);
            if (!dbOrderId) continue;
            const prodExtId = item.mlItemId || `meli-cron-${item.orderId}-${item.title.substring(0, 20)}`;
            const productId = prodMap.get(prodExtId);
            if (!productId) continue;
            const totalPrice = item.unitPrice * item.quantity;
            itemValues.push(`(gen_random_uuid()::text, '${dbOrderId}', '${productId}', ${item.quantity}, ${item.unitPrice}, ${totalPrice})`);
          }

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

          log.push(`Enriched ${dbOrders.length} orders with ${totalCreated} items (last 3 days)`);
        } else {
          log.push("All recent orders already have items");
        }
      } else {
        log.push("No ML orders with items found in last 3 days");
      }
    } catch (err: any) {
      log.push(`Item enrichment error: ${err.message}`);
    }

    // ── Update connection lastSyncAt ─────────────────────────
    await prisma.connection.update({
      where: { id: connId },
      data: { lastSyncAt: new Date() },
    });

    return { ok: true, log };
  } catch (err: any) {
    console.error(`[ML Cron] Fatal for org ${orgId}:`, err);
    return { ok: false, log, error: err.message };
  }
}

export async function GET(req: NextRequest) {
  // Optional: Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // Multi-tenant: iterar TODAS las orgs con ML activo
    const mlConnections = await prisma.connection.findMany({
      where: { platform: "MERCADOLIBRE" as any, status: "ACTIVE" as any },
      select: { id: true, organizationId: true },
    });

    if (mlConnections.length === 0) {
      return NextResponse.json({ error: "No active ML connections" }, { status: 404 });
    }

    // Procesar secuencialmente por org (cron tiene 5 min total).
    // TODO post-multi-tenant real (>5 orgs): paralelizar con Promise.all batched.
    const orgResults: Array<{
      orgId: string;
      ok: boolean;
      log: string[];
      error?: string;
      elapsedMs: number;
    }> = [];

    let overallOk = true;
    for (const conn of mlConnections) {
      const orgStart = Date.now();
      const result = await syncOneOrg(conn.organizationId, conn.id);
      orgResults.push({
        orgId: conn.organizationId,
        ok: result.ok,
        log: result.log,
        error: result.error,
        elapsedMs: Date.now() - orgStart,
      });
      if (!result.ok) overallOk = false;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return NextResponse.json({
      ok: overallOk,
      elapsed: `${elapsed}s`,
      orgsProcessed: orgResults.length,
      results: orgResults,
    });
  } catch (err: any) {
    console.error("[ML Cron] Fatal:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
