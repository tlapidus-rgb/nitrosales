-- ══════════════════════════════════════════════════════════════════════════
-- Gold: gold_customer_daily — ventas por cliente (metrics/orders top customers)
-- ══════════════════════════════════════════════════════════════════════════
-- Read-model de órdenes/revenue POR CLIENTE, por día, pack-aware. Reemplaza la
-- query topCustomers de metrics/orders (JOIN orders+customers + anti-join de
-- packs en cada request).
--
-- Grain: (organization_id, day, customer_id). Serve agrupa por cliente sobre el
-- rango, ordena por revenue (LIMIT 10) y joinea customers SOLO para esos 10
-- (name/email cambian con el CRM → no se congelan acá).
--
-- Semántica (paridad con topCustomers): packs VÁLIDOS (concretados) de TODAS las
-- fuentes (NO filtra web/marketplace — topCustomers tampoco). customer_id NOT NULL.
-- Cuando hay filtro de source, el serve cae a Bronze (el grano no tiene source).
--
-- ⚠️ CORRER MANUALMENTE EN NEON. Idempotente. Datos vía el transform
-- (src/data/gold/gold-customer-daily-transform.ts) desde silver_orders.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gold_customer_daily (
  organization_id text          NOT NULL,
  day             date          NOT NULL,   -- día AR (America/Argentina/Buenos_Aires)
  customer_id     text          NOT NULL,
  orders          integer       NOT NULL,   -- packs válidos del cliente (DISTINCT pack_key)
  revenue         numeric(14,2) NOT NULL,   -- SUM(total_value)
  gold_updated_at timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, day, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_gold_customer_daily_org_day
  ON gold_customer_daily (organization_id, day);
