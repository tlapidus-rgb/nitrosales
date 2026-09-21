import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/hooks/useCurrencyView", () => ({ useCurrencyView: () => ({
  convert: (n: number) => n, format: (n: number) => `ARS ${n}`,
}) }));
import PnlCoverageGate from "@/components/finanzas/PnlCoverageGate";

const props = {
  summary: { cogsCoverage: 0, revenue: 12345, orders: 17, units: 34, aov: 726,
    cogs: 0, adSpend: 321, shipping: 55, platformFees: 30, paymentFees: 20, manualCostsTotal: 444,
    grossProfit: 999999, grossMargin: 100, operatingProfit: 888888, operatingMargin: 99 },
  bySource: [{ source: "VTEX", revenue: 12345, orders: 17, units: 34, operatingMargin: 100 }],
  categories: [{ category: "Hogar", revenue: 7000, units: 20, grossMargin: 100 }],
  brands: [{ brand: "Marca", revenue: 5000, units: 14, grossMargin: 100 }],
  manualCosts: [{ category: "EQUIPO", total: 444 }], midDate: "2026-09-15",
};

describe("P&L sin costos suficientes", () => {
  it.each([0, 19.99, NaN, undefined])("no monta resultados ni exportaciones con cobertura %s", coverage => {
    function ResultsWithUnreliableProfit(): never { throw new Error("Profit/chart/export subtree must not mount"); }
    const html = renderToStaticMarkup(React.createElement(PnlCoverageGate, {
      ...props, summary: { ...props.summary, cogsCoverage: coverage as number },
      children: React.createElement(ResultsWithUnreliableProfit),
    }));
    expect(html).toContain("Faltan datos para calcular el resultado");
    expect(html).not.toContain("999999");
    expect(html).not.toContain("888888");
    expect(html).not.toContain("100%");
    expect(html).not.toContain("bg-green");
    expect(html).not.toContain("Excelente");
    // Revenue and independently known expenses remain usable.
    for (const value of ["ARS 12345", "ARS 321", "ARS 55", "ARS 444", "VTEX", "Hogar", "Marca"]) {
      expect(html).toContain(value);
    }
    expect(html).toContain('href="/products"');
    expect(html).toContain('href="/finanzas/costos"');
  });

  it("distingue costos desconocidos de cero sin inventar un costo total", () => {
    const html = renderToStaticMarkup(React.createElement(PnlCoverageGate, { ...props, children: null }));
    expect(html).toContain("Mercadería con costo registrado (parcial)</dt><dd>—");
    expect(html).not.toContain("Costos Totales");
    expect(html).toContain("no representan el costo total");
  });

  it("muestra costos registrados parciales sin presentarlos como completos", () => {
    const html = renderToStaticMarkup(React.createElement(PnlCoverageGate, {
      ...props, summary: { ...props.summary, cogsCoverage: 10, cogs: 456 }, children: null,
    }));
    expect(html).toContain("Mercadería con costo registrado (parcial)</dt><dd>ARS 456");
  });

  it.each([20, 49.99, 50, 100])("preserva las vistas existentes a partir del umbral: %s", coverage => {
    const html = renderToStaticMarkup(React.createElement(PnlCoverageGate, {
      ...props, summary: { ...props.summary, cogsCoverage: coverage },
      children: React.createElement("section", null, "Vista completa con sus avisos de cobertura"),
    }));
    expect(html).toBe("<section>Vista completa con sus avisos de cobertura</section>");
  });
});
