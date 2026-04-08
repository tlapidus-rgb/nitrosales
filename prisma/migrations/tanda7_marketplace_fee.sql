-- Tanda 7.4 — Agrega columna marketplaceFee a orders
-- Comisión retenida por el marketplace (ej: ML sale_fee). NULL para VTEX.
-- Auditoría 2026-04-08: sin este campo el "neto real" de ML estaba inflado
-- porque no se restaba la comisión (~13-16% del gross en vendedores clásicos).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS "marketplaceFee" DECIMAL(12, 2) NULL;

-- Índice parcial: solo órdenes con fee > 0 (optimiza queries de totales).
CREATE INDEX IF NOT EXISTS orders_marketplace_fee_idx
  ON orders ("organizationId", "orderDate")
  WHERE "marketplaceFee" IS NOT NULL;

COMMENT ON COLUMN orders."marketplaceFee" IS
  'Comisión del marketplace (ej: ML sale_fee). NULL para VTEX o antes del deploy Tanda 7.';
