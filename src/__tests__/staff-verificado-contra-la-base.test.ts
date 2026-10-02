import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ══════════════════════════════════════════════════════════════════════════
// isInternalUser: staff según la base, no según el token
// ══════════════════════════════════════════════════════════════════════════
// La sesión es un JWT. Con el secreto que lo firma se fabrica uno con
// isStaff=true y cualquier id, y isInternalUser lo creía: así se abrían todas
// las rutas de staff (reset de passwords, borrado de cuentas, etc.). Ahora el
// usuario tiene que existir, el email del token coincidir con el de la base y
// el staff se lee de la base. Además debug-org y meta-status dejan de aceptar
// la clave: entregaban los ids y orgIds que hacen falta para fabricar la
// sesión de una persona real.
// ══════════════════════════════════════════════════════════════════════════

type Fila = { id: string; email: string; name: string; organizationId: string; isStaff: boolean; role: string; createdAt: Date };

const m = vi.hoisted(() => {
  process.env.ADMIN_API_KEY = "clave-sintetica-de-prueba";
  return { session: null as any, usuarios: [] as Fila[], updates: [] as any[], consultas: 0, baseCaida: false };
});

// Como Prisma: sólo devuelve los campos pedidos en `select`.
function elegir(fila: any, select?: Record<string, boolean>) {
  if (!fila || !select) return fila ?? null;
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, fila[k]]));
}

vi.mock("next-auth", () => ({ getServerSession: async () => m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("bcryptjs", () => ({ hash: async (p: string) => `hash(${p})` }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    user: {
      findUnique: async ({ where, select }: any) => {
        if (m.baseCaida) throw new Error("connection terminated");
        m.consultas++;
        return elegir(m.usuarios.find((u) => (where.id ? u.id === where.id : u.email === where.email)), select);
      },
      findMany: async ({ where, select }: any) => {
        m.consultas++;
        return m.usuarios.filter((u) => u.organizationId === where.organizationId).map((u) => elegir(u, select));
      },
      update: async (args: any) => {
        m.updates.push(args);
        return {};
      },
    },
    organization: { findUnique: async () => { m.consultas++; return { id: "x", name: "Org", slug: "org", createdAt: new Date() }; } },
    connection: { findFirst: async () => { m.consultas++; return null; } },
    $queryRawUnsafe: async () => { m.consultas++; return []; },
  },
}));

import { isInternalUser } from "@/lib/feature-flags";
import * as porId from "@/app/api/admin/users/[userId]/reset-password/route";
import * as debugOrg from "@/app/api/admin/debug-org/route";
import * as metaStatus from "@/app/api/admin/meta-status/route";

const ahora = new Date("2026-10-01T00:00:00Z");
const STAFF: Fila = { id: "ckstaff0000000000000001", email: "staff@nitrosales.test", name: "Staff", organizationId: "ckorg00000000000000000001", isStaff: true, role: "OWNER", createdAt: ahora };
const CLIENTE: Fila = { id: "ckclie0000000000000000001", email: "cliente@tienda.test", name: "Cliente", organizationId: "ckorg00000000000000000002", isStaff: false, role: "OWNER", createdAt: ahora };
// Staff por la allowlist de transición (src/lib/staff.ts), con isStaff=false en la base.
const TOMY: Fila = { id: "cktomy0000000000000000001", email: "tlapidus@99media.com.ar", name: "Tomy", organizationId: "ckorg00000000000000000001", isStaff: false, role: "OWNER", createdAt: ahora };

const sesionDe = (u: Fila, extra: Record<string, unknown> = {}) => ({ user: { id: u.id, email: u.email, isStaff: u.isStaff, ...extra } });

beforeEach(() => {
  m.session = null;
  m.usuarios = [STAFF, CLIENTE, TOMY];
  m.updates = [];
  m.consultas = 0;
  m.baseCaida = false;
});

describe("isInternalUser", () => {
  it("EL CASO: un token fabricado con isStaff=true y un id inventado no es staff", async () => {
    m.session = { user: { id: "ckinventado0000000000001", email: "atacante@x.test", isStaff: true } };
    expect(await isInternalUser()).toBe(false);
  });

  it("un token con isStaff=true sobre un usuario que no es staff en la base no es staff", async () => {
    m.session = sesionDe(CLIENTE, { isStaff: true });
    expect(await isInternalUser()).toBe(false);
  });

  it("un token con el id de un staff y otro email no es staff", async () => {
    m.session = { user: { id: STAFF.id, email: "atacante@x.test", isStaff: true } };
    expect(await isInternalUser()).toBe(false);
  });

  it("un token con el email de la allowlist y el id de otro usuario no es staff", async () => {
    m.session = { user: { id: CLIENTE.id, email: TOMY.email, isStaff: true } };
    expect(await isInternalUser()).toBe(false);
  });

  it("impersonando no es staff", async () => {
    m.session = sesionDe(STAFF, { impersonatedBy: STAFF.id });
    expect(await isInternalUser()).toBe(false);
  });

  it("sin sesión no es staff", async () => {
    expect(await isInternalUser()).toBe(false);
  });

  it("si la base no responde, falla cerrado", async () => {
    m.session = sesionDe(STAFF);
    m.baseCaida = true;
    expect(await isInternalUser()).toBe(false);
  });

  it("staff por la columna de la base, aunque el token diga lo contrario", async () => {
    m.session = sesionDe(STAFF, { isStaff: false });
    expect(await isInternalUser()).toBe(true);
  });

  it("staff por la allowlist de emails", async () => {
    m.session = sesionDe(TOMY);
    expect(await isInternalUser()).toBe(true);
  });

  it("el email se compara sin mayúsculas", async () => {
    m.session = { user: { id: STAFF.id, email: STAFF.email.toUpperCase() } };
    expect(await isInternalUser()).toBe(true);
  });
});

describe("POST /api/admin/users/[userId]/reset-password", () => {
  const post = (userId: string) =>
    porId.POST(new NextRequest(`http://local/api/admin/users/${userId}/reset-password`, { method: "POST" }), {
      params: Promise.resolve({ userId }),
    });

  it("con un token fabricado no resetea nada", async () => {
    m.session = { user: { id: "ckinventado0000000000001", email: "atacante@x.test", isStaff: true } };
    expect((await post(CLIENTE.id)).status).toBe(403);
    expect(m.updates).toEqual([]);
  });

  it("no resetea una cuenta de staff por la columna", async () => {
    m.usuarios.push({ ...STAFF, id: "ckstaff0000000000000000002", email: "otro-staff@nitrosales.test" });
    m.session = sesionDe(STAFF);
    expect((await post("ckstaff0000000000000000002")).status).toBe(403);
    expect(m.updates).toEqual([]);
  });

  it("no resetea una cuenta de staff por la allowlist", async () => {
    m.session = sesionDe(STAFF);
    expect((await post(TOMY.id)).status).toBe(403);
    expect(m.updates).toEqual([]);
  });

  it("staff de verdad resetea la cuenta de un cliente", async () => {
    m.session = sesionDe(STAFF);
    const res = await post(CLIENTE.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(m.updates).toEqual([{ where: { id: CLIENTE.id }, data: { hashedPassword: `hash(${body.newPassword})` } }]);
  });
});

describe.each([
  ["debug-org", () => debugOrg.GET(new Request(`http://local/api/admin/debug-org?orgId=${CLIENTE.organizationId}&key=clave-sintetica-de-prueba`))],
  ["meta-status", () => metaStatus.GET(new NextRequest(`http://local/api/admin/meta-status?email=${CLIENTE.email}&key=clave-sintetica-de-prueba`))],
])("%s", (_nombre, pedir) => {
  it("la clave sin sesión de staff no abre nada", async () => {
    const res = await pedir();
    expect(res.status).toBe(403);
    // Sólo la consulta de isInternalUser, que sin sesión ni llega a la base.
    expect(m.consultas).toBe(0);
  });

  it("con sesión de staff responde", async () => {
    m.session = sesionDe(STAFF);
    expect((await pedir()).status).toBe(200);
  });
});
