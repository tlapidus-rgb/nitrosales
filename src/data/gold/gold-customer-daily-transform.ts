// ══════════════════════════════════════════════════════════════════════════
// Transform Silver → Gold: gold_customer_daily — top customers de metrics/orders
// ══════════════════════════════════════════════════════════════════════════
// Rollup diario PACK-AWARE de órdenes/revenue por cliente. Misma lógica de
// "orden válida" que gold_daily_revenue (un pack cuenta solo si NINGUNA de sus
// filas está no-concretada), pero grano por customer_id.
//
// Semántica (paridad con topCustomers): TODAS las fuentes (NO filtra web/
// marketplace — topCustomers tampoco), solo packs válidos, customer_id NOT NULL.
//
// Anti-drift: lista de status desde el CONTRATO (orderStatusNotConcretedList).
// Bucketea por día AR de la orden.
//
//   - buildGoldCustomerDailyUpsert(): incremental ($1 = since).
//   - buildGoldCustomerDailyBackfill(): toda la historia.
// Idempotente: ON CONFLICT DO UPDATE de TODAS las columnas.
// ══════════════════════════════════════════════════════════════════════════

import { orderStatusNotConcretedList } from "@/domains/orders";

const AR_TZ = "America/Argentina/Buenos_Aires";

function buildRollup(whereRows: string): string {
  const notConcreted = orderStatusNotConcretedList();
  return `
WITH bad_packs AS (
  SELECT DISTINCT s.organization_id, COALESCE(s.pack_id, s.external_id) AS pack_key
  FROM silver_orders s
  WHERE s.status IN (${notConcreted})${whereRows}
),
valid_orders AS (
  SELECT
    s.organization_id,
    (s.order_date AT TIME ZONE '${AR_TZ}')::date AS day,
    s.customer_id,
    COALESCE(s.pack_id, s.external_id) AS pack_key,
    s.total_value
  FROM silver_orders s
  WHERE s.status NOT IN (${notConcreted})${whereRows}
    AND s.customer_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM bad_packs b
      WHERE b.organization_id = s.organization_id
        AND b.pack_key = COALESCE(s.pack_id, s.external_id)
    )
)
INSERT INTO gold_customer_daily (
  organization_id, day, customer_id, orders, revenue, gold_updated_at
)
SELECT
  organization_id,
  day,
  customer_id,
  COUNT(DISTINCT pack_key)::int AS orders,
  COALESCE(SUM(total_value), 0) AS revenue,
  now()
FROM valid_orders
GROUP BY organization_id, day, customer_id
ON CONFLICT (organization_id, day, customer_id) DO UPDATE SET
  orders = EXCLUDED.orders,
  revenue = EXCLUDED.revenue,
  gold_updated_at = now();`.trim();
}

/** Incremental: recomputa los días con order_date >= $1 (ISO timestamptz). */
export function buildGoldCustomerDailyUpsert(): string {
  return buildRollup(`\n    AND s.order_date >= $1::timestamptz`);
}

/** Backfill inicial: toda la historia. Correr una vez en Neon. */
export function buildGoldCustomerDailyBackfill(): string {
  return buildRollup("");
}
