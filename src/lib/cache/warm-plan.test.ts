import { describe, it, expect } from "vitest";
import { planDeWarm, rotar, offsetDeRotacion, PASO_DE_ROTACION_MS } from "./warm-plan";
import type { OrgAWarmear, RangoAWarmear } from "./warm-plan";

// ══════════════════════════════════════════════════════════════════════════
// E-12 — con 4 clientes, dos no se calentaban NUNCA
// ══════════════════════════════════════════════════════════════════════════
// El cron recorría organización → rango → endpoint: 8 fetches por organización
// (4 rangos × 2 endpoints) con presupuesto para ~11 en total. La primera se
// llevaba sus 8, la segunda alcanzaba 3, y la tercera y la cuarta quedaban
// afuera — siempre las mismas, porque la query no tenía ORDER BY y el orden de
// Postgres es estable en la práctica. Con 20 clientes se calentaría el 7%.
// ══════════════════════════════════════════════════════════════════════════

const orgs = (...ids: string[]): OrgAWarmear[] =>
  ids.map((id) => ({ id, name: id.toUpperCase(), attribution_model: "NITRO" }));

const RANGOS: RangoAWarmear[] = [
  { label: "today", from: "2026-09-06", to: "2026-09-06" },
  { label: "yesterday", from: "2026-09-05", to: "2026-09-05" },
  { label: "7d", from: "2026-08-30", to: "2026-09-06" },
  { label: "30d", from: "2026-08-07", to: "2026-09-06" },
];
const ENDPOINTS = ["/api/metrics/pixel", "/api/metrics/products"];

/** Lo que entra antes de que el presupuesto corte (~11 fetches). */
const PRESUPUESTO = 11;

describe("rotar", () => {
  it("mueve el arranque sin perder ni duplicar elementos", () => {
    expect(rotar(["a", "b", "c", "d"], 0)).toEqual(["a", "b", "c", "d"]);
    expect(rotar(["a", "b", "c", "d"], 2)).toEqual(["c", "d", "a", "b"]);
    expect(rotar(["a", "b", "c", "d"], 4)).toEqual(["a", "b", "c", "d"]);
    expect(rotar(["a", "b", "c", "d"], 5)).toEqual(["b", "c", "d", "a"]);
  });

  it("aguanta lista vacía y offsets negativos", () => {
    expect(rotar([], 3)).toEqual([]);
    expect(rotar(["a", "b", "c"], -1)).toEqual(["c", "a", "b"]);
  });

  it("no muta la lista original", () => {
    const xs = ["a", "b", "c"];
    rotar(xs, 1);
    expect(xs).toEqual(["a", "b", "c"]);
  });
});

describe("offsetDeRotacion", () => {
  it("avanza una posición por corrida del cron", () => {
    const t = 1_757_000_000_000;
    const a = offsetDeRotacion(t, 4);
    const b = offsetDeRotacion(t + PASO_DE_ROTACION_MS, 4);
    expect(b).toBe((a + 1) % 4);
  });

  it("da la vuelta completa y vuelve al principio", () => {
    const t = 1_757_000_000_000;
    const vistos = new Set<number>();
    for (let i = 0; i < 4; i++) vistos.add(offsetDeRotacion(t + i * PASO_DE_ROTACION_MS, 4));
    expect(vistos.size).toBe(4);
  });

  it("sin organizaciones no explota", () => {
    expect(offsetDeRotacion(Date.now(), 0)).toBe(0);
  });
});

describe("planDeWarm — el rango manda sobre la organización", () => {
  const plan = (ahoraMs = 0) =>
    planDeWarm({ orgs: orgs("o1", "o2", "o3", "o4"), ranges: RANGOS, endpoints: ENDPOINTS, ahoraMs });

  it("EL BUG: con el presupuesto real, TODAS las orgs entran", () => {
    const truncado = plan().slice(0, PRESUPUESTO);
    const alcanzadas = new Set(truncado.map((t) => t.org.id));
    // Antes acá había 2 organizaciones. Ahora están las 4.
    expect(alcanzadas).toEqual(new Set(["o1", "o2", "o3", "o4"]));
  });

  it("y todas se llevan el rango más mirado", () => {
    const truncado = plan().slice(0, PRESUPUESTO);
    for (const id of ["o1", "o2", "o3", "o4"]) {
      const suyos = truncado.filter((t) => t.org.id === id);
      expect(suyos.some((t) => t.range.label === "today")).toBe(true);
    }
  });

  it("el orden de los rangos se respeta: primero hoy para todas", () => {
    const p = plan();
    const primerNoHoy = p.findIndex((t) => t.range.label !== "today");
    // 4 orgs x 2 endpoints = 8 trabajos de "today" antes de pasar a "yesterday".
    expect(primerNoHoy).toBe(8);
    expect(p[primerNoHoy].range.label).toBe("yesterday");
  });

  it("cubre exactamente org x rango x endpoint, sin repetir", () => {
    const p = plan();
    expect(p.length).toBe(4 * RANGOS.length * ENDPOINTS.length);
    const claves = new Set(p.map((t) => `${t.org.id}|${t.range.label}|${t.endpoint}`));
    expect(claves.size).toBe(p.length);
  });
});

describe("planDeWarm — la rotación reparte lo que igual queda truncado", () => {
  it("el que arranca la vuelta cambia entre corridas", () => {
    const t = 1_757_000_000_000;
    const primeros = [0, 1, 2, 3].map(
      (i) =>
        planDeWarm({
          orgs: orgs("o1", "o2", "o3", "o4"),
          ranges: RANGOS,
          endpoints: ENDPOINTS,
          ahoraMs: t + i * PASO_DE_ROTACION_MS,
        })[0].org.id,
    );
    expect(new Set(primeros).size).toBe(4);
  });

  it("con MUCHAS orgs, el truncado se reparte a lo largo de las corridas", () => {
    // 20 clientes: el escenario que el plan pide cubrir. Ninguna corrida sola
    // alcanza para todos, pero a lo largo de las corridas nadie queda afuera
    // para siempre — que era el modo de falla real.
    const veinte = orgs(...Array.from({ length: 20 }, (_, i) => `o${i + 1}`));
    const t = 1_757_000_000_000;
    const alcanzadas = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const p = planDeWarm({
        orgs: veinte,
        ranges: RANGOS,
        endpoints: ENDPOINTS,
        ahoraMs: t + i * PASO_DE_ROTACION_MS,
      }).slice(0, PRESUPUESTO);
      for (const trabajo of p) alcanzadas.add(trabajo.org.id);
    }
    expect(alcanzadas.size).toBe(20);
  });

  it("una sola org no se rompe con la rotación", () => {
    const p = planDeWarm({ orgs: orgs("o1"), ranges: RANGOS, endpoints: ENDPOINTS, ahoraMs: 123456 });
    expect(p.length).toBe(RANGOS.length * ENDPOINTS.length);
    expect(p.every((t) => t.org.id === "o1")).toBe(true);
  });

  it("sin orgs devuelve un plan vacío", () => {
    expect(planDeWarm({ orgs: [], ranges: RANGOS, endpoints: ENDPOINTS, ahoraMs: 0 })).toEqual([]);
  });
});

describe("comparación con el recorrido viejo", () => {
  it("el viejo dejaba organizaciones enteras sin calentar", () => {
    // Reproduce el orden anterior (org -> rango -> endpoint) para mostrar que
    // el bug era real y no una interpretación del plan.
    const viejo: Array<{ orgId: string }> = [];
    for (const o of orgs("o1", "o2", "o3", "o4")) {
      for (const _r of RANGOS) for (const _e of ENDPOINTS) viejo.push({ orgId: o.id });
    }
    const alcanzadasViejo = new Set(viejo.slice(0, PRESUPUESTO).map((x) => x.orgId));
    expect(alcanzadasViejo).toEqual(new Set(["o1", "o2"]));
    expect(alcanzadasViejo.has("o3")).toBe(false);
    expect(alcanzadasViejo.has("o4")).toBe(false);
  });
});
