import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ persist: vi.fn(), enrich: vi.fn(), query: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRawUnsafe: m.query, connection: {
 findMany: async () => [{ id: "connection", organizationId: "org", credentials: { mlUserId: "123" } }], update: m.update,
} } }));
vi.mock("@/lib/connectors/mercadolibre-seller", () => ({ getSellerToken: async () => ({ token: "test" }) }));
vi.mock("@/lib/connectors/ml-order-persistence", () => ({ persistMlOrder: m.persist }));
vi.mock("@/lib/connectors/mercadolibre-enrichment", () => ({ enrichOrderFromMl: m.enrich }));
import { processMLNotification } from "@/lib/connectors/ml-notification-processor";
const order = { id: 1, status: "paid", last_updated: "2026-09-01T00:00:00Z", order_items: [] };
const event = { _id: "event", resource: "/orders/1", user_id: 123, topic: "orders_v2", application_id: 1, attempts: 1, sent: "", received: "" };
beforeEach(() => {
 vi.resetAllMocks(); m.persist.mockResolvedValue({ dbOrderId: "saved", action: "inserted" });
 m.enrich.mockResolvedValue({ itemsCreated: 0 }); m.query.mockResolvedValue([]);
 vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(order))));
});
afterEach(() => vi.unstubAllGlobals());
it("uses the same versioned persistence and enrichment as backfill", async () => {
 await processMLNotification(event);
 expect(m.persist).toHaveBeenCalledWith("org",order,"APPROVED");
 expect(m.enrich).toHaveBeenCalledWith("saved","org",order,"test"); expect(m.update).toHaveBeenCalledTimes(1);
});
it("propagates partial failure so outbox cannot mark it processed", async () => {
 m.enrich.mockResolvedValue(null);
 await expect(processMLNotification(event)).rejects.toThrow("incomplete"); expect(m.update).not.toHaveBeenCalled();
});
it("repairs an equal-version basic order after a prior interrupted attempt", async () => {
 m.persist.mockResolvedValue({ dbOrderId: null, action: "skipped" }); m.query.mockResolvedValue([{ id: "saved" }]);
 await processMLNotification(event); expect(m.enrich).toHaveBeenCalledTimes(1);
 expect(m.query.mock.calls[0][0]).toContain('"externalUpdatedAt"=$3::timestamptz');
});
it("does not enrich obsolete payload when the stored version is newer", async () => {
 m.persist.mockResolvedValue({ dbOrderId: null, action: "skipped" });
 await processMLNotification(event); expect(m.enrich).not.toHaveBeenCalled();
});
it.each([429, 500])("still saves the order when the optional /items lookup fails with %i", async status => {
 // El SKU y la foto son opcionales: antes de b35efafd un fallo acá se logueaba y
 // la orden se guardaba igual. Si ahora corta, la orden no entra, y el reenvío de
 // ML con el mismo _id se descarta como duplicado: se pierde hasta ml-reconcile.
 const withItem = { ...order, order_items: [{ item: { id: "MLA1" }, quantity: 1, unit_price: 10 }] };
 vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/items/")
  ? new Response("rate limited", { status })
  : new Response(JSON.stringify(withItem))));
 await processMLNotification(event);
 expect(m.persist).toHaveBeenCalledTimes(1);
 expect(m.persist.mock.calls[0][1].order_items[0].item.id).toBe("MLA1");
 expect(m.enrich).toHaveBeenCalledTimes(1);
});
it.each(["payments", "shipments"])("refreshes the canonical order for %s instead of writing a stale fragment", async topic => {
 vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/orders/1") ? order : { order_id: 1, status: "delivered" }))));
 await processMLNotification({ ...event, resource: `/${topic}/99`, topic });
 expect(m.persist).toHaveBeenCalledWith("org",order,"APPROVED"); expect(m.enrich).toHaveBeenCalledTimes(1);
});
it.each(["https://external.invalid/orders/1", "//external.invalid/orders/1", "/\\external.invalid/orders/1"])("never forwards seller credentials to an untrusted resource: %s", async resource => {
 await expect(processMLNotification({ ...event, resource })).rejects.toThrow("Invalid ML resource");
 expect(fetch).not.toHaveBeenCalled(); expect(m.persist).not.toHaveBeenCalled();
});
