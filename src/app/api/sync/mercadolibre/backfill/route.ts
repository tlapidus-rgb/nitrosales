// ══════════════════════════════════════════════════════════════
// ML Backfill — Sync historical data one chunk at a time (Tanda 9)
// ══════════════════════════════════════════════════════════════
// Uses WEEKS for orders (EMDJ has too many per month):
//   ?step=orders&week=1  → last 7 days
//   ?step=orders&week=2  → 7-14 days ago
//   ...up to week=26 (6 months)
//
// Other steps:
//   ?step=listings    → active+paused listings
//   ?step=questions   → all questions
//   ?step=reputation  → reputation snapshot
//
// SAFETY: READ-ONLY from ML API.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  getSellerToken,
  fetchSellerListings,
  fetchSellerOrders,
  fetchSellerReputation,
  fetchSellerQuestions,
} from "@/lib/connectors/mercadolibre-seller";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Pro plan — 5 min

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(req.url);
  const step = searchParams.get("step") || "orders";
  const week = parseInt(searchParams.get("week") || "1");

  try {
    // Multi-tenant safe: resolver orgId de la connection activa primero.
    const connection = await prisma.connection.findFirst({
      where: { platform: "MERCADOLIBRE" as any, status: "ACTIVE" as any },
      select: { id: true, organizationId: true },
    });
    if (!connection) {
      return NextResponse.json({ error: "No active ML connection" }, { status: 404 });
    }
    const orgId = connection.organizationId;
    const { token, mlUserId } = await getSellerToken(orgId);

    let result: any = {};

    switch (step) {
      case "orders": {
        // Fetch one week of orders
        const DAY = 24 * 60 * 60 * 1000;
        const weekEnd = new Date(Date.now() - (week - 1) * 7 * DAY);
        const weekStart = new Date(Date.now() - week * 7 * DAY);
        const mlOrders = await fetchSellerOrders(token, mlUserId, {
          dateFrom: weekStart.toISOString(),
          maxOrders: 2000,
        });

        // Filter to only orders within this week window
        const filtered = mlOrders.filter((o: any) => {
          const d = new Date(o.date_created);
          return d >= weekStart && d <= weekEnd;
        });

        let upserted = 0;
        let itemsCreated = 0;
        for (const order of filtered) {
          const status = mapMLOrderStatus(order.status);
          const totalValue = order.total_amount || 0;
          const mlItems = order.order_items || [];
          const itemCount = mlItems.reduce(
            (sum: number, i: any) => sum + (i.quantity || 1), 0
          );
          // Tanda 7.5 \u2014 sale_fee por \u00edtem (comisi\u00f3n ML)
          const marketplaceFee = mlItems.reduce(
            (sum: number, item: any) => sum + (Number(item.sale_fee) || 0),
            0
          );

          // Tanda 7.10.4 — promociones ML (order-level + item-level)
          const orderPromos: string[] = Array.isArray(order.promotions)
            ? order.promotions.map((p: any) => (p?.name || p?.type || "").toString().trim()).filter(Boolean)
            : [];
          const itemPromos: string[] = mlItems
            .map((it: any) => (it?.promotion?.name || it?.promotion?.type || "").toString().trim())
            .filter(Boolean);
          const allPromos = Array.from(new Set([...orderPromos, ...itemPromos]));
          const promotionNames = allPromos.length ? allPromos.join(", ") : null;

          // Extract shipping cost & delivery type from shipping data
          const shippingCost = order.shipping?.cost ?? null;
          const deliveryType = order.shipping?.shipment_type === "pickup"
            ? "pickup" : order.shipping ? "shipping" : null;

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
              ...(marketplaceFee > 0 ? { marketplaceFee } : {}),
              ...(shippingCost != null ? { shippingCost } : {}),
              ...(deliveryType ? { deliveryType } : {}),
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
              ...(marketplaceFee > 0 ? { marketplaceFee } : {}),
              ...(shippingCost != null ? { shippingCost } : {}),
              ...(deliveryType ? { deliveryType } : {}),
              orderDate: new Date(order.date_created),
            },
          });

          // ── Create Products + OrderItems for MELI ──
          if (mlItems.length > 0) {
            await prisma.orderItem.deleteMany({ where: { orderId: dbOrder.id } });
            for (const mlItem of mlItems) {
              const mlItemId = String(mlItem.item?.id || mlItem.item_id || "");
              const itemTitle = mlItem.item?.title || mlItem.title || `ML Item ${mlItemId}`;
              const unitPrice = mlItem.unit_price || mlItem.full_unit_price || 0;
              const quantity = mlItem.quantity || 1;
              const thumbnailUrl = mlItem.item?.thumbnail || null;

              const product = await prisma.product.upsert({
                where: {
                  organizationId_externalId: { organizationId: orgId, externalId: mlItemId || `meli-${order.id}-${mlItem.item?.id || 0}` },
                },
                create: {
                  organizationId: orgId,
                  externalId: mlItemId || `meli-${order.id}-${mlItem.item?.id || 0}`,
                  name: itemTitle,
                  sku: mlItemId,
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
          upserted++;
        }

        result = {
          step: "orders",
          week,
          period: `${weekStart.toISOString().split("T")[0]} → ${weekEnd.toISOString().split("T")[0]}`,
          fetched: mlOrders.length,
          filtered: filtered.length,
          upserted,
        };
        break;
      }

      case "listings": {
        const items = await fetchSellerListings(token, mlUserId, {
          limit: 10000,
          statuses: ["active", "paused"],
        });

        let upserted = 0;
        for (const item of items) {
          await prisma.mlListing.upsert({
            where: { organizationId_mlItemId: { organizationId: orgId, mlItemId: item.id } },
            update: {
              title: item.title || "", status: item.status || "unknown",
              categoryId: item.category_id, price: item.price || 0,
              originalPrice: item.original_price, currencyId: item.currency_id || "ARS",
              availableQty: item.available_quantity || 0, soldQty: item.sold_quantity || 0,
              listingType: item.listing_type_id, condition: item.condition,
              permalink: item.permalink, thumbnailUrl: item.thumbnail,
              freeShipping: item.shipping?.free_shipping || false,
              fulfillment: item.shipping?.logistic_type,
              catalogListing: !!item.catalog_listing, lastSyncAt: new Date(),
            },
            create: {
              organizationId: orgId, mlItemId: item.id,
              title: item.title || "", status: item.status || "unknown",
              categoryId: item.category_id, price: item.price || 0,
              originalPrice: item.original_price, currencyId: item.currency_id || "ARS",
              availableQty: item.available_quantity || 0, soldQty: item.sold_quantity || 0,
              listingType: item.listing_type_id, condition: item.condition,
              permalink: item.permalink, thumbnailUrl: item.thumbnail,
              freeShipping: item.shipping?.free_shipping || false,
              fulfillment: item.shipping?.logistic_type,
              catalogListing: !!item.catalog_listing, lastSyncAt: new Date(),
            },
          });
          upserted++;
        }
        result = { step: "listings", fetched: items.length, upserted };
        break;
      }

      case "questions": {
        const questions = await fetchSellerQuestions(token, mlUserId, { limit: 500 });
        let upserted = 0;
        for (const q of questions) {
          await prisma.mlQuestion.upsert({
            where: { organizationId_mlQuestionId: { organizationId: orgId, mlQuestionId: String(q.id) } },
            update: { status: q.status, answerText: q.answer?.text || null, answerDate: q.answer?.date_created ? new Date(q.answer.date_created) : null },
            create: {
              organizationId: orgId, mlQuestionId: String(q.id),
              mlItemId: q.item_id || "", text: q.text || "",
              status: q.status || "UNKNOWN", dateCreated: new Date(q.date_created),
              answerText: q.answer?.text || null,
              answerDate: q.answer?.date_created ? new Date(q.answer.date_created) : null,
              fromBuyerId: q.from?.id ? BigInt(q.from.id) : null,
            },
          });
          upserted++;
        }
        result = { step: "questions", fetched: questions.length, upserted };
        break;
      }

      case "fees": {
        // Backfill marketplaceFee for MELI orders that don't have it
        const ordersNeedFees = await prisma.order.findMany({
          where: {
            organizationId: orgId,
            source: "MELI",
            marketplaceFee: null,
          },
          select: { id: true, externalId: true },
          orderBy: { orderDate: "desc" },
          take: parseInt(searchParams.get("batch") || "50"),
        });

        const totalMissing = await prisma.order.count({
          where: { organizationId: orgId, source: "MELI", marketplaceFee: null },
        });

        let updated = 0;
        const errors: string[] = [];
        const ML_API = "https://api.mercadolibre.com";

        for (const order of ordersNeedFees) {
          try {
            const res = await fetch(`${ML_API}/orders/${order.externalId}`, {
              headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
              signal: AbortSignal.timeout(10000),
            });
            if (!res.ok) { errors.push(`${order.externalId}: HTTP ${res.status}`); continue; }
            const detail = await res.json();

            const mlItems = detail.order_items || [];
            const fee = mlItems.reduce(
              (sum: number, item: any) => sum + (Number(item.sale_fee) || 0), 0
            );
            const shipCost = detail.shipping?.cost ?? null;
            const deliveryType = detail.shipping?.shipment_type === "pickup"
              ? "pickup" : detail.shipping ? "shipping" : null;

            await prisma.order.update({
              where: { id: order.id },
              data: {
                marketplaceFee: fee > 0 ? fee : 0,
                ...(shipCost != null ? { shippingCost: shipCost } : {}),
                ...(deliveryType ? { deliveryType } : {}),
                paymentMethod: detail.payments?.[0]?.payment_type || undefined,
              },
            });
            updated++;
          } catch (e: any) {
            errors.push(`${order.externalId}: ${e.message.substring(0, 80)}`);
          }
        }

        result = {
          step: "fees",
          updated,
          remaining: totalMissing - updated,
          errors: errors.slice(0, 10),
        };
        break;
      }

      case "reputation": {
        const rep = await fetchSellerReputation(token, mlUserId);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        await prisma.mlSellerMetricDaily.upsert({
          where: { organizationId_date: { organizationId: orgId, date: today } },
          update: {
            reputationLevel: rep.level, reputationPower: rep.powerSeller,
            totalSales: rep.transactions.total, completedSales: rep.transactions.completed,
            cancelledSales: rep.transactions.canceled, claimsRate: rep.metrics.claims.rate,
            delayedHandlingRate: rep.metrics.delayed.rate, cancellationRate: rep.metrics.cancellations.rate,
            positiveRatings: rep.ratings.positive, negativeRatings: rep.ratings.negative,
            neutralRatings: rep.ratings.neutral,
          },
          create: {
            organizationId: orgId, date: today,
            reputationLevel: rep.level, reputationPower: rep.powerSeller,
            totalSales: rep.transactions.total, completedSales: rep.transactions.completed,
            cancelledSales: rep.transactions.canceled, claimsRate: rep.metrics.claims.rate,
            delayedHandlingRate: rep.metrics.delayed.rate, cancellationRate: rep.metrics.cancellations.rate,
            positiveRatings: rep.ratings.positive, negativeRatings: rep.ratings.negative,
            neutralRatings: rep.ratings.neutral,
          },
        });
        result = { step: "reputation", level: rep.level, totalSales: rep.transactions.total };
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown step: ${step}` }, { status: 400 });
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const now = new Date();
    await prisma.connection.update({
      where: { id: connection.id },
      data: { lastSyncAt: now, lastSuccessfulSyncAt: now, lastSyncError: null },
    });

    return NextResponse.json({ ok: true, elapsed: `${elapsed}s`, ...result });
  } catch (err: any) {
    console.error(`[ML Backfill] Error:`, err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

function mapMLOrderStatus(mlStatus: string): "PENDING" | "APPROVED" | "SHIPPED" | "DELIVERED" | "CANCELLED" {
  switch (mlStatus) {
    case "confirmed": return "APPROVED";
    case "payment_required": case "payment_in_process": case "partially_paid": return "PENDING";
    case "paid": return "APPROVED";
    case "shipped": return "SHIPPED";
    case "delivered": return "DELIVERED";
    case "cancelled": return "CANCELLED";
    default: return "PENDING";
  }
}
