-- ══════════════════════════════════════════════════════════════════════════
-- Gold: gold_daily_revenue — Fase 1 del PLAN_ARQUITECTURA_MODULAR_MONOLITO.md (§6.3)
-- ══════════════════════════════════════════════════════════════════════════
-- Read-model diario de órdenes/revenue/items, PACK-AWARE (packs de MELI), listo
-- para el dashboard sub-segundo. Reemplaza el re-escaneo de Bronze + el anti-join
-- de packs cancelados que hoy corre en CADA query de metrics/orders.
--
-- Grain: (organization_id, day, source). Serve suma sobre source para el total,
-- o filtra por source para el split VTEX/MELI.
--
-- ⚠️ CORRER MANUALMENTE EN NEON. Idempotente (IF NOT EXISTS). Los datos los llena
-- el transform (src/data/gold/gold-daily-revenue-transform.ts), pack-aware, desde
-- silver_orders → drift-proof con el contrato.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gold_daily_revenue (
  organization_id text        NOT NULL,
  day             date        NOT NULL,   -- día AR (America/Argentina/Buenos_Aires)
  source          text        NOT NULL,   -- 'VTEX' | 'MELI'
  orders          integer     NOT NULL,   -- packs válidos (DISTINCT pack_key)
  revenue         numeric(14,2) NOT NULL,
  items           integer     NOT NULL,
  shipping        numeric(14,2) NOT NULL DEFAULT 0,   -- para el header de KPIs (§ cascadeo)
  discounts       numeric(14,2) NOT NULL DEFAULT 0,
  marketplace_fee numeric(14,2) NOT NULL DEFAULT 0,
  orders_with_fee integer     NOT NULL DEFAULT 0,
  -- ── Medidas de PROFITABILITY (tanda 2, 2026-07) — a nivel order_items ──
  item_gross              numeric(14,2) NOT NULL DEFAULT 0,  -- SUM(oi.totalPrice)
  item_gross_with_cost    numeric(14,2) NOT NULL DEFAULT 0,  -- items con costo conocido
  item_gross_without_cost numeric(14,2) NOT NULL DEFAULT 0,  -- items sin costo
  item_cogs               numeric(14,2) NOT NULL DEFAULT 0,  -- SUM(qty × effective_cost)
  orders_with_cost        integer       NOT NULL DEFAULT 0,  -- packs con ≥1 item costeado
  orders_with_items       integer       NOT NULL DEFAULT 0,  -- packs con items (denominador)
  gold_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, day, source)
);

CREATE INDEX IF NOT EXISTS idx_gold_daily_revenue_org_day
  ON gold_daily_revenue (organization_id, day);
