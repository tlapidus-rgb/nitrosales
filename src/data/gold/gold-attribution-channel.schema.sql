-- ══════════════════════════════════════════════════════════════════════════
-- Gold: gold_attribution_channel — atribución por CANAL (perf + canales ON)
-- ══════════════════════════════════════════════════════════════════════════
-- Espejo EXACTO de gold_attribution_source pero con grano (org, day, channel):
-- el canal resuelto por channel_rule sobre el touchpoint (source/medium/campaign).
-- Existe para que, con PIXEL_USE_CHANNELS ON, el serve lea Gold (rápido) en vez de
-- escanear pa.touchpoints en vivo (Bronze), que en 30d de la org grande se pasa
-- del timeout y devuelve mock en 0.
--
-- POR QUÉ POR ORG (a diferencia del de source): la resolución de canal depende de
-- las reglas de la org (globales + propias), así que el transform materializa
-- org por org con SU channelCase. El total de revenue es IDÉNTICO al de source
-- (misma plata, re-agrupada source→canal) — garantizado por test de paridad.
--
-- Mismas columnas/semántica que gold_attribution_source: componentes SIN ponderar
-- (el serve reconstruye el modelo con attribution-weights) + conteos de rol.
-- attribution.ts INTACTO.
--
-- ⚠️ CORRER MANUALMENTE EN NEON (o vía setup-pixel-rollups). Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gold_attribution_channel (
  organization_id text          NOT NULL,
  day             date          NOT NULL,   -- día AR de la ORDEN (orderDate)
  channel         text          NOT NULL,   -- canal resuelto (channel_rule) o source passthrough
  orders          integer       NOT NULL,   -- COUNT(DISTINCT orderId) con este canal
  -- Componentes de revenue por rol del touchpoint (SIN ponderar) --
  last_click_revenue  numeric(14,2) NOT NULL DEFAULT 0,
  first_click_revenue numeric(14,2) NOT NULL DEFAULT 0,
  linear_revenue      numeric(14,2) NOT NULL DEFAULT 0,
  nitro_single        numeric(14,2) NOT NULL DEFAULT 0,
  nitro_first2        numeric(14,2) NOT NULL DEFAULT 0,
  nitro_last2         numeric(14,2) NOT NULL DEFAULT 0,
  nitro_first_n       numeric(14,2) NOT NULL DEFAULT 0,
  nitro_last_n        numeric(14,2) NOT NULL DEFAULT 0,
  nitro_middle_n      numeric(14,2) NOT NULL DEFAULT 0,
  -- Conteos de rol por canal --
  first_touch_count   integer       NOT NULL DEFAULT 0,
  assist_touch_count  integer       NOT NULL DEFAULT 0,
  last_touch_count    integer       NOT NULL DEFAULT 0,
  solo_touch_count    integer       NOT NULL DEFAULT 0,
  gold_updated_at timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, day, channel)
);

CREATE INDEX IF NOT EXISTS idx_gold_attribution_channel_org_day
  ON gold_attribution_channel (organization_id, day);
