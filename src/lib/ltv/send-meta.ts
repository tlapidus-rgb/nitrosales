// ══════════════════════════════════════════════════════════════
// LTV → Meta CAPI: Envío de predicted_ltv
// ══════════════════════════════════════════════════════════════
// Envía el LTV predicho a Meta Conversions API como campo
// `predicted_ltv` dentro de `custom_data` del evento Purchase.
//
// Documentación oficial de Meta:
// https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/custom-data
// Campo: predicted_ltv (float) — valor predicho del cliente a largo plazo
//
// ⚠️  SEGURIDAD: Este módulo está DESACTIVADO por defecto.
// No envía NADA a menos que LTV_SEND_ENABLED=true en env vars.
// Tomy activa esto manualmente en Vercel cuando esté convencido.
//
// NOTA: Este archivo es NUEVO. NO modifica src/lib/pixel/capi.ts
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import crypto from "crypto";

// ─── Types ───

interface SendLtvToMetaResult {
  success: boolean;
  skipped: boolean;
  reason?: string;
}

// ─── Helpers ───

function sha256(value: string): string {
  return crypto
    .createHash("sha256")
    .update(value.toLowerCase().trim())
    .digest("hex");
}

// ─── Resolve Meta credentials (same logic as capi.ts) ───

async function resolveMetaCredentials(
  organizationId: string
): Promise<{ pixelId: string; accessToken: string } | null> {
  const connection = await prisma.connection.findFirst({
    where: {
      organizationId,
      platform: "META" as any,
      status: "ACTIVE" as any,
    },
    select: { credentials: true },
  });

  let pixelId: string | undefined;
  let accessToken: string | undefined;

  if (connection?.credentials) {
    const creds = connection.credentials as Record<string, string>;
    pixelId = creds.pixelId || creds.pixel_id;
    accessToken = creds.accessToken || creds.access_token;
  }

  if (!pixelId || !accessToken) {
    pixelId = pixelId || process.env.META_PIXEL_ID;
    accessToken = accessToken || process.env.META_ADS_ACCESS_TOKEN;
  }

  if (!pixelId || !accessToken) return null;
  return { pixelId, accessToken };
}

// ══════════════════════════════════════════════════════════════
// ENVIAR predicted_ltv A META CAPI
// ══════════════════════════════════════════════════════════════
// Envía un evento Purchase con el campo predicted_ltv.
// Meta usa este campo para value-based lookalike audiences y
// optimización de campañas hacia clientes de alto valor.
//
// El evento se envía con:
// - event_name: "Purchase" (mismo evento, Meta lo deduplica por event_id)
// - custom_data.value: valor REAL de la primera compra
// - custom_data.predicted_ltv: valor PREDICHO a 365 días
// - custom_data.order_id: ID de la primera orden (para dedup)

export async function sendPredictedLtvToMeta(
  orgId: string,
  customerId: string
): Promise<SendLtvToMetaResult> {
  // ─── CANDADO 1: Flag global ───
  if (process.env.LTV_SEND_ENABLED !== "true") {
    return {
      success: false,
      skipped: true,
      reason: "LTV_SEND_ENABLED is not true — envío desactivado",
    };
  }

  try {
    // Get the prediction
    const prediction = await prisma.customerLtvPrediction.findUnique({
      where: {
        customerId_organizationId: { customerId, organizationId: orgId },
      },
    });

    if (!prediction) {
      return { success: false, skipped: true, reason: "No prediction found" };
    }

    // ─── CANDADO 2: Confianza mínima ───
    if (prediction.confidence < 0.5) {
      return {
        success: false,
        skipped: true,
        reason: `Confidence too low: ${prediction.confidence} (min 0.5)`,
      };
    }

    // ─── CANDADO 3: Flag por cliente ───
    if (prediction.sentToMeta) {
      return {
        success: false,
        skipped: true,
        reason: "Already sent to Meta",
      };
    }

    // Get customer data
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { email: true, phone: true },
    });

    // Get first order (for value and order_id)
    const firstOrder = await prisma.order.findFirst({
      where: {
        customerId,
        organizationId: orgId,
        status: { notIn: ["CANCELLED", "RETURNED"] },
        source: { not: "MELI" },
      },
      orderBy: { orderDate: "asc" },
      select: {
        id: true,
        externalId: true,
        totalValue: true,
        currency: true,
      },
    });

    if (!firstOrder) {
      return {
        success: false,
        skipped: true,
        reason: "No qualifying order found",
      };
    }

    // Get Meta credentials
    const creds = await resolveMetaCredentials(orgId);
    if (!creds) {
      return {
        success: false,
        skipped: true,
        reason: "No Meta credentials configured",
      };
    }

    // Build the CAPI event
    const timestamp = Math.floor(Date.now() / 1000);
    const eventId = `ltv_${customerId}_${timestamp}`;

    const userData: Record<string, any> = {};
    if (customer?.email) userData.em = [sha256(customer.email)];
    if (customer?.phone)
      userData.ph = [sha256(customer.phone.replace(/[^0-9]/g, ""))];
    userData.country = [sha256("ar")];

    const customData: Record<string, any> = {
      value: Number(firstOrder.totalValue),
      currency: firstOrder.currency || "ARS",
      order_id: firstOrder.externalId || firstOrder.id,
      // ★ Campo clave: predicted_ltv
      // Meta lo usa para optimizar campañas hacia clientes de alto valor
      predicted_ltv: Number(prediction.predictedLtv365d),
    };

    const eventPayload = {
      data: [
        {
          event_name: "Purchase",
          event_time: timestamp,
          event_id: eventId,
          action_source: "website" as const,
          user_data: userData,
          custom_data: customData,
        },
      ],
    };

    // Send to Meta
    const url = `https://graph.facebook.com/v21.0/${creds.pixelId}/events?access_token=${creds.accessToken}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventPayload),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "unknown");
      console.error(
        `[LTV→Meta] API error ${response.status}: ${errorBody}`
      );
      return { success: false, skipped: false, reason: `API error: ${response.status}` };
    }

    const result = await response.json();
    console.log(
      `[LTV→Meta] Sent pLTV=${Number(prediction.predictedLtv365d).toFixed(0)} for customer ${customerId}: events_received=${result.events_received}`
    );

    // Mark as sent
    await prisma.customerLtvPrediction.update({
      where: {
        customerId_organizationId: { customerId, organizationId: orgId },
      },
      data: { sentToMeta: true, sentToMetaAt: new Date() },
    });

    return { success: true, skipped: false };
  } catch (error: any) {
    console.error("[LTV→Meta] Error:", error);
    return { success: false, skipped: false, reason: error.message };
  }
}

// ─── Batch send: enviar a todos los clientes con predicción pendiente ───

export async function sendAllPendingToMeta(
  orgId: string
): Promise<{ sent: number; skipped: number; errors: number }> {
  // CANDADO: Check global flag first
  if (process.env.LTV_SEND_ENABLED !== "true") {
    console.log("[LTV→Meta] Batch skipped — LTV_SEND_ENABLED is not true");
    return { sent: 0, skipped: 0, errors: 0 };
  }

  const pending = await prisma.customerLtvPrediction.findMany({
    where: {
      organizationId: orgId,
      sentToMeta: false,
      confidence: { gte: 0.5 },
    },
    select: { customerId: true },
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const p of pending) {
    const result = await sendPredictedLtvToMeta(orgId, p.customerId);
    if (result.success) sent++;
    else if (result.skipped) skipped++;
    else errors++;

    // Rate limiting: wait 100ms between sends to not overwhelm Meta API
    if (sent % 10 === 0 && sent > 0) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  console.log(
    `[LTV→Meta] Batch complete: ${sent} sent, ${skipped} skipped, ${errors} errors`
  );
  return { sent, skipped, errors };
}
