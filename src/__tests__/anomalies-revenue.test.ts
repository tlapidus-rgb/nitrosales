import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ query: vi.fn(), detect: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { organization: { findMany: async () => [{ id: "a", name: "A", users: [] }] }, $queryRaw: m.query } }));
vi.mock("@/lib/cron/latido", () => ({ registrarLatido: async () => {} }));
vi.mock("@/lib/cron/cursor-store", () => ({ ultimoProcesado: async () => null, arranqueDeLaVuelta: () => ({ desde: 0, persiste: false }) }));
vi.mock("@/lib/admin-key", () => ({ isValidAdminKey: () => true }));
vi.mock("@/lib/anomaly/detector", () => ({ detectRuleBasedAnomalies: m.detect, detectClaudeAnomalies: async () => [] }));
vi.mock("@/lib/email/send", () => ({ sendEmail: () => { throw new Error("No real emails"); } }));
import { GET } from "@/app/api/cron/anomalies/route";
let db: PGlite;
beforeAll(async () => {
 db = await PGlite.create();
 await db.exec(`CREATE TABLE orders (id text PRIMARY KEY, "organizationId" text, "totalValue" numeric, status text, "orderDate" timestamptz);
 CREATE TABLE order_items ("orderId" text, quantity int);
 INSERT INTO orders VALUES
 ('current-multi','a',100,'APPROVED','2026-09-23T12:00:00Z'),
 ('current-same','a',100,'APPROVED','2026-09-23T12:00:00Z'),
 ('previous-multi','a',80,'APPROVED','2026-09-15T12:00:00Z'),
 ('previous-no-items','a',80,'APPROVED','2026-09-15T12:00:00Z'),
 ('cancelled','a',999,'CANCELLED','2026-09-23T12:00:00Z'),
 ('other-org','b',999,'APPROVED','2026-09-23T12:00:00Z');
 INSERT INTO order_items VALUES ('current-multi',1),('current-multi',2),('current-same',1),('previous-multi',1),('previous-multi',1),('previous-multi',1);`);
 await db.exec(`ALTER TABLE order_items ADD COLUMN "costPrice" numeric DEFAULT 10, ADD COLUMN "productId" text;
 CREATE TABLE products (id text PRIMARY KEY, "costPrice" numeric);
 CREATE TABLE ad_metrics_daily ("organizationId" text, date date, platform text, spend numeric, conversions numeric, "conversionValue" numeric);
 INSERT INTO ad_metrics_daily VALUES ('a','2026-09-18','META',20,2,100), ('a','2026-09-24','META',30,3,150),
 ('a','2026-09-25','META',999,9,999), ('a','2026-09-11','META',10,1,50);`);
});
it("executes half-open SQL, daily date keys and cost coverage of both periods", async () => {
 await db.exec(`SET TIME ZONE 'Pacific/Honolulu';
 INSERT INTO orders VALUES
 ('edge-start','a',1,'APPROVED','2026-09-18T03:00:00Z'),
 ('edge-last','a',1,'APPROVED','2026-09-25T02:59:59.999999Z'),
 ('edge-today','a',999,'APPROVED','2026-09-25T03:00:00Z'),
 ('edge-previous','a',1,'APPROVED','2026-09-11T03:00:00Z');`);
 try {
  m.query.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
   const sql = Prisma.sql(strings, ...values);
   return (await db.query(sql.text, sql.values)).rows;
  });
  const res = await GET(new NextRequest("https://test.invalid/api?key=test"));
  expect((await res.json()).failures).toEqual([]);
  expect(m.detect).toHaveBeenCalledWith(
   expect.objectContaining({ revenue: 202, orders: 4, grossProfit: 162, adSpend: 50, cogsCoverage: 60 }),
   expect.objectContaining({ revenue: 161, orders: 3, grossProfit: 131, adSpend: 10, cogsCoverage: 60 }),
  );
 } finally {
  await db.exec(`DELETE FROM orders WHERE id LIKE 'edge-%'; SET TIME ZONE 'UTC';`);
 }
});
afterAll(async () => db.close());
beforeEach(() => {
 vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
 m.detect.mockReturnValue([]);
 m.query.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const sql = Prisma.sql(strings, ...values);
  if (sql.text.includes("as revenue")) return (await db.query(sql.text, sql.values)).rows;
  return [{ total: "1", with_cost: "1", cogs: "20", spend: "10", meta_spend: "10", google_spend: "0", conversions: "1", conversion_value: "100" }];
 });
});
afterEach(() => vi.useRealTimers());
it("counts each order once in both periods, including equal totals and orders without items", async () => {
 const res = await GET(new NextRequest("https://test.invalid/api?key=test"));
 expect((await res.json()).failures).toEqual([]);
 expect(m.detect).toHaveBeenCalledWith(
  expect.objectContaining({ revenue: 200, orders: 2, aov: 100, grossProfit: 180 }),
  expect.objectContaining({ revenue: 160, orders: 2, aov: 80, grossProfit: 140 })
 );
});
