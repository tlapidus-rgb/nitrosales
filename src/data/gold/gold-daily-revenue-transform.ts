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
// Tres modos (DRY):
//   - buildGoldDailyRevenueUpsert(): incremental por DÍAS AFECTADOS ($1 = since).
//   - buildGoldDailyRevenueDeleteOrphans(): limpia buckets que dejaron de existir.
//   - buildGoldDailyRevenueBackfill(): toda la historia (fill inicial).
// Idempotente: ON CONFLICT (org, day, source) DO UPDATE.
//
// La "LIMITACIÓN conocida (retroactive changes)" que estaba acá documentada —una
// orden vieja que se cancela no refrescaba su día— quedó RESUELTA el 2026-07-21:
// el incremental ya no mira "los últimos N días" sino los días que Silver tocó.
// El porqué completo está en ./affected-days.ts.
// ══════════════════════════════════════════════════════════════════════════

import { orderStatusNotConcretedList } from "@/domains/orders";
import {
  AR_TZ,
  affectedDaysPredicate,
  buildDeleteOrphans,
} from "./affected-days";

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
    s.id,
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
),
-- ── Medidas de PROFITABILITY (tanda 2): a nivel item, agregadas al mismo grain ──
-- effective_cost replica el COALESCE de metrics/orders (item → producto → hermano
-- por SKU). Desviación documentada: el hermano se resuelve con MAX(costPrice) por
-- (org, sku) pre-agregado (determinista) en vez del LIMIT 1 sin ORDER BY del
-- Bronze (no determinista). Solo difiere si un mismo SKU tiene 2+ costos > 0.
sku_costs AS (
  SELECT "organizationId" AS organization_id, sku, MAX("costPrice") AS cost
  FROM products
  WHERE sku IS NOT NULL AND sku != '' AND "costPrice" IS NOT NULL AND "costPrice" > 0
  GROUP BY "organizationId", sku
),
item_measures AS (
  SELECT
    v.organization_id,
    v.day,
    v.source,
    COALESCE(SUM(oi."totalPrice"), 0) AS item_gross,
    COALESCE(SUM(oi."totalPrice") FILTER (WHERE ec.effective_cost > 0), 0) AS item_gross_with_cost,
    COALESCE(SUM(oi."totalPrice") FILTER (WHERE ec.effective_cost IS NULL OR ec.effective_cost = 0), 0) AS item_gross_without_cost,
    COALESCE(SUM(oi.quantity * ec.effective_cost) FILTER (WHERE ec.effective_cost > 0), 0) AS item_cogs,
    COUNT(DISTINCT v.pack_key) FILTER (WHERE ec.effective_cost > 0)::int AS orders_with_cost,
    COUNT(DISTINCT v.pack_key)::int AS orders_with_items
  FROM valid_rows v
  JOIN order_items oi ON oi."orderId" = v.id
  LEFT JOIN products p ON p.id = oi."productId"
  LEFT JOIN sku_costs sc ON sc.organization_id = v.organization_id AND sc.sku = p.sku
  CROSS JOIN LATERAL (
    SELECT COALESCE(oi."costPrice", p."costPrice", sc.cost) AS effective_cost
  ) ec
  GROUP BY v.organization_id, v.day, v.source
),
order_measures AS (
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
    COUNT(DISTINCT pack_key) FILTER (WHERE marketplace_fee > 0)::int AS orders_with_fee
  FROM valid_rows
  GROUP BY organization_id, day, source
)
INSERT INTO gold_daily_revenue (
  organization_id, day, source, orders, revenue, items,
  shipping, discounts, marketplace_fee, orders_with_fee,
  item_gross, item_gross_with_cost, item_gross_without_cost, item_cogs,
  orders_with_cost, orders_with_items, gold_updated_at
)
SELECT
  om.organization_id,
  om.day,
  om.source,
  om.orders,
  om.revenue,
  om.items,
  om.shipping,
  om.discounts,
  om.marketplace_fee,
  om.orders_with_fee,
  COALESCE(im.item_gross, 0),
  COALESCE(im.item_gross_with_cost, 0),
  COALESCE(im.item_gross_without_cost, 0),
  COALESCE(im.item_cogs, 0),
  COALESCE(im.orders_with_cost, 0),
  COALESCE(im.orders_with_items, 0),
  now()
FROM order_measures om
LEFT JOIN item_measures im
  ON im.organization_id = om.organization_id AND im.day = om.day AND im.source = om.source
ON CONFLICT (organization_id, day, source) DO UPDATE SET
  orders = EXCLUDED.orders,
  revenue = EXCLUDED.revenue,
  items = EXCLUDED.items,
  shipping = EXCLUDED.shipping,
  discounts = EXCLUDED.discounts,
  marketplace_fee = EXCLUDED.marketplace_fee,
  orders_with_fee = EXCLUDED.orders_with_fee,
  item_gross = EXCLUDED.item_gross,
  item_gross_with_cost = EXCLUDED.item_gross_with_cost,
  item_gross_without_cost = EXCLUDED.item_gross_without_cost,
  item_cogs = EXCLUDED.item_cogs,
  orders_with_cost = EXCLUDED.orders_with_cost,
  orders_with_items = EXCLUDED.orders_with_items,
  gold_updated_at = now();`.trim();
}

/**
 * Incremental: recomputa los días con order_date >= $1 (ISO timestamptz).
 * Ejecutar: prisma.$executeRawUnsafe(buildGoldDailyRevenueUpsert(), sinceISO).
 * (Un solo parámetro $1, usado en bad_packs y valid_rows.)
 */
export function buildGoldDailyRevenueUpsert(): string {
  return buildRollup(affectedDaysPredicate("s"));
}

/**
 * Borra buckets (org, day, source) que dejaron de existir en un día recomputado.
 * Correr DESPUÉS del upsert, en la MISMA transacción. $1 = since, $2 = runStartedAt.
 */
export function buildGoldDailyRevenueDeleteOrphans(): string {
  return buildDeleteOrphans("gold_daily_revenue");
}

/** Backfill inicial: toda la historia. Correr una vez en Neon. */
export function buildGoldDailyRevenueBackfill(): string {
  return buildRollup("");
}
