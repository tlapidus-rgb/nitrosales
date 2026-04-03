// ══════════════════════════════════════════════════════════════
// Motor de Predicción de LTV — v3 SQL-Native
// ══════════════════════════════════════════════════════════════
// v3: Reescrito siguiendo patrones de producción (Triple Whale,
// Northbeam, Expedia). TODO el cálculo se hace en SQL — no se
// carga data a JS, no hay loops, no hay transacciones masivas.
//
// Arquitectura: Batch Pre-Computation
// 1. SQL calcula RFM features + segment stats
// 2. SQL calcula predicciones directamente
// 3. SQL upsertea resultados con INSERT ... ON CONFLICT
// 4. JS solo orquesta las queries y retorna el resumen
//
// Modelo: Cohort-based frequency prediction
// - Para clientes nuevos (1 compra): usa repeat rate del segmento
// - Para clientes recurrentes: usa frecuencia personal blended
// - Segmentos: canal de adquisición × bucket de ticket
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";

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
const MIN_SEGMENT_SAMPLE = 5;
const DEFAULT_LOW_THRESHOLD = 25000;
const DEFAULT_MED_THRESHOLD = 100000;
const MIN_HISTORY_DAYS = 30;       // Minimum days before using personal_history method
const MAX_FREQ_PER_DAY = 1.0 / 7;  // Cap: max 1 purchase every 7 days
const PREDICTION_CAP_MULTIPLIER = 3; // Max prediction = 3x actual spend

// ══════════════════════════════════════════════════════════════
// BATCH PREDICTION — Todo en SQL
// ══════════════════════════════════════════════════════════════

export async function runBatchPrediction(
  orgId: string,
  lowThreshold: number = DEFAULT_LOW_THRESHOLD,
  medThreshold: number = DEFAULT_MED_THRESHOLD
): Promise<BatchPredictionResult> {
  // ─── Step 1: Compute segment stats + predictions + upsert ALL IN SQL ───
  // This single query does everything:
  // 1. Calculates RFM features per customer
  // 2. Resolves acquisition channel
  // 3. Computes segment-level stats (repeat rate, avg ticket, avg frequency)
  // 4. Generates per-customer LTV predictions
  // 5. Upserts into customer_ltv_predictions
  //
  // Total DB round-trips: 1 (one single query)

  const result = await prisma.$queryRawUnsafe<
    Array<{
      total_customers: string;
      predicted: string;
      skipped: string;
      avg_ltv_90d: string;
      avg_ltv_365d: string;
      high_value: string;
      medium_value: string;
      low_value: string;
    }>
  >(
    `
    WITH
    -- Step 1: Customer RFM features (VTEX only, excludes MELI)
    customer_rfm AS (
      SELECT
        o."customerId" AS customer_id,
        COUNT(*)::int AS order_count,
        SUM(o."totalValue")::float AS total_spent,
        AVG(o."totalValue")::float AS avg_ticket,
        MIN(o."totalValue")::float AS first_order_value,
        EXTRACT(DAY FROM NOW() - MIN(o."orderDate"))::int AS days_since_first,
        EXTRACT(DAY FROM NOW() - MAX(o."orderDate"))::int AS days_since_last,
        CASE WHEN COUNT(*) >= 2
          THEN EXTRACT(DAY FROM MAX(o."orderDate") - MIN(o."orderDate"))::float / NULLIF(COUNT(*) - 1, 0)
          ELSE 0
        END AS avg_days_between
      FROM orders o
      WHERE o."organizationId" = $1
        AND o.status NOT IN ('CANCELLED', 'RETURNED')
        AND o."customerId" IS NOT NULL
        AND o."source" != 'MELI'
      GROUP BY o."customerId"
    ),

    -- Step 2: Acquisition channel from first order
    first_orders AS (
      SELECT DISTINCT ON (o."customerId")
        o."customerId" AS customer_id,
        COALESCE(
          CASE
            WHEN pa.touchpoints::text ILIKE '%google%' AND (pa.touchpoints::text ILIKE '%cpc%' OR pa.touchpoints::text ILIKE '%paid%') THEN 'Google Ads'
            WHEN pa.touchpoints::text ILIKE '%facebook%' OR pa.touchpoints::text ILIKE '%meta%' OR pa.touchpoints::text ILIKE '%instagram%' THEN 'Meta Ads'
            WHEN pa.touchpoints::text ILIKE '%google%' AND pa.touchpoints::text ILIKE '%organic%' THEN 'Google Organic'
            WHEN pa.touchpoints::text ILIKE '%tiktok%' THEN 'TikTok'
            ELSE NULL
          END,
          CASE
            WHEN o."trafficSource" ILIKE '%paid%' OR o."trafficSource" ILIKE '%cpc%' THEN
              CASE WHEN o."trafficSource" ILIKE '%google%' THEN 'Google Ads'
                   WHEN o."trafficSource" ILIKE '%facebook%' OR o."trafficSource" ILIKE '%meta%' THEN 'Meta Ads'
                   ELSE 'Paid Otro' END
            WHEN o."trafficSource" ILIKE '%organic%' THEN 'Google Organic'
            WHEN o."trafficSource" ILIKE '%direct%' THEN 'Directo'
            ELSE 'Sin datos'
          END
        ) AS channel
      FROM orders o
      LEFT JOIN pixel_attributions pa ON pa."orderId" = o.id AND pa.model = 'LAST_CLICK'
      WHERE o."organizationId" = $1
        AND o.status NOT IN ('CANCELLED', 'RETURNED')
        AND o."customerId" IS NOT NULL
      ORDER BY o."customerId", o."orderDate" ASC
    ),

    -- Step 3: Customer features with channel + bucket
    customer_features AS (
      SELECT
        cr.*,
        fo.channel,
        CASE
          WHEN cr.avg_ticket <= ${lowThreshold} THEN 'low_value'
          WHEN cr.avg_ticket <= ${medThreshold} THEN 'medium_value'
          ELSE 'high_value'
        END AS bucket
      FROM customer_rfm cr
      LEFT JOIN first_orders fo ON fo.customer_id = cr.customer_id
    ),

    -- Step 4: Segment stats (channel × bucket)
    segment_stats AS (
      SELECT
        channel,
        bucket,
        COUNT(*) AS total_customers,
        COUNT(*) FILTER (WHERE order_count >= 2) AS repeat_customers,
        COUNT(*) FILTER (WHERE order_count >= 2)::float / NULLIF(COUNT(*), 0) AS repeat_rate,
        AVG(avg_ticket) FILTER (WHERE order_count >= 2) AS avg_ticket_repurchase,
        AVG(avg_days_between) FILTER (WHERE order_count >= 2 AND avg_days_between > 0) AS avg_days_between_orders,
        AVG(total_spent) AS avg_total_spent
      FROM customer_features
      GROUP BY channel, bucket
    ),

    -- Step 4b: Fallback segment stats (bucket only, for small segments)
    bucket_fallback AS (
      SELECT
        bucket,
        COUNT(*) AS total_customers,
        COUNT(*) FILTER (WHERE order_count >= 2)::float / NULLIF(COUNT(*), 0) AS repeat_rate,
        AVG(avg_ticket) FILTER (WHERE order_count >= 2) AS avg_ticket_repurchase,
        AVG(avg_days_between) FILTER (WHERE order_count >= 2 AND avg_days_between > 0) AS avg_days_between_orders,
        AVG(total_spent) AS avg_total_spent
      FROM customer_features
      GROUP BY bucket
    ),

    -- Step 5: Generate predictions
    predictions AS (
      SELECT
        cf.customer_id,
        cf.channel AS acquisition_channel,
        cf.order_count,
        cf.total_spent,
        cf.avg_ticket,
        cf.first_order_value,
        cf.days_since_first,
        cf.days_since_last,

        -- Use exact segment if big enough, else fallback to bucket
        COALESCE(ss.total_customers, 0) AS seg_size,
        COALESCE(
          CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.repeat_rate END,
          bf.repeat_rate, 0
        ) AS seg_repeat_rate,
        COALESCE(
          CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.avg_ticket_repurchase END,
          bf.avg_ticket_repurchase, 0
        ) AS seg_avg_ticket_repurchase,
        COALESCE(
          CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.avg_days_between_orders END,
          bf.avg_days_between_orders, 0
        ) AS seg_avg_days_between,
        COALESCE(
          CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.avg_total_spent END,
          bf.avg_total_spent, 0
        ) AS seg_avg_ltv,
        COALESCE(ss.total_customers, bf.total_customers, 0) AS effective_seg_size,

        -- Predicted LTV calculation
        -- Fix 1: Customers with <${MIN_HISTORY_DAYS} days use cohort_lookup (even if 2+ orders)
        -- Fix 2: Personal frequency capped at ${MAX_FREQ_PER_DAY}/day (1 purchase per 7 days)
        CASE
          -- Cohort-based: 1 order OR insufficient history (<30 days with 2+ orders)
          WHEN cf.order_count = 1 OR cf.days_since_first < ${MIN_HISTORY_DAYS} THEN
            cf.total_spent + (
              COALESCE(
                CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.repeat_rate END,
                bf.repeat_rate, 0
              )
              -- Boost for multi-purchase: 1.5x for 2 orders, 2x for 3+
              * CASE WHEN cf.order_count >= 3 THEN 2.0
                     WHEN cf.order_count = 2 THEN 1.5
                     ELSE 1.0 END
              * CASE WHEN COALESCE(
                  CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.avg_days_between_orders END,
                  bf.avg_days_between_orders, 0
                ) > 0
                THEN 90.0 / COALESCE(
                  CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.avg_days_between_orders END,
                  bf.avg_days_between_orders, 1
                )
                ELSE 0 END
              * COALESCE(
                  CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.avg_ticket_repurchase END,
                  bf.avg_ticket_repurchase, 0
                )
            )
          -- Returning customer with sufficient history: personal + segment blend
          ELSE
            cf.total_spent + (
              -- Blended frequency (70% personal, 30% segment) with frequency cap
              LEAST(
                (
                  CASE WHEN cf.days_since_first > 0
                    THEN (cf.order_count - 1)::float / cf.days_since_first * 0.7
                    ELSE 0 END
                  +
                  CASE WHEN COALESCE(
                      CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.avg_days_between_orders END,
                      bf.avg_days_between_orders, 0
                    ) > 0
                    THEN 0.3 / COALESCE(
                      CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.avg_days_between_orders END,
                      bf.avg_days_between_orders, 1
                    )
                    ELSE 0 END
                ),
                ${MAX_FREQ_PER_DAY}  -- Cap: max ~1 purchase per 7 days
              )
              -- Recency factor
              * CASE WHEN cf.days_since_first > 0 AND cf.order_count > 1
                  THEN GREATEST(0, 1.0 - cf.days_since_last::float / (cf.days_since_first::float / (cf.order_count - 1) * 3))
                  ELSE 0.5 END
              -- Remaining days in window
              * GREATEST(0, 90 - cf.days_since_first)
              * cf.avg_ticket
            )
        END AS predicted_ltv_90d_raw,

        CASE
          WHEN cf.order_count = 1 OR cf.days_since_first < ${MIN_HISTORY_DAYS} THEN
            cf.total_spent + (
              COALESCE(
                CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.repeat_rate END,
                bf.repeat_rate, 0
              )
              * CASE WHEN cf.order_count >= 3 THEN 2.0
                     WHEN cf.order_count = 2 THEN 1.5
                     ELSE 1.0 END
              * CASE WHEN COALESCE(
                  CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.avg_days_between_orders END,
                  bf.avg_days_between_orders, 0
                ) > 0
                THEN 365.0 / COALESCE(
                  CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.avg_days_between_orders END,
                  bf.avg_days_between_orders, 1
                )
                ELSE 0 END
              * COALESCE(
                  CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.avg_ticket_repurchase END,
                  bf.avg_ticket_repurchase, 0
                )
            )
          ELSE
            cf.total_spent + (
              LEAST(
                (
                  CASE WHEN cf.days_since_first > 0
                    THEN (cf.order_count - 1)::float / cf.days_since_first * 0.7
                    ELSE 0 END
                  +
                  CASE WHEN COALESCE(
                      CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.avg_days_between_orders END,
                      bf.avg_days_between_orders, 0
                    ) > 0
                    THEN 0.3 / COALESCE(
                      CASE WHEN ss.total_customers >= ${MIN_SEGMENT_SAMPLE} THEN ss.avg_days_between_orders END,
                      bf.avg_days_between_orders, 1
                    )
                    ELSE 0 END
                ),
                ${MAX_FREQ_PER_DAY}
              )
              * CASE WHEN cf.days_since_first > 0 AND cf.order_count > 1
                  THEN GREATEST(0, 1.0 - cf.days_since_last::float / (cf.days_since_first::float / (cf.order_count - 1) * 3))
                  ELSE 0.5 END
              * GREATEST(0, 365 - cf.days_since_first)
              * cf.avg_ticket
            )
        END AS predicted_ltv_365d_raw,

        -- Confidence score (lower for insufficient history)
        CASE
          WHEN cf.order_count = 1 THEN LEAST(0.8, GREATEST(0.2, COALESCE(ss.total_customers, bf.total_customers, 0)::float / 60))
          WHEN cf.days_since_first < ${MIN_HISTORY_DAYS} THEN LEAST(0.5, GREATEST(0.25, 0.2 + cf.order_count * 0.1))
          ELSE LEAST(0.95, GREATEST(0.4, 0.3 + cf.order_count * 0.12))
        END AS confidence,

        -- Method
        CASE
          WHEN cf.order_count = 1 THEN 'cohort_lookup'
          WHEN cf.days_since_first < ${MIN_HISTORY_DAYS} THEN 'cohort_boosted'
          ELSE 'personal_history'
        END AS method

      FROM customer_features cf
      LEFT JOIN segment_stats ss ON ss.channel = cf.channel AND ss.bucket = cf.bucket
      LEFT JOIN bucket_fallback bf ON bf.bucket = cf.bucket
      WHERE COALESCE(ss.total_customers, bf.total_customers, 0) >= ${MIN_SEGMENT_SAMPLE}
    ),

    -- Step 6: Apply floors, caps, and classify
    -- Fix 3: Cap predictions at ${PREDICTION_CAP_MULTIPLIER}x actual spend
    final_predictions AS (
      SELECT
        customer_id,
        acquisition_channel,
        -- Floor at actual spend, cap at 3x actual spend
        LEAST(
          GREATEST(predicted_ltv_90d_raw, total_spent),
          total_spent * ${PREDICTION_CAP_MULTIPLIER}
        )::numeric(12,2) AS predicted_ltv_90d,
        LEAST(
          GREATEST(predicted_ltv_365d_raw, total_spent),
          total_spent * ${PREDICTION_CAP_MULTIPLIER}
        )::numeric(12,2) AS predicted_ltv_365d,
        ROUND(confidence::numeric, 2) AS confidence,
        -- Segment bucket based on capped predicted 365d LTV
        CASE
          WHEN LEAST(GREATEST(predicted_ltv_365d_raw, total_spent), total_spent * ${PREDICTION_CAP_MULTIPLIER}) <= ${lowThreshold} THEN 'low_value'
          WHEN LEAST(GREATEST(predicted_ltv_365d_raw, total_spent), total_spent * ${PREDICTION_CAP_MULTIPLIER}) <= ${medThreshold} THEN 'medium_value'
          ELSE 'high_value'
        END AS segment_bucket,
        method,
        order_count, total_spent, avg_ticket, days_since_first, days_since_last,
        seg_repeat_rate, seg_avg_ltv, effective_seg_size
      FROM predictions
    ),

    -- Step 7: Upsert into customer_ltv_predictions
    upserted AS (
      INSERT INTO customer_ltv_predictions (
        id, "customerId", "organizationId",
        "predictedLtv90d", "predictedLtv365d", confidence,
        "acquisitionChannel", "segmentBucket", "inputFeatures",
        "sentToMeta", "sentToGoogle",
        "createdAt", "updatedAt"
      )
      SELECT
        gen_random_uuid()::text,
        customer_id,
        $1,
        predicted_ltv_90d,
        predicted_ltv_365d,
        confidence,
        acquisition_channel,
        segment_bucket,
        jsonb_build_object(
          'orderCount', order_count,
          'totalSpent', ROUND(total_spent::numeric, 2),
          'avgTicket', ROUND(avg_ticket::numeric, 2),
          'daysSinceFirst', days_since_first,
          'daysSinceLastOrder', days_since_last,
          'segmentRepeatRate', ROUND(seg_repeat_rate::numeric, 4),
          'segmentAvgLtv', ROUND(seg_avg_ltv::numeric, 2),
          'segmentSampleSize', effective_seg_size,
          'method', method
        ),
        false, false,
        NOW(), NOW()
      FROM final_predictions
      ON CONFLICT ("customerId", "organizationId")
      DO UPDATE SET
        "predictedLtv90d" = EXCLUDED."predictedLtv90d",
        "predictedLtv365d" = EXCLUDED."predictedLtv365d",
        confidence = EXCLUDED.confidence,
        "acquisitionChannel" = EXCLUDED."acquisitionChannel",
        "segmentBucket" = EXCLUDED."segmentBucket",
        "inputFeatures" = EXCLUDED."inputFeatures",
        "sentToMeta" = false,
        "sentToMetaAt" = NULL,
        "sentToGoogle" = false,
        "sentToGoogleAt" = NULL,
        "updatedAt" = NOW()
      RETURNING "segmentBucket", "predictedLtv90d", "predictedLtv365d"
    )

    -- Step 8: Return summary
    SELECT
      (SELECT COUNT(*) FROM customer_rfm)::text AS total_customers,
      COUNT(*)::text AS predicted,
      ((SELECT COUNT(*) FROM customer_rfm) - COUNT(*))::text AS skipped,
      COALESCE(ROUND(AVG("predictedLtv90d")), 0)::text AS avg_ltv_90d,
      COALESCE(ROUND(AVG("predictedLtv365d")), 0)::text AS avg_ltv_365d,
      COUNT(*) FILTER (WHERE "segmentBucket" = 'high_value')::text AS high_value,
      COUNT(*) FILTER (WHERE "segmentBucket" = 'medium_value')::text AS medium_value,
      COUNT(*) FILTER (WHERE "segmentBucket" = 'low_value')::text AS low_value
    FROM upserted
    `,
    orgId
  );

  const r = result[0];

  return {
    totalCustomers: Number(r.total_customers),
    predicted: Number(r.predicted),
    skipped: Number(r.skipped),
    avgPredictedLtv90d: Number(r.avg_ltv_90d),
    avgPredictedLtv365d: Number(r.avg_ltv_365d),
    distribution: {
      highValue: Number(r.high_value),
      mediumValue: Number(r.medium_value),
      lowValue: Number(r.low_value),
    },
  };
}
