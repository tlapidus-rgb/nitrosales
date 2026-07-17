# Runbook — tanda 4: payment + source en gold_order_segments

> **Correr en Neon (prod) DESPUÉS del deploy de esta tanda, en este orden.**
> El paso 2 va en UNA transacción (los charts nunca ven la tabla vacía).
> Backfill generado desde el builder (`gold-order-segments-transform.ts`).
>
> Contexto: topPaymentMethods (payment × source) migra a Gold. El grain de
> gold_order_segments pasa de (org, day, dimension, bucket) a
> (org, day, SOURCE, dimension, bucket). Las lecturas de channel/delivery/
> carrier no cambian (agregan por bucket). Entre el deploy y este runbook,
> payment usa el fallback Bronze (lectura Gold vacía → Bronze) y el cron de
> segments falla resiliente (queda stale unos minutos) — cero impacto visible.

## 1) Silver: columna payment_method + fill

```sql
ALTER TABLE silver_orders ADD COLUMN IF NOT EXISTS payment_method text;

UPDATE silver_orders s
SET payment_method = o."paymentMethod"
FROM orders o
WHERE o.id = s.id
  AND o."paymentMethod" IS NOT NULL;
```

## 2) Gold: nuevo grain + re-backfill — TODO EN UNA TRANSACCIÓN

```sql
BEGIN;

ALTER TABLE gold_order_segments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'VTEX';
TRUNCATE gold_order_segments;
ALTER TABLE gold_order_segments DROP CONSTRAINT gold_order_segments_pkey;
ALTER TABLE gold_order_segments ADD PRIMARY KEY (organization_id, day, source, dimension, bucket);
ALTER TABLE gold_order_segments ALTER COLUMN source DROP DEFAULT;

WITH bad_packs AS (
  SELECT DISTINCT s.organization_id, COALESCE(s.pack_id, s.external_id) AS pack_key
  FROM silver_orders s
  WHERE s.status IN ('CANCELLED', 'PENDING', 'RETURNED')
),
valid_rows AS (
  SELECT
    s.organization_id,
    (s.order_date AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS day,
    s.source,
    COALESCE(s.channel, 'Sin dato') AS channel_bucket,
    COALESCE(s.delivery_type, 'Sin dato') AS delivery_bucket,
    COALESCE(s.shipping_carrier, 'Sin dato') AS carrier_bucket,
    COALESCE(s.payment_method, 'Sin dato') AS payment_bucket,
    COALESCE(s.pack_id, s.external_id) AS pack_key,
    s.total_value,
    s.shipping_cost,
    s.real_shipping_cost
  FROM silver_orders s
  WHERE s.status NOT IN ('CANCELLED', 'PENDING', 'RETURNED')
    AND NOT EXISTS (
      SELECT 1 FROM bad_packs b
      WHERE b.organization_id = s.organization_id
        AND b.pack_key = COALESCE(s.pack_id, s.external_id)
    )
),
seg AS (
  SELECT organization_id, day, source, 'channel'  AS dimension, channel_bucket  AS bucket, pack_key, total_value, shipping_cost, real_shipping_cost FROM valid_rows
  UNION ALL
  SELECT organization_id, day, source, 'delivery' AS dimension, delivery_bucket AS bucket, pack_key, total_value, shipping_cost, real_shipping_cost FROM valid_rows
  UNION ALL
  SELECT organization_id, day, source, 'carrier'  AS dimension, carrier_bucket  AS bucket, pack_key, total_value, shipping_cost, real_shipping_cost FROM valid_rows
  UNION ALL
  SELECT organization_id, day, source, 'payment'  AS dimension, payment_bucket  AS bucket, pack_key, total_value, shipping_cost, real_shipping_cost FROM valid_rows
)
INSERT INTO gold_order_segments (organization_id, day, source, dimension, bucket, orders, revenue, shipping_charged, shipping_real, gold_updated_at)
SELECT
  organization_id,
  day,
  source,
  dimension,
  bucket,
  COUNT(DISTINCT pack_key)::int AS orders,
  COALESCE(SUM(total_value), 0) AS revenue,
  COALESCE(SUM(shipping_cost), 0) AS shipping_charged,
  COALESCE(SUM(real_shipping_cost), 0) AS shipping_real,
  now()
FROM seg
GROUP BY organization_id, day, source, dimension, bucket
ON CONFLICT (organization_id, day, source, dimension, bucket) DO UPDATE SET
  orders = EXCLUDED.orders,
  revenue = EXCLUDED.revenue,
  shipping_charged = EXCLUDED.shipping_charged,
  shipping_real = EXCLUDED.shipping_real,
  gold_updated_at = now();

COMMIT;
```

## 3) PARIDAD payment vs fuente (esperado: 0 buckets con diff, revenue_abs_diff = 0)

```sql
WITH bad_packs AS (
  SELECT DISTINCT s.organization_id, COALESCE(s.pack_id, s.external_id) AS pack_key
  FROM silver_orders s
  WHERE s.status IN ('CANCELLED', 'PENDING', 'RETURNED')
),
src AS (
  SELECT s.organization_id,
    COALESCE(s.payment_method, 'Sin dato') AS bucket,
    s.source,
    COUNT(DISTINCT COALESCE(s.pack_id, s.external_id))::int AS orders,
    COALESCE(SUM(s.total_value), 0) AS revenue
  FROM silver_orders s
  WHERE s.status NOT IN ('CANCELLED', 'PENDING', 'RETURNED')
    AND NOT EXISTS (
      SELECT 1 FROM bad_packs b
      WHERE b.organization_id = s.organization_id
        AND b.pack_key = COALESCE(s.pack_id, s.external_id)
    )
  GROUP BY 1, 2, 3
),
gold AS (
  SELECT organization_id, bucket, source,
    SUM(orders)::int AS orders, SUM(revenue) AS revenue
  FROM gold_order_segments
  WHERE dimension = 'payment'
  GROUP BY 1, 2, 3
)
SELECT COALESCE(s.organization_id, g.organization_id) AS org,
  COUNT(*) AS buckets,
  COUNT(*) FILTER (WHERE s.orders IS DISTINCT FROM g.orders) AS buckets_con_diff,
  COALESCE(SUM(ABS(COALESCE(s.revenue, 0) - COALESCE(g.revenue, 0))), 0) AS revenue_abs_diff
FROM src s
FULL OUTER JOIN gold g USING (organization_id, bucket, source)
GROUP BY 1 ORDER BY 1;
```

## 4) Invariante de las 4 dimensiones (revenue idéntico entre dims por org)

Cada dimensión particiona las MISMAS órdenes válidas → el revenue por org debe
ser igual en channel, delivery, carrier y payment:

```sql
SELECT organization_id, dimension, SUM(revenue) AS revenue
FROM gold_order_segments
GROUP BY 1, 2
ORDER BY 1, 2;
```

## 5) Después

Nada que activar: con `ORDERS_USE_GOLD=true`, payment lee Gold apenas haya
filas (el fallback por-vacío deja de dispararse) y channel/delivery/carrier
siguen leyendo igual que siempre. El cron vuelve a refrescar los segments en
la próxima corrida (cada 30 min).
