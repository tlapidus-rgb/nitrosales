import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
const m = vi.hoisted(() => ({ transaction: vi.fn(), failFinal: false, fields: {} as Record<string, unknown> }));
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
 CREATE TABLE effects (kind text); CREATE TABLE order_items ("orderId" text, value text);
 CREATE TABLE customers (id text PRIMARY KEY, "organizationId" text, "firstOrderAt" timestamptz, "lastOrderAt" timestamptz);`);
});
afterAll(async () => db.close());
beforeEach(async () => {
 vi.clearAllMocks(); m.failFinal = false; m.fields = {};
 await db.exec(`TRUNCATE orders,effects,order_items,customers; INSERT INTO orders VALUES ('order','org','MELI','2026-09-01T00:00:00Z'); INSERT INTO order_items VALUES ('order','original');
 INSERT INTO customers VALUES ('customer','org','2026-08-01T00:00:00Z','2026-08-31T00:00:00Z');`);
 m.transaction.mockImplementation(async callback => db.transaction(async tx => callback({
  $queryRawUnsafe: async (sql: string,...args: unknown[]) => (await tx.query(sql,args)).rows,
  customer: {
   upsert: async ({ update }: any) => {
    expect(update).not.toHaveProperty("lastOrderAt");
    await tx.exec("INSERT INTO effects VALUES ('customer')"); return { id: "customer" };
   },
   updateMany: async ({ where, data }: any) => {
    const first = "firstOrderAt" in data;
    const column = first ? "firstOrderAt" : "lastOrderAt";
    expect(where.OR).toEqual([{ [column]: null }, { [column]: { [first ? "gt" : "lt"]: data[column] } }]);
    await tx.query(`UPDATE customers SET "${column}"=$3 WHERE id=$1 AND "organizationId"=$2 AND ("${column}" IS NULL OR "${column}" ${first ? ">" : "<"} $3)`, [where.id, where.organizationId, data[column]]);
   },
  },
  product: { upsert: async () => tx.exec("INSERT INTO effects VALUES ('product')") },
  order: { update: async ({ data }: any) => { if (m.failFinal && data.channel) throw new Error("simulated final write failure"); if (data.channel) m.fields = data; await tx.exec("INSERT INTO effects VALUES ('order')"); } },
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
it("preserves promotions, zero fees and payment type fallback from legacy importers", async () => {
 const result = await enrichOrderFromMl("order", "org", { ...payload,
  promotions: [{ name: "Seasonal" }], payments: [{ payment_type: "credit_card" }],
  order_items: [{ ...payload.order_items[0], sale_fee: 0, promotion: { name: "Seasonal" } }],
 });
 expect(result).not.toBeNull();
 expect(m.fields).toMatchObject({ promotionNames: "Seasonal", marketplaceFee: 0, paymentMethod: "credit_card" });
});
it("does not replace unavailable fees with zero", async () => {
 await enrichOrderFromMl("order", "org", payload);
 expect(m.fields).not.toHaveProperty("marketplaceFee");
});
it("rolls back details when a fee is invalid", async () => {
 expect(await enrichOrderFromMl("order", "org", { ...payload, order_items: [{ ...payload.order_items[0], sale_fee: -1 }] })).toBeNull();
 expect((await db.query("SELECT value FROM order_items")).rows).toEqual([{ value: "original" }]);
});
it("replaying an older order expands the first purchase without regressing the last", async () => {
 expect(await enrichOrderFromMl("order", "org", { ...payload, date_created: "2026-07-01T00:00:00Z" })).not.toBeNull();
 const [customer] = (await db.query<{ firstOrderAt: Date; lastOrderAt: Date }>(`SELECT "firstOrderAt","lastOrderAt" FROM customers`)).rows;
 expect(customer.firstOrderAt.toISOString()).toBe("2026-07-01T00:00:00.000Z");
 expect(customer.lastOrderAt.toISOString()).toBe("2026-08-31T00:00:00.000Z");
});
