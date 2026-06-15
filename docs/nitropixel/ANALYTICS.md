# NitroPixel Analytics Warehouse — Architecture & Schema

> **Status:** Design spec (implementation pending)  
> **Last updated:** 2026-06-14  
> **Related:** `DATA_COHERENCE.md`, `docs/nitropixel/QUERY_LIST.md`, `src/lib/metrics/orders.ts`

This document defines the **analytics serving layer** for NitroPixel: naming conventions, table schemas, layer dependencies, refresh strategy, and how **attribution model changes** are handled.

**Goal:** Replace ~33–40 live SQL queries per `/pixel/analytics` page load with **3–8 simple reads** from pre-materialized Gold tables, while preserving the business rules in `DATA_COHERENCE.md`.

---

## 1. Problem statement

Today, `/pixel/analytics` loads:

| API | ~DB ops (cache miss) |
|-----|----------------------|
| `GET /api/metrics/pixel` | ~33 |
| `GET /api/metrics/pixel/discrepancy` | ~7 |
| `GET /api/metrics/pixel/funnel` (channel filter) | ~2 (heavy `pixel_events` CTE) |

**Partial fix already shipped:** `pixel_daily_*` HLL rollups moved visitor/funnel-step queries off `pixel_events` (~72s → ~2s for those metrics). The remaining slowness is **attribution + ads joins** executed live on every request.

**Target:** Materialize order/attribution/spend metrics on a schedule; API reads Gold only (with narrow exceptions for live feeds).

---

## 2. Layer model (Medallion mapping)

Operational tables remain **Bronze** (no rename). New analytics tables use prefixed layers:

| Prefix | Medallion role | Purpose |
|--------|----------------|---------|
| *(none)* | **Bronze — source** | Raw ingest: `orders`, `pixel_events`, `pixel_attributions`, … |
| `analytics_01_*` | **Silver — integrated wide** | All heavy joins done once; detail grain |
| `analytics_02_*` | **Silver — transformed** | Business rules, canonical keys, model credits |
| `analytics_03_*` | **Gold — serving** | Pre-aggregated metrics; **API reads here** |

```text
Bronze (existing Neon tables)
        │
        ▼  batch: build-analytics-01
analytics_01_*  (wide facts)
        │
        ▼  batch: build-analytics-02
analytics_02_*  (enriched + credits)
        │
        ▼  batch: build-analytics-03
analytics_03_*  (KPI marts)
        │
        ▼
GET /api/metrics/pixel  →  SUM(...) over Gold
```

**Legacy Gold (keep during migration):** `pixel_daily_*` rollups remain the source for **event-behavior** metrics until absorbed into `analytics_03_*`.

---

## 3. Naming convention

### Pattern

```text
analytics_{layer}_{grain}_{domain}_{entity}
```

| Segment | Allowed values | Meaning |
|---------|----------------|---------|
| `layer` | `01` \| `02` \| `03` | Integrated wide → transformed → serving |
| `grain` | `streaming` \| `hourly` \| `daily` \| `weekly` \| `monthly` | **Temporal grain of each row** (not refresh cadence) |
| `domain` | `pixel` (v1), later `ads`, `orders`, … | Product module |
| `entity` | `snake_case` noun | e.g. `order_wide`, `kpi_org`, `kpi_source` |

### Examples

```text
✅ analytics_01_daily_pixel_order_wide
✅ analytics_02_daily_pixel_touchpoint_enriched
✅ analytics_03_daily_pixel_kpi_org

❌ analytics_03_daily_revenue_stuff   (vague entity)
❌ analytics_03_pixel_kpi             (missing grain)
```

### Conventions (all analytics tables)

- **Multi-tenant:** every table includes `"organizationId" text NOT NULL`.
- **Date:** daily+ tables use `day date` in **America/Argentina/Buenos_Aires** (same as `pixel_daily_*`).
- **Metadata columns:**
  - `refreshed_at timestamptz NOT NULL DEFAULT now()`
  - `batch_id text` (optional — debug / traceability)
- **Primary keys:** composite; no surrogate `id` unless SCD history is required.
- **Indexes (minimum):** `(organizationId, day)`; Gold adds dimensions used in API filters (`model`, `source_canonical`, …).
- **SQL rules:** batch jobs MUST use helpers from `src/lib/metrics/orders.ts` — never copy-paste filter fragments (see `DATA_COHERENCE.md` Regla 4).

### Grain vs refresh (do not conflate)

| Name grain | One row represents | Typical refresh |
|------------|-------------------|-----------------|
| `hourly` | One hour bucket | Every 15–60 min |
| `daily` | One AR calendar day | Every 15 min (incremental) + nightly reconcile |
| `weekly` / `monthly` | Rolled period | Optional; usually `SUM` daily Gold instead |
| `streaming` | — | **Skip v1**; events already stream to `pixel_events` |

---

## 4. Bronze — source layer (existing, no prefix)

These tables are **not renamed**. Documented here as the Bronze catalog for NitroPixel analytics.

| Table | Role |
|-------|------|
| `pixel_events` | Event stream (~millions of rows) |
| `pixel_visitors` | Visitor identity |
| `pixel_attributions` | One row per `(orderId, model)` |
| `orders`, `order_items`, `customers` | Commerce truth |
| `ad_metrics_daily`, `ad_campaigns` | Platform ads |
| `manual_channel_spends` | Manual TV/radio/OOH spend |
| `pixel_daily_aggregates` | Legacy event rollup (HLL) |
| `pixel_daily_device`, `_type`, `_page`, `_product`, `_source` | Legacy breakdown rollups |
| `pixel_visitor_first_source` | First-touch dimension |

**Attribution models in Bronze:** `calculateAttribution()` writes **five** rows per attributed order:

`LAST_CLICK`, `FIRST_CLICK`, `LINEAR`, `TIME_DECAY`, `NITRO`

(see `src/lib/pixel/attribution.ts`, `@@unique([orderId, model])` on `pixel_attributions`).

---

## 5. Layer 01 — Integrated wide (`analytics_01_*`)

**Purpose:** Execute all heavy joins **once**. No KPI aggregation. No NITRO weighting yet.

### 5.1 `analytics_01_daily_pixel_order_wide`

**Grain:** `(organizationId, order_id)` — every order in scope (attributed or not).

| Column group | Columns |
|--------------|---------|
| Keys | `organizationId`, `order_id`, `day` (AR date from `orderDate`) |
| Order | `external_id`, `order_date`, `status`, `total_value`, `source`, `channel`, `traffic_source` |
| Flags (raw) | `is_valid_order`, `is_web_order`, `is_marketplace`, `is_attributed` |
| Customer | `customer_id`, `customer_email` (nullable) |
| Visitor | `attributed_visitor_id` (nullable — from any model or NITRO default) |
| Event hints | `has_client_purchase_event`, `purchase_event_count` |
| Meta | `refreshed_at`, `batch_id` |

**PK:** `(organizationId, order_id)`

**Sources:** `orders` LEFT JOIN `pixel_attributions` (NITRO or existence flag) LEFT JOIN event aggregates on `order_id`.

---

### 5.2 `analytics_01_daily_pixel_attribution_wide`

**Grain:** `(organizationId, order_id, model)`

| Columns |
|---------|
| `model` — `LAST_CLICK` \| `FIRST_CLICK` \| `LINEAR` \| `TIME_DECAY` \| `NITRO` |
| `attributed_value`, `touchpoint_count`, `conversion_lag` |
| `touchpoints jsonb` (raw from `pixel_attributions`) |
| `visitor_id`, `campaign_id`, `creative_id` |
| `day`, `refreshed_at`, `batch_id` |

**PK:** `(organizationId, order_id, model)`

**Source:** `pixel_attributions` JOIN `orders` (filter `orderDate` → `day`).

---

### 5.3 `analytics_01_daily_pixel_touchpoint_wide`

**Grain:** `(organizationId, order_id, model, touchpoint_ord)`

| Columns |
|---------|
| `touchpoint_ord`, `touchpoint_ts` |
| `source`, `medium`, `campaign`, `page`, click-id fields |
| `day` (order AR day), `refreshed_at`, `batch_id` |

**PK:** `(organizationId, order_id, model, touchpoint_ord)`

**Source:** `jsonb_array_elements(touchpoints)` from `01_attribution_wide`.

---

### 5.4 `analytics_01_daily_pixel_ad_spend_wide` *(optional v1)*

**Grain:** `(organizationId, day, platform, campaign_external_id)`

| Columns |
|---------|
| `spend`, `platform_conversions`, `platform_revenue`, `campaign_name` |
| `refreshed_at`, `batch_id` |

**Source:** `ad_metrics_daily` JOIN `ad_campaigns`.

*Alternative:* join ads directly in Layer 02 without a separate 01 table.

---

### 5.5 Event rollup bridge *(optional)*

Layer 01 jobs may **read** `pixel_daily_aggregates` rather than duplicate event HLL data. Funnel visitor columns flow into Gold via 02/03 without a dedicated 01 event table in v1.

---

## 6. Layer 02 — Transformed (`analytics_02_*`)

**Purpose:** Apply canonical business rules (`DATA_COHERENCE.md`), source normalization, and **per-model revenue credits**.

### 6.1 `analytics_02_daily_pixel_order_enriched`

**Grain:** `(organizationId, order_id)` — extends `01_order_wide`.

| Added columns |
|---------------|
| `is_valid_web_order` — final boolean (`ordersValidWebWhere`) |
| `first_touch_source`, `last_touch_source` (derived from touchpoints) |
| `attribution_config_version` — org settings snapshot id at build time |

**Source:** `01_order_wide` + `01_attribution_wide` (NITRO for touchpoint derivation).

---

### 6.2 `analytics_02_daily_pixel_touchpoint_enriched`

**Grain:** `(organizationId, order_id, model, touchpoint_ord)`

| Added columns |
|---------------|
| `source_canonical` — meta, google, google_organic, direct, … (same mapping as funnel CTE) |
| `credit_weight` — 0–1 for the active model |
| `credited_revenue` — `attributed_value × credit_weight` for this touchpoint |
| `is_first_touch`, `is_last_touch` |
| `attribution_config_version` |

**NITRO weights:** Applied here using `organizations.settings.nitroWeights` at **batch time**, not at API read time. Ensures KPI total = sum(by-channel).

**Implementation note:** Reuse calculation functions from `src/lib/pixel/attribution.ts` (`calcLastClick`, `calcFirstClick`, `calcLinear`, `calcNitro`, …) inside the batch job — single code path.

---

### 6.3 `analytics_02_daily_pixel_channel_attribution`

**Grain:** `(organizationId, day, model, source_canonical)`

| Columns |
|---------|
| `orders_count`, `revenue_credited`, `orders_distinct` |
| `first_touch_orders`, `last_touch_orders` |
| `attribution_config_version`, `refreshed_at`, `batch_id` |

**Source:** Aggregate `02_touchpoint_enriched` + order grain rules.

---

### 6.4 `analytics_02_daily_pixel_ad_aligned`

**Grain:** `(organizationId, day, source_canonical)`

| Columns |
|---------|
| `platform_spend`, `platform_revenue`, `platform_conversions`, `manual_spend` |
| `refreshed_at`, `batch_id` |

**Source:** `01_ad_spend_wide` + canonical source mapping + `manual_channel_spends` proration.

---

### 6.5 `analytics_02_daily_pixel_coverage`

**Grain:** `(organizationId, day)`

| Columns |
|---------|
| `web_orders_total`, `attributed_orders`, `coverage_pct` |
| `refreshed_at`, `batch_id` |

**Source:** `02_order_enriched` aggregated by day.

---

## 7. Layer 03 — Gold / API serving (`analytics_03_*`)

**Purpose:** What `/api/metrics/pixel`, `/discrepancy`, and `/funnel` read. Queries must be trivial `SELECT` / `SUM`.

### 7.1 `analytics_03_daily_pixel_kpi_org` ⭐ (v1 priority)

**Grain:** `(organizationId, day, model)`

| Column | UI / API field |
|--------|----------------|
| `orders_attributed` | Órdenes Atribuidas |
| `pixel_revenue` | Revenue Atribuido |
| `web_orders` | Denominator (tasa de atribución) |
| `web_revenue` | |
| `total_ad_spend` | Inversión total |
| `attribution_rate_pct` | Optional precomputed |
| `aov` | Optional precomputed |
| `page_view_visitors` | Funnel — Visitas |
| `view_product_visitors` | Funnel — Vio producto |
| `add_to_cart_visitors` | Funnel — Carrito |
| `checkout_visitors` | Funnel — Checkout |
| `purchase_orders` | Funnel — Compra (= `orders_attributed` at org level) |
| `attribution_config_version` | NULL except when `model = 'NITRO'` |
| `refreshed_at` | “Actualizado hace…” |

**PK:** `(organizationId, day, model)`

**Example API read (last 7 days):**

```sql
SELECT
  SUM(orders_attributed)::int,
  SUM(pixel_revenue)::float,
  SUM(web_orders)::int,
  SUM(page_view_visitors)::int,
  ...
FROM analytics_03_daily_pixel_kpi_org
WHERE "organizationId" = $1
  AND day >= $2::date AND day <= $3::date
  AND model = $4;
```

---

### 7.2 `analytics_03_daily_pixel_kpi_source`

**Grain:** `(organizationId, day, model, source_canonical)`

| Columns |
|---------|
| `orders`, `pixel_revenue`, `spend`, `platform_revenue` |
| `pixel_roas`, `platform_roas`, `diff_pct` |
| `attribution_config_version`, `refreshed_at` |

**Powers:** channel table, ROAS by source, partial discrepancy view.

---

### 7.3 `analytics_03_daily_pixel_kpi_campaign`

**Grain:** `(organizationId, day, model, source_canonical, campaign_name)`

**Powers:** campaign drill-down (`/discrepancy` by campaign).

---

### 7.4 `analytics_03_daily_pixel_funnel_channel`

**Grain:** `(organizationId, day, first_touch_source)`

| Columns |
|---------|
| Funnel steps 1–4 (visitor counts) |
| `purchase_orders` — attributed orders where first touch = `first_touch_source` |
| `model`, `attribution_config_version`, `refreshed_at` |

**Powers:** `/api/metrics/pixel/funnel?channel=` without raw `pixel_events` CTE.

**Note:** `purchase_orders` uses **attributed orders**, not PURCHASE events (`DATA_COHERENCE.md` Regla 5).

---

### 7.5 `analytics_03_daily_pixel_discrepancy`

**Grain:** `(organizationId, day, source_canonical)`

| Columns |
|---------|
| `pixel_revenue`, `platform_revenue`, `delta`, `delta_pct` |
| `refreshed_at` |

**Powers:** `/api/metrics/pixel/discrepancy` daily trend + summary.

---

### 7.6 Optional rollups

| Table | When to add |
|-------|-------------|
| `analytics_03_weekly_pixel_kpi_org` | Only if 90d+ charts need faster reads than summing ~90 daily rows |
| `analytics_03_monthly_pixel_kpi_org` | Same |
| `analytics_03_daily_pixel_kpi_device` | If device CR table stays slow after v1 |

---

## 8. Layer dependency graph

```text
orders ──────────────────────────────┐
pixel_attributions ──────────────────┼──► 01_order_wide
pixel_events (purchase flags) ───────┘         │
                                               ▼
pixel_attributions ────────────────► 01_attribution_wide
                                               │
                                               ▼
                                    01_touchpoint_wide (explode JSON)
                                               │
ad_metrics_daily ──► 01_ad_spend_wide ───────┼──► 02_order_enriched
manual_channel_spends ─────────────────────────┤         │
pixel_daily_aggregates (funnel HLL) ───────────┤         ▼
                                               │   02_touchpoint_enriched
                                               │         │
                                               ├────────► 02_channel_attribution
                                               ├────────► 02_ad_aligned
                                               └────────► 02_coverage
                                                         │
                                                         ▼
                                               03_kpi_org
                                               03_kpi_source
                                               03_kpi_campaign
                                               03_funnel_channel
                                               03_discrepancy
```

**Build order (strict):**

1. `01_order_wide`, `01_attribution_wide`, `01_touchpoint_wide` (parallel where possible)
2. `02_order_enriched`, `02_touchpoint_enriched`
3. `02_channel_attribution`, `02_ad_aligned`, `02_coverage`
4. All `03_*` tables

---

## 9. Refresh & update strategy

### 9.1 Cron jobs (proposed)

| Job | Route (proposed) | Builds | Schedule |
|-----|------------------|--------|----------|
| Event rollups (existing) | `GET /api/cron/refresh-pixel-rollups` | `pixel_daily_*` | Every 2h — last 3 AR days |
| Layer 01 | `GET /api/cron/build-analytics-01-pixel` | `analytics_01_*` | Every **15 min** — incremental |
| Layer 02 | `GET /api/cron/build-analytics-02-pixel` | `analytics_02_*` | Every **15 min** — after 01 |
| Layer 03 | `GET /api/cron/build-analytics-03-pixel` | `analytics_03_*` | Every **15 min** — after 02 |
| Reconcile | `GET /api/cron/reconcile-analytics-03-pixel` | Full rebuild last 3 AR days | Daily 3am AR |

**Incremental watermark (01):** Process orders with `orderDate` or `updatedAt` since last successful run per org. Always re-process **today + last 2 AR days** (same tolerance as rollup cron).

**Idempotency:** All writes use `INSERT … ON CONFLICT DO UPDATE` (same pattern as `setup-pixel-rollups`).

### 9.2 UI freshness

- Show `MAX(refreshed_at)` from Gold in analytics header: *“Datos actualizados hace X min”*.
- Acceptable staleness: **≤ 15 min** for KPIs; live feeds exempt (see §11).

### 9.3 Fallback during migration

If Gold row missing for `(org, day, model)`:

1. Log warning + metric `analytics_mart_miss`.
2. Optional: fall back to live query (temporary; remove after backfill complete).

---

## 10. Attribution model & settings changes

### 10.1 What changes instantly (no rebuild)

| User action | Behavior |
|-------------|----------|
| Switch model in UI (Last / First / Linear / Nitro) | Read Gold with different `model` column — **all standard models precomputed** |
| Change **default model** in settings | Only changes default `?model=` param |

**Important:** `orders_attributed` **count** is the same across models (same set of attributed orders). **Revenue, ROAS, by-channel** differ by model.

### 10.2 What requires rebuild

| User action | Behavior |
|-------------|----------|
| Change **NITRO / Precisión weights** | Bump `attribution_config_version` → rebuild **02 + 03** for org (NITRO rows) |
| Change **attribution window** or **channel windows** | Run **attribution replay** on affected orders, then rebuild **01 → 03** |
| New order / webhook attribution | Incremental 01 → 03 on next 15 min run |

### 10.3 `attribution_config_version`

Stored on org settings (monotonic integer or hash):

```json
{
  "attributionModel": "NITRO",
  "nitroWeights": { "first": 30, "last": 40, "middle": 30 },
  "attributionWindowDays": 30,
  "channelWindows": { "meta": 7 }
}
```

**Hash inputs:** `nitroWeights`, `attributionWindowDays`, `channelWindows` (not `attributionModel` — that's a Gold dimension).

Gold rows for `model = 'NITRO'` include `attribution_config_version`. On `PUT /api/settings/attribution`:

1. Compute new version.
2. Persist settings.
3. Enqueue org-scoped rebuild (async; target ≤ 15 min).
4. UI message: *“Recalculando métricas con nueva configuración…”*

### 10.4 CUSTOM / Precisión in UI

UI label **Precisión** maps to **`NITRO`** in DB with custom weights. Gold stores a single `NITRO` partition keyed by `attribution_config_version` — not a separate sixth model.

### 10.5 TIME_DECAY

`calculateAttribution()` writes `TIME_DECAY` rows today. Gold v1 should either:

- Include `TIME_DECAY` in all `03_*` tables, or
- Explicitly exclude until exposed in UI (document decision in implementation PR).

Keep in sync with `AttributionModel` enum in `schema.prisma`.

---

## 11. What stays live (not materialized)

| Feature | Why |
|---------|-----|
| Recent events list (paginated) | Always fresh; low row limit |
| Live orders table (last ~50 journeys) | Operational UX |
| Pixel install / last event heartbeat | `findFirst` on `pixel_events` |
| Admin replay / orders-truth | Diagnostic |
| Arbitrary custom date ranges | **Phase 2:** sum daily Gold for any range; v1 can support any range via `SUM` over `day` if Gold is daily-grain |

---

## 12. API read contract (target)

### `/api/metrics/pixel`

| Response section | Gold source (target) |
|------------------|----------------------|
| `businessKpis` | `03_kpi_org` SUM |
| `funnel` | `03_kpi_org` SUM (steps 1–4 + `purchase_orders`) |
| `attribution.bySource` | `03_kpi_source` |
| `channelRoas` | `03_kpi_source` |
| `perDayCoverage` | `02_coverage` or `03` derivative |
| `dailyRevenue` | `03_kpi_org` by day |
| `recentEvents`, `recentOrders` | Bronze (live) |

Query params: `from`, `to`, `model` (default from org settings).

### `/api/metrics/pixel/discrepancy`

| Section | Gold source |
|---------|-------------|
| `bySource`, `byCampaign` | `03_kpi_source`, `03_kpi_campaign` |
| `dailyTrend` | `03_discrepancy` |
| `summary` | Aggregated from `03_discrepancy` |

### `/api/metrics/pixel/funnel`

| Case | Gold source |
|------|-------------|
| `channel=all` | `03_kpi_org` (from main pixel response) |
| `channel=meta` etc. | `03_funnel_channel` WHERE `first_touch_source = $channel` |

---

## 13. Migration from `pixel_daily_*`

| Legacy | Target | Phase |
|--------|--------|-------|
| `pixel_daily_aggregates` (funnel HLL) | Columns in `03_kpi_org` | Dual-write → switch API → deprecate |
| `pixel_daily_source` | `03_funnel_channel` / `03_kpi_source` | Same |
| `pixel_daily_device` | `03_kpi_device` (if needed) | Later |
| `pixel_visitor_first_source` | Derived in 02; stored on touchpoint/order enriched | Keep dim; refresh via existing first-source job |

**Existing crons kept until cutover:**

- `refresh-pixel-rollups` — continues feeding funnel visitor counts until 03 is authoritative.

---

## 14. Coherence rules (inherited)

All batch SQL MUST enforce `DATA_COHERENCE.md`:

| Rule | Application in analytics layers |
|------|--------------------------------|
| Regla 1–2 | `is_valid_web_order` set in 02 using `ordersValidWebWhere` |
| Regla 3 | `day` derived from `orderDate`, never `createdAt` |
| Regla 4 | Import `src/lib/metrics/orders.ts` in batch code |
| Regla 5 | `purchase_orders` / Compra = attributed orders, not PURCHASE events |
| Regla 6 | Funnel steps 1–4 = unique visitors (from rollups / HLL) |

**Audit:** `/api/admin/orders-truth` remains the cross-check between Bronze universes and Gold.

---

## 15. Phased rollout

### Phase 1 — Prove speed (MVP)

**Tables:**

- `analytics_01_daily_pixel_order_wide`
- `analytics_01_daily_pixel_attribution_wide`
- `analytics_02_daily_pixel_touchpoint_enriched`
- `analytics_03_daily_pixel_kpi_org`

**API:** `/api/metrics/pixel` KPI strip + funnel Compra read Gold for standard date ranges.

**Success metric:** p95 API latency < 500ms (cache miss); KPI = Gold SUM matches live query ±0.

### Phase 2 — Full analytics page

Add `03_kpi_source`, `03_discrepancy`, `03_funnel_channel`. Switch `/discrepancy` and funnel channel filter.

### Phase 3 — Deprecate live attribution joins

Remove parallel live queries from pixel route; keep live feeds only. Retire redundant query blocks documented in `QUERY_LIST.md`.

### Phase 4 — Optional external DW

Export Bronze to BigQuery for BI; **Neon Gold remains app serving layer**.

---

## 16. v1 table checklist

| Table | Layer | Priority |
|-------|-------|----------|
| `analytics_01_daily_pixel_order_wide` | 01 | P0 |
| `analytics_01_daily_pixel_attribution_wide` | 01 | P0 |
| `analytics_01_daily_pixel_touchpoint_wide` | 01 | P0 |
| `analytics_02_daily_pixel_order_enriched` | 02 | P1 |
| `analytics_02_daily_pixel_touchpoint_enriched` | 02 | P0 |
| `analytics_02_daily_pixel_channel_attribution` | 02 | P1 |
| `analytics_02_daily_pixel_ad_aligned` | 02 | P1 |
| `analytics_02_daily_pixel_coverage` | 02 | P1 |
| `analytics_03_daily_pixel_kpi_org` | 03 | P0 |
| `analytics_03_daily_pixel_kpi_source` | 03 | P1 |
| `analytics_03_daily_pixel_kpi_campaign` | 03 | P2 |
| `analytics_03_daily_pixel_funnel_channel` | 03 | P1 |
| `analytics_03_daily_pixel_discrepancy` | 03 | P1 |

---

## 17. Open decisions (track in implementation PRs)

- [ ] Include `TIME_DECAY` in Gold or defer until UI exposes it
- [ ] Store HLL blobs in 03 vs pre-cardinality ints (±0.8% error tradeoff)
- [ ] Single org rebuild queue vs global batch (multi-tenant scale)
- [ ] Trigger attribution replay automatically on window change vs manual admin step
- [ ] Rename `/pixel/analytics` to pass `?model=` from org default instead of hardcoded NITRO

---

## 18. References

| Doc / code | Purpose |
|------------|---------|
| `DATA_COHERENCE.md` | Business rules contract |
| `docs/nitropixel/QUERY_LIST.md` | Current query inventory to replace |
| `src/lib/metrics/orders.ts` | Canonical order filters |
| `src/lib/pixel/attribution.ts` | Model calculation logic (reuse in batch) |
| `src/app/api/admin/setup-pixel-rollups/route.ts` | Rollup DDL + backfill pattern |
| `src/app/api/cron/refresh-pixel-rollups/route.ts` | Existing rollup refresh cadence |
| `docs/issues/funnel-compra-ordenes-atribuidas.md` | Funnel Compra = orders fix |

---

## 19. Summary

| Question | Answer |
|----------|--------|
| Does this replace Bronze? | **No** — operational tables stay as-is |
| What makes the UI fast? | **`analytics_03_*`** — simple `SUM` reads |
| What does `01` vs `02` split? | **01** = joins; **02** = rules + credits |
| Model switch in UI? | Instant — read different `model` partition |
| Weight / window change? | Rebuild 02/03 (+ replay if window changed) |
| Relation to existing rollups? | **Complement** — events in `pixel_daily_*`, orders in `analytics_*` |
