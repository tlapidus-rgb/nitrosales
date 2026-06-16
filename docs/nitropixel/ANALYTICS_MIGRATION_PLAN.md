# NitroPixel Analytics — Migration Plan

> **Status:** Plan (no implementation code in this doc)  
> **Last updated:** 2026-06-14  
> **Architecture spec:** [`ANALYTICS.md`](./ANALYTICS.md)  
> **Coherence contract:** [`DATA_COHERENCE.md`](../../DATA_COHERENCE.md)  
> **Current query inventory:** [`QUERY_LIST.md`](./QUERY_LIST.md)

This document is the **step-by-step migration plan** to implement the analytics warehouse (`analytics_01_*` → `analytics_03_*`) and the **TypeScript read-path optimizations** that replace live heavy queries on `/pixel` and `/pixel/analytics`.

---

## 1. Goals and non-goals

### Goals

| # | Goal | Success signal |
|---|------|----------------|
| G1 | **Latency:** `/api/metrics/pixel` p95 &lt; **500 ms** on cache miss (7d range) | DevTools / Vercel logs on preview, then prod |
| G2 | **Coherence:** KPI numbers match `DATA_COHERENCE.md` (e.g. Compra = Órdenes Atribuidas) | `/api/admin/orders-truth` + UI spot checks |
| G3 | **Ops:** Metrics refresh without manual SQL | Cron on `main` every 15 min; manual trigger on preview |
| G4 | **Safety:** Preview Neon branch validates full pipeline before prod | No prod DDL until preview sign-off |
| G5 | **Model UX:** Switching attribution model is instant (read different `model` partition) | UI toggle without rebuild |

### Non-goals (this migration)

- Moving Bronze to BigQuery / external DW (Phase 4 optional in `ANALYTICS.md`)
- Rewriting `calculateAttribution()` ingest pipeline
- Changing Dashboard (`/dashboard`) pixel widgets (out of NitroPixel analytics scope unless follow-up)
- Real-time sub-minute KPI freshness (15 min staleness is acceptable)

---

## 2. Architecture recap

```text
Bronze (existing)          analytics_01 (wide)       analytics_02 (transform)    analytics_03 (Gold)
─────────────────          ───────────────────       ────────────────────────    ─────────────────────
orders                     order_wide                order_enriched              kpi_org  ← API KPIs
pixel_attributions    →    attribution_wide     →    touchpoint_enriched    →    kpi_source
pixel_events               touchpoint_wide           channel_attribution         funnel_channel
pixel_daily_* (legacy)     ad_spend_wide (opt)       ad_aligned                  discrepancy
ad_metrics_daily                                     coverage
```

**Read path target:** API performs **3–8 simple `SUM`/`SELECT`s** on `analytics_03_*`; live Bronze only for paginated feeds (recent events/orders).

**Legacy coexistence:** `pixel_daily_*` rollups continue feeding funnel visitor steps until `03_kpi_org` absorbs HLL columns or copies cardinality ints at build time.

---

## 3. Environments and rollout surfaces

| Surface | DB | Deploy | Crons | Use for |
|---------|-----|--------|-------|---------|
| **Local** | Optional `.env.local` | `npm run dev` | Manual admin URLs | Blocked for some devs (corp SSL); optional |
| **Vercel Preview** | Neon branch (auto or pinned) | Git feature branch | **Manual** (`?key=ADMIN_API_KEY`) | Primary validation |
| **Production (`main`)** | Neon prod | Merge → Vercel | `vercel.json` schedules | Final rollout |

### Preview prerequisites (run once per Neon branch)

| Step | Endpoint / action | Purpose |
|------|-------------------|---------|
| P1 | `POST /api/admin/setup-pixel-rollups?phase=schema&key=…` | `hll` + `pixel_daily_*` |
| P2 | `POST …?phase=backfill&from=&to=&key=…` (loop until `done:true`) | Event rollups populated |
| P3 | `POST /api/setup/ensure-indexes?key=…` | Critical indexes on `orders` / attributions |
| P4 | `GET /api/admin/setup-pixel-rollups?phase=status&key=…` | Confirm rollup coverage |

### Prod prerequisites (before analytics DDL on prod)

Same P1–P4 on **production Neon** if rollups/indexes are missing (already required today for `/pixel/analytics` performance).

---

## 4. Migration principles (from repo rules)

Follow the same pattern as rollups and past incidents (`ERRORES_CLAUDE_NO_REPETIR.md`, `CLAUDE.md` Regla 3 on migrations):

1. **DDL before read path:** Deploy admin `setup-analytics-pixel?phase=schema` → execute on target DB → then deploy API code that reads Gold.
2. **Idempotent upserts:** All batch jobs use `INSERT … ON CONFLICT DO UPDATE` (no `TRUNCATE`).
3. **Single source of truth for filters:** Batch SQL imports `ordersValidWebWhere` / helpers from `src/lib/metrics/orders.ts` — never duplicate filters.
4. **Dual-write / fallback first:** API tries Gold; if table empty or flag off, falls back to live queries until validation passes.
5. **Preview → main:** Feature branch on GitHub + Vercel preview + Neon branch; merge only after checklist §10.
6. **No force push;** `git pull --rebase origin main` before merge if VM/producto pushed in parallel.
7. **Validate:** `npx tsc --noEmit` before push; `next build` if UI/routes touched.

---

## 5. Workstreams

| Workstream | Owner focus | Deliverables |
|------------|-------------|--------------|
| **W1 — SQL / warehouse** | Neon SQL editor + admin DDL | Table DDL, validated `INSERT…SELECT`, backfill scripts |
| **W2 — Batch jobs** | TypeScript admin + cron routes | `setup-analytics-pixel`, `build-analytics-*`, cron wrappers |
| **W3 — API read path** | `pixel`, `discrepancy`, `funnel` routes | Gold reads, fallback, reduced `Promise.all` batch |
| **W4 — Settings / invalidation** | Attribution settings PUT | `attribution_config_version`, rebuild trigger |
| **W5 — UI** | Analytics page | `refreshed_at`, `?model=` from org settings |
| **W6 — QA / coherence** | Manual + orders-truth | Before/after latency and number parity |

Workstreams W1–W2 can start in **Neon SQL editor** without TypeScript. W3 depends on W2 populating Gold on preview.

---

## 6. Phase 0 — Prep (no warehouse tables yet)

**Objective:** Align baseline behavior and branch hygiene before warehouse work.

| Task | Detail | Done when |
|------|--------|-----------|
| 0.1 | Confirm feature Git branch + Vercel preview + Neon branch linked | Preview URL loads app |
| 0.2 | Merge or include **funnel Compra = attributed orders** fix (if not on branch) | KPI Compra = Órdenes Atribuidas on preview |
| 0.3 | Run preview prerequisites P1–P4 (§3) | Rollups status shows recent days |
| 0.4 | Capture **baseline metrics** on preview: `/api/metrics/pixel` latency (7d), query count, sample KPI values | Recorded in PR / issue |
| 0.5 | Resolve open decisions in `ANALYTICS.md` §17 (at least TIME_DECAY in/out, HLL int vs blob for 03) | Decisions documented in this plan §15 |

**Exit criteria:** Preview analytics page loads with coherent KPI/funnel; baseline numbers documented.

---

## 7. Phase 0.5 — SQL prototyping (Neon SQL editor)

> **Executable runbook:** [`ANALYTICS_NEON_SQL_RUNBOOK.md`](./ANALYTICS_NEON_SQL_RUNBOOK.md) — warehouse SQL prototype.  
> **Org empty dashboard:** [`ANALYTICS_ORG_RECOVERY_RUNBOOK.md`](./ANALYTICS_ORG_RECOVERY_RUNBOOK.md) — rollups + VTEX orders fix.

**Objective:** Validate Layer 01→03 logic and numbers **before** porting to TypeScript.

| Step | Activity | Output |
|------|----------|--------|
| 0.5.1 | Pick pilot `organizationId` + 7-day AR window | Constants for all prototype queries |
| 0.5.2 | Write read-only **01** joins: orders + attributions (+ touchpoint explode) | Saved `.sql` snippets in repo `docs/nitropixel/sql/` (optional) or Neon snippets |
| 0.5.3 | Write **02** transforms: `source_canonical`, NITRO credits per touchpoint | Matches `/api/metrics/pixel` by-source for NITRO ±0 |
| 0.5.4 | Write **03** daily aggregate: `GROUP BY day, model` → org KPI columns | Matches `businessKpis` for 7d SUM |
| 0.5.5 | `CREATE TABLE` + one-shot `INSERT…SELECT` on **preview Neon only** | Tables exist with data |
| 0.5.6 | Compare to `/api/admin/orders-truth` and live API | Sign-off on SQL correctness |

**Exit criteria:** Manual Gold table on preview branch matches live KPI queries for pilot org + date range.

**Note:** This phase does not require app deploy; optional SQL files in repo are documentation only (no runtime dependency).

---

## 8. Phase 1 — MVP warehouse + KPI read path (P0)

**Objective:** Prove speed on KPI strip + funnel via `analytics_03_daily_pixel_kpi_org`.

### 8.1 Database (preview first)

| Order | Table | Layer |
|-------|-------|-------|
| 1 | `analytics_01_daily_pixel_order_wide` | 01 |
| 2 | `analytics_01_daily_pixel_attribution_wide` | 01 |
| 3 | `analytics_01_daily_pixel_touchpoint_wide` | 01 |
| 4 | `analytics_02_daily_pixel_touchpoint_enriched` | 02 |
| 5 | `analytics_03_daily_pixel_kpi_org` | 03 |

**Delivery mechanism:** `POST /api/admin/setup-analytics-pixel?phase=schema` (new route; mirrors `setup-pixel-rollups`).

### 8.2 Batch jobs (preview: manual; prod: after merge)

| Job | Builds | Initial scope |
|-----|--------|---------------|
| `build-analytics-01-pixel` | 01 tables | Incremental: last 3 AR days + orders touched since watermark (v1: rebuild 3 days full) |
| `build-analytics-02-pixel` | 02 touchpoint enriched | All models: LAST_CLICK, FIRST_CLICK, LINEAR, NITRO (+ TIME_DECAY per §15) |
| `build-analytics-03-pixel` | 03 kpi_org | Join 02 + copy funnel visitor ints from `pixel_daily_aggregates` |

**Orchestrator:** `GET /api/cron/build-analytics-pixel?key=…` chains 01→02→03 (manual on preview).

### 8.3 TypeScript changes (Phase 1)

| File | Change |
|------|--------|
| **New** `src/lib/analytics/pixel/canonical-source.ts` | Shared source normalization |
| **New** `src/lib/analytics/pixel/config-version.ts` | Settings hash for NITRO rebuilds |
| **New** `src/lib/analytics/pixel/build-credits.ts` | Thin wrapper over attribution calcs for batch |
| **New** `src/app/api/admin/setup-analytics-pixel/route.ts` | DDL + status |
| **New** `src/app/api/admin/build-analytics-01-pixel/route.ts` | Batch 01 |
| **New** `src/app/api/admin/build-analytics-02-pixel/route.ts` | Batch 02 |
| **New** `src/app/api/admin/build-analytics-03-pixel/route.ts` | Batch 03 |
| **New** `src/app/api/cron/build-analytics-pixel/route.ts` | Cron wrapper (add to `vercel.json` on merge) |
| `src/app/api/metrics/pixel/route.ts` | **Read** `03_kpi_org` for `businessKpis` + `funnel`; fallback to live queries #8 + rollup funnel if mart empty |
| `src/app/(app)/pixel/analytics/page.tsx` | Display `meta.martRefreshedAt` if exposed |

**Queries replaced in Phase 1** (see `QUERY_LIST.md`):

| Live query (approx) | Replaced by |
|---------------------|-------------|
| #8 Attribution by model (KPI count/revenue) | `SUM` on `03_kpi_org` |
| #13 Total orders (web counts for rate) | `SUM(web_orders)` on `03_kpi_org` |
| Funnel block (rollup HLL + purchase) | `SUM` funnel cols + `purchase_orders` on `03_kpi_org` |
| #18 Previous period attr (partial) | `SUM` on `03_kpi_org` for prev date range |

**Still live in Phase 1:** queries #1–7 rollups (until 03 fully copies visitors), #9+ attribution breakdowns, #11 recent events, #15 live orders, discrepancy, funnel channel filter.

### 8.4 Phase 1 validation

| Check | Method |
|-------|--------|
| Numeric parity | `businessKpis.ordersAttributed`, `pixelRevenue`, funnel steps vs pre-change live API (same org, range, model) |
| Latency | Preview: `/api/metrics/pixel?from=&to=&model=NITRO` — compare p95 |
| Empty mart | Delete 03 rows → API falls back without 500 |
| Multi-model | `?model=LAST_CLICK` reads different partition, same order count |

**Exit criteria:** G1 partial (KPI path &lt; 500 ms); G2 for KPI + funnel; preview sign-off.

---

## 9. Phase 2 — Full analytics page (P1)

**Objective:** Move `/discrepancy` and channel funnel off live joins.

### 9.1 Additional tables

| Table | Layer |
|-------|-------|
| `analytics_02_daily_pixel_channel_attribution` | 02 |
| `analytics_02_daily_pixel_ad_aligned` | 02 |
| `analytics_02_daily_pixel_coverage` | 02 |
| `analytics_03_daily_pixel_kpi_source` | 03 |
| `analytics_03_daily_pixel_funnel_channel` | 03 |
| `analytics_03_daily_pixel_discrepancy` | 03 |
| `analytics_03_daily_pixel_kpi_campaign` | 03 (P2 within phase) |

Extend `setup-analytics-pixel` schema phase; extend build 02/03 jobs.

### 9.2 TypeScript changes (Phase 2)

| File | Change |
|------|--------|
| `src/app/api/metrics/pixel/discrepancy/route.ts` | Read `03_discrepancy`, `03_kpi_source`, `03_kpi_campaign`; fallback |
| `src/app/api/metrics/pixel/funnel/route.ts` | Read `03_funnel_channel` when `channel` set; `channel=all` from main pixel response |
| `src/app/api/metrics/pixel/route.ts` | `attribution.bySource`, `channelRoas`, `perDayCoverage`, `dailyRevenue` from Gold |
| `src/app/(app)/pixel/analytics/page.tsx` | Pass `?model=` from org settings; stop hardcoding NITRO only |

**Queries replaced:** discrepancy route #1–7; pixel route #9–10, #17, #19–#24 (partial); funnel route raw `pixel_events` CTE.

### 9.3 Phase 2 validation

Full page load: 3 parallel API calls should each issue **&lt; 5** DB ops (mostly Gold + auth + live feeds).

**Exit criteria:** `/pixel/analytics` total server time dominated by Gold reads; channel funnel matches prior logic for pilot channels.

---

## 10. Phase 3 — Remove legacy live paths (P1)

**Objective:** Delete redundant SQL from hot path; keep only documented exceptions.

| Task | Detail |
|------|--------|
| 3.1 | Remove fallback live queries once Gold coverage = 100% of org-days in prod for 7 days |
| 3.2 | Consolidate duplicate funnel logic (main API vs funnel route) |
| 3.3 | Update `QUERY_LIST.md` with “Gold only” inventory |
| 3.4 | Add CI or admin check: `orders-truth` vs Gold sample (optional) |
| 3.5 | Evaluate deprecating direct reads of `pixel_daily_*` in pixel route if 03 stores visitor funnel ints |

**Still live permanently:** #1 live status, #11 recent events, #15 recent orders, #12 pagination count (or move to rollup-only).

**Exit criteria:** `Promise.all` in pixel route reduced to ≤10 operations; documented in PR.

---

## 11. Phase 4 — Production hardening (P2)

| Task | Detail |
|------|--------|
| 4.1 | Add `vercel.json` cron: `build-analytics-pixel` every **15 min** |
| 4.2 | Add nightly `reconcile-analytics-pixel` (rebuild last 3 AR days) |
| 4.3 | Run `setup-analytics-pixel` schema on **prod Neon** |
| 4.4 | Initial prod backfill: last **90 days** (chunked, resumible) |
| 4.5 | Monitor: mart age, miss rate, API latency (Axiom/logs) |
| 4.6 | Document runbook in `ANALYTICS.md` or ops section |

**Exit criteria:** Prod runs 7 days without coherence incidents; Tomy sign-off on latency.

---

## 12. Attribution model and settings migration

| Event | Warehouse behavior | App behavior |
|-------|-------------------|--------------|
| User switches model in UI | Read `WHERE model = $selected` on Gold | No rebuild |
| User saves **Precisión / NITRO weights** | Bump `attribution_config_version`; rebuild 02+03 for org | PUT settings triggers async rebuild |
| User changes **attribution window** | Replay attribution on affected orders (existing reconcile); then rebuild 01→03 | Document in UI: “Recalculando…” |
| User changes **channel windows** | Same as window change | |
| New order attributed (webhook) | Picked up on next 15 min incremental build | No change to ingest |

**Precompute all standard models** in 02/03 (`LAST_CLICK`, `FIRST_CLICK`, `LINEAR`, `NITRO`; `TIME_DECAY` per §15).

---

## 13. Query replacement matrix (full target state)

Reference: `docs/nitropixel/QUERY_LIST.md` — `/api/metrics/pixel` queries.

| Query # | Topic | Phase | Target |
|---------|-------|-------|--------|
| 0 | Org settings | — | Live (small) |
| 1 | Live status | 3+ | Live |
| 1b | Pixel install date | 1 | Live or cache |
| 2–7 | Visitor KPIs / rollups | 1→3 | `03_kpi_org` funnel cols |
| 8 | Attribution by model | 1 | `03_kpi_org` |
| 9 | Attribution by source | 2 | `03_kpi_source` |
| 10 | Conversion lag | 2 | 02/03 derivative or live |
| 11 | Recent events | — | Live |
| 12 | Event count pagination | 3 | Rollup SUM |
| 13 | Total orders | 1 | `03_kpi_org.web_orders` |
| 14 | Ad spend | 2 | `02_ad_aligned` / `03_kpi_source` |
| 15 | Live orders table | — | Live |
| 16 | Click-id coverage | 3 | Rollup or 03 meta |
| 17 | Daily attributed revenue | 2 | `03_kpi_org` by day |
| 18 | Prev period attr | 1 | `03_kpi_org` prev range |
| 19 | Per-day coverage | 2 | `02_coverage` |
| 20–21 | Daily channel/spend | 2 | `03_kpi_source` |
| 22–24 | Channel roles, CR, device | 2 | 02/03 |
| 25–26 | Product viewers/purchases | 3+ | Later scope |
| 27–28 | Journey intelligence | 3+ | Later scope |
| 29 | Revenue by model×channel | 2 | `03_kpi_source` |
| 30 | All-time event count | — | Existing cache |
| 31 | Manual spend | 2 | Live + join in 02 |
| 32 | Funnel (legacy inline) | 1 | `03_kpi_org` |
| 33 | Daily ad spend series | 2 | `03_kpi_source` / discrepancy |

---

## 14. Testing checklist (preview sign-off)

### Functional

- [ ] KPI strip: Revenue, ROAS, Órdenes, Tasa — match pre-migration live API (±0)
- [ ] Funnel: Compra = Órdenes Atribuidas (canal = Todos)
- [ ] Model switch: LAST_CLICK vs NITRO changes revenue, not order count
- [ ] Channel funnel filter (Phase 2): Meta/Google subset sensible
- [ ] Discrepancy summary (Phase 2): aligns with platform spend APIs
- [ ] Empty/new org: graceful zeros, no 500

### Performance

- [ ] `/api/metrics/pixel` p95 &lt; 500 ms (7d, cache miss) Phase 1
- [ ] Full analytics page load Phase 2: total API time &lt; 1.5 s (preview)

### Ops

- [ ] `setup-analytics-pixel?phase=status` shows row counts + date range
- [ ] Re-run build job idempotent (same counts)
- [ ] Settings weight change triggers rebuild (Phase 2+)

### Coherence

- [ ] `/api/admin/orders-truth` for sample day matches KPI orders
- [ ] `DATA_COHERENCE.md` Reglas 1–6 satisfied

---

## 15. Open decisions (resolve in Phase 0)

| ID | Decision | Recommendation | Status |
|----|----------|----------------|--------|
| D1 | Include `TIME_DECAY` in Gold? | **Defer** until UI exposes it | Pending |
| D2 | HLL in 03 vs int visitor counts? | **Store ints** copied at build from `pixel_daily_aggregates` (±0.8% documented) | Pending |
| D3 | Org rebuild queue vs global batch? | **Global batch** v1; per-org queue if multi-tenant timeout | Pending |
| D4 | Auto replay attribution on window change? | **Yes** — enqueue existing reconcile + mart rebuild | Pending |
| D5 | Analytics page hardcoded NITRO? | **Fix in Phase 2** — use org default + `?model=` | Pending |
| D6 | Feature flag name | `USE_PIXEL_ANALYTICS_MART` env or detect table existence | Pending |

---

## 16. Rollback plan

| Scenario | Action |
|----------|--------|
| Gold numbers wrong | Set env flag off → API uses live fallback queries (Phase 1–2 requirement) |
| Build job overloads DB | Disable cron; revert to rollups-only |
| Bad DDL on prod | Tables are new — `DROP TABLE analytics_*` (no Bronze impact); redeploy previous API |
| Partial backfill | APIs fall back per-org/day where 03 missing |

**Do not** drop `pixel_daily_*` until Phase 3 complete.

---

## 17. Suggested PR sequence (Git)

Keep PRs small for review; all on feature branch until merge to `main`.

| PR | Contents | Depends on |
|----|----------|------------|
| PR-1 | `docs/nitropixel/sql/` prototypes + `setup-analytics-pixel` schema only | Phase 0.5 |
| PR-2 | Build jobs 01→03 + manual cron route | PR-1 deployed on preview Neon |
| PR-3 | `pixel/route` Gold read KPI + funnel + fallback | PR-2 backfill on preview |
| PR-4 | Funnel Compra fix (if separate) | — |
| PR-5 | Phase 2 tables + discrepancy/funnel routes | PR-3 validated |
| PR-6 | Settings invalidation + UI freshness | PR-5 |
| PR-7 | Remove fallbacks + `vercel.json` crons | Prod soak |

---

## 18. Timeline estimate (indicative)

| Phase | Effort | Calendar (focused) |
|-------|--------|-------------------|
| 0 + 0.5 | SQL prototyping + baseline | 2–4 days |
| 1 | DDL + batch + KPI read path | 5–8 days |
| 2 | Full analytics Gold | 5–7 days |
| 3 | Cleanup + fallbacks removed | 2–3 days |
| 4 | Prod backfill + crons + soak | 3–5 days + 7d monitor |

**Total:** ~3–4 weeks to prod with preview validation; parallel SQL work can shorten Phase 1.

---

## 19. Communication

| Audience | Message |
|----------|---------|
| Tomy (non-technical) | “Analytics will show data up to 15 minutes old, but pages load much faster; numbers stay consistent with KPIs.” |
| GitHub issue | Link this plan + `ANALYTICS.md`; update checklist as phases complete |
| `BACKLOG_PENDIENTES.md` | Add BP entry when work starts (prefix `BP-ANALYTICS-`) |

---

## 20. Related artifacts

| Artifact | Path |
|----------|------|
| Architecture & schemas | [`docs/nitropixel/ANALYTICS.md`](./ANALYTICS.md) |
| Funnel coherence finding | [`docs/issues/funnel-compra-ordenes-atribuidas.md`](../issues/funnel-compra-ordenes-atribuidas.md) |
| Rollup setup pattern | `src/app/api/admin/setup-pixel-rollups/route.ts` |
| Rollup cron pattern | `src/app/api/cron/refresh-pixel-rollups/route.ts` |
| Order filters | `src/lib/metrics/orders.ts` |

---

## 21. Summary

1. **Prototype in Neon SQL editor** (Phase 0.5) on preview branch.  
2. **Deploy DDL** via admin endpoint; **backfill manually** on preview.  
3. **Switch API read path** with fallback (Phase 1 KPI, Phase 2 full page).  
4. **Validate** latency + coherence before prod DDL.  
5. **Enable crons on `main`** only after preview sign-off (Phase 4).

No TypeScript implementation is specified in this document — only **what** to build, **in what order**, and **how to verify** each step.
