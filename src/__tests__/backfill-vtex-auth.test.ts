import { describe, it, expect, vi, beforeEach } from "vitest";

// ══════════════════════════════════════════════════════════════════════════
// /api/backfill/vtex — qué contesta de verdad, ejecutando el handler
// ══════════════════════════════════════════════════════════════════════════
// Los tests de `backfill-vtex-hardening.test.ts` miran el fuente: sirven como
// guardia anti-regresión textual, pero no responden la pregunta que importa —
// ¿qué devuelve este endpoint cuando lo llama alguien que no debería?
//
// El endpoint borra órdenes y reescribe status de clientes reales. Hasta el
// 2026-09-06 su único control era una clave hardcodeada que además viajaba en
// el bundle público (ver `secretos-fuera-del-bundle.test.ts`). Ahora exige
// sesión de staff, y eso hay que verificarlo corriéndolo.
// ══════════════════════════════════════════════════════════════════════════

const isInternalUser = vi.fn();
const findUnique = vi.fn();
const getVtexConfig = vi.fn();

vi.mock("@/lib/feature-flags", () => ({ isInternalUser: () => isInternalUser() }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    organization: { findUnique: (...a: unknown[]) => findUnique(...a) },
    $queryRawUnsafe: vi.fn(async () => []),
    $executeRawUnsafe: vi.fn(async () => 0),
  },
}));
vi.mock("@/lib/vtex-credentials", () => ({
  getVtexConfig: (...a: unknown[]) => getVtexConfig(...a),
}));

const { GET } = await import("@/app/api/backfill/vtex/route");

const CLAVE = ["nitrosales", "backfill", "2024"].join("-");

function pedir(qs: string) {
  return GET(new Request(`https://app.nitrosales.ai/api/backfill/vtex?${qs}`) as never);
}

beforeEach(() => {
  isInternalUser.mockReset();
  findUnique.mockReset().mockResolvedValue({ id: "org1" });
  getVtexConfig.mockReset().mockResolvedValue({
    creds: { accountName: "cuenta", appKey: "k", appToken: "t" },
  });
});

describe("sin sesión de staff no se entra, tenga o no la clave", () => {
  beforeEach(() => isInternalUser.mockResolvedValue(false));

  it("EL BUG: con la clave publicada y sin sesión, ahora es 401", () => {
    return pedir(`key=${CLAVE}&org=org1&phase=diagnose`).then(async (r) => {
      expect(r.status).toBe(401);
      // Y no llegó a tocar credenciales de nadie.
      expect(getVtexConfig).not.toHaveBeenCalled();
    });
  });

  it("sin clave tampoco", async () => {
    expect((await pedir("org=org1&phase=diagnose")).status).toBe(401);
  });

  it("no devuelve 500 ni filtra el motivo real", async () => {
    const r = await pedir(`key=${CLAVE}&org=otra-org&phase=catalog`);
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(JSON.stringify(body)).not.toContain("otra-org");
  });
});

describe("con sesión de staff", () => {
  beforeEach(() => isInternalUser.mockResolvedValue(true));

  it("sin ?org= devuelve 400, no explota", async () => {
    expect((await pedir(`key=${CLAVE}&phase=diagnose`)).status).toBe(400);
  });

  it("una org inexistente da 404 y NO desencripta credenciales", async () => {
    // Antes, un orgId inventado llegaba hasta getVtexConfig y el 500 resultante
    // ecoaba el orgId: servía para enumerar qué organizaciones tienen VTEX.
    findUnique.mockResolvedValue(null);
    const r = await pedir(`key=${CLAVE}&org=no-existe&phase=diagnose`);
    expect(r.status).toBe(404);
    expect(getVtexConfig).not.toHaveBeenCalled();
  });

  it("una fase inválida da 400 ANTES de desencriptar credenciales", async () => {
    const r = await pedir(`key=${CLAVE}&org=org1&phase=inventada`);
    expect(r.status).toBe(400);
    expect(getVtexConfig).not.toHaveBeenCalled();
  });

  it("fix-statuses ya no pasa la allowlist", async () => {
    // Estaba en la lista pero el switch nunca tuvo su `case`, así que devolvía
    // 200 con el body vacío y el cliente se comía un parse error.
    const r = await pedir(`key=${CLAVE}&org=org1&phase=fix-statuses`);
    expect(r.status).toBe(400);
  });

  it("una fase válida sí llega a resolver credenciales", async () => {
    const r = await pedir(`key=${CLAVE}&org=org1&phase=diagnose&from=2026-09-01&to=2026-09-02`);
    expect(getVtexConfig).toHaveBeenCalledWith("org1");
    expect(r.status).toBe(200);
  });

  it("nunca devuelve un 200 con el cuerpo vacío", async () => {
    // JSON.stringify(undefined) es undefined → 200 con body vacío y
    // content-type json. El que hiciera res.json() explotaba.
    for (const fase of ["diagnose", "fix-list"]) {
      const r = await pedir(`key=${CLAVE}&org=org1&phase=${fase}&from=2026-09-01&to=2026-09-02`);
      const texto = await r.text();
      expect(texto.length).toBeGreaterThan(0);
      expect(() => JSON.parse(texto)).not.toThrow();
    }
  });
});
