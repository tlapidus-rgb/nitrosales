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
import { ArrowDownRight, ArrowUpRight, Check, Pencil, Plus, X, AlertTriangle, LayoutGrid } from "lucide-react";
import { formatARS, formatCompact, formatDateShort } from "@/lib/utils/format";
import { useAnimatedValue } from "@/lib/hooks/useAnimatedValue";
import { DateRangeFilter } from "@/components/dashboard";
import DashboardHero from "@/components/dashboard/DashboardHero";
import DashboardTodayBlock, { buildTodayInsights } from "@/components/dashboard/DashboardTodayBlock";
import DashboardChartCard from "@/components/dashboard/DashboardChartCard";
import DashboardSparkline from "@/components/dashboard/DashboardSparkline";
import DashboardStyles from "@/components/dashboard/DashboardStyles";
import WidgetFilterPopover from "@/components/dashboard/WidgetFilterPopover";
import WidgetFilterChips from "@/components/dashboard/WidgetFilterChips";
import { SectionKey, buildFilterQuery } from "@/lib/dashboard/filter-config";

// ── Widget catalog definition ──

type WidgetDef = {
  id: string;
  category: string;
  catColor: string;
  title: string;
  dataSource: string; // which API to call
  large?: boolean;    // span 2 columns (for charts)
  // ── Per-card filter system ──
  // section: defines the filter pool the widget inherits from
  // excludeFilters: opt-out de dimensiones del pool que no aplican
  section?: SectionKey;
  excludeFilters?: string[];
};

const WIDGET_CATALOG: WidgetDef[] = [
  // ── Ventas — pool: canal, estado_pedido, pago, categoria, tipo_cliente, provincia
  { id: "revenue", category: "Ventas", catColor: "#059669", title: "Facturacion", dataSource: "metrics", section: "ventas" },
  { id: "orders", category: "Ventas", catColor: "#059669", title: "Pedidos", dataSource: "metrics", section: "ventas" },
  { id: "ticket", category: "Ventas", catColor: "#059669", title: "Ticket Promedio", dataSource: "metrics", section: "ventas" },
  // Sessions vienen de GA4 — no aplica filtro de pedido/pago/cliente
  { id: "sessions", category: "Ventas", catColor: "#059669", title: "Sesiones", dataSource: "metrics", section: "ventas",
    excludeFilters: ["estado_pedido", "pago", "tipo_cliente", "categoria"] },
  // Conversion = pedidos/sesiones — estado del pedido no aplica
  { id: "conversion", category: "Ventas", catColor: "#059669", title: "Tasa Conversion", dataSource: "metrics", section: "ventas",
    excludeFilters: ["estado_pedido"] },
  { id: "revenue-chart", category: "Ventas", catColor: "#059669", title: "Facturacion Diaria", dataSource: "trends", large: true, section: "ventas" },

  // ── Marketing — pool: plataforma_ad, tipo_campana, objetivo, audiencia
  { id: "adspend", category: "Marketing", catColor: "#7c3aed", title: "Inversion Ads", dataSource: "metrics", section: "marketing" },
  { id: "roas", category: "Marketing", catColor: "#7c3aed", title: "ROAS", dataSource: "metrics", section: "marketing" },
  { id: "ctr", category: "Marketing", catColor: "#7c3aed", title: "CTR", dataSource: "metrics", section: "marketing" },
  { id: "cpc", category: "Marketing", catColor: "#7c3aed", title: "CPC", dataSource: "metrics", section: "marketing" },
  { id: "impressions-ads", category: "Marketing", catColor: "#7c3aed", title: "Impresiones Ads", dataSource: "metrics", section: "marketing" },
  { id: "clicks-ads", category: "Marketing", catColor: "#7c3aed", title: "Clicks Ads", dataSource: "metrics", section: "marketing" },
  { id: "spend-chart", category: "Marketing", catColor: "#7c3aed", title: "Inversion por Plataforma", dataSource: "trends", large: true, section: "marketing" },

  // ── SEO — pool: fuente_trafico, tipo_pagina, device, branded
  { id: "seo-clicks", category: "SEO", catColor: "#0284c7", title: "Clics Organicos", dataSource: "seo", section: "seo" },
  { id: "seo-impressions", category: "SEO", catColor: "#0284c7", title: "Impresiones SEO", dataSource: "seo", section: "seo" },
  { id: "seo-position", category: "SEO", catColor: "#0284c7", title: "Posicion Promedio", dataSource: "seo", section: "seo" },
  { id: "seo-ctr", category: "SEO", catColor: "#0284c7", title: "CTR Organico", dataSource: "seo", section: "seo" },
  { id: "seo-top10", category: "SEO", catColor: "#0284c7", title: "Keywords Top 10", dataSource: "seo", section: "seo" },

  // ── Clientes — pool: rfm, frecuencia, adquisicion, provincia
  // New customers son por definición nuevos → excluir frecuencia/rfm
  { id: "new-customers", category: "Clientes", catColor: "#d97706", title: "Clientes Nuevos", dataSource: "customers", section: "clientes",
    excludeFilters: ["rfm", "frecuencia"] },
  { id: "repeat-rate", category: "Clientes", catColor: "#d97706", title: "Tasa Recurrencia", dataSource: "customers", section: "clientes" },
  { id: "avg-spent", category: "Clientes", catColor: "#d97706", title: "Gasto Promedio", dataSource: "customers", section: "clientes" },

  // ── Finanzas — pool: tipo_costo, canal, categoria
  { id: "gross-margin", category: "Finanzas", catColor: "#db2777", title: "Margen Bruto", dataSource: "pnl", section: "finanzas",
    excludeFilters: ["tipo_costo"] },
  { id: "operating-profit", category: "Finanzas", catColor: "#db2777", title: "Ganancia Operativa", dataSource: "pnl", section: "finanzas" },

  // ── Productos — pool: categoria, marca, estado_stock, margen, canal
  { id: "low-stock", category: "Productos", catColor: "#16a34a", title: "Stock Bajo", dataSource: "products", section: "productos",
    excludeFilters: ["estado_stock"] }, // por definición ya filtra estado bajo
  { id: "dead-stock", category: "Productos", catColor: "#16a34a", title: "Dead Stock", dataSource: "products", section: "productos",
    excludeFilters: ["estado_stock"] },

  // ── NitroPixel — pool: pixel_fuente, device, identificado
  { id: "pixel-revenue", category: "NitroPixel", catColor: "#f59e0b", title: "Revenue Atribuido", dataSource: "pixel", section: "nitropixel" },
  { id: "pixel-roas", category: "NitroPixel", catColor: "#f59e0b", title: "ROAS Pixel", dataSource: "pixel", section: "nitropixel" },
  { id: "pixel-orders", category: "NitroPixel", catColor: "#f59e0b", title: "Ordenes Atribuidas", dataSource: "pixel", section: "nitropixel" },
  { id: "pixel-attribution", category: "NitroPixel", catColor: "#f59e0b", title: "Tasa Atribucion", dataSource: "pixel", section: "nitropixel" },
  { id: "pixel-visitors", category: "NitroPixel", catColor: "#f59e0b", title: "Visitantes", dataSource: "pixel", section: "nitropixel" },
  { id: "pixel-identified", category: "NitroPixel", catColor: "#f59e0b", title: "Identificados", dataSource: "pixel", section: "nitropixel" },
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
// Sparkline series extractor — given a widget id and trends data,
// returns the relevant numeric series. Empty array = no sparkline.
// ══════════════════════════════════════════════════════════════
function getSparklineSeries(id: string, trends: any[]): number[] {
  if (!trends || trends.length === 0) return [];
  const map: Record<string, (d: any) => number> = {
    revenue: (d) => Number(d.revenue) || 0,
    orders: (d) => Number(d.orders) || 0,
    ticket: (d) => {
      const r = Number(d.revenue) || 0;
      const o = Number(d.orders) || 0;
      return o > 0 ? r / o : 0;
    },
    sessions: (d) => Number(d.sessions) || 0,
    conversion: (d) => {
      const o = Number(d.orders) || 0;
      const s = Number(d.sessions) || 0;
      return s > 0 ? (o / s) * 100 : 0;
    },
    adspend: (d) => Number(d.adSpend) || 0,
    roas: (d) => Number(d.roas) || 0,
  };
  const fn = map[id];
  if (!fn) return [];
  return trends.map(fn);
}

// ══════════════════════════════════════════════════════════════
// KpiCardItem — single premium KPI card with count-up + sparkline
// ══════════════════════════════════════════════════════════════
interface KpiCardItemProps {
  def: WidgetDef;
  data: { value: string; sub: string; change?: number; inverse?: boolean } | null;
  sparkline: number[];
  editMode: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onRemove: () => void;
  dragHandlers: React.HTMLAttributes<HTMLDivElement>;
  // ── Per-card filter system ──
  filterValues: Record<string, string>;
  onFilterChange: (filterId: string, value: string) => void;
  onFilterClear: () => void;
}

function KpiCardItem({
  def,
  data,
  sparkline,
  editMode,
  isDragging,
  isDragOver,
  onRemove,
  dragHandlers,
  filterValues,
  onFilterChange,
  onFilterClear,
}: KpiCardItemProps) {
  const animatedValue = useAnimatedValue(data?.value ?? "", 1000);
  const hasDelta = data?.change !== undefined && data?.change !== null;
  const rawChange = data?.change ?? 0;
  const inverse = !!data?.inverse;
  // Color logic per bible: cyan positive, rose negative, slate neutral.
  // `inverse` flips the meaning (e.g. ad spend going up is bad).
  const isGoodPositive = inverse ? rawChange < 0 : rawChange > 0;
  const isNeutral = rawChange === 0;
  const deltaColor = isNeutral
    ? "text-slate-400"
    : isGoodPositive
      ? "text-cyan-600"
      : "text-rose-500";
  const DeltaIcon = rawChange > 0 ? ArrowUpRight : ArrowDownRight;

  const sparkColor = isNeutral || !hasDelta ? "#64748b" : isGoodPositive ? "#06b6d4" : "#f43f5e";

  return (
    <div
      {...dragHandlers}
      draggable={editMode}
      className={`dash-card p-5 relative ${editMode ? "cursor-grab active:cursor-grabbing" : ""} ${
        isDragging ? "opacity-40" : ""
      } ${isDragOver ? "ring-2 ring-indigo-300" : ""}`}
    >
      {editMode && (
        <button
          onClick={onRemove}
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md z-10 hover:bg-rose-600 transition-colors"
          aria-label="Quitar widget"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
      )}

      {/* Top: category + delta + filter trigger */}
      <div className="flex items-start justify-between mb-2 gap-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.18em] truncate"
          style={{ color: def.catColor }}
        >
          {def.category}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasDelta && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${deltaColor}`}>
              <DeltaIcon className="w-3 h-3" />
              {Math.abs(rawChange).toFixed(1)}%
            </span>
          )}
          <WidgetFilterPopover
            widgetId={def.id}
            section={def.section}
            excludeFilters={def.excludeFilters}
            values={filterValues}
            onChange={onFilterChange}
            onClear={onFilterClear}
          />
        </div>
      </div>

      {/* Title */}
      <p className="text-xs font-medium text-slate-500 mb-1">{def.title}</p>

      {/* Active filter chips (sólo si hay filtros aplicados) */}
      <WidgetFilterChips
        section={def.section}
        excludeFilters={def.excludeFilters}
        values={filterValues}
        onRemove={(id) => onFilterChange(id, "all")}
      />

      {/* Big number — count-up animated, tabular-nums */}
      {data ? (
        <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">
          {animatedValue}
        </p>
      ) : (
        <div className="h-7 w-24 dash-skeleton" />
      )}

      {/* Sparkline */}
      {sparkline.length > 1 && (
        <div className="mt-2 -mx-1">
          <DashboardSparkline data={sparkline} color={sparkColor} height={28} />
        </div>
      )}

      {/* Subtitle */}
      {data?.sub && (
        <p className="text-[11px] text-slate-400 mt-1.5 leading-tight">{data.sub}</p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Skeleton card — matches KpiCardItem layout for loading state
// ══════════════════════════════════════════════════════════════
function KpiCardSkeleton() {
  return (
    <div className="dash-card p-5">
      <div className="flex items-start justify-between mb-2">
        <div className="h-3 w-14 dash-skeleton" />
        <div className="h-3 w-10 dash-skeleton" />
      </div>
      <div className="h-3 w-20 dash-skeleton mb-2" />
      <div className="h-7 w-28 dash-skeleton mb-3" />
      <div className="h-7 w-full dash-skeleton mb-2" />
      <div className="h-2.5 w-24 dash-skeleton" />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Dashboard Component
// ══════════════════════════════════════════════════════════════

export default function DashboardPage() {
  const { data: session } = useSession();
  const orgName = (session?.user as any)?.organizationName || "Tu negocio";
  const [activeWidgets, setActiveWidgets] = useState<string[]>(DEFAULT_WIDGETS);
  // Per-widget filter values: { widgetId: { filterId: value } }
  const [widgetFilters, setWidgetFilters] = useState<Record<string, Record<string, string>>>({});
  // Per-widget data overrides — when a widget has wired filters active, its
  // data is fetched independently from the section default and stored here.
  // getWidgetData reads this override first, then falls back to allData.
  const [widgetDataOverrides, setWidgetDataOverrides] = useState<Record<string, any>>({});
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

  // ── Load preferences on mount (widgets + per-card filters) ──
  useEffect(() => {
    fetch("/api/dashboard/preferences")
      .then(r => r.json())
      .then(data => {
        if (data.widgets?.length > 0) setActiveWidgets(data.widgets);
        if (data.widgetFilters && typeof data.widgetFilters === "object") {
          setWidgetFilters(data.widgetFilters);
        }
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
    // Hero header + sparklines always need metrics + trends
    needed.add("metrics");
    needed.add("trends");
    // Today block insights necesitan products / customers / pnl para narrativa completa
    needed.add("products");
    needed.add("customers");
    needed.add("pnl");

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

  // ── Per-widget filtered data overrides ──
  // Each widget with wired filters fetches its own slice of data so its KPI
  // reflects the active filters without polluting other cards.
  useEffect(() => {
    const widgetIds = Object.keys(widgetFilters);
    if (widgetIds.length === 0) {
      setWidgetDataOverrides({});
      return;
    }
    let cancelled = false;
    (async () => {
      const next: Record<string, any> = {};
      await Promise.all(
        widgetIds.map(async (wId) => {
          const def = WIDGET_MAP[wId];
          if (!def) return;
          const baseUrl = DATA_SOURCES[def.dataSource];
          if (!baseUrl) return;
          const filterQuery = buildFilterQuery(
            def.section,
            def.excludeFilters,
            widgetFilters[wId] || {}
          );
          if (!filterQuery) return; // sólo unwired → skip, no override
          const sep = baseUrl.includes("?") ? "&" : "?";
          try {
            const r = await fetch(`${baseUrl}${sep}${periodQuery}&${filterQuery}`);
            if (!r.ok) return;
            next[wId] = await r.json();
          } catch {
            // silent
          }
        })
      );
      if (!cancelled) setWidgetDataOverrides(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [widgetFilters, periodQuery]);

  // ── Save preferences ──
  const savePreferences = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/dashboard/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets: activeWidgets, widgetFilters }),
      });
      showToast("Layout guardado correctamente");
      setEditMode(false);
    } catch {
      showToast("Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [activeWidgets, widgetFilters]);

  // ── Per-card filter handlers (autosave on change) ──
  const persistFilters = useCallback(
    async (next: Record<string, Record<string, string>>) => {
      try {
        await fetch("/api/dashboard/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widgets: activeWidgets, widgetFilters: next }),
        });
      } catch {
        // silent — el cambio queda en estado local igual
      }
    },
    [activeWidgets]
  );

  const updateWidgetFilter = useCallback(
    (widgetId: string, filterId: string, value: string) => {
      setWidgetFilters((prev) => {
        const current = { ...(prev[widgetId] || {}) };
        if (!value || value === "all") {
          delete current[filterId];
        } else {
          current[filterId] = value;
        }
        const next = { ...prev };
        if (Object.keys(current).length === 0) {
          delete next[widgetId];
        } else {
          next[widgetId] = current;
        }
        persistFilters(next);
        return next;
      });
    },
    [persistFilters]
  );

  const clearWidgetFilters = useCallback(
    (widgetId: string) => {
      setWidgetFilters((prev) => {
        if (!prev[widgetId]) return prev;
        const next = { ...prev };
        delete next[widgetId];
        persistFilters(next);
        return next;
      });
    },
    [persistFilters]
  );

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

  // ── Hero data (always available because we force-fetch metrics + trends) ──
  const heroMetrics = allData.metrics?.summary;
  const heroChanges = allData.metrics?.changes;

  // ── Today block insights ──
  const todayInsights = useMemo(
    () => buildTodayInsights(allData),
    [allData]
  );
  const todayLoading = loading && Object.keys(allData).length === 0;

  // ── Render ──
  return (
    <div className="light-canvas min-h-screen">
      <DashboardStyles />

      {/* Hero header — narrativa del día con auroras + prism delimiter */}
      <DashboardHero
        orgName={orgName}
        revenue={heroMetrics?.revenue ?? 0}
        revenueChange={heroChanges?.revenue}
        orders={heroMetrics?.orders ?? 0}
        roas={heroMetrics?.roas ?? 0}
        sessions={heroMetrics?.sessions ?? 0}
      />

      {/* Today block — insights narrativos generados desde la data */}
      <DashboardTodayBlock insights={todayInsights} loading={todayLoading} />

      {/* Toolbar — Personalizar / Guardar (slate-900 primary, lucide icons) */}
      <div className="flex items-center justify-end gap-2 mb-4">
        {editMode && (
          <button
            onClick={savePreferences}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            style={{ transitionDuration: "220ms", transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            <Check className="w-4 h-4" />
            {saving ? "Guardando..." : "Guardar layout"}
          </button>
        )}
        <button
          onClick={() => { if (editMode) { setEditMode(false); setCatalogOpen(false); } else setEditMode(true); }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
            editMode
              ? "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
          }`}
          style={{ transitionDuration: "220ms", transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          {editMode ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          {editMode ? "Cancelar" : "Personalizar"}
        </button>
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

      {error ? (
        <div className="dash-card p-4 mb-4 text-sm text-rose-600 border-rose-200">{error}</div>
      ) : null}

      {loading && Object.keys(allData).length === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <KpiCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {/* Widget grid — premium cards con count-up + sparkline + stagger entrance */}
          <div className="dash-stagger grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
            {activeWidgets.map((wId, idx) => {
              const def = WIDGET_MAP[wId];
              if (!def) return null;

              // Chart widgets render differently
              if (def.large) return null; // Rendered below in chart section

              // Si la card tiene filtros wired activos, usa su override.
              const overrideForWidget = widgetDataOverrides[wId];
              const dataForWidget = overrideForWidget
                ? { ...allData, [def.dataSource]: overrideForWidget }
                : allData;
              const d = getWidgetData(wId, dataForWidget);
              const sparkline = getSparklineSeries(wId, allData.trends?.days || []);
              const isDragging = dragIndex === idx;
              const isDragOver = dragOverIndex === idx && dragIndex !== idx;

              const dragHandlers = {
                onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
                  setDragIndex(idx);
                  e.dataTransfer.effectAllowed = "move";
                },
                onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
                  if (editMode) {
                    e.preventDefault();
                    setDragOverIndex(idx);
                  }
                },
                onDrop: () => {
                  if (dragIndex !== null) reorderWidgets(dragIndex, idx);
                  setDragIndex(null);
                  setDragOverIndex(null);
                },
                onDragEnd: () => {
                  setDragIndex(null);
                  setDragOverIndex(null);
                },
              };

              return (
                <KpiCardItem
                  key={wId}
                  def={def}
                  data={d}
                  sparkline={sparkline}
                  editMode={editMode}
                  isDragging={isDragging}
                  isDragOver={isDragOver}
                  onRemove={() => removeWidget(wId)}
                  dragHandlers={dragHandlers}
                  filterValues={widgetFilters[wId] || {}}
                  onFilterChange={(filterId, value) => updateWidgetFilter(wId, filterId, value)}
                  onFilterClear={() => clearWidgetFilters(wId)}
                />
              );
            })}
          </div>

          {/* Cancelled orders info — restyled como warning callout discreto */}
          {allData.metrics?.summary?.cancelledOrders > 0 && (
            <div
              className="flex items-start gap-3 px-4 py-3 mb-5 rounded-xl border border-amber-200/70 bg-amber-50/50 text-[13px] text-amber-900"
              style={{ boxShadow: "0 1px 0 rgba(180, 83, 9, 0.06), 0 4px 12px -6px rgba(180, 83, 9, 0.10)" }}
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong className="font-semibold tabular-nums">{allData.metrics.summary.cancelledOrders}</strong> órdenes canceladas
                <span className="text-amber-700"> ({formatARS(allData.metrics.summary.cancelledRevenue)})</span> excluidas del cálculo de facturación.
              </span>
            </div>
          )}

          {/* Chart widgets — premium con gradientes, axis sutil y tooltip backdrop */}
          {(() => {
            const chartWidgets = activeWidgets.filter(w => WIDGET_MAP[w]?.large);
            if (chartWidgets.length === 0) return null;
            return (
              <div className="dash-stagger grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {chartWidgets.map((cId) => {
                  const cIdx = activeWidgets.indexOf(cId);
                  const cDef = WIDGET_MAP[cId];
                  const cDragging = dragIndex === cIdx;
                  const cDragOver = dragOverIndex === cIdx && dragIndex !== cIdx;

                  const dragProps = editMode ? {
                    draggable: true,
                    onDragStart: (e: React.DragEvent) => { setDragIndex(cIdx); e.dataTransfer.effectAllowed = "move"; },
                    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverIndex(cIdx); },
                    onDrop: () => { if (dragIndex !== null) reorderWidgets(dragIndex, cIdx); setDragIndex(null); setDragOverIndex(null); },
                    onDragEnd: () => { setDragIndex(null); setDragOverIndex(null); },
                  } : {};

                  return (
                    <DashboardChartCard
                      key={cId}
                      category={cDef.category}
                      categoryColor={cDef.catColor}
                      title={cDef.title}
                      subtitle={cId === "revenue-chart" ? "Evolución diaria" : cId === "spend-chart" ? "Google + Meta acumulado" : undefined}
                      editMode={editMode}
                      isDragging={cDragging}
                      isDragOver={cDragOver}
                      onRemove={() => removeWidget(cId)}
                      dragProps={dragProps}
                      headerRight={
                        <WidgetFilterPopover
                          widgetId={cDef.id}
                          section={cDef.section}
                          excludeFilters={cDef.excludeFilters}
                          values={widgetFilters[cId] || {}}
                          onChange={(filterId, value) => updateWidgetFilter(cId, filterId, value)}
                          onClear={() => clearWidgetFilters(cId)}
                        />
                      }
                      filterChips={
                        <WidgetFilterChips
                          section={cDef.section}
                          excludeFilters={cDef.excludeFilters}
                          values={widgetFilters[cId] || {}}
                          onRemove={(id) => updateWidgetFilter(cId, id, "all")}
                        />
                      }
                    >
                      {cId === "revenue-chart" && (
                        <ResponsiveContainer width="100%" height={260}>
                          <AreaChart data={trends} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                            <defs>
                              <linearGradient id="dashRevenueFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.32} />
                                <stop offset="60%" stopColor="#06b6d4" stopOpacity={0.08} />
                                <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="dashRevenueStroke" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#06b6d4" />
                                <stop offset="100%" stopColor="#8b5cf6" />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} />
                            <XAxis dataKey="date" tickFormatter={formatDateShort} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                            <YAxis tickFormatter={(v) => "$" + formatCompact(v)} tickLine={false} axisLine={false} width={62} />
                            <Tooltip formatter={(value: number) => [formatARS(value), "Revenue"]} labelFormatter={formatDateShort} cursor={{ stroke: "rgba(15,23,42,0.12)", strokeWidth: 1, strokeDasharray: "4 4" }} />
                            <Area
                              type="monotone"
                              dataKey="revenue"
                              stroke="url(#dashRevenueStroke)"
                              strokeWidth={2.5}
                              fill="url(#dashRevenueFill)"
                              activeDot={{ r: 5, strokeWidth: 2, stroke: "#ffffff", fill: "#06b6d4" }}
                              name="Revenue"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}

                      {cId === "spend-chart" && (
                        <ResponsiveContainer width="100%" height={260}>
                          <AreaChart data={trends} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                            <defs>
                              <linearGradient id="dashGoogleFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.42} />
                                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.04} />
                              </linearGradient>
                              <linearGradient id="dashMetaFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.42} />
                                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.04} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} />
                            <XAxis dataKey="date" tickFormatter={formatDateShort} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                            <YAxis tickFormatter={(v) => "$" + formatCompact(v)} tickLine={false} axisLine={false} width={62} />
                            <Tooltip formatter={(value: number, name: string) => [formatARS(value), name]} labelFormatter={formatDateShort} cursor={{ stroke: "rgba(15,23,42,0.12)", strokeWidth: 1, strokeDasharray: "4 4" }} />
                            <Legend iconType="circle" wrapperStyle={{ paddingTop: 8 }} />
                            <Area
                              type="monotone"
                              dataKey="googleSpend"
                              stackId="1"
                              stroke="#6366f1"
                              strokeWidth={2}
                              fill="url(#dashGoogleFill)"
                              name="Google Ads"
                              activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff", fill: "#6366f1" }}
                            />
                            <Area
                              type="monotone"
                              dataKey="metaSpend"
                              stackId="1"
                              stroke="#8b5cf6"
                              strokeWidth={2}
                              fill="url(#dashMetaFill)"
                              name="Meta Ads"
                              activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff", fill: "#8b5cf6" }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </DashboardChartCard>
                  );
                })}
              </div>
            );
          })()}

          {/* Add widget button (edit mode) */}
          {editMode && (
            <button
              onClick={() => setCatalogOpen(true)}
              className="dash-add-slot w-full py-6 flex items-center justify-center gap-2 text-slate-600 hover:text-slate-900 font-semibold text-sm mb-8"
            >
              <Plus className="w-4 h-4" />
              Agregar widget
            </button>
          )}

        </>
      )}

      {/* ── Widget Catalog Modal — sheet premium ── */}
      {catalogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          style={{
            background: "rgba(15, 23, 42, 0.42)",
            backdropFilter: "saturate(140%) blur(8px)",
            WebkitBackdropFilter: "saturate(140%) blur(8px)",
          }}
          onClick={() => setCatalogOpen(false)}
        >
          <div
            className="dash-sheet dash-sheet--centered w-full max-w-3xl max-h-[85vh] overflow-y-auto p-6 sm:p-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-1">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <LayoutGrid className="w-[18px] h-[18px]" />
                </div>
                <div>
                  <h3 className="text-[17px] font-semibold tracking-tight text-slate-900">Agregar widget</h3>
                  <p className="text-[12px] text-slate-500">Elegí qué datos querés ver en tu dashboard</p>
                </div>
              </div>
              <button
                onClick={() => setCatalogOpen(false)}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors"
                style={{ transitionDuration: "200ms", transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              {Array.from(new Set(WIDGET_CATALOG.map(w => w.category))).map(cat => {
                const items = WIDGET_CATALOG.filter(w => w.category === cat);
                const catColor = items[0]?.catColor || "#64748b";
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: catColor, boxShadow: `0 0 0 3px ${catColor}22` }}
                      />
                      <span
                        className="text-[10px] font-semibold tracking-[0.18em] uppercase"
                        style={{ color: catColor }}
                      >
                        {cat}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {items.map(w => {
                        const added = activeWidgets.includes(w.id);
                        return (
                          <button
                            key={w.id}
                            onClick={() => { if (!added) addWidget(w.id); }}
                            disabled={added}
                            className={`flex items-center justify-between px-3.5 py-2.5 border rounded-xl text-[13px] ${
                              added
                                ? "border-slate-200/70 bg-slate-50 text-slate-400 cursor-default"
                                : "border-slate-200 text-slate-700 hover:border-slate-900 hover:bg-slate-50 cursor-pointer hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_4px_12px_-6px_rgba(15,23,42,0.10)]"
                            }`}
                            style={{
                              transitionProperty: "border-color, background-color, color, box-shadow",
                              transitionDuration: "220ms",
                              transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                            }}
                          >
                            <span className="font-medium tracking-tight truncate">{w.title}</span>
                            {added ? (
                              <Check className="w-4 h-4 text-slate-300 shrink-0 ml-2" />
                            ) : (
                              <Plus className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Toast premium */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="dash-toast flex items-center gap-2">
            <Check className="w-4 h-4 text-cyan-400" />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
