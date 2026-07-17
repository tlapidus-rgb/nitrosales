-- ══════════════════════════════════════════════════════════════════════════
-- Silver: silver_customer_firsts — dim de primera orden por cliente (tanda 3)
-- ══════════════════════════════════════════════════════════════════════════
-- Mata el LATERAL de cohorts en metrics/orders: hoy, POR CADA request, la query
-- corre un MIN("orderDate") correlacionado por cliente sobre TODA la historia
-- de orders (uno de los pesos pesados del endpoint). Esta dim lo precomputa.
--
-- Semántica (paridad con el LATERAL): first_order_date = MIN(order_date) sobre
-- TODAS las órdenes del cliente, SIN filtro de status (igual que el Bronze:
-- una orden cancelada también cuenta como "primera vez que compró").
--
-- Grain: (organization_id, customer_id). Se mantiene con LEAST() en el upsert
-- incremental → una ventana reciente nunca puede "subir" la fecha histórica.
--
-- ⚠️ CORRER MANUALMENTE EN NEON. Idempotente (IF NOT EXISTS). Los datos los
-- llena el transform (src/data/silver/silver-customer-firsts-transform.ts)
-- desde silver_orders.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS silver_customer_firsts (
  organization_id   text        NOT NULL,
  customer_id       text        NOT NULL,
  first_order_date  timestamptz NOT NULL,
  silver_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, customer_id)
);
