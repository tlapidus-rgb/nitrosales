# Runbook — tanda 5b: gold_customer_daily (top customers de metrics/orders)

> Correr en Neon, en orden. Idempotente. Backfill generado del builder.
> ORDERS_USE_GOLD ya está on → al terminar la paridad, topCustomers lee Gold.

## 1) CREATE
```sql
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
```

## 2) BACKFILL (toda la historia)
```sql
WITH bad_packs AS (
  SELECT DISTINCT s.organization_id, COALESCE(s.pack_id, s.external_id) AS pack_key
  FROM silver_orders s
  WHERE s.status IN ('CANCELLED', 'PENDING', 'RETURNED')
),
valid_orders AS (
  SELECT
    s.organization_id,
    (s.order_date AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS day,
    s.customer_id,
    COALESCE(s.pack_id, s.external_id) AS pack_key,
    s.total_value
  FROM silver_orders s
  WHERE s.status NOT IN ('CANCELLED', 'PENDING', 'RETURNED')
    AND s.customer_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM bad_packs b
      WHERE b.organization_id = s.organization_id
        AND b.pack_key = COALESCE(s.pack_id, s.external_id)
    )
)
INSERT INTO gold_customer_daily (
  organization_id, day, customer_id, orders, revenue, gold_updated_at
)
SELECT
  organization_id,
  day,
  customer_id,
  COUNT(DISTINCT pack_key)::int AS orders,
  COALESCE(SUM(total_value), 0) AS revenue,
  now()
FROM valid_orders
GROUP BY organization_id, day, customer_id
ON CONFLICT (organization_id, day, customer_id) DO UPDATE SET
  orders = EXCLUDED.orders,
  revenue = EXCLUDED.revenue,
  gold_updated_at = now();
```

## 3) PARIDAD vs Bronze (esperado: diff 0; Arredo ±freshness)
```sql
WITH bad_packs AS (
  SELECT DISTINCT s.organization_id, COALESCE(s.pack_id, s.external_id) AS pack_key
  FROM silver_orders s WHERE s.status IN ('CANCELLED','PENDING','RETURNED')
),
src AS (
  SELECT s.organization_id,
    COUNT(DISTINCT COALESCE(s.pack_id, s.external_id))::bigint AS orders,
    SUM(s.total_value) AS revenue
  FROM silver_orders s
  WHERE s.status NOT IN ('CANCELLED','PENDING','RETURNED')
    AND s.customer_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM bad_packs b
      WHERE b.organization_id = s.organization_id AND b.pack_key = COALESCE(s.pack_id, s.external_id))
  GROUP BY 1
),
gold AS (
  SELECT organization_id, SUM(orders)::bigint AS orders, SUM(revenue) AS revenue
  FROM gold_customer_daily GROUP BY 1
)
SELECT COALESCE(s.organization_id, g.organization_id) AS org,
  s.orders - g.orders AS orders_diff,
  ROUND(COALESCE(s.revenue,0) - COALESCE(g.revenue,0), 2) AS revenue_diff
FROM src s FULL OUTER JOIN gold g USING (organization_id) ORDER BY 1;
```

## 4) Después
El cron refresh-gold-daily-revenue ya refresca gold_customer_daily (junto con
daily/segments/product). topCustomers lee Gold con ORDERS_USE_GOLD (fallback
Bronze si hay filtro de source). Merge tras paridad 0.
