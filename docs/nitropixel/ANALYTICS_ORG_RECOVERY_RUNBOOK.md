# NitroPixel — Org Recovery Runbook (empty analytics)

> **Status:** Operational runbook  
> **Last updated:** 2026-06-14  
> **Pilot org:** `cmohl80fx009j1sdusurp7fbj` (replace if recovering another org)  
> **Related:** [`ANALYTICS_NEON_SQL_RUNBOOK.md`](./ANALYTICS_NEON_SQL_RUNBOOK.md), [`ANALYTICS_MIGRATION_PLAN.md`](./ANALYTICS_MIGRATION_PLAN.md)

Use this when **`/pixel/analytics` shows all zeros** but the pixel appears LIVE (`lastHourEvents` > 0).

---

## What we already know (pilot org)

| Check | Result | Implication |
|-------|--------|-------------|
| API response shape | Full JSON (no `_timeoutMs`, no `_demoMode`) | Not the 25s empty mock — API ran |
| `lastHourEvents` | ~13,363 | `pixel_events` ingesting |
| `pixel_daily_aggregates` | `rollup_days ≈ 1`, no usable range | **Rollups not backfilled** → visitors/funnel = 0 |
| Orders in range (Jun 8–15) | **0** | **No VTEX orders in DB** → revenue/orders = 0 |
| Attributions NITRO in range | **0** | Expected while orders = 0 |
| `lastEventAt` | Year **4226** (bad row) | Corrupt timestamp on `MAX(timestamp)` — cleanup optional |

**Two independent fixes:**

1. **Track A — Rollups** → visitor/funnel/page-view KPIs  
2. **Track B — Orders + attribution** → revenue, Órdenes Atribuidas, ROAS  

Both must succeed for a full dashboard.

---

## Code changes required?

| Type | Required to fix this org? |
|------|---------------------------|
| **Application code changes** | **No** — admin endpoints already exist |
| **SQL in Neon** | Diagnostics + optional bad-row cleanup |
| **Admin HTTP calls** | **Yes** — rollup backfill, VTEX sync, broadcaster |
| **Optional future code** | See [§ Optional code improvements](#optional-code-improvements-future-prs) |

---

## Environment: preview first, then prod

| Step | Preview branch | Production |
|------|----------------|------------|
| Validate rollup backfill | ✅ Recommended | After preview sign-off |
| Fix live customer data | ❌ Preview DB is a snapshot | ✅ `nitrosales.vercel.app` |
| Crons | Manual admin calls only | `refresh-pixel-rollups` every 2h |

Replace `BASE_URL`:

- Preview: `https://<your-branch>-nitrosales.vercel.app`
- Prod: `https://nitrosales.vercel.app`

Replace `ADMIN_API_KEY` with the value from Vercel env (never commit it).

Set once per session:

```bash
export BASE_URL="https://nitrosales.vercel.app"   # or preview URL
export ADMIN_API_KEY="<from-vercel-env>"
export ORG_ID="cmohl80fx009j1sdusurp7fbj" #arredo
```

---

## Phase 0 — Baseline diagnostics (Neon SQL)

Run on the **same Neon branch** the app uses (preview or prod).

### 0.1 Org identity

```sql
SELECT id, name, slug, "createdAt"
FROM organizations
WHERE id = 'cmohl80fx009j1sdusurp7fbj';
```
Result:
cmohl80fx009j1sdusurp7fbj	Arredo	arredo	2026-04-27 19:25:56.925

Save `name` and `slug` — some admin routes accept `orgSlug=arredo` instead of id.

### 0.2 Event volume (pixel alive?)

```sql
SELECT
  COUNT(*)::bigint AS events_all_time,
  COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '1 hour')::int AS events_last_hour,
  MIN(timestamp) AS first_event,
  MAX(timestamp) AS last_event
FROM pixel_events
WHERE "organizationId" = 'cmohl80fx009j1sdusurp7fbj';
```
Result:
#	events_all_time	events_last_hour	first_event	last_event
1	12774337	216	1978-06-06 14:34:11.623+00	4226-06-10 00:58:07.001+00

### 0.3 Rollup coverage

```sql
SELECT
  COUNT(*)::int AS rollup_days,
  MIN(day) AS min_day,
  MAX(day) AS max_day
FROM pixel_daily_aggregates
WHERE "organizationId" = 'cmohl80fx009j1sdusurp7fbj';

SELECT *
FROM pixel_daily_aggregates
WHERE "organizationId" = 'cmohl80fx009j1sdusurp7fbj';
```

**Target after Track A:** `rollup_days` covers your UI date range (e.g. Jun 8–15).

### 0.4 First-source dimension (required before backfill)

```sql
SELECT COUNT(*)::int AS first_source_rows
FROM pixel_visitor_first_source
WHERE "organizationId" = 'cmohl80fx009j1sdusurp7fbj';
```

If **0** but events exist → run `phase=first-source` before backfill.

### 0.5 Orders (Track B)

```sql
SELECT
  COUNT(*)::int AS orders_all_time,
  MIN("orderDate") AS first_order,
  MAX("orderDate") AS last_order
FROM orders
WHERE "organizationId" = 'cmohl80fx009j1sdusurp7fbj';

SELECT COUNT(*)::int AS orders_in_range
FROM orders
WHERE "organizationId" = 'cmohl80fx009j1sdusurp7fbj'
  AND "orderDate" >= '2026-06-08'::timestamptz
  AND "orderDate" < '2026-06-16'::timestamptz;
```

### 0.6 Attributions

```sql
SELECT COUNT(*)::int AS attr_nitro_all_time
FROM pixel_attributions
WHERE "organizationId" = 'cmohl80fx009j1sdusurp7fbj'
  AND model::text = 'NITRO';

SELECT COUNT(*)::int AS attr_nitro_in_range
FROM pixel_attributions pa
JOIN orders o ON o.id = pa."orderId"
WHERE pa."organizationId" = 'cmohl80fx009j1sdusurp7fbj'
  AND pa.model::text = 'NITRO'
  AND o."orderDate" >= '2026-06-08'::timestamptz
  AND o."orderDate" < '2026-06-16'::timestamptz;
```

### 0.7 VTEX connection

```sql
SELECT id, platform, status, "storeUrl", "lastSyncAt", "createdAt", "updatedAt"
FROM connections
WHERE "organizationId" = 'cmohl80fx009j1sdusurp7fbj'
ORDER BY "createdAt" DESC;
```

Expect an active **VTEX** row with recent activity.

### 0.8 Webhook vs browser events (last 7 days)

```sql
SELECT
  COUNT(*) FILTER (WHERE "sessionId" LIKE 'webhook-%')::int AS webhook_events,
  COUNT(*) FILTER (WHERE "sessionId" IS NULL OR "sessionId" NOT LIKE 'webhook-%')::int AS browser_events
FROM pixel_events
WHERE "organizationId" = 'cmohl80fx009j1sdusurp7fbj'
  AND timestamp > NOW() - INTERVAL '7 days';
```

Many browser events + zero webhook events → Orders Broadcaster likely missing.

### 0.9 Corrupt future timestamps

```sql
SELECT id, type, timestamp, "sessionId", "pageUrl"
FROM pixel_events
WHERE "organizationId" = 'cmohl80fx009j1sdusurp7fbj'
  AND timestamp > NOW() + INTERVAL '1 year'
ORDER BY timestamp DESC
LIMIT 20;
```

---

## Phase 1 — Track A: Fix rollups (visitor / funnel KPIs)

**Fixes:** `kpis.*`, `funnel.*`, `deviceBreakdown`, `eventTypes`, etc.  
**Does not fix:** `businessKpis`, revenue, orders.

### 1.1 Ensure indexes (once per DB)

```bash
curl -s "$BASE_URL/api/admin/ensure-indexes?key=$ADMIN_API_KEY" | jq .
```

### 1.2 Rollup schema

```bash
curl -s -X POST "$BASE_URL/api/admin/setup-pixel-rollups?phase=schema&key=$ADMIN_API_KEY" | jq .
```

### 1.3 First-touch dimension (loop until `done: true`)

```bash
curl -s -X POST "$BASE_URL/api/admin/setup-pixel-rollups?phase=first-source&key=$ADMIN_API_KEY" | jq .
```

Repeat the same command until JSON shows `"done": true`. Large orgs may need **dozens** of calls.

### 1.4 Backfill rollups (loop until `done: true`)

Pick window covering UI range + buffer:

```bash
FROM=2026-06-01
TO=2026-06-15

curl -s -X POST \
  "$BASE_URL/api/admin/setup-pixel-rollups?phase=backfill&from=$FROM&to=$TO&key=$ADMIN_API_KEY" \
  | jq .
```

If response has `"done": false`, use `nextCursor` or `resume` URL from the JSON:

```bash
CURSOR=2026-06-05   # example from response

curl -s -X POST \
  "$BASE_URL/api/admin/setup-pixel-rollups?phase=backfill&from=$FROM&to=$TO&cursor=$CURSOR&key=$ADMIN_API_KEY" \
  | jq .
```

**Automated loop (bash)** — run until `done: true`:

```bash
FROM=2026-06-01
TO=2026-06-15
CURSOR=""
while true; do
  URL="$BASE_URL/api/admin/setup-pixel-rollups?phase=backfill&from=$FROM&to=$TO&key=$ADMIN_API_KEY"
  [ -n "$CURSOR" ] && URL="${URL}&cursor=${CURSOR}"
  RESP=$(curl -s -X POST "$URL")
  echo "$RESP" | jq '{done, lastDayDone, nextCursor, daysProcessedThisCall, error}'
  DONE=$(echo "$RESP" | jq -r '.done')
  [ "$DONE" = "true" ] && echo "Backfill complete." && break
  CURSOR=$(echo "$RESP" | jq -r '.nextCursor // empty')
  [ -z "$CURSOR" ] && echo "No cursor; check error above." && break
  sleep 2
done
```

### 1.5 Verify rollups

**HTTP:**

```bash
curl -s "$BASE_URL/api/admin/setup-pixel-rollups?phase=status&key=$ADMIN_API_KEY" | jq .
```

**SQL:**

```sql
SELECT COUNT(*)::int AS rollup_days, MIN(day), MAX(day)
FROM pixel_daily_aggregates
WHERE "organizationId" = 'cmohl80fx009j1sdusurp7fbj';
```

**API spot-check** (logged-in session or warm-cache with org):

```bash
curl -s "$BASE_URL/api/metrics/pixel?from=2026-06-08&to=2026-06-15&model=NITRO" \
  -H "Cookie: <session-cookie>" | jq '{kpis: .kpis, funnel: .funnel, _timeoutMs, _demoMode}'
```

Expect `totalVisitors` / `funnel.pageView` **> 0** if events exist in range.  
`businessKpis` may still be 0 until Track B.

---

## Phase 2 — Track B: Fix orders (revenue / order KPIs)

**Fixes:** `businessKpis.ordersAttributed`, `webOrders`, `pixelRevenue`, etc.

### 2.1 Check VTEX Orders Broadcaster (read-only)

Use org **slug** or **id** (endpoint resolves both):

```bash
# Replace arredo with slug from Phase 0.1 if different
curl -s "$BASE_URL/api/admin/debug-vtex-hook-config?key=$ADMIN_API_KEY&orgSlug=arredo" | jq .
```

Check `analysis`:

| Field | Want |
|-------|------|
| `hasHook` | `true` |
| `hasOrgQueryParam` | `true` (`?org=<orgId>`) |
| `isOurDomain` | `true` (nitrosales URL) |

### 2.2 Dry-run broadcaster config

```bash
curl -s "$BASE_URL/api/admin/vtex-configure-broadcaster?key=$ADMIN_API_KEY&orgId=$ORG_ID&dryRun=1" | jq .
```

Review `payload.hook.url` — must include `org=$ORG_ID`.

### 2.3 Apply broadcaster (production only after review)

Per `CLAUDE.md` / `ERRORES_CLAUDE_NO_REPETIR.md`: capture current config, deploy receiver, dry-run first.

```bash
curl -s -X POST "$BASE_URL/api/admin/vtex-configure-broadcaster?key=$ADMIN_API_KEY&orgId=$ORG_ID" | jq .
```

Re-run **2.1** to confirm VTEX shows the hook.

**Rollback:**

```bash
curl -s -X DELETE "$BASE_URL/api/admin/vtex-configure-broadcaster?key=$ADMIN_API_KEY&orgId=$ORG_ID" | jq .
```

### 2.4 Manual order sync from VTEX (diagnostic + backfill)

Lists VTEX orders and replays webhook handler (max 30–200 per call):

```bash
curl -s "$BASE_URL/api/admin/trigger-vtex-sync?key=$ADMIN_API_KEY&orgId=$ORG_ID&from=2026-06-08&to=2026-06-15&max=50" | jq .
```

Repeat with pagination / wider range if needed. Inspect per-order `webhookStatus` / errors in response.

### 2.5 Verify orders in DB

```sql
SELECT COUNT(*)::int AS orders_in_range
FROM orders
WHERE "organizationId" = 'cmohl80fx009j1sdusurp7fbj'
  AND "orderDate" >= '2026-06-08'::timestamptz
  AND "orderDate" < '2026-06-16'::timestamptz;
```

**Admin cross-check:**

```bash
curl -s "$BASE_URL/api/admin/orders-truth?key=$ADMIN_API_KEY&orgId=$ORG_ID&date=2026-06-13&model=NITRO" | jq .
```

---

## Phase 3 — Track B: Fix attributions

Only after orders exist in DB.

### 3.1 Re-attribute orders missing NITRO row

Uses **org slug** in query param (not id):

```bash
curl -s -X POST \
  "$BASE_URL/api/admin/reattribute-missing-vtex?key=$ADMIN_API_KEY&orgSlug=arredo&days=14&max=100" \
  | jq .
```

Repeat until `stillMissing` is 0 or response shows no work left.

### 3.2 Verify attributions

```sql
SELECT COUNT(*)::int AS attr_nitro_in_range
FROM pixel_attributions pa
JOIN orders o ON o.id = pa."orderId"
WHERE pa."organizationId" = 'cmohl80fx009j1sdusurp7fbj'
  AND pa.model::text = 'NITRO'
  AND o."orderDate" >= '2026-06-08'::timestamptz
  AND o."orderDate" < '2026-06-16'::timestamptz;
```

---

## Phase 4 — Optional: corrupt timestamp cleanup

**Symptom:** `liveStatus.lastEventAt` shows year 4226.

**Step 1 — inspect only:**

```sql
SELECT id, type, timestamp, "sessionId"
FROM pixel_events
WHERE "organizationId" = 'cmohl80fx009j1sdusurp7fbj'
  AND timestamp > NOW() + INTERVAL '1 year';
```

**Step 2 — delete bad rows (irreversible — review IDs first, prod only with approval):**

```sql
-- ⚠️ DESTRUCTIVE — run only after reviewing SELECT results
DELETE FROM pixel_events
WHERE "organizationId" = 'cmohl80fx009j1sdusurp7fbj'
  AND timestamp > NOW() + INTERVAL '1 year';
```

Then re-run **Phase 1.4** for affected days if needed.

**No app code required** for this cleanup.

---

## Phase 5 — End-to-end verification

### Checklist

| # | Check | Pass criteria |
|---|--------|----------------|
| 1 | Rollup SQL | `rollup_days` ≥ days in UI range |
| 2 | Orders SQL | `orders_in_range` > 0 |
| 3 | Attributions SQL | `attr_nitro_in_range` > 0 (or explain low coverage) |
| 4 | `/api/metrics/pixel` | `kpis.totalVisitors` > 0, `businessKpis.ordersAttributed` > 0 |
| 5 | UI `/pixel/analytics` | KPI strip + funnel non-zero; hard refresh if cached |
| 6 | `orders-truth` | Counts align with KPI strip |

### Record results

| Metric | Before | After Track A | After Track B |
|--------|--------|---------------|---------------|
| rollup_days | 1 | | |
| orders_in_range | 0 | | |
| attr_nitro_in_range | 0 | | |
| funnel.pageView (API) | 0 | | |
| businessKpis.ordersAttributed | 0 | | |

---

## Optional code improvements (future PRs)

**Not required** to recover this org today. Consider later:

| Improvement | Why |
|-------------|-----|
| Validate `timestamp` on pixel ingest (reject year > 2100) | Prevents 4226-style corrupt `MAX(timestamp)` |
| `setup-pixel-rollups?organizationId=` filter | Backfill one org without processing all tenants |
| Auto-run rollup schema + first-source on org activation | Prevents empty rollups for new large clients |
| Onboarding checklist: Orders Broadcaster + rollup backfill | Same root cause as TVC/Arredo in session 60 |
| Surface `_timeoutMs` / empty mock in UI | Easier ops debugging |

Existing endpoints (no changes needed):

| Endpoint | Role |
|----------|------|
| `POST /api/admin/setup-pixel-rollups` | Rollup schema, first-source, backfill |
| `GET /api/admin/setup-pixel-rollups?phase=status` | Rollup health |
| `GET /api/admin/ensure-indexes` | DB indexes |
| `GET /api/admin/debug-vtex-hook-config` | Read VTEX broadcaster |
| `POST /api/admin/vtex-configure-broadcaster` | Configure broadcaster |
| `GET /api/admin/trigger-vtex-sync` | Pull orders from VTEX |
| `POST /api/admin/reattribute-missing-vtex` | Backfill attributions |
| `GET /api/admin/orders-truth` | Coherence audit |
| `GET /api/cron/refresh-pixel-rollups` | Keeps last 3 days fresh (prod cron) |

---

## Quick decision tree

```text
Pixel events > 0 ?
  ├─ NO  → fix pixel install / orgId in script URL
  └─ YES → rollup_days covers UI range ?
         ├─ NO  → Phase 1 (Track A)
         └─ YES → orders_in_range > 0 ?
                ├─ NO  → Phase 2 (VTEX connection, broadcaster, trigger-vtex-sync)
                └─ YES → attr_nitro > 0 ?
                       ├─ NO  → Phase 3 (reattribute-missing-vtex)
                       └─ YES → dashboard should work; check cache / date range
```

---

## References

- Rollup design: `src/app/api/admin/setup-pixel-rollups/route.ts`
- Rollup cron: `src/app/api/cron/refresh-pixel-rollups/route.ts`
- TVC/Arredo broadcaster pattern: `ERRORES_CLAUDE_NO_REPETIR.md` (session 60), `CLAUDE_STATE.md`
- Coherence rules: `DATA_COHERENCE.md`
