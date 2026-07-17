-- ══════════════════════════════════════════════════════════════════════════
-- Gold: gold_order_segments — segmentaciones diarias pack-aware (§6.3)
-- ══════════════════════════════════════════════════════════════════════════
-- Rollup GENERAL de órdenes/revenue por dimensión de segmentación. Una fila por
-- (org, día, SOURCE, dimensión, bucket). Serve suma sobre días (y sobre source
-- cuando la lectura no lo necesita) y agrupa por bucket → tortas sub-segundo.
--
-- Dimensiones: 'channel' | 'delivery' | 'carrier' | 'payment' (tanda 4).
-- El source entró al grain en la tanda 4 porque payment agrupa por
-- payment_method × source (el label se traduce por plataforma en JS).
-- device/traffic NO van acá: se enriquecen desde pixel (otro pipeline).
--
-- ⚠️ CORRER MANUALMENTE EN NEON. Idempotente. Datos vía el transform
-- (src/data/gold/gold-order-segments-transform.ts), pack-aware, desde silver.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gold_order_segments (
  organization_id text        NOT NULL,
  day             date        NOT NULL,
  source          text        NOT NULL,   -- 'VTEX' | 'MELI' (tanda 4)
  dimension       text        NOT NULL,   -- 'channel' | 'delivery' | 'carrier' | 'payment'
  bucket          text        NOT NULL,   -- el valor de la dimensión (ej. 'web', 'Sin dato')
  orders          integer     NOT NULL,   -- packs válidos (DISTINCT pack_key)
  revenue         numeric(14,2) NOT NULL,
  shipping_charged numeric(14,2) NOT NULL DEFAULT 0,   -- SUM(shippingCost) — para dims de logística
  shipping_real    numeric(14,2) NOT NULL DEFAULT 0,   -- SUM(realShippingCost)
  gold_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, day, source, dimension, bucket)
);

CREATE INDEX IF NOT EXISTS idx_gold_order_segments_org_dim_day
  ON gold_order_segments (organization_id, dimension, day);
