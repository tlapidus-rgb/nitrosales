import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ══════════════════════════════════════════════════════════════════════════
// HOTFIX: rutas que aceptaban una clave y pasaron a sesión de staff
// ══════════════════════════════════════════════════════════════════════════
// /api/admin/reattribute y /api/admin/reconcile aceptaban `?key=` contra
// ADMIN_SECRET o contra un literal escrito en el código; /api/backfill/vtex y
// /api/fix-brands, contra una constante escrita en el código (y la página
// pública /backfill-runner la llevaba en su JavaScript). Ahora piden sesión de
// staff (`isInternalUser()`, que lee isStaff de la base). /api/backfill/vtex y
// /api/fix-brands NO están bajo /api/admin: el middleware no las protege, este
// chequeo es lo único que hay.
//
// Se fija: sin staff → 401 y la base no se toca (el mock de prisma registra
// cualquier llamada); ninguna clave abre (ni la del entorno ni el literal
// viejo); con staff → la ruta sigue más allá del gate.
// ══════════════════════════════════════════════════════════════════════════

const m = vi.hoisted(() => {
  const llamadas: string[] = [];
  const respuesta = (op: string) =>
    op === "findMany" || op.startsWith("$query") ? [] : op === "count" ? 0 : null;
  const registrar = (nombre: string) => async (..._args: unknown[]) => {
    llamadas.push(nombre);
    return respuesta(nombre.split(".").pop()!);
  };
  // Cualquier modelo y cualquier operación: todo lo que la ruta le pida a la
  // base queda anotado en `llamadas`.
  const modelo = (nombre: string) =>
    new Proxy({}, { get: (_t, op) => (typeof op === "string" ? registrar(`${nombre}.${op}`) : undefined) });
  const prisma = new Proxy(
    {},
    {
      get: (_t, k) => {
        if (typeof k !== "string" || k === "then") return undefined;
        return k.startsWith("$") ? registrar(k) : modelo(k);
      },
    },
  );
  return {
    llamadas,
    prisma,
    staff: false,
    vtex: vi.fn(),
    atribuir: vi.fn(),
    fetch: vi.fn(),
  };
});

vi.mock("@/lib/feature-flags", () => ({ isInternalUser: async () => m.staff }));
vi.mock("@/lib/db/client", () => ({ prisma: m.prisma }));
vi.mock("@/lib/vtex-credentials", () => ({ getVtexConfig: m.vtex }));
vi.mock("@/lib/auth-guard", () => ({ getOrganizationId: async () => "corgdelasesion00000000001" }));
// CORE PROTEGIDO: no se ejecuta, sólo se registra si alguien llega a llamarlo.
vi.mock("@/lib/pixel/attribution", () => ({ calculateAttribution: m.atribuir }));

import { POST as reattribute } from "@/app/api/admin/reattribute/route";
import { POST as reconcile } from "@/app/api/admin/reconcile/route";
import { GET as backfillVtex } from "@/app/api/backfill/vtex/route";
import { GET as fixBrands } from "@/app/api/fix-brands/route";

const ORG = "cunaorgsintetica0000000001";
const CLAVE_DEL_ENTORNO = "clave-del-entorno-sintetica";
// Las claves que estas rutas aceptaban escritas en el código (ya no están en
// src/app; ver sin-claves-en-el-codigo.test.ts). Que no abran nada.
const LITERAL_REATTRIBUTE = "reattribute-2026";
const LITERAL_BACKFILL = "nitrosales-backfill-2024";

type Ruta = {
  nombre: string;
  llamar: (query: string) => Promise<Response>;
  /** Query con la que, siendo staff, la ruta sigue de largo después del gate. */
  avance: string;
  literalViejo: string;
  /** Prueba de que pasó el gate (algo que sólo ocurre después). */
  paso: () => boolean;
};

const RUTAS: Ruta[] = [
  {
    nombre: "/api/admin/reattribute",
    llamar: (q) => reattribute(new Request(`http://local/api/admin/reattribute${q}`, { method: "POST" })),
    avance: `?org=${ORG}`,
    literalViejo: LITERAL_REATTRIBUTE,
    paso: () => m.llamadas.includes("pixelAttribution.findMany"),
  },
  {
    nombre: "/api/admin/reconcile",
    llamar: (q) => reconcile(new Request(`http://local/api/admin/reconcile${q}`, { method: "POST" })),
    avance: `?org=${ORG}&dry=true`,
    literalViejo: LITERAL_REATTRIBUTE,
    paso: () => m.llamadas.includes("organization.findUnique"),
  },
  {
    nombre: "/api/backfill/vtex",
    llamar: (q) => backfillVtex(new Request(`http://local/api/backfill/vtex${q}`)),
    avance: `?org=${ORG}&phase=ninguna`,
    literalViejo: LITERAL_BACKFILL,
    paso: () => m.llamadas.includes("organization.findUnique"),
  },
  {
    nombre: "/api/fix-brands",
    llamar: (q) => fixBrands(new NextRequest(`http://local/api/fix-brands${q}`)),
    avance: `?org=${ORG}&action=stats`,
    literalViejo: LITERAL_BACKFILL,
    paso: () => m.llamadas.includes("product.count"),
  },
];

beforeEach(() => {
  m.staff = false;
  m.llamadas.length = 0;
  m.vtex.mockReset().mockResolvedValue({
    creds: { appKey: "k", appToken: "t", accountName: "cuenta" },
    headers: {},
    baseUrl: "https://cuenta.invalid",
  });
  m.atribuir.mockReset();
  m.fetch.mockReset().mockRejectedValue(new Error("sin red en los tests"));
  vi.stubGlobal("fetch", m.fetch);
  vi.stubEnv("ADMIN_SECRET", CLAVE_DEL_ENTORNO);
  vi.stubEnv("ADMIN_API_KEY", CLAVE_DEL_ENTORNO);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Nada de lo que hay detrás del gate se ejecutó. */
function nadaTocado(): void {
  expect(m.llamadas, "la base no se toca").toEqual([]);
  expect(m.vtex).not.toHaveBeenCalled();
  expect(m.atribuir).not.toHaveBeenCalled();
  expect(m.fetch).not.toHaveBeenCalled();
}

describe.each(RUTAS)("$nombre — sólo sesión de staff", (ruta) => {
  // Con ?org= explícito: sin él, fix-brands busca una org en la base ANTES
  // del gate (lectura previa al hotfix, sin datos en la respuesta).
  const conOrg = (extra = "") => `?org=${ORG}${extra}`;

  it("sin sesión de staff → 401 y la base no se toca", async () => {
    const res = await ruta.llamar(conOrg());
    expect(res.status).toBe(401);
    nadaTocado();
  });

  it("la clave del entorno (ADMIN_SECRET / ADMIN_API_KEY) sin staff → 401 y la base no se toca", async () => {
    const res = await ruta.llamar(conOrg(`&key=${CLAVE_DEL_ENTORNO}`));
    expect(res.status).toBe(401);
    nadaTocado();
  });

  it("el literal que estaba escrito en el código, sin staff → 401 y la base no se toca", async () => {
    const res = await ruta.llamar(conOrg(`&key=${ruta.literalViejo}`));
    expect(res.status).toBe(401);
    nadaTocado();
  });

  it("con sesión de staff (sin clave) → sigue más allá del gate", async () => {
    m.staff = true;
    const res = await ruta.llamar(ruta.avance);
    expect(res.status).not.toBe(401);
    expect(ruta.paso()).toBe(true);
  });
});


describe.each(RUTAS.filter(r => r.nombre !== "/api/fix-brands"))("$nombre — organización explícita", (ruta) => {
  it("staff sin organización recibe 400 antes de cualquier consulta", async () => {
    m.staff = true;
    const res = await ruta.llamar("");
    expect(res.status).toBe(400);
    nadaTocado();
  });
});
