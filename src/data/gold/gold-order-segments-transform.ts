// ══════════════════════════════════════════════════════════════════════════
// Transform Silver → Gold: gold_order_segments — segmentaciones diarias (§6.3)
// ══════════════════════════════════════════════════════════════════════════
// Rollup diario pack-aware por dimensión. Arranca con dimension='channel'
// (silver_orders.channel, sin enriquecer). Misma lógica de "orden válida" +
// exclusión de packs que el resto (lista de status desde el CONTRATO → drift-proof).
//
//   - buildGoldSegmentsUpsert(): incremental ($1 = since).
//   - buildGoldSegmentsBackfill(): toda la historia.
// Idempotente: ON CONFLICT (org, day, dimension, bucket) DO UPDATE.
// ══════════════════════════════════════════════════════════════════════════

import { orderStatusNotConcretedList } from "@/domains/orders";

const AR_TZ = "America/Argentina/Buenos_Aires";

function buildSegments(whereRows: string): string {
  const notConcreted = orderStatusNotConcretedList();
  return `
WITH bad_packs AS (
  SELECT DISTINCT s.organization_id, COALESCE(s.pack_id, s.external_id) AS pack_key
  FROM silver_orders s
  WHERE s.status IN (${notConcreted})${whereRows}
),
valid_rows AS (
  SELECT
    s.organization_id,
    (s.order_date AT TIME ZONE '${AR_TZ}')::date AS day,
    COALESCE(s.channel, 'Sin dato') AS bucket,
    COALESCE(s.pack_id, s.external_id) AS pack_key,
    s.total_value
  FROM silver_orders s
  WHERE s.status NOT IN (${notConcreted})${whereRows}
    AND NOT EXISTS (
      SELECT 1 FROM bad_packs b
      WHERE b.organization_id = s.organization_id
        AND b.pack_key = COALESCE(s.pack_id, s.external_id)
    )
)
INSERT INTO gold_order_segments (organization_id, day, dimension, bucket, orders, revenue, gold_updated_at)
SELECT
  organization_id,
  day,
  'channel' AS dimension,
  bucket,
  COUNT(DISTINCT pack_key)::int AS orders,
  COALESCE(SUM(total_value), 0) AS revenue,
  now()
FROM valid_rows
GROUP BY organization_id, day, bucket
ON CONFLICT (organization_id, day, dimension, bucket) DO UPDATE SET
  orders = EXCLUDED.orders,
  revenue = EXCLUDED.revenue,
  gold_updated_at = now();`.trim();
}

/** Incremental: recomputa los días con order_date >= $1 (ISO timestamptz). */
export function buildGoldSegmentsUpsert(): string {
  return buildSegments(`\n    AND s.order_date >= $1::timestamptz`);
}

/** Backfill inicial: toda la historia. */
export function buildGoldSegmentsBackfill(): string {
  return buildSegments("");
}
