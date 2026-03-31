// ══════════════════════════════════════════════════════════════
// ML Backfill — Sync historical data one chunk at a time
// ══════════════════════════════════════════════════════════════
// Call with ?step=orders_month&month=1 to sync orders from 1 month ago
// Call with ?step=orders_month&month=2 to sync orders from 2 months ago
// etc.
//
// Steps:
//   orders_month: sync one month of orders (pass &month=1..6)
//   listings: sync active+paused listings
//   questions: sync all questions
//   reputation: sync reputation snapshot
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
export const maxDuration = 60; // Vercel free plan limit

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(req.url);
  const step = searchParams.get("step") || "orders_month";
  const month = parseInt(searchParams.get("month") || "1");

  try {
    const { token, mlUserId } = await getSellerToken();
    const connection = await prisma.connection.findFirst({
      where: { platform: "MERCADOLIBRE" as any },
    });
    if (!connection) {
      return NextResponse.json({ error: "No ML connection" }, { status: 404 });
    }
    const orgId = connection.organizationId;

    let result: any = {};

    switch (step) {
      case "orders_month": {
        // Fetch one month of orders
        const monthEnd = new Date(Date.now() - (month - 1) * 30 * 24 * 60 * 60 * 1000);
        const monthStart = new Date(Date.now() - month * 30 * 24 * 60 * 60 * 1000);
        const mlOrders = await fetchSellerOrders(token, mlUserId, {
          dateFrom: monthStart.toISOString(),
          maxOrders: 5000,
        });

        // Filter to only orders within this month window
        const filtered = mlOrders.filter((o: any) => {
          const d = new Date(o.date_created);
          return d >= monthStart && d <= monthEnd;
        });

        let upserted = 0;
        for (const order of filtered) {
          const status = mapMLOrderStatus(order.status);
          const totalValue = order.total_amount || 0;
          const itemCount = (order.order_items || []).reduce(
            (sum: number, i: any) => sum + (i.quantity || 1), 0
          );

          await prisma.order.upsert({
            where: {
              organizationId_externalId: { organizationId: orgId, externalId: String(order.id) },
            },
            update: { status, totalValue, itemCount, paymentMethod: order.payments?.[0]?.payment_type || null },
            create: {
              organizationId: orgId,
              externalId: String(order.id),
              status,
              totalValue,
              currency: order.currency_id || "ARS",
              itemCount,
              source: "MELI",
              channel: "marketplace",
              paymentMethod: order.payments?.[0]?.payment_type || null,
              orderDate: new Date(order.date_created),
            },
          });
          upserted++;
        }

        result = {
          step: "orders_month",
          month,
          period: `${monthStart.toISOString().split("T")[0]} → ${monthEnd.toISOString().split("T")[0]}`,
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
    await prisma.connection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date() } });

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
