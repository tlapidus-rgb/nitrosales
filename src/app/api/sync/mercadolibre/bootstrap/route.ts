// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/sync/mercadolibre/bootstrap?orgId=X&key=Y
// ══════════════════════════════════════════════════════════════
// Multi-tenant safe. Sincroniza la data "de estado actual" del
// seller de ML para una org específica:
//   - Listings (publicaciones activas + pausadas)
//   - Reputación (mlSellerMetricDaily de hoy)
//   - Preguntas sin responder
//
// NO toca orders — eso lo hace el backfill v2 (backfill_jobs +
// ml-processor) y los webhooks en tiempo real. Acá solo llenamos
// lo que "no tiene historia": listings / reputación / preguntas.
//
// Se llama desde approve-backfill con waitUntil, así después de
// aprobar el backfill de órdenes, el cliente entra al /mercadolibre
// y ve TODO (ventas + publicaciones + reputación + preguntas) sin
// pasos manuales extra.
//
// SAFETY:
//   - Requiere key secreta (server-to-server)
//   - orgId explícito (jamás findFirst global)
//   - Cada step en try/catch para no fallar todo si uno solo rompe
//   - Idempotente: upserts por (organizationId + X)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  getSellerToken,
  fetchSellerListings,
  fetchSellerReputation,
  fetchSellerQuestions,
} from "@/lib/connectors/mercadolibre-seller";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BOOTSTRAP_KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const log: string[] = [];
  const errors: string[] = [];

  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");

    if (key !== BOOTSTRAP_KEY) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }

    // Verificar que la org tenga conexión ML activa (multi-tenant safe)
    const connection = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "MERCADOLIBRE" as any },
      select: { id: true, status: true, credentials: true },
    });
    if (!connection) {
      return NextResponse.json({ error: "No ML connection for org" }, { status: 404 });
    }

    const creds = (connection.credentials as any) || {};
    if (!creds.accessToken || !creds.mlUserId) {
      return NextResponse.json(
        { error: "ML connection has no OAuth tokens — user did not complete OAuth flow" },
        { status: 400 }
      );
    }

    const { token, mlUserId } = await getSellerToken(orgId);
    log.push(`Token OK for org ${orgId} user ${mlUserId}`);

    // ── Step 1: Listings ─────────────────────────────────────
    try {
      const items = await fetchSellerListings(token, mlUserId, {
        limit: 10000,
        statuses: ["active", "paused"],
      });
      log.push(`Fetched ${items.length} listings`);
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

    // ── Step 2: Reputación ───────────────────────────────────
    try {
      const rep = await fetchSellerReputation(token, mlUserId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.mlSellerMetricDaily.upsert({
        where: { organizationId_date: { organizationId: orgId, date: today } },
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

    // ── Step 3: Preguntas sin responder ───────────────────────
    try {
      const questions = await fetchSellerQuestions(token, mlUserId, { limit: 500 });
      log.push(`Fetched ${questions.length} questions`);
      let upserted = 0;
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
        upserted++;
      }
      log.push(`Upserted ${upserted} questions`);
    } catch (err: any) {
      errors.push(`Questions: ${err.message}`);
    }

    // Update connection lastSyncAt
    await prisma.connection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: new Date(),
        lastSuccessfulSyncAt: errors.length === 0 ? new Date() : undefined,
        lastSyncError: errors.length > 0 ? errors.join("; ").slice(0, 500) : null,
      },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return NextResponse.json({
      ok: errors.length === 0,
      orgId,
      elapsed: `${elapsed}s`,
      steps: log,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error("[ml-bootstrap] fatal:", err);
    return NextResponse.json(
      { ok: false, error: err.message, steps: log },
      { status: 500 }
    );
  }
}
