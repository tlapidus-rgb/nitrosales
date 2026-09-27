import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { organization: { findUnique: async () => ({ name: "Synthetic" }) }, $transaction: m.transaction } }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => true }));
import { SE_EXPORTA } from "@/lib/organizacion/exportacion";
import { GET } from "@/app/api/admin/orgs/[orgId]/exportar/route";
let db: PGlite;
beforeAll(async () => {
 db = await PGlite.create();
 for (const { tabla } of SE_EXPORTA) await db.exec(`CREATE TABLE "${tabla}" (id text PRIMARY KEY, "organizationId" text, "orderId" text, "dashboardPasswordPlain" text);`);
 await db.exec(`INSERT INTO orders (id,"organizationId") SELECT lpad(n::text,5,'0'),'a' FROM generate_series(1,1001) AS n;
 INSERT INTO orders (id,"organizationId") VALUES ('other','b');
 INSERT INTO order_items (id,"orderId") VALUES ('item-a','00001'),('item-b','other');
 INSERT INTO influencers (id,"organizationId","dashboardPasswordPlain") VALUES ('creator','a','never-export-this');`);
});
afterAll(async () => db.close());
beforeEach(() => {
 vi.clearAllMocks();
 m.transaction.mockImplementation(async callback => db.transaction(async tx => {
  m.query.mockImplementation(async (sql: string, ...args: unknown[]) => (await tx.query(sql, args)).rows);
  return callback({ $executeRawUnsafe: async (sql: string) => { await tx.exec(sql); }, $queryRawUnsafe: m.query });
 }));
});
const run = () => GET(new NextRequest("https://test.invalid/api"), { params: { orgId: "a" } });
it("exports all pages with tenant scope, keyset and redaction", async () => {
 const text = await (await run()).text();
 const lines = text.trim().split("\n").map(s => JSON.parse(s));
 const orders = lines.filter(l => l.tabla === "orders");
 expect(orders).toHaveLength(1001); expect(new Set(orders.map(l => l.fila.id)).size).toBe(1001);
 expect(lines.filter(l => l.tabla === "order_items").map(l => l.fila.id)).toEqual(["item-a"]);
 expect(text).not.toContain("never-export-this"); expect(text).not.toContain('"other"');
 expect(lines.at(-1).cierre).toMatchObject({ completa: true, filasEscritas: 1003, filasEsperadas: 1003 });
 expect(m.transaction.mock.calls[0][1].isolationLevel).toBe("RepeatableRead");
 const pages = m.query.mock.calls.filter(([sql]) => sql.startsWith('SELECT * FROM "orders"'));
 expect(pages).toHaveLength(3); expect(pages[1][0]).toContain('"id" > $2'); expect(pages[1].slice(1)).toEqual(["a", "00500"]);
});
it("never claims completion on snapshot failure", async () => {
 m.transaction.mockRejectedValue(new Error("snapshot unavailable"));
 const lines = (await (await run()).text()).trim().split("\n").map(s => JSON.parse(s));
 expect(lines.at(-1).cierre).toMatchObject({ completa: false, filasEscritas: 0 });
});
it("stops fetching pages when the consumer cancels", async () => {
 const reader = (await run()).body!.getReader(); await reader.read(); await reader.cancel();
 await new Promise(resolve => setTimeout(resolve, 30));
 expect(m.query.mock.calls.filter(([sql]) => sql.startsWith("SELECT *")).length).toBeLessThanOrEqual(1);
});