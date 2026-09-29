import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ query: vi.fn(), enrich: vi.fn(), search: vi.fn(), connection: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRawUnsafe: m.query, connection: { findFirst: m.connection } } }));
vi.mock("@/lib/connectors/mercadolibre-enrichment", () => ({ enrichOrderFromMl: m.enrich }));
vi.mock("@/lib/connectors/mercadolibre-seller", () => ({ getSellerToken: async () => ({ token: "test", mlUserId: 1 }), fetchSellerOrders: m.search }));
import { GET } from "@/app/api/sync/mercadolibre/enrich-items/route";
const order = { id: "external", date_created: new Date(Date.now() - 86400000).toISOString(), order_items: [] };
beforeEach(() => {
 vi.resetAllMocks();
 m.connection.mockResolvedValue({ id: "conn", organizationId: "org" });
 m.query.mockResolvedValue([{ id: "saved", externalId: "external" }]);
 m.search.mockResolvedValue([order]); m.enrich.mockResolvedValue({ itemsCreated: 0 });
});
it.each([false, true])("uses transactional enrichment without an early item delete (force=%s)", async force => {
 const res = await GET(new NextRequest(`http://localhost/api/test?force=${force}`));
 expect(await res.json()).toMatchObject({ ok: true, complete: true, enriched: 1 });
 expect(m.enrich).toHaveBeenCalledWith("saved", "org", order, "test");
 expect(m.query).toHaveBeenCalledTimes(1);
 expect(m.query.mock.calls[0][0]).toContain("o.source='MELI'");
 expect(m.query.mock.calls[0][0]).not.toMatch(/DELETE|INSERT/);
 expect(m.query.mock.calls[0].slice(1)).toEqual(["org", ["external"], force]);
});
it("reports refused/failed enrichment as incomplete", async () => {
 m.enrich.mockResolvedValue(null);
 expect(await (await GET(new NextRequest("http://localhost/api/test?force=true"))).json())
  .toMatchObject({ ok: false, complete: false, enriched: 0, errors: 1 });
});
it("does not enrich orders absent from the scoped selection", async () => {
 m.query.mockResolvedValue([]);
 expect(await (await GET(new NextRequest("http://localhost/api/test"))).json()).toMatchObject({ enriched: 0, ordersToEnrich: 0 });
 expect(m.enrich).not.toHaveBeenCalled();
});
it("does not claim success when the provider search fails", async () => {
 m.search.mockRejectedValue(new Error("incomplete search"));
 expect((await GET(new NextRequest("http://localhost/api/test"))).status).toBe(500);
 expect(m.query).not.toHaveBeenCalled(); expect(m.enrich).not.toHaveBeenCalled();
});
it.each(["days=0", "days=abc", "days=181", "offset=-1", "offset=1.5"])("rejects invalid window %s before any reads", async params => {
 expect((await GET(new NextRequest(`http://localhost/api/test?${params}`))).status).toBe(400);
 expect(m.connection).not.toHaveBeenCalled();
});
