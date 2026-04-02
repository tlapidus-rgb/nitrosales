// ══════════════════════════════════════════════════════════════
// API: POST /api/ltv/predict
// ══════════════════════════════════════════════════════════════
// Ejecuta el motor de predicción de LTV para todos los clientes
// de la organización. Calcula y guarda predicciones en la tabla
// customer_ltv_predictions.
//
// NO envía nada a Meta ni a Google. Solo calcula internamente.
// El envío a plataformas se controla con LTV_SEND_ENABLED.
//
// GET: Retorna predicciones existentes + resumen
// POST: Recalcula predicciones para todos los clientes
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { runBatchPrediction } from "@/lib/ltv/prediction-engine";

export const revalidate = 0;

// ─── GET: Retornar predicciones existentes ───

export async function GET() {
  try {
    const ORG_ID = await getOrganizationId();

    // Get all predictions with customer info
    const predictions = await prisma.customerLtvPrediction.findMany({
      where: { organizationId: ORG_ID },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { predictedLtv365d: "desc" },
    });

    // Calculate summary stats
    const total = predictions.length;
    const highValue = predictions.filter(
      (p) => p.segmentBucket === "high_value"
    ).length;
    const mediumValue = predictions.filter(
      (p) => p.segmentBucket === "medium_value"
    ).length;
    const lowValue = predictions.filter(
      (p) => p.segmentBucket === "low_value"
    ).length;
    const sentToMeta = predictions.filter((p) => p.sentToMeta).length;
    const sentToGoogle = predictions.filter((p) => p.sentToGoogle).length;

    const avgLtv90d =
      total > 0
        ? Math.round(
            predictions.reduce(
              (sum, p) => sum + Number(p.predictedLtv90d),
              0
            ) / total
          )
        : 0;
    const avgLtv365d =
      total > 0
        ? Math.round(
            predictions.reduce(
              (sum, p) => sum + Number(p.predictedLtv365d),
              0
            ) / total
          )
        : 0;
    const avgConfidence =
      total > 0
        ? Math.round(
            (predictions.reduce((sum, p) => sum + p.confidence, 0) / total) *
              100
          ) / 100
        : 0;

    // By channel breakdown
    const byChannel: Record<
      string,
      { customers: number; avgLtv90d: number; avgLtv365d: number }
    > = {};
    for (const p of predictions) {
      const ch = p.acquisitionChannel;
      if (!byChannel[ch]) {
        byChannel[ch] = { customers: 0, avgLtv90d: 0, avgLtv365d: 0 };
      }
      byChannel[ch].customers += 1;
      byChannel[ch].avgLtv90d += Number(p.predictedLtv90d);
      byChannel[ch].avgLtv365d += Number(p.predictedLtv365d);
    }
    const channelBreakdown = Object.entries(byChannel).map(([channel, d]) => ({
      channel,
      customers: d.customers,
      avgLtv90d: Math.round(d.avgLtv90d / d.customers),
      avgLtv365d: Math.round(d.avgLtv365d / d.customers),
    }));

    // Top 20 by predicted LTV
    const top20 = predictions.slice(0, 20).map((p) => ({
      id: p.customerId,
      name: [p.customer.firstName, p.customer.lastName]
        .filter(Boolean)
        .join(" ") || "Sin nombre",
      email: p.customer.email || "",
      channel: p.acquisitionChannel,
      segment: p.segmentBucket,
      predictedLtv90d: Math.round(Number(p.predictedLtv90d)),
      predictedLtv365d: Math.round(Number(p.predictedLtv365d)),
      confidence: p.confidence,
      sentToMeta: p.sentToMeta,
      sentToGoogle: p.sentToGoogle,
      updatedAt: p.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      summary: {
        total,
        avgLtv90d,
        avgLtv365d,
        avgConfidence,
        distribution: { highValue, mediumValue, lowValue },
        sendStatus: {
          sentToMeta,
          sentToGoogle,
          pendingMeta: total - sentToMeta,
          pendingGoogle: total - sentToGoogle,
        },
        ltvSendEnabled: process.env.LTV_SEND_ENABLED === "true",
      },
      byChannel: channelBreakdown,
      topCustomers: top20,
      lastUpdated:
        predictions.length > 0
          ? predictions[0].updatedAt.toISOString()
          : null,
    });
  } catch (error: any) {
    console.error("[LTV Predict API] GET Error:", error);
    return NextResponse.json(
      { error: "Error fetching predictions", detail: error.message },
      { status: 500 }
    );
  }
}

// ─── POST: Recalcular predicciones ───

export async function POST() {
  try {
    const ORG_ID = await getOrganizationId();

    console.log(`[LTV Predict] Starting batch prediction for org ${ORG_ID}`);
    const startTime = Date.now();

    const result = await runBatchPrediction(ORG_ID);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[LTV Predict] Completed in ${duration}s: ${result.predicted} predicted, ${result.skipped} skipped`
    );

    return NextResponse.json({
      success: true,
      result,
      duration: `${duration}s`,
      ltvSendEnabled: process.env.LTV_SEND_ENABLED === "true",
    });
  } catch (error: any) {
    console.error("[LTV Predict API] POST Error:", error);
    return NextResponse.json(
      { error: "Error running predictions", detail: error.message },
      { status: 500 }
    );
  }
}
