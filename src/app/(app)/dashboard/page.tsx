// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// Dashboard Personalizable — Widget-based Overview
// ══════════════════════════════════════════════════════════════
// Cada empresa elige qué KPIs ver, combinando datos de todas
// las secciones (ventas, marketing, SEO, clientes, finanzas, productos).
// Las preferencias se guardan en Organization.settings.dashboardWidgets.
// ══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { formatARS, formatCompact, formatDateShort } from "@/lib/utils/format";
import NitroInsightsPanel from "@/components/NitroInsightsPanel";
import { DateRangeFilter } from "@/components/dashboard";

// ── Widget catalog definition ──

type WidgetDef = {
  id: string;
  category: string;
  catColor: string;
  title: string;
  dataSource: string; // which API to call
  large?: boolean;    // span 2 columns (for charts)
};

const WIDGET_CATALOG: WidgetDef[] = [
  // Ventas
  { id: "revenue", category: "Ventas", catColor: "#059669", title: "Facturacion", dataSource: "metrics" },
  { id: "orders", category: "Ventas", catColor: "#059669", title: "Pedidos", dataSource: "metrics" },
  { id: "ticket", category: "Ventas", catColor: "#059669", title: "Ticket Promedio", dataSource: "metrics" },
  { id: "sessions", category: "Ventas", catColor: "#059669", title: "Sesiones", dataSource: "metrics" },
  { id: "conversion", category: "Ventas", catColor: "#059669", title: "Tasa Conversion", dataSource: "metrics" },
  { id: "revenue-chart", category: "Ventas", catColor: "#059669", title: "Facturacion Diaria", dataSource: "trends", large: true },

  // Marketing
  { id: "adspend", category: "Marketing", catColor: "#7c3aed", title: "Inversion Ads", dataSource: "metrics" },
  { id: "roas", category: "Marketing", catColor: "#7c3aed", title: "ROAS", dataSource: "metrics" },
  { id: "ctr", category: "Marketing", catColor: "#7c3aed", title: "CTR", dataSource: "metrics" },
  { id: "cpc", category: "Marketing", catColor: "#7c3aed", title: "CPC", dataSource: "metrics" },
  { id: "impressions-ads", category: "Marketing", catColor: "#7c3aed", title: "Impresiones Ads", dataSource: "metrics" },
  { id: "clicks-ads", category: "Marketing", catColor: "#7c3aed", title: "Clicks Ads", dataSource: "metrics" },
  { id: "spend-chart", category: "Marketing", catColor: "#7c3aed", title: "Inversion por Plataforma", dataSource: "trends", large: true },

  // SEO
  { id: "seo-clicks", category: "SEO", catColor: "#0284c7", title: "Clics Organicos", dataSource: "seo" },
  { id: "seo-impressions", category: "SEO", catColor: "#0284c7", title: "Impresiones SEO", dataSource: "seo" },
  { id: "seo-position", category: "SEO", catColor: "#0284c7", title: "Posicion Promedio", dataSource: "seo" },
  { id: "seo-ctr", category: "SEO", catColor: "#0284c7", title: "CTR Organico", dataSource: "seo" },
  { id: "seo-top10", category: "SEO", catColor: "#0284c7", title: "Keywords Top 10", dataSource: "seo" },

  // Clientes
  { id: "new-customers", category: "Clientes", catColor: "#d97706", title: "Clientes Nuevos", dataSource: "customers" },
  { id: "repeat-rate", category: "Clientes", catColor: "#d97706", title: "Tasa Recurrencia", dataSource: "customers" },
  { id: "avg-spent", category: "Clientes", catColor: "#d97706", title: "Gasto Promedio", dataSource: "customers" },

  // Finanzas
  { id: "gross-margin", category: "Finanzas", catColor: "#db2777", title: "Margen Bruto", dataSource: "pnl" },
  { id: "operating-profit", category: "Finanzas", catColor: "#db2777", title: "Ganancia Operativa", dataSource: "pnl" },

  // Productos
  { id: "low-stock", category: "Productos", catColor: "#16a34a", title: "Stock Bajo", dataSource: "products" },
  { id: "dead-stock", category: "Productos", catColor: "#16a34a", title: "Dead Stock", dataSource: "products" },

  // NitroPixel
  { id: "pixel-revenue", category: "NitroPixel", catColor: "#f59e0b", title: "Revenue Atribuido", dataSource: "pixel" },
  { id: "pixel-roas", category: "NitroPixel", catColor: "#f59e0b", title: "ROAS Pixel", dataSource: "pixel" },
  { id: "pixel-orders", category: "NitroPixel", catColor: "#f59e0b", title: "Ordenes Atribuidas", dataSource: "pixel" },
  { id: "pixel-attribution", category: "NitroPixel", catColor: "#f59e0b", title: "Tasa Atribucion", dataSource: "pixel" },
  { id: "pixel-visitors", category: "NitroPixel", catColor: "#f59e0b", title: "Visitantes", dataSource: "pixel" },
  { id: "pixel-identified", category: "NitroPixel", catColor: "#f59e0b", title: "Identificados", dataSource: "pixel" },
];

const DEFAULT_WIDGETS = [
  "revenue", "orders", "ticket", "sessions", "adspend", "roas",
  "ctr", "cpc", "conversion",
  "revenue-chart", "spend-chart",
];

const WIDGET_MAP = Object.fromEntries(WIDGET_CATALOG.map(w => [w.id, w]));

// ── Data source URLs ──
const DATA_SOURCES: Record<string, string> = {
  metrics: "/api/metrics",
  trends: "/api/metrics/trends",
  seo: "/api/metrics/seo",
  customers: "/api/metrics/customers",
  pnl: "/api/metrics/pnl",
  products: "/api/metrics/products",
  pixel: "/api/metrics/pixel",
};

// ── Helper: format number ──
const fmt = (n: number) => n?.toLocaleString("es-AR") ?? "0";
const fmtPct = (n: number) => (n ?? 0) + "%";

// ── Change indicator (reused from original) ──
function ChangeIndicator({ value, inverse }: { value: number | null | undefined; inverse?: boolean }) {
  if (value === null || value === undefined) return null;
  const isPositive = inverse ? value < 0 : value > 0;
  const color = isPositive ? "text-green-600" : value === 0 ? "text-gray-400" : "text-red-500";
  const arrow = value > 0 ? "\u2191" : value < 0 ? "\u2193" : "";
  return <span className={`text-xs font-medium ${color}`}>{arrow}{Math.abs(value)}%</span>;
}

// ══════════════════════════════════════════════════════════════
// Widget Renderer — extracts value from fetched data per widget
// ══════════════════════════════════════════════════════════════

function getWidgetData(id: string, allData: Record<string, any>): { value: string; sub: string; change?: number; inverse?: boolean } | null {
  const m = allData.metrics?.summary;
  const c = allData.metrics?.changes;
  const seo = allData.seo?.kpis;
  const cust = allData.customers?.kpis;
  const pnl = allData.pnl?.summary;
  const pnlC = allData.pnl?.changes;
  const prod = allData.products?.stockSummary;
  const px = allData.pixel?.businessKpis;
  const pxV = allData.pixel?.kpis;

  switch (id) {
    // Ventas
    case "revenue": return m ? { value: formatARS(m.revenue), sub: "Ordenes facturadas", change: c?.revenue } : null;
    case "orders": return m ? { value: fmt(m.orders), sub: "Facturados/enviados", change: c?.orders } : null;
    case "ticket": return m ? { value: formatARS(m.avgTicket), sub: "Revenue / pedidos", change: c?.avgTicket } : null;
    case "sessions": return m ? { value: fmt(m.sessions), sub: "Trafico web (GA4)", change: c?.sessions } : null;
    case "conversion": return m ? { value: fmtPct(m.conversionRate), sub: "Pedidos / sesiones", change: c?.conversionRate } : null;

    // Marketing
    case "adspend": return m ? { value: formatARS(m.adSpend), sub: `Google: ${formatARS(m.googleSpend)} | Meta: ${formatARS(m.metaSpend)}`, change: c?.adSpend, inverse: true } : null;
    case "roas": return m ? { value: m.roas + "x", sub: "Retorno publicitario", change: c?.roas } : null;
    case "ctr": return m ? { value: fmtPct(m.ctr), sub: "Click-through rate", change: c?.ctr } : null;
    case "cpc": return m ? { value: formatARS(m.cpc), sub: "Costo por click", change: c?.cpc, inverse: true } : null;
    case "impressions-ads": return m ? { value: formatCompact(m.impressions), sub: "Total ads" } : null;
    case "clicks-ads": return m ? { value: formatCompact(m.clicks), sub: "Total ads" } : null;

    // SEO
    case "seo-clicks": return seo ? { value: fmt(seo.totalClicks), sub: "Desde Google", change: seo.changes?.clicks } : null;
    case "seo-impressions": return seo ? { value: fmt(seo.totalImpressions), sub: "Apariciones en Google", change: seo.changes?.impressions } : null;
    case "seo-position": return seo ? { value: (seo.avgPosition || 0).toFixed(1), sub: "En resultados de Google", change: seo.changes?.position, inverse: true } : null;
    case "seo-ctr": return seo ? { value: fmtPct(seo.avgCtr), sub: "Click-through rate organico", change: seo.changes?.ctr } : null;
    case "seo-top10": return seo ? { value: fmt(seo.kwTop10), sub: "Keywords posicion 1-10" } : null;

    // Clientes
    case "new-customers": return cust ? { value: fmt(cust.newCustomers), sub: "Primera compra este periodo", change: cust.changes?.customers } : null;
    case "repeat-rate": return cust ? { value: fmtPct(cust.repeatRate), sub: "Ya compraron antes" } : null;
    case "avg-spent": return cust ? { value: formatARS(cust.avgSpentPerCustomer), sub: "Promedio por cliente", change: cust.changes?.avgSpent } : null;

    // Finanzas
    case "gross-margin": return pnl ? { value: fmtPct(pnl.grossMargin), sub: "Revenue - COGS", change: pnlC?.grossProfit } : null;
    case "operating-profit": return pnl ? { value: formatARS(pnl.operatingProfit), sub: "Despues de gastos", change: pnlC?.operatingProfit } : null;

    // Productos
    case "low-stock": return prod ? { value: fmt(prod.criticalCount + prod.lowCount), sub: "Productos a reponer" } : null;
    case "dead-stock": return prod ? { value: fmt(prod.deadCount), sub: "Sin ventas 60+ dias" } : null;

    // NitroPixel
    case "pixel-revenue": return px ? { value: formatARS(px.pixelRevenue), sub: "Atribuido por pixel" } : null;
    case "pixel-roas": return px ? { value: (px.pixelRoas || 0).toFixed(2) + "x", sub: "Retorno atribuido pixel" } : null;
    case "pixel-orders": return px ? { value: fmt(px.ordersAttributed), sub: "Con atribucion de canal" } : null;
    case "pixel-attribution": return px ? { value: fmtPct(px.attributionRate), sub: "Ordenes con canal identificado" } : null;
    case "pixel-visitors": return pxV ? { value: fmt(pxV.totalVisitors), sub: "Visitantes unicos pixel", change: pxV.changes?.visitors } : null;
    case "pixel-identified": return pxV ? { value: fmt(pxV.identifiedVisitors), sub: "Con identidad resuelta" } : null;

    default: return null;
  }
}

// ══════════════════════════════════════════════════════════════
// Main Dashboard Component
// ══════════════════════════════════════════════════════════════

export default function DashboardPage() {
  const { data: session } = useSession();
  const orgName = (session?.user as any)?.organizationName || "Tu negocio";
  const [activeWidgets, setActiveWidgets] = useState<string[]>(DEFAULT_WIDGETS);
  const [allData, setAllData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // ── Period state ──
  const toDateStr = (d: Date) => d.toISOString().split("T")[0];
  const defaultTo = new Date();
  const defaultFrom = new Date(Date.now() - 29 * 86400000);
  const [dateFrom, setDateFrom] = useState(toDateStr(defaultFrom));
  const [dateTo, setDateTo] = useState(toDateStr(defaultTo));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(30);

  const DASH_QUICK_RANGES = [
    { label: "7 dias", days: 7 },
    { label: "30 dias", days: 30 },
    { label: "90 dias", days: 90 },
  ];

  const handleDashQuickRange = (days: number) => {
    const to = new Date();
    const from = new Date(Date.now() - (days - 1) * 86400000);
    setDateTo(toDateStr(to));
    setDateFrom(toDateStr(from));
    setActiveQuickRange(days);
  };

  const handleDashDateChange = (type: "from" | "to", value: string) => {
    if (type === "from") setDateFrom(value);
    else setDateTo(value);
    setActiveQuickRange(null);
  };

  // Build query string for APIs
  const periodQuery = useMemo(
    () => `from=${dateFrom}&to=${dateTo}`,
    [dateFrom, dateTo]
  );

  // ── Load preferences on mount ──
  useEffect(() => {
    fetch("/api/dashboard/preferences")
      .then(r => r.json())
      .then(data => {
        if (data.widgets?.length > 0) setActiveWidgets(data.widgets);
      })
      .catch(() => {}); // Use defaults on error
  }, []);

  // ── Fetch data based on active widgets + period ──
  useEffect(() => {
    setLoading(true);
    setError("");

    // Determine which data sources are needed
    const needed = new Set<string>();
    for (const wId of activeWidgets) {
      const w = WIDGET_MAP[wId];
      if (w) needed.add(w.dataSource);
    }

    // Fetch all needed sources in parallel, passing period params
    const fetches: Record<string, Promise<any>> = {};
    for (const src of needed) {
      const baseUrl = DATA_SOURCES[src];
      if (baseUrl) {
        const sep = baseUrl.includes("?") ? "&" : "?";
        fetches[src] = fetch(`${baseUrl}${sep}${periodQuery}`).then(r => r.json()).catch(() => null);
      }
    }

    const keys = Object.keys(fetches);
    Promise.all(Object.values(fetches))
      .then(results => {
        const data: Record<string, any> = {};
        keys.forEach((k, i) => { data[k] = results[i]; });
        setAllData(data);
      })
      .catch(() => setError("Error cargando datos"))
      .finally(() => setLoading(false));
  }, [activeWidgets, periodQuery]);

  // ── Save preferences ──
  const savePreferences = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/dashboard/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets: activeWidgets }),
      });
      showToast("Layout guardado correctamente");
      setEditMode(false);
    } catch {
      showToast("Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [activeWidgets]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const removeWidget = (id: string) => {
    setActiveWidgets(prev => prev.filter(w => w !== id));
    showToast("Widget removido");
  };

  const addWidget = (id: string) => {
    if (!activeWidgets.includes(id)) {
      setActiveWidgets(prev => [...prev, id]);
      showToast("Widget agregado");
    }
  };

  const reorderWidgets = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const newList = [...activeWidgets];
    const [moved] = newList.splice(fromIdx, 1);
    newList.splice(toIdx, 0, moved);
    setActiveWidgets(newList);
  };

  // ── Chart data ──
  const trends = allData.trends?.days || [];
  const tooltipStyle = { contentStyle: { backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px" } };

  // ── Render ──
  return (
    <div className="light-canvas min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Dashboard</h2>
          <p className="text-gray-500">{orgName}</p>
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <button
              onClick={savePreferences}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: "linear-gradient(135deg, #FF5E1A, #FF8A50)" }}
            >
              {saving ? "Guardando..." : "Guardar Layout"}
            </button>
          )}
          <button
            onClick={() => { if (editMode) { setEditMode(false); setCatalogOpen(false); } else setEditMode(true); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
              editMode
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white text-indigo-600 border-gray-200 hover:border-indigo-400"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {editMode
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              }
            </svg>
            {editMode ? "Cancelar" : "Personalizar"}
          </button>
        </div>
      </div>

      {/* Period selector */}
      <DateRangeFilter
        dateFrom={dateFrom} dateTo={dateTo} activeQuickRange={activeQuickRange}
        quickRanges={DASH_QUICK_RANGES} onQuickRange={handleDashQuickRange}
        onDateChange={handleDashDateChange} loading={loading}
      />

      {/* Edit mode banner */}
      {editMode && (
        <div className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium mb-5">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          Modo edicion — Quita, agrega o reordena widgets a tu gusto
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Cargando metricas...</p>
      ) : error ? (
        <p className="text-red-500">{error}</p>
      ) : (
        <>
          {/* Widget grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
            {activeWidgets.map((wId, idx) => {
              const def = WIDGET_MAP[wId];
              if (!def) return null;

              // Chart widgets render differently
              if (def.large) return null; // Rendered below in chart section

              const d = getWidgetData(wId, allData);
              const isDragging = dragIndex === idx;
              const isDragOver = dragOverIndex === idx && dragIndex !== idx;

              return (
                <div
                  key={wId}
                  draggable={editMode}
                  onDragStart={(e) => { setDragIndex(idx); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { if (editMode) { e.preventDefault(); setDragOverIndex(idx); } }}
                  onDrop={() => { if (dragIndex !== null) { reorderWidgets(dragIndex, idx); } setDragIndex(null); setDragOverIndex(null); }}
                  onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                  className={`bg-white rounded-xl shadow-sm p-4 border relative transition-all ${
                    editMode ? "border-dashed border-indigo-300 cursor-grab active:cursor-grabbing" : ""
                  } ${isDragging ? "opacity-40" : ""} ${isDragOver ? "border-solid border-indigo-500 ring-2 ring-indigo-200" : ""}`}
                >
                  {editMode && (
                    <button
                      onClick={() => removeWidget(wId)}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center shadow-md z-10 hover:bg-red-600"
                    >×</button>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded"
                        style={{ color: def.catColor, background: def.catColor + "15" }}
                      >{def.category}</span>
                    </div>
                    {d?.change !== undefined && <ChangeIndicator value={d.change} inverse={d.inverse} />}
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">{def.title}</p>
                  {d ? (
                    <>
                      <p className="text-xl font-bold text-gray-800 mt-1">{d.value}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{d.sub}</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-300 mt-2">Sin datos</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Cancelled orders info (from original dashboard) */}
          {allData.metrics?.summary?.cancelledOrders > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
              {allData.metrics.summary.cancelledOrders} ordenes canceladas ({formatARS(allData.metrics.summary.cancelledRevenue)}) excluidas del calculo de facturacion.
            </div>
          )}

          {/* Chart widgets */}
          {(() => {
            const chartWidgets = activeWidgets.filter(w => WIDGET_MAP[w]?.large);
            if (chartWidgets.length === 0) return null;
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {chartWidgets.map((cId, ci) => {
                  const cIdx = activeWidgets.indexOf(cId);
                  const cDef = WIDGET_MAP[cId];
                  const cDragging = dragIndex === cIdx;
                  const cDragOver = dragOverIndex === cIdx && dragIndex !== cIdx;
                  const chartClass = `bg-white rounded-xl shadow-sm p-6 border relative transition-all ${
                    editMode ? "border-dashed border-indigo-300 cursor-grab active:cursor-grabbing" : ""
                  } ${cDragging ? "opacity-40" : ""} ${cDragOver ? "border-solid border-indigo-500 ring-2 ring-indigo-200" : ""}`;

                  const dragProps = editMode ? {
                    draggable: true,
                    onDragStart: (e: React.DragEvent) => { setDragIndex(cIdx); e.dataTransfer.effectAllowed = "move"; },
                    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverIndex(cIdx); },
                    onDrop: () => { if (dragIndex !== null) reorderWidgets(dragIndex, cIdx); setDragIndex(null); setDragOverIndex(null); },
                    onDragEnd: () => { setDragIndex(null); setDragOverIndex(null); },
                  } : {};

                  return (
                    <div key={cId} className={chartClass} {...dragProps}>
                      {editMode && (
                        <button onClick={() => removeWidget(cId)}
                          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center shadow-md z-10">×</button>
                      )}
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded"
                          style={{ color: cDef.catColor, background: cDef.catColor + "15" }}>{cDef.category}</span>
                        <h3 className="font-semibold text-gray-700">{cDef.title}</h3>
                      </div>

                      {cId === "revenue-chart" && (
                        <ResponsiveContainer width="100%" height={260}>
                          <LineChart data={trends}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                            <YAxis tickFormatter={(v) => "$" + formatCompact(v)} tick={{ fontSize: 11 }} width={70} />
                            <Tooltip formatter={(value: number) => [formatARS(value), "Revenue"]} labelFormatter={formatDateShort} {...tooltipStyle} />
                            <Line type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={2} dot={false} name="Revenue" />
                          </LineChart>
                        </ResponsiveContainer>
                      )}

                      {cId === "spend-chart" && (
                        <ResponsiveContainer width="100%" height={260}>
                          <AreaChart data={trends}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                            <YAxis tickFormatter={(v) => "$" + formatCompact(v)} tick={{ fontSize: 11 }} width={70} />
                            <Tooltip formatter={(value: number, name: string) => [formatARS(value), name]} labelFormatter={formatDateShort} {...tooltipStyle} />
                            <Legend />
                            <Area type="monotone" dataKey="googleSpend" stackId="1" stroke="#4285f4" fill="#4285f4" fillOpacity={0.6} name="Google Ads" />
                            <Area type="monotone" dataKey="metaSpend" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} name="Meta Ads" />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Add widget button (edit mode) */}
          {editMode && (
            <button
              onClick={() => setCatalogOpen(true)}
              className="w-full border-2 border-dashed border-indigo-300 rounded-xl py-6 flex items-center justify-center gap-2 text-indigo-600 font-semibold text-sm hover:bg-indigo-50/50 transition-all mb-8"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Agregar Widget
            </button>
          )}

          {/* Insights panel (from original dashboard) */}
          <NitroInsightsPanel section="dashboard" />
        </>
      )}

      {/* ── Widget Catalog Modal ── */}
      {catalogOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end justify-center" onClick={() => setCatalogOpen(false)}>
          <div
            className="bg-white rounded-t-2xl w-full max-w-3xl max-h-[70vh] overflow-y-auto p-6 animate-in slide-in-from-bottom"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-lg font-bold text-gray-800">Agregar Widget</h3>
              <button onClick={() => setCatalogOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <p className="text-sm text-gray-400 mb-5">Elegi que datos queres ver en tu dashboard</p>

            {Array.from(new Set(WIDGET_CATALOG.map(w => w.category))).map(cat => {
              const items = WIDGET_CATALOG.filter(w => w.category === cat);
              const catColor = items[0]?.catColor || "#666";
              return (
                <div key={cat} className="mb-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: catColor }} />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{cat}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {items.map(w => {
                      const added = activeWidgets.includes(w.id);
                      return (
                        <button
                          key={w.id}
                          onClick={() => { if (!added) addWidget(w.id); }}
                          disabled={added}
                          className={`flex items-center justify-between px-3 py-2.5 border rounded-xl text-sm transition-all ${
                            added
                              ? "border-gray-200 bg-gray-50 text-gray-400 cursor-default"
                              : "border-gray-200 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50/50 cursor-pointer"
                          }`}
                        >
                          <span className="font-medium">{w.title}</span>
                          <span className={`text-lg font-bold ${added ? "text-gray-300" : "text-indigo-500"}`}>
                            {added ? "✓" : "+"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg z-50 animate-in fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
