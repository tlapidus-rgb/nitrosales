-- ══════════════════════════════════════════════════════════════════════════
-- F3.2 canales — pixel_daily_channel (canal RESUELTO por channel_rule)
-- ══════════════════════════════════════════════════════════════════════════
-- Rollup diario del canal (y sub-canal TV) resuelto sobre los crudos de la dim
-- (source_raw/medium_raw/campaign_raw, F3.1). PARALELA a pixel_daily_source:
-- aditiva, no toca la tabla vieja. El serve la lee detrás de flag; rollback =
-- flag off. Cambiar una regla NO reescanea pixel_events: re-materializar este
-- rollup alcanza (beneficio de Opción C).
--
-- Requiere la extensión `hll` (ya está en prod y en las branches de Neon).
-- El backfill (rollup-backfill.ts, statement #8) la puebla; el canal se resuelve
-- con las MISMAS reglas y el mismo buildChannelRuleCase que el preview de la UI.
--
-- ⚠️ CORRER MANUALMENTE (Neon). Idempotente. En test-canales primero.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pixel_daily_channel (
  "organizationId" text NOT NULL,
  day             date NOT NULL,
  channel         text NOT NULL,
  sub_channel     text NOT NULL DEFAULT '',
  pv_visitors_hll hll,
  refreshed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("organizationId", day, channel, sub_channel)
);
