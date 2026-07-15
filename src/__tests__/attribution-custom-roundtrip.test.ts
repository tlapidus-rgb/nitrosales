// ══════════════════════════════════════════════════════════════
// Regresión: "Precisión" (CUSTOM) se persiste y vuelve en el GET.
// Reproduce el bug reportado por TVC: al elegir Precisión y guardar,
// la selección se perdía (se pisaba con NITRO) → la UI reabría en
// "Nitro" y escondía el editor de pesos ("no se guarda").
// Testea el route real con prisma + sesión mockeados (sin DB).
// ══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Store en memoria que simula Organization.settings (JSON) ──
const store: { settings: Record<string, any> } = { settings: {} };

vi.mock("@/lib/auth-guard", () => ({
  getOrganizationId: vi.fn(async () => "org_test"),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(async () => ({ settings: store.settings })),
      update: vi.fn(async ({ data }: any) => {
        store.settings = data.settings;
        return { id: "org_test", settings: store.settings };
      }),
    },
  },
}));

import { GET, PUT } from "@/app/api/settings/attribution/route";

function putReq(body: any) {
  return { json: async () => body } as any;
}

beforeEach(() => {
  store.settings = {};
});

describe("attribution settings — CUSTOM/Precisión round-trip", () => {
  it("persiste attributionModel=CUSTOM junto con los pesos", async () => {
    const res = await PUT(
      putReq({
        attributionModel: "CUSTOM",
        first: 50,
        last: 30,
        middle: 20,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.attributionModel).toBe("CUSTOM");
    expect(json.weights).toEqual({ first: 50, last: 30, middle: 20 });
    // Persistido crudo en settings (no pisado con NITRO)
    expect(store.settings.attributionModel).toBe("CUSTOM");
    expect(store.settings.nitroWeights).toEqual({ first: 50, last: 30, middle: 20 });
  });

  it("el GET devuelve CUSTOM (la selección vuelve, el editor reabre)", async () => {
    await PUT(putReq({ attributionModel: "CUSTOM", first: 50, last: 30, middle: 20 }));
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.attributionModel).toBe("CUSTOM");
    expect(json.weights).toEqual({ first: 50, last: 30, middle: 20 });
  });

  it("regresión: los modelos estándar siguen funcionando", async () => {
    for (const m of ["LAST_CLICK", "FIRST_CLICK", "LINEAR", "NITRO"]) {
      const res = await PUT(putReq({ attributionModel: m }));
      expect(res.status).toBe(200);
      const g = await GET();
      expect((await g.json()).attributionModel).toBe(m);
    }
  });

  it("regresión: modelo inválido sigue rechazado con 400", async () => {
    const res = await PUT(putReq({ attributionModel: "BOGUS" }));
    expect(res.status).toBe(400);
  });

  it("regresión: pesos que no suman 100 se rechazan con 400", async () => {
    const res = await PUT(
      putReq({ attributionModel: "CUSTOM", first: 50, last: 30, middle: 30 })
    );
    expect(res.status).toBe(400);
  });
});
