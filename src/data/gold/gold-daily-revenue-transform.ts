// ══════════════════════════════════════════════════════════════════════════
// Transform Silver → Gold: gold_daily_revenue — Fase 1 (§6.3, §8)
// ══════════════════════════════════════════════════════════════════════════
// Rollup diario PACK-AWARE de órdenes/revenue/items. Lee silver_orders y aplica
// la MISMA lógica de "orden válida" que metrics/orders: un pack (COALESCE(pack_id,
// external_id)) cuenta solo si NINGUNA de sus filas está no-concretada.
//
// Anti-drift: la lista de status NO-concretados sale del CONTRATO
// (orderStatusNotConcretedList de @/domains/orders). Si el contrato cambia, el
// rollup cambia con él.
//
// Bucketea por día AR (America/Argentina/Buenos_Aires), igual que metrics/orders.
//
// Dos modos (DRY):
//   - buildGoldDailyRevenueUpsert(): incremental, recomputa días recientes ($1 = since).
//   - buildGoldDailyRevenueBackfill(): toda la historia (fill inicial).
// Idempotente: ON CONFLICT (org, day, source) DO UPDATE.
//
// LIMITACIÓN conocida (retroactive changes): si una orden VIEJA cambia de status
// (ej. se cancela un mes después), el incremental —que solo recomputa la ventana
// reciente— no refresca ese día viejo hasta un backfill. metrics/orders (Bronze en
// vivo) sí lo refleja. Mitigar con un rebuild periódico. Ver §12 Fase 5.
// ══════════════════════════════════════════════════════════════════════════

import { orderStatusNotConcretedList } from "@/domains/orders";

const AR_TZ = "America/Argentina/Buenos_Aires";

function buildRollup(whereRows: string): string {
  const notConcreted = orderStatusNotConcretedList();
  return `
WITH bad_packs AS (
  -- packs con AL MENOS una fila no-concretada → el pack entero se excluye
  SELECT DISTINCT s.organization_id, COALESCE(s.pack_id, s.external_id) AS pack_key
  FROM silver_orders s
  WHERE s.status IN (${notConcreted})${whereRows}
),
valid_rows AS (
  SELECT
    s.organization_id,
    (s.order_date AT TIME ZONE '${AR_TZ}')::date AS day,
    s.source,
    COALESCE(s.pack_id, s.external_id) AS pack_key,
    s.total_value,
    s.item_count,
    s.shipping_cost,
    s.discount_value,
    s.marketplace_fee
  FROM silver_orders s
  WHERE s.status NOT IN (${notConcreted})${whereRows}
    AND NOT EXISTS (
      SELECT 1 FROM bad_packs b
      WHERE b.organization_id = s.organization_id
        AND b.pack_key = COALESCE(s.pack_id, s.external_id)
    )
)
INSERT INTO gold_daily_revenue (
  organization_id, day, source, orders, revenue, items,
  shipping, discounts, marketplace_fee, orders_with_fee, gold_updated_at
)
SELECT
  organization_id,
  day,
  source,
  COUNT(DISTINCT pack_key)::int AS orders,
  COALESCE(SUM(total_value), 0) AS revenue,
  COALESCE(SUM(item_count), 0)::int AS items,
  COALESCE(SUM(shipping_cost), 0) AS shipping,
  COALESCE(SUM(discount_value), 0) AS discounts,
  COALESCE(SUM(marketplace_fee), 0) AS marketplace_fee,
  COUNT(DISTINCT pack_key) FILTER (WHERE marketplace_fee > 0)::int AS orders_with_fee,
  now()
FROM valid_rows
GROUP BY organization_id, day, source
ON CONFLICT (organization_id, day, source) DO UPDATE SET
  orders = EXCLUDED.orders,
  revenue = EXCLUDED.revenue,
  items = EXCLUDED.items,
  shipping = EXCLUDED.shipping,
  discounts = EXCLUDED.discounts,
  marketplace_fee = EXCLUDED.marketplace_fee,
  orders_with_fee = EXCLUDED.orders_with_fee,
  gold_updated_at = now();`.trim();
}

/**
 * Incremental: recomputa los días con order_date >= $1 (ISO timestamptz).
 * Ejecutar: prisma.$executeRawUnsafe(buildGoldDailyRevenueUpsert(), sinceISO).
 * (Un solo parámetro $1, usado en bad_packs y valid_rows.)
 */
export function buildGoldDailyRevenueUpsert(): string {
  return buildRollup(`\n    AND s.order_date >= $1::timestamptz`);
}

/** Backfill inicial: toda la historia. Correr una vez en Neon. */
export function buildGoldDailyRevenueBackfill(): string {
  return buildRollup("");
}
