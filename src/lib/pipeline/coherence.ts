// ══════════════════════════════════════════════════════════════════════════
// Coherencia de rollups — ¿el rollup dice lo mismo que el dato crudo?
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE (2026-07-21, el bug que costó una jornada):
//
//   `pixel_daily_source` tenía 10.315 visitantes donde el crudo tenía 104.454,
//   para TeVe Compras. El cliente lo vio antes que nosotros: "aparecen más de
//   100.000 visitas pero la separación por canales no se acerca a ese número".
//
//   Causa: el rollup JOINea contra `pixel_visitor_first_source`, y se calculó día
//   a día MIENTRAS esa dimensión estaba vacía (su cron llevaba 5 semanas
//   desagendado). Rellenar la dimensión no reescribe lo ya materializado, y el
//   cron normal sólo reconstruye 3 días.
//
// POR QUÉ LAS ALERTAS DE FRESCURA NO LO AGARRAN:
//   Miran `refreshed_at`, y ese campo estaba AL DÍA — el cron corría puntual. La
//   tabla estaba fresca y equivocada al mismo tiempo. Es un modo de fallar
//   distinto: contenido stale, no tabla stale. Nada lo vigilaba.
//
// QUÉ MIDE: para UN día, compara los visitantes que el rollup dice tener contra
// los que el crudo tiene para esa misma definición. Un día alcanza — si el
// pipeline está roto, se ve en cualquier día — y mantiene la query acotada.
// ══════════════════════════════════════════════════════════════════════════

/**
 * Umbral de divergencia. Generoso a propósito: el HLL tiene ~0,4-1,5% de error
 * al unir días, y no queremos alertar por eso. Lo que buscamos son órdenes de
 * magnitud — el caso real era 10×, no 10%.
 */
export const COHERENCE_MAX_DRIFT_PCT = 15;

export interface CoherenceRow {
  org: string;
  day: string;
  rollupVisitors: number;
  rawVisitors: number;
  /** Cuánto se aparta el rollup del crudo, en % del crudo. */
  driftPct: number;
  incoherent: boolean;
}

/**
 * Visitantes por org según el ROLLUP, para un día.
 * $1 = día (YYYY-MM-DD).
 */
export function buildRollupSideSql(): string {
  return `
SELECT "organizationId" AS org,
       hll_cardinality(hll_union_agg(pv_visitors_hll))::int AS visitors
FROM pixel_daily_source
WHERE day = $1::date
GROUP BY 1`.trim();
}

/**
 * Visitantes por org según el CRUDO, para el mismo día y la MISMA definición que
 * usa el rollup: PAGE_VIEW y sin sesiones de webhook. **SIN cruzar contra la
 * dimensión de first-source.**
 *
 * ⚠️ Acá había un INNER JOIN contra `pixel_visitor_first_source`, copiado de
 * cuando el rollup también lo tenía. Cuando el rollup pasó a LEFT JOIN +
 * `sin_clasificar` (2026-07-21), esta query quedó midiendo MENOS gente que el
 * rollup y el chequeo empezó a gritar con el rollup 31-48% "de más". Falso
 * positivo: los visitantes del día todavía no tienen fila en la dimensión —el
 * cron de first-source corre a las 3am— así que caen en `sin_clasificar`, que el
 * rollup cuenta y esta query excluía.
 *
 * Es literalmente el modo de fallar que advierten los tests de este archivo: si
 * las dos definiciones se despegan, el chequeo da falsos positivos y termina
 * ignorándose. **Si cambia el filtro del transform (rollup-backfill.ts #6), hay
 * que cambiar esta query en el mismo commit.**
 * $1 = día (YYYY-MM-DD).
 */
export function buildRawSideSql(): string {
  return `
SELECT pe."organizationId" AS org,
       COUNT(DISTINCT pe."visitorId")::int AS visitors
FROM pixel_events pe
WHERE (pe.timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = $1::date
  AND pe.type = 'PAGE_VIEW'
  AND (pe."sessionId" IS NULL OR pe."sessionId" NOT LIKE 'webhook-%')
GROUP BY 1`.trim();
}

/**
 * Compara los dos lados. Pura — se testea sin base.
 *
 * Una org presente en el crudo y AUSENTE del rollup cuenta como divergencia
 * total (100%): es exactamente el caso "el rollup no tiene nada para este día",
 * que es el peor y el que hay que gritar.
 */
export function compareCoherence(
  day: string,
  rollup: Array<{ org: string; visitors: number }>,
  raw: Array<{ org: string; visitors: number }>,
  maxDriftPct: number = COHERENCE_MAX_DRIFT_PCT
): CoherenceRow[] {
  const rollupByOrg = new Map(rollup.map((r) => [r.org, r.visitors]));
  return raw
    .map(({ org, visitors: rawVisitors }) => {
      const rollupVisitors = rollupByOrg.get(org) ?? 0;
      // Sin tráfico crudo no hay nada que comparar: no es incoherencia.
      const driftPct =
        rawVisitors > 0
          ? Math.round((Math.abs(rawVisitors - rollupVisitors) / rawVisitors) * 1000) / 10
          : 0;
      return {
        org,
        day,
        rollupVisitors,
        rawVisitors,
        driftPct,
        incoherent: rawVisitors > 0 && driftPct > maxDriftPct,
      };
    })
    .sort((a, b) => b.driftPct - a.driftPct);
}

/** Resumen legible de las orgs incoherentes, para log o mail. */
export function formatCoherenceSummary(rows: CoherenceRow[]): string {
  return rows
    .filter((r) => r.incoherent)
    .map(
      (r) =>
        `${r.org} (${r.day}): el rollup dice ${r.rollupVisitors} visitantes y el crudo ${r.rawVisitors} — ${r.driftPct}% de diferencia`
    )
    .join("\n");
}
