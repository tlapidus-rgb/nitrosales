-- ══════════════════════════════════════════════════════════════════════════
-- F3.1 canales — columnas CRUDAS en pixel_visitor_first_source (Opción C)
-- ══════════════════════════════════════════════════════════════════════════
-- POR QUÉ (diseño Opción C): hoy la dim guarda `first_source` YA RESUELTO. Para
-- resolver pago-vs-orgánico (medium) y TV-por-señal (campaign) sin reprocesar
-- `pixel_events` cada vez que cambia una regla, guardamos el CRUDO del primer
-- toque de marketing y el canal se resuelve al leer/rollupear vía channel_rule.
--
--   source_raw   = utm_source crudo del primer toque (adwords/fb/gocuotas…), o el
--                  `first_source` ya resuelto como fallback si el evento no trae
--                  utm (clickId/referrer). Las reglas seed matchean el crudo
--                  (`adwords` = Google Ads sin depender del medium).
--   medium_raw   = utm_medium (lower). Decide pago vs orgánico.
--   campaign_raw = utm_campaign SIN normalizar (preserva AXN/TNT para el sub-canal TV).
--
-- ADITIVO: no toca `first_source` (las lecturas actuales siguen igual). El rollup
-- pasa a usar estos crudos en F3.2, detrás de flag.
--
-- NO hace falta `is_gateway_return`: el clasificador FIRST_SOURCE_MARKETING_CASE
-- ya devuelve NULL para las vueltas de pago y el batch elige el primer toque
-- no-nulo, así que la fila elegida NUNCA es una vuelta de pago.
--
-- ⚠️ CORRER MANUALMENTE (Neon). Idempotente. En test-canales primero.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE pixel_visitor_first_source ADD COLUMN IF NOT EXISTS source_raw   text;
ALTER TABLE pixel_visitor_first_source ADD COLUMN IF NOT EXISTS medium_raw   text;
ALTER TABLE pixel_visitor_first_source ADD COLUMN IF NOT EXISTS campaign_raw text;
