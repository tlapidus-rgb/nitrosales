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
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Check, Pencil, Plus, X, AlertTriangle, LayoutGrid } from "lucide-react";
import { formatARS, formatCompact, formatDateShort } from "@/lib/utils/format";
import { DateRangeFilter } from "@/components/dashboard";
import DashboardHero from "@/components/dashboard/DashboardHero";
import DashboardTodayBlock, { buildTodayInsights } from "@/components/dashboard/DashboardTodayBlock";
import DashboardChartCard from "@/components/dashboard/DashboardChartCard";
import DashboardStyles from "@/components/dashboard/DashboardStyles";
import WidgetFilterPopover from "@/components/dashboard/WidgetFilterPopover";
import WidgetFilterChips from "@/components/dashboard/WidgetFilterChips";
import { SectionKey, buildFilterQuery } from "@/lib/dashboard/filter-config";
import {
  FormatId,
  FORMAT_REGISTRY,
  WidgetInstance,
  hydrateWidgetList,
  formatGridClass,
} from "@/lib/dashboard/format-config";
import {
  FormatKpi,
  FormatBigNumber,
  FormatSparkline,
  FormatMiniLine,
  FormatMiniBar,
  FormatDonut,
  FormatList,
  KpiData,
  SeriesPoint,
  DistributionItem,
  ListItem,
} from "@/components/dashboard/WidgetFormats";

// ── Widget catalog definition ──

type WidgetDef = {
  id: string;
  category: string;
  catColor: string;
  title: string;
  dataSource: string; // which API to call (puede ser "metrics", "top:products", "dist:canal", etc.)
  large?: boolean;    // span 2 columns (legacy chart cards — area-full)
  // ── Per-card filter system ──
  section?: SectionKey;
  excludeFilters?: string[];
  // ── Format system ──
  // Lista de formatos compatibles con este widget. El usuario elige
  // uno al agregarlo. Si solo hay uno, se selecciona automáticamente.
  supportedFormats: FormatId[];
  defaultFormat: FormatId;
};

// Numeric KPIs son compatibles con todos los formatos numéricos
const NUMERIC_FORMATS: FormatId[] = [
  "kpi", "big-number", "sparkline", "mini-line", "mini-bar",
];

const WIDGET_CATALOG: WidgetDef[] = [
  // ══════════════════ Ventas ══════════════════
  { id: "revenue", category: "Ventas", catColor: "#059669", title: "Facturacion", dataSource: "metrics", section: "ventas",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "orders", category: "Ventas", catColor: "#059669", title: "Pedidos", dataSource: "metrics", section: "ventas",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "ticket", category: "Ventas", catColor: "#059669", title: "Ticket Promedio", dataSource: "metrics", section: "ventas",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "sessions", category: "Ventas", catColor: "#059669", title: "Sesiones", dataSource: "metrics", section: "ventas",
    excludeFilters: ["estado_pedido", "pago", "tipo_cliente", "categoria"],
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "conversion", category: "Ventas", catColor: "#059669", title: "Tasa Conversion", dataSource: "metrics", section: "ventas",
    excludeFilters: ["estado_pedido"],
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "revenue-chart", category: "Ventas", catColor: "#059669", title: "Facturacion Diaria", dataSource: "trends", large: true, section: "ventas",
    supportedFormats: ["area-full"], defaultFormat: "area-full" },
  // Nuevos widgets de Ventas — top y distribuciones
  { id: "top-products", category: "Ventas", catColor: "#059669", title: "Top Productos", dataSource: "top:products", section: "ventas",
    supportedFormats: ["list"], defaultFormat: "list" },
  { id: "top-categories", category: "Ventas", catColor: "#059669", title: "Top Categorias", dataSource: "top:categories", section: "ventas",
    supportedFormats: ["list", "donut"], defaultFormat: "donut" },
  { id: "top-brands", category: "Ventas", catColor: "#059669", title: "Top Marcas", dataSource: "top:brands", section: "ventas",
    supportedFormats: ["list", "donut"], defaultFormat: "list" },
  { id: "dist-canal", category: "Ventas", catColor: "#059669", title: "Distribucion por Canal", dataSource: "dist:canal", section: "ventas",
    supportedFormats: ["donut"], defaultFormat: "donut" },
  { id: "dist-estado", category: "Ventas", catColor: "#059669", title: "Distribucion por Estado", dataSource: "dist:estado", section: "ventas",
    supportedFormats: ["donut"], defaultFormat: "donut" },
  { id: "dist-device", category: "Ventas", catColor: "#059669", title: "Distribucion por Dispositivo", dataSource: "dist:device", section: "ventas",
    supportedFormats: ["donut"], defaultFormat: "donut" },

  // ══════════════════ Marketing ══════════════════
  { id: "adspend", category: "Marketing", catColor: "#7c3aed", title: "Inversion Ads", dataSource: "metrics", section: "marketing",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "roas", category: "Marketing", catColor: "#7c3aed", title: "ROAS", dataSource: "metrics", section: "marketing",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "ctr", category: "Marketing", catColor: "#7c3aed", title: "CTR", dataSource: "metrics", section: "marketing",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "cpc", category: "Marketing", catColor: "#7c3aed", title: "CPC", dataSource: "metrics", section: "marketing",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "impressions-ads", category: "Marketing", catColor: "#7c3aed", title: "Impresiones Ads", dataSource: "metrics", section: "marketing",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "clicks-ads", category: "Marketing", catColor: "#7c3aed", title: "Clicks Ads", dataSource: "metrics", section: "marketing",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "spend-chart", category: "Marketing", catColor: "#7c3aed", title: "Inversion por Plataforma", dataSource: "trends", large: true, section: "marketing",
    supportedFormats: ["area-full"], defaultFormat: "area-full" },
  // Nuevos widgets de Marketing
  { id: "top-campaigns", category: "Marketing", catColor: "#7c3aed", title: "Top Campañas (ROAS)", dataSource: "top:campaigns", section: "marketing",
    supportedFormats: ["list"], defaultFormat: "list" },
  { id: "dist-platform", category: "Marketing", catColor: "#7c3aed", title: "Distribucion Spend Plataforma", dataSource: "dist:platform", section: "marketing",
    supportedFormats: ["donut"], defaultFormat: "donut" },

  // ══════════════════ SEO ══════════════════
  { id: "seo-clicks", category: "SEO", catColor: "#0284c7", title: "Clics Organicos", dataSource: "seo", section: "seo",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "seo-impressions", category: "SEO", catColor: "#0284c7", title: "Impresiones SEO", dataSource: "seo", section: "seo",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "seo-position", category: "SEO", catColor: "#0284c7", title: "Posicion Promedio", dataSource: "seo", section: "seo",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "seo-ctr", category: "SEO", catColor: "#0284c7", title: "CTR Organico", dataSource: "seo", section: "seo",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "seo-top10", category: "SEO", catColor: "#0284c7", title: "Keywords Top 10", dataSource: "seo", section: "seo",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },

  // ══════════════════ Clientes ══════════════════
  { id: "new-customers", category: "Clientes", catColor: "#d97706", title: "Clientes Nuevos", dataSource: "customers", section: "clientes",
    excludeFilters: ["rfm", "frecuencia"],
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "repeat-rate", category: "Clientes", catColor: "#d97706", title: "Tasa Recurrencia", dataSource: "customers", section: "clientes",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "avg-spent", category: "Clientes", catColor: "#d97706", title: "Gasto Promedio", dataSource: "customers", section: "clientes",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  // Nuevo: top clientes
  { id: "top-customers", category: "Clientes", catColor: "#d97706", title: "Top Clientes (Revenue)", dataSource: "top:customers", section: "clientes",
    supportedFormats: ["list"], defaultFormat: "list" },

  // ══════════════════ Finanzas ══════════════════
  { id: "gross-margin", category: "Finanzas", catColor: "#db2777", title: "Margen Bruto", dataSource: "pnl", section: "finanzas",
    excludeFilters: ["tipo_costo"],
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "operating-profit", category: "Finanzas", catColor: "#db2777", title: "Ganancia Operativa", dataSource: "pnl", section: "finanzas",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },

  // ══════════════════ Productos ══════════════════
  { id: "low-stock", category: "Productos", catColor: "#16a34a", title: "Stock Bajo", dataSource: "products", section: "productos",
    excludeFilters: ["estado_stock"],
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "dead-stock", category: "Productos", catColor: "#16a34a", title: "Dead Stock", dataSource: "products", section: "productos",
    excludeFilters: ["estado_stock"],
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },

  // ══════════════════ NitroPixel ══════════════════
  { id: "pixel-revenue", category: "NitroPixel", catColor: "#f59e0b", title: "Revenue Atribuido", dataSource: "pixel", section: "nitropixel",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "pixel-roas", category: "NitroPixel", catColor: "#f59e0b", title: "ROAS Pixel", dataSource: "pixel", section: "nitropixel",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "pixel-orders", category: "NitroPixel", catColor: "#f59e0b", title: "Ordenes Atribuidas", dataSource: "pixel", section: "nitropixel",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "pixel-attribution", category: "NitroPixel", catColor: "#f59e0b", title: "Tasa Atribucion", dataSource: "pixel", section: "nitropixel",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "pixel-visitors", category: "NitroPixel", catColor: "#f59e0b", title: "Visitantes", dataSource: "pixel", section: "nitropixel",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  { id: "pixel-identified", category: "NitroPixel", catColor: "#f59e0b", title: "Identificados", dataSource: "pixel", section: "nitropixel",
    supportedFormats: NUMERIC_FORMATS, defaultFormat: "kpi" },
  // Nuevo: top fuentes de tráfico atribuidas
  { id: "top-sources", category: "NitroPixel", catColor: "#f59e0b", title: "Top Fuentes Trafico", dataSource: "top:sources", section: "nitropixel",
    supportedFormats: ["list", "donut"], defaultFormat: "list" },
];

// Default widgets for first-time users (instancias completas con su default format)
const DEFAULT_WIDGET_INSTANCES: WidgetInstance[] = [
  { id: "revenue", format: "kpi" },
  { id: "orders", format: "kpi" },
  { id: "ticket", format: "kpi" },
  { id: "sessions", format: "kpi" },
  { id: "adspend", format: "kpi" },
  { id: "roas", format: "kpi" },
  { id: "ctr", format: "kpi" },
  { id: "cpc", format: "kpi" },
  { id: "conversion", format: "kpi" },
  { id: "revenue-chart", format: "area-full" },
  { id: "spend-chart", format: "area-full" },
];

const WIDGET_MAP = Object.fromEntries(WIDGET_CATALOG.map(w => [w.id, w]));

// Helper para resolver default format de un widget id (para hidratación legacy)
const lookupDefaultFormat = (id: string): FormatId =>
  WIDGET_MAP[id]?.defaultFormat || "kpi";

// ── Data source URLs ──
// Las claves "section default" son fetch compartido (todas las cards de una
// sección que no tienen filtros específicos comparten el resultado).
// Las claves "top:*" y "dist:*" son por-widget — cada widget hace su propio
// fetch porque el `dim` cambia.
const DATA_SOURCES: Record<string, string> = {
  metrics: "/api/metrics",
  trends: "/api/metrics/trends",
  seo: "/api/metrics/seo",
  customers: "/api/metrics/customers",
  pnl: "/api/metrics/pnl",
  products: "/api/metrics/products",
  pixel: "/api/metrics/pixel",
};

// Resolves a widget's dataSource to a base URL.
// Soporta los pseudo-sources "top:<dim>" y "dist:<dim>".
function resolveDataUrl(dataSource: string): string | null {
  if (DATA_SOURCES[dataSource]) return DATA_SOURCES[dataSource];
  if (dataSource.startsWith("top:")) {
    const dim = dataSource.slice(4);
    return `/api/metrics/top?dim=${encodeURIComponent(dim)}`;
  }
  if (dataSource.startsWith("dist:")) {
    const dim = dataSource.slice(5);
    return `/api/metrics/distribution?dim=${encodeURIComponent(dim)}`;
  }
  return null;
}

// Devuelve true si un dataSource es un fetch por-widget (necesita fetch
// individual por cada instancia, no compartido por sección).
function isPerWidgetSource(dataSource: string): boolean {
  return dataSource.startsWith("top:") || dataSource.startsWith("dist:");
}

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
  const [activeWidgets, setActiveWidgets] = useState<WidgetInstance[]>(DEFAULT_WIDGET_INSTANCES);
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
        if (Array.isArray(data.widgets) && data.widgets.length > 0) {
          // Hidrata legacy strings → instancias con default format
          const hydrated = hydrateWidgetList(data.widgets, lookupDefaultFormat)
            .filter((inst) => WIDGET_MAP[inst.id]); // descarta IDs que ya no existen
          if (hydrated.length > 0) setActiveWidgets(hydrated);
        }
        if (data.widgetFilters && typeof data.widgetFilters === "object") {
          setWidgetFilters(data.widgetFilters);
        }
      })
      .catch(() => {}); // Use defaults on error
  }, []);

  // ── Fetch data based on active widgets + period ──
  // Section sources (metrics, trends, etc.) son fetch único compartido.
  // Per-widget sources (top:*, dist:*) son fetch individual por widget,
  // se almacenan bajo `perWidgetData[widgetId]`.
  const [perWidgetData, setPerWidgetData] = useState<Record<string, any>>({});

  useEffect(() => {
    setLoading(true);
    setError("");

    // 1) Section-level sources (compartidos)
    const sectionNeeded = new Set<string>();
    for (const inst of activeWidgets) {
      const w = WIDGET_MAP[inst.id];
      if (w && !isPerWidgetSource(w.dataSource)) sectionNeeded.add(w.dataSource);
    }
    sectionNeeded.add("metrics");
    sectionNeeded.add("trends");
    sectionNeeded.add("products");
    sectionNeeded.add("customers");
    sectionNeeded.add("pnl");

    const sectionFetches: Record<string, Promise<any>> = {};
    for (const src of sectionNeeded) {
      const baseUrl = DATA_SOURCES[src];
      if (baseUrl) {
        const sep = baseUrl.includes("?") ? "&" : "?";
        sectionFetches[src] = fetch(`${baseUrl}${sep}${periodQuery}`)
          .then(r => r.json())
          .catch(() => null);
      }
    }

    // 2) Per-widget sources (top:*, dist:*) — fetch por instancia
    const perWidgetFetches: Record<string, Promise<any>> = {};
    for (const inst of activeWidgets) {
      const w = WIDGET_MAP[inst.id];
      if (!w || !isPerWidgetSource(w.dataSource)) continue;
      const baseUrl = resolveDataUrl(w.dataSource);
      if (!baseUrl) continue;
      const sep = baseUrl.includes("?") ? "&" : "?";
      perWidgetFetches[inst.id] = fetch(`${baseUrl}${sep}${periodQuery}`)
        .then(r => r.json())
        .catch(() => null);
    }

    const sectionKeys = Object.keys(sectionFetches);
    const widgetKeys = Object.keys(perWidgetFetches);
    Promise.all([
      ...Object.values(sectionFetches),
      ...Object.values(perWidgetFetches),
    ])
      .then(results => {
        const sectionData: Record<string, any> = {};
        sectionKeys.forEach((k, i) => { sectionData[k] = results[i]; });
        setAllData(sectionData);
        const widgetData: Record<string, any> = {};
        widgetKeys.forEach((k, i) => {
          widgetData[k] = results[sectionKeys.length + i];
        });
        setPerWidgetData(widgetData);
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
          const baseUrl = resolveDataUrl(def.dataSource);
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

  const removeWidgetAt = (idx: number) => {
    setActiveWidgets(prev => prev.filter((_, i) => i !== idx));
    showToast("Widget removido");
  };

  const addWidget = (id: string, format: FormatId) => {
    setActiveWidgets(prev => [...prev, { id, format }]);
    showToast("Widget agregado");
  };

  // Helper para chequear si una combinación id+format ya está activa
  const isInstanceActive = (id: string, format: FormatId) =>
    activeWidgets.some((w) => w.id === id && w.format === format);

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

          {/* ── Unified widget grid: dispatcher por formato ── */}
          <div className="dash-stagger grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 auto-rows-auto gap-4 mb-8">
            {activeWidgets.map((inst, idx) => {
              const def = WIDGET_MAP[inst.id];
              if (!def) return null;

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

              const baseProps = {
                category: def.category,
                categoryColor: def.catColor,
                title: def.title,
                editMode,
                isDragging,
                isDragOver,
                onRemove: () => removeWidgetAt(idx),
                dragHandlers,
                draggable: true,
                headerRight: (
                  <WidgetFilterPopover
                    widgetId={def.id}
                    section={def.section}
                    excludeFilters={def.excludeFilters}
                    values={widgetFilters[inst.id] || {}}
                    onChange={(filterId, value) => updateWidgetFilter(inst.id, filterId, value)}
                    onClear={() => clearWidgetFilters(inst.id)}
                  />
                ),
                filterChips: (
                  <WidgetFilterChips
                    section={def.section}
                    excludeFilters={def.excludeFilters}
                    values={widgetFilters[inst.id] || {}}
                    onRemove={(id) => updateWidgetFilter(inst.id, id, "all")}
                  />
                ),
              };

              const gridClass = formatGridClass(inst.format);
              const instanceKey = `${inst.id}__${inst.format}__${idx}`;
              const trendDays = allData.trends?.days || [];

              // Numeric formats: usan getWidgetData / getSparklineSeries
              if (
                inst.format === "kpi" ||
                inst.format === "big-number" ||
                inst.format === "sparkline" ||
                inst.format === "mini-line" ||
                inst.format === "mini-bar"
              ) {
                const overrideForWidget = widgetDataOverrides[inst.id];
                const dataForWidget = overrideForWidget
                  ? { ...allData, [def.dataSource]: overrideForWidget }
                  : allData;
                const d = getWidgetData(inst.id, dataForWidget);
                const sparkline = getSparklineSeries(inst.id, trendDays);

                if (inst.format === "kpi") {
                  return (
                    <div key={instanceKey} className={gridClass}>
                      <FormatKpi {...baseProps} data={d} sparkline={sparkline} />
                    </div>
                  );
                }
                if (inst.format === "big-number") {
                  return (
                    <div key={instanceKey} className={gridClass}>
                      <FormatBigNumber {...baseProps} data={d} sparkline={sparkline} />
                    </div>
                  );
                }
                if (inst.format === "sparkline") {
                  return (
                    <div key={instanceKey} className={gridClass}>
                      <FormatSparkline {...baseProps} data={d} sparkline={sparkline} />
                    </div>
                  );
                }
                // mini-line / mini-bar: convertir sparkline a series con fechas
                const series: SeriesPoint[] = trendDays.map((day: any, i: number) => ({
                  date: day.date,
                  value: sparkline[i] ?? 0,
                }));
                if (inst.format === "mini-line") {
                  return (
                    <div key={instanceKey} className={gridClass}>
                      <FormatMiniLine
                        {...baseProps}
                        series={series}
                        color={def.catColor}
                        valueFormatter={(v) => formatCompact(v)}
                      />
                    </div>
                  );
                }
                return (
                  <div key={instanceKey} className={gridClass}>
                    <FormatMiniBar
                      {...baseProps}
                      series={series}
                      color={def.catColor}
                      valueFormatter={(v) => formatCompact(v)}
                    />
                  </div>
                );
              }

              // List format (top:*)
              if (inst.format === "list") {
                const resp = widgetDataOverrides[inst.id] || perWidgetData[inst.id];
                const items: ListItem[] = (resp?.items as ListItem[]) || [];
                const isCampaigns = def.dataSource === "top:campaigns";
                return (
                  <div key={instanceKey} className={gridClass}>
                    <FormatList
                      {...baseProps}
                      items={items}
                      accent={def.catColor}
                      valueFormatter={isCampaigns ? (v) => `${v.toFixed(2)}x` : (v) => formatARS(v)}
                      secondaryFormatter={
                        isCampaigns
                          ? (v) => `Spend: ${formatARS(v)}`
                          : (v) => `${v} u.`
                      }
                    />
                  </div>
                );
              }

              // Donut format (dist:* or top:* with donut chosen)
              if (inst.format === "donut") {
                const resp = widgetDataOverrides[inst.id] || perWidgetData[inst.id];
                const items: DistributionItem[] =
                  (resp?.slices as DistributionItem[]) ||
                  (resp?.items as DistributionItem[]) ||
                  [];
                return (
                  <div key={instanceKey} className={gridClass}>
                    <FormatDonut
                      {...baseProps}
                      items={items}
                      valueFormatter={(v) => formatARS(v)}
                    />
                  </div>
                );
              }

              // area-full / bar-full: legacy chart cards
              if (inst.format === "area-full" || inst.format === "bar-full") {
                const dragProps = editMode ? {
                  draggable: true,
                  onDragStart: (e: React.DragEvent) => { setDragIndex(idx); e.dataTransfer.effectAllowed = "move"; },
                  onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverIndex(idx); },
                  onDrop: () => { if (dragIndex !== null) reorderWidgets(dragIndex, idx); setDragIndex(null); setDragOverIndex(null); },
                  onDragEnd: () => { setDragIndex(null); setDragOverIndex(null); },
                } : {};

                return (
                  <div key={instanceKey} className={gridClass}>
                    <DashboardChartCard
                      category={def.category}
                      categoryColor={def.catColor}
                      title={def.title}
                      subtitle={inst.id === "revenue-chart" ? "Evolución diaria" : inst.id === "spend-chart" ? "Google + Meta acumulado" : undefined}
                      editMode={editMode}
                      isDragging={isDragging}
                      isDragOver={isDragOver}
                      onRemove={() => removeWidgetAt(idx)}
                      dragProps={dragProps}
                      headerRight={
                        <WidgetFilterPopover
                          widgetId={def.id}
                          section={def.section}
                          excludeFilters={def.excludeFilters}
                          values={widgetFilters[inst.id] || {}}
                          onChange={(filterId, value) => updateWidgetFilter(inst.id, filterId, value)}
                          onClear={() => clearWidgetFilters(inst.id)}
                        />
                      }
                      filterChips={
                        <WidgetFilterChips
                          section={def.section}
                          excludeFilters={def.excludeFilters}
                          values={widgetFilters[inst.id] || {}}
                          onRemove={(id) => updateWidgetFilter(inst.id, id, "all")}
                        />
                      }
                    >
                      {inst.id === "revenue-chart" && (
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

                      {inst.id === "spend-chart" && (
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
                  </div>
                );
              }

              return null;
            })}
          </div>

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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {items.map(w => {
                        return (
                          <div
                            key={w.id}
                            className="flex flex-col gap-2 px-3.5 py-3 border border-slate-200 rounded-xl bg-white"
                            style={{
                              boxShadow: "0 1px 0 rgba(15,23,42,0.03)",
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium tracking-tight text-[13px] text-slate-800 truncate">{w.title}</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {w.supportedFormats.map(fmt => {
                                const fdef = FORMAT_REGISTRY[fmt];
                                const isActive = isInstanceActive(w.id, fmt);
                                const isDefault = fmt === w.defaultFormat;
                                return (
                                  <button
                                    key={fmt}
                                    onClick={() => { if (!isActive) addWidget(w.id, fmt); }}
                                    disabled={isActive}
                                    title={fdef.description + (isDefault ? " (Recomendado)" : "")}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border ${
                                      isActive
                                        ? "border-slate-200/70 bg-slate-50 text-slate-400 cursor-default"
                                        : isDefault
                                        ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
                                        : "border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50 cursor-pointer"
                                    }`}
                                    style={{
                                      transitionProperty: "border-color, background-color, color",
                                      transitionDuration: "180ms",
                                      transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                                    }}
                                  >
                                    {isActive ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                    {fdef.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
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
