import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ══════════════════════════════════════════════════════════════════════════
// Un rango SIN VENTAS no es un rango con costos faltantes
// ══════════════════════════════════════════════════════════════════════════
// `/api/metrics/pnl` calcula la cobertura de costos como ítems con costo /
// ítems vendidos, y con 0 ítems devolvía 0 %. `PnlCoverageGate` lee 0 % como
// "no cargaste ningún costo" y escondía el P&L con "falta cargar los precios de
// costo". Resultado: un cliente con el 100 % de los costos cargados que miraba
// "hoy" antes de la primera venta veía un aviso falso.
//
// Lo que se prueba es la COSTURA entera, no cada pieza por separado: el JSON
// que sale del GET real de la API (con la base mockeada) es el que se le pasa
// al gate, y el que la página recibe de su propio `fetch`. Así, si la API deja
// de mandar `sinVentas` o el gate/la página dejan de leerlo, esto se pone rojo.
//
// Y la otra mitad, la que no se puede romper arreglando esto: con ventas y
// cobertura baja el aviso tiene que seguir apareciendo (E-25), y con órdenes
// pero sin ítems sincronizados también — ahí el COGS = 0 es desconocido, no
// cero, y dejarlo pasar devolvería el "margen 100 %".
//
// El arnés de la página (hooks simulados, render sin DOM) es el mismo de
// `pnl-page-coverage-gate.test.ts`; la diferencia es que acá el gate es el
// REAL, porque lo que se afirma es qué ve el cliente.
// ══════════════════════════════════════════════════════════════════════════

const sim = vi.hoisted(() => ({
  valores: new Map<number, unknown>(),
  iniciales: new Map<number, unknown>(),
  indice: 0,
  efectos: [] as Array<() => void>,
  /** Filas que devuelve la base mockeada, por query. */
  filas: { revenue: {} as Record<string, string>, cogs: {} as Record<string, string> },
  marcador: (texto: string) => () => React.createElement("i", null, texto),
}));

vi.mock("react", async importOriginal => {
  const real = await importOriginal<typeof import("react")>();
  function useState(inicial: unknown) {
    const i = sim.indice++;
    const valorInicial = typeof inicial === "function" ? (inicial as () => unknown)() : inicial;
    if (!sim.iniciales.has(i)) sim.iniciales.set(i, valorInicial);
    const valor = sim.valores.has(i) ? sim.valores.get(i) : valorInicial;
    const set = (v: unknown) => {
      const previo = sim.valores.has(i) ? sim.valores.get(i) : valor;
      sim.valores.set(i, typeof v === "function" ? (v as (p: unknown) => unknown)(previo) : v);
    };
    return [valor, set];
  }
  function useEffect(efecto: () => void) { sim.efectos.push(efecto); }
  return { ...real, default: { ...real, useState, useEffect }, useState, useEffect };
});

// ── La base: cada query devuelve lo que le corresponde por su SQL ─────────
// Las agregadas (sin GROUP BY) devuelven una fila; un campo que el escenario no
// fija vale "0". Las agrupadas y los gastos manuales vienen vacías: un rango
// sin ventas no tiene filas por día, canal ni categoría.
vi.mock("@/lib/db/client", () => {
  const fila = (fijos: Record<string, string>) =>
    new Proxy(fijos, { get: (t, campo) => (typeof campo === "string" && campo in t ? t[campo] : "0") });
  return { prisma: {
    organization: { findUnique: async () => ({ settings: {} }) },
    $queryRaw: async (partes: TemplateStringsArray) => {
      const sql = partes.join("?");
      if (sql.includes("manual_costs") || sql.includes("GROUP BY")) return [];
      if (sql.includes("items_total")) return [fila(sim.filas.cogs)];
      if (sql.includes("COUNT(DISTINCT o.id)") && sql.includes("LEFT JOIN order_items")) return [fila(sim.filas.revenue)];
      return [fila({})];
    },
  } };
});
vi.mock("@/lib/auth-guard", () => ({ getOrganizationId: async () => "org-test" }));

vi.mock("@/hooks/useCurrencyView", () => ({ useCurrencyView: () => ({
  convert: (n: number) => n, format: (n: number) => `ARS ${n}`, mode: "ARS",
}) }));
vi.mock("@/components/finanzas/BridgeStrip", () => ({ default: sim.marcador("BRIDGE-STRIP") }));
vi.mock("@/components/finanzas/WaterfallHero", () => ({ default: sim.marcador("WATERFALL") }));
vi.mock("@/components/finanzas/WaterfallDrillPanel", () => ({ default: sim.marcador("DRILL") }));
vi.mock("@/components/finanzas/ExportMenu", () => ({ default: sim.marcador("EXPORT") }));
vi.mock("@/components/finanzas/CurrencyToggle", () => ({ CurrencyToggle: sim.marcador("CURRENCY") }));
vi.mock("@/components/dashboard", () => ({ DateRangeFilter: sim.marcador("FECHAS") }));
vi.mock("@/lib/finanzas/export", () => ({ exportPnLToExcel: vi.fn() }));
vi.mock("recharts", () => Object.fromEntries(
  ["AreaChart", "Area", "XAxis", "YAxis", "CartesianGrid", "Tooltip", "ResponsiveContainer", "Legend"]
    .map(nombre => [nombre, sim.marcador("CHART")]),
));

import { GET } from "@/app/api/metrics/pnl/route";
import PnlCoverageGate from "@/components/finanzas/PnlCoverageGate";
import FinanzasPage from "@/app/(app)/finanzas/estado/page";

/** Lo que dice el gate cuando bloquea por costos faltantes. */
const AVISO_GATE = "Faltan datos para calcular el resultado";
const AVISO_COSTOS = "falta cargar los precios de costo";

const ESCENARIOS = {
  // "Hoy" antes de la primera venta: ni órdenes ni ítems.
  sinVentas: { revenue: {}, cogs: {} },
  // Ventas reales con 1 de 10 ítems costeados: 10 % → tiene que bloquear.
  conVentasCoberturaBaja: {
    revenue: { revenue: "12345", orders: "17", units: "34" },
    cogs: { cogs: "100", items_with_cost: "1", items_total: "10" },
  },
  // Órdenes facturadas cuyos ítems no se sincronizaron: el COGS es
  // desconocido, no cero. Tiene que bloquear igual que antes.
  ordenesSinItems: {
    revenue: { revenue: "12345", orders: "17", units: "0" },
    cogs: {},
  },
};

async function respuestaDeLaApi(escenario: keyof typeof ESCENARIOS) {
  sim.filas = ESCENARIOS[escenario];
  const res = await GET(new NextRequest("https://test.invalid/api/metrics/pnl?dateFrom=2026-10-01&dateTo=2026-10-01"));
  expect(res.status).toBe(200);
  return res.json();
}

function renderGate(datos: any) {
  return renderToStaticMarkup(React.createElement(PnlCoverageGate, {
    summary: datos.summary, bySource: datos.bySource, categories: datos.categories,
    brands: datos.brands, manualCosts: datos.manualCosts, midDate: "2026-10-01",
    children: React.createElement("section", null, "P&L COMPLETO"),
  }));
}

function renderPagina() {
  sim.indice = 0;
  return renderToStaticMarkup(React.createElement(FinanzasPage));
}

/** Carga la página con la respuesta de la API, en la vista pedida. */
async function paginaCon(datos: unknown, vista: "executive" | "detailed") {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(datos))));
  renderPagina();
  sim.efectos.splice(0).forEach(e => e());
  let html = "";
  await vi.waitFor(() => {
    html = renderPagina();
    // Precondición del arnés: salió de "cargando" con summary.
    expect(html).toContain("Estado de Resultados");
  });
  if (vista === "detailed") {
    // La vista se elige con un botón; sin DOM se cambia el estado que ese
    // botón cambiaría. Se ubica por su valor inicial, no por un índice fijo.
    const i = [...sim.iniciales.entries()].find(([, v]) => v === "executive")?.[0];
    expect(i).toBeDefined();
    sim.valores.set(i!, "detailed");
    html = renderPagina();
  }
  return html;
}

beforeEach(() => {
  sim.valores.clear(); sim.iniciales.clear(); sim.efectos.length = 0;
  // `<style jsx global>` sin el plugin de styled-jsx: React avisa por el atributo.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("/api/metrics/pnl → PnlCoverageGate", () => {
  it("rango sin ventas: no hay costos faltantes, el P&L se muestra", async () => {
    const datos = await respuestaDeLaApi("sinVentas");
    expect(datos.summary).toMatchObject({ orders: 0, sinVentas: true });
    const html = renderGate(datos);
    expect(html).toBe("<section>P&amp;L COMPLETO</section>");
    expect(html).not.toContain(AVISO_GATE);
    expect(html).not.toContain(AVISO_COSTOS);
  });

  it("rango con ventas y cobertura baja: el aviso de costos faltantes sigue", async () => {
    const datos = await respuestaDeLaApi("conVentasCoberturaBaja");
    expect(datos.summary).toMatchObject({ orders: 17, cogsCoverage: 10, sinVentas: false });
    const html = renderGate(datos);
    expect(html).toContain(AVISO_GATE);
    expect(html).toContain(AVISO_COSTOS);
    expect(html).not.toContain("P&amp;L COMPLETO");
  });

  it("órdenes facturadas sin ítems: NO cuenta como 'sin ventas', sigue bloqueado", async () => {
    const datos = await respuestaDeLaApi("ordenesSinItems");
    expect(datos.summary).toMatchObject({ orders: 17, cogsCoverage: 0, sinVentas: false });
    const html = renderGate(datos);
    expect(html).toContain(AVISO_GATE);
    expect(html).not.toContain("P&amp;L COMPLETO");
  });
});

describe("/finanzas/estado con la respuesta real de la API", () => {
  // Pasar el gate no alcanza: adentro del P&L hay otros dos lugares que leían
  // la cobertura sola — el cartel "Cobertura de costos: 0%" de cada vista y el
  // semáforo "Sin datos de costo". Son el mismo aviso falso con otra letra.
  it.each(["executive", "detailed"] as const)("sin ventas, vista %s: ningún aviso de costos faltantes", async vista => {
    const html = await paginaCon(await respuestaDeLaApi("sinVentas"), vista);
    expect(html).not.toContain(AVISO_GATE);
    expect(html).not.toContain(AVISO_COSTOS);
    expect(html).not.toContain("Cobertura de costos");
    expect(html).not.toContain("Sin datos de costo");
    // El P&L se renderizó de verdad (no quedó escondido ni vacío).
    expect(html).toContain(vista === "executive" ? "Sin ventas en el período" : "WATERFALL");
  });

  it("con ventas y cobertura baja: la página sigue mostrando el aviso", async () => {
    const html = await paginaCon(await respuestaDeLaApi("conVentasCoberturaBaja"), "executive");
    expect(html).toContain(AVISO_GATE);
    expect(html).toContain(AVISO_COSTOS);
    expect(html).not.toContain("BRIDGE-STRIP");
  });
});
