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

export const dynamic = "force-dynamic"; // Prevent static generation at build time
export const maxDuration = 300; // Vercel timeout: 5 min (Pro plan)

// ─── Tanda 9 Hotfix: ensure new columns exist before any upsert ───
let t9Migrated = false;
async function ensureT9Columns() {
  if (t9Migrated) return;
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS "itemsTotal" DECIMAL(12,2)`);
    await prisma.$executeRawUnsafe(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS "taxAmount" DECIMAL(12,2)`);
    t9Migrated = true;
  } catch { t9Migrated = true; }
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const log: string[] = [];
  const errors: string[] = [];

  // Ensure Tanda 9 columns exist before any DB write
  await ensureT9Columns();

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

    // ── Step 3: Sync Recent Orders → main Orders table ───────
    try {
      // Fetch ALL orders from last 6 months (backfill + ongoing)
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const mlOrders = await fetchSellerOrders(token, mlUserId, { dateFrom: sixMonthsAgo });
      log.push(`Fetched ${mlOrders.length} orders from ML`);

      let ordersUpserted = 0;
      let mlItemsCreated = 0;
      let mlProductsCreated = 0;
      let mlCustomersCreated = 0;
      for (const order of mlOrders) {
        const status = mapMLOrderStatus(order.status);
        const totalValue = order.total_amount || 0;
        const mlItems = order.order_items || [];
        const itemCount = mlItems.reduce((sum: number, i: any) => sum + (i.quantity || 1), 0);

        // Tanda 7.5 — Capturamos la comisión de ML (sale_fee) sumando por ítem.
        const marketplaceFee = mlItems.reduce(
          (sum: number, item: any) => sum + (Number(item.sale_fee) || 0),
          0
        );

        // Tanda 9 — shippingCost desde ML shipping object
        const shippingCost = Number(order.shipping?.cost) || 0;

        // Tanda 9 — itemsTotal: revenue limpio = SUM(unit_price * quantity)
        const itemsTotal = mlItems.reduce(
          (sum: number, item: any) => sum + ((Number(item.unit_price) || 0) * (item.quantity || 1)),
          0
        );

        // Tanda 9 — discountValue: diferencia entre full_unit_price y total_amount
        // full_unit_price es el precio original antes de cupones/descuentos ML
        const fullTotal = mlItems.reduce(
          (sum: number, item: any) => sum + ((Number(item.full_unit_price) || Number(item.unit_price) || 0) * (item.quantity || 1)),
          0
        );
        const discountValue = Math.max(0, fullTotal - totalValue);

        // Tanda 7.10.4 + Tanda 9 (sort) — capturar promociones ML
        const orderPromos: string[] = Array.isArray(order.promotions)
          ? order.promotions.map((p: any) => (p?.name || p?.type || "").toString().trim()).filter(Boolean)
          : [];
        const itemPromos: string[] = mlItems
          .map((it: any) => (it?.promotion?.name || it?.promotion?.type || "").toString().trim())
          .filter(Boolean);
        // Tanda 9: sort para consistencia (evita duplicados "A, B" vs "B, A")
        const allPromos = Array.from(new Set([...orderPromos, ...itemPromos])).sort();
        const promotionNames = allPromos.length ? allPromos.join(", ") : null;

        const upsertedOrder = await prisma.order.upsert({
          where: {
            organizationId_externalId: { organizationId: orgId, externalId: String(order.id) },
          },
          update: {
            status,
            totalValue,
            itemCount,
            marketplaceFee: marketplaceFee > 0 ? marketplaceFee : null,
            promotionNames,
            paymentMethod: order.payments?.[0]?.payment_type || null,
            // Tanda 9: campos nuevos
            shippingCost: shippingCost > 0 ? shippingCost : null,
            discountValue: discountValue > 0 ? discountValue : null,
            itemsTotal: itemsTotal > 0 ? itemsTotal : null,
          },
          create: {
            organizationId: orgId,
            externalId: String(order.id),
            status,
            totalValue,
            currency: order.currency_id || "ARS",
            itemCount,
            marketplaceFee: marketplaceFee > 0 ? marketplaceFee : null,
            promotionNames,
            source: "MELI",
            channel: "marketplace",
            paymentMethod: order.payments?.[0]?.payment_type || null,
            orderDate: new Date(order.date_created),
            // Tanda 9: campos nuevos
            shippingCost: shippingCost > 0 ? shippingCost : null,
            discountValue: discountValue > 0 ? discountValue : null,
            itemsTotal: itemsTotal > 0 ? itemsTotal : null,
          },
        });

        // ── Tanda 9: Crear order_items + products para ML (BUG C1) ──
        // Primero limpiamos items viejos (dedup) y recreamos
        try {
          await prisma.orderItem.deleteMany({ where: { orderId: upsertedOrder.id } });
        } catch {}

        for (const mlItem of mlItems) {
          try {
            const mlItemId = String(mlItem.item?.id || mlItem.item_id || `ml-${order.id}-${mlItem.title || "unknown"}`);
            const unitPrice = Number(mlItem.unit_price) || 0;
            const qty = mlItem.quantity || 1;

            // Upsert product (placeholder para ML — sin SKU porque ML no lo comparte fácilmente)
            let product = null;
            try {
              product = await prisma.product.upsert({
                where: {
                  organizationId_externalId: { organizationId: orgId, externalId: mlItemId },
                },
                update: {
                  name: mlItem.item?.title || mlItem.title || "Producto ML",
                  price: unitPrice,
                  imageUrl: mlItem.item?.thumbnail || null,
                  isActive: true,
                },
                create: {
                  externalId: mlItemId,
                  name: mlItem.item?.title || mlItem.title || "Producto ML",
                  price: unitPrice,
                  imageUrl: mlItem.item?.thumbnail || null,
                  isActive: true,
                  organizationId: orgId,
                  category: mlItem.item?.category_id || null,
                },
              });
              mlProductsCreated++;
            } catch (pe: any) {
              // Product creation might fail on unique constraint race — continue with null
            }

            await prisma.orderItem.create({
              data: {
                quantity: qty,
                unitPrice: unitPrice,
                totalPrice: unitPrice * qty,
                orderId: upsertedOrder.id,
                productId: product?.id || null,
              },
            });
            mlItemsCreated++;
          } catch (ie: any) {
            // Log but don't fail the whole order
          }
        }

        // ── Tanda 9: Crear/vincular customer para ML (BUG M2) ──
        // ML expone buyer.id y buyer.nickname. No tiene email por privacidad.
        const buyer = order.buyer;
        if (buyer?.id) {
          try {
            const buyerExtId = `ml-buyer-${buyer.id}`;
            const customer = await prisma.customer.upsert({
              where: {
                organizationId_externalId: { organizationId: orgId, externalId: buyerExtId },
              },
              update: {
                lastName: buyer.nickname || null,
                lastOrderAt: new Date(order.date_created),
                totalOrders: { increment: 1 },
                totalSpent: { increment: totalValue },
              },
              create: {
                organizationId: orgId,
                externalId: buyerExtId,
                email: "",  // ML no comparte email
                firstName: buyer.first_name || null,
                lastName: buyer.last_name || buyer.nickname || null,
                firstOrderAt: new Date(order.date_created),
                lastOrderAt: new Date(order.date_created),
                totalOrders: 1,
                totalSpent: totalValue,
              },
            });
            // Link customer to order
            await prisma.order.update({
              where: { id: upsertedOrder.id },
              data: { customerId: customer.id },
            });
            mlCustomersCreated++;
          } catch (ce: any) {
            // Customer upsert might fail — continue
          }
        }

        ordersUpserted++;
      }
      log.push(`Upserted ${ordersUpserted} MELI orders, ${mlItemsCreated} items, ${mlProductsCreated} products, ${mlCustomersCreated} customers`);
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
