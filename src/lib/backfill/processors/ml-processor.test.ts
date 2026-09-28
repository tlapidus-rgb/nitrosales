import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRawUnsafe: db.query } }));
vi.mock("@/lib/connectors/mercadolibre-seller", () => ({
  getSellerToken: async () => ({ token: "test", mlUserId: 1 }),
}));
vi.mock("@/lib/connectors/mercadolibre-enrichment", () => ({ enrichOrderFromMl: vi.fn() }));
import { processMercadoLibreChunk } from "./ml-processor";

type Order = { id: string; date_created: string; last_updated: string };
function ordersAt(count: number, end: string, prefix: string): Order[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    date_created: new Date(Date.parse(end) - i * 1000).toISOString(),
    last_updated: "2026-09-10T00:00:00.000Z",
  }));
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function run(orders: Order[], failOnce = false) {
  const visited = new Set<string>();
  // Track the IDs reaching persistence, not discarded probe pages.
  db.query.mockImplementation(async (_sql: string, _org: string, ids: string[]) => {
    ids.forEach(id => visited.add(id));
    return ids.map(externalId => ({ externalId, externalUpdatedAt: new Date("2026-09-11") }));
  });
  let injected = false;
  const fetcher = vi.fn(async (url: string) => {
    const q = new URL(url).searchParams;
    const offset = Number(q.get("offset"));
    expect(offset).toBeLessThan(1000);
    if (failOnce && !injected && offset === 100) {
      injected = true;
      return { ok: false, status: 400, text: async () => "simulated failure" };
    }
    const matching = orders.filter(o => o.date_created >= q.get("order.date_created.from")! && o.date_created <= q.get("order.date_created.to")!)
      .sort((a, b) => b.date_created.localeCompare(a.date_created) || a.id.localeCompare(b.id));
    return { ok: true, json: async () => ({ results: matching.slice(offset, offset + 50), paging: { total: matching.length } }) };
  });
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(console, "log").mockImplementation(() => {});
  let job: any = { organizationId: "test", fromDate: "2026-09-01", toDate: "2026-09-08", cursor: {} };
  let processed = 0;
  for (let i = 0; i < 200; i++) {
    const result = await processMercadoLibreChunk(job);
    processed += result.itemsProcessed;
    // JSON round-trip represents a new invocation loading a persisted cursor.
    job = { ...job, cursor: JSON.parse(JSON.stringify(result.newCursor)) };
    if (result.error && !(injected && result.error.includes("simulated failure"))) return { result, visited, injected };
    if (result.isComplete) return { result, visited, injected, processed };
  }
  throw new Error("Processor did not converge");
}

describe("ML backfill temporal coverage", () => {
  it.each([true, false])("covers both halves with the dense half recent=%s", async recent => {
    const orders = [...ordersAt(3000, recent ? "2026-09-07" : "2026-09-02", "dense"), ...ordersAt(100, recent ? "2026-09-02" : "2026-09-07", "sparse")];
    const { result, visited } = await run(orders);
    expect(result.error).toBeUndefined();
    expect(result.isComplete).toBe(true);
    expect([...visited].sort()).toEqual(orders.map(o => o.id).sort());
  });
  it("resumes a failed page without omitting boundaries or older dates", async () => {
    const orders = [...ordersAt(1700, "2026-09-07", "peak"), ...ordersAt(1, "2026-09-01", "from"), ...ordersAt(1, "2026-09-08", "to"), ...ordersAt(1, "2026-09-04T12:00:00Z", "mid")];
    const { result, visited, injected, processed } = await run(orders, true);
    expect(injected).toBe(true);
    expect(processed).toBe(orders.length);
    expect(result.isComplete).toBe(true);
    expect([...visited].sort()).toEqual(orders.map(o => o.id).sort());
  });
  it("reports an indivisible timestamp overflow instead of completing", async () => {
    const orders = ordersAt(1001, "2026-09-07", "same").map(o => ({ ...o, date_created: "2026-09-07T00:00:00.000Z" }));
    const { result } = await run(orders);
    expect(result.isComplete).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
