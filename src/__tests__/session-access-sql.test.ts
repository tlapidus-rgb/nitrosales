import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
const m = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRaw: m.query } }));
import { verificarIdentidad, accesoDeLaOrganizacion, olvidarVerificaciones } from "@/lib/organizacion/session-access";

// ══════════════════════════════════════════════════════════════════════════
// La consulta de identidad de cada sesión, contra Postgres de verdad
// ══════════════════════════════════════════════════════════════════════════
// verificarIdentidad lee usuario + settings de la organización con un JOIN en
// SQL crudo (una ida a la base en vez de las dos del select anidado de Prisma).
// El test de la sesión mockea esa consulta; éste corre el SQL real sobre la
// DDL equivalente a la que genera prisma/schema.prisma (tablas mapeadas a
// "users"/"organizations", columnas camelCase entre comillas, `role` como enum
// "UserRole", `settings` jsonb), así un nombre mal escrito o una comilla que
// falta se ven acá y no en producción.
// ══════════════════════════════════════════════════════════════════════════

let db: PGlite;
const suspension = { desde: "2026-09-29", motivo: "x", porQuien: "y", cortarIngesta: false };

beforeAll(async () => {
 db = await PGlite.create();
 await db.exec(`
 CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
 CREATE TABLE "organizations" (
  "id" text PRIMARY KEY, "name" text NOT NULL, "slug" text NOT NULL UNIQUE,
  "settings" jsonb NOT NULL DEFAULT '{}'
 );
 CREATE TABLE "users" (
  "id" text PRIMARY KEY, "email" text NOT NULL UNIQUE, "hashedPassword" text NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'MEMBER', "isStaff" boolean NOT NULL DEFAULT false,
  "organizationId" text NOT NULL REFERENCES "organizations"("id")
 );`);
});
afterAll(async () => db.close());
beforeEach(async () => {
 vi.resetAllMocks(); olvidarVerificaciones();
 await db.exec(`TRUNCATE "users", "organizations";`);
 await db.query(`INSERT INTO "organizations" ("id","name","slug","settings") VALUES
  ('org-a','A','a',$1), ('org-b','B','b',$2)`,
  [JSON.stringify({ nitroWeights: { first: 30, last: 40 }, plan: "x" }), JSON.stringify({ suspension })]);
 await db.query(`INSERT INTO "users" ("id","email","hashedPassword","role","isStaff","organizationId") VALUES
  ('u-a','Client@Example.Invalid','h','ADMIN',false,'org-a'),
  ('u-b','otro@example.invalid','h','OWNER',false,'org-b'),
  ('u-staff','soporte@example.invalid','h','MEMBER',true,'org-a')`);
 // Igual que Prisma con un tagged template: el texto con $1.. y los valores aparte.
 m.query.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const sql = Prisma.sql(strings, ...values);
  return (await db.query(sql.text, sql.values)).rows;
 });
});

it("usuario existente: email, rol (texto), staff y settings de SU organización, en una consulta", async () => {
 const r = await verificarIdentidad({ id: "u-a", email: "client@example.invalid", organizationId: "org-a" });
 expect(r).toEqual({ estado: "ok", esStaff: false, role: "ADMIN", settings: { nitroWeights: { first: 30, last: 40 }, plan: "x" } });
 expect(typeof (r as { role: unknown }).role).toBe("string");
 expect(m.query).toHaveBeenCalledTimes(1);
});
it("el email en mayúsculas en la base coincide con el del token en minúsculas, y al revés", async () => {
 expect((await verificarIdentidad({ id: "u-a", email: "CLIENT@example.INVALID", organizationId: "org-a" })).estado).toBe("ok");
});
it("usuario inexistente: invalida (sin filas, como el null de antes)", async () => {
 expect(await verificarIdentidad({ id: "no-existe", email: "client@example.invalid", organizationId: "org-a" })).toEqual({ estado: "invalida" });
});
it("un email distinto al de la base no entra", async () => {
 expect(await verificarIdentidad({ id: "u-a", email: "otro@example.invalid", organizationId: "org-a" })).toEqual({ estado: "invalida" });
});
it("una organización distinta a la de la base no entra", async () => {
 expect(await verificarIdentidad({ id: "u-a", email: "client@example.invalid", organizationId: "org-b" })).toEqual({ estado: "invalida" });
});
it("isStaff y el rol salen de la base", async () => {
 expect(await verificarIdentidad({ id: "u-staff", email: "soporte@example.invalid", organizationId: "org-a" }))
  .toMatchObject({ estado: "ok", esStaff: true, role: "MEMBER" });
 await db.exec(`UPDATE "users" SET "isStaff" = false, "role" = 'OWNER' WHERE "id" = 'u-staff'`);
 expect(await verificarIdentidad({ id: "u-staff", email: "soporte@example.invalid", organizationId: "org-a" }))
  .toMatchObject({ estado: "ok", esStaff: false, role: "OWNER" });
});
it("los settings son los de la organización del usuario: la suspensión de otra no se cruza", async () => {
 const b = await verificarIdentidad({ id: "u-b", email: "otro@example.invalid", organizationId: "org-b" });
 expect(b).toMatchObject({ estado: "ok", settings: { suspension } });
 expect(accesoDeLaOrganizacion((b as { settings: unknown }).settings)).toBe("suspended");
 const a = await verificarIdentidad({ id: "u-a", email: "client@example.invalid", organizationId: "org-a" });
 expect(accesoDeLaOrganizacion((a as { settings: unknown }).settings)).toBeUndefined();
});
it("un id con comillas viaja como parámetro: no trae a nadie ni rompe la consulta", async () => {
 expect(await verificarIdentidad({ id: "x' OR '1'='1", email: "client@example.invalid", organizationId: "org-a" })).toEqual({ estado: "invalida" });
 expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "users"`)).rows[0].n).toBe(3);
});
it("con la base caída sigue valiendo la memoria de 5 minutos de lo último que dijo la base", async () => {
 const log = vi.spyOn(console, "error").mockImplementation(() => {});
 const t = Date.parse("2026-10-01T12:00:00Z");
 await verificarIdentidad({ id: "u-a", email: "client@example.invalid", organizationId: "org-a" }, t);
 await verificarIdentidad({ id: "no-existe", email: "x@example.invalid", organizationId: "org-a" }, t);
 m.query.mockRejectedValue(new Error("pool timeout"));
 expect((await verificarIdentidad({ id: "u-a", email: "client@example.invalid", organizationId: "org-a" }, t + 60_000)).estado).toBe("ok");
 expect((await verificarIdentidad({ id: "no-existe", email: "x@example.invalid", organizationId: "org-a" }, t + 60_000)).estado).toBe("invalida");
 expect((await verificarIdentidad({ id: "u-a", email: "client@example.invalid", organizationId: "org-a" }, t + 6 * 60_000)).estado).toBe("no-verificable");
 log.mockRestore();
});
