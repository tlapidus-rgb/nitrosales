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
  operatingProfit: number;
  operatingMargin: number;
  platformFees?: number;
  manualCostsTotal?: number;
  netOperatingProfit?: number;
  netOperatingMargin?: number;
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

/* ── (Date handling moved to DateRangeFilter) ── */

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

/* ── Main Component ─────────────────────────── */
export default function FinanzasPage() {
  const [summary, setSummary] = useState<PnlSummary | null>(null);
  const [changes, setChanges] = useState<Changes | null>(null);
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [categories, setCategories] = useState<CategoryMargin[]>([]);
  const [brands, setBrands] = useState<BrandMargin[]>([]);
  const [bySource, setBySource] = useState<SourceBreakdown[]>([]);
  const [manualCosts, setManualCosts] = useState<{ category: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: "8px",
      fontSize: "12px",
    },
  };

  // Build waterfall data for P&L visualization
  const netOp = summary ? (summary.netOperatingProfit ?? summary.operatingProfit) : 0;
  const waterfallData = summary
    ? [
        { name: "Revenue", value: summary.revenue, fill: "#3b82f6" },
        { name: "COGS", value: -summary.cogs, fill: "#ef4444" },
        { name: "Margen Bruto", value: summary.grossProfit, fill: "#22c55e" },
        { name: "Ad Spend", value: -summary.adSpend, fill: "#f97316" },
        { name: "Envios", value: -summary.shipping, fill: "#8b5cf6" },
        ...(summary.platformFees ? [{ name: "Comisiones", value: -(summary.platformFees), fill: "#6366f1" }] : []),
        ...(summary.manualCostsTotal ? [{ name: "Otros Costos", value: -(summary.manualCostsTotal), fill: "#14b8a6" }] : []),
        { name: "Beneficio Neto", value: netOp, fill: netOp >= 0 ? "#22c55e" : "#ef4444" },
      ]
    : [];


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
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="light-canvas min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Finanzas</h2>
          <p className="text-sm text-gray-500 mt-0.5">P&L — Estado de Resultados</p>
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

      {/* ── KPI Cards Row 1: P&L Summary ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {[
          {
            label: "Revenue",
            value: formatARS(summary.revenue),
            sub: `${summary.orders} ordenes`,
            changeKey: "revenue" as keyof Changes,
            color: "border-blue-500",
          },
          {
            label: "COGS",
            value: formatARS(summary.cogs),
            sub: `Cobertura: ${summary.cogsCoverage}%`,
            color: "border-red-400",
          },
          {
            label: "Margen Bruto",
            value: formatARS(summary.grossProfit),
            sub: `${summary.grossMargin}% margen`,
            changeKey: "grossProfit" as keyof Changes,
            color: "border-green-500",
          },
          {
            label: "Inversion Ads",
            value: formatARS(summary.adSpend),
            sub: `Meta: ${formatARS(summary.metaSpend)} | Google: ${formatARS(summary.googleSpend)}`,
            changeKey: "adSpend" as keyof Changes,
            inverse: true,
            color: "border-orange-400",
          },
          {
            label: "Envios",
            value: formatARS(summary.shipping),
            sub: "Costo de envio",
            color: "border-purple-400",
          },
          {
            label: "Comisiones",
            value: formatARS(summary.platformFees || 0),
            sub: bySource.map(s => `${s.source}: ${formatARS(s.platformFee)}`).join(" | ") || "Sin datos",
            color: "border-indigo-400",
          },
          {
            label: "Beneficio Neto",
            value: formatARS(summary.netOperatingProfit ?? summary.operatingProfit),
            sub: `${summary.netOperatingMargin ?? summary.operatingMargin}% margen neto op.`,
            changeKey: "operatingProfit" as keyof Changes,
            color: (summary.netOperatingProfit ?? summary.operatingProfit) >= 0 ? "border-green-600" : "border-red-600",
          },
        ].map((kpi, i) => (
          <div
            key={i}
            className={`bg-white rounded-xl p-4 border-l-4 ${kpi.color} shadow-sm`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {kpi.label}
              </span>
              {kpi.changeKey && changes && (
                <ChangeIndicator value={changes[kpi.changeKey]} inverse={kpi.inverse} />
              )}
            </div>
            <p className="text-lg font-bold text-gray-800">{kpi.value}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Row 2: AOV + Unit Economics ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase">Ticket Promedio</span>
          <p className="text-lg font-bold text-gray-800 mt-1">{formatARS(summary.aov)}</p>
          <p className="text-xs text-gray-400">Revenue / ordenes</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase">Unidades</span>
          <p className="text-lg font-bold text-gray-800 mt-1">{summary.units.toLocaleString("es-AR")}</p>
          <p className="text-xs text-gray-400">Unidades vendidas</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase">Costo x Unidad</span>
          <p className="text-lg font-bold text-gray-800 mt-1">
            {summary.units > 0 ? formatARS(summary.cogs / summary.units) : "—"}
          </p>
          <p className="text-xs text-gray-400">COGS / unidades</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase">Margen x Unidad</span>
          <p className="text-lg font-bold text-gray-800 mt-1">
            {summary.units > 0 ? formatARS(summary.grossProfit / summary.units) : "—"}
          </p>
          <p className="text-xs text-gray-400">Ganancia bruta / unidad</p>
        </div>
      </div>

      {/* ── P&L Waterfall / Trend Chart ─── */}
      <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Estado de Resultados</h3>
          <div className="flex gap-1">
            <button
              onClick={() => setChartMode("waterfall")}
              className={`px-3 py-1 rounded-lg text-xs font-medium ${
                chartMode === "waterfall" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              Cascada
            </button>
            <button
              onClick={() => setChartMode("trend")}
              className={`px-3 py-1 rounded-lg text-xs font-medium ${
                chartMode === "trend" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              Tendencia
            </button>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          {chartMode === "waterfall" ? (
            <BarChart data={waterfallData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompact(Math.abs(v))} />
              <Tooltip
                {...tooltipStyle}
                formatter={(value: number) => [formatARS(Math.abs(value)), ""]}
              />
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
              <Tooltip
                {...tooltipStyle}
                formatter={(value: number, name: string) => [formatARS(value), name]}
              />
              <Legend />
              <Area
                type="monotone" dataKey="revenue" name="Revenue"
                stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2}
              />
              <Area
                type="monotone" dataKey="grossProfit" name="Margen Bruto"
                stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} strokeWidth={2}
              />
              <Area
                type="monotone" dataKey="operatingProfit" name="Beneficio Op."
                stroke="#f97316" fill="#f97316" fillOpacity={0.1} strokeWidth={1.5}
              />
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
          {[
            { label: "Facturacion (Revenue)", value: summary.revenue, bold: true, color: "text-blue-600" },
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
            { label: "= Beneficio Neto Operativo", value: (summary.netOperatingProfit ?? summary.operatingProfit), bold: true, color: (summary.netOperatingProfit ?? summary.operatingProfit) >= 0 ? "text-green-700" : "text-red-700", pct: (summary.netOperatingMargin ?? summary.operatingMargin), highlight: true },
          ].map((row, i) => (
            <div
              key={i}
              className={`flex items-center justify-between px-5 py-2.5 ${
                row.highlight ? "bg-gray-50" : ""
              } ${row.indent ? "pl-8" : ""}`}
            >
              <span
                className={`${row.small ? "text-xs" : "text-sm"} ${
                  row.bold ? "font-semibold text-gray-800" : "text-gray-600"
                }`}
              >
                {row.label}
              </span>
              <div className="flex items-center gap-3">
                <span className={`${row.small ? "text-xs" : "text-sm"} font-mono ${row.bold ? "font-bold" : "font-medium"} ${row.color}`}>
                  {row.value < 0 ? "-" : ""}{formatARS(Math.abs(row.value))}
                </span>
                {row.pct !== undefined && (
                  <span className="text-xs text-gray-400 font-mono w-14 text-right">
                    {row.pct}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── P&L por Canal (MELI vs VTEX) ─── */}
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
                {/* Platform fee detail row */}
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

      {/* ── Row: Category + Brand Margins ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Categories */}
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
                    <span className="text-sm text-gray-700 font-medium truncate max-w-[60%]">
                      {cat.category}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatARS(cat.revenue)} | {cat.grossMargin}%
                    </span>
                  </div>
                  <MarginBar
                    value={cat.grossMargin}
                    color={cat.grossMargin >= 40 ? "bg-green-400" : cat.grossMargin >= 25 ? "bg-yellow-400" : "bg-red-400"}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Brands */}
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
                    <span className="text-sm text-gray-700 font-medium truncate max-w-[60%]">
                      {brand.brand}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatARS(brand.revenue)} | {brand.grossMargin}%
                    </span>
                  </div>
                  <MarginBar
                    value={brand.grossMargin}
                    color={brand.grossMargin >= 40 ? "bg-green-400" : brand.grossMargin >= 25 ? "bg-yellow-400" : "bg-red-400"}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
