import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ ingest: vi.fn(), update: vi.fn(), orders: vi.fn(), reputation: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: {
 connection: { findFirst: async () => ({ id: "conn", organizationId: "org" }), findMany: async () => [{ id: "conn", organizationId: "org" }], update: m.update },
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
import { GET as cron } from "@/app/api/cron/ml-sync/route";
import { GET as sync } from "@/app/api/sync/mercadolibre/route";
import { GET as backfill } from "@/app/api/sync/mercadolibre/backfill/route";
const order = { id: 1, status: "paid", tags: ["delivered"], date_created: new Date(Date.now() - 86400000).toISOString() };
beforeEach(() => {
 vi.resetAllMocks(); m.ingest.mockResolvedValue({ enriched: true, action: "updated", itemsCreated: 1 });
 m.orders.mockResolvedValue([order]);
 m.reputation.mockResolvedValue({ level: "green", powerSeller: false, transactions: {}, ratings: {}, metrics: { claims: {}, delayed: {}, cancellations: {} } });
 vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(order))));
});
afterEach(() => vi.unstubAllGlobals());
it.each([{ name: "cron", run: cron }, { name: "sync", run: sync }, { name: "backfill", run: backfill }])("$name uses shared ingestion with canonical tags", async ({ run }) => {
 const response = await run(new NextRequest("http://localhost/api/test?step=orders"));
 expect((await response.json()).ok).toBe(true);
 expect(m.ingest).toHaveBeenCalledWith("org", order, "DELIVERED", "test");
});
it.each([{ name: "cron", run: cron }, { name: "sync", run: sync }, { name: "backfill", run: backfill }])("$name does not report success for failed enrichment", async ({ run }) => {
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
