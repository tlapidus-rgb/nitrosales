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
import { Check, Pencil, Plus, X, AlertTriangle, LayoutGrid, GripVertical, Trash2, ChevronDown, Replace } from "lucide-react";
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
} from "@/lib/dashboard/format-config";
import {
  SlotSize,
  SLOT_SIZES,
  ROW_TEMPLATES,
  ALL_ROW_TEMPLATES,
  RowTemplateId,
  LayoutRow,
  LayoutSlot,
  DashboardLayout,
  slotGridClass,
  makeRowId,
  createEmptyRow,
  changeRowTemplate,
  migrateInstancesToLayout,
  hydrateLayout,
  sizeForFormat,
} from "@/lib/dashboard/slot-layout";
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

// Default layout para first-time users — 5 filas con estructura ordenada
const DEFAULT_LAYOUT: DashboardLayout = {
  rows: [
    {
      id: "default-row-kpi-1",
      templateId: "kpi-3",
      title: "Ventas del periodo",
      slots: [
        { size: "sm", widgetId: "revenue", format: "big-number" },
        { size: "sm", widgetId: "orders", format: "big-number" },
        { size: "sm", widgetId: "ticket", format: "mini-line" },
      ],
    },
    {
      id: "default-row-kpi-2",
      templateId: "kpi-3",
      title: "Marketing & trafico",
      slots: [
        { size: "sm", widgetId: "sessions", format: "mini-line" },
        { size: "sm", widgetId: "adspend", format: "big-number" },
        { size: "sm", widgetId: "roas", format: "big-number" },
      ],
    },
    {
      id: "default-row-chart-1",
      templateId: "chart-full",
      title: "Facturacion diaria",
      slots: [
        { size: "xl", widgetId: "revenue-chart", format: "area-full" },
      ],
    },
    {
      id: "default-row-trio",
      templateId: "trio-md",
      title: "Top rankings",
      slots: [
        { size: "md", widgetId: "top-products", format: "list" },
        { size: "md", widgetId: "top-customers", format: "list" },
        { size: "md", widgetId: "dist-canal", format: "donut" },
      ],
    },
    {
      id: "default-row-chart-2",
      templateId: "chart-full",
      title: "Inversion en ads",
      slots: [
        { size: "xl", widgetId: "spend-chart", format: "area-full" },
      ],
    },
  ],
};

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
  // Layout principal (rompecabezas de filas)
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
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
  const [toast, setToast] = useState("");
  // Drag & drop de filas
  const [dragRowIndex, setDragRowIndex] = useState<number | null>(null);
  const [dragOverRowIndex, setDragOverRowIndex] = useState<number | null>(null);
  // Template picker (para agregar fila nueva o cambiar template de una)
  const [templatePickerOpen, setTemplatePickerOpen] = useState<false | { mode: "add" } | { mode: "change"; rowId: string }>(false);
  // Slot widget picker: { rowId, slotIdx, size } cuando está abierto
  const [slotPickerOpen, setSlotPickerOpen] = useState<{ rowId: string; slotIdx: number; size: SlotSize } | null>(null);

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

  // ── Load preferences on mount (layout + per-card filters) ──
  useEffect(() => {
    fetch("/api/dashboard/preferences")
      .then(r => r.json())
      .then(data => {
        const widgetExists = (id: string) => !!WIDGET_MAP[id];

        // Priority 1: new `layout` field (v3)
        if (data.layout) {
          const hydratedLayout = hydrateLayout(data.layout, widgetExists);
          if (hydratedLayout && hydratedLayout.rows.length > 0) {
            setLayout(hydratedLayout);
            if (data.widgetFilters && typeof data.widgetFilters === "object") {
              setWidgetFilters(data.widgetFilters);
            }
            return;
          }
        }

        // Priority 2: legacy `widgets` (v2) → migrate to layout
        if (Array.isArray(data.widgets) && data.widgets.length > 0) {
          const instances = hydrateWidgetList(data.widgets, lookupDefaultFormat)
            .filter((inst) => WIDGET_MAP[inst.id]);
          if (instances.length > 0) {
            const migrated = migrateInstancesToLayout(instances, widgetExists);
            if (migrated.rows.length > 0) setLayout(migrated);
          }
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

    // Recorro todos los slots del layout para recolectar widgetIds activos.
    const activeSlotWidgetIds: string[] = [];
    for (const row of layout.rows) {
      for (const slot of row.slots) {
        if (slot.widgetId) activeSlotWidgetIds.push(slot.widgetId);
      }
    }

    // 1) Section-level sources (compartidos)
    const sectionNeeded = new Set<string>();
    for (const wId of activeSlotWidgetIds) {
      const w = WIDGET_MAP[wId];
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

    // 2) Per-widget sources (top:*, dist:*) — fetch por widget único
    const perWidgetFetches: Record<string, Promise<any>> = {};
    const seenPerWidget = new Set<string>();
    for (const wId of activeSlotWidgetIds) {
      if (seenPerWidget.has(wId)) continue;
      const w = WIDGET_MAP[wId];
      if (!w || !isPerWidgetSource(w.dataSource)) continue;
      seenPerWidget.add(wId);
      const baseUrl = resolveDataUrl(w.dataSource);
      if (!baseUrl) continue;
      const sep = baseUrl.includes("?") ? "&" : "?";
      perWidgetFetches[wId] = fetch(`${baseUrl}${sep}${periodQuery}`)
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
  }, [layout, periodQuery]);

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

  // ── Derivar lista plana de widgets desde el layout (para persistir
  //     una copia legacy v2 y permitir rollback sin perder datos) ──
  const derivedWidgetInstances = useMemo<WidgetInstance[]>(() => {
    const out: WidgetInstance[] = [];
    for (const row of layout.rows) {
      for (const slot of row.slots) {
        if (slot.widgetId && slot.format) {
          out.push({ id: slot.widgetId, format: slot.format });
        }
      }
    }
    return out;
  }, [layout]);

  // ── Save preferences ──
  const savePreferences = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/dashboard/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout,
          widgets: derivedWidgetInstances,
          widgetFilters,
        }),
      });
      showToast("Layout guardado correctamente");
      setEditMode(false);
    } catch {
      showToast("Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [layout, derivedWidgetInstances, widgetFilters]);

  // ── Per-card filter handlers (autosave on change) ──
  const persistFilters = useCallback(
    async (next: Record<string, Record<string, string>>) => {
      try {
        await fetch("/api/dashboard/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            layout,
            widgets: derivedWidgetInstances,
            widgetFilters: next,
          }),
        });
      } catch {
        // silent — el cambio queda en estado local igual
      }
    },
    [layout, derivedWidgetInstances]
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

  // ── Row / Slot operations ────────────────────────────────────

  // Reordena filas via drag & drop (fromIdx → toIdx)
  const reorderRows = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setLayout((prev) => {
      const next = [...prev.rows];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return { rows: next };
    });
  };

  // Agrega una fila nueva al final con el template elegido
  const addRow = (templateId: RowTemplateId) => {
    setLayout((prev) => ({
      rows: [...prev.rows, createEmptyRow(templateId)],
    }));
    showToast("Fila agregada");
  };

  // Elimina una fila entera
  const removeRow = (rowId: string) => {
    setLayout((prev) => ({
      rows: prev.rows.filter((r) => r.id !== rowId),
    }));
    showToast("Fila removida");
  };

  // Cambia el template de una fila preservando widgets compatibles
  const changeTemplate = (rowId: string, newTemplateId: RowTemplateId) => {
    setLayout((prev) => ({
      rows: prev.rows.map((r) =>
        r.id === rowId ? changeRowTemplate(r, newTemplateId) : r
      ),
    }));
  };

  // Setea el título opcional de una fila
  const setRowTitle = (rowId: string, title: string) => {
    setLayout((prev) => ({
      rows: prev.rows.map((r) =>
        r.id === rowId ? { ...r, title: title.trim().length > 0 ? title : undefined } : r
      ),
    }));
  };

  // Asigna (o reemplaza) el widget de un slot específico
  const setSlotWidget = (rowId: string, slotIdx: number, widgetId: string, format: FormatId) => {
    setLayout((prev) => ({
      rows: prev.rows.map((r) => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          slots: r.slots.map((s, i) =>
            i === slotIdx ? { ...s, widgetId, format } : s
          ),
        };
      }),
    }));
    showToast("Widget actualizado");
  };

  // Vacía un slot (no lo elimina — queda disponible para un nuevo widget)
  const clearSlot = (rowId: string, slotIdx: number) => {
    setLayout((prev) => ({
      rows: prev.rows.map((r) => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          slots: r.slots.map((s, i) =>
            i === slotIdx ? { ...s, widgetId: null, format: null } : s
          ),
        };
      }),
    }));
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

  // ── Slot content dispatcher ──────────────────────────────────
  // Dado un row + slot, renderiza el contenido del slot. Maneja
  // slots vacíos (placeholder en edit mode), numeric formats,
  // list/donut y chart cards full width.
  const renderSlotContent = (row: LayoutRow, slot: LayoutSlot, slotIdx: number) => {
    // Empty slot
    if (!slot.widgetId || !slot.format) {
      if (editMode) {
        return (
          <button
            onClick={() => setSlotPickerOpen({ rowId: row.id, slotIdx, size: slot.size })}
            className="w-full h-full min-h-[112px] flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 hover:bg-slate-50/60"
            style={{ transition: "all 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            <Plus className="w-4 h-4" />
            <span className="text-[10px] font-medium tracking-wider uppercase">
              {SLOT_SIZES[slot.size].label}
            </span>
          </button>
        );
      }
      return (
        <div className="w-full h-full min-h-[112px] rounded-xl border border-dashed border-slate-200/60" />
      );
    }

    const def = WIDGET_MAP[slot.widgetId];
    if (!def) return null;

    const trendDays = allData.trends?.days || [];

    const headerRight = (
      <div className="flex items-center gap-1">
        {editMode && (
          <button
            onClick={() => setSlotPickerOpen({ rowId: row.id, slotIdx, size: slot.size })}
            title="Reemplazar widget"
            className="w-7 h-7 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors"
            style={{ transitionDuration: "200ms", transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            <Replace className="w-3.5 h-3.5" />
          </button>
        )}
        <WidgetFilterPopover
          widgetId={def.id}
          section={def.section}
          excludeFilters={def.excludeFilters}
          values={widgetFilters[slot.widgetId!] || {}}
          onChange={(filterId, value) => updateWidgetFilter(slot.widgetId!, filterId, value)}
          onClear={() => clearWidgetFilters(slot.widgetId!)}
        />
      </div>
    );

    const filterChips = (
      <WidgetFilterChips
        section={def.section}
        excludeFilters={def.excludeFilters}
        values={widgetFilters[slot.widgetId!] || {}}
        onRemove={(id) => updateWidgetFilter(slot.widgetId!, id, "all")}
      />
    );

    const baseProps = {
      category: def.category,
      categoryColor: def.catColor,
      title: def.title,
      editMode,
      isDragging: false,
      isDragOver: false,
      onRemove: () => clearSlot(row.id, slotIdx),
      dragHandlers: {},
      draggable: false,
      headerRight,
      filterChips,
    };

    // Numeric formats
    if (
      slot.format === "kpi" ||
      slot.format === "big-number" ||
      slot.format === "sparkline" ||
      slot.format === "mini-line" ||
      slot.format === "mini-bar"
    ) {
      const overrideForWidget = widgetDataOverrides[slot.widgetId];
      const dataForWidget = overrideForWidget
        ? { ...allData, [def.dataSource]: overrideForWidget }
        : allData;
      const d = getWidgetData(slot.widgetId, dataForWidget);
      const sparkline = getSparklineSeries(slot.widgetId, trendDays);

      if (slot.format === "kpi") {
        return <FormatKpi {...baseProps} data={d} sparkline={sparkline} />;
      }
      if (slot.format === "big-number") {
        return <FormatBigNumber {...baseProps} data={d} sparkline={sparkline} />;
      }
      if (slot.format === "sparkline") {
        return <FormatSparkline {...baseProps} data={d} sparkline={sparkline} />;
      }
      const series: SeriesPoint[] = trendDays.map((day: any, i: number) => ({
        date: day.date,
        value: sparkline[i] ?? 0,
      }));
      if (slot.format === "mini-line") {
        return (
          <FormatMiniLine
            {...baseProps}
            series={series}
            color={def.catColor}
            valueFormatter={(v) => formatCompact(v)}
          />
        );
      }
      return (
        <FormatMiniBar
          {...baseProps}
          series={series}
          color={def.catColor}
          valueFormatter={(v) => formatCompact(v)}
        />
      );
    }

    // List format
    if (slot.format === "list") {
      const resp = widgetDataOverrides[slot.widgetId] || perWidgetData[slot.widgetId];
      const items: ListItem[] = (resp?.items as ListItem[]) || [];
      const isCampaigns = def.dataSource === "top:campaigns";
      return (
        <FormatList
          {...baseProps}
          items={items}
          accent={def.catColor}
          valueFormatter={isCampaigns ? (v) => `${v.toFixed(2)}x` : (v) => formatARS(v)}
          secondaryFormatter={
            isCampaigns ? (v) => `Spend: ${formatARS(v)}` : (v) => `${v} u.`
          }
        />
      );
    }

    // Donut format
    if (slot.format === "donut") {
      const resp = widgetDataOverrides[slot.widgetId] || perWidgetData[slot.widgetId];
      const items: DistributionItem[] =
        (resp?.slices as DistributionItem[]) ||
        (resp?.items as DistributionItem[]) ||
        [];
      return (
        <FormatDonut
          {...baseProps}
          items={items}
          valueFormatter={(v) => formatARS(v)}
        />
      );
    }

    // area-full / bar-full
    if (slot.format === "area-full" || slot.format === "bar-full") {
      return (
        <DashboardChartCard
          category={def.category}
          categoryColor={def.catColor}
          title={def.title}
          subtitle={
            slot.widgetId === "revenue-chart"
              ? "Evolución diaria"
              : slot.widgetId === "spend-chart"
              ? "Google + Meta acumulado"
              : undefined
          }
          editMode={editMode}
          isDragging={false}
          isDragOver={false}
          onRemove={() => clearSlot(row.id, slotIdx)}
          dragProps={{}}
          headerRight={headerRight}
          filterChips={filterChips}
        >
          {slot.widgetId === "revenue-chart" && (
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

          {slot.widgetId === "spend-chart" && (
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
    }

    return null;
  };

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
          onClick={() => { if (editMode) { setEditMode(false); setTemplatePickerOpen(false); setSlotPickerOpen(null); } else setEditMode(true); }}
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

          {/* ── Row-based slot layout ── */}
          <div className="dash-stagger flex flex-col gap-4 mb-6">
            {layout.rows.map((row, rowIdx) => {
              const tpl = ROW_TEMPLATES[row.templateId];
              const isDragging = dragRowIndex === rowIdx;
              const isDragOver = dragOverRowIndex === rowIdx && dragRowIndex !== rowIdx;

              return (
                <div
                  key={row.id}
                  className={`relative ${isDragging ? "opacity-40" : ""}`}
                  style={{ transition: "opacity 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}
                >
                  {/* Row toolbar — edit mode */}
                  {editMode && (
                    <div
                      className="flex items-center gap-2 mb-2 px-1"
                      draggable
                      onDragStart={(e) => {
                        setDragRowIndex(rowIdx);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverRowIndex(rowIdx);
                      }}
                      onDrop={() => {
                        if (dragRowIndex !== null) reorderRows(dragRowIndex, rowIdx);
                        setDragRowIndex(null);
                        setDragOverRowIndex(null);
                      }}
                      onDragEnd={() => {
                        setDragRowIndex(null);
                        setDragOverRowIndex(null);
                      }}
                    >
                      <span
                        className="w-6 h-6 flex items-center justify-center text-slate-400 cursor-grab active:cursor-grabbing"
                        title="Arrastrar fila"
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        value={row.title || ""}
                        onChange={(e) => setRowTitle(row.id, e.target.value)}
                        placeholder="Titulo de la fila (opcional)"
                        className="flex-1 min-w-0 text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-700 bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-slate-500 focus:outline-none px-1 py-0.5"
                        style={{ transition: "border-color 180ms cubic-bezier(0.16, 1, 0.3, 1)" }}
                      />
                      <button
                        onClick={() => setTemplatePickerOpen({ mode: "change", rowId: row.id })}
                        title="Cambiar plantilla de fila"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50"
                        style={{ transition: "all 180ms cubic-bezier(0.16, 1, 0.3, 1)" }}
                      >
                        <LayoutGrid className="w-3 h-3" />
                        {tpl.label}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => removeRow(row.id)}
                        title="Eliminar fila"
                        className="w-7 h-7 rounded-lg text-rose-500 hover:bg-rose-50 flex items-center justify-center"
                        style={{ transition: "all 180ms cubic-bezier(0.16, 1, 0.3, 1)" }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Read-mode title pill */}
                  {!editMode && row.title && (
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500">
                        {row.title}
                      </span>
                    </div>
                  )}

                  {/* Drop indicator */}
                  {isDragOver && (
                    <div
                      className="absolute -top-2 left-0 right-0 h-1 rounded-full bg-indigo-500"
                      style={{ boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.22)" }}
                    />
                  )}

                  {/* Slots grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 auto-rows-auto gap-4">
                    {row.slots.map((slot, slotIdx) => {
                      const gridClass = slotGridClass(slot.size);
                      const slotKey = `${row.id}__${slotIdx}`;
                      return (
                        <div key={slotKey} className={gridClass}>
                          {renderSlotContent(row, slot, slotIdx)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Agregar fila (edit mode) ── */}
          {editMode && (
            <button
              onClick={() => setTemplatePickerOpen({ mode: "add" })}
              className="dash-add-slot w-full py-6 flex items-center justify-center gap-2 text-slate-600 hover:text-slate-900 font-semibold text-sm mb-8"
            >
              <Plus className="w-4 h-4" />
              Agregar fila
            </button>
          )}

        </>
      )}

      {/* ── Template Picker Modal ── */}
      {templatePickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          style={{
            background: "rgba(15, 23, 42, 0.42)",
            backdropFilter: "saturate(140%) blur(8px)",
            WebkitBackdropFilter: "saturate(140%) blur(8px)",
          }}
          onClick={() => setTemplatePickerOpen(false)}
        >
          <div
            className="dash-sheet dash-sheet--centered w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-1">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <LayoutGrid className="w-[18px] h-[18px]" />
                </div>
                <div>
                  <h3 className="text-[17px] font-semibold tracking-tight text-slate-900">
                    {templatePickerOpen && typeof templatePickerOpen === "object" && templatePickerOpen.mode === "add"
                      ? "Agregar fila"
                      : "Cambiar plantilla"}
                  </h3>
                  <p className="text-[12px] text-slate-500">Elegí la estructura de slots para esta fila</p>
                </div>
              </div>
              <button
                onClick={() => setTemplatePickerOpen(false)}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors"
                style={{ transitionDuration: "200ms", transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ALL_ROW_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => {
                    if (templatePickerOpen && typeof templatePickerOpen === "object") {
                      if (templatePickerOpen.mode === "add") {
                        addRow(tpl.id);
                      } else if (templatePickerOpen.mode === "change") {
                        changeTemplate(templatePickerOpen.rowId, tpl.id);
                      }
                    }
                    setTemplatePickerOpen(false);
                  }}
                  className="flex flex-col gap-2 p-3.5 border border-slate-200 rounded-xl bg-white text-left hover:border-slate-400 hover:bg-slate-50"
                  style={{
                    boxShadow: "0 1px 0 rgba(15,23,42,0.03)",
                    transition: "all 180ms cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold tracking-tight text-[13px] text-slate-900">{tpl.label}</span>
                    <span className="text-[10px] font-medium tracking-wider uppercase text-slate-400">
                      {tpl.height === "tall" ? "Alto" : "Compacto"}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 leading-snug">{tpl.description}</span>
                  {/* Mini preview — barras proporcionales al tamaño */}
                  <div className="flex gap-1 mt-1 h-4">
                    {tpl.slots.map((size, i) => {
                      const colSpan = SLOT_SIZES[size].cols;
                      const height = SLOT_SIZES[size].rows === 2 ? "h-4" : "h-2";
                      return (
                        <div
                          key={i}
                          className={`${height} bg-slate-200 rounded`}
                          style={{ flex: colSpan }}
                        />
                      );
                    })}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Slot Widget Picker Modal ── */}
      {slotPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          style={{
            background: "rgba(15, 23, 42, 0.42)",
            backdropFilter: "saturate(140%) blur(8px)",
            WebkitBackdropFilter: "saturate(140%) blur(8px)",
          }}
          onClick={() => setSlotPickerOpen(null)}
        >
          <div
            className="dash-sheet dash-sheet--centered w-full max-w-3xl max-h-[85vh] overflow-y-auto p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-1">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <LayoutGrid className="w-[18px] h-[18px]" />
                </div>
                <div>
                  <h3 className="text-[17px] font-semibold tracking-tight text-slate-900">
                    Elegir widget
                  </h3>
                  <p className="text-[12px] text-slate-500">
                    Slot {SLOT_SIZES[slotPickerOpen.size].label} — mostrando widgets compatibles
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSlotPickerOpen(null)}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors"
                style={{ transitionDuration: "200ms", transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              {Array.from(new Set(WIDGET_CATALOG.map((w) => w.category))).map((cat) => {
                const allowedFormats = SLOT_SIZES[slotPickerOpen.size].allowedFormats;
                const items = WIDGET_CATALOG.filter(
                  (w) =>
                    w.category === cat &&
                    w.supportedFormats.some((f) => allowedFormats.includes(f))
                );
                if (items.length === 0) return null;
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
                      {items.map((w) => {
                        const compatibleFormats = w.supportedFormats.filter((f) =>
                          allowedFormats.includes(f)
                        );
                        return (
                          <div
                            key={w.id}
                            className="flex flex-col gap-2 px-3.5 py-3 border border-slate-200 rounded-xl bg-white"
                            style={{ boxShadow: "0 1px 0 rgba(15,23,42,0.03)" }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium tracking-tight text-[13px] text-slate-800 truncate">
                                {w.title}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {compatibleFormats.map((fmt) => {
                                const fdef = FORMAT_REGISTRY[fmt];
                                const isDefault = fmt === w.defaultFormat;
                                return (
                                  <button
                                    key={fmt}
                                    onClick={() => {
                                      setSlotWidget(
                                        slotPickerOpen.rowId,
                                        slotPickerOpen.slotIdx,
                                        w.id,
                                        fmt
                                      );
                                      setSlotPickerOpen(null);
                                    }}
                                    title={fdef.description + (isDefault ? " (Recomendado)" : "")}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border ${
                                      isDefault
                                        ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                                        : "border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50"
                                    }`}
                                    style={{
                                      transitionProperty: "border-color, background-color, color",
                                      transitionDuration: "180ms",
                                      transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                                    }}
                                  >
                                    <Plus className="w-3 h-3" />
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
