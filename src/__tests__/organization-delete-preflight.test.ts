import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ org: vi.fn(), query: vi.fn(), transaction: vi.fn(), staff: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { organization: { findUnique: m.org }, $queryRawUnsafe: m.query, $transaction: m.transaction } }));
vi.mock("@/lib/feature-flags", () => ({ isInternalUser: m.staff }));
vi.mock("@/lib/admin-key", () => ({ isValidAdminKey: () => false }));
import { POST } from "@/app/api/admin/orgs/[orgId]/borrar-todo/route";
const run = (execute = true) => POST(new NextRequest(`https://test.invalid/api${execute ? "?ejecutar=1" : ""}`, { method: "POST", body: JSON.stringify({ confirm: "BORRAR-a" }) }), { params: { orgId: "a" } });
beforeEach(() => {
 vi.resetAllMocks(); m.staff.mockResolvedValue(true); m.org.mockResolvedValue({ name: "A" });
 m.query.mockImplementation(async (sql: string) => {
  if (sql.includes("information_schema.columns")) return [{ tabla: "orders" }];
  if (sql.includes("information_schema.table_constraints")) return [];
  return [{ n: 0 }];
 });
});
it.each(["org", "catalog", "dependencies", "count", "empty-catalog"])("refuses execution on unavailable %s", async failure => {
 if (failure === "org") m.org.mockRejectedValue(new Error("offline"));
 else m.query.mockImplementation(async (sql: string) => {
  if (sql.includes("information_schema.columns")) {
   if (failure === "catalog") throw new Error("offline");
   return failure === "empty-catalog" ? [] : [{ tabla: "orders" }];
  }
  if (sql.includes("information_schema.table_constraints")) {
   if (failure === "dependencies") throw new Error("permission denied");
   return [];
  }
  throw new Error("count unavailable");
 });
 const res = await run();
 expect(res.status).toBe(503); expect((await res.json()).completo).toBe(false);
 expect(m.transaction).not.toHaveBeenCalled();
});
it("distinguishes absent organization from unavailable lookup", async () => {
 m.org.mockResolvedValue(null); expect((await run()).status).toBe(404); expect(m.query).not.toHaveBeenCalled();
});
it("keeps dry-run read-only and explicitly limits its scope", async () => {
 const res = await run(false);
 expect(await res.json()).toMatchObject({ simulacro: true, completo: true, borradoTotalVerificado: false });
 expect(m.transaction).not.toHaveBeenCalled();
});
it("rejects unauthenticated execution before reading organization data", async () => {
 m.staff.mockResolvedValue(false); expect((await run()).status).toBe(403); expect(m.org).not.toHaveBeenCalled();
});
