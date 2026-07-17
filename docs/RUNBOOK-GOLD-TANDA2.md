# Runbook — Gold tanda 2: top products + profitability

> **Correr en Neon (prod), en este orden.** Todo idempotente. Generado desde los
> builders (`gold-product-sales-transform.ts`, `gold-daily-revenue-transform.ts`)
> — NO editar el SQL a mano; si cambia el transform, regenerar.
>
> Contexto: `metrics/orders` migra topProducts + profitability a Gold detrás de
> `ORDERS_USE_GOLD` (ya activo). Hasta correr esto, esas queries usan el
> fallback Bronze (cero riesgo); al terminar el paso 4, Gold las sirve.

## 1) CREATE gold_product_sales

```sql
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
```

## 2) ALTER gold_daily_revenue — medidas de profitability

```sql
ALTER TABLE gold_daily_revenue
  ADD COLUMN IF NOT EXISTS item_gross              numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_gross_with_cost    numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_gross_without_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_cogs               numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS orders_with_cost        integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS orders_with_items       integer       NOT NULL DEFAULT 0;
```

```sql
-- ═══ 3) BACKFILL gold_product_sales (toda la historia) ═══
WITH bad_packs AS (
  -- packs con AL MENOS una fila no-concretada → el pack entero se excluye
  SELECT DISTINCT s.organization_id, COALESCE(s.pack_id, s.external_id) AS pack_key
  FROM silver_orders s
  WHERE s.status IN ('CANCELLED', 'PENDING', 'RETURNED')
),
valid_orders AS (
  SELECT
    s.id,
    s.organization_id,
    (s.order_date AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS day,
    s.source,
    COALESCE(s.pack_id, s.external_id) AS pack_key
  FROM silver_orders s
  WHERE s.status NOT IN ('CANCELLED', 'PENDING', 'RETURNED')
    AND NOT EXISTS (
      SELECT 1 FROM bad_packs b
      WHERE b.organization_id = s.organization_id
        AND b.pack_key = COALESCE(s.pack_id, s.external_id)
    )
)
INSERT INTO gold_product_sales (
  organization_id, day, source, product_id, units, revenue, orders, gold_updated_at
)
SELECT
  o.organization_id,
  o.day,
  o.source,
  oi."productId" AS product_id,
  COALESCE(SUM(oi.quantity), 0)::int AS units,
  COALESCE(SUM(oi."totalPrice"), 0) AS revenue,
  COUNT(DISTINCT o.pack_key)::int AS orders,
  now()
FROM valid_orders o
JOIN order_items oi ON oi."orderId" = o.id
WHERE oi."productId" IS NOT NULL
GROUP BY o.organization_id, o.day, o.source, oi."productId"
ON CONFLICT (organization_id, day, source, product_id) DO UPDATE SET
  units = EXCLUDED.units,
  revenue = EXCLUDED.revenue,
  orders = EXCLUDED.orders,
  gold_updated_at = now();

-- ═══ 4) RE-BACKFILL COMPLETO gold_daily_revenue (actualiza TODAS las columnas) ═══
WITH bad_packs AS (
  -- packs con AL MENOS una fila no-concretada → el pack entero se excluye
  SELECT DISTINCT s.organization_id, COALESCE(s.pack_id, s.external_id) AS pack_key
  FROM silver_orders s
  WHERE s.status IN ('CANCELLED', 'PENDING', 'RETURNED')
),
valid_rows AS (
  SELECT
    s.id,
    s.organization_id,
    (s.order_date AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS day,
    s.source,
    COALESCE(s.pack_id, s.external_id) AS pack_key,
    s.total_value,
    s.item_count,
    s.shipping_cost,
    s.discount_value,
    s.marketplace_fee
  FROM silver_orders s
  WHERE s.status NOT IN ('CANCELLED', 'PENDING', 'RETURNED')
    AND NOT EXISTS (
      SELECT 1 FROM bad_packs b
      WHERE b.organization_id = s.organization_id
        AND b.pack_key = COALESCE(s.pack_id, s.external_id)
    )
),
-- ── Medidas de PROFITABILITY (tanda 2): a nivel item, agregadas al mismo grain ──
-- effective_cost replica el COALESCE de metrics/orders (item → producto → hermano
-- por SKU). Desviación documentada: el hermano se resuelve con MAX(costPrice) por
-- (org, sku) pre-agregado (determinista) en vez del LIMIT 1 sin ORDER BY del
-- Bronze (no determinista). Solo difiere si un mismo SKU tiene 2+ costos > 0.
sku_costs AS (
  SELECT "organizationId" AS organization_id, sku, MAX("costPrice") AS cost
  FROM products
  WHERE sku IS NOT NULL AND sku != '' AND "costPrice" IS NOT NULL AND "costPrice" > 0
  GROUP BY "organizationId", sku
),
item_measures AS (
  SELECT
    v.organization_id,
    v.day,
    v.source,
    COALESCE(SUM(oi."totalPrice"), 0) AS item_gross,
    COALESCE(SUM(oi."totalPrice") FILTER (WHERE ec.effective_cost > 0), 0) AS item_gross_with_cost,
    COALESCE(SUM(oi."totalPrice") FILTER (WHERE ec.effective_cost IS NULL OR ec.effective_cost = 0), 0) AS item_gross_without_cost,
    COALESCE(SUM(oi.quantity * ec.effective_cost) FILTER (WHERE ec.effective_cost > 0), 0) AS item_cogs,
    COUNT(DISTINCT v.pack_key) FILTER (WHERE ec.effective_cost > 0)::int AS orders_with_cost,
    COUNT(DISTINCT v.pack_key)::int AS orders_with_items
  FROM valid_rows v
  JOIN order_items oi ON oi."orderId" = v.id
  LEFT JOIN products p ON p.id = oi."productId"
  LEFT JOIN sku_costs sc ON sc.organization_id = v.organization_id AND sc.sku = p.sku
  CROSS JOIN LATERAL (
    SELECT COALESCE(oi."costPrice", p."costPrice", sc.cost) AS effective_cost
  ) ec
  GROUP BY v.organization_id, v.day, v.source
),
order_measures AS (
  SELECT
    organization_id,
    day,
    source,
    COUNT(DISTINCT pack_key)::int AS orders,
    COALESCE(SUM(total_value), 0) AS revenue,
    COALESCE(SUM(item_count), 0)::int AS items,
    COALESCE(SUM(shipping_cost), 0) AS shipping,
    COALESCE(SUM(discount_value), 0) AS discounts,
    COALESCE(SUM(marketplace_fee), 0) AS marketplace_fee,
    COUNT(DISTINCT pack_key) FILTER (WHERE marketplace_fee > 0)::int AS orders_with_fee
  FROM valid_rows
  GROUP BY organization_id, day, source
)
INSERT INTO gold_daily_revenue (
  organization_id, day, source, orders, revenue, items,
  shipping, discounts, marketplace_fee, orders_with_fee,
  item_gross, item_gross_with_cost, item_gross_without_cost, item_cogs,
  orders_with_cost, orders_with_items, gold_updated_at
)
SELECT
  om.organization_id,
  om.day,
  om.source,
  om.orders,
  om.revenue,
  om.items,
  om.shipping,
  om.discounts,
  om.marketplace_fee,
  om.orders_with_fee,
  COALESCE(im.item_gross, 0),
  COALESCE(im.item_gross_with_cost, 0),
  COALESCE(im.item_gross_without_cost, 0),
  COALESCE(im.item_cogs, 0),
  COALESCE(im.orders_with_cost, 0),
  COALESCE(im.orders_with_items, 0),
  now()
FROM order_measures om
LEFT JOIN item_measures im
  ON im.organization_id = om.organization_id AND im.day = om.day AND im.source = om.source
ON CONFLICT (organization_id, day, source) DO UPDATE SET
  orders = EXCLUDED.orders,
  revenue = EXCLUDED.revenue,
  items = EXCLUDED.items,
  shipping = EXCLUDED.shipping,
  discounts = EXCLUDED.discounts,
  marketplace_fee = EXCLUDED.marketplace_fee,
  orders_with_fee = EXCLUDED.orders_with_fee,
  item_gross = EXCLUDED.item_gross,
  item_gross_with_cost = EXCLUDED.item_gross_with_cost,
  item_gross_without_cost = EXCLUDED.item_gross_without_cost,
  item_cogs = EXCLUDED.item_cogs,
  orders_with_cost = EXCLUDED.orders_with_cost,
  orders_with_items = EXCLUDED.orders_with_items,
  gold_updated_at = now();
```

## 5) PARIDAD (correr después del backfill — esperado: diff = 0 en todas las orgs)

Compara Gold contra su fuente (silver_orders + order_items) con la misma lógica.
Freshness: si entra una venta entre backfill y paridad, puede dar ±1 en la org
más movida (Arredo) — re-correr el paso 3/4 y repetir si pasa.

### 5a) gold_product_sales vs fuente

```sql
WITH bad_packs AS (
  SELECT DISTINCT s.organization_id, COALESCE(s.pack_id, s.external_id) AS pack_key
  FROM silver_orders s
  WHERE s.status IN ('CANCELLED', 'PENDING', 'RETURNED')
),
src AS (
  SELECT s.organization_id,
    SUM(oi.quantity)::bigint AS units,
    SUM(oi."totalPrice") AS revenue
  FROM silver_orders s
  JOIN order_items oi ON oi."orderId" = s.id
  WHERE s.status NOT IN ('CANCELLED', 'PENDING', 'RETURNED')
    AND oi."productId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM bad_packs b
      WHERE b.organization_id = s.organization_id
        AND b.pack_key = COALESCE(s.pack_id, s.external_id)
    )
  GROUP BY 1
),
gold AS (
  SELECT organization_id, SUM(units)::bigint AS units, SUM(revenue) AS revenue
  FROM gold_product_sales
  GROUP BY 1
)
SELECT COALESCE(src.organization_id, gold.organization_id) AS org,
  src.units AS src_units, gold.units AS gold_units,
  src.units - gold.units AS units_diff,
  ROUND(src.revenue - gold.revenue, 2) AS revenue_diff
FROM src FULL OUTER JOIN gold USING (organization_id)
ORDER BY org;
```

### 5b) medidas de profitability (gold_daily_revenue) vs la query Bronze de metrics/orders

```sql
WITH bad_packs AS (
  SELECT DISTINCT s.organization_id, COALESCE(s.pack_id, s.external_id) AS pack_key
  FROM silver_orders s
  WHERE s.status IN ('CANCELLED', 'PENDING', 'RETURNED')
),
sku_costs AS (
  SELECT "organizationId" AS organization_id, sku, MAX("costPrice") AS cost
  FROM products
  WHERE sku IS NOT NULL AND sku != '' AND "costPrice" IS NOT NULL AND "costPrice" > 0
  GROUP BY 1, 2
),
src AS (
  SELECT s.organization_id,
    SUM(oi."totalPrice") AS item_gross,
    SUM(oi.quantity * COALESCE(oi."costPrice", p."costPrice", sc.cost))
      FILTER (WHERE COALESCE(oi."costPrice", p."costPrice", sc.cost) > 0) AS item_cogs
  FROM silver_orders s
  JOIN order_items oi ON oi."orderId" = s.id
  LEFT JOIN products p ON p.id = oi."productId"
  LEFT JOIN sku_costs sc ON sc.organization_id = s.organization_id AND sc.sku = p.sku
  WHERE s.status NOT IN ('CANCELLED', 'PENDING', 'RETURNED')
    AND NOT EXISTS (
      SELECT 1 FROM bad_packs b
      WHERE b.organization_id = s.organization_id
        AND b.pack_key = COALESCE(s.pack_id, s.external_id)
    )
  GROUP BY 1
),
gold AS (
  SELECT organization_id, SUM(item_gross) AS item_gross, SUM(item_cogs) AS item_cogs
  FROM gold_daily_revenue
  GROUP BY 1
)
SELECT COALESCE(src.organization_id, gold.organization_id) AS org,
  ROUND(src.item_gross - gold.item_gross, 2) AS gross_diff,
  ROUND(COALESCE(src.item_cogs, 0) - gold.item_cogs, 2) AS cogs_diff
FROM src FULL OUTER JOIN gold USING (organization_id)
ORDER BY org;
```

## 6) Después de la paridad

Nada que activar: `ORDERS_USE_GOLD=true` ya está en Vercel — topProducts y
profitability empiezan a leer Gold apenas el deploy del código esté afuera y
las tablas existan. El cron `refresh-gold-daily-revenue` (cada 30 min) ya
refresca las dos tablas (se le agregó gold_product_sales).

**Nota de semántica (documentada en el transform):** el costo "hermano por SKU"
se resuelve con `MAX(costPrice)` por (org, sku) — determinista — en vez del
`LIMIT 1` sin ORDER BY del Bronze (no determinista). Si un mismo SKU tiene 2+
costos distintos > 0, profitability puede diferir marginalmente del Bronze
viejo. Es una mejora, no un bug.
