// ══════════════════════════════════════════════════════════════
// MercadoLibre Sync — Master endpoint
// ══════════════════════════════════════════════════════════════
// Syncs ALL ML seller data in sequence:
//   1. Listings (publicaciones)
//   2. Seller reputation metrics
//   3. Recent orders → into main Orders table (source="MELI")
//   4. Questions from buyers
//
// SAFETY: All operations are READ-ONLY from ML API.
// We only read data from ML and write to our own NitroSales DB.
// Nothing is ever written/modified on the ML account.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSellerToken, fetchSellerListings, fetchSellerReputation, fetchSellerOrders, fetchSellerQuestions } from "@/lib/connectors/mercadolibre-seller";
import { upsertProductBySku } from "@/lib/products/upsert-by-sku";

export const dynamic = "force-dynamic"; // Prevent static generation at build time
export const maxDuration = 300; // Vercel timeout: 5 min (Pro plan)

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const log: string[] = [];
  const errors: string[] = [];

  try {
    // ── Step 0: Get valid token ──────────────────────────────
    const { token, mlUserId } = await getSellerToken();
    log.push(`Token OK for user ${mlUserId}`);

    // Get org ID
    const connection = await prisma.connection.findFirst({
      where: { platform: "MERCADOLIBRE" as any },
    });
    if (!connection) throw new Error("No ML connection");
    const orgId = connection.organizationId;

    // ── Step 1: Sync Listings ────────────────────────────────
    try {
      // Fetch active + paused listings (skip closed to avoid 30K+ items timeout)
      const items = await fetchSellerListings(token, mlUserId, {
        limit: 10000,
        statuses: ["active", "paused"],
      });
      log.push(`Fetched ${items.length} listings from ML`);

      let upserted = 0;
      for (const item of items) {
        await prisma.mlListing.upsert({
          where: {
            organizationId_mlItemId: { organizationId: orgId, mlItemId: item.id },
          },
          update: {
            title: item.title || "",
            status: item.status || "unknown",
            categoryId: item.category_id,
            price: item.price || 0,
            originalPrice: item.original_price,
            currencyId: item.currency_id || "ARS",
            availableQty: item.available_quantity || 0,
            soldQty: item.sold_quantity || 0,
            listingType: item.listing_type_id,
            condition: item.condition,
            permalink: item.permalink,
            thumbnailUrl: item.thumbnail,
            freeShipping: item.shipping?.free_shipping || false,
            fulfillment: item.shipping?.logistic_type,
            catalogListing: !!item.catalog_listing,
            lastSyncAt: new Date(),
          },
          create: {
            organizationId: orgId,
            mlItemId: item.id,
            title: item.title || "",
            status: item.status || "unknown",
            categoryId: item.category_id,
            price: item.price || 0,
            originalPrice: item.original_price,
            currencyId: item.currency_id || "ARS",
            availableQty: item.available_quantity || 0,
            soldQty: item.sold_quantity || 0,
            listingType: item.listing_type_id,
            condition: item.condition,
            permalink: item.permalink,
            thumbnailUrl: item.thumbnail,
            freeShipping: item.shipping?.free_shipping || false,
            fulfillment: item.shipping?.logistic_type,
            catalogListing: !!item.catalog_listing,
            lastSyncAt: new Date(),
          },
        });
        upserted++;
      }
      log.push(`Upserted ${upserted} listings`);
    } catch (err: any) {
      errors.push(`Listings: ${err.message}`);
    }

    // ── Step 2: Sync Reputation ──────────────────────────────
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
      log.push(`Reputation synced: ${rep.level}, power=${rep.powerSeller}`);
    } catch (err: any) {
      errors.push(`Reputation: ${err.message}`);
    }

    // ── Step 3: Sync Recent Orders → main Orders table + OrderItems ───────
    try {
      // Fetch ALL orders from last 6 months (backfill + ongoing)
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const mlOrders = await fetchSellerOrders(token, mlUserId, { dateFrom: sixMonthsAgo });
      log.push(`Fetched ${mlOrders.length} orders from ML`);

      let ordersUpserted = 0;
      let itemsCreated = 0;
      for (const order of mlOrders) {
        const status = mapMLOrderStatus(order.status);
        const totalValue = order.total_amount || 0;
        const mlItems = order.order_items || [];
        const itemCount = mlItems.reduce((sum: number, i: any) => sum + (i.quantity || 1), 0);

        // Tanda 7.10.4 — promociones ML (order-level + item-level)
        const orderPromos: string[] = Array.isArray(order.promotions)
          ? order.promotions.map((p: any) => (p?.name || p?.type || "").toString().trim()).filter(Boolean)
          : [];
        const itemPromos: string[] = mlItems
          .map((it: any) => (it?.promotion?.name || it?.promotion?.type || "").toString().trim())
          .filter(Boolean);
        const allPromos = Array.from(new Set([...orderPromos, ...itemPromos]));
        const promotionNames = allPromos.length ? allPromos.join(", ") : null;

        const dbOrder = await prisma.order.upsert({
          where: {
            organizationId_externalId: { organizationId: orgId, externalId: String(order.id) },
          },
          update: {
            status,
            totalValue,
            itemCount,
            promotionNames,
            paymentMethod: order.payments?.[0]?.payment_type || null,
          },
          create: {
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
        ordersUpserted++;

        // ── Create Products + OrderItems for MELI (same pattern as VTEX) ──
        if (mlItems.length > 0) {
          // Delete existing items to avoid duplicates on re-sync
          await prisma.orderItem.deleteMany({ where: { orderId: dbOrder.id } });

          for (const mlItem of mlItems) {
            const mlItemId = String(mlItem.item?.id || mlItem.item_id || "");
            const itemTitle = mlItem.item?.title || mlItem.title || `ML Item ${mlItemId}`;
            const unitPrice = mlItem.unit_price || mlItem.full_unit_price || 0;
            const quantity = mlItem.quantity || 1;
            const thumbnailUrl = mlItem.item?.thumbnail || null;
            // Sesion 21: usar seller_sku real, NO el MLA listing id.
            const sellerSku = (mlItem.item?.seller_sku || "").trim() || null;
            const externalId = mlItemId || `meli-${order.id}-${mlItem.item?.id || 0}`;

            // Upsert Product (SKU-first; evita duplicados cuando el mismo SKU
            // entra desde VTEX y ML a la vez)
            const product = await upsertProductBySku({
              organizationId: orgId,
              externalId,
              sku: sellerSku,
              create: {
                name: itemTitle,
                price: unitPrice,
                imageUrl: thumbnailUrl,
                isActive: true,
              },
              update: {
                name: itemTitle,
                price: unitPrice,
                ...(thumbnailUrl ? { imageUrl: thumbnailUrl } : {}),
              },
            });

            // Create OrderItem
            await prisma.orderItem.create({
              data: {
                orderId: dbOrder.id,
                productId: product.id,
                quantity,
                unitPrice,
                totalPrice: unitPrice * quantity,
              } as any,
            });
            itemsCreated++;
          }
        }
      }
      log.push(`Upserted ${ordersUpserted} MELI orders, ${itemsCreated} order items`);
    } catch (err: any) {
      errors.push(`Orders: ${err.message}`);
    }

    // ── Step 4: Sync Questions ───────────────────────────────
    try {
      const questions = await fetchSellerQuestions(token, mlUserId, { limit: 500 });
      log.push(`Fetched ${questions.length} questions from ML`);

      let questionsUpserted = 0;
      for (const q of questions) {
        await prisma.mlQuestion.upsert({
          where: {
            organizationId_mlQuestionId: { organizationId: orgId, mlQuestionId: String(q.id) },
          },
          update: {
            status: q.status,
            answerText: q.answer?.text || null,
            answerDate: q.answer?.date_created ? new Date(q.answer.date_created) : null,
          },
          create: {
            organizationId: orgId,
            mlQuestionId: String(q.id),
            mlItemId: q.item_id || "",
            text: q.text || "",
            status: q.status || "UNKNOWN",
            dateCreated: new Date(q.date_created),
            answerText: q.answer?.text || null,
            answerDate: q.answer?.date_created ? new Date(q.answer.date_created) : null,
            fromBuyerId: q.from?.id ? BigInt(q.from.id) : null,
          },
        });
        questionsUpserted++;
      }
      log.push(`Upserted ${questionsUpserted} questions`);
    } catch (err: any) {
      errors.push(`Questions: ${err.message}`);
    }

    // ── Done ─────────────────────────────────────────────────
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Update connection status
    await prisma.connection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: new Date(),
        lastSuccessfulSyncAt: errors.length === 0 ? new Date() : undefined,
        lastSyncError: errors.length > 0 ? errors.join("; ") : null,
      },
    });

    return NextResponse.json({
      ok: true,
      elapsed: `${elapsed}s`,
      steps: log,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error("[ML Sync] Fatal error:", err);
    return NextResponse.json(
      { ok: false, error: err.message, steps: log },
      { status: 500 }
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────

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
