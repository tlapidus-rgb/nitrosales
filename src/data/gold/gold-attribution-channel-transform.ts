// ══════════════════════════════════════════════════════════════════════════
// Transform Bronze(pixel_attributions) → Gold: gold_attribution_channel
// ══════════════════════════════════════════════════════════════════════════
// Espejo EXACTO de gold-attribution-source-transform pero:
//   • grano (org, día, CANAL) en vez de (org, día, source);
//   • el bucket es el CANAL resuelto por channel_rule sobre el touchpoint
//     (buildTouchpointChannelCase, las MISMAS reglas que el panel y que el serve);
//   • es PER-ORG (la resolución de canal depende de las reglas de la org), así que
//     recibe el `channelCaseSql` ya construido con las reglas de esa org y scopea
//     la query a `pa."organizationId" = $1`.
//
// El total de revenue es IDÉNTICO al de gold_attribution_source (misma plata, sólo
// re-agrupada source→canal): garantizado por el test de paridad. attribution.ts
// (CORE) INTACTO — esto es capa de LECTURA materializada.
// ══════════════════════════════════════════════════════════════════════════

import { ordersValidWebSql } from "@/domains/orders";

const AR_TZ = "America/Argentina/Buenos_Aires";

/**
 * @param channelCaseSql  CASE de canal sobre el touchpoint `tp`
 *   (buildTouchpointChannelCase(rules, "tp")). Son literales escapados de
 *   channel_rule → seguro de interpolar.
 * @param whereRows  filtro extra (incremental por fecha), ya con sus placeholders.
 *   El org va SIEMPRE como $1.
 */
function buildRollup(channelCaseSql: string, whereRows: string): string {
  return `
WITH canon AS (
  SELECT DISTINCT ON (pa."orderId")
    o."organizationId" AS organization_id,
    (o."orderDate" AT TIME ZONE '${AR_TZ}')::date AS day,
    pa."orderId" AS order_id,
    pa."attributedValue" AS v,
    pa."touchpointCount" AS n,
    pa.touchpoints AS touchpoints
  FROM pixel_attributions pa
  JOIN orders o ON o.id = pa."orderId"
  WHERE pa."organizationId" = $1${whereRows}
    AND ${ordersValidWebSql("o")}
    AND o."totalValue" > 0
    AND pa.touchpoints IS NOT NULL
  ORDER BY pa."orderId", pa.model
),
exploded AS (
  SELECT
    c.organization_id,
    c.day,
    ${channelCaseSql} AS channel,
    c.order_id,
    c.v,
    c.n,
    tp_ord
  FROM canon c
  , jsonb_array_elements(c.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
)
INSERT INTO gold_attribution_channel (
  organization_id, day, channel, orders,
  last_click_revenue, first_click_revenue, linear_revenue,
  nitro_single, nitro_first2, nitro_last2, nitro_first_n, nitro_last_n, nitro_middle_n,
  first_touch_count, assist_touch_count, last_touch_count, solo_touch_count, gold_updated_at
)
SELECT
  organization_id,
  day,
  channel,
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
GROUP BY organization_id, day, channel
ON CONFLICT (organization_id, day, channel) DO UPDATE SET
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
 * Incremental: recomputa las órdenes de la org ($1) con orderDate >= $2.
 * `channelCaseSql` = buildTouchpointChannelCase(rules_de_la_org, "tp").
 */
export function buildGoldAttributionChannelUpsert(channelCaseSql: string): string {
  return buildRollup(
    channelCaseSql,
    `\n    AND o."orderDate" >= $2::timestamptz\n    AND pa."createdAt" >= $2::timestamptz`,
  );
}

/** Backfill inicial de una org ($1): toda la historia. Correr una vez en Neon. */
export function buildGoldAttributionChannelBackfill(channelCaseSql: string): string {
  return buildRollup(channelCaseSql, "");
}
