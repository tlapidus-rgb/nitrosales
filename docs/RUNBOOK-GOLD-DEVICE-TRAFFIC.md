# Runbook — tanda 5c: device + traffic (últimas dims de metrics/orders)

> Correr en Neon, en orden. Idempotente. SQL generado de los builders.
> ORDERS_USE_GOLD ya está on → al terminar, segByDevice/segByTraffic leen Gold.
>
> Qué hace: enriquece silver_orders con device_enriched/traffic_enriched
> (el COALESCE contra pixel que antes hacía el endpoint en cada request) y
> agrega las dims 'device' y 'traffic' a gold_order_segments.

## 1) ALTER silver_orders

```sql
ALTER TABLE silver_orders
  ADD COLUMN IF NOT EXISTS device_enriched  text,
  ADD COLUMN IF NOT EXISTS traffic_enriched text;
```

```

## 2) RE-BACKFILL silver_orders (llena device_enriched/traffic_enriched)

```sql
-- OJO: tarda más que antes (el LATERAL busca la atribución de cada orden).
INSERT INTO silver_orders (
  id, organization_id, external_id, order_date, status, total_value, currency,
  item_count, pack_id, source, channel, traffic_source, device_type, customer_id,
  shipping_cost, discount_value, marketplace_fee,
  real_shipping_cost, delivery_type, shipping_carrier, payment_method,
  device_enriched, traffic_enriched,
  is_valid, is_web, is_marketplace, silver_updated_at
)
SELECT
  o.id, o."organizationId", o."externalId", o."orderDate", o.status::text, o."totalValue", o.currency,
  o."itemCount", o."packId", o.source, o.channel, o."trafficSource", o."deviceType", o."customerId",
  o."shippingCost", o."discountValue", o."marketplaceFee",
  o."realShippingCost", o."deliveryType", o."shippingCarrier", o."paymentMethod",
  -- Enriquecimiento desde NitroPixel (tanda 5c). Espejo EXACTO del COALESCE que
  -- hacían segByDevice/segByTraffic en metrics/orders. La atribución elegida es la
  -- más reciente (igual que el DISTINCT ON ... ORDER BY pa."createdAt" DESC del
  -- Bronze); da igual cuál, los touchpoints son model-independientes.
  COALESCE(o."deviceType", pv."deviceTypes"[1]) AS device_enriched,
  COALESCE(o."trafficSource", att.touchpoints::jsonb->0->>'source') AS traffic_enriched,
  ("o".status NOT IN ('CANCELLED', 'PENDING', 'RETURNED') AND "o"."totalValue" > 0) AS is_valid,
  ("o"."trafficSource" IS DISTINCT FROM 'Marketplace' AND "o".source IS DISTINCT FROM 'MELI' AND "o".channel IS DISTINCT FROM 'marketplace' AND "o"."externalId" NOT LIKE 'FVG-%' AND "o"."externalId" NOT LIKE 'BPR-%') AS is_web,
  (NOT ("o"."trafficSource" IS DISTINCT FROM 'Marketplace' AND "o".source IS DISTINCT FROM 'MELI' AND "o".channel IS DISTINCT FROM 'marketplace' AND "o"."externalId" NOT LIKE 'FVG-%' AND "o"."externalId" NOT LIKE 'BPR-%')) AS is_marketplace,
  now()
FROM orders o
LEFT JOIN LATERAL (
  SELECT pa."visitorId", pa.touchpoints
  FROM pixel_attributions pa
  WHERE pa."orderId" = o.id
  ORDER BY pa."createdAt" DESC
  LIMIT 1
) att ON true
LEFT JOIN pixel_visitors pv ON pv.id = att."visitorId"
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  total_value = EXCLUDED.total_value,
  currency = EXCLUDED.currency,
  item_count = EXCLUDED.item_count,
  channel = EXCLUDED.channel,
  traffic_source = EXCLUDED.traffic_source,
  device_type = EXCLUDED.device_type,
  customer_id = EXCLUDED.customer_id,
  shipping_cost = EXCLUDED.shipping_cost,
  discount_value = EXCLUDED.discount_value,
  marketplace_fee = EXCLUDED.marketplace_fee,
  real_shipping_cost = EXCLUDED.real_shipping_cost,
  delivery_type = EXCLUDED.delivery_type,
  shipping_carrier = EXCLUDED.shipping_carrier,
  payment_method = EXCLUDED.payment_method,
  device_enriched = EXCLUDED.device_enriched,
  traffic_enriched = EXCLUDED.traffic_enriched,
  is_valid = EXCLUDED.is_valid,
  is_web = EXCLUDED.is_web,
  is_marketplace = EXCLUDED.is_marketplace,
  silver_updated_at = now();

```

## 3) RE-BACKFILL gold_order_segments (agrega dims device + traffic)

```sql
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
    COALESCE(s.device_enriched, 'Sin dato') AS device_bucket,
    COALESCE(s.traffic_enriched, 'Sin dato') AS traffic_bucket,
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
  UNION ALL
  SELECT organization_id, day, source, 'device'   AS dimension, device_bucket   AS bucket, pack_key, total_value, shipping_cost, real_shipping_cost FROM valid_rows
  UNION ALL
  SELECT organization_id, day, source, 'traffic'  AS dimension, traffic_bucket  AS bucket, pack_key, total_value, shipping_cost, real_shipping_cost FROM valid_rows
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
```

## 4) PARIDAD device vs Bronze (esperado: sin filas)

```sql
WITH bad_packs AS (
  SELECT DISTINCT s.organization_id, COALESCE(s.pack_id, s.external_id) AS pack_key
  FROM silver_orders s WHERE s.status IN ('CANCELLED','PENDING','RETURNED')
),
src AS (
  SELECT s.organization_id, COALESCE(s.device_enriched,'Sin dato') AS bucket,
    COUNT(DISTINCT COALESCE(s.pack_id, s.external_id))::bigint AS orders
  FROM silver_orders s
  WHERE s.status NOT IN ('CANCELLED','PENDING','RETURNED')
    AND NOT EXISTS (SELECT 1 FROM bad_packs b
      WHERE b.organization_id = s.organization_id AND b.pack_key = COALESCE(s.pack_id, s.external_id))
  GROUP BY 1,2
),
gold AS (
  SELECT organization_id, bucket, SUM(orders)::bigint AS orders
  FROM gold_order_segments WHERE dimension = 'device' GROUP BY 1,2
)
SELECT COALESCE(s.organization_id,g.organization_id) AS org,
  COALESCE(s.bucket,g.bucket) AS bucket,
  COALESCE(s.orders,0) - COALESCE(g.orders,0) AS orders_diff
FROM src s FULL OUTER JOIN gold g USING (organization_id, bucket)
WHERE COALESCE(s.orders,0) <> COALESCE(g.orders,0)
ORDER BY 1,2;
```

Repetí cambiando `device_enriched`→`traffic_enriched` y `'device'`→`'traffic'` para la otra dim.

## 5) INVARIANTE (revenue idéntico entre las 6 dims por org)

```sql
SELECT organization_id, dimension, SUM(revenue) AS revenue
FROM gold_order_segments GROUP BY 1,2 ORDER BY 1,2;
```

Las 6 dims (channel/delivery/carrier/payment/device/traffic) deben dar el MISMO
revenue por org — todas particionan las mismas órdenes válidas.

## 6) Después
El cron de Silver refresca device/traffic enriquecidos; el de Gold rearma las dims.
segByDevice/segByTraffic leen Gold con ORDERS_USE_GOLD (fallback Bronze si hay
filtro de source). Con esto metrics/orders queda 100% en Gold salvo recentOrders/
dayOfWeek/hour/status (livianas).
