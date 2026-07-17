# Runbook — tanda 3: silver_customer_firsts (cohorts sin LATERAL)

> **Correr en Neon (prod), en este orden.** Idempotente. El backfill está
> generado desde el builder (`silver-customer-firsts-transform.ts`).
>
> Contexto: la query de cohorts de `metrics/orders` corre un MIN(orderDate)
> correlacionado POR CLIENTE sobre toda la historia, en CADA request. Esta dim
> lo precomputa; la query pasa a un JOIN simple (detrás de `ORDERS_USE_GOLD`,
> fallback al LATERAL intacto).

## 1) CREATE silver_customer_firsts

```sql
CREATE TABLE IF NOT EXISTS silver_customer_firsts (
  organization_id   text        NOT NULL,
  customer_id       text        NOT NULL,
  first_order_date  timestamptz NOT NULL,
  silver_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, customer_id)
);
```

## 2) BACKFILL (toda la historia, todas las orgs)

```sql
INSERT INTO silver_customer_firsts (
  organization_id, customer_id, first_order_date, silver_updated_at
)
SELECT
  s.organization_id,
  s.customer_id,
  MIN(s.order_date) AS first_order_date,
  now()
FROM silver_orders s
WHERE s.customer_id IS NOT NULL
GROUP BY s.organization_id, s.customer_id
ON CONFLICT (organization_id, customer_id) DO UPDATE SET
  first_order_date = LEAST(silver_customer_firsts.first_order_date, EXCLUDED.first_order_date),
  silver_updated_at = now();
```

## 3) PARIDAD vs Bronze (la fuente de verdad del LATERAL) — esperado: 0 y 0

```sql
WITH src AS (
  SELECT "organizationId" AS organization_id, "customerId" AS customer_id,
         MIN("orderDate") AS first_date
  FROM orders
  WHERE "customerId" IS NOT NULL
  GROUP BY 1, 2
)
SELECT s.organization_id AS org,
  COUNT(*) AS clientes,
  COUNT(*) FILTER (WHERE d.customer_id IS NULL) AS faltan_en_dim,
  COUNT(*) FILTER (WHERE d.first_order_date IS DISTINCT FROM s.first_date) AS fechas_distintas
FROM src s
LEFT JOIN silver_customer_firsts d
  ON d.organization_id = s.organization_id AND d.customer_id = s.customer_id
GROUP BY 1 ORDER BY 1;
```

## 4) Después

Nada que activar: el cron `refresh-silver-orders` (cada 30 min) ya upsertea la
dim después de Silver (resiliente: si la tabla no existía, era no-op). Con
`ORDERS_USE_GOLD=true` ya activo, cohorts pasa al JOIN apenas deploye el código.

Nota: `fechas_distintas` compara contra Bronze directo. Si da >0 en la org más
movida, puede ser freshness de silver_orders (≤30 min) — repetir. La dim NO
filtra por status (igual que el LATERAL: una orden cancelada también marca la
primera compra).
