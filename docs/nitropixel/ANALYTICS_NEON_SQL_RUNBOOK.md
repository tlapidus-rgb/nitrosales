# NitroPixel Analytics — Neon SQL Runbook

> **Status:** Ready to execute (preview Neon branch only)  
> **Last updated:** 2026-06-14  
> **Related:** [`ANALYTICS.md`](./ANALYTICS.md), [`ANALYTICS_MIGRATION_PLAN.md`](./ANALYTICS_MIGRATION_PLAN.md)

Step-by-step guide to prototype the Phase 1 analytics warehouse in the **Neon SQL editor** on a **preview branch**, validate numbers, then proceed to TypeScript in small pushes.

---

## Scope: one org now, all orgs later

| Phase | Scope |
|-------|--------|
| **This runbook (Steps 0–10)** | **One pilot org** — all queries filter by `_pilot.org_id` |
| **Warehouse tables** | Shared schema for the whole DB; data rows are per org |
| **Future batch crons** | All organizations (multi-tenant) |
| **API reads** | Always the logged-in org only |

**Production impact:** None while you stay on the **preview Neon branch** and do not merge/deploy analytics code to `main` until sign-off.

---

## Prerequisites

### 1. Confirm Neon branch

In **Neon Console → Branches**, open the SQL editor on your **preview branch** (not production).

### 2. Rollups for funnel columns

Funnel visitor metrics (steps 1–4) need `pixel_daily_aggregates`. If empty, run on **preview Vercel URL** (not SQL):

```text
POST /api/admin/setup-pixel-rollups?phase=schema&key=<ADMIN_API_KEY>
POST /api/admin/setup-pixel-rollups?phase=backfill&from=<90d-ago>&to=<today>&key=<ADMIN_API_KEY>
  → repeat until response has done:true
POST /api/setup/ensure-indexes?key=<ADMIN_API_KEY>
GET  /api/admin/setup-pixel-rollups?phase=status&key=<ADMIN_API_KEY>
```

### 3. Pick pilot org + date window

Use a 7-day AR calendar window where you already validated KPIs in the UI.

---

## Step 0 — Sanity check

```sql
SELECT current_database() AS db_name;

SELECT COUNT(*)::bigint AS orders FROM orders;
SELECT COUNT(*)::bigint AS attributions FROM pixel_attributions;
SELECT COUNT(*)::bigint AS events FROM pixel_events;

SELECT COUNT(*)::bigint AS rollup_days
FROM pixel_daily_aggregates;
```

---

## Step 1 — Pilot constants (run once per session)

Edit `PASTE_ORG_ID_HERE` and dates before running.

```sql
DROP TABLE IF EXISTS _pilot;

CREATE TEMP TABLE _pilot AS
SELECT
  'PASTE_ORG_ID_HERE'::text AS org_id,
  DATE '2026-06-07' AS d_from,   -- 7-day window start (AR calendar)
  DATE '2026-06-13' AS d_to,     -- end (inclusive)
  30::int AS w_first,            -- NITRO weights (defaults; see below)
  40::int AS w_last,
  30::int AS w_middle,
  1::int AS attribution_config_version;

SELECT * FROM _pilot;
```

**Find org id:**

```sql
SELECT id, name, slug
FROM organizations
ORDER BY "createdAt" DESC
LIMIT 20;
```

**Load NITRO weights from org settings (optional):**

```sql
SELECT
  (settings->'nitroWeights'->>'first')::int AS w_first,
  (settings->'nitroWeights'->>'last')::int AS w_last,
  (settings->'nitroWeights'->>'middle')::int AS w_middle
FROM organizations
WHERE id = (SELECT org_id FROM _pilot);
```

If different from 30/40/30, recreate `_pilot` with the correct weights.

---

## Step 2 — Baseline (read-only truth queries)

Save these results — compare against Gold at Step 9.

### 2a — Órdenes Atribuidas + revenue by model (live query #8)

```sql
SELECT
  pa.model::text AS model,
  COUNT(*)::int AS orders_attributed,
  SUM(pa."attributedValue")::float AS pixel_revenue
FROM pixel_attributions pa
JOIN orders o ON o.id = pa."orderId"
CROSS JOIN _pilot p
WHERE pa."organizationId" = p.org_id
  AND o."orderDate" >= p.d_from::timestamptz
  AND o."orderDate" < (p.d_to + 1)::timestamptz
  AND o.status NOT IN ('CANCELLED', 'PENDING', 'RETURNED')
  AND o."totalValue" > 0
  AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
  AND o.source IS DISTINCT FROM 'MELI'
  AND o.channel IS DISTINCT FROM 'marketplace'
  AND o."externalId" NOT LIKE 'FVG-%'
  AND o."externalId" NOT LIKE 'BPR-%'
GROUP BY 1
ORDER BY pixel_revenue DESC;
```

### 2b — Web orders denominator (live query #13)

```sql
SELECT
  COUNT(*) FILTER (
    WHERE o."trafficSource" IS DISTINCT FROM 'Marketplace'
      AND o.source IS DISTINCT FROM 'MELI'
      AND o.channel IS DISTINCT FROM 'marketplace'
      AND o."externalId" NOT LIKE 'FVG-%'
      AND o."externalId" NOT LIKE 'BPR-%'
  )::int AS web_orders,
  COALESCE(SUM(o."totalValue") FILTER (
    WHERE o."trafficSource" IS DISTINCT FROM 'Marketplace'
      AND o.source IS DISTINCT FROM 'MELI'
      AND o.channel IS DISTINCT FROM 'marketplace'
      AND o."externalId" NOT LIKE 'FVG-%'
      AND o."externalId" NOT LIKE 'BPR-%'
  ), 0)::float AS web_revenue
FROM orders o
CROSS JOIN _pilot p
WHERE o."organizationId" = p.org_id
  AND o."orderDate" >= p.d_from::timestamptz
  AND o."orderDate" < (p.d_to + 1)::timestamptz
  AND o.status NOT IN ('CANCELLED', 'PENDING', 'RETURNED')
  AND o."totalValue" > 0;
```

### 2c — Funnel visitors (steps 1–4 from rollups)

```sql
SELECT
  COALESCE(hll_cardinality(hll_union_agg(pv_visitors_hll)), 0)::int AS page_view_visitors,
  COALESCE(hll_cardinality(hll_union_agg(product_visitors_hll)), 0)::int AS view_product_visitors,
  COALESCE(hll_cardinality(hll_union_agg(cart_visitors_hll)), 0)::int AS add_to_cart_visitors,
  COALESCE(hll_cardinality(hll_union_agg(checkout_visitors_hll)), 0)::int AS checkout_visitors
FROM pixel_daily_aggregates pda
CROSS JOIN _pilot p
WHERE pda."organizationId" = p.org_id
  AND pda.day >= p.d_from
  AND pda.day <= p.d_to;
```

### 2d — Ad spend (platform only; manual spend added in TypeScript later)

```sql
SELECT COALESCE(SUM(amd.spend), 0)::float AS total_ad_spend
FROM ad_metrics_daily amd
CROSS JOIN _pilot p
WHERE amd."organizationId" = p.org_id
  AND amd.date >= p.d_from
  AND amd.date <= p.d_to;
```

---

## Step 3 — Create analytics tables (Phase 1 MVP)

```sql
CREATE TABLE IF NOT EXISTS analytics_01_daily_pixel_order_wide (
  "organizationId" text NOT NULL,
  order_id text NOT NULL,
  day date NOT NULL,
  external_id text,
  order_date timestamptz NOT NULL,
  status text NOT NULL,
  total_value numeric(12,2) NOT NULL,
  source text,
  channel text,
  traffic_source text,
  is_valid_order boolean NOT NULL DEFAULT false,
  is_web_order boolean NOT NULL DEFAULT false,
  is_marketplace boolean NOT NULL DEFAULT false,
  is_attributed boolean NOT NULL DEFAULT false,
  customer_id text,
  customer_email text,
  attributed_visitor_id text,
  has_client_purchase_event boolean NOT NULL DEFAULT false,
  purchase_event_count int NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  batch_id text,
  PRIMARY KEY ("organizationId", order_id)
);

CREATE INDEX IF NOT EXISTS idx_a01_order_wide_org_day
  ON analytics_01_daily_pixel_order_wide ("organizationId", day);

CREATE TABLE IF NOT EXISTS analytics_01_daily_pixel_attribution_wide (
  "organizationId" text NOT NULL,
  order_id text NOT NULL,
  model text NOT NULL,
  day date NOT NULL,
  attributed_value numeric(12,2) NOT NULL,
  touchpoint_count int NOT NULL DEFAULT 1,
  conversion_lag int,
  touchpoints jsonb,
  visitor_id text,
  campaign_id text,
  creative_id text,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  batch_id text,
  PRIMARY KEY ("organizationId", order_id, model)
);

CREATE INDEX IF NOT EXISTS idx_a01_attr_wide_org_day_model
  ON analytics_01_daily_pixel_attribution_wide ("organizationId", day, model);

CREATE TABLE IF NOT EXISTS analytics_01_daily_pixel_touchpoint_wide (
  "organizationId" text NOT NULL,
  order_id text NOT NULL,
  model text NOT NULL,
  touchpoint_ord int NOT NULL,
  day date NOT NULL,
  touchpoint_ts timestamptz,
  source text,
  medium text,
  campaign text,
  page text,
  gclid text,
  fbclid text,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  batch_id text,
  PRIMARY KEY ("organizationId", order_id, model, touchpoint_ord)
);

CREATE TABLE IF NOT EXISTS analytics_02_daily_pixel_touchpoint_enriched (
  "organizationId" text NOT NULL,
  order_id text NOT NULL,
  model text NOT NULL,
  touchpoint_ord int NOT NULL,
  day date NOT NULL,
  source_canonical text NOT NULL,
  credit_weight numeric(12,6) NOT NULL DEFAULT 0,
  credited_revenue numeric(12,2) NOT NULL DEFAULT 0,
  is_first_touch boolean NOT NULL DEFAULT false,
  is_last_touch boolean NOT NULL DEFAULT false,
  attribution_config_version int,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  batch_id text,
  PRIMARY KEY ("organizationId", order_id, model, touchpoint_ord)
);

CREATE INDEX IF NOT EXISTS idx_a02_tp_enriched_org_day_model
  ON analytics_02_daily_pixel_touchpoint_enriched ("organizationId", day, model);

CREATE TABLE IF NOT EXISTS analytics_03_daily_pixel_kpi_org (
  "organizationId" text NOT NULL,
  day date NOT NULL,
  model text NOT NULL,
  orders_attributed int NOT NULL DEFAULT 0,
  pixel_revenue numeric(12,2) NOT NULL DEFAULT 0,
  web_orders int NOT NULL DEFAULT 0,
  web_revenue numeric(12,2) NOT NULL DEFAULT 0,
  total_ad_spend numeric(12,2) NOT NULL DEFAULT 0,
  attribution_rate_pct numeric(8,2),
  aov numeric(12,2),
  page_view_visitors int NOT NULL DEFAULT 0,
  view_product_visitors int NOT NULL DEFAULT 0,
  add_to_cart_visitors int NOT NULL DEFAULT 0,
  checkout_visitors int NOT NULL DEFAULT 0,
  purchase_orders int NOT NULL DEFAULT 0,
  attribution_config_version int,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  batch_id text,
  PRIMARY KEY ("organizationId", day, model)
);

CREATE INDEX IF NOT EXISTS idx_a03_kpi_org_org_day_model
  ON analytics_03_daily_pixel_kpi_org ("organizationId", day, model);
```

---

## Step 4 — Build `analytics_01_daily_pixel_order_wide`

```sql
DELETE FROM analytics_01_daily_pixel_order_wide ow
USING _pilot p
WHERE ow."organizationId" = p.org_id
  AND ow.day >= p.d_from
  AND ow.day <= p.d_to;

INSERT INTO analytics_01_daily_pixel_order_wide (
  "organizationId", order_id, day, external_id, order_date, status, total_value,
  source, channel, traffic_source,
  is_valid_order, is_web_order, is_marketplace, is_attributed,
  customer_id, customer_email, attributed_visitor_id,
  has_client_purchase_event, purchase_event_count,
  refreshed_at, batch_id
)
SELECT
  o."organizationId",
  o.id AS order_id,
  (o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS day,
  o."externalId",
  o."orderDate",
  o.status::text,
  o."totalValue",
  o.source,
  o.channel,
  o."trafficSource",
  (o.status NOT IN ('CANCELLED', 'PENDING', 'RETURNED') AND o."totalValue" > 0) AS is_valid_order,
  (
    o."trafficSource" IS DISTINCT FROM 'Marketplace'
    AND o.source IS DISTINCT FROM 'MELI'
    AND o.channel IS DISTINCT FROM 'marketplace'
    AND o."externalId" NOT LIKE 'FVG-%'
    AND o."externalId" NOT LIKE 'BPR-%'
  ) AS is_web_order,
  (
    o."trafficSource" = 'Marketplace'
    OR o.source = 'MELI'
    OR o.channel = 'marketplace'
    OR o."externalId" LIKE 'FVG-%'
    OR o."externalId" LIKE 'BPR-%'
  ) AS is_marketplace,
  EXISTS (
    SELECT 1 FROM pixel_attributions pa
    WHERE pa."orderId" = o.id
      AND pa."organizationId" = o."organizationId"
  ) AS is_attributed,
  o."customerId",
  c.email,
  pa_n."visitorId",
  COALESCE(pe.has_purchase, false),
  COALESCE(pe.purchase_count, 0),
  now(),
  'sql-prototype-v1'
FROM orders o
CROSS JOIN _pilot p
LEFT JOIN customers c ON c.id = o."customerId"
LEFT JOIN pixel_attributions pa_n
  ON pa_n."orderId" = o.id
 AND pa_n."organizationId" = o."organizationId"
 AND pa_n.model::text = 'NITRO'
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE pe.type = 'PURCHASE') > 0 AS has_purchase,
    COUNT(*) FILTER (WHERE pe.type = 'PURCHASE')::int AS purchase_count
  FROM pixel_events pe
  WHERE pe."orderId" = o.id
    AND pe."organizationId" = o."organizationId"
) pe ON true
WHERE o."organizationId" = p.org_id
  AND o."orderDate" >= p.d_from::timestamptz
  AND o."orderDate" < (p.d_to + 1)::timestamptz;

SELECT COUNT(*)::int AS rows_inserted
FROM analytics_01_daily_pixel_order_wide ow
CROSS JOIN _pilot p
WHERE ow."organizationId" = p.org_id
  AND ow.day >= p.d_from AND ow.day <= p.d_to;
```

---

## Step 5 — Build `analytics_01_daily_pixel_attribution_wide`

```sql
DELETE FROM analytics_01_daily_pixel_attribution_wide aw
USING _pilot p
WHERE aw."organizationId" = p.org_id
  AND aw.day >= p.d_from
  AND aw.day <= p.d_to;

INSERT INTO analytics_01_daily_pixel_attribution_wide (
  "organizationId", order_id, model, day,
  attributed_value, touchpoint_count, conversion_lag, touchpoints,
  visitor_id, campaign_id, creative_id,
  refreshed_at, batch_id
)
SELECT
  pa."organizationId",
  pa."orderId",
  pa.model::text,
  (o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS day,
  pa."attributedValue",
  pa."touchpointCount",
  pa."conversionLag",
  pa.touchpoints::jsonb,
  pa."visitorId",
  pa."campaignId",
  pa."creativeId",
  now(),
  'sql-prototype-v1'
FROM pixel_attributions pa
JOIN orders o ON o.id = pa."orderId"
CROSS JOIN _pilot p
WHERE pa."organizationId" = p.org_id
  AND o."orderDate" >= p.d_from::timestamptz
  AND o."orderDate" < (p.d_to + 1)::timestamptz
  AND o.status NOT IN ('CANCELLED', 'PENDING', 'RETURNED')
  AND o."totalValue" > 0
  AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
  AND o.source IS DISTINCT FROM 'MELI'
  AND o.channel IS DISTINCT FROM 'marketplace'
  AND o."externalId" NOT LIKE 'FVG-%'
  AND o."externalId" NOT LIKE 'BPR-%';

SELECT model, COUNT(*)::int AS rows
FROM analytics_01_daily_pixel_attribution_wide aw
CROSS JOIN _pilot p
WHERE aw."organizationId" = p.org_id
  AND aw.day >= p.d_from AND aw.day <= p.d_to
GROUP BY 1
ORDER BY 1;
```

---

## Step 6 — Build `analytics_01_daily_pixel_touchpoint_wide`

```sql
DELETE FROM analytics_01_daily_pixel_touchpoint_wide tw
USING _pilot p
WHERE tw."organizationId" = p.org_id
  AND tw.day >= p.d_from
  AND tw.day <= p.d_to;

INSERT INTO analytics_01_daily_pixel_touchpoint_wide (
  "organizationId", order_id, model, touchpoint_ord, day,
  touchpoint_ts, source, medium, campaign, page, gclid, fbclid,
  refreshed_at, batch_id
)
SELECT
  aw."organizationId",
  aw.order_id,
  aw.model,
  t.tp_ord::int AS touchpoint_ord,
  aw.day,
  NULLIF(tp->>'timestamp', '')::timestamptz AS touchpoint_ts,
  tp->>'source',
  tp->>'medium',
  tp->>'campaign',
  tp->>'page',
  tp->>'gclid',
  tp->>'fbclid',
  now(),
  'sql-prototype-v1'
FROM analytics_01_daily_pixel_attribution_wide aw
CROSS JOIN _pilot p
, jsonb_array_elements(COALESCE(aw.touchpoints, '[]'::jsonb)) WITH ORDINALITY AS t(tp, tp_ord)
WHERE aw."organizationId" = p.org_id
  AND aw.day >= p.d_from
  AND aw.day <= p.d_to;

SELECT COUNT(*)::int AS touchpoint_rows
FROM analytics_01_daily_pixel_touchpoint_wide tw
CROSS JOIN _pilot p
WHERE tw."organizationId" = p.org_id
  AND tw.day >= p.d_from AND tw.day <= p.d_to;
```

---

## Step 7 — Build `analytics_02_daily_pixel_touchpoint_enriched`

Models included: `LAST_CLICK`, `FIRST_CLICK`, `LINEAR`, `NITRO` (`TIME_DECAY` deferred per migration plan §15).

```sql
DELETE FROM analytics_02_daily_pixel_touchpoint_enriched te
USING _pilot p
WHERE te."organizationId" = p.org_id
  AND te.day >= p.d_from
  AND te.day <= p.d_to;

INSERT INTO analytics_02_daily_pixel_touchpoint_enriched (
  "organizationId", order_id, model, touchpoint_ord, day,
  source_canonical, credit_weight, credited_revenue,
  is_first_touch, is_last_touch, attribution_config_version,
  refreshed_at, batch_id
)
SELECT
  tw."organizationId",
  tw.order_id,
  tw.model,
  tw.touchpoint_ord,
  tw.day,
  CASE
    WHEN LOWER(COALESCE(tw.medium, '')) IN ('organic', 'social', 'referral')
     AND LOWER(COALESCE(tw.source, 'direct')) IN ('google', 'bing', 'yahoo', 'duckduckgo')
    THEN LOWER(COALESCE(tw.source, 'direct')) || '_organic'
    ELSE LOWER(COALESCE(tw.source, 'direct'))
  END AS source_canonical,
  CASE tw.model
    WHEN 'LAST_CLICK' THEN
      CASE WHEN tw.touchpoint_ord = aw.touchpoint_count THEN 1.0 ELSE 0.0 END
    WHEN 'FIRST_CLICK' THEN
      CASE WHEN tw.touchpoint_ord = 1 THEN 1.0 ELSE 0.0 END
    WHEN 'LINEAR' THEN
      1.0 / NULLIF(aw.touchpoint_count, 0)
    WHEN 'NITRO' THEN
      CASE
        WHEN aw.touchpoint_count = 1 THEN 1.0
        WHEN aw.touchpoint_count = 2 AND tw.touchpoint_ord = 1
          THEN p.w_first::numeric / NULLIF((p.w_first + p.w_last)::numeric, 0)
        WHEN aw.touchpoint_count = 2 AND tw.touchpoint_ord = 2
          THEN p.w_last::numeric / NULLIF((p.w_first + p.w_last)::numeric, 0)
        WHEN tw.touchpoint_ord = 1 THEN p.w_first / 100.0
        WHEN tw.touchpoint_ord = aw.touchpoint_count THEN p.w_last / 100.0
        ELSE (p.w_middle / 100.0) / GREATEST(aw.touchpoint_count - 2, 1)
      END
    ELSE 0.0
  END AS credit_weight,
  (
    aw.attributed_value * (
      CASE tw.model
        WHEN 'LAST_CLICK' THEN
          CASE WHEN tw.touchpoint_ord = aw.touchpoint_count THEN 1.0 ELSE 0.0 END
        WHEN 'FIRST_CLICK' THEN
          CASE WHEN tw.touchpoint_ord = 1 THEN 1.0 ELSE 0.0 END
        WHEN 'LINEAR' THEN
          1.0 / NULLIF(aw.touchpoint_count, 0)
        WHEN 'NITRO' THEN
          CASE
            WHEN aw.touchpoint_count = 1 THEN 1.0
            WHEN aw.touchpoint_count = 2 AND tw.touchpoint_ord = 1
              THEN p.w_first::numeric / NULLIF((p.w_first + p.w_last)::numeric, 0)
            WHEN aw.touchpoint_count = 2 AND tw.touchpoint_ord = 2
              THEN p.w_last::numeric / NULLIF((p.w_first + p.w_last)::numeric, 0)
            WHEN tw.touchpoint_ord = 1 THEN p.w_first / 100.0
            WHEN tw.touchpoint_ord = aw.touchpoint_count THEN p.w_last / 100.0
            ELSE (p.w_middle / 100.0) / GREATEST(aw.touchpoint_count - 2, 1)
          END
        ELSE 0.0
      END
    )
  )::numeric(12,2) AS credited_revenue,
  (tw.touchpoint_ord = 1) AS is_first_touch,
  (tw.touchpoint_ord = aw.touchpoint_count) AS is_last_touch,
  CASE WHEN tw.model = 'NITRO' THEN p.attribution_config_version ELSE NULL END,
  now(),
  'sql-prototype-v1'
FROM analytics_01_daily_pixel_touchpoint_wide tw
JOIN analytics_01_daily_pixel_attribution_wide aw
  ON aw."organizationId" = tw."organizationId"
 AND aw.order_id = tw.order_id
 AND aw.model = tw.model
CROSS JOIN _pilot p
WHERE tw."organizationId" = p.org_id
  AND tw.day >= p.d_from
  AND tw.day <= p.d_to
  AND tw.model IN ('LAST_CLICK', 'FIRST_CLICK', 'LINEAR', 'NITRO');

SELECT
  aw.model,
  COUNT(DISTINCT aw.order_id)::int AS orders,
  ROUND(SUM(aw.attributed_value)::numeric, 2) AS attr_total,
  ROUND(SUM(te.credited_revenue)::numeric, 2) AS credit_total
FROM analytics_01_daily_pixel_attribution_wide aw
JOIN analytics_02_daily_pixel_touchpoint_enriched te
  ON te."organizationId" = aw."organizationId"
 AND te.order_id = aw.order_id
 AND te.model = aw.model
CROSS JOIN _pilot p
WHERE aw."organizationId" = p.org_id
  AND aw.day >= p.d_from AND aw.day <= p.d_to
GROUP BY 1
ORDER BY 1;
```

---

## Step 8 — Build `analytics_03_daily_pixel_kpi_org` (Gold)

`purchase_orders` = `orders_attributed` (DATA_COHERENCE.md Regla 5 — Compra = Órdenes Atribuidas).

```sql
DELETE FROM analytics_03_daily_pixel_kpi_org k
USING _pilot p
WHERE k."organizationId" = p.org_id
  AND k.day >= p.d_from
  AND k.day <= p.d_to;

INSERT INTO analytics_03_daily_pixel_kpi_org (
  "organizationId", day, model,
  orders_attributed, pixel_revenue,
  web_orders, web_revenue, total_ad_spend,
  attribution_rate_pct, aov,
  page_view_visitors, view_product_visitors, add_to_cart_visitors, checkout_visitors,
  purchase_orders, attribution_config_version,
  refreshed_at, batch_id
)
WITH days AS (
  SELECT generate_series(p.d_from, p.d_to, interval '1 day')::date AS day
  FROM _pilot p
),
models AS (
  SELECT unnest(ARRAY['LAST_CLICK', 'FIRST_CLICK', 'LINEAR', 'NITRO']::text[]) AS model
),
attr AS (
  SELECT
    aw.day,
    aw.model,
    COUNT(*)::int AS orders_attributed,
    COALESCE(SUM(aw.attributed_value), 0)::numeric(12,2) AS pixel_revenue
  FROM analytics_01_daily_pixel_attribution_wide aw
  CROSS JOIN _pilot p
  WHERE aw."organizationId" = p.org_id
    AND aw.day >= p.d_from AND aw.day <= p.d_to
  GROUP BY 1, 2
),
web AS (
  SELECT
    ow.day,
    COUNT(*) FILTER (WHERE ow.is_valid_order AND ow.is_web_order)::int AS web_orders,
    COALESCE(SUM(ow.total_value) FILTER (WHERE ow.is_valid_order AND ow.is_web_order), 0)::numeric(12,2) AS web_revenue
  FROM analytics_01_daily_pixel_order_wide ow
  CROSS JOIN _pilot p
  WHERE ow."organizationId" = p.org_id
    AND ow.day >= p.d_from AND ow.day <= p.d_to
  GROUP BY 1
),
spend AS (
  SELECT
    amd.date AS day,
    COALESCE(SUM(amd.spend), 0)::numeric(12,2) AS total_ad_spend
  FROM ad_metrics_daily amd
  CROSS JOIN _pilot p
  WHERE amd."organizationId" = p.org_id
    AND amd.date >= p.d_from AND amd.date <= p.d_to
  GROUP BY 1
),
funnel AS (
  SELECT
    pda.day,
    COALESCE(hll_cardinality(pda.pv_visitors_hll), 0)::int AS page_view_visitors,
    COALESCE(hll_cardinality(pda.product_visitors_hll), 0)::int AS view_product_visitors,
    COALESCE(hll_cardinality(pda.cart_visitors_hll), 0)::int AS add_to_cart_visitors,
    COALESCE(hll_cardinality(pda.checkout_visitors_hll), 0)::int AS checkout_visitors
  FROM pixel_daily_aggregates pda
  CROSS JOIN _pilot p
  WHERE pda."organizationId" = p.org_id
    AND pda.day >= p.d_from AND pda.day <= p.d_to
)
SELECT
  p.org_id,
  d.day,
  m.model,
  COALESCE(a.orders_attributed, 0),
  COALESCE(a.pixel_revenue, 0),
  COALESCE(w.web_orders, 0),
  COALESCE(w.web_revenue, 0),
  COALESCE(s.total_ad_spend, 0),
  CASE
    WHEN COALESCE(w.web_orders, 0) > 0
    THEN ROUND(100.0 * COALESCE(a.orders_attributed, 0)::numeric / w.web_orders, 2)
    ELSE NULL
  END,
  CASE
    WHEN COALESCE(a.orders_attributed, 0) > 0
    THEN ROUND(COALESCE(a.pixel_revenue, 0) / a.orders_attributed, 2)
    ELSE NULL
  END,
  COALESCE(f.page_view_visitors, 0),
  COALESCE(f.view_product_visitors, 0),
  COALESCE(f.add_to_cart_visitors, 0),
  COALESCE(f.checkout_visitors, 0),
  COALESCE(a.orders_attributed, 0),
  CASE WHEN m.model = 'NITRO' THEN p.attribution_config_version ELSE NULL END,
  now(),
  'sql-prototype-v1'
FROM days d
CROSS JOIN models m
CROSS JOIN _pilot p
LEFT JOIN attr a ON a.day = d.day AND a.model = m.model
LEFT JOIN web w ON w.day = d.day
LEFT JOIN spend s ON s.day = d.day
LEFT JOIN funnel f ON f.day = d.day;
```

---

## Step 9 — Validate Gold vs baseline

### 9a — KPI strip (7-day SUM, NITRO)

Compare with Step 2a (NITRO row), 2b, 2c, 2d.

```sql
SELECT
  SUM(k.orders_attributed)::int AS orders_attributed,
  SUM(k.pixel_revenue)::float AS pixel_revenue,
  SUM(k.web_orders)::int AS web_orders,
  SUM(k.web_revenue)::float AS web_revenue,
  SUM(k.total_ad_spend)::float AS total_ad_spend,
  SUM(k.page_view_visitors)::int AS page_view_visitors,
  SUM(k.view_product_visitors)::int AS view_product_visitors,
  SUM(k.add_to_cart_visitors)::int AS add_to_cart_visitors,
  SUM(k.checkout_visitors)::int AS checkout_visitors,
  SUM(k.purchase_orders)::int AS purchase_orders
FROM analytics_03_daily_pixel_kpi_org k
CROSS JOIN _pilot p
WHERE k."organizationId" = p.org_id
  AND k.day >= p.d_from AND k.day <= p.d_to
  AND k.model = 'NITRO';
```

### 9b — Compra = Órdenes Atribuidas

```sql
SELECT
  SUM(k.orders_attributed)::int AS orders_attributed,
  SUM(k.purchase_orders)::int AS purchase_orders,
  SUM(k.orders_attributed)::int = SUM(k.purchase_orders)::int AS compra_matches
FROM analytics_03_daily_pixel_kpi_org k
CROSS JOIN _pilot p
WHERE k."organizationId" = p.org_id
  AND k.day >= p.d_from AND k.day <= p.d_to
  AND k.model = 'NITRO';
```

### 9c — Order count same across models; revenue may differ

```sql
SELECT
  model,
  SUM(orders_attributed)::int AS orders,
  ROUND(SUM(pixel_revenue)::numeric, 2) AS revenue
FROM analytics_03_daily_pixel_kpi_org k
CROSS JOIN _pilot p
WHERE k."organizationId" = p.org_id
  AND k.day >= p.d_from AND k.day <= p.d_to
GROUP BY 1
ORDER BY 1;
```

### 9d — Daily breakdown (spot-check)

```sql
SELECT day, model, orders_attributed, pixel_revenue, web_orders, purchase_orders
FROM analytics_03_daily_pixel_kpi_org k
CROSS JOIN _pilot p
WHERE k."organizationId" = p.org_id
  AND k.day >= p.d_from AND k.day <= p.d_to
ORDER BY day, model;
```

### Exit criteria

- [ ] Step 9a `orders_attributed` = Step 2a NITRO row (±0)
- [ ] Step 9a `pixel_revenue` = Step 2a NITRO row (±0)
- [ ] Step 9a `web_orders` / `web_revenue` = Step 2b (±0)
- [ ] Funnel visitors within ±1% of Step 2c (HLL rounding)
- [ ] Step 9b `compra_matches` = true
- [ ] Step 9c: same `orders` count for all four models

Record results here before starting TypeScript:

| Metric | Baseline (Step 2) | Gold (Step 9) | Match? |
|--------|-------------------|---------------|--------|
| orders_attributed (NITRO) | | | |
| pixel_revenue (NITRO) | | | |
| web_orders | | | |
| page_view_visitors | | | |
| purchase_orders | | | |

---

## Step 10 — Optional cleanup (preview branch only)

```sql
DROP TABLE IF EXISTS analytics_03_daily_pixel_kpi_org;
DROP TABLE IF EXISTS analytics_02_daily_pixel_touchpoint_enriched;
DROP TABLE IF EXISTS analytics_01_daily_pixel_touchpoint_wide;
DROP TABLE IF EXISTS analytics_01_daily_pixel_attribution_wide;
DROP TABLE IF EXISTS analytics_01_daily_pixel_order_wide;
```

---

## After SQL sign-off — TypeScript pushes (small, one at a time)

Execute only after Step 9 exit criteria pass. Each push: feature branch → Vercel preview → manual admin/cron test.

| Push | What | Test on preview |
|------|------|-----------------|
| **TS-1** | `setup-analytics-pixel` schema route | `POST …?phase=schema&key=…` |
| **TS-2** | Shared libs (`canonical-source`, `config-version`, `build-credits`) | `npx tsc --noEmit` |
| **TS-3** | `build-analytics-01-pixel` | Row counts match Steps 4–6 |
| **TS-4** | `build-analytics-02-pixel` | Credit totals match Step 7 |
| **TS-5** | `build-analytics-03-pixel` + cron wrapper | Step 9 parity via API |
| **TS-6** | `pixel/route` Gold read + fallback | Compare preview API vs Step 2 |
| **TS-7** | UI `refreshed_at` on analytics page | Header shows freshness |

**Optional:** Add `?organizationId=` to build routes for TS-3–TS-5 to keep pilot-org-only until validated, then widen to all orgs.

**Not in early pushes:** discrepancy route, funnel channel filter, `vercel.json` crons, prod Neon DDL.

See [`ANALYTICS_MIGRATION_PLAN.md`](./ANALYTICS_MIGRATION_PLAN.md) §8–17 for full migration context.

---

## Quick reference: execution order

```text
0. Sanity check branch + data
1. Set _pilot (org + dates + NITRO weights)
2. Baseline queries (save numbers)
3. CREATE TABLE analytics_01/02/03
4. INSERT 01 order_wide
5. INSERT 01 attribution_wide
6. INSERT 01 touchpoint_wide
7. INSERT 02 touchpoint_enriched
8. INSERT 03 kpi_org
9. Validate vs baseline
10. (Optional) DROP and restart
→ Then TS-1 through TS-7 on feature branch
```
