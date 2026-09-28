import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
const m = vi.hoisted(() => ({ transaction: vi.fn(), failFinal: false }));
vi.mock("@/lib/db/client", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("@/lib/products/upsert-by-sku", () => ({ upsertProductBySku: async (_args: unknown, tx: any) => {
 await tx.product.upsert(); return { id: "product", costPrice: 5 };
} }));
import { enrichOrderFromMl } from "@/lib/connectors/mercadolibre-enrichment";
let db: PGlite;
const version = "2026-09-01T00:00:00.000Z";
const payload = { id: "external", date_created: version, last_updated: version,
 buyer: { id: 1, nickname: "Synthetic" }, order_items: [{ item: { id: "product", title: "Synthetic" }, quantity: 1, unit_price: 10 }] };
beforeAll(async () => {
 db = await PGlite.create();
 await db.exec(`CREATE TABLE orders (id text PRIMARY KEY, "organizationId" text, source text, "externalUpdatedAt" timestamptz);
 CREATE TABLE effects (kind text); CREATE TABLE order_items ("orderId" text, value text);`);
});
afterAll(async () => db.close());
beforeEach(async () => {
 vi.clearAllMocks(); m.failFinal = false;
 await db.exec(`TRUNCATE orders,effects,order_items; INSERT INTO orders VALUES ('order','org','MELI','2026-09-01T00:00:00Z'); INSERT INTO order_items VALUES ('order','original');`);
 m.transaction.mockImplementation(async callback => db.transaction(async tx => callback({
  $queryRawUnsafe: async (sql: string,...args: unknown[]) => (await tx.query(sql,args)).rows,
  customer: { upsert: async () => { await tx.exec("INSERT INTO effects VALUES ('customer')"); return { id: "customer" }; } },
  product: { upsert: async () => tx.exec("INSERT INTO effects VALUES ('product')") },
  order: { update: async ({ data }: any) => { if (m.failFinal && data.channel) throw new Error("simulated final write failure"); await tx.exec("INSERT INTO effects VALUES ('order')"); } },
  orderItem: {
   deleteMany: async () => tx.exec("DELETE FROM order_items WHERE \"orderId\"='order'"),
   createMany: async () => tx.exec("INSERT INTO order_items VALUES ('order','replacement')"),
  },
 })));
});
it("rolls back customer, products and replaced items if the final write fails", async () => {
 m.failFinal = true;
 expect(await enrichOrderFromMl("order","org",payload)).toBeNull();
 expect((await db.query("SELECT * FROM effects")).rows).toEqual([]);
 expect((await db.query("SELECT value FROM order_items")).rows).toEqual([{ value: "original" }]);
});
it("commits all enrichment writes together", async () => {
 const log = vi.spyOn(console, "error");
 const result = await enrichOrderFromMl("order","org",payload);
 const errors = JSON.stringify(log.mock.calls); log.mockRestore();
 expect(result, errors).toMatchObject({ customerCreated: true, itemsCreated: 1 });
 expect((await db.query("SELECT value FROM order_items")).rows).toEqual([{ value: "replacement" }]);
 expect((await db.query("SELECT * FROM effects")).rows).toHaveLength(4);
});
it.each(["newer", "other-org", "other-source"])("refuses writes for %s", async kind => {
 if (kind === "newer") await db.exec(`UPDATE orders SET "externalUpdatedAt"='2026-09-02'`);
 if (kind === "other-org") await db.exec(`UPDATE orders SET "organizationId"='other'`);
 if (kind === "other-source") await db.exec(`UPDATE orders SET source='VTEX'`);
 expect(await enrichOrderFromMl("order","org",payload)).toBeNull();
 expect((await db.query("SELECT * FROM effects")).rows).toEqual([]);
 expect((await db.query("SELECT value FROM order_items")).rows).toEqual([{ value: "original" }]);
});
it.each([{ items: undefined }, { items: [{ item: {}, quantity: 1, unit_price: 10 }] }, { items: [{ item: { id: "p" }, quantity: 0, unit_price: 10 }] }])("rolls back an incomplete or malformed item list: %j", async ({ items }) => {
 expect(await enrichOrderFromMl("order","org",{ ...payload, order_items: items })).toBeNull();
 expect((await db.query("SELECT * FROM effects")).rows).toEqual([]);
 expect((await db.query("SELECT value FROM order_items")).rows).toEqual([{ value: "original" }]);
});
it("an explicitly empty list removes obsolete items in the same transaction", async () => {
 expect(await enrichOrderFromMl("order","org",{ ...payload, order_items: [] })).toMatchObject({ itemsCreated: 0 });
 expect((await db.query("SELECT * FROM order_items")).rows).toEqual([]);
});
