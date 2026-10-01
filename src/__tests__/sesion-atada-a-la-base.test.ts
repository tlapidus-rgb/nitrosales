import { afterEach, beforeEach, expect, it, vi } from "vitest";

// ══════════════════════════════════════════════════════════════════════════
// HOTFIX: la sesión se ata a la base
// ══════════════════════════════════════════════════════════════════════════
// El token de sesión se firma con NEXTAUTH_SECRET, que hoy le llega a cualquier
// usuario logueado. Estos tests fijan que lo que decide permisos —ser staff, el
// rol, la organización, el "ver como"— sale de la base, y que un token que no
// coincide con la base queda sin usuario.
// ══════════════════════════════════════════════════════════════════════════

const m = vi.hoisted(() => ({ fila: vi.fn(), org: vi.fn(), cookies: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  prisma: { $queryRaw: (...a: unknown[]) => m.fila(...a), organization: { findUnique: m.org } },
}));
vi.mock("next/headers", () => ({ cookies: m.cookies }));
vi.mock("@/lib/permissions-resolve", () => ({
  resolveEffectivePermissionsByEmail: vi.fn(), allowedSectionsFrom: vi.fn(), writableSectionsFrom: vi.fn(),
}));

import { authOptions } from "@/lib/auth";
import { olvidarVerificaciones, MEMORIA_ANTE_CORTE_MS } from "@/lib/organizacion/session-access";
import { STAFF_EMAILS } from "@/lib/staff";

const token = { id: "user", organizationId: "a", organizationName: "A", email: "client@example.invalid", isStaff: false, role: "VIEWER" };
const enBase = (o: Record<string, unknown> = {}) => [{ email: "client@example.invalid", isStaff: false, role: "VIEWER", organizationId: "a", ...o }];
const resolve = (override = {}) =>
  authOptions.callbacks!.session!({ session: { expires: "2099-01-01", user: { email: "client@example.invalid" } }, token: { ...token, ...override } } as any) as Promise<any>;
const staffEmail = [...STAFF_EMAILS][0];

beforeEach(() => {
  vi.resetAllMocks(); olvidarVerificaciones();
  m.fila.mockResolvedValue(enBase());
  m.cookies.mockResolvedValue({ get: () => undefined });
});
afterEach(() => vi.useRealTimers());

it("un token que coincide con la base sigue funcionando igual", async () => {
  const s = await resolve();
  expect(s.user).toMatchObject({ id: "user", organizationId: "a", isStaff: false, role: "VIEWER" });
});

it("EL CASO: un token que dice isStaff pero la base no, no es staff ni ve otra organización", async () => {
  m.cookies.mockResolvedValue({ get: () => ({ value: "victima" }) });
  m.org.mockResolvedValue({ id: "victima", name: "Víctima" });
  const s = await resolve({ isStaff: true });
  expect(s.user.isStaff).toBe(false);
  expect(s.user.organizationId).toBe("a");
  expect(m.cookies).not.toHaveBeenCalled();
});

it("el staff de verdad sigue teniendo el \"ver como\"", async () => {
  m.fila.mockResolvedValue(enBase({ isStaff: true }));
  m.cookies.mockResolvedValue({ get: () => ({ value: "otra" }) });
  m.org.mockResolvedValue({ id: "otra", name: "Otra" });
  const s = await resolve({ isStaff: true });
  expect(s.user).toMatchObject({ isStaff: true, organizationId: "otra", realOrganizationId: "a", viewingAsOrg: "otra" });
});

it("un token con el email de alguien de staff que no coincide con la base, queda sin usuario", async () => {
  expect((await resolve({ email: staffEmail })).user).toBeUndefined();
});

it("un token que dice otra organización, queda sin usuario", async () => {
  expect((await resolve({ organizationId: "otra" })).user).toBeUndefined();
});

it("un token de un usuario que no existe, queda sin usuario", async () => {
  m.fila.mockResolvedValue([]);
  expect((await resolve({ id: "inventado" })).user).toBeUndefined();
});

it("el rol sale de la base: un token que se sube a OWNER sigue siendo VIEWER", async () => {
  expect((await resolve({ role: "OWNER" })).user.role).toBe("VIEWER");
});

it("impersonando, nunca es staff", async () => {
  m.fila.mockResolvedValue(enBase({ isStaff: true }));
  expect((await resolve({ impersonatedBy: "staff" })).user.isStaff).toBe(false);
});

it("con una verificación reciente, un error de la base no deja afuera; pasado el margen, sí", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  expect((await resolve()).user.id).toBe("user");
  m.fila.mockRejectedValue(new Error("pool timeout"));
  vi.setSystemTime(new Date(Date.now() + MEMORIA_ANTE_CORTE_MS - 1000));
  expect((await resolve()).user.id).toBe("user");
  vi.setSystemTime(new Date(Date.now() + 2000));
  expect((await resolve()).user).toBeUndefined();
});

it("sin verificación previa, un error de la base deja sin usuario", async () => {
  m.fila.mockRejectedValue(new Error("pool timeout"));
  expect((await resolve()).user).toBeUndefined();
});
