// ══════════════════════════════════════════════════════════════════════════
// Transform Silver → Gold: gold_order_segments — segmentaciones diarias (§6.3)
// ══════════════════════════════════════════════════════════════════════════
// Rollup diario pack-aware por dimensión. Dimensiones: 'channel', 'delivery',
// 'carrier', 'payment', 'device', 'traffic' (todas desde silver_orders; device y
// traffic salen de las columnas ENRIQUECIDAS de Silver, que ya resolvieron el
// COALESCE contra pixel — ver silver-orders-transform.ts, tanda 5c).
// Medidas: orders (DISTINCT pack), revenue, shipping_charged, shipping_real.
// Lista de status desde el CONTRATO → drift-proof.
//
// GRAIN (tanda 4): (org, day, SOURCE, dimension, bucket). El source entró al
// grain porque el chart de payment agrupa payment_method × source (traduce el
// label por plataforma en JS). Las lecturas de channel/delivery/carrier no
// cambian: agregan por bucket y el source colapsa en el SUM.
//
//   - buildGoldSegmentsUpsert(): incremental ($1 = since).
//   - buildGoldSegmentsBackfill(): toda la historia.
// Idempotente: ON CONFLICT (org, day, source, dimension, bucket) DO UPDATE.
// ══════════════════════════════════════════════════════════════════════════

import { orderStatusNotConcretedList } from "@/domains/orders";
import {
  AR_TZ,
  affectedDaysPredicate,
  buildDeleteOrphans,
} from "./affected-days";

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
    s.source,
    COALESCE(s.channel, 'Sin dato') AS channel_bucket,
    COALESCE(s.delivery_type, 'Sin dato') AS delivery_bucket,
    COALESCE(s.shipping_carrier, 'Sin dato') AS carrier_bucket,
    COALESCE(s.payment_method, 'Sin dato') AS payment_bucket,
    COALESCE(s.device_enriched, 'Sin dato') AS device_bucket,
    COALESCE(s.traffic_enriched, 'Sin dato') AS traffic_bucket,
    COALESCE(s.pack_id, s.external_id) AS pack_key,
    s.total_value,
    s.shipping_cost,
    s.real_shipping_cost
  FROM silver_orders s
  WHERE s.status NOT IN (${notConcreted})${whereRows}
    AND NOT EXISTS (
      SELECT 1 FROM bad_packs b
      WHERE b.organization_id = s.organization_id
        AND b.pack_key = COALESCE(s.pack_id, s.external_id)
    )
),
seg AS (
  SELECT organization_id, day, source, 'channel'  AS dimension, channel_bucket  AS bucket, pack_key, total_value, shipping_cost, real_shipping_cost FROM valid_rows
  UNION ALL
  SELECT organization_id, day, source, 'delivery' AS dimension, delivery_bucket AS bucket, pack_key, total_value, shipping_cost, real_shipping_cost FROM valid_rows
  UNION ALL
  SELECT organization_id, day, source, 'carrier'  AS dimension, carrier_bucket  AS bucket, pack_key, total_value, shipping_cost, real_shipping_cost FROM valid_rows
  UNION ALL
  SELECT organization_id, day, source, 'payment'  AS dimension, payment_bucket  AS bucket, pack_key, total_value, shipping_cost, real_shipping_cost FROM valid_rows
  UNION ALL
  SELECT organization_id, day, source, 'device'   AS dimension, device_bucket   AS bucket, pack_key, total_value, shipping_cost, real_shipping_cost FROM valid_rows
  UNION ALL
  SELECT organization_id, day, source, 'traffic'  AS dimension, traffic_bucket  AS bucket, pack_key, total_value, shipping_cost, real_shipping_cost FROM valid_rows
)
INSERT INTO gold_order_segments (organization_id, day, source, dimension, bucket, orders, revenue, shipping_charged, shipping_real, gold_updated_at)
SELECT
  organization_id,
  day,
  source,
  dimension,
  bucket,
  COUNT(DISTINCT pack_key)::int AS orders,
  COALESCE(SUM(total_value), 0) AS revenue,
  COALESCE(SUM(shipping_cost), 0) AS shipping_charged,
  COALESCE(SUM(real_shipping_cost), 0) AS shipping_real,
  now()
FROM seg
GROUP BY organization_id, day, source, dimension, bucket
ON CONFLICT (organization_id, day, source, dimension, bucket) DO UPDATE SET
  orders = EXCLUDED.orders,
  revenue = EXCLUDED.revenue,
  shipping_charged = EXCLUDED.shipping_charged,
  shipping_real = EXCLUDED.shipping_real,
  gold_updated_at = now();`.trim();
}

/** Incremental: recomputa los días con order_date >= $1 (ISO timestamptz). */
export function buildGoldSegmentsUpsert(): string {
  return buildSegments(affectedDaysPredicate("s"));
}

/**
 * Borra filas HUÉRFANAS del rango recomputado (bug detectado 2026-07-17 por el
 * invariante de revenue entre dimensiones: `payment` daba +3.3M en una org).
 *
 * El upsert solo INSERTA/ACTUALIZA los buckets que existen AHORA. Si una orden
 * cambia de bucket (ej. payment_method pasa de NULL a un valor real cuando el
 * cron de Silver la refresca) y el bucket viejo queda VACÍO, su fila sobrevive
 * con el conteo viejo → la dimensión suma de más.
 *
 * Fix: el upsert pone gold_updated_at = now() en toda fila que toca; cualquier
 * fila del rango que quedó con un gold_updated_at ANTERIOR al inicio de la
 * corrida es huérfana. Ejecutar DESPUÉS del upsert, en la misma transacción.
 * Params: $1 = since (ISO timestamptz, mismo del upsert), $2 = runStartedAt.
 *
 * 2026-07-21: el alcance pasó de `day >= since` a los DÍAS AFECTADOS, para
 * acompañar el cambio del upsert. Con la base vieja, un día viejo recomputado
 * por una cancelación retroactiva quedaba FUERA del DELETE y su bucket huérfano
 * sobrevivía — justo el caso que el fix de la ventana vino a arreglar.
 */
export function buildGoldSegmentsDeleteOrphans(): string {
  return buildDeleteOrphans("gold_order_segments");
}

/** Backfill inicial: toda la historia. */
export function buildGoldSegmentsBackfill(): string {
  return buildSegments("");
}
