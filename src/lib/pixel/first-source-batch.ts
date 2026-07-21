// ══════════════════════════════════════════════════════════════════════════
// NitroPixel — batch incremental de first-source (convergente)
// ══════════════════════════════════════════════════════════════════════════
// EL PROBLEMA QUE RESUELVE (medido en prod, 2026-07-21):
//   Un visitante cuyos eventos clasifican TODOS a NULL —solo pasarelas de pago o
//   vueltas de checkout— no genera fila en `pixel_visitor_first_source`. Como la
//   selección de candidatos era "los que no tienen fila", esos volvían a entrar
//   en CADA pasada y se les re-escaneaba el historial completo sin producir nada.
//   A medida que se consumían los resolubles, el lote se llenaba de irresolubles
//   y el rendimiento caía hacia cero: el backfill NO convergía. TeVe Compras
//   rebotaba entre 309 y 311 pendientes corrida tras corrida.
//
// LA SOLUCIÓN: `pixel_visitor_no_source` recuerda a los ya evaluados sin canal, y
// la selección los excluye. No es dato de negocio — es memoria del proceso.
//
// POR QUÉ UN SOLO STATEMENT CON CTEs QUE MODIFICAN:
//   `cand` se evalúa UNA vez y la comparten el INSERT de resueltos y el de
//   marcados. Con dos statements separados, el segundo `LIMIT` (sin ORDER BY)
//   podría elegir otro conjunto y marcaríamos como "sin canal" a visitantes que
//   nunca se miraron — corrompiendo la dimensión en silencio.
//
// Está en un módulo aparte para poder ejecutarlo contra Postgres real en los
// tests. Ver src/__tests__/first-source-batch-sql.test.ts.
// ══════════════════════════════════════════════════════════════════════════

import {
  FIRST_SOURCE_MARKETING_CASE_FILTERED,
  WEBHOOK_SESSION_FILTER,
} from "@/lib/pixel/first-source-sql";

/**
 * SQL del batch. Placeholders:
 *   $1 = organizationId
 *   $2 = ventana en días (mira `pixel_visitors.lastSeenAt`)
 *   $3 = tope de candidatos por pasada
 *
 * Devuelve una fila: { candidates, resolved, marked }.
 */
export function buildFirstSourceBatchSql(): string {
  return `
WITH cand AS (
  SELECT pv.id AS vid
  FROM pixel_visitors pv
  WHERE pv."organizationId"=$1
    AND pv."lastSeenAt" > NOW() - make_interval(days => $2::int)
    AND NOT EXISTS (
      SELECT 1 FROM pixel_visitor_first_source d
      WHERE d."organizationId"=$1 AND d."visitorId"=pv.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM pixel_visitor_no_source n
      WHERE n."organizationId"=$1 AND n."visitorId"=pv.id
    )
  LIMIT $3::int
),
ev AS (
  SELECT pe."visitorId" AS vid, pe.timestamp AS ts,
         (${FIRST_SOURCE_MARKETING_CASE_FILTERED}) AS marketing_source
  FROM pixel_events pe
  JOIN cand c ON c.vid = pe."visitorId"
  WHERE ${WEBHOOK_SESSION_FILTER}
),
resolved AS (
  INSERT INTO pixel_visitor_first_source ("organizationId","visitorId",first_source)
  SELECT DISTINCT ON (ev.vid) $1, ev.vid, ev.marketing_source
  FROM ev
  WHERE ev.marketing_source IS NOT NULL
  ORDER BY ev.vid, ev.ts ASC
  ON CONFLICT ("organizationId","visitorId") DO NOTHING
  RETURNING "visitorId" AS vid
),
marked AS (
  INSERT INTO pixel_visitor_no_source ("organizationId","visitorId")
  SELECT $1, c.vid
  FROM cand c
  WHERE NOT EXISTS (SELECT 1 FROM resolved r WHERE r.vid = c.vid)
  ON CONFLICT ("organizationId","visitorId") DO NOTHING
  RETURNING "visitorId" AS vid
)
SELECT (SELECT COUNT(*) FROM cand)::int     AS candidates,
       (SELECT COUNT(*) FROM resolved)::int AS resolved,
       (SELECT COUNT(*) FROM marked)::int   AS marked`.trim();
}

/** ¿Quedan visitantes sin evaluar en esta org? $1 = org, $2 = ventana en días. */
export function buildHasPendingSql(): string {
  return `
SELECT EXISTS (
  SELECT 1
  FROM pixel_visitors pv
  WHERE pv."organizationId"=$1
    AND pv."lastSeenAt" > NOW() - make_interval(days => $2::int)
    AND NOT EXISTS (
      SELECT 1 FROM pixel_visitor_first_source d
      WHERE d."organizationId"=$1 AND d."visitorId"=pv.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM pixel_visitor_no_source n
      WHERE n."organizationId"=$1 AND n."visitorId"=pv.id
    )
) AS more`.trim();
}
