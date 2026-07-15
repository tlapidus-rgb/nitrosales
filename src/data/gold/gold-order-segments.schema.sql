-- ══════════════════════════════════════════════════════════════════════════
-- Gold: gold_order_segments — segmentaciones diarias pack-aware (§6.3)
-- ══════════════════════════════════════════════════════════════════════════
-- Rollup GENERAL de órdenes/revenue por dimensión de segmentación (channel, y a
-- futuro payment/delivery/carrier). Una fila por (org, día, dimensión, bucket).
-- Serve suma sobre días y agrupa por bucket → gráficos de torta sub-segundo.
--
-- Arranca con dimension='channel' (silver_orders ya tiene channel, sin enriquecer).
-- payment/delivery/carrier requieren primero enriquecer silver con esas columnas.
-- device/traffic NO van acá: se enriquecen desde pixel (otro pipeline).
--
-- ⚠️ CORRER MANUALMENTE EN NEON. Idempotente. Datos vía el transform
-- (src/data/gold/gold-order-segments-transform.ts), pack-aware, desde silver.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gold_order_segments (
  organization_id text        NOT NULL,
  day             date        NOT NULL,
  dimension       text        NOT NULL,   -- 'channel' | (futuro) 'payment' | 'delivery' | 'carrier'
  bucket          text        NOT NULL,   -- el valor de la dimensión (ej. 'web', 'Sin dato')
  orders          integer     NOT NULL,   -- packs válidos (DISTINCT pack_key)
  revenue         numeric(14,2) NOT NULL,
  shipping_charged numeric(14,2) NOT NULL DEFAULT 0,   -- SUM(shippingCost) — para dims de logística
  shipping_real    numeric(14,2) NOT NULL DEFAULT 0,   -- SUM(realShippingCost)
  gold_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, day, dimension, bucket)
);

CREATE INDEX IF NOT EXISTS idx_gold_order_segments_org_dim_day
  ON gold_order_segments (organization_id, dimension, day);
