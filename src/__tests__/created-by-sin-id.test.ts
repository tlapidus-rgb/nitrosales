import { beforeEach, describe, expect, it, vi } from "vitest";

// ══════════════════════════════════════════════════════════════════════════
// HOTFIX: `createdBy` sin `id` en los listados de API keys y roles
// ══════════════════════════════════════════════════════════════════════════
// Un rol o una API key creada por alguien de staff en "ver como" quedaba con
// `createdBy` apuntando a ese usuario de staff, y el GET se lo devolvía con su
// `id` a los usuarios del cliente. Con NEXTAUTH_SECRET filtrado, el id de un
// staff es la pieza que falta para fabricar un token (de sesión o de
// impersonación) que la base reconozca. El listado sigue mostrando quién lo
// creó (nombre y email), sin el id.
//
// El mock de prisma aplica el `select` que recibe sobre una fila completa,
// como la base: se testea lo que sale en la respuesta.
// ══════════════════════════════════════════════════════════════════════════

const m = vi.hoisted(() => ({ apiKeys: vi.fn(), roles: vi.fn() }));
vi.mock("@/lib/permission-guard", () => ({ requirePermission: async () => ({ allowed: true }) }));
vi.mock("@/lib/auth-guard", () => ({ getOrganizationId: async () => "c1" }));
vi.mock("@/lib/db/client", () => ({
  prisma: { apiKey: { findMany: m.apiKeys }, customRole: { findMany: m.roles } },
}));

import { GET as listarApiKeys } from "@/app/api/settings/api-keys/route";
import { GET as listarRoles } from "@/app/api/settings/custom-roles/route";

const ID_DEL_STAFF = "cidrealdealguiendestaff01";
const STAFF = {
  id: ID_DEL_STAFF,
  name: "Soporte",
  email: "soporte@nitro.invalid",
  isStaff: true,
  organizationId: "nitro",
  hashedPassword: "hash-sintetico",
};

type Select = Record<string, unknown>;
/** Lo que la base devolvería para ese `select` (incluye relaciones anidadas). */
function proyectar(fila: Record<string, unknown>, select: Select): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [campo, pedido] of Object.entries(select)) {
    if (!pedido) continue;
    if (pedido === true) out[campo] = fila[campo];
    else {
      const anidado = fila[campo] as Record<string, unknown> | null;
      out[campo] = anidado == null ? null : proyectar(anidado, (pedido as { select: Select }).select);
    }
  }
  return out;
}
const comoLaBase = (filas: Array<Record<string, unknown>>) => async (args: { select: Select }) =>
  filas.map((f) => proyectar(f, args.select));

beforeEach(() => {
  m.apiKeys.mockReset().mockImplementation(
    comoLaBase([
      {
        id: "key1", name: "Integración ERP", prefix: "ns_live_abcdefgh", scopes: ["read:orders"],
        hashedToken: "hash-del-token", organizationId: "c1", revokedAt: null,
        lastUsedAt: null, expiresAt: null, createdAt: new Date("2026-09-01T00:00:00Z"),
        createdById: ID_DEL_STAFF, createdBy: STAFF,
      },
    ]),
  );
  m.roles.mockReset().mockImplementation(
    comoLaBase([
      {
        id: "rol1", name: "Analista", slug: "analista", description: null, color: null, icon: null,
        permissions: {}, organizationId: "c1", isActive: true,
        createdAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-09-01T00:00:00Z"),
        createdById: ID_DEL_STAFF, createdBy: STAFF, _count: { users: 2 },
      },
    ]),
  );
});

describe("listados de settings — el id de quien creó no sale", () => {
  it("EL CASO: GET /api/settings/api-keys no expone el id del staff que creó la key", async () => {
    const res = await listarApiKeys();
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.keys[0].createdBy).toEqual({ name: "Soporte", email: "soporte@nitro.invalid" });
    expect(JSON.stringify(cuerpo)).not.toContain(ID_DEL_STAFF);
  });

  it("EL CASO: GET /api/settings/custom-roles no expone el id del staff que creó el rol", async () => {
    const res = await listarRoles();
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.roles[0].createdBy).toEqual({ name: "Soporte", email: "soporte@nitro.invalid" });
    expect(cuerpo.roles[0]._count).toEqual({ users: 2 });
    expect(JSON.stringify(cuerpo)).not.toContain(ID_DEL_STAFF);
  });
});
