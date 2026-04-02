// @ts-nocheck

"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  LineChart, Line, BarChart, Bar, Legend,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import { KpiCard, DateRangeFilter } from "@/components/dashboard";
import {
  TrendingUp, TrendingDown, AlertTriangle, DollarSign,
  Package, Zap, ArrowUp, ArrowDown, X, Search, Download,
  ShoppingBag, BarChart3, Layers, Clock, Percent, PiggyBank,
  SlidersHorizontal, Eye, EyeOff,
} from "lucide-react";

/* ── Constants ─────────────────────────────────────────── */

const QUICK_RANGES = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
  { label: "12 meses", days: 365 },
];

const COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4",
  "#8b5cf6", "#f97316", "#14b8a6", "#ec4899", "#94a3b8",
];

const COLUMN_TOOLTIPS: Record<string, string> = {
  facturacion: "Ingresos totales por venta de este producto en el periodo",
  unidades: "Cantidad total de unidades vendidas en el periodo",
  tendencia: "Variacion porcentual de ingresos entre la ultima semana y la anterior (WoW)",
  stock: "Unidades actualmente disponibles en inventario",
  diasstock: "Dias estimados hasta agotar stock, basado en la velocidad de venta actual",
  abc: "Clasificacion ABC: A = Top 80% del revenue, B = siguiente 15%, C = ultimo 5%",
  porcMarca: "Participacion de este producto en la facturacion total de su marca",
  porcCat: "Participacion de este producto en la facturacion total de su categoria",
  porcTotal: "Participacion de este producto en la facturacion total",
};

/* ── Types ─────────────────────────────────────────────── */

interface MarginAnalysis {
  weightedMarginPct: number;
  totalRevenueWithCost: number;
  totalCogs: number;
  grossProfit: number;
  productsWithCost: number;
  productsWithoutCost: number;
  distribution: Array<{ range: string; count: number; revenue: number; avgMargin: number }>;
  byBrand: Array<{ name: string; revenue: number; cogs: number; marginPct: number; productCount: number }>;
  byCategory: Array<{ name: string; revenue: number; cogs: number; marginPct: number; productCount: number }>;
  topMargin: Array<ProductItem>;
  bottomMargin: Array<ProductItem>;
}

interface ProductItem {
  id: string; name: string; sku: string | null;
  imageUrl: string | null; category: string | null; brand: string | null;
  stock: number | null; unitsSold: number; revenue: number; revenueNeto: number;
  orders: number; avgPrice: number; avgPriceNeto: number;
  costPrice: number | null; marginPct: number | null; marginAbs: number | null; cogs: number | null;
  trendData: {
    weeklyTrend: Array<{ weekStart: string; units: number; revenue: number }>;
    wowUnitsPct: number; wowRevenuePct: number;
    trendSlope: number; abcClass: "A" | "B" | "C";
  };
  stockData: {
    dailySalesRate: number; daysOfStock: number | null;
    stockoutDate: string | null;
    stockHealth: "critical" | "low" | "optimal" | "excessive" | null;
    isDead: boolean; lastSaleDate: string | null;
  };
}

interface StockSummary {
  criticalCount: number; lowCount: number; optimalCount: number;
  excessiveCount: number; deadCount: number;
  totalStockUnits: number; totalStockValue: number; productsAtRisk: number;
}

interface BagsAnalytics {
  totalBagsSold: number; bagsRevenue: number;
  currentStock: { grande: number; chica: number; total: number };
  ordersWithBags: number; totalOrders: number; bagAdoptionPct: number;
  breakdown: Array<{ name: string; unitsSold: number; revenue: number; stock: number | null }>;
}

interface SortState { column: string | null; direction: "asc" | "desc" | null; }

/* ── Small components ──────────────────────────────────── */

function toDateInputValue(d: Date) { return d.toISOString().split("T")[0]; }

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length === 0) return <div className="w-[60px] h-[24px]" />;
  return (
    <ResponsiveContainer width={60} height={24}>
      <LineChart data={data.map((v) => ({ v }))} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TrendIndicator({ value }: { value: number }) {
  if (value > 5) return (
    <span className="flex items-center gap-1 text-green-600 font-medium text-sm">
      <TrendingUp className="w-4 h-4" />+{value.toFixed(1)}%
    </span>
  );
  if (value < -5) return (
    <span className="flex items-center gap-1 text-red-600 font-medium text-sm">
      <TrendingDown className="w-4 h-4" />{value.toFixed(1)}%
    </span>
  );
  return <span className="text-gray-500 text-sm">{value.toFixed(1)}%</span>;
}

function StockBadge({ daysOfStock, stockHealth, stock }: { daysOfStock: number | null; stockHealth: string | null; stock?: number | null }) {
  if (stock !== undefined && stock !== null && stock === 0)
    return <span className="px-2 py-1 text-xs rounded-md bg-red-200 text-red-800 font-bold">Agotado</span>;
  let bg = "bg-gray-100 text-gray-700";
  if (stockHealth === "critical") bg = "bg-red-100 text-red-700 font-semibold";
  else if (stockHealth === "low") bg = "bg-amber-100 text-amber-700 font-semibold";
  else if (stockHealth === "optimal") bg = "bg-green-100 text-green-700";
  else if (stockHealth === "excessive") bg = "bg-blue-100 text-blue-700";
  if (daysOfStock == null) return <span className={`px-2 py-1 text-xs rounded-md ${bg}`}>--</span>;
  if (daysOfStock > 365) return <span className={`px-2 py-1 text-xs rounded-md ${bg}`}>+365d</span>;
  return <span className={`px-2 py-1 text-xs rounded-md ${bg}`}>{Math.round(daysOfStock)}d</span>;
}

function ABCBadge({ abcClass }: { abcClass: string }) {
  const bg = abcClass === "A" ? "bg-green-100 text-green-700" : abcClass === "B" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700";
  return <span className={`px-2 py-1 text-xs font-bold rounded-md ${bg}`}>{abcClass}</span>;
}

function TooltipHeader({ text, tooltip }: { text: string; tooltip: string }) {
  return (
    <div className="relative group cursor-help">
      <span>{text}</span>
      <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-48 bg-gray-900 text-white text-xs rounded-lg p-2 shadow-lg pointer-events-none">
        {tooltip}
      </div>
    </div>
  );
}

/* ── Stock Health Chips ────────────────────────────────── */

const STOCK_CHIPS = [
  { key: "", label: "Todos", color: "gray" },
  { key: "agotado", label: "Agotado", color: "red" },
  { key: "critical", label: "Critico", color: "red" },
  { key: "low", label: "Bajo", color: "amber" },
  { key: "moderate", label: "Optimo", color: "green" },
  { key: "high", label: "Excesivo", color: "blue" },
];

function StockChips({ active, onChange, counts }: { active: string; onChange: (k: string) => void; counts: Record<string, number> }) {
  const colorMap: Record<string, string> = {
    gray: "bg-gray-100 text-gray-700 border-gray-300",
    red: "bg-red-50 text-red-700 border-red-300",
    amber: "bg-amber-50 text-amber-700 border-amber-300",
    green: "bg-green-50 text-green-700 border-green-300",
    blue: "bg-blue-50 text-blue-700 border-blue-300",
  };
  const activeColorMap: Record<string, string> = {
    gray: "bg-gray-800 text-white border-gray-800",
    red: "bg-red-600 text-white border-red-600",
    amber: "bg-amber-500 text-white border-amber-500",
    green: "bg-green-600 text-white border-green-600",
    blue: "bg-blue-600 text-white border-blue-600",
  };
  return (
    <div className="flex flex-wrap gap-2">
      {STOCK_CHIPS.map((c) => {
        const isActive = active === c.key;
        const count = counts[c.key] ?? 0;
        return (
          <button key={c.key} onClick={() => onChange(c.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${isActive ? activeColorMap[c.color] : colorMap[c.color]}`}>
            {c.label}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isActive ? "bg-white/20" : "bg-black/5"}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Column Selector ──────────────────────────────────── */

type ColumnConfig = { key: string; label: string; defaultVisible: boolean };

function ColumnSelector({ columns, visible, onChange }: {
  columns: ColumnConfig[];
  visible: Record<string, boolean>;
  onChange: (key: string, val: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition-colors">
        <SlidersHorizontal className="w-3.5 h-3.5" />Columnas
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[200px]">
            <p className="text-[10px] text-gray-400 uppercase font-semibold mb-2">Mostrar/Ocultar</p>
            {columns.map((col) => (
              <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-1">
                <input type="checkbox" checked={visible[col.key] ?? col.defaultVisible}
                  onChange={(e) => onChange(col.key, e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5" />
                <span className="text-xs text-gray-700">{col.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main Component ────────────────────────────────────── */

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [stockSummary, setStockSummary] = useState<StockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "trends" | "stock" | "margins">("overview");
  const [marginAnalysis, setMarginAnalysis] = useState<MarginAnalysis | null>(null);
  const [marginPage, setMarginPage] = useState(1);
  const [marginSort, setMarginSort] = useState<SortState>({ column: "marginPct", direction: "desc" });
  const [marginRangeFilter, setMarginRangeFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [stockDaysFilter, setStockDaysFilter] = useState("");
  const [chartMetric, setChartMetric] = useState<"revenue" | "units">("revenue");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortState, setSortState] = useState<SortState>({ column: "revenue", direction: "desc" });
  const [enlargedImage, setEnlargedImage] = useState<{ url: string; name: string } | null>(null);
  const [stockAlertsPage, setStockAlertsPage] = useState(1);
  const [deadStockPage, setDeadStockPage] = useState(1);
  const [bagsAnalytics, setBagsAnalytics] = useState<BagsAnalytics | null>(null);
  const [summary, setSummary] = useState<{ totalOrders30d: number; totalItems30d: number; totalRevenue30d: number } | null>(null);

  // Column visibility
  const OVERVIEW_COLUMNS: ColumnConfig[] = [
    { key: "facturacion", label: "Facturación", defaultVisible: true },
    { key: "margen", label: "Margen %", defaultVisible: true },
    { key: "porcMarca", label: "% Marca", defaultVisible: true },
    { key: "porcCat", label: "% Categoría", defaultVisible: true },
    { key: "porcTotal", label: "% Total", defaultVisible: true },
    { key: "unidades", label: "Unidades", defaultVisible: true },
    { key: "wow", label: "WoW", defaultVisible: true },
    { key: "stock", label: "Stock", defaultVisible: true },
    { key: "diasStock", label: "Días Stock", defaultVisible: true },
    { key: "abc", label: "ABC", defaultVisible: true },
  ];
  const MARGIN_COLUMNS: ColumnConfig[] = [
    { key: "precio", label: "Precio", defaultVisible: true },
    { key: "costo", label: "Costo", defaultVisible: true },
    { key: "margenPct", label: "Margen %", defaultVisible: true },
    { key: "markup", label: "Markup %", defaultVisible: true },
    { key: "margenUd", label: "Margen $/ud", defaultVisible: true },
    { key: "unidades", label: "Unidades", defaultVisible: true },
    { key: "facturacion", label: "Facturación", defaultVisible: true },
    { key: "ganancia", label: "Ganancia", defaultVisible: true },
    { key: "stock", label: "Stock", defaultVisible: true },
    { key: "abc", label: "ABC", defaultVisible: false },
  ];
  const [overviewCols, setOverviewCols] = useState<Record<string, boolean>>({});
  const [marginCols, setMarginCols] = useState<Record<string, boolean>>({});
  const isOvCol = (key: string) => overviewCols[key] ?? OVERVIEW_COLUMNS.find(c => c.key === key)?.defaultVisible ?? true;
  const isMgCol = (key: string) => marginCols[key] ?? MARGIN_COLUMNS.find(c => c.key === key)?.defaultVisible ?? true;

  // Date range
  const [dateFrom, setDateFrom] = useState(toDateInputValue(new Date(Date.now() - 30 * 86400000)));
  const [dateTo, setDateTo] = useState(toDateInputValue(new Date()));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(30);

  const ITEMS_PER_PAGE = 30;
  const STOCK_ITEMS_PER_PAGE = 15;

  /* ── Fetch ─────────────────────────────────────────── */
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/metrics/products?from=${dateFrom}&to=${dateTo}`);
        const data = await res.json();

        const parsed = data.products.map((p: any) => ({
          ...p,
          revenue: Number(p.revenue) || 0,
          revenueNeto: Number(p.revenueNeto) || 0,
          unitsSold: Number(p.unitsSold) || 0,
          avgPrice: Number(p.avgPrice) || 0,
          avgPriceNeto: Number(p.avgPriceNeto) || 0,
          stock: p.stock != null ? Number(p.stock) : null,
          orders: Number(p.orders) || 0,
          costPrice: p.costPrice != null ? Number(p.costPrice) : null,
          marginPct: p.marginPct != null ? Number(p.marginPct) : null,
          marginAbs: p.marginAbs != null ? Number(p.marginAbs) : null,
          cogs: p.cogs != null ? Number(p.cogs) : null,
          trendData: {
            ...p.trendData,
            wowUnitsPct: Number(p.trendData?.wowUnitsPct) || 0,
            wowRevenuePct: Number(p.trendData?.wowRevenuePct) || 0,
            trendSlope: Number(p.trendData?.trendSlope) || 0,
            abcClass: p.trendData?.abcClass || "C",
            weeklyTrend: (p.trendData?.weeklyTrend || []).map((w: any) => ({
              ...w, units: Number(w.units) || 0, revenue: Number(w.revenue) || 0,
            })),
          },
          stockData: {
            ...p.stockData,
            dailySalesRate: Number(p.stockData?.dailySalesRate) || 0,
            daysOfStock: p.stockData?.daysOfStock != null ? Number(p.stockData.daysOfStock) : null,
          },
        }));

        // Filter out gift cards and shopping bags
        const filteredProducts = parsed.filter((p: ProductItem) => {
          const n = p.name?.toLowerCase() || "";
          return !n.includes("gift card") && !n.includes("shopping bag") && !n.includes("bolsa de compra");
        });

        setProducts(filteredProducts);

        const sh = data.stockSummary;
        if (sh) {
          setStockSummary({
            criticalCount: sh.criticalCount ?? 0, lowCount: sh.lowCount ?? 0,
            optimalCount: sh.optimalCount ?? 0, excessiveCount: sh.excessiveCount ?? 0,
            deadCount: sh.deadCount ?? 0, totalStockUnits: sh.totalStockUnits ?? 0,
            totalStockValue: sh.totalStockValue ?? 0,
            productsAtRisk: (sh.criticalCount ?? 0) + (sh.lowCount ?? 0),
          });
        }
        if (data.bagsAnalytics) setBagsAnalytics(data.bagsAnalytics);
        if (data.marginAnalysis) setMarginAnalysis(data.marginAnalysis);
        if (data.summary) setSummary({
          totalOrders30d: Number(data.summary.totalOrders30d) || 0,
          totalItems30d: Number(data.summary.totalItems30d) || 0,
          totalRevenue30d: Number(data.summary.totalRevenue30d) || 0,
        });
      } catch (err) {
        console.error("Error fetching products:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateFrom, dateTo]);

  /* ── Date handlers ─────────────────────────────────── */
  const handleQuickRange = (days: number) => {
    setDateTo(toDateInputValue(new Date()));
    setDateFrom(toDateInputValue(new Date(Date.now() - days * 86400000)));
    setActiveQuickRange(days);
    setCurrentPage(1);
  };
  const handleDateChange = (type: "from" | "to", v: string) => {
    type === "from" ? setDateFrom(v) : setDateTo(v);
    setActiveQuickRange(null);
    setCurrentPage(1);
  };

  /* ── Filtering ─────────────────────────────────────── */
  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (brandFilter && p.brand !== brandFilter) return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        if (!p.name.toLowerCase().includes(t) && !(p.sku?.toLowerCase().includes(t))) return false;
      }
      if (stockDaysFilter) {
        const d = p.stockData.daysOfStock;
        if (stockDaysFilter === "agotado") { if ((p.stock ?? 0) !== 0) return false; }
        else if (stockDaysFilter === "critical") { if (d === null || d > 7) return false; }
        else if (stockDaysFilter === "low") { if (d === null || d <= 7 || d > 30) return false; }
        else if (stockDaysFilter === "moderate") { if (d === null || d <= 30 || d > 90) return false; }
        else if (stockDaysFilter === "high") { if (d === null || d <= 90) return false; }
      }
      return true;
    });
  }, [products, brandFilter, categoryFilter, searchTerm, stockDaysFilter]);

  /* ── Stock chip counts ─────────────────────────────── */
  const stockChipCounts = useMemo(() => {
    const base = products.filter((p) => {
      if (brandFilter && p.brand !== brandFilter) return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        if (!p.name.toLowerCase().includes(t) && !(p.sku?.toLowerCase().includes(t))) return false;
      }
      return true;
    });
    return {
      "": base.length,
      agotado: base.filter((p) => (p.stock ?? 0) === 0).length,
      critical: base.filter((p) => p.stockData.daysOfStock !== null && p.stockData.daysOfStock <= 7 && (p.stock ?? 0) > 0).length,
      low: base.filter((p) => p.stockData.daysOfStock !== null && p.stockData.daysOfStock > 7 && p.stockData.daysOfStock <= 30).length,
      moderate: base.filter((p) => p.stockData.daysOfStock !== null && p.stockData.daysOfStock > 30 && p.stockData.daysOfStock <= 90).length,
      high: base.filter((p) => p.stockData.daysOfStock !== null && p.stockData.daysOfStock > 90).length,
    };
  }, [products, brandFilter, categoryFilter, searchTerm]);

  /* ── Sorting ───────────────────────────────────────── */
  const sortedFiltered = useMemo(() => {
    if (!sortState.column || !sortState.direction) return filtered;
    return [...filtered].sort((a, b) => {
      let aV: any, bV: any;
      switch (sortState.column) {
        case "revenue": aV = a.revenue; bV = b.revenue; break;
        case "unitsSold": aV = a.unitsSold; bV = b.unitsSold; break;
        case "stock": aV = a.stock ?? 0; bV = b.stock ?? 0; break;
        case "wowRevenuePct": aV = a.trendData.wowRevenuePct; bV = b.trendData.wowRevenuePct; break;
        case "marginPct": aV = a.marginPct ?? -999; bV = b.marginPct ?? -999; break;
        case "daysOfStock": aV = a.stockData.daysOfStock ?? 0; bV = b.stockData.daysOfStock ?? 0; break;
        case "abc":
          const o: Record<string, number> = { A: 0, B: 1, C: 2 };
          const cmp = o[a.trendData.abcClass] - o[b.trendData.abcClass];
          return sortState.direction === "asc" ? cmp : -cmp;
        default: return 0;
      }
      return sortState.direction === "asc" ? (aV > bV ? 1 : -1) : (aV < bV ? 1 : -1);
    });
  }, [filtered, sortState]);

  /* ── Pagination ────────────────────────────────────── */
  const totalPages = Math.ceil(sortedFiltered.length / ITEMS_PER_PAGE);
  const paginatedProducts = useMemo(() => {
    const s = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedFiltered.slice(s, s + ITEMS_PER_PAGE);
  }, [sortedFiltered, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [brandFilter, categoryFilter, sortState, stockDaysFilter]);

  /* ── Derived data ──────────────────────────────────── */
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort(), [products]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(), [products]);

  const revenueCalcs = useMemo(() => {
    const total = filtered.reduce((s, p) => s + p.revenue, 0);
    const brandT = new Map<string, number>();
    const catT = new Map<string, number>();
    filtered.forEach((p) => {
      brandT.set(p.brand || "Sin marca", (brandT.get(p.brand || "Sin marca") || 0) + p.revenue);
      catT.set(p.category || "Sin categoria", (catT.get(p.category || "Sin categoria") || 0) + p.revenue);
    });
    return { total, brandT, catT };
  }, [filtered]);

  const hasFilters = !!(brandFilter || categoryFilter || searchTerm || stockDaysFilter);
  const kpiStats = useMemo(() => {
    if (summary && !hasFilters) {
      const rev = summary.totalRevenue30d;
      const units = summary.totalItems30d;
      return { totalRevenue: rev, totalUnits: units, ticketPromedio: units > 0 ? rev / units : 0, productosActivos: filtered.length, totalStock: filtered.reduce((s, p) => s + (p.stock ?? 0), 0), valorStock: filtered.reduce((s, p) => s + (p.stock ?? 0) * p.avgPrice, 0) };
    }
    const rev = filtered.reduce((s, p) => s + p.revenue, 0);
    const units = filtered.reduce((s, p) => s + p.unitsSold, 0);
    return { totalRevenue: rev, totalUnits: units, ticketPromedio: units > 0 ? rev / units : 0, productosActivos: filtered.length, totalStock: filtered.reduce((s, p) => s + (p.stock ?? 0), 0), valorStock: filtered.reduce((s, p) => s + (p.stock ?? 0) * p.avgPrice, 0) };
  }, [filtered, summary, hasFilters]);

  const stockHealthAlerts = useMemo(() => {
    let sinStock = 0, critico = 0, sobrestock = 0, diasSum = 0, diasCount = 0;
    filtered.forEach((p) => {
      const st = p.stock ?? 0;
      const d = p.stockData.daysOfStock;
      if (st === 0) sinStock++;
      if (d !== null && d <= 7 && st > 0) critico++;
      if (d !== null && d > 90) sobrestock++;
      if (d !== null && d > 0) { diasSum += d; diasCount++; }
    });
    return { sinStock, critico, sobrestock, diasPromedio: diasCount > 0 ? diasSum / diasCount : 0 };
  }, [filtered]);

  /* ── Chart data: distributions ─────────────────────── */
  const brandDistribution = useMemo(() => {
    const dist = new Map<string, number>();
    filtered.forEach((p) => {
      const k = p.brand || "Sin marca";
      dist.set(k, (dist.get(k) || 0) + (chartMetric === "revenue" ? p.revenue : p.unitsSold));
    });
    return [...dist.entries()].sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }));
  }, [filtered, chartMetric]);

  const categoryDistribution = useMemo(() => {
    const dist = new Map<string, number>();
    filtered.forEach((p) => {
      const k = p.category || "Sin categoria";
      dist.set(k, (dist.get(k) || 0) + (chartMetric === "revenue" ? p.revenue : p.unitsSold));
    });
    return [...dist.entries()].sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }));
  }, [filtered, chartMetric]);

  /* ── Chart data: trends ────────────────────────────── */
  const categoryTrends = useMemo(() => {
    const weekSet = new Set<string>();
    filtered.forEach((p) => p.trendData.weeklyTrend.forEach((w) => weekSet.add(w.weekStart)));
    const weeks = [...weekSet].sort();
    const catRev = new Map<string, number>();
    filtered.forEach((p) => { const c = p.category || "Sin categoria"; catRev.set(c, (catRev.get(c) || 0) + p.revenue); });
    const topCats = [...catRev.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map((e) => e[0]);
    return weeks.map((week) => {
      const row: any = { weekStart: week };
      topCats.forEach((cat) => {
        row[cat] = filtered.filter((p) => (p.category || "Sin categoria") === cat)
          .reduce((s, p) => s + (p.trendData.weeklyTrend.find((w) => w.weekStart === week)?.revenue || 0), 0);
      });
      return row;
    });
  }, [filtered]);

  const brandTrends = useMemo(() => {
    const weekSet = new Set<string>();
    filtered.forEach((p) => p.trendData.weeklyTrend.forEach((w) => weekSet.add(w.weekStart)));
    const weeks = [...weekSet].sort();
    const brandRev = new Map<string, number>();
    filtered.forEach((p) => { const b = p.brand || "Sin marca"; brandRev.set(b, (brandRev.get(b) || 0) + p.revenue); });
    const topBrands = [...brandRev.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map((e) => e[0]);
    return weeks.map((week) => {
      const row: any = { weekStart: week };
      topBrands.forEach((brand) => {
        row[brand] = filtered.filter((p) => (p.brand || "Sin marca") === brand)
          .reduce((s, p) => s + (p.trendData.weeklyTrend.find((w) => w.weekStart === week)?.revenue || 0), 0);
      });
      return row;
    });
  }, [filtered]);

  const topGrowing = useMemo(() => filtered.filter((p) => p.trendData.wowRevenuePct > 0).sort((a, b) => b.trendData.wowRevenuePct - a.trendData.wowRevenuePct).slice(0, 10), [filtered]);
  const topDeclining = useMemo(() => filtered.filter((p) => p.trendData.wowRevenuePct < 0).sort((a, b) => a.trendData.wowRevenuePct - b.trendData.wowRevenuePct).slice(0, 10), [filtered]);

  /* ── Stock tab data ────────────────────────────────── */
  const stockAlerts = useMemo(() => filtered.filter((p) => p.stockData.stockHealth === "critical" || p.stockData.stockHealth === "low").sort((a, b) => (a.stockData.daysOfStock ?? 999) - (b.stockData.daysOfStock ?? 999)), [filtered]);
  const stockAlertsPaginated = useMemo(() => { const s = (stockAlertsPage - 1) * STOCK_ITEMS_PER_PAGE; return stockAlerts.slice(s, s + STOCK_ITEMS_PER_PAGE); }, [stockAlerts, stockAlertsPage]);
  const stockAlertsTotalPages = Math.ceil(stockAlerts.length / STOCK_ITEMS_PER_PAGE);

  const deadStock = useMemo(() => filtered.filter((p) => p.stockData.isDead).sort((a, b) => (b.stock ?? 0) * b.avgPrice - (a.stock ?? 0) * a.avgPrice), [filtered]);
  const deadStockPaginated = useMemo(() => { const s = (deadStockPage - 1) * STOCK_ITEMS_PER_PAGE; return deadStock.slice(s, s + STOCK_ITEMS_PER_PAGE); }, [deadStock, deadStockPage]);
  const deadStockTotalPages = Math.ceil(deadStock.length / STOCK_ITEMS_PER_PAGE);
  const deadStockCapital = useMemo(() => deadStock.reduce((s, p) => s + (p.stock ?? 0) * p.avgPrice, 0), [deadStock]);

  const stockByBrandData = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((p) => m.set(p.brand || "Sin marca", (m.get(p.brand || "Sin marca") || 0) + (p.stock ?? 0)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, units], i) => ({ name, units, color: COLORS[i % COLORS.length] }));
  }, [filtered]);

  const abcCounts = useMemo(() => {
    const c = { A: 0, B: 0, C: 0 };
    filtered.forEach((p) => c[p.trendData.abcClass]++);
    return c;
  }, [filtered]);

  const distributionData = useMemo(() => {
    if (!stockSummary) return [];
    return [
      { name: "Critico", value: stockSummary.criticalCount, color: "#ef4444" },
      { name: "Bajo", value: stockSummary.lowCount, color: "#f59e0b" },
      { name: "Optimo", value: stockSummary.optimalCount, color: "#10b981" },
      { name: "Excesivo", value: stockSummary.excessiveCount, color: "#3b82f6" },
      { name: "Muerto", value: stockSummary.deadCount, color: "#6b7280" },
    ];
  }, [stockSummary]);

  /* ── Sorting helpers ───────────────────────────────── */
  const handleSort = (col: string) => {
    setSortState((prev) => {
      if (prev.column === col) {
        if (prev.direction === "asc") return { column: col, direction: "desc" };
        if (prev.direction === "desc") return { column: null, direction: null };
      }
      return { column: col, direction: "asc" };
    });
  };
  const sortIcon = (col: string) => {
    if (sortState.column !== col) return null;
    return sortState.direction === "asc" ? <ArrowUp className="w-3 h-3 inline ml-0.5" /> : <ArrowDown className="w-3 h-3 inline ml-0.5" />;
  };

  /* ── CSV Export ─────────────────────────────────────── */
  const exportCSV = () => {
    const headers = ["Producto", "SKU", "Marca", "Categoria", "Facturacion", "Unidades", "Tendencia WoW%", "Stock", "Dias Stock", "Salud Stock", "ABC"];
    const rows = filtered.map((p) => [
      `"${p.name.replace(/"/g, '""')}"`, p.sku || "", p.brand || "", p.category || "",
      (p.revenue ?? 0).toFixed(2), p.unitsSold, (p.trendData?.wowRevenuePct ?? 0).toFixed(1),
      p.stock ?? 0, p.stockData.daysOfStock != null ? (p.stockData.daysOfStock > 365 ? "+365" : Math.round(p.stockData.daysOfStock)) : "--",
      p.stockData.stockHealth || "--", p.trendData.abcClass,
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `productos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  /* ── Margin catalog: filter, sort, paginate ───────── */
  const MARGIN_PER_PAGE = 30;

  const MARGIN_CHIPS = [
    { key: "", label: "Todos", color: "gray" },
    { key: "negative", label: "Negativo", color: "red" },
    { key: "0-30", label: "0-30%", color: "amber" },
    { key: "30-50", label: "30-50%", color: "yellow" },
    { key: "50-70", label: "50-70%", color: "green" },
    { key: "70+", label: "70%+", color: "emerald" },
  ];

  const marginCatalog = useMemo(() => {
    // Only products with costPrice
    let items = filtered.filter((p) => p.costPrice != null && p.costPrice > 0);
    // Apply margin range filter
    if (marginRangeFilter) {
      items = items.filter((p) => {
        const m = p.marginPct ?? -999;
        switch (marginRangeFilter) {
          case "negative": return m < 0;
          case "0-30": return m >= 0 && m < 30;
          case "30-50": return m >= 30 && m < 50;
          case "50-70": return m >= 50 && m < 70;
          case "70+": return m >= 70;
          default: return true;
        }
      });
    }
    return items;
  }, [filtered, marginRangeFilter]);

  const marginChipCounts = useMemo(() => {
    const items = filtered.filter((p) => p.costPrice != null && p.costPrice > 0);
    return {
      "": items.length,
      negative: items.filter((p) => (p.marginPct ?? 0) < 0).length,
      "0-30": items.filter((p) => (p.marginPct ?? 0) >= 0 && (p.marginPct ?? 0) < 30).length,
      "30-50": items.filter((p) => (p.marginPct ?? 0) >= 30 && (p.marginPct ?? 0) < 50).length,
      "50-70": items.filter((p) => (p.marginPct ?? 0) >= 50 && (p.marginPct ?? 0) < 70).length,
      "70+": items.filter((p) => (p.marginPct ?? 0) >= 70).length,
    };
  }, [filtered]);

  // Computed byCategory/byBrand from filtered products (supports cross-filtering)
  const computedByCategory = useMemo(() => {
    const withCost = filtered.filter((p) => p.costPrice != null && p.costPrice > 0);
    const map: Record<string, { revenue: number; cogs: number; productCount: number }> = {};
    withCost.forEach((p) => {
      const cat = p.category || "Sin categoria";
      if (!map[cat]) map[cat] = { revenue: 0, cogs: 0, productCount: 0 };
      map[cat].revenue += p.revenueNeto;
      map[cat].cogs += (p.cogs ?? 0);
      map[cat].productCount += 1;
    });
    return Object.entries(map)
      .map(([name, d]) => ({
        name,
        revenue: d.revenue,
        cogs: d.cogs,
        marginPct: d.revenue > 0 ? ((d.revenue - d.cogs) / d.revenue) * 100 : 0,
        markupPct: d.cogs > 0 ? ((d.revenue - d.cogs) / d.cogs) * 100 : 0,
        productCount: d.productCount,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filtered]);

  const computedByBrand = useMemo(() => {
    const withCost = filtered.filter((p) => p.costPrice != null && p.costPrice > 0);
    const map: Record<string, { revenue: number; cogs: number; productCount: number }> = {};
    withCost.forEach((p) => {
      const br = p.brand || "Sin marca";
      if (!map[br]) map[br] = { revenue: 0, cogs: 0, productCount: 0 };
      map[br].revenue += p.revenueNeto;
      map[br].cogs += (p.cogs ?? 0);
      map[br].productCount += 1;
    });
    return Object.entries(map)
      .map(([name, d]) => ({
        name,
        revenue: d.revenue,
        cogs: d.cogs,
        marginPct: d.revenue > 0 ? ((d.revenue - d.cogs) / d.revenue) * 100 : 0,
        markupPct: d.cogs > 0 ? ((d.revenue - d.cogs) / d.cogs) * 100 : 0,
        productCount: d.productCount,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filtered]);

  const marginSorted = useMemo(() => {
    if (!marginSort.column || !marginSort.direction) return marginCatalog;
    return [...marginCatalog].sort((a, b) => {
      let aV: number, bV: number;
      switch (marginSort.column) {
        case "avgPrice": aV = a.avgPrice; bV = b.avgPrice; break;
        case "costPrice": aV = a.costPrice ?? 0; bV = b.costPrice ?? 0; break;
        case "marginPct": aV = a.marginPct ?? -999; bV = b.marginPct ?? -999; break;
        case "marginAbs": aV = a.marginAbs ?? 0; bV = b.marginAbs ?? 0; break;
        case "unitsSold": aV = a.unitsSold; bV = b.unitsSold; break;
        case "revenue": aV = a.revenue; bV = b.revenue; break;
        case "cogs": aV = a.cogs ?? 0; bV = b.cogs ?? 0; break;
        case "stock": aV = a.stock ?? 0; bV = b.stock ?? 0; break;
        case "marginPerUnit": {
          const aCost = a.costPrice ?? 0;
          const bCost = b.costPrice ?? 0;
          aV = a.avgPriceNeto - aCost;
          bV = b.avgPriceNeto - bCost;
          break;
        }
        case "markup": {
          const aCst = a.costPrice ?? 0;
          const bCst = b.costPrice ?? 0;
          aV = aCst > 0 ? ((a.avgPriceNeto - aCst) / aCst) * 100 : -999;
          bV = bCst > 0 ? ((b.avgPriceNeto - bCst) / bCst) * 100 : -999;
          break;
        }
        default: return 0;
      }
      return marginSort.direction === "asc" ? (aV > bV ? 1 : -1) : (aV < bV ? 1 : -1);
    });
  }, [marginCatalog, marginSort]);

  const marginTotalPages = Math.ceil(marginSorted.length / MARGIN_PER_PAGE);
  const marginPaginated = useMemo(() => {
    const s = (marginPage - 1) * MARGIN_PER_PAGE;
    return marginSorted.slice(s, s + MARGIN_PER_PAGE);
  }, [marginSorted, marginPage]);

  useEffect(() => { setMarginPage(1); }, [marginRangeFilter, marginSort, brandFilter, categoryFilter, searchTerm]);

  const handleMarginSort = (col: string) => {
    setMarginSort((prev) => {
      if (prev.column === col) {
        if (prev.direction === "asc") return { column: col, direction: "desc" };
        if (prev.direction === "desc") return { column: null, direction: null };
      }
      return { column: col, direction: "asc" };
    });
  };
  const marginSortIcon = (col: string) => {
    if (marginSort.column !== col) return null;
    return marginSort.direction === "asc" ? <ArrowUp className="w-3 h-3 inline ml-0.5" /> : <ArrowDown className="w-3 h-3 inline ml-0.5" />;
  };

  const exportMarginCSV = () => {
    const headers = ["Producto", "SKU", "Marca", "Categoria", "Precio c/IVA", "Precio s/IVA", "Costo", "Margen %", "Markup %", "Margen $/ud", "Unidades", "Facturacion c/IVA", "Revenue Neto", "COGS", "Ganancia", "Stock", "ABC"];
    const rows = marginSorted.map((p) => {
      const cost = p.costPrice ?? 0;
      const marginPerUnit = p.avgPriceNeto - cost;
      const markupPct = cost > 0 ? ((p.avgPriceNeto - cost) / cost) * 100 : 0;
      return [
        `"${p.name.replace(/"/g, '""')}"`, p.sku || "", p.brand || "", p.category || "",
        p.avgPrice.toFixed(2), p.avgPriceNeto.toFixed(2), cost.toFixed(2),
        (p.marginPct ?? 0).toFixed(1), markupPct.toFixed(1), marginPerUnit.toFixed(2),
        p.unitsSold, p.revenue.toFixed(2), p.revenueNeto.toFixed(2), (p.cogs ?? 0).toFixed(2),
        (p.marginAbs ?? 0).toFixed(2), p.stock ?? 0, p.trendData.abcClass,
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `margenes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  /* ── Loading state ─────────────────────────────────── */
  if (loading && products.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mr-3" />
        <span className="text-gray-500">Cargando productos...</span>
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────── */
  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Image modal */}
      {enlargedImage && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center" onClick={() => setEnlargedImage(null)}>
          <div className="relative max-w-md">
            <img src={enlargedImage.url} alt={enlargedImage.name} className="w-full rounded-lg" />
            <button onClick={() => setEnlargedImage(null)} className="absolute top-2 right-2 bg-white rounded-full p-1">
              <X className="w-6 h-6 text-gray-800" />
            </button>
          </div>
        </div>
      )}

      {/* Header + Date Range */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Productos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rendimiento de productos &middot; {dateFrom} a {dateTo}
          </p>
        </div>
        <DateRangeFilter
          dateFrom={dateFrom} dateTo={dateTo}
          activeQuickRange={activeQuickRange}
          quickRanges={QUICK_RANGES}
          onQuickRange={handleQuickRange}
          onDateChange={handleDateChange}
          loading={loading}
        />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard icon={<DollarSign size={16} className="text-indigo-600" />} iconBg="bg-indigo-50" label="Facturacion Total" value={formatCompact(kpiStats.totalRevenue)} />
        <KpiCard icon={<Package size={16} className="text-green-600" />} iconBg="bg-green-50" label="Unidades Vendidas" value={kpiStats.totalUnits.toLocaleString("es-AR")} />
        <KpiCard icon={<DollarSign size={16} className="text-amber-600" />} iconBg="bg-amber-50" label="Ticket Promedio" value={formatARS(kpiStats.ticketPromedio)} />
        <KpiCard icon={<Zap size={16} className="text-cyan-600" />} iconBg="bg-cyan-50" label="Productos Activos" value={kpiStats.productosActivos.toLocaleString("es-AR")} />
        <KpiCard icon={<Package size={16} className="text-purple-600" />} iconBg="bg-purple-50" label="Stock Total (uds)" value={kpiStats.totalStock.toLocaleString("es-AR")} />
        <KpiCard icon={<Layers size={16} className="text-orange-600" />} iconBg="bg-orange-50" label="Valor de Stock" value={formatCompact(kpiStats.valorStock)} />
      </div>

      {/* Stock Health Alerts Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStockDaysFilter(stockDaysFilter === "agotado" ? "" : "agotado")}>
          <div className="flex items-center gap-2 mb-1">
            <X className="w-4 h-4 text-red-500" />
            <span className="text-xs text-gray-500 font-medium">Sin Stock</span>
          </div>
          <p className={`text-xl font-bold ${stockHealthAlerts.sinStock > 0 ? "text-red-600" : "text-gray-900"}`}>{stockHealthAlerts.sinStock}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">productos con stock = 0</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStockDaysFilter(stockDaysFilter === "critical" ? "" : "critical")}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-gray-500 font-medium">Stock Critico</span>
          </div>
          <p className={`text-xl font-bold ${stockHealthAlerts.critico > 0 ? "text-amber-600" : "text-gray-900"}`}>{stockHealthAlerts.critico}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">menos de 7 dias de stock</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStockDaysFilter(stockDaysFilter === "high" ? "" : "high")}>
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-gray-500 font-medium">Sobrestock</span>
          </div>
          <p className={`text-xl font-bold ${stockHealthAlerts.sobrestock > 0 ? "text-blue-600" : "text-gray-900"}`}>{stockHealthAlerts.sobrestock}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">mas de 90 dias de stock</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-500 font-medium">Dias Stock Promedio</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{Math.round(stockHealthAlerts.diasPromedio)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">promedio ponderado</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            placeholder="Buscar producto o SKU..."
            className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          {searchTerm && (
            <button onClick={() => { setSearchTerm(""); setCurrentPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <select value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); setCurrentPage(1); }}
          className={`px-3 py-2 border rounded-lg text-sm text-gray-900 ${brandFilter ? "border-indigo-300 bg-indigo-50" : "border-gray-300 bg-white"}`}>
          <option value="">Todas las marcas ({brands.length})</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
          className={`px-3 py-2 border rounded-lg text-sm text-gray-900 ${categoryFilter ? "border-indigo-300 bg-indigo-50" : "border-gray-300 bg-white"}`}>
          <option value="">Todas las categorias ({categories.length})</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-sm text-gray-600">{filtered.length} producto{filtered.length !== 1 ? "s" : ""}</span>
        <button onClick={exportCSV} className="ml-auto flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
          <Download className="w-4 h-4" />Exportar CSV
        </button>
      </div>

      {/* Stock Health Chips */}
      <StockChips active={stockDaysFilter} onChange={(k) => { setStockDaysFilter(k); setCurrentPage(1); }} counts={stockChipCounts} />

      {/* Tab Navigation */}
      <div className="bg-gray-100 p-1 rounded-lg inline-flex gap-1 w-full">
        {(["overview", "trends", "stock", "margins"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${activeTab === tab ? "bg-white shadow-sm text-indigo-600" : "text-gray-600 hover:text-gray-900"}`}>
            {tab === "overview" ? "Overview" : tab === "trends" ? "Tendencias" : tab === "stock" ? "Stock" : "Margenes"}
          </button>
        ))}
      </div>

      {/* ──────────────── TAB: OVERVIEW ──────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Metric Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 font-medium">Metrica:</span>
            <div className="bg-gray-100 p-1 rounded-lg inline-flex gap-1">
              {(["revenue", "units"] as const).map((m) => (
                <button key={m} onClick={() => setChartMetric(m)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${chartMetric === m ? "bg-white shadow-sm text-indigo-600" : "text-gray-600"}`}>
                  {m === "revenue" ? "Facturacion" : "Unidades"}
                </button>
              ))}
            </div>
          </div>

          {/* Distribution Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Brand Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4">Por Marca</h3>
              <div className="flex gap-4">
                <div className="flex-shrink-0" style={{ width: "220px", height: "220px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={brandDistribution.slice(0, 10)} cx="50%" cy="50%" outerRadius={90} dataKey="value" labelLine={false}>
                        {brandDistribution.slice(0, 10).map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => { const t = brandDistribution.reduce((s, e) => s + e.value, 0); return chartMetric === "revenue" ? `${formatARS(v)} (${t > 0 ? ((v / t) * 100).toFixed(1) : 0}%)` : `${v?.toLocaleString("es-AR")} uds`; }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[220px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr>
                        <th className="text-left py-1 text-gray-500 font-medium">Marca</th>
                        <th className="text-right py-1 text-gray-500 font-medium">{chartMetric === "revenue" ? "Facturacion" : "Unidades"}</th>
                        <th className="text-right py-1 text-gray-500 font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => { const t = brandDistribution.reduce((s, e) => s + e.value, 0); return brandDistribution.map((e) => (
                        <tr key={e.name} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="py-1.5 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} /><span className="text-gray-800 truncate max-w-[120px]" title={e.name}>{e.name}</span></td>
                          <td className="py-1.5 text-right text-gray-700 font-medium">{chartMetric === "revenue" ? formatCompact(e.value) : e.value?.toLocaleString("es-AR")}</td>
                          <td className="py-1.5 text-right text-gray-600">{t > 0 ? ((e.value / t) * 100).toFixed(1) : "0"}%</td>
                        </tr>
                      )); })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Category Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4">Por Categoria</h3>
              <div className="flex gap-4">
                <div className="flex-shrink-0" style={{ width: "220px", height: "220px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryDistribution.slice(0, 10)} cx="50%" cy="50%" outerRadius={90} dataKey="value" labelLine={false}>
                        {categoryDistribution.slice(0, 10).map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => { const t = categoryDistribution.reduce((s, e) => s + e.value, 0); return chartMetric === "revenue" ? `${formatARS(v)} (${t > 0 ? ((v / t) * 100).toFixed(1) : 0}%)` : `${v?.toLocaleString("es-AR")} uds`; }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[220px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr>
                        <th className="text-left py-1 text-gray-500 font-medium">Categoria</th>
                        <th className="text-right py-1 text-gray-500 font-medium">{chartMetric === "revenue" ? "Facturacion" : "Unidades"}</th>
                        <th className="text-right py-1 text-gray-500 font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => { const t = categoryDistribution.reduce((s, e) => s + e.value, 0); return categoryDistribution.map((e) => (
                        <tr key={e.name} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="py-1.5 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} /><span className="text-gray-800 truncate max-w-[120px]" title={e.name}>{e.name}</span></td>
                          <td className="py-1.5 text-right text-gray-700 font-medium">{chartMetric === "revenue" ? formatCompact(e.value) : e.value?.toLocaleString("es-AR")}</td>
                          <td className="py-1.5 text-right text-gray-600">{t > 0 ? ((e.value / t) * 100).toFixed(1) : "0"}%</td>
                        </tr>
                      )); })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Products Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Productos ({filtered.length})</h3>
              <ColumnSelector columns={OVERVIEW_COLUMNS} visible={overviewCols}
                onChange={(k, v) => setOverviewCols(prev => ({ ...prev, [k]: v }))} />
            </div>
            <div className="overflow-x-auto flex-1 flex flex-col">
              <div className="overflow-y-auto max-h-[600px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3 text-left font-semibold text-gray-700">Producto</th>
                      {isOvCol("facturacion") && <th className="px-6 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("revenue")}>
                        <TooltipHeader text="Facturacion" tooltip={COLUMN_TOOLTIPS.facturacion} />{sortIcon("revenue")}
                      </th>}
                      {isOvCol("margen") && <th className="px-6 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("marginPct")}>
                        <TooltipHeader text="Margen" tooltip="Margen bruto: (Precio neto - Costo) / Precio neto" />{sortIcon("marginPct")}
                      </th>}
                      {isOvCol("porcMarca") && <th className="px-6 py-3 text-right font-semibold text-gray-700"><TooltipHeader text="% Marca" tooltip={COLUMN_TOOLTIPS.porcMarca} /></th>}
                      {isOvCol("porcCat") && <th className="px-6 py-3 text-right font-semibold text-gray-700"><TooltipHeader text="% Cat." tooltip={COLUMN_TOOLTIPS.porcCat} /></th>}
                      {isOvCol("porcTotal") && <th className="px-6 py-3 text-right font-semibold text-gray-700"><TooltipHeader text="% Total" tooltip={COLUMN_TOOLTIPS.porcTotal} /></th>}
                      {isOvCol("unidades") && <th className="px-6 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("unitsSold")}>
                        <TooltipHeader text="Unidades" tooltip={COLUMN_TOOLTIPS.unidades} />{sortIcon("unitsSold")}
                      </th>}
                      {isOvCol("wow") && <th className="px-6 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("wowRevenuePct")}>
                        <TooltipHeader text="WoW" tooltip={COLUMN_TOOLTIPS.tendencia} />{sortIcon("wowRevenuePct")}
                      </th>}
                      {isOvCol("stock") && <th className="px-6 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("stock")}>
                        <TooltipHeader text="Stock" tooltip={COLUMN_TOOLTIPS.stock} />{sortIcon("stock")}
                      </th>}
                      {isOvCol("diasStock") && <th className="px-6 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("daysOfStock")}>
                        <TooltipHeader text="Dias" tooltip={COLUMN_TOOLTIPS.diasstock} />{sortIcon("daysOfStock")}
                      </th>}
                      {isOvCol("abc") && <th className="px-6 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("abc")}>
                        <TooltipHeader text="ABC" tooltip={COLUMN_TOOLTIPS.abc} />{sortIcon("abc")}
                      </th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {paginatedProducts.map((p) => {
                      const brandRev = revenueCalcs.brandT.get(p.brand || "Sin marca") || 1;
                      const catRev = revenueCalcs.catT.get(p.category || "Sin categoria") || 1;
                      const pMarca = (p.revenue / brandRev) * 100;
                      const pCat = (p.revenue / catRev) * 100;
                      const pTotal = revenueCalcs.total > 0 ? (p.revenue / revenueCalcs.total) * 100 : 0;
                      return (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {p.imageUrl && (
                                <img src={p.imageUrl} alt={p.name} className="w-8 h-8 rounded object-cover cursor-pointer hover:opacity-80" onClick={() => setEnlargedImage({ url: p.imageUrl!, name: p.name })} />
                              )}
                              <div>
                                <div className="font-medium text-gray-900">{p.name}</div>
                                <div className="text-xs text-gray-500 mb-1">{p.sku || "--"}</div>
                                <div className="flex gap-1.5">
                                  {p.brand && <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-medium">{p.brand}</span>}
                                  {p.category && <span className="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-[10px] font-medium">{p.category}</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          {isOvCol("facturacion") && <td className="px-6 py-4 text-right font-medium text-gray-900">{formatARS(p.revenue)}</td>}
                          {isOvCol("margen") && <td className="px-6 py-4 text-center">
                            {p.marginPct != null ? (
                              <span className={`px-2 py-1 text-xs font-bold rounded-md ${
                                p.marginPct >= 50 ? "bg-green-100 text-green-700" :
                                p.marginPct >= 30 ? "bg-amber-100 text-amber-700" :
                                p.marginPct >= 0 ? "bg-red-100 text-red-700" :
                                "bg-red-200 text-red-800"
                              }`}>{p.marginPct.toFixed(1)}%</span>
                            ) : <span className="text-gray-400 text-xs">--</span>}
                          </td>}
                          {isOvCol("porcMarca") && <td className="px-6 py-4 text-right text-gray-700">{pMarca.toFixed(1)}%</td>}
                          {isOvCol("porcCat") && <td className="px-6 py-4 text-right text-gray-700">{pCat.toFixed(1)}%</td>}
                          {isOvCol("porcTotal") && <td className="px-6 py-4 text-right text-gray-700">{pTotal.toFixed(1)}%</td>}
                          {isOvCol("unidades") && <td className="px-6 py-4 text-right text-gray-700">{formatCompact(p.unitsSold)}</td>}
                          {isOvCol("wow") && <td className="px-6 py-4 text-center"><TrendIndicator value={p.trendData.wowRevenuePct} /></td>}
                          {isOvCol("stock") && <td className="px-6 py-4 text-center"><span className={`font-medium ${(p.stock ?? 0) === 0 ? "text-red-600" : "text-gray-900"}`}>{p.stock ?? 0}</span></td>}
                          {isOvCol("diasStock") && <td className="px-6 py-4 text-center"><StockBadge daysOfStock={p.stockData.daysOfStock} stockHealth={p.stockData.stockHealth} stock={p.stock} /></td>}
                          {isOvCol("abc") && <td className="px-6 py-4 text-center"><ABCBadge abcClass={p.trendData.abcClass} /></td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  Mostrando {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filtered.length)}-{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} de {filtered.length}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 rounded-md bg-white hover:bg-gray-100 disabled:opacity-50 text-gray-700">Anterior</button>
                  <span className="px-4 py-1 text-gray-700 font-medium">Pag {currentPage} de {totalPages}</span>
                  <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 rounded-md bg-white hover:bg-gray-100 disabled:opacity-50 text-gray-700">Siguiente</button>
                </div>
              </div>
            )}
          </div>

          {/* Bags Analytics */}
          {bagsAnalytics && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-6 rounded-xl border border-amber-200">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingBag className="w-5 h-5 text-amber-700" />
                <h3 className="text-lg font-semibold text-amber-900">Bolsas de Compra</h3>
                <span className="ml-auto text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded-full">Periodo seleccionado</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-white/80 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Unidades Vendidas</p>
                  <p className="text-xl font-bold text-amber-800">{bagsAnalytics.totalBagsSold.toLocaleString("es-AR")}</p>
                </div>
                <div className="bg-white/80 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Revenue</p>
                  <p className="text-xl font-bold text-amber-800">${bagsAnalytics.bagsRevenue.toLocaleString("es-AR")}</p>
                </div>
                <div className="bg-white/80 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Stock Actual</p>
                  <p className="text-xl font-bold text-amber-800">{bagsAnalytics.currentStock.total.toLocaleString("es-AR")}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Grande: {bagsAnalytics.currentStock.grande.toLocaleString("es-AR")} | Chica: {bagsAnalytics.currentStock.chica.toLocaleString("es-AR")}</p>
                </div>
                <div className="bg-white/80 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Adopcion</p>
                  <p className="text-xl font-bold text-amber-800">{bagsAnalytics.bagAdoptionPct}%</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{bagsAnalytics.ordersWithBags} de {bagsAnalytics.totalOrders} ordenes</p>
                  <div className="w-full bg-amber-200 rounded-full h-1.5 mt-1.5">
                    <div className="bg-amber-600 h-1.5 rounded-full" style={{ width: Math.min(bagsAnalytics.bagAdoptionPct, 100) + "%" }} />
                  </div>
                </div>
              </div>
              {bagsAnalytics.breakdown.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {bagsAnalytics.breakdown.map((bag, i) => (
                    <span key={i} className="text-xs bg-white/60 text-amber-800 px-2 py-1 rounded border border-amber-200">
                      {bag.name.length > 40 ? bag.name.substring(0, 40) + "..." : bag.name}: {bag.unitsSold}u - stock {bag.stock ?? "N/A"}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ──────────────── TAB: TENDENCIAS ─────────────── */}
      {activeTab === "trends" && (
        <div className="space-y-6">
          {/* Category Evolution */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Evolucion por Categoria</h3>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={categoryTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="weekStart" tick={{ fontSize: 12 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => formatARS(v)} labelFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`; }} />
                {categoryDistribution.slice(0, 5).map((c) => (
                  <Area key={c.name} type="monotone" dataKey={c.name} fill={c.color} stroke={c.color} fillOpacity={0.3} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Brand Evolution */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Evolucion por Marca</h3>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={brandTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="weekStart" tick={{ fontSize: 12 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => formatARS(v)} labelFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`; }} />
                {brandDistribution.slice(0, 5).map((b) => (
                  <Area key={b.name} type="monotone" dataKey={b.name} fill={b.color} stroke={b.color} fillOpacity={0.3} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Top Growing */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-xl shadow-sm border border-green-200">
            <h3 className="font-semibold text-green-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> Top Productos en Alza
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-green-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-green-900">#</th>
                    <th className="px-4 py-3 text-left font-semibold text-green-900">Producto</th>
                    <th className="px-4 py-3 text-right font-semibold text-green-900">WoW%</th>
                    <th className="px-4 py-3 text-right font-semibold text-green-900">Facturacion</th>
                    <th className="px-4 py-3 text-center font-semibold text-green-900">Sparkline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-green-200">
                  {topGrowing.map((p, i) => (
                    <tr key={p.id} className="hover:bg-green-100/50">
                      <td className="px-4 py-3 text-green-900 font-bold">{i + 1}</td>
                      <td className="px-4 py-3 flex items-center gap-2">
                        {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="w-6 h-6 rounded object-cover" />}
                        <span className="text-green-900 font-medium">{p.name}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 font-bold">+{p.trendData.wowRevenuePct.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right text-green-900 font-medium">{formatARS(p.revenue)}</td>
                      <td className="px-4 py-3 text-center"><Sparkline data={p.trendData.weeklyTrend.map((w) => w.revenue)} color="#10b981" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Declining */}
          <div className="bg-gradient-to-br from-red-50 to-rose-50 p-6 rounded-xl shadow-sm border border-red-200">
            <h3 className="font-semibold text-red-900 mb-4 flex items-center gap-2">
              <TrendingDown className="w-5 h-5" /> Productos en Caida
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-red-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-red-900">#</th>
                    <th className="px-4 py-3 text-left font-semibold text-red-900">Producto</th>
                    <th className="px-4 py-3 text-right font-semibold text-red-900">WoW%</th>
                    <th className="px-4 py-3 text-right font-semibold text-red-900">Facturacion</th>
                    <th className="px-4 py-3 text-center font-semibold text-red-900">Sparkline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-200">
                  {topDeclining.map((p, i) => (
                    <tr key={p.id} className="hover:bg-red-100/50">
                      <td className="px-4 py-3 text-red-900 font-bold">{i + 1}</td>
                      <td className="px-4 py-3 flex items-center gap-2">
                        {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="w-6 h-6 rounded object-cover" />}
                        <span className="text-red-900 font-medium">{p.name}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-red-600 font-bold">{p.trendData.wowRevenuePct.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right text-red-900 font-medium">{formatARS(p.revenue)}</td>
                      <td className="px-4 py-3 text-center"><Sparkline data={p.trendData.weeklyTrend.map((w) => w.revenue)} color="#ef4444" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── TAB: STOCK INTELIGENTE ──────── */}
      {activeTab === "stock" && (
        <div className="space-y-6">
          {/* Stock KPIs */}
          {stockSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard icon={<Package size={16} className="text-blue-600" />} iconBg="bg-blue-50" label="Total en Stock" value={formatCompact(stockSummary.totalStockUnits)} subtitle="unidades" />
              <KpiCard icon={<DollarSign size={16} className="text-green-600" />} iconBg="bg-green-50" label="Valor Inventario" value={formatARS(stockSummary.totalStockValue)} subtitle="capital" />
              <KpiCard icon={<AlertTriangle size={16} className="text-amber-600" />} iconBg="bg-amber-50" label="En Riesgo" value={String(stockSummary.criticalCount + stockSummary.lowCount)} subtitle={`${stockSummary.criticalCount} critico, ${stockSummary.lowCount} bajo`} />
              <KpiCard icon={<Zap size={16} className="text-red-600" />} iconBg="bg-red-50" label="Stock Muerto" value={String(stockSummary.deadCount)} subtitle="sin venta" />
            </div>
          )}

          {/* Stock Health Pie */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Salud General del Inventario</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex justify-center">
                <ResponsiveContainer width={250} height={250}>
                  <PieChart>
                    <Pie data={distributionData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                      {distributionData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="col-span-2 space-y-3">
                {distributionData.map((item) => {
                  const total = distributionData.reduce((s, d) => s + d.value, 0);
                  return (
                    <div key={item.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-sm font-medium text-gray-900">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{item.value}</span>
                        <span className="text-xs text-gray-600">({total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Stock por Marca */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Stock por Marca (Top 10)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stockByBrandData} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => `${v} unidades`} />
                <Bar dataKey="units" fill="#6366f1" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ABC Classification */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Clasificacion ABC</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm font-semibold text-green-900">Clase A</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{abcCounts.A}</p>
                <p className="text-xs text-green-700 mt-1">{((abcCounts.A / (filtered.length || 1)) * 100).toFixed(1)}% de productos</p>
                <p className="text-[10px] text-green-600 mt-0.5">80% del revenue</p>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm font-semibold text-amber-900">Clase B</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{abcCounts.B}</p>
                <p className="text-xs text-amber-700 mt-1">{((abcCounts.B / (filtered.length || 1)) * 100).toFixed(1)}% de productos</p>
                <p className="text-[10px] text-amber-600 mt-0.5">15% del revenue</p>
              </div>
              <div className="p-4 bg-gray-100 rounded-lg border border-gray-300">
                <p className="text-sm font-semibold text-gray-900">Clase C</p>
                <p className="text-2xl font-bold text-gray-600 mt-1">{abcCounts.C}</p>
                <p className="text-xs text-gray-700 mt-1">{((abcCounts.C / (filtered.length || 1)) * 100).toFixed(1)}% de productos</p>
                <p className="text-[10px] text-gray-500 mt-0.5">5% del revenue</p>
              </div>
            </div>
          </div>

          {/* Stock Alerts */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" /> Alertas de Quiebre de Stock
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {stockAlerts.length} producto{stockAlerts.length !== 1 ? "s" : ""} en alerta
            </p>
            {stockAlerts.length === 0 ? (
              <p className="text-gray-500 py-8 text-center">No hay productos con alertas de quiebre.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left font-semibold text-gray-700">Producto</th>
                        <th className="px-6 py-3 text-right font-semibold text-gray-700">Stock</th>
                        <th className="px-6 py-3 text-right font-semibold text-gray-700">Velocidad</th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-700">Dias</th>
                        <th className="px-6 py-3 text-left font-semibold text-gray-700">Fecha Quiebre</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {stockAlertsPaginated.map((p) => (
                        <tr key={p.id} className={p.stockData.stockHealth === "critical" ? "bg-red-50" : "bg-amber-50"}>
                          <td className="px-6 py-4 flex items-center gap-3">
                            {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="w-8 h-8 rounded object-cover" />}
                            <div>
                              <div className="font-medium text-gray-900">{p.name}</div>
                              <div className="text-xs text-gray-500">{p.sku || "--"}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-gray-900">{p.stock ?? 0}</td>
                          <td className="px-6 py-4 text-right text-gray-700">{p.stockData.dailySalesRate.toFixed(1)} uds/dia</td>
                          <td className="px-6 py-4 text-center"><StockBadge daysOfStock={p.stockData.daysOfStock} stockHealth={p.stockData.stockHealth} stock={p.stock} /></td>
                          <td className="px-6 py-4 text-gray-700">{p.stockData.stockoutDate ? new Date(p.stockData.stockoutDate).toLocaleDateString("es-AR") : "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {stockAlertsTotalPages > 1 && (
                  <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between text-sm mt-4">
                    <span className="text-gray-600">Mostrando {Math.min((stockAlertsPage - 1) * STOCK_ITEMS_PER_PAGE + 1, stockAlerts.length)}-{Math.min(stockAlertsPage * STOCK_ITEMS_PER_PAGE, stockAlerts.length)} de {stockAlerts.length}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setStockAlertsPage(Math.max(1, stockAlertsPage - 1))} disabled={stockAlertsPage === 1} className="px-3 py-1 border rounded-md bg-white disabled:opacity-50">Anterior</button>
                      <span className="px-4 py-1 font-medium">Pag {stockAlertsPage}/{stockAlertsTotalPages}</span>
                      <button onClick={() => setStockAlertsPage(Math.min(stockAlertsTotalPages, stockAlertsPage + 1))} disabled={stockAlertsPage === stockAlertsTotalPages} className="px-3 py-1 border rounded-md bg-white disabled:opacity-50">Siguiente</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Dead Stock */}
          <div className="bg-gradient-to-br from-red-50 to-rose-50 p-6 rounded-xl shadow-sm border border-red-200">
            <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Stock Muerto - Capital Inmovilizado
            </h3>
            <p className="text-sm text-red-800 mb-4">Capital total inmovilizado: {formatARS(deadStockCapital)}</p>
            {deadStock.length === 0 ? (
              <p className="text-red-700 py-8 text-center">No hay productos con stock muerto.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-red-100 border-b border-red-300">
                      <tr>
                        <th className="px-6 py-3 text-left font-semibold text-red-900">Producto</th>
                        <th className="px-6 py-3 text-right font-semibold text-red-900">Stock</th>
                        <th className="px-6 py-3 text-right font-semibold text-red-900">Valor</th>
                        <th className="px-6 py-3 text-left font-semibold text-red-900">Ultima Venta</th>
                        <th className="px-6 py-3 text-right font-semibold text-red-900">Dias sin Venta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-200">
                      {deadStockPaginated.map((p) => {
                        const lastSale = p.stockData.lastSaleDate ? new Date(p.stockData.lastSaleDate) : null;
                        const daysNoSale = lastSale ? Math.floor((Date.now() - lastSale.getTime()) / 86400000) : null;
                        return (
                          <tr key={p.id} className="hover:bg-red-100/50">
                            <td className="px-6 py-4 flex items-center gap-3">
                              {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="w-8 h-8 rounded object-cover" />}
                              <div>
                                <div className="font-medium text-red-900">{p.name}</div>
                                <div className="text-xs text-red-700">{p.sku || "--"}</div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right font-medium text-red-900">{p.stock ?? 0}</td>
                            <td className="px-6 py-4 text-right font-bold text-red-600">{formatARS((p.stock ?? 0) * p.avgPrice)}</td>
                            <td className="px-6 py-4 text-red-700">{lastSale ? lastSale.toLocaleDateString("es-AR") : "--"}</td>
                            <td className="px-6 py-4 text-right text-red-900 font-semibold">{daysNoSale ?? "--"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {deadStockTotalPages > 1 && (
                  <div className="border-t border-red-200 px-6 py-4 bg-red-50 flex items-center justify-between text-sm mt-4">
                    <span className="text-red-700">Mostrando {Math.min((deadStockPage - 1) * STOCK_ITEMS_PER_PAGE + 1, deadStock.length)}-{Math.min(deadStockPage * STOCK_ITEMS_PER_PAGE, deadStock.length)} de {deadStock.length}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setDeadStockPage(Math.max(1, deadStockPage - 1))} disabled={deadStockPage === 1} className="px-3 py-1 border border-red-300 rounded-md bg-white disabled:opacity-50 text-red-700">Anterior</button>
                      <span className="px-4 py-1 text-red-700 font-medium">Pag {deadStockPage}/{deadStockTotalPages}</span>
                      <button onClick={() => setDeadStockPage(Math.min(deadStockTotalPages, deadStockPage + 1))} disabled={deadStockPage === deadStockTotalPages} className="px-3 py-1 border border-red-300 rounded-md bg-white disabled:opacity-50 text-red-700">Siguiente</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ──────────────── TAB: MARGENES ──────────────── */}
      {activeTab === "margins" && marginAnalysis && (
        <div className="space-y-6">
          {/* Margin KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="w-4 h-4 text-green-600" />
                <p className="text-xs text-gray-500 font-medium">Margen Bruto Prom.</p>
              </div>
              <p className={`text-2xl font-bold ${marginAnalysis.weightedMarginPct >= 40 ? "text-green-700" : marginAnalysis.weightedMarginPct >= 20 ? "text-amber-700" : "text-red-700"}`}>
                {marginAnalysis.weightedMarginPct.toFixed(1)}%
              </p>
              <p className="text-[10px] text-gray-400 mt-1">Ponderado por revenue neto (sin IVA)</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-indigo-600" />
                <p className="text-xs text-gray-500 font-medium">Revenue Neto (sin IVA)</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatARS(marginAnalysis.totalRevenueWithCost)}</p>
              <p className="text-[10px] text-gray-400 mt-1">{marginAnalysis.productsWithCost} productos con costo</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <PiggyBank className="w-4 h-4 text-amber-600" />
                <p className="text-xs text-gray-500 font-medium">Ganancia Bruta</p>
              </div>
              <p className="text-2xl font-bold text-green-700">{formatARS(marginAnalysis.grossProfit)}</p>
              <p className="text-[10px] text-gray-400 mt-1">COGS: {formatARS(marginAnalysis.totalCogs)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-500 font-medium">Sin Costo</p>
              </div>
              <p className="text-2xl font-bold text-gray-600">{marginAnalysis.productsWithoutCost}</p>
              <p className="text-[10px] text-gray-400 mt-1">Productos sin costPrice</p>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Margin Distribution */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4">Distribucion por Rango de Margen</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={marginAnalysis.distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number, name: string) => [name === "count" ? `${v} productos` : `${v.toFixed(1)}%`, name === "count" ? "Productos" : "Margen Prom."]} />
                  <Bar dataKey="count" name="Productos" radius={[4, 4, 0, 0]}>
                    {marginAnalysis.distribution.map((entry, i) => (
                      <Cell key={i} fill={entry.range === "Negativo" ? "#ef4444" : entry.range === "0-30%" ? "#f59e0b" : entry.range === "30-50%" ? "#eab308" : entry.range === "50-70%" ? "#22c55e" : "#16a34a"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Margin by Brand */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Margen por Marca (Top 10)</h3>
                {categoryFilter && <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">Filtro: {categoryFilter}</span>}
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={computedByBrand.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Margen"]} />
                  <Bar dataKey="marginPct" name="Margen" radius={[0, 4, 4, 0]}>
                    {computedByBrand.slice(0, 10).map((entry, i) => (
                      <Cell key={i} fill={entry.marginPct >= 50 ? "#22c55e" : entry.marginPct >= 30 ? "#eab308" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Margin by Category Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Margen por Categoria</h3>
                {brandFilter && <p className="text-xs text-indigo-600 mt-1">Filtrado por marca: {brandFilter}</p>}
              </div>
              <div className="flex items-center gap-2">
                <select value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); }}
                  className={`px-2 py-1.5 border rounded-lg text-xs text-gray-900 ${brandFilter ? "border-indigo-300 bg-indigo-50" : "border-gray-300 bg-white"}`}>
                  <option value="">Todas las marcas</option>
                  {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); }}
                  className={`px-2 py-1.5 border rounded-lg text-xs text-gray-900 ${categoryFilter ? "border-indigo-300 bg-indigo-50" : "border-gray-300 bg-white"}`}>
                  <option value="">Todas las categorias</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700">Categoria</th>
                    <th className="px-6 py-3 text-right font-semibold text-gray-700">Revenue</th>
                    <th className="px-6 py-3 text-right font-semibold text-gray-700">COGS</th>
                    <th className="px-6 py-3 text-center font-semibold text-gray-700">Margen %</th>
                    <th className="px-6 py-3 text-center font-semibold text-gray-700">Markup %</th>
                    <th className="px-6 py-3 text-right font-semibold text-gray-700">Ganancia</th>
                    <th className="px-6 py-3 text-right font-semibold text-gray-700">Productos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {computedByCategory.map((cat) => (
                    <tr key={cat.name} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{cat.name}</td>
                      <td className="px-6 py-3 text-right text-gray-700">{formatARS(cat.revenue)}</td>
                      <td className="px-6 py-3 text-right text-gray-500">{formatARS(cat.cogs)}</td>
                      <td className="px-6 py-3 text-center">
                        <span className={`px-2 py-1 text-xs font-bold rounded-md ${
                          cat.marginPct >= 50 ? "bg-green-100 text-green-700" :
                          cat.marginPct >= 30 ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        }`}>{cat.marginPct.toFixed(1)}%</span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className={`px-2 py-1 text-xs font-bold rounded-md ${
                          cat.markupPct >= 100 ? "bg-green-100 text-green-700" :
                          cat.markupPct >= 50 ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        }`}>{cat.markupPct.toFixed(1)}%</span>
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-green-700">{formatARS(cat.revenue - cat.cogs)}</td>
                      <td className="px-6 py-3 text-right text-gray-500">{cat.productCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top & Bottom Products */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Margin */}
            <div className="bg-white rounded-xl shadow-sm border border-green-200 overflow-hidden">
              <div className="p-4 border-b border-green-200 bg-green-50">
                <h3 className="font-semibold text-green-800 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Top 10 Mas Rentables
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-green-50/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-green-800">Producto</th>
                      <th className="px-4 py-2 text-right font-medium text-green-800">Revenue</th>
                      <th className="px-4 py-2 text-center font-medium text-green-800">Margen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-green-100">
                    {marginAnalysis.topMargin.map((p) => (
                      <tr key={p.id} className="hover:bg-green-50/50">
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-900 text-xs">{p.name.substring(0, 45)}</div>
                          <div className="text-[10px] text-gray-500">{p.sku}</div>
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700 text-xs">{formatCompact(p.revenue)}</td>
                        <td className="px-4 py-2 text-center">
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded">{p.marginPct?.toFixed(1)}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Margin */}
            <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
              <div className="p-4 border-b border-red-200 bg-red-50">
                <h3 className="font-semibold text-red-800 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4" /> Top 10 Menos Rentables
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-red-50/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-red-800">Producto</th>
                      <th className="px-4 py-2 text-right font-medium text-red-800">Revenue</th>
                      <th className="px-4 py-2 text-center font-medium text-red-800">Margen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {marginAnalysis.bottomMargin.map((p) => (
                      <tr key={p.id} className="hover:bg-red-50/50">
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-900 text-xs">{p.name.substring(0, 45)}</div>
                          <div className="text-[10px] text-gray-500">{p.sku}</div>
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700 text-xs">{formatCompact(p.revenue)}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                            (p.marginPct ?? 0) < 0 ? "bg-red-200 text-red-800" :
                            (p.marginPct ?? 0) < 30 ? "bg-red-100 text-red-700" :
                            "bg-amber-100 text-amber-700"
                          }`}>{p.marginPct?.toFixed(1)}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── Full Catalog Table ─────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900">Catalogo Completo - Analisis de Margenes</h3>
                <p className="text-xs text-gray-500 mt-1">{marginCatalog.length} productos con costo cargado</p>
              </div>
              <div className="flex items-center gap-2">
                <ColumnSelector columns={MARGIN_COLUMNS} visible={marginCols}
                  onChange={(k, v) => setMarginCols(prev => ({ ...prev, [k]: v }))} />
                <button onClick={exportMarginCSV} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors">
                  <Download className="w-4 h-4" />Exportar CSV
                </button>
              </div>
            </div>

            {/* Inline Filters for Margins */}
            <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-3 items-center">
              <div className="relative min-w-[180px] max-w-[260px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setMarginPage(1); }}
                  placeholder="SKU o producto..."
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <select value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); setMarginPage(1); }}
                className={`px-2 py-1.5 border rounded-lg text-xs text-gray-900 ${brandFilter ? "border-indigo-300 bg-indigo-50" : "border-gray-300 bg-white"}`}>
                <option value="">Todas las marcas</option>
                {brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setMarginPage(1); }}
                className={`px-2 py-1.5 border rounded-lg text-xs text-gray-900 ${categoryFilter ? "border-indigo-300 bg-indigo-50" : "border-gray-300 bg-white"}`}>
                <option value="">Todas las categorias</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {(searchTerm || brandFilter || categoryFilter) && (
                <button onClick={() => { setSearchTerm(""); setBrandFilter(""); setCategoryFilter(""); setMarginPage(1); }}
                  className="text-xs text-indigo-600 hover:text-indigo-800 underline">Limpiar filtros</button>
              )}
            </div>

            {/* Margin Range Chips */}
            <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-2">
              {MARGIN_CHIPS.map((c) => {
                const isActive = marginRangeFilter === c.key;
                const count = marginChipCounts[c.key as keyof typeof marginChipCounts] ?? 0;
                const colorMap: Record<string, string> = {
                  gray: isActive ? "bg-gray-800 text-white border-gray-800" : "bg-gray-100 text-gray-700 border-gray-300",
                  red: isActive ? "bg-red-600 text-white border-red-600" : "bg-red-50 text-red-700 border-red-300",
                  amber: isActive ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-700 border-amber-300",
                  yellow: isActive ? "bg-yellow-500 text-white border-yellow-500" : "bg-yellow-50 text-yellow-700 border-yellow-300",
                  green: isActive ? "bg-green-600 text-white border-green-600" : "bg-green-50 text-green-700 border-green-300",
                  emerald: isActive ? "bg-emerald-600 text-white border-emerald-600" : "bg-emerald-50 text-emerald-700 border-emerald-300",
                };
                return (
                  <button key={c.key} onClick={() => setMarginRangeFilter(c.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${colorMap[c.color]}`}>
                    {c.label}
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isActive ? "bg-white/20" : "bg-black/5"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Table */}
            <div className="overflow-x-auto flex-1 flex flex-col">
              <div className="overflow-y-auto max-h-[600px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 min-w-[200px]">Producto</th>
                      {isMgCol("precio") && <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleMarginSort("avgPrice")}>
                        <TooltipHeader text="Precio" tooltip="Precio de venta con IVA incluido" />{marginSortIcon("avgPrice")}
                      </th>}
                      {isMgCol("costo") && <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleMarginSort("costPrice")}>
                        <TooltipHeader text="Costo" tooltip="Costo unitario sin IVA" />{marginSortIcon("costPrice")}
                      </th>}
                      {isMgCol("margenPct") && <th className="px-3 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleMarginSort("marginPct")}>
                        <TooltipHeader text="Margen %" tooltip="(Precio neto - Costo) / Precio neto" />{marginSortIcon("marginPct")}
                      </th>}
                      {isMgCol("markup") && <th className="px-3 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleMarginSort("markup")}>
                        <TooltipHeader text="Markup %" tooltip="(Precio neto - Costo) / Costo" />{marginSortIcon("markup")}
                      </th>}
                      {isMgCol("margenUd") && <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleMarginSort("marginPerUnit")}>
                        Margen $/ud{marginSortIcon("marginPerUnit")}
                      </th>}
                      {isMgCol("unidades") && <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleMarginSort("unitsSold")}>
                        Uds{marginSortIcon("unitsSold")}
                      </th>}
                      {isMgCol("facturacion") && <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleMarginSort("revenue")}>
                        Facturacion{marginSortIcon("revenue")}
                      </th>}
                      {isMgCol("ganancia") && <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleMarginSort("marginAbs")}>
                        Ganancia{marginSortIcon("marginAbs")}
                      </th>}
                      {isMgCol("stock") && <th className="px-3 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => handleMarginSort("stock")}>
                        Stock{marginSortIcon("stock")}
                      </th>}
                      {isMgCol("abc") && <th className="px-3 py-3 text-center font-semibold text-gray-700">ABC</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {marginPaginated.map((p) => {
                      const cost = p.costPrice ?? 0;
                      const marginPerUnit = p.avgPriceNeto - cost;
                      const mPct = p.marginPct ?? 0;
                      const markupPct = cost > 0 ? ((p.avgPriceNeto - cost) / cost) * 100 : 0;
                      return (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="w-7 h-7 rounded object-cover flex-shrink-0" />}
                              <div className="min-w-0">
                                <div className="font-medium text-gray-900 text-xs truncate max-w-[220px]" title={p.name}>{p.name}</div>
                                <div className="text-[10px] text-gray-500">{p.sku || "--"} {p.brand && <span className="ml-1 text-indigo-600">{p.brand}</span>}</div>
                              </div>
                            </div>
                          </td>
                          {isMgCol("precio") && <td className="px-3 py-3 text-right text-gray-900 font-medium whitespace-nowrap">{formatARS(p.avgPrice)}</td>}
                          {isMgCol("costo") && <td className="px-3 py-3 text-right text-gray-500 whitespace-nowrap">{formatARS(cost)}</td>}
                          {isMgCol("margenPct") && <td className="px-3 py-3 text-center">
                            <span className={`px-2 py-1 text-xs font-bold rounded-md ${
                              mPct >= 50 ? "bg-green-100 text-green-700" :
                              mPct >= 30 ? "bg-amber-100 text-amber-700" :
                              mPct >= 0 ? "bg-red-100 text-red-700" :
                              "bg-red-200 text-red-800"
                            }`}>{mPct.toFixed(1)}%</span>
                          </td>}
                          {isMgCol("markup") && <td className="px-3 py-3 text-center">
                            <span className={`px-2 py-1 text-xs font-bold rounded-md ${
                              markupPct >= 100 ? "bg-green-100 text-green-700" :
                              markupPct >= 50 ? "bg-amber-100 text-amber-700" :
                              markupPct >= 0 ? "bg-red-100 text-red-700" :
                              "bg-red-200 text-red-800"
                            }`}>{markupPct.toFixed(1)}%</span>
                          </td>}
                          {isMgCol("margenUd") && <td className="px-3 py-3 text-right whitespace-nowrap">
                            <span className={marginPerUnit >= 0 ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
                              {formatARS(marginPerUnit)}
                            </span>
                          </td>}
                          {isMgCol("unidades") && <td className="px-3 py-3 text-right text-gray-700">{p.unitsSold.toLocaleString("es-AR")}</td>}
                          {isMgCol("facturacion") && <td className="px-3 py-3 text-right text-gray-900 font-medium whitespace-nowrap">{formatCompact(p.revenue)}</td>}
                          {isMgCol("ganancia") && <td className="px-3 py-3 text-right whitespace-nowrap">
                            <span className={(p.marginAbs ?? 0) >= 0 ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
                              {formatCompact(p.marginAbs ?? 0)}
                            </span>
                          </td>}
                          {isMgCol("stock") && <td className="px-3 py-3 text-center">
                            <span className={`font-medium ${(p.stock ?? 0) === 0 ? "text-red-600" : "text-gray-900"}`}>
                              {p.stock ?? 0}
                            </span>
                          </td>}
                          {isMgCol("abc") && <td className="px-3 py-3 text-center"><ABCBadge abcClass={p.trendData.abcClass} /></td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {marginTotalPages > 1 && (
              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  Mostrando {Math.min((marginPage - 1) * MARGIN_PER_PAGE + 1, marginSorted.length)}-{Math.min(marginPage * MARGIN_PER_PAGE, marginSorted.length)} de {marginSorted.length}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setMarginPage(Math.max(1, marginPage - 1))} disabled={marginPage === 1}
                    className="px-3 py-1 border border-gray-300 rounded-md bg-white hover:bg-gray-100 disabled:opacity-50 text-gray-700">Anterior</button>
                  <span className="px-4 py-1 text-gray-700 font-medium">Pag {marginPage} de {marginTotalPages}</span>
                  <button onClick={() => setMarginPage(Math.min(marginTotalPages, marginPage + 1))} disabled={marginPage === marginTotalPages}
                    className="px-3 py-1 border border-gray-300 rounded-md bg-white hover:bg-gray-100 disabled:opacity-50 text-gray-700">Siguiente</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
