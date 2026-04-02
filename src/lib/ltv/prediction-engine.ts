// ══════════════════════════════════════════════════════════════
// Motor de Predicción de LTV — Cohort-Based pLTV
// ══════════════════════════════════════════════════════════════
// Predice cuánto va a valer un cliente a largo plazo basándose
// en cómo se comportaron los clientes del mismo segmento
// (canal de adquisición × bucket de ticket).
//
// Modelo: inspirado en BG/NBD + Gamma-Gamma pero implementado
// como lookup de cohortes históricas en TypeScript puro.
// No requiere Python, scipy, ni ML cloud — se basa 100% en datos
// reales de Mundo Juguete.
//
// IMPORTANTE: Este archivo es SOLO LECTURA + CÁLCULO.
// No envía nada a Meta ni a Google. Solo calcula y retorna.
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";

// ─── Types ───

export interface SegmentStats {
  channel: string;
  bucket: string;
  totalCustomers: number;
  repeatCustomers: number;
  repeatRate: number; // 0-1
  avgTicketFirst: number;
  avgTicketRepurchase: number;
  avgOrdersPerCustomer: number;
  avgDaysBetweenOrders: number;
  avgTotalSpent: number; // historical LTV promedio del segmento
}

export interface CustomerPrediction {
  customerId: string;
  acquisitionChannel: string;
  segmentBucket: string;
  predictedLtv90d: number;
  predictedLtv365d: number;
  confidence: number; // 0-1
  inputFeatures: {
    orderCount: number;
    totalSpent: number;
    avgTicket: number;
    daysSinceFirst: number;
    daysSinceLastOrder: number;
    segmentRepeatRate: number;
    segmentAvgLtv: number;
    segmentSampleSize: number;
    method: "cohort_lookup" | "personal_history";
  };
}

export interface BatchPredictionResult {
  totalCustomers: number;
  predicted: number;
  skipped: number;
  avgPredictedLtv90d: number;
  avgPredictedLtv365d: number;
  distribution: {
    highValue: number;
    mediumValue: number;
    lowValue: number;
  };
}

// ─── Constants ───

// Mínimo de clientes en un segmento para que sea confiable
const MIN_SEGMENT_SAMPLE = 5;

// Ticket buckets (en ARS) — se ajustan a Mundo Juguete
// Bajo: $0-$30,000 | Medio: $30,001-$80,000 | Alto: $80,001+
const TICKET_THRESHOLDS = {
  low: 30000,
  medium: 80000,
};

// MercadoLibre excluido: no tiene datos de clientes
const MELI_EXCLUDE = `AND o."source" != 'MELI'`;

// ─── Helpers ───

function classifyTicket(avgTicket: number): string {
  if (avgTicket <= TICKET_THRESHOLDS.low) return "low_value";
  if (avgTicket <= TICKET_THRESHOLDS.medium) return "medium_value";
  return "high_value";
}

function resolveChannel(
  touchpoints: string | null,
  trafficSource: string | null
): string {
  // Priority 1: Pixel attribution touchpoints
  if (touchpoints) {
    const t = touchpoints.toLowerCase();
    if (t.includes("google") && (t.includes("cpc") || t.includes("paid")))
      return "Google Ads";
    if (
      t.includes("facebook") ||
      t.includes("meta") ||
      t.includes("instagram")
    )
      return "Meta Ads";
    if (t.includes("google") && t.includes("organic")) return "Google Organic";
    if (t.includes("tiktok")) return "TikTok";
  }
  // Priority 2: Traffic source from order
  if (trafficSource) {
    const s = trafficSource.toLowerCase();
    if (s.includes("paid") || s.includes("cpc")) {
      if (s.includes("google")) return "Google Ads";
      if (s.includes("facebook") || s.includes("meta")) return "Meta Ads";
      return "Paid Otro";
    }
    if (s.includes("organic")) return "Google Organic";
    if (s.includes("direct")) return "Directo";
  }
  return "Sin datos";
}

// ══════════════════════════════════════════════════════════════
// 1. CALCULAR ESTADÍSTICAS POR SEGMENTO (canal × bucket)
// ══════════════════════════════════════════════════════════════
// Mira TODOS los clientes históricos para entender cómo se
// comporta cada combinación de canal + rango de ticket.

export async function calculateSegmentStats(
  orgId: string
): Promise<SegmentStats[]> {
  // Get all customers with their order history, acquisition channel, and ticket info
  // Only VTEX customers (MELI excluded)
  const rawData = await prisma.$queryRawUnsafe<
    Array<{
      customer_id: string;
      order_count: string;
      total_spent: string;
      avg_ticket: string;
      first_order_value: string;
      first_order_date: string;
      last_order_date: string;
      avg_days_between: string;
      touchpoints: string | null;
      traffic_source: string | null;
    }>
  >(
    `
    WITH customer_orders AS (
      SELECT
        o."customerId" AS customer_id,
        COUNT(*)::int AS order_count,
        SUM(o."totalValue") AS total_spent,
        AVG(o."totalValue") AS avg_ticket,
        MIN(o."totalValue") AS first_order_value,
        MIN(o."orderDate") AS first_order_date,
        MAX(o."orderDate") AS last_order_date
      FROM orders o
      WHERE o."organizationId" = $1
        AND o.status NOT IN ('CANCELLED', 'RETURNED')
        AND o."customerId" IS NOT NULL
        ${MELI_EXCLUDE}
      GROUP BY o."customerId"
    ),
    first_order_info AS (
      SELECT DISTINCT ON (o."customerId")
        o."customerId" AS customer_id,
        o."trafficSource" AS traffic_source,
        pa.touchpoints::text AS touchpoints
      FROM orders o
      JOIN customer_orders co ON co.customer_id = o."customerId"
      LEFT JOIN pixel_attributions pa ON pa."orderId" = o.id AND pa.model = 'LAST_CLICK'
      WHERE o."organizationId" = $1
        AND o.status NOT IN ('CANCELLED', 'RETURNED')
      ORDER BY o."customerId", o."orderDate" ASC
    ),
    with_repurchase AS (
      SELECT
        co.customer_id,
        co.order_count,
        co.total_spent,
        co.avg_ticket,
        co.first_order_value,
        co.first_order_date,
        co.last_order_date,
        CASE WHEN co.order_count >= 2
          THEN EXTRACT(DAY FROM co.last_order_date - co.first_order_date)::float / NULLIF(co.order_count - 1, 0)
          ELSE NULL
        END AS avg_days_between,
        foi.touchpoints,
        foi.traffic_source
      FROM customer_orders co
      LEFT JOIN first_order_info foi ON foi.customer_id = co.customer_id
    )
    SELECT
      customer_id,
      order_count::text,
      total_spent::text,
      avg_ticket::text,
      first_order_value::text,
      first_order_date::text,
      last_order_date::text,
      COALESCE(avg_days_between, 0)::text AS avg_days_between,
      touchpoints,
      traffic_source
    FROM with_repurchase
    `,
    orgId
  );

  // Group by segment (channel × bucket)
  const segmentMap = new Map<
    string,
    {
      channel: string;
      bucket: string;
      customers: Array<{
        orderCount: number;
        totalSpent: number;
        avgTicket: number;
        firstOrderValue: number;
        avgDaysBetween: number;
      }>;
    }
  >();

  for (const row of rawData) {
    const channel = resolveChannel(row.touchpoints, row.traffic_source);
    const avgTicket = Number(row.avg_ticket);
    const bucket = classifyTicket(avgTicket);
    const key = `${channel}::${bucket}`;

    if (!segmentMap.has(key)) {
      segmentMap.set(key, { channel, bucket, customers: [] });
    }
    segmentMap.get(key)!.customers.push({
      orderCount: Number(row.order_count),
      totalSpent: Number(row.total_spent),
      avgTicket,
      firstOrderValue: Number(row.first_order_value),
      avgDaysBetween: Number(row.avg_days_between),
    });
  }

  // Calculate stats per segment
  const segments: SegmentStats[] = [];
  for (const [, seg] of segmentMap) {
    const total = seg.customers.length;
    const repeaters = seg.customers.filter((c) => c.orderCount >= 2);
    const repeatRate = total > 0 ? repeaters.length / total : 0;

    // Average ticket of first order
    const avgTicketFirst =
      total > 0
        ? seg.customers.reduce((sum, c) => sum + c.firstOrderValue, 0) / total
        : 0;

    // Average ticket of repurchase (excluding first order value)
    const avgTicketRepurchase =
      repeaters.length > 0
        ? repeaters.reduce((sum, c) => {
            const repurchaseTotal = c.totalSpent - c.firstOrderValue;
            const repurchaseOrders = c.orderCount - 1;
            return sum + (repurchaseOrders > 0 ? repurchaseTotal / repurchaseOrders : 0);
          }, 0) / repeaters.length
        : 0;

    const avgOrdersPerCustomer =
      total > 0
        ? seg.customers.reduce((sum, c) => sum + c.orderCount, 0) / total
        : 0;

    const avgDaysBetween =
      repeaters.length > 0
        ? repeaters.reduce((sum, c) => sum + c.avgDaysBetween, 0) /
          repeaters.length
        : 0;

    const avgTotalSpent =
      total > 0
        ? seg.customers.reduce((sum, c) => sum + c.totalSpent, 0) / total
        : 0;

    segments.push({
      channel: seg.channel,
      bucket: seg.bucket,
      totalCustomers: total,
      repeatCustomers: repeaters.length,
      repeatRate,
      avgTicketFirst,
      avgTicketRepurchase,
      avgOrdersPerCustomer,
      avgDaysBetweenOrders: avgDaysBetween,
      avgTotalSpent,
    });
  }

  return segments;
}

// ══════════════════════════════════════════════════════════════
// 2. PREDECIR LTV PARA UN CLIENTE INDIVIDUAL
// ══════════════════════════════════════════════════════════════

export function predictCustomerLtv(
  customer: {
    customerId: string;
    orderCount: number;
    totalSpent: number;
    avgTicket: number;
    firstOrderValue: number;
    daysSinceFirst: number;
    daysSinceLastOrder: number;
    channel: string;
    bucket: string;
  },
  segments: SegmentStats[]
): CustomerPrediction | null {
  // Find matching segment
  const segment = segments.find(
    (s) => s.channel === customer.channel && s.bucket === customer.bucket
  );

  // Fallback: try same bucket, any channel (for segments with few customers)
  const fallbackSegment =
    segment ||
    segments.find((s) => s.bucket === customer.bucket) ||
    null;

  const usedSegment = segment || fallbackSegment;

  if (!usedSegment || usedSegment.totalCustomers < MIN_SEGMENT_SAMPLE) {
    // Not enough data to predict — skip this customer
    return null;
  }

  let predictedLtv90d: number;
  let predictedLtv365d: number;
  let confidence: number;
  let method: "cohort_lookup" | "personal_history";

  if (customer.orderCount === 1) {
    // ─── NEW CUSTOMER: Use cohort lookup ───
    // "How much did similar customers spend in their first 90/365 days?"
    method = "cohort_lookup";

    // Expected additional orders in 90 days
    const avgFrequencyPerDay =
      usedSegment.avgDaysBetweenOrders > 0
        ? 1 / usedSegment.avgDaysBetweenOrders
        : 0;
    const expectedOrders90d = usedSegment.repeatRate * avgFrequencyPerDay * 90;
    const expectedOrders365d = usedSegment.repeatRate * avgFrequencyPerDay * 365;

    predictedLtv90d =
      customer.firstOrderValue +
      expectedOrders90d * usedSegment.avgTicketRepurchase;

    predictedLtv365d =
      customer.firstOrderValue +
      expectedOrders365d * usedSegment.avgTicketRepurchase;

    // Confidence: based on segment sample size
    // 5 customers = 0.2 confidence, 50+ = 0.8 max for single-order customers
    confidence = Math.min(
      0.8,
      Math.max(0.2, usedSegment.totalCustomers / 60)
    );
  } else {
    // ─── RETURNING CUSTOMER: Use personal history + segment data ───
    // Blend personal purchase cadence with segment behavior
    method = "personal_history";

    const personalFrequencyPerDay =
      customer.daysSinceFirst > 0
        ? (customer.orderCount - 1) / customer.daysSinceFirst
        : 0;

    // Blend personal frequency with segment frequency (70/30 personal bias)
    const segmentFrequencyPerDay =
      usedSegment.avgDaysBetweenOrders > 0
        ? 1 / usedSegment.avgDaysBetweenOrders
        : 0;
    const blendedFrequency =
      personalFrequencyPerDay * 0.7 + segmentFrequencyPerDay * 0.3;

    // Probability of next purchase: based on recency
    // If customer bought recently, probability is higher
    const avgGap =
      customer.daysSinceFirst > 0
        ? customer.daysSinceFirst / (customer.orderCount - 1)
        : 0;
    const recencyFactor =
      avgGap > 0 ? Math.max(0, 1 - customer.daysSinceLastOrder / (avgGap * 3)) : 0.5;

    // Expected future orders
    const remainingDays90 = Math.max(0, 90 - customer.daysSinceFirst);
    const remainingDays365 = Math.max(0, 365 - customer.daysSinceFirst);

    const futureOrders90d = blendedFrequency * remainingDays90 * recencyFactor;
    const futureOrders365d = blendedFrequency * remainingDays365 * recencyFactor;

    predictedLtv90d =
      customer.totalSpent + futureOrders90d * customer.avgTicket;
    predictedLtv365d =
      customer.totalSpent + futureOrders365d * customer.avgTicket;

    // Confidence: higher for repeat customers (more data)
    // 2 orders = 0.4, 5+ orders = 0.9 max
    confidence = Math.min(
      0.95,
      Math.max(0.4, 0.3 + customer.orderCount * 0.12)
    );
  }

  // Floor at actual spend (prediction should never be LESS than reality)
  predictedLtv90d = Math.max(predictedLtv90d, customer.totalSpent);
  predictedLtv365d = Math.max(predictedLtv365d, customer.totalSpent);

  // Determine segment bucket based on predicted 365d LTV
  const segmentBucket = classifyTicket(predictedLtv365d);

  return {
    customerId: customer.customerId,
    acquisitionChannel: customer.channel,
    segmentBucket,
    predictedLtv90d: Math.round(predictedLtv90d * 100) / 100,
    predictedLtv365d: Math.round(predictedLtv365d * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    inputFeatures: {
      orderCount: customer.orderCount,
      totalSpent: customer.totalSpent,
      avgTicket: customer.avgTicket,
      daysSinceFirst: customer.daysSinceFirst,
      daysSinceLastOrder: customer.daysSinceLastOrder,
      segmentRepeatRate: usedSegment.repeatRate,
      segmentAvgLtv: usedSegment.avgTotalSpent,
      segmentSampleSize: usedSegment.totalCustomers,
      method,
    },
  };
}

// ══════════════════════════════════════════════════════════════
// 3. BATCH PREDICTION — Recalcular para TODOS los clientes
// ══════════════════════════════════════════════════════════════

export async function runBatchPrediction(
  orgId: string
): Promise<BatchPredictionResult> {
  // Step 1: Calculate segment stats (how each segment behaves historically)
  const segments = await calculateSegmentStats(orgId);

  // Step 2: Get all customers with their current data
  const customers = await prisma.$queryRawUnsafe<
    Array<{
      customer_id: string;
      order_count: string;
      total_spent: string;
      avg_ticket: string;
      first_order_value: string;
      days_since_first: string;
      days_since_last: string;
      touchpoints: string | null;
      traffic_source: string | null;
    }>
  >(
    `
    WITH customer_stats AS (
      SELECT
        o."customerId" AS customer_id,
        COUNT(*)::int AS order_count,
        SUM(o."totalValue") AS total_spent,
        AVG(o."totalValue") AS avg_ticket,
        MIN(o."totalValue") AS first_order_value,
        EXTRACT(DAY FROM NOW() - MIN(o."orderDate"))::int AS days_since_first,
        EXTRACT(DAY FROM NOW() - MAX(o."orderDate"))::int AS days_since_last
      FROM orders o
      WHERE o."organizationId" = $1
        AND o.status NOT IN ('CANCELLED', 'RETURNED')
        AND o."customerId" IS NOT NULL
        ${MELI_EXCLUDE}
      GROUP BY o."customerId"
    ),
    first_order AS (
      SELECT DISTINCT ON (o."customerId")
        o."customerId" AS customer_id,
        o."trafficSource" AS traffic_source,
        pa.touchpoints::text AS touchpoints
      FROM orders o
      LEFT JOIN pixel_attributions pa ON pa."orderId" = o.id AND pa.model = 'LAST_CLICK'
      WHERE o."organizationId" = $1
        AND o.status NOT IN ('CANCELLED', 'RETURNED')
        AND o."customerId" IS NOT NULL
      ORDER BY o."customerId", o."orderDate" ASC
    )
    SELECT
      cs.customer_id,
      cs.order_count::text,
      cs.total_spent::text,
      cs.avg_ticket::text,
      cs.first_order_value::text,
      cs.days_since_first::text,
      cs.days_since_last::text,
      fo.touchpoints,
      fo.traffic_source
    FROM customer_stats cs
    LEFT JOIN first_order fo ON fo.customer_id = cs.customer_id
    `,
    orgId
  );

  // Step 3: Run prediction for each customer
  const predictions: CustomerPrediction[] = [];
  let skipped = 0;

  for (const c of customers) {
    const channel = resolveChannel(c.touchpoints, c.traffic_source);
    const avgTicket = Number(c.avg_ticket);
    const bucket = classifyTicket(avgTicket);

    const prediction = predictCustomerLtv(
      {
        customerId: c.customer_id,
        orderCount: Number(c.order_count),
        totalSpent: Number(c.total_spent),
        avgTicket,
        firstOrderValue: Number(c.first_order_value),
        daysSinceFirst: Number(c.days_since_first),
        daysSinceLastOrder: Number(c.days_since_last),
        channel,
        bucket,
      },
      segments
    );

    if (prediction) {
      predictions.push(prediction);
    } else {
      skipped++;
    }
  }

  // Step 4: Upsert predictions into database
  // Use a transaction for atomicity
  if (predictions.length > 0) {
    await prisma.$transaction(
      predictions.map((p) =>
        prisma.customerLtvPrediction.upsert({
          where: {
            customerId_organizationId: {
              customerId: p.customerId,
              organizationId: orgId,
            },
          },
          update: {
            predictedLtv90d: p.predictedLtv90d,
            predictedLtv365d: p.predictedLtv365d,
            confidence: p.confidence,
            acquisitionChannel: p.acquisitionChannel,
            segmentBucket: p.segmentBucket,
            inputFeatures: p.inputFeatures as any,
            // Reset send flags so updated predictions can be re-sent
            sentToMeta: false,
            sentToMetaAt: null,
            sentToGoogle: false,
            sentToGoogleAt: null,
          },
          create: {
            customerId: p.customerId,
            organizationId: orgId,
            predictedLtv90d: p.predictedLtv90d,
            predictedLtv365d: p.predictedLtv365d,
            confidence: p.confidence,
            acquisitionChannel: p.acquisitionChannel,
            segmentBucket: p.segmentBucket,
            inputFeatures: p.inputFeatures as any,
          },
        })
      )
    );
  }

  // Step 5: Calculate distribution summary
  const highValue = predictions.filter(
    (p) => p.segmentBucket === "high_value"
  ).length;
  const mediumValue = predictions.filter(
    (p) => p.segmentBucket === "medium_value"
  ).length;
  const lowValue = predictions.filter(
    (p) => p.segmentBucket === "low_value"
  ).length;

  const avgPredictedLtv90d =
    predictions.length > 0
      ? Math.round(
          predictions.reduce((sum, p) => sum + p.predictedLtv90d, 0) /
            predictions.length
        )
      : 0;

  const avgPredictedLtv365d =
    predictions.length > 0
      ? Math.round(
          predictions.reduce((sum, p) => sum + p.predictedLtv365d, 0) /
            predictions.length
        )
      : 0;

  return {
    totalCustomers: customers.length,
    predicted: predictions.length,
    skipped,
    avgPredictedLtv90d,
    avgPredictedLtv365d,
    distribution: { highValue, mediumValue, lowValue },
  };
}
