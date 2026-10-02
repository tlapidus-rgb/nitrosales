import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

// ══════════════════════════════════════════════════════════════════════════
// El provider de impersonación, con NEXTAUTH_SECRET filtrado
// ══════════════════════════════════════════════════════════════════════════
// El token de impersonación se firma con NEXTAUTH_SECRET, y ese secreto hoy le
// llega a cualquier usuario logueado. Así que un token bien firmado no prueba
// que lo emitió alguien de staff. La cadena que encontró la revisión: un
// cliente veía el id de alguien de staff en `createdBy` de roles o API keys,
// fabricaba un token de impersonación hacia ese staff, y recibía una sesión de
// staff sobre todas las organizaciones.
// ══════════════════════════════════════════════════════════════════════════

const m = vi.hoisted(() => ({ users: new Map<string, any>(), login: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: any) => {
        const u = m.users.get(where.id);
        return u ? { ...u, organization: { id: u.organizationId, name: "Org", settings: {} } } : null;
      },
    },
    // La verificación de identidad de cada sesión (session-access.ts) es una
    // consulta cruda con el id como único parámetro; devuelve filas planas.
    $queryRaw: async (_sql: TemplateStringsArray, id: string) => {
      const u = m.users.get(id);
      return u ? [{ email: u.email, isStaff: u.isStaff, role: u.role, organizationId: u.organizationId, settings: {} }] : [];
    },
    loginEvent: { create: m.login },
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/permissions-resolve", () => ({
  resolveEffectivePermissionsByEmail: vi.fn(), allowedSectionsFrom: vi.fn(), writableSectionsFrom: vi.fn(),
}));

import { authOptions } from "@/lib/auth";
import { STAFF_EMAILS } from "@/lib/staff";

const SECRETO = "synthetic-test-secret";
const firmar = (payload: object, secreto = SECRETO) => {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${createHmac("sha256", secreto).update(data).digest("base64url").slice(0, 32)}`;
};
const autorizar = (token: string) => {
  const p: any = authOptions.providers.find((x: any) => (x.options?.id ?? x.id) === "impersonate");
  return (p.options?.authorize ?? p.authorize)({ token }, {} as any);
};
const enUnMinuto = () => Date.now() + 60_000;

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", SECRETO);
  m.users.clear(); m.login.mockReset().mockResolvedValue({});
  m.users.set("staff", { id: "staff", email: "soporte@nitro.invalid", isStaff: true, role: "OWNER", organizationId: "nitro" });
  m.users.set("otro-staff", { id: "otro-staff", email: "otro@nitro.invalid", isStaff: true, role: "OWNER", organizationId: "nitro" });
  m.users.set("cliente", { id: "cliente", email: "dueno@cliente.invalid", isStaff: false, role: "OWNER", organizationId: "c1" });
  m.users.set("atacante", { id: "atacante", email: "yo@otro.invalid", isStaff: false, role: "VIEWER", organizationId: "c2" });
});
afterEach(() => vi.unstubAllEnvs());

it("el caso legítimo: staff impersona a un cliente", async () => {
  const u = await autorizar(firmar({ targetUserId: "cliente", impersonatorUserId: "staff", impersonatorEmail: "soporte@nitro.invalid", exp: enUnMinuto() }));
  expect(u).toMatchObject({ id: "cliente", organizationId: "c1", impersonatedBy: "staff" });
});

it("EL CASO: un cliente que firma un token hacia alguien de staff no recibe nada", async () => {
  const u = await autorizar(firmar({ targetUserId: "staff", impersonatorUserId: "atacante", impersonatorEmail: "x", exp: enUnMinuto() }));
  expect(u).toBeNull();
});

it("tampoco si dice que lo inicia otro staff: el destino no puede ser staff", async () => {
  const u = await autorizar(firmar({ targetUserId: "staff", impersonatorUserId: "otro-staff", impersonatorEmail: "x", exp: enUnMinuto() }));
  expect(u).toBeNull();
});

it("EL CASO (staff por email): tampoco a un destino que es staff sólo por la allowlist de emails", async () => {
  // isStaff=false en la base, pero el email está en STAFF_EMAILS. La sesión de
  // la impersonación lleva ese email, e isInternalUser() (isStaffUser con el
  // email de la sesión) la trataría como staff: gates de /api/admin abiertos.
  m.users.set("staff-por-email", {
    id: "staff-por-email", email: [...STAFF_EMAILS][0], isStaff: false, role: "OWNER", organizationId: "nitro",
  });
  const u = await autorizar(firmar({ targetUserId: "staff-por-email", impersonatorUserId: "staff", impersonatorEmail: "x", exp: enUnMinuto() }));
  expect(u).toBeNull();
});

it("quien la inicia tiene que ser staff en la base, no en el token", async () => {
  const u = await autorizar(firmar({ targetUserId: "cliente", impersonatorUserId: "atacante", impersonatorEmail: "soporte@nitro.invalid", exp: enUnMinuto() }));
  expect(u).toBeNull();
});

it("un impersonador que no existe no sirve", async () => {
  const u = await autorizar(firmar({ targetUserId: "cliente", impersonatorUserId: "inventado", impersonatorEmail: "x", exp: enUnMinuto() }));
  expect(u).toBeNull();
});

it("el email del impersonador sale de la base (queda en la auditoría)", async () => {
  const u: any = await autorizar(firmar({ targetUserId: "cliente", impersonatorUserId: "staff", impersonatorEmail: "mentira@x.invalid", exp: enUnMinuto() }));
  expect(u.impersonatorEmail).toBe("soporte@nitro.invalid");
  expect(JSON.stringify(m.login.mock.calls)).not.toContain("mentira");
});

it("sin NEXTAUTH_SECRET no hay impersonación, aunque se firme con el literal viejo", async () => {
  vi.stubEnv("NEXTAUTH_SECRET", "");
  const u = await autorizar(firmar({ targetUserId: "cliente", impersonatorUserId: "staff", impersonatorEmail: "x", exp: enUnMinuto() }, "fallback-secret"));
  expect(u).toBeNull();
});

it("una firma que no coincide no pasa", async () => {
  const u = await autorizar(firmar({ targetUserId: "cliente", impersonatorUserId: "staff", impersonatorEmail: "x", exp: enUnMinuto() }, "otro-secreto"));
  expect(u).toBeNull();
});

it("impersonando, la sesión nunca es de staff", async () => {
  // Aunque la base dijera que el destino es staff (no debería llegar, ver
  // arriba), la sesión de una impersonación no lleva poderes de staff.
  m.users.set("cliente", { ...m.users.get("cliente"), isStaff: true });
  const session: any = await authOptions.callbacks!.session!({
    session: { expires: "2099-01-01", user: { email: "dueno@cliente.invalid" } },
    token: { id: "cliente", email: "dueno@cliente.invalid", organizationId: "c1", impersonatedBy: "staff" },
  } as any);
  expect(session.user.isStaff).toBe(false);
});
