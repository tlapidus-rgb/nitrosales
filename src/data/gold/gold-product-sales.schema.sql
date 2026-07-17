-- ══════════════════════════════════════════════════════════════════════════
-- Gold: gold_product_sales — Medallion Fase 2 (metrics/orders → Gold, tanda 2)
-- ══════════════════════════════════════════════════════════════════════════
-- Read-model de VENTAS POR PRODUCTO, pack-aware, para topProducts de
-- metrics/orders (hoy: JOIN order_items+orders+products en Bronze con anti-join
-- de packs en CADA request — una de las queries que DOMINAN el endpoint).
--
-- Grain: (organization_id, day, source, product_id). Serve agrupa por producto
-- sobre el rango y ordena por revenue (LIMIT 15); la metadata (nombre/marca/
-- imagen) se joinea a products/ml_listings SOLO para esos 15 al leer (la
-- metadata cambia con el catálogo → no se congela acá).
--
-- ⚠️ CORRER MANUALMENTE EN NEON. Idempotente (IF NOT EXISTS). Los datos los
-- llena el transform (src/data/gold/gold-product-sales-transform.ts) desde
-- silver_orders + order_items → drift-proof con el contrato.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gold_product_sales (
  organization_id text          NOT NULL,
  day             date          NOT NULL,   -- día AR (America/Argentina/Buenos_Aires)
  source          text          NOT NULL,   -- 'VTEX' | 'MELI'
  product_id      text          NOT NULL,   -- = products.id
  units           integer       NOT NULL,   -- SUM(order_items.quantity)
  revenue         numeric(14,2) NOT NULL,   -- SUM(order_items."totalPrice")
  orders          integer       NOT NULL,   -- packs válidos que incluyen el producto (DISTINCT pack_key)
  gold_updated_at timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, day, source, product_id)
);

CREATE INDEX IF NOT EXISTS idx_gold_product_sales_org_day
  ON gold_product_sales (organization_id, day);
