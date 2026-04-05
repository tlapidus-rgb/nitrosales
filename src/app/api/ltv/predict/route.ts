export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// API: /api/ltv/predict
// ══════════════════════════════════════════════════════════════
// GET: Retorna predicciones existentes + resumen (optimizado con SQL)
// POST: Recalcula predicciones para todos los clientes (chunked)
//
// v2 — Performance fixes:
//   - GET: Aggregations moved to SQL (was 9+ JS loops over full array)
//   - POST: Chunked transactions (was 1 massive transaction)
//   - Segment lookup via Map (was O(n) .find() per customer)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { runBatchPrediction } from "@/lib/ltv/prediction-engine";

export const revalidate = 0;
export const maxDuration = 60; // Vercel Pro: allow up to 60s

// ─── GET: Retornar predicciones existentes ───

export async function GET() {
  try {
    const ORG_ID = await getOrganizationId();

    // 1. Summary stats — all aggregation in SQL
    const summaryRows = await prisma.$queryRaw<
      Array<{
        total: string;
        high_value: string;
        medium_value: string;
        low_value: string;
        sent_to_meta: string;
        sent_to_google: string;
        avg_ltv_90d: string;
        avg_ltv_365d: string;
        avg_confidence: string;
      }>
    >`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE "segmentBucket" = 'high_value')::text AS high_value,
        COUNT(*) FILTER (WHERE "segmentBucket" = 'medium_value')::text AS medium_value,
        COUNT(*) FILTER (WHERE "segmentBucket" = 'low_value')::text AS low_value,
        COUNT(*) FILTER (WHERE "sentToMeta" = true)::text AS sent_to_meta,
        COUNT(*) FILTER (WHERE "sentToGoogle" = true)::text AS sent_to_google,
        COALESCE(AVG("predictedLtv90d"), 0)::text AS avg_ltv_90d,
        COALESCE(AVG("predictedLtv365d"), 0)::text AS avg_ltv_365d,
        COALESCE(AVG(confidence), 0)::text AS avg_confidence
      FROM customer_ltv_predictions
      WHERE "organizationId" = ${ORG_ID}
    `;

    const s = summaryRows[0];
    const total = Number(s.total);

    if (total === 0) {
      return NextResponse.json({
        summary: { total: 0 },
        byChannel: [],
        topCustomers: [],
        lastUpdated: null,
      });
    }

    // 2. Channel breakdown — SQL aggregation
    const channelRows = await prisma.$queryRaw<
      Array<{
        channel: string;
        customers: string;
        avg_ltv_90d: string;
        avg_ltv_365d: string;
      }>
    >`
      SELECT
        "acquisitionChannel" AS channel,
        COUNT(*)::text AS customers,
        ROUND(AVG("predictedLtv90d"))::text AS avg_ltv_90d,
        ROUND(AVG("predictedLtv365d"))::text AS avg_ltv_365d
      FROM customer_ltv_predictions
      WHERE "organizationId" = ${ORG_ID}
      GROUP BY "acquisitionChannel"
      ORDER BY AVG("predictedLtv365d") DESC
    `;

    // 3. Top 20 customers — with JOIN, limited in SQL
    const topRows = await prisma.$queryRaw<
      Array<{
        customer_id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        channel: string;
        segment: string;
        ltv_90d: string;
        ltv_365d: string;
        confidence: string;
        sent_to_meta: boolean;
        sent_to_google: boolean;
        updated_at: Date;
        total_orders: number;
        total_spent: string;
        first_order: Date | null;
        last_order: Date | null;
        days_as_customer: number;
      }>
    >`
      SELECT
        p."customerId" AS customer_id,
        c."firstName" AS first_name,
        c."lastName" AS last_name,
        c.email,
        p."acquisitionChannel" AS channel,
        p."segmentBucket" AS segment,
        p."predictedLtv90d"::text AS ltv_90d,
        p."predictedLtv365d"::text AS ltv_365d,
        p.confidence::text AS confidence,
        p."sentToMeta" AS sent_to_meta,
        p."sentToGoogle" AS sent_to_google,
        p."updatedAt" AS updated_at,
        c."totalOrders"::int AS total_orders,
        c."totalSpent"::text AS total_spent,
        (SELECT MIN(o."orderDate") FROM orders o WHERE o."customerId" = c.id AND o."organizationId" = ${ORG_ID}) AS first_order,
        (SELECT MAX(o."orderDate") FROM orders o WHERE o."customerId" = c.id AND o."organizationId" = ${ORG_ID}) AS last_order,
        EXTRACT(DAY FROM NOW() - (SELECT MIN(o."orderDate") FROM orders o WHERE o."customerId" = c.id AND o."organizationId" = ${ORG_ID}))::int AS days_as_customer
      FROM customer_ltv_predictions p
      JOIN customers c ON c.id = p."customerId"
      WHERE p."organizationId" = ${ORG_ID}
      ORDER BY p."predictedLtv365d" DESC
      LIMIT 20
    `;

    // 4. Last updated
    const lastUpdatedRows = await prisma.$queryRaw<
      Array<{ last: Date | null }>
    >`
      SELECT MAX("updatedAt") AS last
      FROM customer_ltv_predictions
      WHERE "organizationId" = ${ORG_ID}
    `;

    const sentToMeta = Number(s.sent_to_meta);
    const sentToGoogle = Number(s.sent_to_google);

    return NextResponse.json({
      summary: {
        total,
        avgLtv90d: Math.round(Number(s.avg_ltv_90d)),
        avgLtv365d: Math.round(Number(s.avg_ltv_365d)),
        avgConfidence: Math.round(Number(s.avg_confidence) * 100) / 100,
        distribution: {
          highValue: Number(s.high_value),
          mediumValue: Number(s.medium_value),
          lowValue: Number(s.low_value),
        },
        sendStatus: {
          sentToMeta,
          sentToGoogle,
          pendingMeta: total - sentToMeta,
          pendingGoogle: total - sentToGoogle,
        },
        ltvSendEnabled: process.env.LTV_SEND_ENABLED === "true",
      },
      byChannel: channelRows.map((ch) => ({
        channel: ch.channel,
        customers: Number(ch.customers),
        avgLtv90d: Number(ch.avg_ltv_90d),
        avgLtv365d: Number(ch.avg_ltv_365d),
      })),
      topCustomers: topRows.map((c) => ({
        id: c.customer_id,
        name:
          [c.first_name, c.last_name].filter(Boolean).join(" ") || "Sin nombre",
        email: c.email || "",
        channel: c.channel,
        segment: c.segment,
        predictedLtv90d: Math.round(Number(c.ltv_90d)),
        predictedLtv365d: Math.round(Number(c.ltv_365d)),
        confidence: Number(c.confidence),
        sentToMeta: c.sent_to_meta,
        sentToGoogle: c.sent_to_google,
        updatedAt: c.updated_at?.toISOString() || null,
        orders: c.total_orders || 0,
        totalSpent: Math.round(Number(c.total_spent || 0)),
        firstOrder: c.first_order ? new Date(c.first_order).toLocaleDateString("es-AR") : null,
        lastOrder: c.last_order ? new Date(c.last_order).toLocaleDateString("es-AR") : null,
        daysAsCustomer: c.days_as_customer || 0,
      })),
      lastUpdated: lastUpdatedRows[0]?.last?.toISOString() || null,
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

    // Read custom thresholds from organization settings
    const org = await prisma.organization.findUnique({
      where: { id: ORG_ID },
      select: { settings: true },
    });
    const settings = (org?.settings as Record<string, any>) || {};
    const thresholds = settings.ltvThresholds || {};
    const lowThreshold = thresholds.low || 25000;
    const medThreshold = thresholds.medium || 100000;

    console.log(`[LTV Predict] Starting batch prediction for org ${ORG_ID} (thresholds: ${lowThreshold}/${medThreshold})`);
    const startTime = Date.now();

    const result = await runBatchPrediction(ORG_ID, lowThreshold, medThreshold);

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
