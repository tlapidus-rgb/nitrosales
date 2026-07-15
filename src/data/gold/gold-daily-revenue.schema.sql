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
  gold_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, day, source)
);

CREATE INDEX IF NOT EXISTS idx_gold_daily_revenue_org_day
  ON gold_daily_revenue (organization_id, day);
