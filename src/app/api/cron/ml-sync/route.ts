// ══════════════════════════════════════════════════════════════
// ML Cron Sync — Scheduled backup sync + missed feeds recovery
// ══════════════════════════════════════════════════════════════
// This endpoint runs periodically (via Vercel Cron or external cron)
// to catch anything the webhook might have missed.
//
// It does two things:
//   1. Checks /missed_feeds for lost notifications and processes them
//   2. Syncs reputation metrics (snapshot once per run)
//
// The webhook handles real-time updates for orders, items, questions.
// This cron is the safety net.
//
// SAFETY: READ-ONLY from ML API. Only writes to our DB.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSellerToken, fetchSellerReputation, fetchSellerOrders } from "@/lib/connectors/mercadolibre-seller";
import { processMLNotification } from "@/lib/connectors/ml-notification-processor";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Pro plan — 5 min

const ML_API = "https://api.mercadolibre.com";
const ML_APP_ID = process.env.ML_APP_ID || "5750438437863167";

export async function GET(req: NextRequest) {
  // Optional: Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const log: string[] = [];

  try {
    const { token, mlUserId } = await getSellerToken();
    const connection = await prisma.connection.findFirst({
      where: { platform: "MERCADOLIBRE" as any },
    });
    if (!connection) {
      return NextResponse.json({ error: "No ML connection" }, { status: 404 });
    }
    const orgId = connection.organizationId;

    // ── 1. Process missed feeds ──────────────────────────────
    const missedTopics = ["orders_v2", "items", "questions"];
    let totalMissed = 0;

    for (const topic of missedTopics) {
      try {
        const res = await fetch(
          `${ML_API}/missed_feeds?app_id=${ML_APP_ID}&topic=${topic}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10000),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const missed = data.results || [];
          for (const notification of missed) {
            await processMLNotification(notification);
            totalMissed++;
          }
          if (missed.length > 0) {
            log.push(`Recovered ${missed.length} missed ${topic} notifications`);
          }
        }
      } catch (err: any) {
        log.push(`Missed feeds ${topic}: ${err.message}`);
      }
    }

    if (totalMissed === 0) {
      log.push("No missed notifications found");
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

      // Collect items from ML orders
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

          // Collect unique products
          const productSet = new Map<string, typeof allItems[0]>();
          for (const item of allItems) {
            if (!dbMap.has(item.orderId)) continue;
            const extId = item.mlItemId || `meli-cron-${item.orderId}-${item.title.substring(0, 20)}`;
            if (!productSet.has(extId)) productSet.set(extId, item);
          }

          // Bulk upsert products
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

          // Get product IDs
          const prodPH = productExtIds.map((_, i) => `$${i + 2}`).join(",");
          const products: { id: string; externalId: string }[] = productExtIds.length > 0
            ? await prisma.$queryRawUnsafe(
                `SELECT id, "externalId" FROM products WHERE "organizationId" = $1 AND "externalId" IN (${prodPH})`,
                orgId, ...productExtIds
              )
            : [];
          const prodMap = new Map<string, string>();
          for (const p of products) prodMap.set(p.externalId, p.id);

          // Bulk insert order items
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

    // ── Update connection ─────────────────────────────────────
    await prisma.connection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date() },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return NextResponse.json({ ok: true, elapsed: `${elapsed}s`, log });
  } catch (err: any) {
    console.error("[ML Cron] Fatal:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
