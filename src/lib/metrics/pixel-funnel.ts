// ══════════════════════════════════════════════════════════════════════════
// pixel-funnel.ts — Etapas del funnel (pageView→checkoutStart) con merge en vivo
// del día en curso / días faltantes del rollup.
// ══════════════════════════════════════════════════════════════════════════
// CONTEXTO (2026-06-16): las etapas del funnel salían SOLO de
// `pixel_daily_aggregates` (grano diario, precisión HLL 14,5). El rollup en prod
// queda stale para el/los día(s) reciente(s) (el cron de refresh corre cada 2h y
// el día AR en curso es SIEMPRE parcial). Resultado: al filtrar por "Hoy" las
// etapas daban 0 mientras la compra (órdenes web atribuidas, en vivo) daba >0 →
// "el funnel muestra solo las compras".
//
// FIX: para los días que faltan o están parciales en el rollup (desde el último
// día presente en el rollup hasta `to`), construimos las etapas EN VIVO desde
// `pixel_events` con los MISMOS params HLL (`hll_add_agg(hll_hash_text(visitorId),
// 14, 5)` filtrado por tipo — espejo de setup-pixel-rollups) y las unimos
// (`hll_union`) con el rollup histórico. El union de HLL deduplica visitantes
// entre días, así que un visitante presente tanto en el rollup como en el tramo
// vivo se cuenta una sola vez, y el día parcial del rollup se "completa" con el
// tramo vivo (union = superset). Validado vs COUNT(DISTINCT) real: error <1,4%.
//
// PERFORMANCE: el tramo vivo solo escanea los días recientes (típicamente ≤3),
// acotado por un lower-bound de timestamp para usar el índice (organizationId,
// timestamp). Para ventanas históricas (to < maxRollupDay) el tramo vivo es vacío
// y queda solo el rollup (comportamiento original, rápido).
// ══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import { CHECKOUT_URL_REGEX } from "@/lib/pixel/first-source-sql";

export interface FunnelStages {
  pageView: number;
  viewProduct: number;
  addToCart: number;
  checkoutStart: number;
}

// YYYY-MM-DD en zona AR para un Date dado.
function arDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Devuelve las 4 etapas del funnel (visitantes únicos por etapa, dedup HLL) para
 * el rango [dateFrom, dateTo], mergeando el rollup con un tramo vivo para los días
 * recientes faltantes/parciales. No incluye la etapa de compra (esa sale de
 * órdenes web atribuidas, la calcula el caller).
 */
export async function getFunnelStages(
  orgId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<FunnelStages> {
  const fromDay = arDay(dateFrom);
  const toDay = arDay(dateTo);

  // Último día presente en el rollup (PK chica → instantáneo).
  const mr = await prisma.$queryRawUnsafe<Array<{ d: string | null }>>(
    `SELECT MAX(day)::text AS d FROM pixel_daily_aggregates WHERE "organizationId" = $1`,
    orgId
  );
  const maxRoll = mr[0]?.d || null;

  // Desde qué día AR calculamos en vivo: el último día del rollup (parcial) en
  // adelante. Si el rollup no tiene nada o arranca después del rango, vivo = todo.
  const liveFromDay = !maxRoll || maxRoll < fromDay ? fromDay : maxRoll;

  // Lower-bound de timestamp para el index scan del tramo vivo: medianoche AR del
  // liveFromDay menos 1 día (bracket generoso, igual que el backfill: los eventos
  // de la noche AR caen en UTC del día siguiente). El filtro AR-date exacto recorta.
  const liveTsLo = new Date(`${liveFromDay}T00:00:00.000-03:00`);
  liveTsLo.setUTCDate(liveTsLo.getUTCDate() - 1);

  const rows = await prisma.$queryRawUnsafe<Array<FunnelStages>>(
    `
    WITH rollup_part AS (
      SELECT hll_union_agg(pv_visitors_hll)      AS pv,
             hll_union_agg(product_visitors_hll) AS prod,
             hll_union_agg(cart_visitors_hll)    AS cart,
             hll_union_agg(checkout_visitors_hll) AS chk
      FROM pixel_daily_aggregates
      WHERE "organizationId" = $1 AND day >= $2::date AND day <= $3::date
    ),
    live_part AS (
      -- pv EXCLUYE el checkout: "no es una visita, es parte del proceso de compra"
      -- (2026-07-22). Espejo del rollup pv_visitors_hll. Las otras etapas NO se
      -- tocan: el paso checkout justamente tiene que contar checkouts.
      SELECT hll_add_agg(hll_hash_text("visitorId"), 14, 5) FILTER (WHERE type = 'PAGE_VIEW' AND ("pageUrl" IS NULL OR "pageUrl" !~* '${CHECKOUT_URL_REGEX}'))    AS pv,
             hll_add_agg(hll_hash_text("visitorId"), 14, 5) FILTER (WHERE type = 'VIEW_PRODUCT') AS prod,
             hll_add_agg(hll_hash_text("visitorId"), 14, 5) FILTER (WHERE type = 'ADD_TO_CART')  AS cart,
             hll_add_agg(hll_hash_text("visitorId"), 14, 5) FILTER (WHERE type IN ('INITIATE_CHECKOUT','CHECKOUT_SHIPPING')) AS chk
      FROM pixel_events
      WHERE "organizationId" = $1
        AND timestamp >= $4::timestamptz
        AND timestamp <= $5::timestamptz
        AND (timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date >= $6::date
        AND (timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= $3::date
        AND ("sessionId" IS NULL OR "sessionId" NOT LIKE 'webhook-%')
    )
    SELECT
      hll_cardinality(hll_union(COALESCE((SELECT pv   FROM rollup_part), hll_empty(14,5)), COALESCE((SELECT pv   FROM live_part), hll_empty(14,5))))::int AS "pageView",
      hll_cardinality(hll_union(COALESCE((SELECT prod FROM rollup_part), hll_empty(14,5)), COALESCE((SELECT prod FROM live_part), hll_empty(14,5))))::int AS "viewProduct",
      hll_cardinality(hll_union(COALESCE((SELECT cart FROM rollup_part), hll_empty(14,5)), COALESCE((SELECT cart FROM live_part), hll_empty(14,5))))::int AS "addToCart",
      hll_cardinality(hll_union(COALESCE((SELECT chk  FROM rollup_part), hll_empty(14,5)), COALESCE((SELECT chk  FROM live_part), hll_empty(14,5))))::int AS "checkoutStart"
    `,
    orgId,
    fromDay,
    toDay,
    liveTsLo.toISOString(),
    dateTo.toISOString(),
    liveFromDay
  );

  const r = rows[0];
  return {
    pageView: r?.pageView || 0,
    viewProduct: r?.viewProduct || 0,
    addToCart: r?.addToCart || 0,
    checkoutStart: r?.checkoutStart || 0,
  };
}
