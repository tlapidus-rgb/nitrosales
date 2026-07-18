# Runbook — tanda 5: gold_attribution_source (metrics/pixel)

> **Correr en Neon (prod), en este orden.** Idempotente. Backfill generado del
> builder (gold-attribution-source-transform.ts). Money-path: verificar paridad
> ANTES de migrar el serve (el serve va en un commit aparte, detrás de
> PIXEL_USE_GOLD, cuando la paridad de acá dé 0).
>
> Contexto: /api/metrics/pixel = 14-25s en Arredo. Las 4 queries con JSONB
> (#9 by-source, #20 day×source, #22 channel roles, #29 model×channel) desanidan
> pa.touchpoints en cada request. Este rollup las precalcula.

## 1) CREATE gold_attribution_source

```sql
CREATE TABLE IF NOT EXISTS gold_attribution_source (
  organization_id text          NOT NULL,
  day             date          NOT NULL,   -- día AR de la ORDEN (orderDate)
  source          text          NOT NULL,   -- bucket canónico del touchpoint
  orders          integer       NOT NULL,   -- COUNT(DISTINCT orderId) con este source
  -- Componentes de revenue por rol del touchpoint (SIN ponderar) --
  last_click_revenue  numeric(14,2) NOT NULL DEFAULT 0,  -- valor si source = último touch
  first_click_revenue numeric(14,2) NOT NULL DEFAULT 0,  -- valor si source = primer touch
  linear_revenue      numeric(14,2) NOT NULL DEFAULT 0,  -- SUM(attributedValue / touchpointCount)
  nitro_single        numeric(14,2) NOT NULL DEFAULT 0,  -- n=1
  nitro_first2        numeric(14,2) NOT NULL DEFAULT 0,  -- n=2, primer touch
  nitro_last2         numeric(14,2) NOT NULL DEFAULT 0,  -- n=2, último touch
  nitro_first_n       numeric(14,2) NOT NULL DEFAULT 0,  -- n>=3, primer touch
  nitro_last_n        numeric(14,2) NOT NULL DEFAULT 0,  -- n>=3, último touch
  nitro_middle_n      numeric(14,2) NOT NULL DEFAULT 0,  -- n>=3, intermedios (ya / (n-2))
  -- Conteos de rol por source (para "channel roles", query #22) --
  first_touch_count   integer       NOT NULL DEFAULT 0,  -- tp_ord = 1 (incluye solo-touch)
  assist_touch_count  integer       NOT NULL DEFAULT 0,  -- 1 < tp_ord < n
  last_touch_count    integer       NOT NULL DEFAULT 0,  -- tp_ord = n AND n > 1
  solo_touch_count    integer       NOT NULL DEFAULT 0,  -- n = 1 (journey de un solo touch)
  gold_updated_at timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, day, source)
);

CREATE INDEX IF NOT EXISTS idx_gold_attribution_source_org_day
  ON gold_attribution_source (organization_id, day);
```

## 2) BACKFILL (toda la historia)

```sql
WITH canon AS (
  -- Una fila canónica por orden (componentes model-independientes).
  SELECT DISTINCT ON (pa."orderId")
    o."organizationId" AS organization_id,
    (o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS day,
    pa."orderId" AS order_id,
    pa."attributedValue" AS v,
    pa."touchpointCount" AS n,
    pa.touchpoints AS touchpoints
  FROM pixel_attributions pa
  JOIN orders o ON o.id = pa."orderId"
  WHERE pa."organizationId" IS NOT NULL
    AND "o".status NOT IN ('CANCELLED', 'PENDING', 'RETURNED') AND "o"."totalValue" > 0 AND "o"."trafficSource" IS DISTINCT FROM 'Marketplace' AND "o".source IS DISTINCT FROM 'MELI' AND "o".channel IS DISTINCT FROM 'marketplace' AND "o"."externalId" NOT LIKE 'FVG-%' AND "o"."externalId" NOT LIKE 'BPR-%'
    AND o."totalValue" > 0
    AND pa.touchpoints IS NOT NULL
  ORDER BY pa."orderId", pa.model
),
exploded AS (
  SELECT
    c.organization_id,
    c.day,
    CASE
    WHEN LOWER(COALESCE(tp->>'medium','')) IN ('organic','social','referral')
      AND LOWER(COALESCE(tp->>'source','direct')) IN ('google','bing','yahoo','duckduckgo')
    THEN LOWER(COALESCE(tp->>'source','direct')) || '_organic'
    ELSE LOWER(COALESCE(tp->>'source', 'direct'))
  END AS source,
    c.order_id,
    c.v,
    c.n,
    tp_ord
  FROM canon c
  , jsonb_array_elements(c.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
)
INSERT INTO gold_attribution_source (
  organization_id, day, source, orders,
  last_click_revenue, first_click_revenue, linear_revenue,
  nitro_single, nitro_first2, nitro_last2, nitro_first_n, nitro_last_n, nitro_middle_n,
  first_touch_count, assist_touch_count, last_touch_count, solo_touch_count, gold_updated_at
)
SELECT
  organization_id,
  day,
  source,
  COUNT(DISTINCT order_id)::int AS orders,
  COALESCE(SUM(CASE WHEN tp_ord = n THEN v ELSE 0 END), 0) AS last_click_revenue,
  COALESCE(SUM(CASE WHEN tp_ord = 1 THEN v ELSE 0 END), 0) AS first_click_revenue,
  COALESCE(SUM(v / GREATEST(n, 1)), 0) AS linear_revenue,
  COALESCE(SUM(CASE WHEN n = 1 THEN v ELSE 0 END), 0) AS nitro_single,
  COALESCE(SUM(CASE WHEN n = 2 AND tp_ord = 1 THEN v ELSE 0 END), 0) AS nitro_first2,
  COALESCE(SUM(CASE WHEN n = 2 AND tp_ord = 2 THEN v ELSE 0 END), 0) AS nitro_last2,
  COALESCE(SUM(CASE WHEN n >= 3 AND tp_ord = 1 THEN v ELSE 0 END), 0) AS nitro_first_n,
  COALESCE(SUM(CASE WHEN n >= 3 AND tp_ord = n THEN v ELSE 0 END), 0) AS nitro_last_n,
  COALESCE(SUM(CASE WHEN n >= 3 AND tp_ord > 1 AND tp_ord < n THEN v / (n - 2) ELSE 0 END), 0) AS nitro_middle_n,
  COUNT(*) FILTER (WHERE tp_ord = 1)::int AS first_touch_count,
  COUNT(*) FILTER (WHERE tp_ord > 1 AND tp_ord < n)::int AS assist_touch_count,
  COUNT(*) FILTER (WHERE tp_ord = n AND n > 1)::int AS last_touch_count,
  COUNT(*) FILTER (WHERE n = 1)::int AS solo_touch_count,
  now()
FROM exploded
GROUP BY organization_id, day, source
ON CONFLICT (organization_id, day, source) DO UPDATE SET
  orders = EXCLUDED.orders,
  last_click_revenue = EXCLUDED.last_click_revenue,
  first_click_revenue = EXCLUDED.first_click_revenue,
  linear_revenue = EXCLUDED.linear_revenue,
  nitro_single = EXCLUDED.nitro_single,
  nitro_first2 = EXCLUDED.nitro_first2,
  nitro_last2 = EXCLUDED.nitro_last2,
  nitro_first_n = EXCLUDED.nitro_first_n,
  nitro_last_n = EXCLUDED.nitro_last_n,
  nitro_middle_n = EXCLUDED.nitro_middle_n,
  first_touch_count = EXCLUDED.first_touch_count,
  assist_touch_count = EXCLUDED.assist_touch_count,
  last_touch_count = EXCLUDED.last_touch_count,
  solo_touch_count = EXCLUDED.solo_touch_count,
  gold_updated_at = now();
```

## 3) PARIDAD — reconstruye del rollup y compara contra Bronze

Poné los pesos NITRO reales de Arredo en `w(first,middle,last)`. Si la org usa
NITRO por default y pesos 30/30/40, ya están puestos. Esperado: diff ~0 (el
outlier de touchpoints 1/25121 puede dar centavos).

### 3a) #9 — revenue por source, modelo NITRO (el más visible)

```sql
WITH w AS (SELECT 30::numeric AS f, 30::numeric AS m, 40::numeric AS l),
gold AS (
  SELECT g.source,
    SUM(g.nitro_single
        + g.nitro_first2 * w.f / NULLIF(w.f + w.l, 0)
        + g.nitro_last2  * w.l / NULLIF(w.f + w.l, 0)
        + g.nitro_first_n * w.f / 100
        + g.nitro_last_n  * w.l / 100
        + g.nitro_middle_n * w.m / 100) AS revenue
  FROM gold_attribution_source g, w
  WHERE g.organization_id = 'cmohl80fx009j1sdusurp7fbj'
  GROUP BY g.source
),
bronze AS (
  SELECT
    CASE
      WHEN LOWER(COALESCE(tp->>'medium','')) IN ('organic','social','referral')
        AND LOWER(COALESCE(tp->>'source','direct')) IN ('google','bing','yahoo','duckduckgo')
      THEN LOWER(COALESCE(tp->>'source','direct')) || '_organic'
      ELSE LOWER(COALESCE(tp->>'source','direct'))
    END AS source,
    SUM(
      CASE
        WHEN pa."touchpointCount" = 1 THEN pa."attributedValue"
        WHEN pa."touchpointCount" = 2 AND tp_ord = 1 THEN pa."attributedValue" * 30.0 / 70.0
        WHEN pa."touchpointCount" = 2 AND tp_ord = 2 THEN pa."attributedValue" * 40.0 / 70.0
        WHEN tp_ord = 1 THEN pa."attributedValue" * 30 / 100.0
        WHEN tp_ord = pa."touchpointCount" THEN pa."attributedValue" * 40 / 100.0
        ELSE pa."attributedValue" * 30 / 100.0 / GREATEST(pa."touchpointCount" - 2, 1)
      END
    ) AS revenue
  FROM pixel_attributions pa
  JOIN orders o ON o.id = pa."orderId"
  , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
  WHERE pa."organizationId" = 'cmohl80fx009j1sdusurp7fbj'
    AND pa.model::text = 'NITRO'
    AND o.status NOT IN ('CANCELLED','RETURNED','PENDING') AND o."totalValue" > 0
    AND o."trafficSource" IS DISTINCT FROM 'Marketplace' AND o.source IS DISTINCT FROM 'MELI'
    AND o.channel IS DISTINCT FROM 'marketplace'
    AND o."externalId" NOT LIKE 'FVG-%' AND o."externalId" NOT LIKE 'BPR-%'
  GROUP BY 1
)
SELECT COALESCE(g.source, b.source) AS source,
  ROUND(g.revenue, 2) AS gold, ROUND(b.revenue, 2) AS bronze,
  ROUND(COALESCE(g.revenue,0) - COALESCE(b.revenue,0), 2) AS diff
FROM gold g FULL OUTER JOIN bronze b USING (source)
WHERE ROUND(ABS(COALESCE(g.revenue,0) - COALESCE(b.revenue,0)), 2) > 0.5
ORDER BY diff;
```

Sin filas (o solo centavos) = paridad OK.

### 3b) #22 — channel roles (conteos de touch, no dependen de pesos)

```sql
WITH gold AS (
  SELECT SUM(first_touch_count) f, SUM(assist_touch_count) a,
         SUM(last_touch_count) l, SUM(solo_touch_count) s
  FROM gold_attribution_source
  WHERE organization_id = 'cmohl80fx009j1sdusurp7fbj'
),
bronze AS (
  SELECT
    COUNT(*) FILTER (WHERE tp_ord = 1) f,
    COUNT(*) FILTER (WHERE tp_ord > 1 AND tp_ord < pa."touchpointCount") a,
    COUNT(*) FILTER (WHERE tp_ord = pa."touchpointCount" AND pa."touchpointCount" > 1) l,
    COUNT(*) FILTER (WHERE pa."touchpointCount" = 1) s
  FROM pixel_attributions pa
  JOIN orders o ON o.id = pa."orderId"
  , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
  WHERE pa."organizationId" = 'cmohl80fx009j1sdusurp7fbj'
    AND pa.model::text = 'NITRO'
    AND o.status NOT IN ('CANCELLED','RETURNED','PENDING') AND o."totalValue" > 0
    AND o."trafficSource" IS DISTINCT FROM 'Marketplace' AND o.source IS DISTINCT FROM 'MELI'
    AND o.channel IS DISTINCT FROM 'marketplace'
    AND o."externalId" NOT LIKE 'FVG-%' AND o."externalId" NOT LIKE 'BPR-%'
)
SELECT gold.f - bronze.f AS first_diff, gold.a - bronze.a AS assist_diff,
       gold.l - bronze.l AS last_diff, gold.s - bronze.s AS solo_diff
FROM gold, bronze;
```

Todo 0 = OK.

## 4) Después de la paridad
Reportá los resultados. Con paridad 0, el commit del serve (migrar #9/#20/#22/#29
a leer el rollup detrás de PIXEL_USE_GOLD) es de bajo riesgo. El cron
refresh-gold-attribution ya lo mantiene fresco (cada 30 min, :20/:50).
