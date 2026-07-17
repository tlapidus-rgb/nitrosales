-- ══════════════════════════════════════════════════════════════════════════
-- Gold: gold_attribution_source — atribución por fuente (metrics/pixel tanda 5)
-- ══════════════════════════════════════════════════════════════════════════
-- Read-model de revenue de atribución POR FUENTE, por día. Reemplaza las 5
-- queries de /api/metrics/pixel que desanidan `pa.touchpoints` (JSONB) en CADA
-- request (Arredo: ~3s cada una, 5 de ellas dominaban los 20s del endpoint).
--
-- GRANO: (org, day, source). Verificado en Neon (2026-07-17): touchpoints y
-- attributedValue son IDÉNTICOS entre modelos para la misma orden (25120/25121)
-- → el journey es un hecho a nivel orden, el modelo solo REPARTE. Por eso NO
-- hay `model` en el grano.
--
-- PESOS CONFIGURABLES: los pesos NITRO (org.settings.nitroWeights) los edita el
-- cliente. Si horneáramos el revenue ponderado, cambiar pesos invalidaría la
-- historia. Por eso guardamos COMPONENTES SIN PONDERAR y el serve reconstruye
-- cualquier modelo al leer (lib/pixel/attribution-weights.ts):
--   NITRO = single + first2*wF/(wF+wL) + last2*wL/(wF+wL)
--                  + firstN*wF/100 + lastN*wL/100 + middleN*wM/100
--   LAST_CLICK = last_click_revenue ; FIRST_CLICK = first_click_revenue
--   LINEAR = linear_revenue
--
-- ADITIVIDAD: todas las medidas son por-source y aditivas entre días (una orden
-- cae en UN día por orderDate). `orders` = COUNT(DISTINCT orderId) por source:
-- aditivo entre días (la orden no cruza días), NO entre sources (multi-source
-- cuenta 1 por source) — por eso el TOTAL de órdenes atribuidas (#8/#19) se queda
-- en Bronze, no sale de sumar sources acá.
--
-- ⚠️ CORRER MANUALMENTE EN NEON. Idempotente. Datos vía el transform
-- (src/data/gold/gold-attribution-source-transform.ts), desde pixel_attributions.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gold_attribution_source (
  organization_id text          NOT NULL,
  day             date          NOT NULL,   -- día AR de la ORDEN (orderDate)
  source          text          NOT NULL,   -- bucket canónico del touchpoint
  orders          integer       NOT NULL,   -- COUNT(DISTINCT orderId) con este source
  -- Componentes de revenue por rol del touchpoint (SIN ponderar) --
  last_click_revenue  numeric(14,2) NOT NULL DEFAULT 0,  -- valor si source = último touch
  first_click_revenue numeric(14,2) NOT NULL DEFAULT 0,  -- valor si source = primer touch
  linear_revenue      numeric(14,2) NOT NULL DEFAULT 0,  -- SUM(attributedValue / touchpointCount)
  nitro_single        numeric(14,2) NOT NULL DEFAULT 0,  -- n=1
  nitro_first2        numeric(14,2) NOT NULL DEFAULT 0,  -- n=2, primer touch
  nitro_last2         numeric(14,2) NOT NULL DEFAULT 0,  -- n=2, último touch
  nitro_first_n       numeric(14,2) NOT NULL DEFAULT 0,  -- n>=3, primer touch
  nitro_last_n        numeric(14,2) NOT NULL DEFAULT 0,  -- n>=3, último touch
  nitro_middle_n      numeric(14,2) NOT NULL DEFAULT 0,  -- n>=3, intermedios (ya / (n-2))
  -- Conteos de rol por source (para "channel roles", query #22) --
  first_touch_count   integer       NOT NULL DEFAULT 0,  -- tp_ord = 1 (incluye solo-touch)
  assist_touch_count  integer       NOT NULL DEFAULT 0,  -- 1 < tp_ord < n
  last_touch_count    integer       NOT NULL DEFAULT 0,  -- tp_ord = n AND n > 1
  solo_touch_count    integer       NOT NULL DEFAULT 0,  -- n = 1 (journey de un solo touch)
  gold_updated_at timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, day, source)
);

CREATE INDEX IF NOT EXISTS idx_gold_attribution_source_org_day
  ON gold_attribution_source (organization_id, day);
