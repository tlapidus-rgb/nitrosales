// ══════════════════════════════════════════════════════════════
// LTV → Google Ads: Conversion Value Adjustment (RESTATEMENT)
// ══════════════════════════════════════════════════════════════
// Actualiza el valor de una conversión ya importada en Google Ads
// con el LTV predicho. Usa ConversionAdjustmentUploadService con
// adjustment_type = RESTATEMENT.
//
// Documentación oficial de Google:
// https://developers.google.com/google-ads/api/docs/conversions/upload-adjustments
// - adjustment_type: RESTATEMENT (reemplaza el valor original)
// - adjusted_value: nuevo valor (pLTV 365d)
// - gclid_date_time_pair o order_id: identifica la conversión original
//
// Google acepta ajustes hasta 55 días después de la conversión original.
//
// ⚠️  SEGURIDAD: Este módulo está DESACTIVADO por defecto.
// No envía NADA a menos que LTV_SEND_ENABLED=true en env vars.
// Tomy activa esto manualmente en Vercel cuando esté convencido.
//
// NOTA: Este archivo es NUEVO. NO modifica src/lib/pixel/google-ads.ts
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";

// ─── Types ───

interface SendLtvToGoogleResult {
  success: boolean;
  skipped: boolean;
  reason?: string;
}

// ─── Resolve Google Ads credentials (same logic as google-ads.ts) ───

async function resolveGoogleAdsCredentials(organizationId: string): Promise<{
  accessToken: string;
  customerId: string;
  conversionActionId: string;
  developerToken: string;
  loginCustomerId?: string;
} | null> {
  const connection = await prisma.connection.findFirst({
    where: {
      organizationId,
      platform: "GOOGLE_ADS" as any,
      status: "ACTIVE" as any,
    },
    select: { credentials: true },
  });

  if (!connection?.credentials) return null;

  const creds = connection.credentials as Record<string, string>;
  const accessToken = creds.accessToken || creds.access_token;
  const customerId = creds.customerId || creds.customer_id;
  const conversionActionId =
    creds.conversionActionId || creds.conversion_action_id;
  const developerToken =
    creds.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";

  if (!accessToken || !customerId || !conversionActionId) return null;

  return {
    accessToken,
    customerId,
    conversionActionId,
    developerToken,
    loginCustomerId: creds.loginCustomerId,
  };
}

// ══════════════════════════════════════════════════════════════
// ENVIAR LTV ADJUSTMENT A GOOGLE ADS
// ══════════════════════════════════════════════════════════════
// Envía un RESTATEMENT que actualiza el valor de la conversión
// original con el LTV predicho a 365 días.
//
// Google Ads usa este valor actualizado para:
// - Value-based bidding (tROAS, Max Conversion Value)
// - Smart Bidding optimization
// - Audience signals para encontrar clientes similares de alto valor

export async function sendLtvAdjustmentToGoogle(
  orgId: string,
  customerId: string
): Promise<SendLtvToGoogleResult> {
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
        customerId_organizationId: {
          customerId,
          organizationId: orgId,
        },
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
    if (prediction.sentToGoogle) {
      return {
        success: false,
        skipped: true,
        reason: "Already sent to Google",
      };
    }

    // Get the first order (need order_id and date for adjustment identification)
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
        orderDate: true,
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

    // Check if the order is within Google's adjustment window (55 days)
    const daysSinceOrder = Math.floor(
      (Date.now() - firstOrder.orderDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceOrder > 55) {
      return {
        success: false,
        skipped: true,
        reason: `Order too old for adjustment: ${daysSinceOrder} days (max 55)`,
      };
    }

    // Try to find the gclid for this conversion (from pixel_events)
    const pixelEvent = await prisma.pixelEvent.findFirst({
      where: {
        organizationId: orgId,
        eventType: "Purchase",
        props: {
          path: ["orderId"],
          equals: firstOrder.externalId || firstOrder.id,
        },
      },
      select: { clickIds: true },
    });

    const clickIds = pixelEvent?.clickIds as Record<string, string> | null;
    const gclid = clickIds?.gclid;

    // Get Google Ads credentials
    const creds = await resolveGoogleAdsCredentials(orgId);
    if (!creds) {
      return {
        success: false,
        skipped: true,
        reason: "No Google Ads credentials configured",
      };
    }

    // Build the adjustment payload
    // https://developers.google.com/google-ads/api/rest/reference/rest/v17/customers/uploadConversionAdjustments
    const conversionDateTime = firstOrder.orderDate
      .toISOString()
      .replace("T", " ")
      .replace("Z", "+00:00");

    const adjustmentPayload: Record<string, any> = {
      conversionAdjustments: [
        {
          adjustmentType: "RESTATEMENT",
          conversionAction: `customers/${creds.customerId}/conversionActions/${creds.conversionActionId}`,
          adjustmentDateTime: new Date()
            .toISOString()
            .replace("T", " ")
            .replace("Z", "+00:00"),
          restatementValue: {
            adjustedValue: Number(prediction.predictedLtv365d),
            currencyCode: firstOrder.currency || "ARS",
          },
          // Identify the original conversion
          ...(gclid
            ? {
                gclidDateTimePair: {
                  gclid,
                  conversionDateTime,
                },
              }
            : {
                orderId: firstOrder.externalId || firstOrder.id,
              }),
        },
      ],
      partialFailure: true,
    };

    // Send to Google Ads
    const url = `https://googleads.googleapis.com/v17/customers/${creds.customerId}:uploadConversionAdjustments`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.accessToken}`,
        "developer-token": creds.developerToken,
        ...(creds.loginCustomerId && {
          "login-customer-id": creds.loginCustomerId,
        }),
      },
      body: JSON.stringify(adjustmentPayload),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "unknown");
      console.error(
        `[LTV→Google] API error ${response.status}: ${errorBody}`
      );
      return {
        success: false,
        skipped: false,
        reason: `API error: ${response.status}`,
      };
    }

    const result = await response.json();
    const hasErrors = result.partialFailureError?.details?.length > 0;
    if (hasErrors) {
      console.error(
        `[LTV→Google] Partial failure for customer ${customerId}:`,
        JSON.stringify(result.partialFailureError)
      );
      return {
        success: false,
        skipped: false,
        reason: "Partial failure from Google API",
      };
    }

    console.log(
      `[LTV→Google] RESTATEMENT sent: pLTV=${Number(prediction.predictedLtv365d).toFixed(0)} for customer ${customerId} (order: ${firstOrder.externalId || firstOrder.id})`
    );

    // Mark as sent
    await prisma.customerLtvPrediction.update({
      where: {
        customerId_organizationId: { customerId, organizationId: orgId },
      },
      data: { sentToGoogle: true, sentToGoogleAt: new Date() },
    });

    return { success: true, skipped: false };
  } catch (error: any) {
    console.error("[LTV→Google] Error:", error);
    return { success: false, skipped: false, reason: error.message };
  }
}

// ─── Batch send: enviar a todos los clientes con predicción pendiente ───

export async function sendAllPendingToGoogle(
  orgId: string
): Promise<{ sent: number; skipped: number; errors: number }> {
  // CANDADO: Check global flag first
  if (process.env.LTV_SEND_ENABLED !== "true") {
    console.log("[LTV→Google] Batch skipped — LTV_SEND_ENABLED is not true");
    return { sent: 0, skipped: 0, errors: 0 };
  }

  const pending = await prisma.customerLtvPrediction.findMany({
    where: {
      organizationId: orgId,
      sentToGoogle: false,
      confidence: { gte: 0.5 },
    },
    select: { customerId: true },
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const p of pending) {
    const result = await sendLtvAdjustmentToGoogle(orgId, p.customerId);
    if (result.success) sent++;
    else if (result.skipped) skipped++;
    else errors++;

    // Rate limiting: Google Ads API has lower limits
    if (sent % 5 === 0 && sent > 0) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log(
    `[LTV→Google] Batch complete: ${sent} sent, ${skipped} skipped, ${errors} errors`
  );
  return { sent, skipped, errors };
}
