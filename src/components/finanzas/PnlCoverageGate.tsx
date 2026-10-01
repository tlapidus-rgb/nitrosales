"use client";

import React, { type ReactNode } from "react";
import { confianzaDelPnl, avisoDeCobertura } from "@/lib/finanzas/confianza-del-margen";
import { useCurrencyView } from "@/hooks/useCurrencyView";

type KnownSummary = {
  cogsCoverage: number; sinVentas?: boolean; revenue: number; orders: number; units: number; aov: number;
  cogs: number; adSpend: number; shipping: number;
  platformFees?: number; paymentFees?: number; manualCostsTotal?: number;
};
type SalesGroup = { revenue: number; orders?: number; units?: number };
type Props = {
  summary: KnownSummary;
  bySource: Array<SalesGroup & { source: string }>;
  categories: Array<SalesGroup & { category: string }>;
  brands: Array<SalesGroup & { brand: string }>;
  manualCosts: Array<{ category: string; total: number }>;
  midDate: string;
  children: ReactNode;
};

/**
 * One boundary for cards, charts, drills and exports in both P&L views.
 *
 * Decide con `confianzaDelPnl` y no con la cobertura sola: un rango sin ventas
 * da cobertura 0 y NO es falta de costos (no hay nada que costear). Antes este
 * gate le mostraba "falta cargar los precios de costo" a quien los tenía todos.
 */
export default function PnlCoverageGate(props: Props) {
  if (confianzaDelPnl(props.summary) !== "sin-datos") return <>{props.children}</>;
  return <KnownPnlData {...props} />;
}

function KnownPnlData({ summary, bySource, categories, brands, manualCosts, midDate }: Props) {
  const { convert, format } = useCurrencyView();
  const money = (value: number | undefined | null) =>
    typeof value === "number" && Number.isFinite(value) ? format(convert(value, midDate)) : "—";
  const count = (value: number | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("es-AR") : "—";
  const knownCoverage = Number.isFinite(summary.cogsCoverage);
  const costs = [
    ["Mercadería con costo registrado (parcial)", knownCoverage && summary.cogsCoverage > 0 ? summary.cogs : null],
    ["Publicidad", summary.adSpend], ["Envíos", summary.shipping],
    ["Comisiones de plataforma", summary.platformFees], ["Medios de pago", summary.paymentFees],
    ["Otros gastos registrados", summary.manualCostsTotal],
  ] as const;
  const groups = [
    { title: "Ventas por canal", rows: bySource.map(s => ({ ...s, label: s.source === "MELI" ? "MercadoLibre" : s.source })) },
    { title: "Ventas por categoría", rows: categories.map(s => ({ ...s, label: s.category })) },
    { title: "Ventas por marca", rows: brands.map(s => ({ ...s, label: s.brand })) },
  ];
  return <div className="space-y-6">
    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
      <h3 className="text-sm font-semibold">Faltan datos para calcular el resultado</h3>
      <p className="mt-1 text-sm">{avisoDeCobertura(summary.cogsCoverage)}</p>
      <p className="mt-2 text-xs">Cobertura de costos: {knownCoverage ? `${summary.cogsCoverage}%` : "sin verificar"}.
        El P&amp;L, sus comparaciones, gráficos de rentabilidad y exportación quedan pendientes.</p>
      <a href="/products" className="mt-2 inline-block text-sm underline">Completar costos de productos</a>
    </div>
    <section aria-label="Ventas registradas" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {[["Facturación", money(summary.revenue)], ["Órdenes", count(summary.orders)],
        ["Unidades", count(summary.units)], ["Ticket promedio", money(summary.aov)]].map(([label, value]) =>
        <div key={label} className="rounded-xl border border-hairline bg-elevated p-4">
          <p className="text-xs text-ink-40">{label}</p><p className="mt-1 text-lg font-bold text-ink">{value}</p>
        </div>)}
    </section>
    <section className="rounded-xl border border-hairline bg-elevated p-4">
      <h3 className="text-sm font-semibold text-ink">Gastos registrados</h3>
      <p className="mt-1 text-xs text-ink-40">Estos importes no representan el costo total de las ventas: falta completar mercadería.</p>
      <dl className="mt-3 space-y-2">{costs.map(([label, value]) =>
        <div key={label} className="flex justify-between gap-4 text-sm"><dt>{label}</dt><dd>{money(value)}</dd></div>)}
      </dl>
      {manualCosts.length > 0 && <details className="mt-3 text-sm"><summary>Detalle de gastos manuales</summary>
        <dl className="mt-2 space-y-2">{manualCosts.map(c => <div key={c.category} className="flex justify-between gap-4">
          <dt>{c.category}</dt><dd>{money(c.total)}</dd></div>)}</dl>
      </details>}
      <a href="/finanzas/costos" className="mt-3 inline-block text-sm underline">Revisar gastos</a>
    </section>
    {groups.filter(g => g.rows.length > 0).map(group => <section key={group.title}
      className="rounded-xl border border-hairline bg-elevated p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">{group.title}</h3>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-sm"><thead><tr><th>Detalle</th><th>Facturación</th><th>Unidades</th><th>Órdenes</th></tr></thead>
        <tbody>{group.rows.map((row, i) => <tr key={`${row.label}-${i}`}>
          <td className="py-2">{row.label}</td><td>{money(row.revenue)}</td><td>{count(row.units)}</td><td>{count(row.orders)}</td>
        </tr>)}</tbody>
      </table>
      </div>
    </section>)}
  </div>;
}
