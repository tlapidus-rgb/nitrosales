import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PGlite } from "@electric-sql/pglite";
const m = vi.hoisted(() => ({ find: vi.fn(), query: vi.fn(), staff: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { organization: { findUnique: m.find }, $queryRawUnsafe: m.query } }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: m.staff }));
vi.mock("@/lib/alerts/get-user-id", () => ({ getSessionUserId: async () => "test-staff" }));
import { POST, DELETE, GET } from "@/app/api/admin/orgs/[orgId]/suspension/route";
let db: PGlite;
const params = { params: { orgId: "a" } };
const run = (body: unknown) => POST(new NextRequest("https://test.invalid/api", { method: "POST", body: JSON.stringify(body) }), params);
beforeAll(async () => { db = await PGlite.create(); await db.exec(`CREATE TABLE organizations (id text PRIMARY KEY, name text, settings jsonb, "updatedAt" timestamptz);`); });
afterAll(async () => db.close());
beforeEach(async () => {
 vi.resetAllMocks(); m.staff.mockResolvedValue(true);
 await db.exec(`DELETE FROM organizations; INSERT INTO organizations VALUES ('a','Synthetic','{"other": "current"}',NOW());`);
 // Deliberately stale read; an atomic patch must preserve the DB's newer value.
 m.find.mockResolvedValue({ id: "a", name: "Synthetic", settings: { other: "stale" } });
 m.query.mockImplementation(async (sql: string, ...args: unknown[]) => (await db.query(sql,args)).rows);
});
it("patches only suspension and honestly reports that enforcement is disconnected", async () => {
 const res = await run({ motivo: "Prueba sintética" });
 expect(res.status).toBe(200);
 expect(await res.json()).toMatchObject({ seAplica: false, seSigueIngiriendo: true, corteDeIngestaSeAplica: false, mensajeQueVeElCliente: null });
 const row = (await db.query<{ settings: Record<string, unknown> }>("SELECT settings FROM organizations")).rows[0];
 expect(row.settings.other).toBe("current"); expect(row.settings.suspension).toBeDefined();
 await DELETE(new NextRequest("https://test.invalid/api"), params);
 expect((await db.query("SELECT settings FROM organizations")).rows[0]).toEqual({ settings: { other: "current" } });
});
it("rejects unsupported ingestion cutoff without persisting it", async () => {
 expect((await run({ motivo: "Prueba sintética", cortarIngesta: true })).status).toBe(409);
 expect(m.query).not.toHaveBeenCalled();
});
it.each([null, [], "value", { motivo: "" }, { motivo: "x".repeat(2001) }, { motivo: "Prueba", cortarIngesta: "false" }])("rejects invalid input %j", async body => {
 expect((await run(body)).status).toBe(400); expect(m.query).not.toHaveBeenCalled();
});
it("does not overwrite malformed settings", async () => {
 await db.exec(`UPDATE organizations SET settings = '[]'`);
 expect((await run({ motivo: "Prueba sintética" })).status).toBe(409);
 expect((await db.query("SELECT settings FROM organizations")).rows[0]).toEqual({ settings: [] });
});
it("does not claim legacy cutoff settings are enforced", async () => {
 m.find.mockResolvedValue({ name: "Synthetic", settings: { suspension: { desde: "2026-09-27", motivo: "Prueba", porQuien: "test", cortarIngesta: true } } });
 const res = await GET(new NextRequest("https://test.invalid/api"), params);
 expect(await res.json()).toMatchObject({ seSigueIngiriendo: true, corteDeIngestaSolicitado: true, corteDeIngestaSeAplica: false });
});
it("rejects non-staff before reading settings", async () => {
 m.staff.mockResolvedValue(false);
 expect((await run({ motivo: "Prueba" })).status).toBe(403); expect(m.find).not.toHaveBeenCalled();
});
