import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { olvidarVerificaciones, MEMORIA_ANTE_CORTE_MS, verificarIdentidad } from "@/lib/organizacion/session-access";
import { isStaffUser, STAFF_EMAILS } from "@/lib/staff";

const token = { id: "user", organizationId: "a", organizationName: "A", email: "client@example.invalid", isStaff: false, role: "VIEWER" };
const enBase = (o: Record<string, unknown> = {}) => [{ email: "client@example.invalid", isStaff: false, role: "VIEWER", organizationId: "a", settings: {}, ...o }];
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

describe("memoria ante corte: el recuerdo sólo vale con el mismo email y la misma organización", () => {
  // Lo recordado es por id. Durante un corte de la base, un token fabricado con
  // el id de un usuario verificado hace poco no puede traer otro email ni otra
  // organización: NextAuth arma `session.user.email` con el email del TOKEN, e
  // isInternalUser() trata como staff a cualquier sesión cuyo email esté en
  // STAFF_EMAILS.
  const comoNextAuth = (override: Record<string, unknown> = {}) => {
    const t = { ...token, ...override };
    return authOptions.callbacks!.session!({ session: { expires: "2099-01-01", user: { email: t.email } }, token: t } as any) as Promise<any>;
  };
  /** `user` se verifica con la base; un minuto después, la base no responde. */
  async function verificadoYDespuesCorte(): Promise<void> {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    expect((await resolve()).user.id).toBe("user");
    m.fila.mockRejectedValue(new Error("pool timeout"));
    vi.setSystemTime(new Date(Date.now() + 60_000));
  }

  it("control: durante el corte, el mismo token sigue entrando", async () => {
    await verificadoYDespuesCorte();
    expect((await comoNextAuth()).user.id).toBe("user");
  });

  it("EL CASO: durante el corte, el id recordado con el email de alguien de staff no entra ni pasa por staff", async () => {
    await verificadoYDespuesCorte();
    const s = await comoNextAuth({ email: staffEmail });
    // Lo que decide isInternalUser(): isStaff y email de la sesión.
    expect(isStaffUser({ isStaff: s.user?.isStaff, email: s.user?.email })).toBe(false);
    expect(s.user).toBeUndefined();
  });

  it("durante el corte, el id recordado con otra organización no entra", async () => {
    await verificadoYDespuesCorte();
    expect((await comoNextAuth({ organizationId: "otra" })).user).toBeUndefined();
  });

  it("verificarIdentidad compara el recuerdo contra el email y la organización del token", async () => {
    const t0 = Date.parse("2026-10-01T12:00:00Z");
    const t1 = t0 + 60_000;
    const delToken = { id: "user", email: "client@example.invalid", organizationId: "a" };
    expect(await verificarIdentidad(delToken, t0)).toMatchObject({ estado: "ok" });
    m.fila.mockRejectedValue(new Error("pool timeout"));
    expect(await verificarIdentidad(delToken, t1)).toMatchObject({ estado: "ok" });
    expect(await verificarIdentidad({ ...delToken, email: staffEmail }, t1)).toEqual({ estado: "invalida" });
    expect(await verificarIdentidad({ ...delToken, email: "otro@example.invalid" }, t1)).toEqual({ estado: "invalida" });
    expect(await verificarIdentidad({ ...delToken, organizationId: "otra" }, t1)).toEqual({ estado: "invalida" });
  });

  it("un usuario que la base dijo que no existe sigue sin existir durante el corte", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    m.fila.mockResolvedValue([]);
    expect((await resolve()).user).toBeUndefined();
    m.fila.mockRejectedValue(new Error("pool timeout"));
    vi.setSystemTime(new Date(Date.now() + 60_000));
    expect((await resolve()).user).toBeUndefined();
  });
});
