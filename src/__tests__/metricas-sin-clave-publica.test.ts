import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ══════════════════════════════════════════════════════════════════════════
// Métricas: la clave pública ya no elige la organización
// ══════════════════════════════════════════════════════════════════════════
// `?orgId=X&key=<ADMIN_API_KEY>` hacía que estas rutas respondieran como la
// organización X, sin sesión. La clave está filtrada y los orgIds de clientes
// figuran en los docs del repo: metrics/orders devolvía nombres y emails de los
// compradores de cualquiera. Ahora orders usa siempre la sesión, y las que el
// warm-cache sí llama aceptan sólo la credencial interna (header).
// Lo observable: si la ruta le pide la organización a la sesión o no.
// ══════════════════════════════════════════════════════════════════════════

const m = vi.hoisted(() => {
  process.env.ADMIN_API_KEY = "clave-publica-sintetica";
  process.env.DATABASE_URL = "postgres://sintetico:sintetico@localhost:5432/x";
  return { pidioSesion: 0, orgsActivas: [] as any[], freshness: [] as any[], sessionOrg: null as string | null, unexpectedAuthFailure: false };
});

vi.mock("@/lib/auth-guard", () => {
  class NoOrganizationError extends Error {}
  return {
    NoOrganizationError,
    getOrganizationId: async () => {
      m.pidioSesion++;
      if (m.sessionOrg !== null) return m.sessionOrg;
      if (m.unexpectedAuthFailure) throw new Error("Synthetic database failure");
      throw new NoOrganizationError("Unauthorized");
    },
  };
});
vi.mock("@/lib/api-cache-shared", () => ({
  getSharedCachedSWR: async () => null,
  purgeExpiredSharedCache: async () => 0,
  setSharedCache: async () => {},
}));
vi.mock("@/lib/pipeline/freshness", () => ({ checkPipelineFreshness: async () => m.freshness, formatStaleSummary: () => "", PIPELINE_FRESHNESS_TARGETS: [] }));
vi.mock("@/lib/creator-password-cleanup", () => ({ purgeCreatorPasswordAttempts: async () => 0 }));
vi.mock("@/lib/cron/latido", () => ({ registrarLatido: async () => {} }));
vi.mock("@/lib/email/send", () => ({ sendEmail: async () => {} }));
vi.mock("@vercel/functions", () => ({ waitUntil: () => {} }));
vi.mock("@/lib/db/client", () => {
  const vacio = async () => m.orgsActivas;
  const modelo = new Proxy({}, { get: () => async () => null });
  return { prisma: new Proxy({}, { get: (_t, k) => (String(k).startsWith("$") ? vacio : modelo) }) };
});

import { credencialInterna, HEADER_CREDENCIAL_INTERNA } from "@/lib/credencial-interna";
import * as orders from "@/app/api/metrics/orders/route";
import * as products from "@/app/api/metrics/products/route";
import * as rateSummary from "@/app/api/metrics/pixel/rate-summary/route";
import * as assetStats from "@/app/api/nitropixel/asset-stats/route";
import * as warmCache from "@/app/api/cron/warm-cache/route";

const VICTIMA = "ckorgvictima000000000001";
const pedido = (camino: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://local${camino}?orgId=${VICTIMA}&key=clave-publica-sintetica&from=2026-09-01&to=2026-09-07`, { headers });

beforeEach(() => {
  m.pidioSesion = 0;
  m.orgsActivas = [];
  m.freshness = [];
  m.sessionOrg = null;
  m.unexpectedAuthFailure = false;
});

describe("credencial interna", () => {
  it("se deriva de DATABASE_URL, es distinta por propósito y sin base no hay", () => {
    const a = credencialInterna("warm-cache");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(credencialInterna("otro")).not.toBe(a);
    const antes = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(credencialInterna("warm-cache")).toBeNull();
    } finally {
      process.env.DATABASE_URL = antes;
    }
  });
});

describe("metrics/orders", () => {
  it("conserva 500 si falla la base al verificar la sesión", async () => {
    m.unexpectedAuthFailure = true;
    const res = await orders.GET(pedido("/api/metrics/orders"));
    expect(res.status).toBe(500);
  });
  it("rechaza un id de sesión que podría escapar del SQL antes de consultar datos", async () => {
    m.sessionOrg = "x' OR 1=1 --";
    const res = await orders.GET(pedido("/api/metrics/orders"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("organizationId invalido");
  });

  it("EL CASO: con la clave pública y ?orgId= de otro, igual le pide la org a la sesión", async () => {
    const res = await orders.GET(pedido("/api/metrics/orders"));
    expect(m.pidioSesion).toBe(1);
    expect(res.status).toBe(401);
  });

  it("ni siquiera la credencial interna abre otra organización (nadie la usa acá)", async () => {
    await orders.GET(pedido("/api/metrics/orders", { [HEADER_CREDENCIAL_INTERNA]: credencialInterna("warm-cache")! }));
    expect(m.pidioSesion).toBe(1);
  });
});

describe.each([
  ["metrics/products", products, "/api/metrics/products"],
  ["metrics/pixel/rate-summary", rateSummary, "/api/metrics/pixel/rate-summary"],
  ["nitropixel/asset-stats", assetStats, "/api/nitropixel/asset-stats"],
])("%s", (_n, ruta, camino) => {
  it("EL CASO: con la clave pública, le pide la org a la sesión", async () => {
    await ruta.GET(pedido(camino) as any);
    expect(m.pidioSesion).toBe(1);
  });

  it("una credencial inventada tampoco", async () => {
    await ruta.GET(pedido(camino, { [HEADER_CREDENCIAL_INTERNA]: "0".repeat(64) }) as any);
    expect(m.pidioSesion).toBe(1);
  });

  it("la credencial del warm-cache sí elige la org, sin pasar por la sesión", async () => {
    await ruta.GET(pedido(camino, { [HEADER_CREDENCIAL_INTERNA]: credencialInterna("warm-cache")! }) as any);
    expect(m.pidioSesion).toBe(0);
  });

  it("la credencial de otro propósito no sirve", async () => {
    await ruta.GET(pedido(camino, { [HEADER_CREDENCIAL_INTERNA]: credencialInterna("otro")! }) as any);
    expect(m.pidioSesion).toBe(1);
  });
});

describe("cron warm-cache", () => {
  it("manda la credencial interna (no la clave) a todo menos a metrics/pixel (CORE), y no lista las orgs", async () => {
    m.orgsActivas = [{ id: VICTIMA, name: "Cliente" }];
    m.freshness = [{ table: "fixture", refreshedBy: "fixture", hoursStale: 1, stale: false,
      missing: false, orgsStale: [{ org: VICTIMA, hours: 1 }], orgsSinNingunDato: [VICTIMA],
      error: `failed for ${VICTIMA}` }];
    const llamadas: Array<{ url: string; headers: Record<string, string> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      llamadas.push({ url, headers: init?.headers ?? {} });
      return new Response("{}", { status: 200 });
    }));
    try {
      const res = await warmCache.GET(new NextRequest("http://local/api/cron/warm-cache?key=clave-publica-sintetica"));
      expect(res.status).toBe(200);
      // La respuesta la recibe quien tenga la clave pública: sin ids ni nombres de orgs.
      const cuerpo = JSON.stringify(await res.json());
      expect(cuerpo).not.toContain(VICTIMA);
      expect(cuerpo).not.toContain("Cliente");
    } finally {
      vi.unstubAllGlobals();
    }
    const porRuta = new Map<string, typeof llamadas>();
    for (const l of llamadas) {
      const ruta = new URL(l.url).pathname;
      porRuta.set(ruta, [...(porRuta.get(ruta) ?? []), l]);
    }
    expect([...porRuta.keys()].sort()).toEqual([
      "/api/metrics/pixel", "/api/metrics/pixel/rate-summary", "/api/metrics/products", "/api/nitropixel/asset-stats",
    ]);
    for (const [ruta, ls] of porRuta) {
      for (const l of ls) {
        if (ruta === "/api/metrics/pixel") {
          expect(new URL(l.url).searchParams.has("key")).toBe(true);
        } else {
          expect(new URL(l.url).searchParams.has("key"), ruta).toBe(false);
          expect(l.headers[HEADER_CREDENCIAL_INTERNA], ruta).toBe(credencialInterna("warm-cache"));
        }
      }
    }
  });
});
