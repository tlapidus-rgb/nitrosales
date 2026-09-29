import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ ingest: vi.fn(), update: vi.fn(), orders: vi.fn(), reputation: vi.fn(), connections: vi.fn(), chunk: vi.fn(), claim: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: {
 connection: { findFirst: async () => ({ id: "conn", organizationId: "org" }), findMany: m.connections, update: m.update },
 order: { findMany: async () => [{ id: "saved", externalId: "1" }], count: async () => 1 },
 mlSellerMetricDaily: { upsert: async () => {} },
} }));
vi.mock("@/lib/connectors/ml-order-ingestion", () => ({ ingestMlOrder: m.ingest }));
vi.mock("@/lib/admin-key", () => ({ isValidAdminKey: () => true }));
vi.mock("@/lib/connectors/mercadolibre-seller", () => ({
 getSellerToken: async () => ({ token: "test", mlUserId: 1 }),
 fetchSellerOrders: m.orders, fetchSellerReputation: m.reputation,
 fetchSellerListings: async () => [], fetchSellerQuestions: async () => [],
}));
vi.mock("@/lib/backfill/processors/ml-processor", () => ({ processMercadoLibreChunk: m.chunk }));
vi.mock("@/lib/connectors/ml-sync-progress", () => ({ claimMlSync: m.claim, saveMlSync: m.save, orderMlConnections: async (rows: unknown[]) => rows }));
vi.mock("@/lib/connectors/ml-session-connection", () => ({ mlSessionConnection: async () => ({ connection: { id: "conn", organizationId: "org" } }) }));
import { GET as cron } from "@/app/api/cron/ml-sync/route";
import { GET as sync } from "@/app/api/sync/mercadolibre/route";
import { GET as backfill } from "@/app/api/sync/mercadolibre/backfill/route";
const order = { id: 1, status: "paid", tags: ["delivered"], date_created: new Date(Date.now() - 86400000).toISOString() };
beforeEach(() => {
 vi.resetAllMocks(); m.ingest.mockResolvedValue({ enriched: true, action: "updated", itemsCreated: 1 });
 m.connections.mockResolvedValue([{ id: "conn", organizationId: "org" }]);
 m.orders.mockResolvedValue([order]);
 m.claim.mockResolvedValue({ organizationId: "org", cursor: { offset: 50 }, leaseToken: "test" });
 m.chunk.mockResolvedValue({ itemsProcessed: 1, newCursor: {}, isComplete: true }); m.save.mockResolvedValue(true);
 m.reputation.mockResolvedValue({ level: "green", powerSeller: false, transactions: {}, ratings: {}, metrics: { claims: {}, delayed: {}, cancellations: {} } });
 vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(order))));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it.each([{ name: "sync", run: sync }, { name: "backfill", run: backfill }])("$name uses shared ingestion with canonical tags", async ({ run }) => {
 const response = await run(new NextRequest("http://localhost/api/test?step=orders"));
 expect((await response.json()).ok).toBe(true);
 expect(m.ingest).toHaveBeenCalledWith("org", order, "DELIVERED", "test");
});
it.each([{ name: "sync", run: sync }, { name: "backfill", run: backfill }])("$name does not report success for failed enrichment", async ({ run }) => {
 m.ingest.mockRejectedValue(new Error("incomplete"));
 const response = await run(new NextRequest("http://localhost/api/test?step=orders"));
 expect((await response.json()).ok).toBe(false);
 for (const [args] of m.update.mock.calls) expect(args.data.lastSuccessfulSyncAt).toBeUndefined();
});
it("fee repairs also use versioned ingestion and preserve failure visibility", async () => {
 m.ingest.mockRejectedValue(new Error("incomplete"));
 const response = await backfill(new NextRequest("http://localhost/api/test?step=fees"));
 expect(await response.json()).toMatchObject({ ok: false, updated: 0 });
 expect(m.ingest).toHaveBeenCalledWith("org", order, "DELIVERED", "test");
 expect(m.update.mock.calls[0][0].data.lastSuccessfulSyncAt).toBeUndefined();
});
it("stops starting orders and reputation work after the cooperative budget", async () => {
 let clock = Date.now();
 vi.spyOn(Date, "now").mockImplementation(() => clock);
 m.chunk.mockImplementation(async () => { clock += 240001; return { itemsProcessed: 0, newCursor: {}, isComplete: false }; });
 m.connections.mockResolvedValue([{ id: "conn", organizationId: "org" }, { id: "other", organizationId: "other" }]);
 const response = await cron(new NextRequest("http://localhost/api/test"));
 expect(await response.json()).toMatchObject({ ok: false, orgsProcessed: 1, orgsDeferred: 1 });
 expect(m.ingest).not.toHaveBeenCalled();
 expect(m.reputation).not.toHaveBeenCalled();
 expect(m.update.mock.calls[0][0].data.lastSuccessfulSyncAt).toBeUndefined();
 expect(m.chunk).toHaveBeenCalledTimes(1);
});

it("cron resumes saved cursor and confirms before reporting completion", async () => {
 const res = await cron(new NextRequest("http://localhost/api/test"));
 expect((await res.json()).ok).toBe(true);
 expect(m.chunk.mock.calls[0][0].cursor).toEqual({ offset: 50 });
 expect(m.chunk.mock.calls[0][1].maxPages).toBe(10);
 expect(m.save).toHaveBeenCalledTimes(1);
});
it("cron preserves partial progress without marking connection successful", async () => {
 m.chunk.mockResolvedValue({ itemsProcessed: 50, newCursor: { offset: 100 }, isComplete: false });
 expect((await (await cron(new NextRequest("http://localhost/api/test"))).json()).ok).toBe(false);
 expect(m.save.mock.calls[0][1].newCursor).toEqual({ offset: 100 });
 expect(m.update.mock.calls[0][0].data.lastSuccessfulSyncAt).toBeUndefined();
});
it.each(["busy", "lost"])("cron stops for a %s lease", async mode => {
 if (mode === "busy") m.claim.mockResolvedValue(null); else m.save.mockResolvedValue(false);
 expect((await (await cron(new NextRequest("http://localhost/api/test"))).json()).ok).toBe(false);
 expect(m.reputation).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
 if (mode === "busy") expect(m.chunk).not.toHaveBeenCalled();
});
