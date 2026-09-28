import { afterEach, expect, it, vi } from "vitest";
import { searchMlOrders } from "@/lib/connectors/ml-order-search";
const start = Date.parse("2026-09-01T00:00:00Z");
const options = { dateFrom: new Date(start).toISOString(), dateTo: new Date(start + 1599).toISOString(), maxOrders: 2000 };
const fixture = Array.from({ length: 1600 }, (_, i) => ({ id: i + 1, date_created: new Date(start + i).toISOString() }));
function provider(rows = fixture) {
  return vi.fn(async (path: string) => {
    const params = new URL(path, "https://synthetic.invalid").searchParams;
    const from = Date.parse(params.get("order.date_created.from")!);
    const to = Date.parse(params.get("order.date_created.to")!);
    const offset = Number(params.get("offset"));
    const selected = rows.filter(row => Date.parse(row.date_created) >= from && Date.parse(row.date_created) <= to).reverse();
    return { results: selected.slice(offset, offset + 50), paging: { total: selected.length } };
  });
}
afterEach(() => vi.restoreAllMocks());
it("subdivides dense intervals and returns every order including exact boundaries once", async () => {
  const get = provider();
  const rows = await searchMlOrders(get, 123, options);
  expect(rows).toHaveLength(1600);
  expect(new Set(rows.map(row => row.id))).toHaveLength(1600);
  expect(rows.map(row => row.id).sort((a, b) => a - b)).toEqual(fixture.map(row => row.id));
  for (const [path] of get.mock.calls) expect(Number(new URL(path, "https://synthetic.invalid").searchParams.get("offset"))).toBeLessThan(1000);
});
it("keeps the upper bound fixed across all requests", async () => {
  const get = provider(fixture.slice(0, 100));
  await searchMlOrders(get, 123, options);
  expect(new Set(get.mock.calls.map(([path]) => new URL(path, "https://synthetic.invalid").searchParams.get("order.date_created.to")))).toEqual(new Set([options.dateTo]));
});
it("throws before returning a capped prefix", async () => {
  await expect(searchMlOrders(provider(), 123, { ...options, maxOrders: 1000 })).rejects.toThrow("limit exceeded");
});
it.each([
  { results: [], paging: { total: 1 } },
  { results: {} },
  { results: [], paging: { total: -1 } },
  { results: [fixture[0], fixture[0]], paging: { total: 2 } },
  { results: [{ id: 1, date_created: "invalid" }], paging: { total: 1 } },
  { results: [{ id: 1, date_created: new Date(start - 1).toISOString() }], paging: { total: 1 } },
])("rejects malformed, missing and duplicate rows: %j", async page => {
  await expect(searchMlOrders(async () => page, 123, options)).rejects.toThrow();
});
it("rejects a total change between pages", async () => {
  const get = vi.fn().mockResolvedValueOnce({ results: fixture.slice(0, 50), paging: { total: 100 } })
    .mockResolvedValueOnce({ results: fixture.slice(50, 99), paging: { total: 99 } });
  await expect(searchMlOrders(get, 123, options)).rejects.toThrow("changed during pagination");
});
it("does not hide a later request failure behind a successful first page", async () => {
  const get = vi.fn().mockResolvedValueOnce({ results: fixture.slice(0, 50), paging: { total: 100 } })
    .mockRejectedValueOnce(new Error("Unavailable"));
  await expect(searchMlOrders(get, 123, options)).rejects.toThrow("Unavailable");
});
it("fails visibly when a dense millisecond cannot be split", async () => {
  await expect(searchMlOrders(async () => ({ results: [], paging: { total: 1001 } }), 123,
    { ...options, dateTo: options.dateFrom })).rejects.toThrow("cannot be subdivided");
});
it("returns an empty result only for an explicitly empty valid search", async () => {
  expect(await searchMlOrders(provider([]), 123, options)).toEqual([]);
});
it("stops when the time budget expires without returning partial data", async () => {
  let clock = start;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  const get = vi.fn(async () => { clock += 90001; return { results: fixture.slice(0, 50), paging: { total: 100 } }; });
  await expect(searchMlOrders(get, 123, options)).rejects.toThrow("budget exceeded");
  expect(get).toHaveBeenCalledTimes(1);
});
it.each([{ maxOrders: 0 }, { maxOrders: -1 }, { dateFrom: "invalid" }, { dateTo: "2020-01-01" }])("validates bounds before network access: %j", async override => {
  const get = provider();
  await expect(searchMlOrders(get, 123, { ...options, ...override })).rejects.toThrow("Invalid");
  expect(get).not.toHaveBeenCalled();
});
