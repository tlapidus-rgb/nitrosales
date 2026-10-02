import { beforeEach, describe, expect, it, vi } from "vitest";

// ══════════════════════════════════════════════════════════════════════════
// /api/admin/reset-password-by-email
// ══════════════════════════════════════════════════════════════════════════
// En producción, GET ?key=<ADMIN_API_KEY>&email=<cualquiera> reseteaba la
// password de esa cuenta y la devolvía en la respuesta: con la clave alcanzaba
// un pedido para quedarse con cualquier cuenta, la de staff incluida, y entrar
// por el login normal. Ahora: sin GET ni clave, staff verificado contra la base
// (isInternalUser real, no mockeado: no confía en el token, que se puede
// fabricar) y nunca sobre cuentas de staff.
// ══════════════════════════════════════════════════════════════════════════

type Fila = { id: string; email: string; name: string; organizationId: string; isStaff: boolean };

const m = vi.hoisted(() => ({
  session: null as any,
  usuarios: [] as Fila[],
  updates: [] as any[],
}));

vi.mock("next-auth", () => ({ getServerSession: async () => m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("bcryptjs", () => ({ hash: async (p: string) => `hash(${p})` }));
// Como Prisma: sólo devuelve los campos pedidos en `select`. Si una consulta
// deja de pedir `isStaff`, el chequeo de staff lo ve como `undefined`.
function elegir(fila: any, select?: Record<string, boolean>) {
  if (!fila || !select) return fila ?? null;
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, fila[k]]));
}

vi.mock("@/lib/db/client", () => ({
  prisma: {
    user: {
      findUnique: async ({ where, select }: any) =>
        elegir(m.usuarios.find((u) => (where.id ? u.id === where.id : u.email === where.email)), select),
      update: async (args: any) => {
        m.updates.push(args);
        return {};
      },
    },
  },
}));

import * as ruta from "@/app/api/admin/reset-password-by-email/route";

const STAFF: Fila = { id: "ckstaff0000000000000001", email: "staff@nitrosales.test", name: "Staff", organizationId: "ckorg00000000000000000001", isStaff: true };
const CLIENTE: Fila = { id: "ckclie0000000000000000001", email: "cliente@tienda.test", name: "Cliente", organizationId: "ckorg00000000000000000002", isStaff: false };
// Staff por la allowlist de transición (src/lib/staff.ts), con isStaff=false en la base.
const TOMY: Fila = { id: "cktomy0000000000000000001", email: "tlapidus@99media.com.ar", name: "Tomy", organizationId: "ckorg00000000000000000001", isStaff: false };

function sesionDe(u: Fila, extra: Record<string, unknown> = {}) {
  return { user: { id: u.id, email: u.email, isStaff: u.isStaff, ...extra } };
}

function post(email: string, query = "") {
  return ruta.POST(
    new Request(`http://local/api/admin/reset-password-by-email${query}`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  );
}

beforeEach(() => {
  m.session = null;
  m.usuarios = [STAFF, CLIENTE, TOMY];
  m.updates = [];
});

describe("reset-password-by-email: quién puede", () => {
  it("EL CASO: no hay GET — la URL con la clave ya no resetea nada", () => {
    // Next responde 405 a un método que la ruta no exporta.
    expect((ruta as any).GET).toBeUndefined();
  });

  it("la clave en la URL tampoco abre el POST sin sesión", async () => {
    const res = await post(CLIENTE.email, "?key=cualquier-valor");
    expect(res.status).toBe(403);
    expect(m.updates).toEqual([]);
  });

  it("un token fabricado con isStaff=true sobre un usuario que no es staff en la base: 403", async () => {
    m.session = sesionDe(CLIENTE, { isStaff: true });
    const res = await post("otro@tienda.test");
    expect(res.status).toBe(403);
    expect(m.updates).toEqual([]);
  });

  it("un token con el id de un staff y otro email: 403", async () => {
    m.session = { user: { id: STAFF.id, email: "atacante@tienda.test", isStaff: true } };
    const res = await post(CLIENTE.email);
    expect(res.status).toBe(403);
    expect(m.updates).toEqual([]);
  });

  it("un token de un usuario que no existe en la base: 403", async () => {
    m.session = { user: { id: "ckinexistente000000000001", email: STAFF.email, isStaff: true } };
    const res = await post(CLIENTE.email);
    expect(res.status).toBe(403);
    expect(m.updates).toEqual([]);
  });

  it("staff mirando como otra cuenta (impersonación): 403", async () => {
    m.session = sesionDe(STAFF, { impersonatedBy: STAFF.id });
    const res = await post(CLIENTE.email);
    expect(res.status).toBe(403);
    expect(m.updates).toEqual([]);
  });

  it("staff de verdad resetea la cuenta de un cliente y recibe la password temporal", async () => {
    m.session = sesionDe(STAFF);
    const res = await post("  Cliente@Tienda.test ");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe(CLIENTE.id);
    expect(body.newPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(m.updates).toEqual([{ where: { id: CLIENTE.id }, data: { hashedPassword: `hash(${body.newPassword})` } }]);
  });

  it("el email de la sesión se compara sin mayúsculas", async () => {
    m.session = { user: { id: STAFF.id, email: STAFF.email.toUpperCase(), isStaff: true } };
    expect((await post(CLIENTE.email)).status).toBe(200);
  });

  it("staff por la allowlist de emails (isStaff=false en la base) también puede", async () => {
    m.session = sesionDe(TOMY);
    expect((await post(CLIENTE.email)).status).toBe(200);
  });
});

describe("reset-password-by-email: a quién", () => {
  it("no resetea una cuenta de staff (isStaff en la base)", async () => {
    m.usuarios.push({ ...STAFF, id: "ckstaff0000000000000000002", email: "otro-staff@nitrosales.test" });
    m.session = sesionDe(STAFF);
    const res = await post("otro-staff@nitrosales.test");
    expect(res.status).toBe(403);
    expect(m.updates).toEqual([]);
  });

  it("no resetea una cuenta de staff por la allowlist de emails", async () => {
    m.session = sesionDe(STAFF);
    const res = await post(TOMY.email);
    expect(res.status).toBe(403);
    expect(m.updates).toEqual([]);
  });

  it("email inexistente: 404 sin tocar nada", async () => {
    m.session = sesionDe(STAFF);
    expect((await post("nadie@tienda.test")).status).toBe(404);
    expect(m.updates).toEqual([]);
  });
});
