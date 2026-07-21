// ══════════════════════════════════════════════════════════════════════════
// Transform Silver → Gold: gold_product_sales — tanda 2 de metrics/orders
// ══════════════════════════════════════════════════════════════════════════
// Rollup diario PACK-AWARE de ventas por producto. La validez de la orden sale
// de silver_orders con la MISMA lógica que gold_daily_revenue: un pack
// (COALESCE(pack_id, external_id)) cuenta solo si NINGUNA de sus filas está
// no-concretada. Los items salen de order_items (Bronze — no hay silver de
// items) joineados por silver_orders.id = order_items."orderId".
//
// Anti-drift: la lista de status NO-concretados sale del CONTRATO
// (orderStatusNotConcretedList de @/domains/orders).
//
// Semántica (paridad con topProducts de metrics/orders):
//   - Solo items con producto (JOIN products INNER via "productId" NOT NULL —
//     topProducts hace JOIN products p ON p.id = oi."productId").
//   - orders = COUNT(DISTINCT pack_key) POR producto/día: cuántos packs
//     incluyeron el producto. NO se suma entre productos (un pack aparece en
//     N productos) — Serve solo agrupa por producto, nunca cruza.
//
// Bucketea por día AR, igual que metrics/orders.
//
// Dos modos (DRY):
//   - buildGoldProductSalesUpsert(): incremental ($1 = since).
//   - buildGoldProductSalesBackfill(): toda la historia.
// Idempotente: ON CONFLICT DO UPDATE de TODAS las columnas (lección re-backfill).
//
// LIMITACIÓN conocida (igual que gold_daily_revenue): cambios retroactivos de
// status fuera de la ventana incremental requieren backfill periódico.
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
valid_orders AS (
  SELECT
    s.id,
    s.organization_id,
    (s.order_date AT TIME ZONE '${AR_TZ}')::date AS day,
    s.source,
    COALESCE(s.pack_id, s.external_id) AS pack_key
  FROM silver_orders s
  WHERE s.status NOT IN (${notConcreted})${whereRows}
    AND NOT EXISTS (
      SELECT 1 FROM bad_packs b
      WHERE b.organization_id = s.organization_id
        AND b.pack_key = COALESCE(s.pack_id, s.external_id)
    )
)
INSERT INTO gold_product_sales (
  organization_id, day, source, product_id, units, revenue, orders, gold_updated_at
)
SELECT
  o.organization_id,
  o.day,
  o.source,
  oi."productId" AS product_id,
  COALESCE(SUM(oi.quantity), 0)::int AS units,
  COALESCE(SUM(oi."totalPrice"), 0) AS revenue,
  COUNT(DISTINCT o.pack_key)::int AS orders,
  now()
FROM valid_orders o
JOIN order_items oi ON oi."orderId" = o.id
WHERE oi."productId" IS NOT NULL
GROUP BY o.organization_id, o.day, o.source, oi."productId"
ON CONFLICT (organization_id, day, source, product_id) DO UPDATE SET
  units = EXCLUDED.units,
  revenue = EXCLUDED.revenue,
  orders = EXCLUDED.orders,
  gold_updated_at = now();`.trim();
}

/**
 * Incremental: recomputa los días con order_date >= $1 (ISO timestamptz).
 * Ejecutar: prisma.$executeRawUnsafe(buildGoldProductSalesUpsert(), sinceISO).
 */
export function buildGoldProductSalesUpsert(): string {
  return buildRollup(affectedDaysPredicate("s"));
}

/**
 * Borra buckets (org, day, source, product_id) que dejaron de existir en un día
 * recomputado — el más expuesto de los cuatro: basta que un ítem cambie de
 * productId en un re-sync para que el bucket viejo quede colgado.
 * Correr DESPUÉS del upsert, en la MISMA transacción. $1 = since, $2 = runStartedAt.
 */
export function buildGoldProductSalesDeleteOrphans(): string {
  return buildDeleteOrphans("gold_product_sales");
}

/** Backfill inicial: toda la historia. Correr una vez en Neon. */
export function buildGoldProductSalesBackfill(): string {
  return buildRollup("");
}
