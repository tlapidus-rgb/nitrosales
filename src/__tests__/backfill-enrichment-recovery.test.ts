import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const m = vi.hoisted(() => ({ query: vi.fn(), enrich: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRawUnsafe: m.query } }));
vi.mock("@/lib/connectors/mercadolibre-seller", () => ({ getSellerToken: async () => ({ token: "synthetic", mlUserId: 1 }) }));
vi.mock("@/lib/connectors/mercadolibre-enrichment", () => ({ enrichOrderFromMl: m.enrich }));
import { processMercadoLibreChunk } from "@/lib/backfill/processors/ml-processor";
let db: PGlite;
const version = "2026-09-01T00:00:00.000Z";
const job = { organizationId: "org", fromDate: version, toDate: version, cursor: {} };
const payload = { id: 1, date_created: version, last_updated: version, status: "paid", total_amount: 100 };
beforeAll(async () => {
 db = await PGlite.create();
 await db.exec(`CREATE TYPE "OrderStatus" AS ENUM ('PENDING','APPROVED','INVOICED','SHIPPED','DELIVERED','CANCELLED','RETURNED');
 CREATE TABLE orders (id text PRIMARY KEY, "externalId" text, "packId" text, status "OrderStatus", "totalValue" numeric,
 currency text, "itemCount" int, source text, "paymentMethod" text, "marketplaceFee" numeric, "orderDate" timestamp,
 "externalUpdatedAt" timestamptz, "organizationId" text, "createdAt" timestamp, "updatedAt" timestamp,
 UNIQUE ("organizationId", "externalId"));`);
 const migration = readFileSync("prisma/migrations/backfill_enrichment_version.sql", "utf8");
 await db.exec(migration); await db.exec(migration);
});
afterAll(async () => db.close());
beforeEach(async () => {
 vi.resetAllMocks(); await db.exec("TRUNCATE orders");
 m.query.mockImplementation(async (sql: string, ...args: unknown[]) => (await db.query(sql, args)).rows);
 m.enrich.mockResolvedValue({ itemsCreated: 1 });
 vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [payload], paging: { total: 1 } }))));
});
afterEach(() => vi.unstubAllGlobals());
const row = async () => (await db.query<any>('SELECT * FROM orders WHERE "organizationId"=\'org\'')).rows[0];
it("recovers an order committed before interruption even without a retry cursor", async () => {
 // Seed the exact persisted state left by a process dying before enrichment.
 await db.query(`INSERT INTO orders (id,"externalId",source,"externalUpdatedAt","organizationId") VALUES ('saved','1','MELI',$1,'org')`, [version]);
 expect(new Date((await row()).externalUpdatedAt).toISOString()).toBe(version);
 const result = await processMercadoLibreChunk(job);
 expect(result.isComplete).toBe(true); expect(m.enrich).toHaveBeenCalledWith("saved", "org", payload, "synthetic");
 expect(new Date((await row()).backfillEnrichedVersion).toISOString()).toBe(version);
 m.enrich.mockClear();
 expect((await processMercadoLibreChunk(job)).isComplete).toBe(true);
 expect(m.enrich).not.toHaveBeenCalled();
});
it("keeps a failed enrichment durable even if the returned cursor is lost", async () => {
 m.enrich.mockResolvedValueOnce(null);
 const first = await processMercadoLibreChunk(job);
 expect(first.isComplete).toBe(false); expect((await row()).backfillEnrichedVersion).toBeNull();
 // Simulate restart loading the OLD cursor, without retryEnrichmentIds.
 expect((await processMercadoLibreChunk(job)).isComplete).toBe(true);
 expect(m.enrich).toHaveBeenCalledTimes(2);
 expect((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0]).toEqual({ n: 1 });
});
it("invalidates the previous enrichment marker atomically when a newer order is saved", async () => {
 await processMercadoLibreChunk(job);
 vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [{ ...payload, last_updated: "2026-09-02T00:00:00.000Z" }], paging: { total: 1 } }))));
 m.enrich.mockResolvedValueOnce(null);
 expect((await processMercadoLibreChunk(job)).isComplete).toBe(false);
 expect((await row()).backfillEnrichedVersion).toBeNull();
});
it("does not acknowledge an older enrichment after another writer advances the order version", async () => {
 m.enrich.mockImplementationOnce(async () => {
  await db.exec(`UPDATE orders SET "externalUpdatedAt"='2026-09-02'`);
  return { itemsCreated: 1 };
 });
 expect((await processMercadoLibreChunk(job)).isComplete).toBe(false);
 expect((await row()).backfillEnrichedVersion).toBeNull();
});
it("does not enrich another organization's row with the same external ID", async () => {
 await db.query(`INSERT INTO orders (id,"externalId",source,"externalUpdatedAt","organizationId") VALUES ('foreign','1','MELI',$1,'other')`, [version]);
 expect((await processMercadoLibreChunk(job)).isComplete).toBe(true);
 expect((await db.query<any>("SELECT * FROM orders WHERE id='foreign'")).rows[0].backfillEnrichedVersion).toBeNull();
 expect(m.enrich.mock.calls[0][0]).not.toBe("foreign");
});
it("recovers when enrichment succeeded but saving its confirmation failed", async () => {
 let fail = true;
 m.query.mockImplementation(async (sql: string, ...args: unknown[]) => {
  if (fail && sql.includes("UPDATE orders SET")) { fail = false; throw new Error("simulated acknowledgement outage"); }
  return (await db.query(sql,args)).rows;
 });
 expect((await processMercadoLibreChunk(job)).isComplete).toBe(false);
 expect((await row()).backfillEnrichedVersion).toBeNull();
 expect((await processMercadoLibreChunk(job)).isComplete).toBe(true);
 expect(m.enrich).toHaveBeenCalledTimes(2);
});
it("fails visibly before writing orders when the required migration is absent", async () => {
 await db.exec('ALTER TABLE orders DROP COLUMN "backfillEnrichedVersion"');
 try {
  await expect(processMercadoLibreChunk(job)).rejects.toThrow();
  expect((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0]).toEqual({ n: 0 });
  expect(m.enrich).not.toHaveBeenCalled();
 } finally {
  await db.exec(readFileSync("prisma/migrations/backfill_enrichment_version.sql", "utf8"));
 }
});
