// ══════════════════════════════════════════════════════════════
// MercadoLibre Webhook — Real-time notifications receiver
// ══════════════════════════════════════════════════════════════
// ML sends POST requests when events happen on seller account:
//   - orders_v2: new sale, status change
//   - items: listing changed (price, stock, status)
//   - questions: new question or answer
//   - payments: payment status changed
//   - shipments: shipment status changed
//
// CRITICAL: Must respond 200 within 500ms or ML deactivates us.
// We acknowledge immediately, then process async via queue.
//
// SAFETY: All operations READ from ML API, WRITE to our own DB.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/db/client";
import { processMLNotification } from "@/lib/connectors/ml-notification-processor";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Ensure enough time for ML API fetch + DB writes

// ML Notification IPs (for future IP filtering)
// 54.88.218.97, 18.215.140.160, 18.213.114.129, 18.206.34.84

interface MLNotification {
  _id: string;
  resource: string;    // e.g. "/orders/1234567890" or "/items/MLA123456"
  user_id: number;
  topic: string;       // orders_v2, items, questions, payments, shipments
  application_id: number;
  attempts: number;
  sent: string;
  received: string;
}

export async function POST(req: NextRequest) {
  // ── Step 1: Respond 200 IMMEDIATELY (ML requires <500ms) ──
  // We parse the body and kick off async processing
  let notification: MLNotification;

  try {
    notification = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Validate basic structure
  if (!notification.topic || !notification.resource) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Log for debugging (remove in production later)
  console.log(`[ML Webhook] topic=${notification.topic} resource=${notification.resource} attempts=${notification.attempts}`);

  // ── Step 2: Queue async processing via waitUntil ──
  // El outbox pattern: insertamos el evento crudo en meli_webhook_events
  // ANTES de procesar. UNIQUE(org, externalId) dedupa webhooks duplicados.
  // Si ya existe (ML reenvió), skip silenciosamente.
  waitUntil(
    processWithOutbox(notification).catch((err) => {
      console.error(`[ML Webhook] Error processing ${notification.topic}:`, err.message);
    })
  );

  // ── Step 3: Return 200 immediately ──
  return NextResponse.json({ ok: true });
}

/**
 * Wrapper idempotente: outbox dedup + processMLNotification + marca processed.
 * El outbox garantiza que el mismo evento no se procese 2 veces aunque
 * ML reenvíe el webhook (retries, duplicados).
 */
async function processWithOutbox(notification: MLNotification): Promise<void> {
  // 1. Resolver orgId desde user_id del payload
  const connection = await prisma.connection.findFirst({
    where: {
      platform: "MERCADOLIBRE" as any,
      credentials: { path: ["mlUserId"], equals: notification.user_id } as any,
    },
    select: { organizationId: true },
  });
  if (!connection) {
    console.warn(`[ML Webhook] No connection found for user_id=${notification.user_id}`);
    return;
  }
  const orgId = connection.organizationId;

  // 2. Intentar insertar en outbox. Si P2002 (UNIQUE violation) → ya procesado, skip.
  try {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "meli_webhook_events" (
        "id", "organizationId", "externalId", "resource", "topic",
        "meliUserId", "meliSentAt", "meliReceivedAt", "createdAt"
      )
      VALUES (
        gen_random_uuid()::text, $1, $2, $3, $4,
        $5, $6::timestamptz, $7::timestamptz, NOW()
      )
      `,
      orgId,
      notification._id,
      notification.resource,
      notification.topic,
      notification.user_id,
      notification.sent,
      notification.received
    );
  } catch (err: any) {
    // P2002 o "duplicate key" → ya procesado, skip
    const msg = String(err?.message || "");
    if (msg.includes("duplicate key") || msg.includes("unique") || err?.code === "P2002") {
      console.log(`[ML Webhook] Dedup: ${notification._id} ya procesado`);
      return;
    }
    // Si falla el outbox insert por otro motivo, igual procesamos (best effort)
    console.warn(`[ML Webhook] Outbox insert failed, processing anyway:`, msg);
  }

  // 3. Procesar (lo que ya hacía antes)
  try {
    await processMLNotification(notification);
    // 4. Marcar como procesado
    await prisma.$executeRawUnsafe(
      `UPDATE "meli_webhook_events"
       SET "processed" = true, "processedAt" = NOW()
       WHERE "organizationId" = $1 AND "externalId" = $2`,
      orgId,
      notification._id
    );
  } catch (err: any) {
    // Registrar el error en el outbox para debugging
    await prisma.$executeRawUnsafe(
      `UPDATE "meli_webhook_events"
       SET "processingAttempts" = "processingAttempts" + 1, "lastError" = $3
       WHERE "organizationId" = $1 AND "externalId" = $2`,
      orgId,
      notification._id,
      String(err?.message || "unknown").slice(0, 500)
    ).catch(() => {});
    throw err;
  }
}

// Also handle GET for ML webhook verification (some setups send GET to verify URL)
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: "active",
    topics: ["orders_v2", "items", "questions", "payments", "shipments"],
    app: "NitroSales",
  });
}
