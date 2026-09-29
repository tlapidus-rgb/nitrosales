import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), persist: vi.fn(), token: vi.fn(), enrich: vi.fn(), claim: vi.fn(), checkpoint: vi.fn(), complete: vi.fn(), staff: vi.fn() }));
vi.mock("@/lib/admin-key", () => ({ ADMIN_API_KEY: "test-key" }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: m.staff }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRawUnsafe: m.query, $executeRawUnsafe: m.execute,
  connection: { findMany: async () => [{ organizationId: "org" }] },
} }));
vi.mock("@/lib/connectors/mercadolibre-seller", () => ({ getSellerToken: m.token }));
vi.mock("@/lib/connectors/ml-order-persistence", () => ({ persistMlOrder: m.persist }));
vi.mock("@/lib/connectors/mercadolibre-enrichment", () => ({ enrichOrderFromMl: m.enrich }));
vi.mock("@/lib/sync/jitter", () => ({ orgJitter: () => 0, sleep: async () => {} }));
vi.mock("@/lib/sync/retry", () => ({ retryWithBackoff: (fn: () => unknown) => fn(), isRetryableStatus: () => false }));
vi.mock("@/lib/connectors/ml-reconcile-progress", () => ({ claimReconcile: m.claim, checkpointReconcile: m.checkpoint, completeReconcile: m.complete }));
import { GET as reconcile } from "@/app/api/cron/ml-reconcile/route";
import { GET as reenrich } from "@/app/api/admin/ml-reenrich-fields/route";
const order = { id: 1, status: "paid", last_updated: "2026-09-01T00:00:00Z", date_created: "2026-08-01T00:00:00Z", order_items: [] };
const run = async () => (await reconcile(new NextRequest("http://localhost/api/cron/ml-reconcile"))).json();
beforeEach(() => {
  vi.resetAllMocks();
  m.staff.mockResolvedValue(true);
  m.claim.mockImplementation(async (organizationId, layer, from, toDate) => ({ organizationId, layer, toDate, leaseToken: "test-lease", cursor: [{ from: from.getTime(), to: toDate.getTime(), offset: 0 }] }));
  m.checkpoint.mockResolvedValue(true); m.complete.mockResolvedValue(true);
  m.query.mockImplementation(async (sql: string) => sql.startsWith("UPDATE orders") ? [{ id: "saved" }] : []); m.execute.mockResolvedValue(1);
  m.token.mockResolvedValue({ token: "test", mlUserId: 123 });
  m.persist.mockResolvedValue({ action: "updated", dbOrderId: "saved" });
  m.enrich.mockResolvedValue({ itemsCreated: 0 });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [order], paging: { total: 1 } }))));
});
afterEach(() => vi.unstubAllGlobals());
it("uses shared persistence and advances the watermark after a complete scan", async () => {
  expect(await run()).toMatchObject({ ok: true, totals: { updated: 1, errors: 0 } });
  expect(m.persist).toHaveBeenCalledWith("org", order, "APPROVED");
  expect(m.complete).toHaveBeenCalledTimes(1);
  expect(m.complete.mock.calls[0][0]).toMatchObject({ organizationId: "org", layer: "incremental" });
});
it("does not advance the watermark after a write failure", async () => {
  m.persist.mockRejectedValue(new Error("write failed"));
  expect(await run()).toMatchObject({ ok: false, totals: { errors: 1 } });
  expect(m.complete).not.toHaveBeenCalled();
});
it.each([
  { results: [], paging: { total: 1 } },
  { results: [], paging: { total: 1001 } },
  { results: {} },
  { results: [] },
  { results: [{ ...order, last_updated: "invalid" }], paging: { total: 1 } },
])("rejects truncated or malformed pages without a success watermark: %j", async data => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(data))));
  expect(await run()).toMatchObject({ ok: false, totals: { errors: 1 } });
  expect(m.complete).not.toHaveBeenCalled(); expect(m.persist).not.toHaveBeenCalled();
});
it("retains the previous boundary when fetching a later page fails", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ results: Array.from({ length: 50 }, (_, i) => ({ ...order, id: i + 1 })), paging: { total: 51 } })))
    .mockResolvedValueOnce(new Response("Unavailable", { status: 503 })));
  expect(await run()).toMatchObject({ ok: false, totals: { errors: 1, updated: 50 } });
  expect(m.complete).not.toHaveBeenCalled();
});
it("reports missing credentials as failure instead of zero errors", async () => {
  m.token.mockRejectedValue(new Error("secret internal error"));
  expect(await run()).toMatchObject({ ok: false, totals: { errors: 1 } });
  expect(fetch).not.toHaveBeenCalled(); expect(m.complete).not.toHaveBeenCalled();
});
it("does not silently clip an old unprocessed boundary to seven days", async () => {
  m.query.mockImplementation(async (sql: string) => sql.includes('FROM "sync_watermarks"')
    ? [{ lastSuccessfulSyncAt: new Date("2020-01-01T00:00:00Z") }] : sql.startsWith("UPDATE orders") ? [{ id: "saved" }] : []);
  await run();
  expect(decodeURIComponent(vi.mocked(fetch).mock.calls[0][0] as string)).toContain("2019-12-31T23:55:00.000Z");
});
it("accepts a verified empty search as complete", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [], paging: { total: 0 } }))));
  expect(await run()).toMatchObject({ ok: true, totals: { fetched: 0 } });
  expect(m.complete).toHaveBeenCalledTimes(1);
});
it("subdivides dense update windows without losing either half", async () => {
  const base = Date.parse("2026-09-01T00:00:00Z");
  m.query.mockImplementation(async (sql: string) => sql.includes('FROM "sync_watermarks"')
    ? [{ lastSuccessfulSyncAt: new Date(base) }] : sql.startsWith("UPDATE orders") ? [{ id: "saved" }] : []);
  const orders = Array.from({ length: 1500 }, (_, i) => ({ ...order, id: i + 1, last_updated: new Date(base + i * 1000).toISOString() }));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const q = new URL(url).searchParams;
    const from = Date.parse(q.get("order.date_last_updated.from")!);
    const to = Date.parse(q.get("order.date_last_updated.to")!);
    const offset = Number(q.get("offset"));
    expect(offset).toBeLessThan(1000);
    const matching = orders.filter(o => Date.parse(o.last_updated) >= from && Date.parse(o.last_updated) <= to);
    return new Response(JSON.stringify({ results: matching.slice(offset, offset + 50), paging: { total: matching.length } }));
  }));
  expect(await run()).toMatchObject({ ok: true, totals: { updated: 1500, errors: 0 } });
  expect(new Set(m.persist.mock.calls.map(([, value]) => value.id)).size).toBe(1500);
  expect(m.complete).toHaveBeenCalledTimes(1);
});
it.each([null, "wrong-id"])("does not count unsuccessful admin enrichment as success: %s", async failure => {
  m.query.mockResolvedValue([{ id: "saved", externalId: "1" }]);
  m.enrich.mockResolvedValue(null);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...order, id: failure === "wrong-id" ? 2 : 1 }))));
  const response = await reenrich(new NextRequest("http://localhost/api/admin/ml-reenrich-fields?orgId=org"));
  expect(await response.json()).toMatchObject({ ok: false, complete: false, enriched: 0, errors: 1 });
  if (failure === "wrong-id") expect(m.enrich).not.toHaveBeenCalled();
});

it("repairs incomplete same-version details before advancing coverage", async () => {
 m.persist.mockResolvedValue({ action: "skipped", dbOrderId: null });
 m.query.mockImplementation(async (sql: string) => {
   if (sql.includes('FROM "sync_watermarks"')) return [];
   if (sql.includes('SELECT "externalId"')) return [{ externalId: "1", externalUpdatedAt: new Date(order.last_updated), backfillEnrichedVersion: null }];
   return [{ id: "saved" }];
 });
 expect(await run()).toMatchObject({ ok: true });
 expect(m.enrich).toHaveBeenCalledTimes(1);
});
it("retains coverage after a detail enrichment failure", async () => {
 m.enrich.mockResolvedValue(null);
 expect(await run()).toMatchObject({ ok: false, totals: { errors: 1 } });
 expect(m.complete).not.toHaveBeenCalled();
});

it("resumes the persisted page using frozen bounds", async () => {
  m.claim.mockResolvedValue({ organizationId: "org", layer: "incremental", leaseToken: "test-lease", toDate: new Date("2026-09-02"),
    cursor: [{ from: Date.parse("2026-09-01"), to: Date.parse("2026-09-02"), offset: 50, total: 51 }] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [order], paging: { total: 51 } }))));
  expect(await run()).toMatchObject({ ok: true, totals: { updated: 1 } });
  const query = new URL(vi.mocked(fetch).mock.calls[0][0] as string).searchParams;
  expect(query.get("offset")).toBe("50");
  expect(query.get("order.date_last_updated.to")).toBe("2026-09-02T00:00:00.000Z");
});
it("retains a failed second page for retry without advancing coverage", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ results: Array.from({ length: 50 }, (_,i) => ({ ...order,id: i+1 })),paging: { total: 51 } })))
    .mockResolvedValueOnce(new Response("Failed",{ status: 503 })));
  expect(await run()).toMatchObject({ ok: false });
  expect(m.checkpoint).toHaveBeenLastCalledWith(expect.anything(),[expect.objectContaining({ offset: 50,total: 51 })],true);
  expect(m.complete).not.toHaveBeenCalled();
});
it("restarts a changed window without completing it", async () => {
  m.claim.mockResolvedValue({ organizationId: "org",layer: "incremental",leaseToken: "test",toDate: new Date(),
    cursor: [{ from: 0,to: Date.now(),offset: 50,total: 52 }] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [order],paging: { total: 51 } }))));
  expect(await run()).toMatchObject({ ok: false });
  expect(m.checkpoint).toHaveBeenLastCalledWith(expect.anything(),[expect.objectContaining({ offset: 0 })],true);
  expect(m.complete).not.toHaveBeenCalled();
});
it("does not process orders owned by another active worker", async () => {
  m.claim.mockResolvedValue(null);
  expect(await run()).toMatchObject({ ok: false,perOrg: [expect.objectContaining({ deferred: true })] });
  expect(fetch).not.toHaveBeenCalled(); expect(m.complete).not.toHaveBeenCalled();
});
it("stops before publishing success when ownership is lost", async () => {
  m.checkpoint.mockResolvedValue(false);
  expect(await run()).toMatchObject({ ok: false });
  expect(m.complete).not.toHaveBeenCalled();
});
it("preserves the existing staff or admin-key authorization", async () => {
  m.staff.mockResolvedValue(false);
  const response = await reconcile(new NextRequest("http://localhost/api/cron/ml-reconcile?key=wrong"));
  expect(response.status).toBe(403); expect(m.claim).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  const accepted = await reconcile(new NextRequest("http://localhost/api/cron/ml-reconcile?key=test-key&mode=deep"));
  expect(accepted.status).toBe(200);
  expect(m.claim).toHaveBeenCalledWith("org","deep",expect.any(Date),expect.any(Date));
});
