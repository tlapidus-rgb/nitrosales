// ══════════════════════════════════════════════════════════════════════════
// NitroPixel — reparar filas de first-source que quedaron sin origen
// ══════════════════════════════════════════════════════════════════════════
// E-17. Esto existía como **un archivo `.sql` por cliente en el disco de Axel**,
// sin versionar (`.gitignore` excluye `*.local.sql`):
//
//     backfill-1-cmod6ns.local.sql
//     backfill-2-emdj.local.sql
//     backfill-3-cmohl80fx.local.sql
//
// Los tres pesaban exactamente 9.827 bytes: el mismo SQL con el
// `organizationId` cambiado a mano. Correr esto para un cliente nuevo era
// copiar un archivo y buscar-y-reemplazar un cuid.
//
// ── EL PROBLEMA NO ERA LA REPETICIÓN, ERA LA COPIA CONGELADA ─────────────
// Esos archivos llevaban pegado adentro un **snapshot** del CASE de
// clasificación de origen: las 40 y pico de reglas de referrer, click-ids y
// aliases de UTM. Ese CASE vive en `first-source-sql.ts` y cambia — se le
// agregaron pasarelas de pago, se corrigió el manejo de `fbclid`, se sumó el
// override de `medium='paid'`.
//
// O sea que cada `.sql` guardaba las reglas **de la fecha en que se generó**, y
// nada avisaba cuando dejaban de coincidir con las del producto. Un backfill
// corrido con un archivo viejo clasifica distinto que el cron, y la diferencia
// aparece como visitantes en `sin_clasificar` que nadie entiende.
//
// Acá el CASE se importa de la misma fuente que usa el cron: no puede divergir.
//
// ── QUÉ HACE, Y EN QUÉ SE DIFERENCIA DEL BATCH ───────────────────────────
// `first-source-batch.ts` INSERTA filas para visitantes que todavía no tienen.
// Esto ACTUALIZA filas que ya existen pero quedaron con `source_raw` en NULL —
// pasa con las que se crearon antes de que se guardaran los campos crudos.
// Son operaciones distintas y las dos hacen falta.
// ══════════════════════════════════════════════════════════════════════════

import {
  FIRST_SOURCE_MARKETING_CASE_FILTERED,
  WEBHOOK_SESSION_FILTER,
  PAID_CLICK_ID_PREDICATE,
} from "@/lib/pixel/first-source-sql";

/**
 * Repara `pixel_visitor_first_source` para una organización.
 *
 * `$1` = organizationId. Idempotente: sólo toca filas con `source_raw IS NULL`,
 * así que correrlo dos veces no cambia nada la segunda.
 *
 * Devuelve el SQL de un solo statement. El `DISTINCT ON (vid) … ORDER BY vid,
 * ts ASC` es lo que hace que gane el **primer** evento del visitante, que es la
 * definición de first-source; sin ese orden explícito, Postgres puede devolver
 * cualquiera de sus eventos y la dimensión queda mal en silencio.
 */
export function buildFirstSourceRepairSql(): string {
  return `
WITH ev AS (
  SELECT vid, ts, marketing_source,
         COALESCE(utm_source_raw, marketing_source) AS source_raw,
         medium_raw, campaign_raw
  FROM (
    SELECT pe."visitorId" AS vid, pe.timestamp AS ts,
           (${FIRST_SOURCE_MARKETING_CASE_FILTERED}) AS marketing_source,
           NULLIF(LOWER(pe."utmParams"->>'source'), '') AS utm_source_raw,
           -- Mismo criterio que el batch: un click-id de pauta ES la señal
           -- fuerte de pago y pisa el utm_medium crudo.
           CASE WHEN ${PAID_CLICK_ID_PREDICATE} THEN 'paid'
                ELSE LOWER(COALESCE(pe."utmParams"->>'medium', '')) END AS medium_raw,
           NULLIF(pe."utmParams"->>'campaign', '') AS campaign_raw
    FROM pixel_events pe
    WHERE pe."organizationId" = $1
      AND ${WEBHOOK_SESSION_FILTER}
      AND EXISTS (
        SELECT 1 FROM pixel_visitor_first_source d
        WHERE d."organizationId" = $1 AND d."visitorId" = pe."visitorId"
          AND d.source_raw IS NULL
      )
  ) x
),
picked AS (
  SELECT DISTINCT ON (vid) vid, source_raw, medium_raw, campaign_raw
  FROM ev
  WHERE marketing_source IS NOT NULL
  ORDER BY vid, ts ASC
)
UPDATE pixel_visitor_first_source d
SET source_raw = p.source_raw,
    medium_raw = p.medium_raw,
    campaign_raw = p.campaign_raw
FROM picked p
WHERE d."organizationId" = $1 AND d."visitorId" = p.vid
  AND d.source_raw IS NULL`.trim();
}

/** Cuántas filas de la organización siguen sin origen. `$1` = organizationId. */
export function buildFirstSourcePendingSql(): string {
  return `
SELECT COUNT(*)::int AS pendientes
  FROM pixel_visitor_first_source
 WHERE "organizationId" = $1 AND source_raw IS NULL`.trim();
}
