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
//   - LOWER(source) si no, defaulteando a 'direct'
// ══════════════════════════════════════════════════════════════════════════

export function touchpointSourceCase(tpExpr: string): string {
  return `CASE
    WHEN LOWER(COALESCE(${tpExpr}->>'medium','')) IN ('organic','social','referral')
      AND LOWER(COALESCE(${tpExpr}->>'source','direct')) IN ('google','bing','yahoo','duckduckgo')
    THEN LOWER(COALESCE(${tpExpr}->>'source','direct')) || '_organic'
    ELSE LOWER(COALESCE(${tpExpr}->>'source', 'direct'))
  END`;
}
