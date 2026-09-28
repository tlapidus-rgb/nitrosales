import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PGlite } from "@electric-sql/pglite";
const m = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { organization: { findUnique: async () => ({ name: "Synthetic" }) }, $queryRawUnsafe: m.query, $transaction: m.transaction } }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => true }));
vi.mock("@/lib/admin-key", () => ({ isValidAdminKey: () => false }));
import { POST } from "@/app/api/admin/orgs/[orgId]/borrar-todo/route";
import { GET } from "@/app/api/admin/orgs/[orgId]/que-queda/route";
import { SQL_DEPENDENCIAS } from "@/lib/organizacion/borrado";
let db: PGlite;
const run = () => POST(new NextRequest("https://test.invalid/api?ejecutar=1", { method: "POST", body: JSON.stringify({ confirm: "BORRAR-a" }) }), { params: { orgId: "a" } });
beforeAll(async () => { db = await PGlite.create(); });
afterAll(async () => db.close());
beforeEach(async () => {
 vi.resetAllMocks();
 await db.exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
 CREATE TABLE orders (id text PRIMARY KEY, "externalId" text UNIQUE, "organizationId" text);
 CREATE TABLE items (id text PRIMARY KEY, "orderId" text REFERENCES orders("externalId") ON DELETE SET NULL);
 CREATE TABLE notes (id text PRIMARY KEY, "itemId" text REFERENCES items(id) ON DELETE SET NULL, "otherItemId" text REFERENCES items(id));
 CREATE TABLE foreign_records (id text PRIMARY KEY, "organizationId" text, "orderId" text REFERENCES orders(id) ON DELETE CASCADE);
 CREATE TABLE email_log (id text PRIMARY KEY, "itemId" text REFERENCES items(id) ON DELETE CASCADE);
 INSERT INTO orders VALUES ('a','ext-a','a'),('b','ext-b','b');
 INSERT INTO items VALUES ('item-a','ext-a'),('item-b','ext-b');
 INSERT INTO notes VALUES ('owned','item-a',null),('foreign','item-b',null);`);
 m.query.mockImplementation(async (sql: string, ...args: unknown[]) => (await db.query(sql,args)).rows);
 m.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => db.transaction(async tx => fn({
   $queryRawUnsafe: async (sql: string,...args: unknown[]) => (await tx.query(sql,args)).rows,
   $executeRawUnsafe: async (sql: string,...args: unknown[]) => (await tx.query(sql,args)).affectedRows ?? 0,
 })));
});
it("uses referenced columns, deletes transitive children before SET NULL, and preserves the other org", async () => {
 const deps = await db.query(SQL_DEPENDENCIAS);
 expect(deps.rows).toContainEqual(expect.objectContaining({ hija: "items", columnaReferenciada: "externalId", columnas: 1 }));
 const res = await run(); const body = await res.json();
 expect(res.status).toBe(200); expect(body.ok).toBe(true);
 expect(body.plan.orden.indexOf("notes")).toBeLessThan(body.plan.orden.indexOf("items"));
 expect((await db.query("SELECT id FROM orders")).rows).toEqual([{ id: "b" }]);
 expect((await db.query("SELECT id FROM items")).rows).toEqual([{ id: "item-b" }]);
 expect((await db.query("SELECT id FROM notes")).rows).toEqual([{ id: "foreign" }]);
 expect(m.transaction.mock.calls[0][1].isolationLevel).toBe("Serializable");
});
it.each([
 `INSERT INTO notes VALUES ('shared','item-a','item-b')`,
 `INSERT INTO foreign_records VALUES ('other','b','a')`,
 `INSERT INTO email_log VALUES ('retained','item-a')`,
])("rolls back without touching either org when ownership or retention conflicts: %s", async seed => {
 await db.exec(seed);
 const res = await run(); expect(res.status).toBe(500);
 expect((await db.query("SELECT count(*)::int AS n FROM orders")).rows[0]).toEqual({ n: 2 });
 expect((await db.query("SELECT count(*)::int AS n FROM items")).rows[0]).toEqual({ n: 2 });
});
it("reports composite dependencies and refuses execution", async () => {
 await db.exec(`ALTER TABLE orders ADD UNIQUE (id, "organizationId"); CREATE TABLE compound (a text, b text, FOREIGN KEY (a,b) REFERENCES orders(id,"organizationId"));`);
 const res = await run(); expect(res.status).toBe(409); expect(m.transaction).not.toHaveBeenCalled();
 const body = await res.json(); expect(body.dependenciasCompuestasSinResolver).toHaveLength(2);
});
it("audit reports unavailable metadata instead of an empty clean result", async () => {
 m.query.mockImplementation(async (sql: string, ...args: unknown[]) => {
   if (sql.includes("pg_constraint")) throw new Error("permission denied");
   return (await db.query(sql,args)).rows;
 });
 const res = await GET(new NextRequest("https://test.invalid/api"), { params: { orgId: "a" } });
 expect(res.status).toBe(503); expect((await res.json()).completo).toBe(false);
});
