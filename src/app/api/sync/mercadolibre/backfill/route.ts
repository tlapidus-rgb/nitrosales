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
// E-30. Acá vivía una de las SIETE copias del mapeo de estados de MELI, en
// dos familias que no coincidían: `confirmed` era APPROVED en cinco y
// PENDING en dos, y eso decide si la orden cuenta como venta. Ahora todos
// llaman a `mapMeliStatus` —espejo de `vtex-status.ts`— directamente.
import { ingestMlOrder } from "@/lib/connectors/ml-order-ingestion";
import { mapMeliStatus } from "@/lib/meli-status";
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
      dateTo: weekEnd.toISOString(),
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
          const saved = await ingestMlOrder(orgId, order, mapMeliStatus(order.status, order.tags), token);
          if (saved.enriched) upserted++;
          itemsCreated += saved.itemsCreated;
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

            if (String(detail?.id) !== String(order.externalId)) throw new Error("ML order identity mismatch");
            const saved = await ingestMlOrder(orgId, detail, mapMeliStatus(detail.status, detail.tags), token);
            if (saved.enriched) updated++;

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
    const complete = !result.errors?.length;
    await prisma.connection.update({
      where: { id: connection.id },
      data: complete ? { lastSyncAt: now, lastSuccessfulSyncAt: now, lastSyncError: null }
        : { lastSyncAt: now, lastSyncError: "ML backfill incomplete" },
    });

    return NextResponse.json({ ok: complete, elapsed: `${elapsed}s`, ...result });
  } catch (err: any) {
    console.error(`[ML Backfill] Error:`, err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

