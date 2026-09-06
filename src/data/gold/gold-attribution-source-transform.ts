// ══════════════════════════════════════════════════════════════════════════
// Transform Bronze(pixel_attributions) → Gold: gold_attribution_source
// ══════════════════════════════════════════════════════════════════════════
// Rollup de revenue de atribución por (org, día, source). Reemplaza las 5 queries
// de /api/metrics/pixel que desanidan pa.touchpoints (JSONB) en cada request.
//
// UNA FILA POR ORDEN: pixel_attributions tiene una fila por (orderId, model).
// touchpoints y attributedValue son IDÉNTICOS entre modelos (verificado
// 25120/25121, Neon 2026-07-17) → DISTINCT ON (orderId) toma una fila canónica
// por orden y de ahí se derivan los componentes de TODOS los modelos. Sin esto,
// cada orden se contaría 1 vez por modelo (×4).
//
// COMPONENTES SIN PONDERAR: los pesos NITRO son configurables (org.settings) →
// se guardan las piezas y el serve reconstruye al leer (attribution-weights.ts).
// La descomposición replica EXACTAMENTE las 4 variantes del endpoint:
//   LAST_CLICK  = Σ v where tp_ord = n
//   FIRST_CLICK = Σ v where tp_ord = 1
//   LINEAR      = Σ v / n  (por cada touchpoint del source)
//   NITRO       = single(n=1) + first2/last2(n=2) + firstN/lastN/middleN(n>=3)
//
// Anti-drift: el filtro de orden válida-web sale del CONTRATO (ordersValidWebSql)
// y la clasificación de source del helper compartido (touchpointSourceCase), el
// mismo que usa el serve → cero divergencia de buckets Gold-vs-Bronze.
//
// Bucketea por día AR de la ORDEN (orderDate), igual que el endpoint.
//
// LIMITACIÓN (igual que los otros Gold): cambios retroactivos de status/orden
// fuera de la ventana incremental requieren backfill. El endpoint en vivo lo
// reflejaría; acá se corrige en el próximo backfill.
// ══════════════════════════════════════════════════════════════════════════

import { ordersValidWebSql } from "@/domains/orders";
import { touchpointSourceCase } from "@/lib/pixel/touchpoint-source-sql";

const AR_TZ = "America/Argentina/Buenos_Aires";

function buildRollup(whereRows: string): string {
  const src = touchpointSourceCase("tp");
  return `
WITH canon AS (
  -- Una fila canónica por orden (componentes model-independientes).
  SELECT DISTINCT ON (pa."orderId")
    o."organizationId" AS organization_id,
    (o."orderDate" AT TIME ZONE '${AR_TZ}')::date AS day,
    pa."orderId" AS order_id,
    pa."attributedValue" AS v,
    pa."touchpointCount" AS n,
    pa.touchpoints AS touchpoints
  FROM pixel_attributions pa
  JOIN orders o ON o.id = pa."orderId"
  WHERE pa."organizationId" IS NOT NULL${whereRows}
    AND ${ordersValidWebSql("o")}
    AND o."totalValue" > 0
    AND pa.touchpoints IS NOT NULL
  ORDER BY pa."orderId", pa.model
),
exploded AS (
  SELECT
    c.organization_id,
    c.day,
    ${src} AS source,
    c.order_id,
    c.v,
    c.n,
    tp_ord
  FROM canon c
  , jsonb_array_elements(c.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
)
INSERT INTO gold_attribution_source (
  organization_id, day, source, orders,
  last_click_revenue, first_click_revenue, linear_revenue,
  nitro_single, nitro_first2, nitro_last2, nitro_first_n, nitro_last_n, nitro_middle_n,
  first_touch_count, assist_touch_count, last_touch_count, solo_touch_count, gold_updated_at
)
SELECT
  organization_id,
  day,
  source,
  COUNT(DISTINCT order_id)::int AS orders,
  COALESCE(SUM(CASE WHEN tp_ord = n THEN v ELSE 0 END), 0) AS last_click_revenue,
  COALESCE(SUM(CASE WHEN tp_ord = 1 THEN v ELSE 0 END), 0) AS first_click_revenue,
  COALESCE(SUM(v / GREATEST(n, 1)), 0) AS linear_revenue,
  COALESCE(SUM(CASE WHEN n = 1 THEN v ELSE 0 END), 0) AS nitro_single,
  COALESCE(SUM(CASE WHEN n = 2 AND tp_ord = 1 THEN v ELSE 0 END), 0) AS nitro_first2,
  COALESCE(SUM(CASE WHEN n = 2 AND tp_ord = 2 THEN v ELSE 0 END), 0) AS nitro_last2,
  COALESCE(SUM(CASE WHEN n >= 3 AND tp_ord = 1 THEN v ELSE 0 END), 0) AS nitro_first_n,
  COALESCE(SUM(CASE WHEN n >= 3 AND tp_ord = n THEN v ELSE 0 END), 0) AS nitro_last_n,
  COALESCE(SUM(CASE WHEN n >= 3 AND tp_ord > 1 AND tp_ord < n THEN v / (n - 2) ELSE 0 END), 0) AS nitro_middle_n,
  COUNT(*) FILTER (WHERE tp_ord = 1)::int AS first_touch_count,
  COUNT(*) FILTER (WHERE tp_ord > 1 AND tp_ord < n)::int AS assist_touch_count,
  COUNT(*) FILTER (WHERE tp_ord = n AND n > 1)::int AS last_touch_count,
  COUNT(*) FILTER (WHERE n = 1)::int AS solo_touch_count,
  now()
FROM exploded
GROUP BY organization_id, day, source
ON CONFLICT (organization_id, day, source) DO UPDATE SET
  orders = EXCLUDED.orders,
  last_click_revenue = EXCLUDED.last_click_revenue,
  first_click_revenue = EXCLUDED.first_click_revenue,
  linear_revenue = EXCLUDED.linear_revenue,
  nitro_single = EXCLUDED.nitro_single,
  nitro_first2 = EXCLUDED.nitro_first2,
  nitro_last2 = EXCLUDED.nitro_last2,
  nitro_first_n = EXCLUDED.nitro_first_n,
  nitro_last_n = EXCLUDED.nitro_last_n,
  nitro_middle_n = EXCLUDED.nitro_middle_n,
  first_touch_count = EXCLUDED.first_touch_count,
  assist_touch_count = EXCLUDED.assist_touch_count,
  last_touch_count = EXCLUDED.last_touch_count,
  solo_touch_count = EXCLUDED.solo_touch_count,
  gold_updated_at = now();`.trim();
}

/**
 * Inicio del día AR que contiene `$1`, como timestamptz.
 * Ver el comentario de `buildGoldAttributionSourceUpsert`.
 */
const DESDE_INICIO_DEL_DIA_AR = `(date_trunc('day', $1::timestamptz AT TIME ZONE '${AR_TZ}') AT TIME ZONE '${AR_TZ}')`;

/**
 * Incremental: recomputa las órdenes desde el inicio del DÍA AR que contiene $1.
 * `pa."createdAt" >= …` es un lower-bound redundante (createdAt >= orderDate) que
 * habilita el índice (organizationId, createdAt) del scan.
 *
 * ⚠️ POR QUÉ `date_trunc` Y NO `$1` A SECAS (bug encontrado el 2026-09-06):
 *   El cron pasa `since = ahora − 4 días`, o sea un instante CON HORA, pero el
 *   rollup agrupa por `day` en zona AR. Con `orderDate >= $1` a secas el día del
 *   borde se recomputaba PARCIALMENTE y quedaba subvaluado — y volvía imposible
 *   borrar huérfanas sin perder revenue real. Ver el espejo por canal.
 */
export function buildGoldAttributionSourceUpsert(): string {
  return buildRollup(
    `\n    AND o."orderDate" >= ${DESDE_INICIO_DEL_DIA_AR}\n    AND pa."createdAt" >= ${DESDE_INICIO_DEL_DIA_AR}`,
  );
}

/**
 * Borra las filas que el upsert ya NO emite, acotado a la ventana recomputada.
 *
 * ⚠️ SIN ESTO EL REVENUE SÓLO SE CORRIGE HACIA ARRIBA: una venta cancelada que
 * era la única de su bucket (día, source) deja la fila vieja viva con la plata
 * vieja, para siempre.
 *
 * A diferencia del espejo por canal, este rollup NO está scopeado por org
 * (procesa todas juntas), así que el DELETE tampoco lo está.
 *
 * Params: `$1` = since · `$2` = runStartedAt
 *
 * ⚠️ `$2` DEBE salir del reloj de la BASE (`SELECT now()`). Correr DESPUÉS del
 * upsert y EN LA MISMA TRANSACCIÓN. Mismo contrato que `buildDeleteOrphans` de
 * `affected-days.ts`, que usan los otros cuatro rollups Gold.
 */
export function buildGoldAttributionSourceDeleteOrphans(): string {
  return `
DELETE FROM gold_attribution_source g
WHERE g.day >= date_trunc('day', $1::timestamptz AT TIME ZONE '${AR_TZ}')::date
  AND g.gold_updated_at < $2::timestamptz;`.trim();
}

/** Backfill inicial: toda la historia. Correr una vez en Neon. */
export function buildGoldAttributionSourceBackfill(): string {
  return buildRollup("");
}
