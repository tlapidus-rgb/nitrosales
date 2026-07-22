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
 * Predicado de "este visitante hay que evaluarlo", SIN la ventana temporal.
 *
 * ⚠️ FUENTE ÚNICA A PROPÓSITO (2026-07-22). Estaba escrito dos veces —una en la
 * selección de candidatos, otra en la consulta de pendientes— y las dos copias
 * DEBEN decir lo mismo: si la métrica es más restrictiva que la selección,
 * reporta "no queda trabajo" mientras el trabajo existe. Eso ya pasó y costó
 * dar por cerrado el tema con ~33.000 visitantes sin clasificar (ver
 * `buildUnresolvedSql`). Una sola función es lo que impide que vuelvan a
 * divergir.
 *
 * `$1` = organizationId.
 */
function needsEvaluationPredicate(alias = "pv"): string {
  return `NOT EXISTS (
      SELECT 1 FROM pixel_visitor_first_source d
      WHERE d."organizationId"=$1 AND d."visitorId"=${alias}.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM pixel_visitor_no_source n
      WHERE n."organizationId"=$1 AND n."visitorId"=${alias}.id
        -- El marcado CADUCA. Vale mientras el visitante no haya vuelto: si
        -- lastSeenAt es posterior a checked_at, generó eventos nuevos que nadie
        -- miró y hay que re-evaluarlo.
        --
        -- Sin esto (bug medido el 2026-07-22): un visitante cuyo primer
        -- contacto fue una vuelta de pasarela quedaba marcado PARA SIEMPRE.
        -- Volvía al día siguiente, navegaba el sitio entero y compraba, y
        -- seguía cayendo en 'sin_clasificar'. Eran ~9.800 visitantes entre las
        -- tres orgs, todos con PAGE_VIEW en páginas normales que resuelven a
        -- 'direct' sin problema.
        AND n.checked_at >= ${alias}."lastSeenAt"
    )`;
}

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
    AND ${needsEvaluationPredicate("pv")}
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
  -- ⚠️ DO UPDATE, no DO NOTHING. Va atado a la caducidad de arriba y NO se
  -- puede tocar por separado: con la caducidad puesta, un visitante que volvió
  -- se re-evalúa; si al re-marcarlo no se refresca checked_at, vuelve a
  -- cumplir la condición en la pasada siguiente y se re-evalúa POR SIEMPRE.
  -- Eso es exactamente la no-convergencia que esta tabla vino a arreglar
  -- (TeVe rebotando 309→311→309). Los dos cambios van juntos o no van.
  ON CONFLICT ("organizationId","visitorId")
    DO UPDATE SET checked_at = now()
  RETURNING "visitorId" AS vid
)
SELECT (SELECT COUNT(*) FROM cand)::int     AS candidates,
       (SELECT COUNT(*) FROM resolved)::int AS resolved,
       (SELECT COUNT(*) FROM marked)::int   AS marked`.trim();
}

/**
 * ¿Quedan candidatos DENTRO de la ventana del batch? $1 = org, $2 = días.
 *
 * Contesta "¿tiene sentido volver a llamar al batch AHORA?" y por eso comparte
 * la ventana con la selección: preguntar por fuera de ella daría `true` para
 * siempre, porque el batch no puede alcanzar a esos visitantes.
 *
 * ⚠️ NO es la respuesta a "¿está todo clasificado?". Para eso está
 * `buildUnresolvedSql`, y la diferencia entre las dos importa — ver ahí.
 */
export function buildHasPendingSql(): string {
  return `
SELECT EXISTS (
  SELECT 1
  FROM pixel_visitors pv
  WHERE pv."organizationId"=$1
    AND pv."lastSeenAt" > NOW() - make_interval(days => $2::int)
    AND ${needsEvaluationPredicate("pv")}
) AS more`.trim();
}

/**
 * Visitantes SIN CLASIFICAR en el horizonte de reporte. $1 = org, $2 = días.
 *
 * ── POR QUÉ EXISTE, QUE ES EL PUNTO ENTERO ────────────────────────────────
 * `buildHasPendingSql` filtra por la MISMA ventana que usa la selección de
 * candidatos. Consecuencia: cuando un visitante se pasa de la ventana sin haber
 * sido evaluado, desaparece de la selección y de la métrica AL MISMO TIEMPO. El
 * cron reporta `pending: 9`, y el 9 es cierto: son los pendientes que todavía
 * puede ver. Los que se le escaparon no cuentan porque ya no los mira.
 *
 * Eso pasó (2026-07-22): dimos el backfill por terminado con "9 pendientes"
 * mientras ~33.000 visitantes quedaban en 'sin_clasificar' de forma permanente,
 * y el cliente lo reportó como "el canal Sin clasificar tiene demasiadas
 * visitas". La señal de éxito no se derivaba del mismo estado que la decisión.
 *
 * Esta query se llama con el horizonte de REPORTE (90 días: lo que mira la UI),
 * no con la ventana del batch (3 días). Si devuelve un número grande mientras
 * `pending` dice 0, la diferencia son los que se escaparon: hay que correr una
 * pasada ancha (`?days=90`) para recuperarlos.
 *
 * Acotada por `lastSeenAt` para que sea un index scan sobre
 * (organizationId, lastSeenAt) y no un conteo sobre la tabla entera.
 */
export function buildUnresolvedByOrgSql(): string {
  return `
SELECT pv."organizationId" AS org, COUNT(*)::int AS unresolved
FROM pixel_visitors pv
WHERE pv."lastSeenAt" > NOW() - make_interval(days => $1::int)
  AND NOT EXISTS (
    SELECT 1 FROM pixel_visitor_first_source d
    WHERE d."organizationId"=pv."organizationId" AND d."visitorId"=pv.id
  )
GROUP BY 1
ORDER BY 2 DESC`.trim();
}
