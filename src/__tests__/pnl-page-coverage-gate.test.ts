import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ══════════════════════════════════════════════════════════════════════════
// /finanzas/estado le tiene que pasar al gate la cobertura REAL del P&L
// ══════════════════════════════════════════════════════════════════════════
// `PnlCoverageGate` es lo que impide mostrar márgenes, gráficos y exportación
// cuando casi ningún producto tiene costo cargado (un "margen 100%" inventado).
// Sus tests (`pnl-coverage-view.test.ts`) prueban el COMPONENTE. Pero la página
// es `@ts-nocheck` y nada verificaba el CABLEADO: que el P&L esté envuelto por el
// gate y que el gate reciba el summary que vino de `/api/metrics/pnl`. Pasarle
// `cogsCoverage: 100`, o sacar el wrapper, dejaba toda la suite verde.
//
// CÓMO SE RENDERIZA SIN DOM: no hay jsdom en el repo y el render de servidor no
// corre efectos, así que la página se quedaría en "Calculando P&L...". Para no
// inventar el estado a mano, se simulan `useState`/`useEffect` de la página: el
// primer render junta los efectos, se corren (la página hace su propio fetch y
// llama a sus propios setters) y el segundo render usa esos valores. O sea, el
// summary que llega al gate es el que la PÁGINA guardó con `setSummary`, no uno
// puesto por el test.
//
// El gate está mockeado: registra sus props y NO renderiza sus hijos. Así se
// puede afirmar qué recibió y que el contenido del P&L vive adentro suyo (si
// alguien lo saca afuera, aparece en el HTML sin pasar por el gate).
// ══════════════════════════════════════════════════════════════════════════

const sim = vi.hoisted(() => ({
  valores: new Map<number, unknown>(),
  indice: 0,
  efectos: [] as Array<() => void>,
  gate: [] as Array<Record<string, any>>,
  // Componente mock que sólo deja una marca en el HTML. `React` se resuelve
  // recién al renderizar, cuando el import ya está inicializado.
  marcador: (texto: string) => () => React.createElement("i", null, texto),
}));

vi.mock("react", async importOriginal => {
  const real = await importOriginal<typeof import("react")>();
  // Estado por orden de llamada, como React: el orden de hooks es estable
  // entre renders del mismo componente.
  function useState(inicial: unknown) {
    const i = sim.indice++;
    const valor = sim.valores.has(i) ? sim.valores.get(i) : typeof inicial === "function" ? (inicial as () => unknown)() : inicial;
    const set = (v: unknown) => {
      const previo = sim.valores.has(i) ? sim.valores.get(i) : valor;
      sim.valores.set(i, typeof v === "function" ? (v as (p: unknown) => unknown)(previo) : v);
    };
    return [valor, set];
  }
  function useEffect(efecto: () => void) { sim.efectos.push(efecto); }
  return { ...real, default: { ...real, useState, useEffect }, useState, useEffect };
});

vi.mock("@/components/finanzas/PnlCoverageGate", () => ({
  default: (props: Record<string, any>) => { sim.gate.push(props); return React.createElement("i", null, "GATE"); },
}));
vi.mock("@/components/finanzas/BridgeStrip", () => ({ default: sim.marcador("BRIDGE-STRIP") }));
vi.mock("@/components/finanzas/WaterfallHero", () => ({ default: sim.marcador("WATERFALL") }));
vi.mock("@/components/finanzas/WaterfallDrillPanel", () => ({ default: sim.marcador("DRILL") }));
vi.mock("@/components/finanzas/ExportMenu", () => ({ default: sim.marcador("EXPORT") }));
vi.mock("@/components/finanzas/CurrencyToggle", () => ({ CurrencyToggle: sim.marcador("CURRENCY") }));
vi.mock("@/components/dashboard", () => ({ DateRangeFilter: sim.marcador("FECHAS") }));
vi.mock("@/lib/finanzas/export", () => ({ exportPnLToExcel: vi.fn() }));
vi.mock("@/hooks/useCurrencyView", () => ({ useCurrencyView: () => ({
  convert: (n: number) => n, format: (n: number) => `ARS ${n}`, mode: "ARS",
}) }));
vi.mock("recharts", () => Object.fromEntries(
  ["AreaChart", "Area", "XAxis", "YAxis", "CartesianGrid", "Tooltip", "ResponsiveContainer", "Legend"]
    .map(nombre => [nombre, sim.marcador("CHART")]),
));

import FinanzasPage from "@/app/(app)/finanzas/estado/page";

/** Cobertura baja a propósito: es el caso en que el gate tiene que cortar. */
const DATOS = {
  summary: {
    revenue: 12345, orders: 17, units: 34, aov: 726, cogs: 100, cogsCoverage: 7,
    grossProfit: 999999, grossMargin: 100, adSpend: 321, metaSpend: 300, googleSpend: 21,
    shipping: 55, operatingProfit: 888888, operatingMargin: 99,
  },
  changes: null,
  dailyTrend: [],
  bySource: [{ source: "VTEX", revenue: 12345, orders: 17, units: 34 }],
  categories: [{ category: "Hogar", revenue: 7000, units: 20, grossMargin: 100 }],
  brands: [{ brand: "Marca", revenue: 5000, units: 14, grossMargin: 100 }],
  manualCosts: [],
  paymentFees: [],
};

function render() {
  sim.indice = 0;
  return renderToStaticMarkup(React.createElement(FinanzasPage));
}

/** Tipos de elemento que aparecen en un subárbol de React (sin renderizarlo). */
function tiposEn(nodo: unknown, acc: unknown[] = []): unknown[] {
  if (Array.isArray(nodo)) nodo.forEach(n => tiposEn(n, acc));
  else if (React.isValidElement(nodo)) {
    acc.push(nodo.type);
    tiposEn((nodo.props as { children?: unknown }).children, acc);
  }
  return acc;
}

beforeEach(() => {
  sim.valores.clear(); sim.efectos.length = 0; sim.gate.length = 0;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(DATOS))));
  // `<style jsx global>` sin el plugin de styled-jsx: React avisa por el atributo.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("FinanzasPage → PnlCoverageGate", () => {
  it("envuelve el P&L con el gate y le pasa la cobertura que vino de la API", async () => {
    expect(render()).toContain("Calculando P&amp;L");
    sim.efectos.splice(0).forEach(e => e());
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/metrics/pnl?"));

    let html = "";
    await vi.waitFor(() => {
      html = render();
      // Precondición: la página salió de "cargando" y tiene summary. Si esto
      // falla, el problema es el arnés, no el gate.
      expect(html).toContain("Estado de Resultados");
    });

    expect(sim.gate).toHaveLength(1);
    const props = sim.gate[0];
    expect(props.summary).toEqual(DATOS.summary);
    expect(props.summary.cogsCoverage).toBe(7);
    expect(props.bySource).toEqual(DATOS.bySource);
    expect(props.categories).toEqual(DATOS.categories);
    expect(props.brands).toEqual(DATOS.brands);

    // El contenido del P&L es HIJO del gate…
    const hijos = tiposEn(props.children).map(t => typeof t === "function" ? t.name : t);
    expect(hijos).toEqual(expect.arrayContaining(["ExecutiveView"]));
    // …y nada de él se renderiza por fuera: ni el puente CAC/LTV ni los números
    // de rentabilidad que el gate tiene que ocultar con cobertura baja.
    expect(html).toContain("GATE");
    expect(html).not.toContain("BRIDGE-STRIP");
    expect(html).not.toContain("999999");
    expect(html).not.toContain("888888");
  });
});
