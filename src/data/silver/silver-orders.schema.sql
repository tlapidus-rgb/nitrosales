-- ══════════════════════════════════════════════════════════════════════════
-- Silver: silver_orders — Fase 2 del PLAN_ARQUITECTURA_MODULAR_MONOLITO.md (§6.2)
-- ══════════════════════════════════════════════════════════════════════════
-- Capa Silver: orders conformadas con flags de negocio PRE-COMPUTADOS, para que
-- Serve no recompute el filtro de "orden válida"/"web" en cada query (y para
-- eliminar los LATERAL de metrics/orders + metrics/pixel).
--
-- ⚠️ CORRER MANUALMENTE EN NEON (Vercel no migra DB — Error #13). NO va a schema.prisma
-- hasta después de aplicar (§13). Idempotente: CREATE ... IF NOT EXISTS.
--
-- Los flags is_valid/is_web NO se definen acá a mano: los computa el job de
-- transform (src/data/silver/silver-orders-transform.ts) usando el contrato
-- (ordersValidSql/ordersWebSql) → cero drift con el resto de la plataforma.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS silver_orders (
  id                text         PRIMARY KEY,          -- = orders.id (misma PK que Bronze)
  organization_id   text         NOT NULL,
  external_id       text         NOT NULL,
  order_date        timestamptz  NOT NULL,             -- fecha canónica (nunca createdAt)
  status            text         NOT NULL,
  total_value       numeric(12,2) NOT NULL,
  currency          text         NOT NULL,
  item_count        integer      NOT NULL,
  pack_id           text,
  source            text         NOT NULL,
  channel           text,
  traffic_source    text,
  device_type       text,
  customer_id       text,
  shipping_cost     numeric(12,2),                       -- para el header de KPIs (§ cascadeo)
  discount_value    numeric(12,2),
  marketplace_fee   numeric(12,2),
  real_shipping_cost numeric(12,2),                      -- para segmentaciones de logística
  delivery_type     text,
  shipping_carrier  text,
  -- Flags pre-computados (fuente: src/domains/orders/index.ts vía el job de transform)
  is_valid          boolean      NOT NULL,             -- ordersValidSql: concretada + totalValue > 0
  is_web            boolean      NOT NULL,             -- ordersWebSql: no marketplace
  is_marketplace    boolean      NOT NULL,             -- = NOT is_web
  silver_updated_at timestamptz  NOT NULL DEFAULT now()
);

-- Índices para el read path de Serve (Gold-first se apoya en Silver para drill-down).
CREATE INDEX IF NOT EXISTS idx_silver_orders_org_date
  ON silver_orders (organization_id, order_date);
CREATE INDEX IF NOT EXISTS idx_silver_orders_org_valid_date
  ON silver_orders (organization_id, is_valid, order_date);
CREATE INDEX IF NOT EXISTS idx_silver_orders_org_web_date
  ON silver_orders (organization_id, is_web, order_date);
