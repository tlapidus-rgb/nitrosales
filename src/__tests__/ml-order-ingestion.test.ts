import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ persist: vi.fn(), enrich: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRawUnsafe: m.query } }));
vi.mock("@/lib/connectors/ml-order-persistence", () => ({ persistMlOrder: m.persist }));
vi.mock("@/lib/connectors/mercadolibre-enrichment", () => ({ enrichOrderFromMl: m.enrich }));
import { ingestMlOrder } from "@/lib/connectors/ml-order-ingestion";
const order = { id: 1, last_updated: "2026-09-01T00:00:00Z" };
beforeEach(() => {
  vi.resetAllMocks();
  m.persist.mockResolvedValue({ action: "updated", dbOrderId: "saved" });
  m.enrich.mockResolvedValue({ itemsCreated: 2 }); m.query.mockResolvedValue([{ id: "saved" }]);
});
it("confirms only after enrichment and scopes confirmation by version/org/source", async () => {
  expect(await ingestMlOrder("org", order, "APPROVED", "test")).toMatchObject({ enriched: true, itemsCreated: 2 });
  expect(m.enrich.mock.invocationCallOrder[0]).toBeLessThan(m.query.mock.invocationCallOrder[0]);
  expect(m.query.mock.calls[0][0]).toContain('"externalUpdatedAt"=$3::timestamptz');
  expect(m.query.mock.calls[0][0]).toContain("source='MELI'");
  expect(m.query.mock.calls[0].slice(1)).toEqual(["saved", "org", new Date(order.last_updated)]);
});
it("repairs the same version after an interrupted previous attempt", async () => {
  m.persist.mockResolvedValue({ action: "skipped", dbOrderId: null });
  expect(await ingestMlOrder("org", order, "APPROVED", "test")).toMatchObject({ enriched: true });
  expect(m.enrich).toHaveBeenCalledWith("saved", "org", order, "test");
  expect(m.query).toHaveBeenCalledTimes(2);
});
it("does not enrich when no same-version ML row exists", async () => {
  m.persist.mockResolvedValue({ action: "skipped", dbOrderId: null }); m.query.mockResolvedValue([]);
  expect(await ingestMlOrder("org", order, "APPROVED", "test")).toMatchObject({ enriched: false, action: "skipped" });
  expect(m.enrich).not.toHaveBeenCalled();
});
it("leaves incomplete details unconfirmed", async () => {
  m.enrich.mockResolvedValue(null);
  await expect(ingestMlOrder("org", order, "APPROVED", "test")).rejects.toThrow("incomplete");
  expect(m.query).not.toHaveBeenCalled();
});
it("does not claim completion when a newer version wins before confirmation", async () => {
  m.query.mockResolvedValue([]);
  await expect(ingestMlOrder("org", order, "APPROVED", "test")).rejects.toThrow("superseded");
});
it.each([{ id: null, last_updated: order.last_updated }, { id: 1, last_updated: "invalid" }])("rejects unusable identities or versions before writing", async invalid => {
  await expect(ingestMlOrder("org", invalid, "APPROVED", "test")).rejects.toThrow("Invalid");
  expect(m.persist).not.toHaveBeenCalled();
});
