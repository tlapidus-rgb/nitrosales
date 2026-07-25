import {
  GOOGLE_UTM_SQL_IN,
  META_UTM_SQL_IN,
  INSTAGRAM_UTM_SQL_IN,
} from "@/lib/pixel/first-source-sql";

// ══════════════════════════════════════════════════════════════════════════
// NitroPixel — clasificación de source A NIVEL TOUCHPOINT (JSONB)
// ══════════════════════════════════════════════════════════════════════════
// Las queries de atribución de /api/metrics/pixel clasifican el source de cada
// touchpoint (el objeto del array JSONB `pa.touchpoints`) con este CASE. Es
// DISTINTO del FIRST_SOURCE_MARKETING_CASE de first-source-sql.ts, que clasifica
// a nivel evento (columnas utmParams/referrer/clickIds de pixel_events).
//
// Extraído (DRY, review 2026-07-17): estaba inline y duplicado en ~5 queries del
// endpoint. El rollup gold_attribution_source y el serve DEBEN usar el MISMO CASE
// o divergen en silencio (el bucket 'source' no matchearía entre Gold y Bronze).
//
// `tpExpr` = la expresión SQL del touchpoint (ej. "tp"). Devuelve el bucket:
//   - "<source>_organic" si medium ∈ (organic/social/referral) y source es un buscador
//   - el canal canónico (con alias google/meta/instagram) si no; vacío/NULL → 'direct'
// ══════════════════════════════════════════════════════════════════════════

/**
 * Source → canal canónico: aplica los alias google/meta/instagram. FUENTE ÚNICA
 * de los alias, compartida con `FIRST_SOURCE_MARKETING_CASE` (mismos
 * `*_UTM_SQL_IN`) y con `canonicalMarketingSource` de source-classification.ts
 * (JS, mismos `*_UTM_SET` — ambos derivan de `*_UTM_ALIASES`).
 *
 * ⚠️ BUG (b) que arregla (Fase 1 canales, 2026-07-25): antes `touchpointSourceCase`
 * hacía sólo `LOWER(source)` SIN alias, así que el lado de ATRIBUCIÓN (revenue)
 * mostraba `adwords` (los $406M de TeVe), `fb`, etc. como canales propios,
 * separados de `google`/`meta` — mientras el lado de VISITANTES (first-source) SÍ
 * aliaseaba. El mismo tráfico se agrupaba distinto según qué query respondía.
 * Paridad verificada en `clasificacion-paridad.test.ts`.
 */
export function canonicalSourceSql(sourceExpr: string): string {
  // Espejo EXACTO de normalizeSourceKey: lower + trim, y vacío/espacios → 'direct'
  // (como el `|| "direct"` del JS). COALESCE solo no alcanza: no atrapa el string
  // vacío, y ahí divergiría del clasificador JS.
  const s = `COALESCE(NULLIF(LOWER(TRIM(${sourceExpr})), ''), 'direct')`;
  return `CASE
    WHEN ${s} IN (${GOOGLE_UTM_SQL_IN}) THEN 'google'
    WHEN ${s} IN (${META_UTM_SQL_IN}) THEN 'meta'
    WHEN ${s} IN (${INSTAGRAM_UTM_SQL_IN}) THEN 'instagram'
    ELSE ${s}
  END`;
}

export function touchpointSourceCase(tpExpr: string): string {
  const canonical = canonicalSourceSql(`${tpExpr}->>'source'`);
  return `CASE
    WHEN LOWER(COALESCE(${tpExpr}->>'medium','')) IN ('organic','social','referral')
      AND (${canonical}) IN ('google','bing','yahoo','duckduckgo')
    THEN (${canonical}) || '_organic'
    ELSE (${canonical})
  END`;
}
