// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { formatARS, formatCompact, formatDateShort } from "@/lib/utils/format";
import { DateRangeFilter } from "@/components/dashboard";

/* ── Types ──────────────────────────────────── */
interface PnlSummary {
  revenue: number;
  orders: number;
  units: number;
  aov: number;
  cogs: number;
  cogsCoverage: number;
  grossProfit: number;
  grossMargin: number;
  adSpend: number;
  metaSpend: number;
  googleSpend: number;
  shipping: number;
  realShipping?: number;
  customerShipping?: number;
  hasRealShipping?: boolean;
  operatingProfit: number;
  operatingMargin: number;
  platformFees?: number;
  paymentFees?: number;
  discounts?: number;
  manualCostsTotal?: number;
  netOperatingProfit?: number;
  netOperatingMargin?: number;
  isRI?: boolean;
  ivaDebitoFiscal?: number;
  revenueNetoIVA?: number;
}
interface Changes {
  revenue: number | null;
  orders: number | null;
  grossProfit: number | null;
  adSpend: number | null;
  operatingProfit: number | null;
}
interface DailyTrend {
  date: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  adSpend: number;
  operatingProfit: number;
  orders: number;
}
interface CategoryMargin {
  category: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  units: number;
}
interface BrandMargin {
  brand: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  units: number;
}
interface SourceBreakdown {
  source: string;
  revenue: number;
  orders: number;
  units: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  shipping: number;
  platformFee: number;
  platformFeeLabel: string;
  mlCommission: number;
  mlTaxWithholdings: number;
  operatingProfit: number;
  operatingMargin: number;
  aov: number;
}
interface PaymentFeeDetail {
  method: string;
  source: string;
  revenue: number;
  feeRate: number;
  fee: number;
}

/* ── Helpers ────────────────────────────────── */
function ChangeIndicator({ value, inverse }: { value: number | null | undefined; inverse?: boolean }) {
  if (value === null || value === undefined) return null;
  const isPositive = inverse ? value < 0 : value > 0;
  const color = isPositive ? "text-green-600" : value === 0 ? "text-gray-400" : "text-red-500";
  const arrow = value > 0 ? "\u2191" : value < 0 ? "\u2193" : "";
  return <span className={`text-xs font-medium ${color}`}>{arrow}{Math.abs(value)}%</span>;
}

function MarginBar({ value, color }: { value: number; color: string }) {
  const width = Math.min(Math.max(value, 0), 100);
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}

/** Health status based on net margin */
function getHealthStatus(margin: number): { label: string; color: string; bgColor: string; dotColor: string } {
  if (margin >= 15) return { label: "Excelente", color: "text-green-700", bgColor: "bg-green-50 border-green-200", dotColor: "bg-green-500" };
  if (margin >= 10) return { label: "Saludable", color: "text-green-600", bgColor: "bg-green-50 border-green-200", dotColor: "bg-green-400" };
  if (margin >= 5) return { label: "Aceptable", color: "text-yellow-600", bgColor: "bg-yellow-50 border-yellow-200", dotColor: "bg-yellow-400" };
  if (margin >= 0) return { label: "Ajustado", color: "text-orange-600", bgColor: "bg-orange-50 border-orange-200", dotColor: "bg-orange-400" };
  return { label: "Negativo", color: "text-red-600", bgColor: "bg-red-50 border-red-200", dotColor: "bg-red-500" };
}

/* ── Cost categories ───────────────────────── */
const COST_CATEGORIES = [
  { key: "LOGISTICA", label: "Logistica y Envios", placeholder: "Ej: Andreani, OCA, packaging" },
  { key: "EQUIPO", label: "Equipo y RRHH", placeholder: "Ej: Sueldos, freelancers" },
  { key: "PLATAFORMAS", label: "Plataformas y Herramientas", placeholder: "Ej: VTEX fijo, ERP, email marketing" },
  { key: "FISCAL", label: "Fiscal e Impuestos", placeholder: "Ej: IIBB, contador, monotributo" },
  { key: "INFRAESTRUCTURA", label: "Infraestructura", placeholder: "Ej: Alquiler, servicios, seguros" },
  { key: "MARKETING", label: "Marketing y Contenido", placeholder: "Ej: Fotografia, produccion, ferias" },
  { key: "MERMA", label: "Merma y Perdidas", placeholder: "Ej: Roturas, devoluciones no recuperables" },
  { key: "OTROS", label: "Otros", placeholder: "Ej: Gastos varios" },
];

/* ══════════════════════════════════════════════
   VISTA EJECUTIVA — "¿Cómo voy?"
   ══════════════════════════════════════════════ */
function ExecutiveView({
  summary, changes, dailyTrend, bySource,
}: {
  summary: PnlSummary;
  changes: Changes | null;
  dailyTrend: DailyTrend[];
  bySource: SourceBreakdown[];
}) {
  const netProfit = summary.netOperatingProfit ?? summary.operatingProfit;
  const netMargin = summary.netOperatingMargin ?? summary.operatingMargin;
  const health = getHealthStatus(netMargin);

  // Total costs
  const totalCosts = summary.cogs + summary.adSpend + summary.shipping
    + (summary.platformFees || 0) + (summary.paymentFees || 0)
    + (summary.manualCostsTotal || 0);
  const costPct = summary.revenue > 0 ? (totalCosts / summary.revenue) * 100 : 0;

  return (
    <>
      {/* COGS Coverage Warning */}
      {summary.cogsCoverage < 50 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2">
          <span className="text-amber-500 text-lg">&#9888;</span>
          <div>
            <p className="text-sm font-medium text-amber-800">
              Cobertura de costos: {summary.cogsCoverage}%
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Solo {summary.cogsCoverage}% de los items tienen precio de costo. Los margenes pueden no ser precisos.
            </p>
          </div>
        </div>
      )}

      {/* ── Section 1: Score Card ─── */}
      <div className={`rounded-xl border p-6 mb-6 ${health.bgColor}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-3 h-3 rounded-full ${health.dotColor}`} />
              <span className={`text-sm font-semibold uppercase tracking-wide ${health.color}`}>
                {health.label}
              </span>
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {formatARS(netProfit)}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Beneficio neto — {netMargin}% de margen
            </p>
            <p className="text-xs text-gray-400 mt-2">
              De {formatARS(summary.revenue)} facturados, te quedan {formatARS(netProfit)} despues de todos los costos
            </p>
          </div>
          <div className="text-right">
            {changes && (
              <div className="flex items-center gap-1 justify-end">
                <span className="text-xs text-gray-400">vs periodo anterior</span>
                <ChangeIndicator value={changes.operatingProfit} />
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">{summary.orders.toLocaleString("es-AR")} ordenes</p>
          </div>
        </div>
      </div>

      {/* ── Section 2: Cascada simplificada (3 cards) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Facturación */}
        <div className="bg-white rounded-xl p-5 shadow-sm border-l-4 border-blue-500">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Facturacion</span>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatARS(summary.revenue)}</p>
          <p className="text-sm text-gray-500 mt-1">{summary.orders.toLocaleString("es-AR")} ordenes</p>
          {changes && (
            <div className="mt-2">
              <ChangeIndicator value={changes.revenue} />
            </div>
          )}
        </div>

        {/* Costos totales */}
        <div className="bg-white rounded-xl p-5 shadow-sm border-l-4 border-red-400">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Costos Totales</span>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatARS(totalCosts)}</p>
          <p className="text-sm text-gray-500 mt-1">{costPct.toFixed(1)}% del revenue</p>
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">COGS</span>
              <span className="text-gray-600 font-mono">{formatARS(summary.cogs)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Publicidad</span>
              <span className="text-gray-600 font-mono">{formatARS(summary.adSpend)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Envios + Comisiones + Otros</span>
              <span className="text-gray-600 font-mono">
                {formatARS(summary.shipping + (summary.platformFees || 0) + (summary.paymentFees || 0) + (summary.manualCostsTotal || 0))}
              </span>
            </div>
          </div>
        </div>

        {/* Resultado */}
        <div className={`bg-white rounded-xl p-5 shadow-sm border-l-4 ${netProfit >= 0 ? "border-green-500" : "border-red-500"}`}>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Resultado</span>
          <p className={`text-2xl font-bold mt-2 ${netProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
            {formatARS(netProfit)}
          </p>
          <p className="text-sm text-gray-500 mt-1">{netMargin}% margen neto</p>
          {changes && (
            <div className="mt-2">
              <ChangeIndicator value={changes.operatingProfit} />
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${health.dotColor}`} />
            <span className={`text-xs font-medium ${health.color}`}>{health.label}</span>
          </div>
        </div>
      </div>

      {/* ── Section 3: Mini sparkline ─── */}
      {dailyTrend.length > 2 && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Tendencia del periodo</h3>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={dailyTrend} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Area
                type="monotone" dataKey="revenue" name="Revenue"
                stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.08} strokeWidth={1.5}
              />
              <Area
                type="monotone" dataKey="operatingProfit" name="Beneficio"
                stroke="#22c55e" fill="#22c55e" fillOpacity={0.08} strokeWidth={1.5}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "11px" }}
                formatter={(value: number, name: string) => [formatARS(value), name]}
                labelFormatter={formatDateShort}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-1">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-3 h-0.5 bg-blue-500 inline-block rounded" /> Revenue
            </span>
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-3 h-0.5 bg-green-500 inline-block rounded" /> Beneficio
            </span>
          </div>
        </div>
      )}

      {/* ── Section 4: Canales de un vistazo ─── */}
      {bySource.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bySource.map((s) => {
            const channelHealth = getHealthStatus(s.operatingMargin);
            const revPct = summary.revenue > 0 ? ((s.revenue / summary.revenue) * 100).toFixed(0) : 0;
            return (
              <div key={s.source} className="bg-white rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700">
                    {s.source === "MELI" ? "MercadoLibre" : s.source}
                  </h4>
                  <span className="text-xs text-gray-400">{revPct}% del total</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <span className="text-xs text-gray-400 block">Revenue</span>
                    <span className="text-sm font-bold text-gray-800">{formatARS(s.revenue)}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Ordenes</span>
                    <span className="text-sm font-bold text-gray-800">{s.orders.toLocaleString("es-AR")}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Margen Op.</span>
                    <span className={`text-sm font-bold ${channelHealth.color}`}>{s.operatingMargin}%</span>
                  </div>
                </div>
                <MarginBar
                  value={Math.max(s.operatingMargin, 0)}
                  color={s.operatingMargin >= 15 ? "bg-green-400" : s.operatingMargin >= 5 ? "bg-yellow-400" : "bg-red-400"}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════
   VISTA DETALLADA — Todo el detalle financiero
   ══════════════════════════════════════════════ */
function DetailedView({
  summary, changes, dailyTrend, categories, brands, bySource, manualCosts,
  paymentFeeDetails, chartMode, setChartMode,
}: {
  summary: PnlSummary;
  changes: Changes | null;
  dailyTrend: DailyTrend[];
  categories: CategoryMargin[];
  brands: BrandMargin[];
  bySource: SourceBreakdown[];
  manualCosts: { category: string; total: number }[];
  paymentFeeDetails: PaymentFeeDetail[];
  chartMode: "waterfall" | "trend";
  setChartMode: (m: "waterfall" | "trend") => void;
}) {
  const netOp = summary.netOperatingProfit ?? summary.operatingProfit;

  const waterfallData = [
    { name: "Revenue", value: summary.revenue, fill: "#3b82f6" },
    { name: "COGS", value: -summary.cogs, fill: "#ef4444" },
    { name: "Margen Bruto", value: summary.grossProfit, fill: "#22c55e" },
    { name: "Ads", value: -summary.adSpend, fill: "#f97316" },
    { name: "Envios", value: -summary.shipping, fill: "#8b5cf6" },
    ...(summary.platformFees ? [{ name: "Comisiones", value: -(summary.platformFees), fill: "#6366f1" }] : []),
    ...(summary.paymentFees ? [{ name: "Medios Pago", value: -(summary.paymentFees), fill: "#0ea5e9" }] : []),
    ...(summary.manualCostsTotal ? [{ name: "Otros", value: -(summary.manualCostsTotal), fill: "#14b8a6" }] : []),
    { name: "Neto", value: netOp, fill: netOp >= 0 ? "#22c55e" : "#ef4444" },
  ];

  const tooltipStyle = {
    contentStyle: { backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px" },
  };

  // Build the P&L statement rows
  const pnlRows = [
    { label: "Facturacion (Revenue)", value: summary.revenue, bold: true, color: "text-blue-600" },
    // IVA rows for Responsable Inscripto
    ...(summary.isRI && summary.ivaDebitoFiscal ? [
      { label: "    IVA Debito Fiscal (21%)", value: -(summary.ivaDebitoFiscal), color: "text-gray-400", indent: true, small: true },
      { label: "    Revenue Neto IVA", value: summary.revenueNetoIVA || 0, color: "text-blue-400", indent: true, small: true },
    ] : []),
    { label: "(-) Costo de Mercaderia (COGS)", value: -summary.cogs, color: "text-red-500" },
    { label: "= Ganancia Bruta", value: summary.grossProfit, bold: true, color: summary.grossProfit >= 0 ? "text-green-600" : "text-red-600", pct: summary.grossMargin },
    { label: "(-) Inversion Publicitaria", value: -summary.adSpend, color: "text-orange-500", indent: true },
    { label: "    Meta Ads", value: -summary.metaSpend, color: "text-gray-400", indent: true, small: true },
    { label: "    Google Ads", value: -summary.googleSpend, color: "text-gray-400", indent: true, small: true },
    { label: "(-) Costos de Envio", value: -summary.shipping, color: "text-purple-500", indent: true },
    { label: "(-) Comisiones de Plataforma", value: -(summary.platformFees || 0), color: "text-indigo-500", indent: true },
    ...(bySource.map(s => ({
      label: `    ${s.source === "MELI" ? "MercadoLibre" : s.source}: ${s.platformFeeLabel}`,
      value: -s.platformFee,
      color: "text-gray-400",
      indent: true,
      small: true,
    }))),
    // Payment fees (NEW)
    ...(summary.paymentFees ? [
      { label: "(-) Comisiones Medios de Pago", value: -(summary.paymentFees), color: "text-sky-500", indent: true },
      ...(paymentFeeDetails.filter(pf => pf.fee > 0).map(pf => ({
        label: `    ${pf.method} (${pf.source}): ${pf.feeRate}%`,
        value: -pf.fee,
        color: "text-gray-400",
        indent: true,
        small: true,
      }))),
    ] : []),
    // Discounts (NEW)
    ...(summary.discounts ? [
      { label: "(-) Descuentos y Promociones", value: -(summary.discounts), color: "text-pink-500", indent: true },
    ] : []),
    // Manual costs
    ...(summary.manualCostsTotal ? [
      { label: "(-) Otros Costos Operativos", value: -(summary.manualCostsTotal), color: "text-teal-600", indent: true },
      ...(manualCosts.filter(mc => mc.total > 0).map(mc => {
        const cat = COST_CATEGORIES.find(c => c.key === mc.category);
        return {
          label: `    ${cat?.label || mc.category}`,
          value: -mc.total,
          color: "text-gray-400",
          indent: true,
          small: true,
        };
      })),
    ] : []),
    // Bottom line
    { label: "= Beneficio Neto Operativo", value: netOp, bold: true, color: netOp >= 0 ? "text-green-700" : "text-red-700", pct: (summary.netOperatingMargin ?? summary.operatingMargin), highlight: true },
  ];

  return (
    <>
      {/* COGS Coverage Warning */}
      {summary.cogsCoverage < 50 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2">
          <span className="text-amber-500 text-lg">&#9888;</span>
          <div>
            <p className="text-sm font-medium text-amber-800">
              Cobertura de costos: {summary.cogsCoverage}%
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Solo {summary.cogsCoverage}% de los items tienen precio de costo. Para un P&L preciso,
              carga los costos en la seccion de Productos.
            </p>
          </div>
        </div>
      )}

      {/* ── KPI Cards (5 consolidadas) ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {/* Revenue */}
        <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Revenue</span>
            {changes && <ChangeIndicator value={changes.revenue} />}
          </div>
          <p className="text-lg font-bold text-gray-800">{formatARS(summary.revenue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{summary.orders} ordenes | AOV {formatARS(summary.aov)}</p>
        </div>
        {/* COGS / Margen Bruto */}
        <div className="bg-white rounded-xl p-4 border-l-4 border-green-500 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Margen Bruto</span>
            {changes && <ChangeIndicator value={changes.grossProfit} />}
          </div>
          <p className="text-lg font-bold text-gray-800">{formatARS(summary.grossProfit)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{summary.grossMargin}% | COGS: {formatARS(summary.cogs)}</p>
        </div>
        {/* Ads */}
        <div className="bg-white rounded-xl p-4 border-l-4 border-orange-400 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Publicidad</span>
            {changes && <ChangeIndicator value={changes.adSpend} inverse />}
          </div>
          <p className="text-lg font-bold text-gray-800">{formatARS(summary.adSpend)}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">Meta {formatARS(summary.metaSpend)} | Google {formatARS(summary.googleSpend)}</p>
        </div>
        {/* Costos operativos (envíos + comisiones + payment + otros) */}
        <div className="bg-white rounded-xl p-4 border-l-4 border-indigo-400 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Costos Operativos</span>
          <p className="text-lg font-bold text-gray-800 mt-1">
            {formatARS(summary.shipping + (summary.platformFees || 0) + (summary.paymentFees || 0) + (summary.manualCostsTotal || 0))}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            Envios {formatARS(summary.shipping)} | Comis. {formatARS((summary.platformFees || 0) + (summary.paymentFees || 0))}
          </p>
        </div>
        {/* Beneficio Neto */}
        <div className={`bg-white rounded-xl p-4 border-l-4 shadow-sm ${netOp >= 0 ? "border-green-600" : "border-red-600"}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Beneficio Neto</span>
            {changes && <ChangeIndicator value={changes.operatingProfit} />}
          </div>
          <p className={`text-lg font-bold ${netOp >= 0 ? "text-green-700" : "text-red-600"}`}>{formatARS(netOp)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{summary.netOperatingMargin ?? summary.operatingMargin}% margen neto</p>
        </div>
      </div>

      {/* ── Unit Economics ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase">Ticket Promedio</span>
          <p className="text-lg font-bold text-gray-800 mt-1">{formatARS(summary.aov)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase">Unidades</span>
          <p className="text-lg font-bold text-gray-800 mt-1">{summary.units.toLocaleString("es-AR")}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase">Costo x Unidad</span>
          <p className="text-lg font-bold text-gray-800 mt-1">
            {summary.units > 0 ? formatARS(summary.cogs / summary.units) : "\u2014"}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase">Margen x Unidad</span>
          <p className="text-lg font-bold text-gray-800 mt-1">
            {summary.units > 0 ? formatARS(summary.grossProfit / summary.units) : "\u2014"}
          </p>
        </div>
      </div>

      {/* ── P&L Chart ─── */}
      <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Estado de Resultados</h3>
          <div className="flex gap-1">
            <button
              onClick={() => setChartMode("waterfall")}
              className={`px-3 py-1 rounded-lg text-xs font-medium ${
                chartMode === "waterfall" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"
              }`}
            >Cascada</button>
            <button
              onClick={() => setChartMode("trend")}
              className={`px-3 py-1 rounded-lg text-xs font-medium ${
                chartMode === "trend" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"
              }`}
            >Tendencia</button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          {chartMode === "waterfall" ? (
            <BarChart data={waterfallData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompact(Math.abs(v))} />
              <Tooltip {...tooltipStyle} formatter={(value: number) => [formatARS(Math.abs(value)), ""]} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {waterfallData.map((entry, index) => (
                  <rect key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <AreaChart data={dailyTrend} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={formatDateShort} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
              <Tooltip {...tooltipStyle} formatter={(value: number, name: string) => [formatARS(value), name]} />
              <Legend />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="grossProfit" name="Margen Bruto" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="operatingProfit" name="Beneficio Op." stroke="#f97316" fill="#f97316" fillOpacity={0.1} strokeWidth={1.5} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* ── P&L Table (Statement) ─── */}
      <div className="bg-white rounded-xl shadow-sm mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Estado de Resultados Detallado</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {pnlRows.map((row, i) => (
            <div
              key={i}
              className={`flex items-center justify-between px-5 py-2.5 ${
                row.highlight ? "bg-gray-50" : ""
              } ${row.indent ? "pl-8" : ""}`}
            >
              <span className={`${row.small ? "text-xs" : "text-sm"} ${row.bold ? "font-semibold text-gray-800" : "text-gray-600"}`}>
                {row.label}
              </span>
              <div className="flex items-center gap-3">
                <span className={`${row.small ? "text-xs" : "text-sm"} font-mono ${row.bold ? "font-bold" : "font-medium"} ${row.color}`}>
                  {row.value < 0 ? "-" : ""}{formatARS(Math.abs(row.value))}
                </span>
                {row.pct !== undefined && (
                  <span className="text-xs text-gray-400 font-mono w-14 text-right">{row.pct}%</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── P&L por Canal ─── */}
      {bySource.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">P&L por Canal</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500 uppercase">Concepto</th>
                  {bySource.map(s => (
                    <th key={s.source} className="text-right px-5 py-2.5 text-xs font-medium text-gray-500 uppercase">
                      {s.source === "MELI" ? "MercadoLibre" : s.source}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  { label: "Revenue", key: "revenue", bold: true, color: "text-blue-600" },
                  { label: "Ordenes", key: "orders", format: "num" },
                  { label: "Ticket Promedio", key: "aov" },
                  { label: "COGS", key: "cogs", negative: true },
                  { label: "Margen Bruto", key: "grossProfit", bold: true },
                  { label: "Margen Bruto %", key: "grossMargin", format: "pct" },
                  { label: "Envios", key: "shipping", negative: true },
                  { label: "Comisiones Plataforma", key: "platformFee", negative: true, color: "text-indigo-500" },
                  { label: "Beneficio Operativo", key: "operatingProfit", bold: true },
                  { label: "Margen Operativo %", key: "operatingMargin", format: "pct", bold: true },
                ].map((row) => (
                  <tr key={row.key} className={row.bold ? "bg-gray-50/50" : ""}>
                    <td className={`px-5 py-2 ${row.bold ? "font-semibold text-gray-800" : "text-gray-600"}`}>
                      {row.label}
                    </td>
                    {bySource.map(s => {
                      const val = (s as any)[row.key];
                      let display = "";
                      if (row.format === "pct") display = `${val}%`;
                      else if (row.format === "num") display = val.toLocaleString("es-AR");
                      else display = formatARS(Math.abs(val));
                      const isNeg = row.negative && val > 0;
                      return (
                        <td key={s.source} className={`px-5 py-2 text-right font-mono ${row.bold ? "font-bold" : "font-medium"} ${
                          row.color || (row.bold && row.key === "operatingProfit"
                            ? (val >= 0 ? "text-green-600" : "text-red-600")
                            : "text-gray-700")
                        }`}>
                          {isNeg ? "-" : ""}{display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {bySource.some(s => s.platformFeeLabel) && (
                  <tr>
                    <td className="px-5 py-1.5 text-xs text-gray-400 pl-8" colSpan={bySource.length + 1}>
                      {bySource.map(s => (
                        <span key={s.source} className="mr-6">
                          {s.source === "MELI" ? "ML" : s.source}: {s.platformFeeLabel}
                        </span>
                      ))}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Category + Brand Margins ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Margen por Categoria</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {categories.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">Sin datos de categorias</div>
            ) : (
              categories.slice(0, 10).map((cat, i) => (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700 font-medium truncate max-w-[60%]">{cat.category}</span>
                    <span className="text-xs text-gray-500">{formatARS(cat.revenue)} | {cat.grossMargin}%</span>
                  </div>
                  <MarginBar value={cat.grossMargin} color={cat.grossMargin >= 40 ? "bg-green-400" : cat.grossMargin >= 25 ? "bg-yellow-400" : "bg-red-400"} />
                </div>
              ))
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Margen por Marca</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {brands.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">Sin datos de marcas</div>
            ) : (
              brands.slice(0, 10).map((brand, i) => (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700 font-medium truncate max-w-[60%]">{brand.brand}</span>
                    <span className="text-xs text-gray-500">{formatARS(brand.revenue)} | {brand.grossMargin}%</span>
                  </div>
                  <MarginBar value={brand.grossMargin} color={brand.grossMargin >= 40 ? "bg-green-400" : brand.grossMargin >= 25 ? "bg-yellow-400" : "bg-red-400"} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ══════════════════════════════════════════════ */
export default function FinanzasPage() {
  const [summary, setSummary] = useState<PnlSummary | null>(null);
  const [changes, setChanges] = useState<Changes | null>(null);
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [categories, setCategories] = useState<CategoryMargin[]>([]);
  const [brands, setBrands] = useState<BrandMargin[]>([]);
  const [bySource, setBySource] = useState<SourceBreakdown[]>([]);
  const [manualCosts, setManualCosts] = useState<{ category: string; total: number }[]>([]);
  const [paymentFeeDetails, setPaymentFeeDetails] = useState<PaymentFeeDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"executive" | "detailed">("executive");
  const [chartMode, setChartMode] = useState<"waterfall" | "trend">("waterfall");

  // Date state — default 30 days
  const defaultFrom = new Date();
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  const [dateFrom, setDateFrom] = useState(defaultFrom.toISOString().split("T")[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(30);

  const FIN_QUICK_RANGES = [
    { label: "7 dias", days: 7 },
    { label: "30 dias", days: 30 },
    { label: "90 dias", days: 90 },
  ];

  function fetchData(from?: string, to?: string) {
    setLoading(true);
    setError("");
    const f = from || dateFrom;
    const t = to || dateTo;

    const params = new URLSearchParams({ dateFrom: f, dateTo: t });
    fetch(`/api/metrics/pnl?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.summary) {
          setSummary(data.summary);
          setChanges(data.changes || null);
          setDailyTrend(data.dailyTrend || []);
          setCategories(data.categories || []);
          setBrands(data.brands || []);
          setBySource(data.bySource || []);
          setManualCosts(data.manualCosts || []);
          setPaymentFeeDetails(data.paymentFees || []);
        } else {
          setError(data.error || "Error cargando datos");
        }
      })
      .catch(() => setError("Error de conexion"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchData();
  }, []);

  function handleQuickRange(days: number) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    const f = from.toISOString().split("T")[0];
    const t = to.toISOString().split("T")[0];
    setDateFrom(f);
    setDateTo(t);
    setActiveQuickRange(days);
    fetchData(f, t);
  }

  function handleDateChange(type: "from" | "to", value: string) {
    if (type === "from") setDateFrom(value);
    else setDateTo(value);
    const f = type === "from" ? value : dateFrom;
    const t = type === "to" ? value : dateTo;
    setActiveQuickRange(null);
    fetchData(f, t);
  }

  if (loading) {
    return (
      <div className="light-canvas min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <p className="text-gray-500 text-sm">Calculando P&L...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="light-canvas min-h-screen p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="light-canvas min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Finanzas</h2>
            <p className="text-sm text-gray-500 mt-0.5">P&L — Estado de Resultados</p>
          </div>
          {/* View Mode Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("executive")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "executive"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Ejecutivo
            </button>
            <button
              onClick={() => setViewMode("detailed")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "detailed"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Detallado
            </button>
          </div>
        </div>
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          activeQuickRange={activeQuickRange}
          quickRanges={FIN_QUICK_RANGES}
          onQuickRange={handleQuickRange}
          onDateChange={handleDateChange}
          loading={loading}
        />
      </div>

      {/* Conditional View */}
      {viewMode === "executive" ? (
        <ExecutiveView
          summary={summary}
          changes={changes}
          dailyTrend={dailyTrend}
          bySource={bySource}
        />
      ) : (
        <DetailedView
          summary={summary}
          changes={changes}
          dailyTrend={dailyTrend}
          categories={categories}
          brands={brands}
          bySource={bySource}
          manualCosts={manualCosts}
          paymentFeeDetails={paymentFeeDetails}
          chartMode={chartMode}
          setChartMode={setChartMode}
        />
      )}
    </div>
  );
}
