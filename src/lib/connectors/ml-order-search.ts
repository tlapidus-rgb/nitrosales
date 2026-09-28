export interface MlOrderSearchOptions {
  dateFrom?: string;
  dateTo?: string;
  maxOrders?: number;
}

/** Return a complete bounded search or throw. Never present a prefix as success.
 * Millisecond windows follow the same inclusive-bound convention as backfill.
 * Provider behavior still requires sandbox validation; this is not a snapshot. */
export async function searchMlOrders(
  get: (path: string) => Promise<any>,
  sellerId: number,
  options: MlOrderSearchOptions = {},
) {
  const started = Date.now();
  const from = new Date(options.dateFrom ?? new Date(started - 30 * 86400000).toISOString()).getTime();
  const to = new Date(options.dateTo ?? new Date(started).toISOString()).getTime();
  const maxOrders = options.maxOrders ?? 50000;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to ||
      !Number.isSafeInteger(maxOrders) || maxOrders <= 0 || maxOrders > 50000 ||
      !Number.isSafeInteger(sellerId) || sellerId <= 0) throw new Error("Invalid ML search bounds");
  const windows = [{ from, to }];
  const orders: any[] = [];
  const seen = new Set<string>();
  let requests = 0;
  while (windows.length) {
    const window = windows.pop()!;
    let expectedTotal: number | undefined;
    for (let offset = 0; ; offset += 50) {
      if (++requests > 1100 || Date.now() - started >= 90000) throw new Error("ML search budget exceeded; retry a smaller interval");
      const query = new URLSearchParams({ seller: String(sellerId), sort: "date_desc", limit: "50", offset: String(offset),
        "order.date_created.from": new Date(window.from).toISOString(),
        "order.date_created.to": new Date(window.to).toISOString() });
      const data = await get(`/orders/search?${query}`);
      const rows = data?.results;
      const total = data?.paging?.total;
      if (!Array.isArray(rows) || !Number.isSafeInteger(total) || total < 0) throw new Error("Invalid ML search page");
      if (expectedTotal !== undefined && expectedTotal !== total) throw new Error("ML search changed during pagination; retry interval");
      if (offset === 0 && total > maxOrders - orders.length) throw new Error("ML order limit exceeded; retry a smaller interval");
      if (total > 1000) {
        if (window.from === window.to) throw new Error("ML search peak cannot be subdivided");
        const midpoint = window.from + Math.floor((window.to - window.from) / 2);
        windows.push({ from: window.from, to: midpoint }, { from: midpoint + 1, to: window.to });
        break;
      }
      expectedTotal = total;
      if (rows.length !== Math.min(50, Math.max(0, total - offset))) throw new Error("Truncated ML search page");
      for (const row of rows) {
        const id = row?.id == null ? "" : String(row.id);
        const created = new Date(row?.date_created).getTime();
        if (!id || !Number.isFinite(created) || created < window.from || created > window.to || seen.has(id)) {
          throw new Error("Invalid, duplicate or out-of-window ML order");
        }
        seen.add(id); orders.push(row);
      }
      if (offset + rows.length >= total) break;
    }
  }
  return orders;
}
