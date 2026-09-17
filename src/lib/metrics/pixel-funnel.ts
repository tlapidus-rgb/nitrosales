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

import { createPixelTrace } from "@/lib/pixel/performance-trace";
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

export function shouldUseFunnelRollupOnly(
  fromDay: string,
  toDay: string,
  minRollupDay: string | null,
  maxRollupDay: string | null
): boolean {
  // A one-day range needs the live merge so "Hoy" can include events created
  // after the last rollup refresh. For multi-day presets, yesterday is the last
  // complete day we require from the daily rollup. The current day can be absent
  // or partial; on large tenants the live merge times out and already falls back
  // to exactly these rollup values, so attempting it only adds four seconds.
  const dayBeforeTo = new Date(`${toDay}T00:00:00.000Z`);
  dayBeforeTo.setUTCDate(dayBeforeTo.getUTCDate() - 1);
  const lastCompleteDay = dayBeforeTo.toISOString().slice(0, 10);

  return fromDay !== toDay
    && !!minRollupDay
    && !!maxRollupDay
    && minRollupDay <= fromDay
    && maxRollupDay >= lastCompleteDay;
}

async function readRollupStages(
  orgId: string,
  fromDay: string,
  toDay: string,
  trace: ReturnType<typeof createPixelTrace>,
  stage: "funnel.rollup_fast" | "funnel.rollup_fallback"
): Promise<Array<FunnelStages>> {
  return trace.run(stage, () => prisma.$queryRawUnsafe<Array<FunnelStages>>(
    `SELECT
       COALESCE(hll_cardinality(hll_union_agg(pv_visitors_hll)), 0)::int AS "pageView",
       COALESCE(hll_cardinality(hll_union_agg(product_visitors_hll)), 0)::int AS "viewProduct",
       COALESCE(hll_cardinality(hll_union_agg(cart_visitors_hll)), 0)::int AS "addToCart",
       COALESCE(hll_cardinality(hll_union_agg(checkout_visitors_hll)), 0)::int AS "checkoutStart"
     FROM pixel_daily_aggregates
     WHERE "organizationId" = $1 AND day >= $2::date AND day <= $3::date`,
    orgId,
    fromDay,
    toDay
  ));
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
  dateTo: Date,
  trace = createPixelTrace()
): Promise<FunnelStages> {
  const fromDay = arDay(dateFrom);
  const toDay = arDay(dateTo);

  // Último día presente en el rollup (PK chica → instantáneo).
  const mr = await trace.run("funnel.rollup_watermark", () => prisma.$queryRawUnsafe<Array<{ minDay: string | null; maxDay: string | null }>>(
    `SELECT MIN(day)::text AS "minDay", MAX(day)::text AS "maxDay"
     FROM pixel_daily_aggregates WHERE "organizationId" = $1`,
    orgId
  ));
  const minRoll = mr[0]?.minDay || null;
  const maxRoll = mr[0]?.maxDay || null;

  let rows: Array<FunnelStages>;
  if (shouldUseFunnelRollupOnly(fromDay, toDay, minRoll, maxRoll)) {
    rows = await readRollupStages(orgId, fromDay, toDay, trace, "funnel.rollup_fast");
    const r = rows[0];
    return {
      pageView: r?.pageView || 0,
      viewProduct: r?.viewProduct || 0,
      addToCart: r?.addToCart || 0,
      checkoutStart: r?.checkoutStart || 0,
    };
  }

  // Desde qué día AR calculamos en vivo: el último día del rollup (parcial) en
  // adelante. Si el rollup no tiene nada o arranca después del rango, vivo = todo.
  const liveFromDay = !maxRoll || maxRoll < fromDay ? fromDay : maxRoll;

  // Lower-bound de timestamp para el index scan del tramo vivo: medianoche AR del
  // liveFromDay menos 1 día (bracket generoso, igual que el backfill: los eventos
  // de la noche AR caen en UTC del día siguiente). El filtro AR-date exacto recorta.
  const liveTsLo = new Date(`${liveFromDay}T00:00:00.000-03:00`);
  liveTsLo.setUTCDate(liveTsLo.getUTCDate() - 1);

  try {
    rows = await trace.run("funnel.live_merge", () => prisma.$transaction(async (tx) => {
      // El merge vivo es una mejora de frescura, no puede bloquear todo Analytics.
      // Si el tramo reciente creció demasiado, usamos el rollup ya disponible.
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = 4000`);
      return tx.$queryRawUnsafe<Array<FunnelStages>>(`
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
        -- Convert bounds once instead of converting each event timestamp.
        AND timestamp >= ($6::date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
        AND timestamp < (($3::date + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
        -- Other event types contribute to none of the four HLL aggregates.
        AND type IN ('PAGE_VIEW', 'VIEW_PRODUCT', 'ADD_TO_CART', 'INITIATE_CHECKOUT', 'CHECKOUT_SHIPPING')
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
    }, { timeout: 6000, maxWait: 2000 }));
  } catch (error) {
    console.warn("[funnel] live merge excedió 4s; usando rollup:", String(error).slice(0, 120));
    rows = await readRollupStages(orgId, fromDay, toDay, trace, "funnel.rollup_fallback");
  }

  const r = rows[0];
  return {
    pageView: r?.pageView || 0,
    viewProduct: r?.viewProduct || 0,
    addToCart: r?.addToCart || 0,
    checkoutStart: r?.checkoutStart || 0,
  };
}
