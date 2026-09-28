import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ query: vi.fn(), upsert: vi.fn(), enrichVtex: vi.fn(), enrichMl: vi.fn(), detail: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRawUnsafe: m.query, connection: { findFirst: async () => ({ credentials: { accountName: "synthetic", appKey: "fake", appToken: "fake" } }) }, order: { upsert: m.upsert } } }));
vi.mock("@/lib/crypto", () => ({ decryptCredentials: () => ({}) }));
vi.mock("@/lib/connectors/vtex-enrichment", () => ({ fetchVtexOrderDetail: m.detail, enrichOrderFromVtex: m.enrichVtex }));
vi.mock("@/lib/pixel/attribute-order-by-match", () => ({ attributeOrderByMatch: async () => {} }));
vi.mock("@/lib/connectors/mercadolibre-seller", () => ({ getSellerToken: async () => ({ token: "fake", mlUserId: 1 }) }));
vi.mock("@/lib/connectors/mercadolibre-enrichment", () => ({ enrichOrderFromMl: m.enrichMl }));
import { processVtexChunk } from "@/lib/backfill/processors/vtex-processor";
import { processMercadoLibreChunk } from "@/lib/backfill/processors/ml-processor";
const job = { organizationId: "synthetic", fromDate: "2026-09-01T00:00:00.000Z", toDate: "2026-09-02T00:00:00.000Z", totalEstimate: 3, cursor: {} };
beforeEach(() => {
 vi.resetAllMocks(); m.detail.mockResolvedValue({}); m.enrichVtex.mockResolvedValue({ itemsCreated: 1 });
 m.upsert.mockResolvedValue({ id: "saved" });
 m.enrichMl.mockResolvedValue({ itemsCreated: 1 });
 vi.spyOn(console, "warn").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each(["write", "detail", "enrichment"])("VTEX retains a partially failed page after %s failure and counts it once on retry", async failure => {
 const list = [1,2,3].map(id => ({ orderId: String(id), creationDate: job.fromDate, totalValue: 1000 }));
 vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ list, paging: { total: 3 } }))));
 if (failure === "write") m.upsert.mockRejectedValueOnce(new Error("transient"));
 if (failure === "detail") m.detail.mockResolvedValueOnce(null);
 if (failure === "enrichment") m.enrichVtex.mockResolvedValueOnce(null);
 const first = await processVtexChunk(job);
 expect(first).toMatchObject({ isComplete: false, itemsProcessed: 0, newCursor: { page: 1 } }); expect(first.error).toBeTruthy();
 const second = await processVtexChunk({ ...job, cursor: first.newCursor });
 expect(second).toMatchObject({ isComplete: true, itemsProcessed: 3 });
});
it("ML retains one failed order out of three and counts existing orders on retry", async () => {
 const results = [1,2,3].map(id => ({ id, date_created: job.fromDate, last_updated: job.fromDate }));
 vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results, paging: { total: 3 } }))));
 const saved = new Set<string>(); let fail = true;
 m.query.mockImplementation(async (sql: string, ...args: unknown[]) => {
  if (sql.includes("UPDATE orders")) return [{ id: String(args[0]) }];
  if (sql.includes("INSERT INTO")) {
   const id = String(args[0]); if (id === "2" && fail) { fail = false; throw new Error("transient"); }
   saved.add(id); return [{ id, inserted: true }];
  }
  return [...saved].map(externalId => ({ id: externalId, externalId, externalUpdatedAt: new Date(job.fromDate), backfillEnrichedVersion: new Date(job.fromDate) }));
 });
 const first = await processMercadoLibreChunk(job);
 expect(first).toMatchObject({ isComplete: false, itemsProcessed: 0, newCursor: { offset: 0 } }); expect(first.error).toBeTruthy();
 const second = await processMercadoLibreChunk({ ...job, cursor: first.newCursor });
 expect(second).toMatchObject({ isComplete: true, itemsProcessed: 3 }); expect(saved.size).toBe(3);
});
it("does not treat a malformed VTEX response as a completed empty window", async () => {
 vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
 expect(await processVtexChunk(job)).toMatchObject({ isComplete: false, error: "Respuesta de órdenes VTEX inválida" });
});
it("ML retries failed enrichment even when the basic order is already current", async () => {
 const results = [{ id: 1, date_created: job.fromDate, last_updated: job.fromDate }];
 vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results, paging: { total: 1 } }))));
 let saved = false;
 m.query.mockImplementation(async (sql: string) => {
  if (sql.includes("INSERT INTO")) { saved = true; return [{ id: "saved", inserted: true }]; }
  return saved ? [{ id: "saved", externalId: "1", externalUpdatedAt: new Date(job.fromDate) }] : [];
 });
 m.enrichMl.mockResolvedValueOnce(null);
 const first = await processMercadoLibreChunk(job);
 expect(first).toMatchObject({ isComplete: false, itemsProcessed: 0, newCursor: { retryEnrichmentIds: ["1"] } });
 const second = await processMercadoLibreChunk({ ...job, cursor: JSON.parse(JSON.stringify(first.newCursor)) });
 expect(second).toMatchObject({ isComplete: true, itemsProcessed: 1 });
 expect(m.enrichMl).toHaveBeenCalledTimes(2);
});
it.each([true, false])("VTEX subdivides dense windows (recent=%s) without skipping or double-counting boundary orders", async recent => {
 const denseEnd = Date.parse(recent ? "2026-09-07" : "2026-09-02");
 const orders = Array.from({ length: 3100 }, (_, i) => ({ orderId: String(i), creationDate: new Date(denseEnd - i * 1000).toISOString(), totalValue: 100 }));
 orders.push({ orderId: "start", creationDate: "2026-09-01T00:00:00.000Z", totalValue: 100 }, { orderId: "end", creationDate: "2026-09-08T00:00:00.000Z", totalValue: 100 });
 const saved = new Set<string>();
 m.upsert.mockImplementation(async ({ create }: any) => { saved.add(create.externalId); return { id: create.externalId }; });
 vi.stubGlobal("fetch", vi.fn(async (url: string) => {
  const q = new URL(url).searchParams;
  const bounds = q.get("f_creationDate")!.match(/\[(.*) TO (.*)\]/)!;
  const page = Number(q.get("page")), size = Number(q.get("per_page")); expect(page).toBeLessThanOrEqual(30);
  const matches = orders.filter(o => o.creationDate >= bounds[1] && o.creationDate <= bounds[2]).sort((a,b) => b.creationDate.localeCompare(a.creationDate));
  return new Response(JSON.stringify({ list: matches.slice((page - 1) * size, page * size), paging: { total: matches.length } }));
 }));
 let current = { ...job, fromDate: "2026-09-01T00:00:00.000Z", toDate: "2026-09-08T00:00:00.000Z" }, count = 0, complete = false;
 for (let i = 0; i < 80; i++) {
  const result = await processVtexChunk(current); expect(result.error).toBeUndefined(); count += result.itemsProcessed;
  current = { ...current, cursor: JSON.parse(JSON.stringify(result.newCursor)) };
  if (result.isComplete) { complete = true; break; }
 }
 expect(complete).toBe(true); expect([...saved].sort()).toEqual(orders.map(o => o.orderId).sort()); expect(count).toBe(orders.length);
});
it("VTEX refuses an indivisible overflow instead of claiming completion", async () => {
 vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ list: [], paging: { total: 3001 } }))));
 let current = { ...job, fromDate: job.toDate };
 const result = await processVtexChunk(current);
 expect(result.isComplete).toBe(false); expect(result.error).toContain("mismo instante");
});
it.each([{}, { results: [], paging: { total: 10 } }, { results: {}, paging: { total: 0 } }])("ML does not complete on a malformed or truncated response: %j", async payload => {
 vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload))));
 const result = await processMercadoLibreChunk(job);
 expect(result.isComplete).toBe(false); expect(result.error).toBeTruthy(); expect(m.query).not.toHaveBeenCalled();
});
