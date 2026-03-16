// @ts-nocheck

"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import NitroInsightsPanel from "@/components/NitroInsightsPanel";
import { TrendingUp, TrendingDown, AlertTriangle, DollarSign, Package, Zap, ArrowUp, ArrowDown, X, Search, Download } from "lucide-react";

interface ProductItem {
  id: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  category: string | null;
  brand: string | null;
  stock: number | null;
  unitsSold: number;
  revenue: number;
  orders: number;
  avgPrice: number;
  trendData: {
    weeklyTrend: Array<{ weekStart: string; units: number; revenue: number }>;
    wowUnitsPct: number;
    wowRevenuePct: number;
    trendSlope: number;
    abcClass: "A" | "B" | "C";
  };
  stockData: {
    dailySalesRate: number;
    daysOfStock: number | null;
    stockoutDate: string | null;
    stockHealth: "critical" | "low" | "optimal" | "excessive" | null;
    isDead: boolean;
    lastSaleDate: string | null;
  };
}

interface StockSummary {
  criticalCount: number;
  lowCount: number;
  optimalCount: number;
  excessiveCount: number;
  deadCount: number;
  totalStockUnits: number;
  totalStockValue: number;
  productsAtRisk: number;
}

interface TrendSummary {
  growingCount: number;
  decliningCount: number;
  stableCount: number;
}

interface ApiResponse {
  products: ProductItem[];
  stockSummary: StockSummary;
  trendSummary: TrendSummary;
}

interface SortState {
  column: string | null;
  direction: 'asc' | 'desc' | null;
}

const COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#8b5cf6",
  "#f97316",
  "#14b8a6",
  "#ec4899",
  "#94a3b8",
];

const COLUMN_TOOLTIPS = {
  facturacion: "Ingresos totales por venta de este producto en los últimos 30 días",
  unidades: "Cantidad total de unidades vendidas en los últimos 30 días",
  tendencia: "Variación porcentual de ingresos entre la última semana y la anterior (Week over Week)",
  stock: "Unidades actualmente disponibles en inventario",
  diasstock: "Días estimados hasta agotar stock, basado en la velocidad de venta diaria actual",
  abc: "Clasificación ABC: A = Top 80% del revenue, B = siguiente 15%, C = último 5%",
  porcMarca: "Participación de este producto en la facturación total de su marca",
  porcCat: "Participación de este producto en la facturación total de su categoría",
  porcTotal: "Participación de este producto en la facturación total",
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length === 0) {
    return <div className="w-[60px] h-[24px]" />;
  }
  const chartData = data.map((v) => ({ v }));
  return (
    <ResponsiveContainer width={60} height={24}>
      <LineChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TrendIndicator({ wowRevenuePct }: { wowRevenuePct: number }) {
  if (wowRevenuePct > 5) {
    return (
      <div className="flex items-center gap-1 text-green-600 font-medium">
        <TrendingUp className="w-4 h-4" />
        <span>+{wowRevenuePct.toFixed(1)}%</span>
      </div>
    );
  } else if (wowRevenuePct < -5) {
    return (
      <div className="flex items-center gap-1 text-red-600 font-medium">
        <TrendingDown className="w-4 h-4" />
        <span>{wowRevenuePct.toFixed(1)}%</span>
      </div>
    );
  } else {
    return (
      <div className="flex items-center gap-1 text-gray-500 font-medium">
        <span className="text-lg">−</span>
        <span>{wowRevenuePct.toFixed(1)}%</span>
      </div>
    );
  }
}

function StockBadge({ daysOfStock, stockHealth, stock }: { daysOfStock: number | null; stockHealth: string | null; stock?: number | null }) {
  // Handle agotado (out of stock)
  if (stock !== undefined && stock !== null && stock === 0) {
    return <span className="px-2 py-1 text-xs rounded-md bg-red-200 text-red-800 font-bold">Agotado</span>;
  }

  let bgColor = "bg-gray-100 text-gray-700";
  if (stockHealth === "critical") bgColor = "bg-red-100 text-red-700 font-semibold";
  else if (stockHealth === "low") bgColor = "bg-amber-100 text-amber-700 font-semibold";
  else if (stockHealth === "optimal") bgColor = "bg-green-100 text-green-700";
  else if (stockHealth === "excessive") bgColor = "bg-blue-100 text-blue-700";

  // Format days display
  if (daysOfStock === null || daysOfStock === undefined) {
    return <span className={`px-2 py-1 text-xs rounded-md ${bgColor}`}>—</span>;
  }
  if (daysOfStock > 365) {
    return <span className={`px-2 py-1 text-xs rounded-md ${bgColor}`}>+365d</span>;
  }
  const rounded = Math.round(daysOfStock);
  return <span className={`px-2 py-1 text-xs rounded-md ${bgColor}`}>{rounded}d</span>;
}

function ABCBadge({ abcClass }: { abcClass: string }) {
  let bgColor = "bg-green-100 text-green-700";
  if (abcClass === "B") bgColor = "bg-amber-100 text-amber-700";
  else if (abcClass === "C") bgColor = "bg-gray-100 text-gray-700";

  return <span className={`px-2 py-1 text-xs font-bold rounded-md ${bgColor}`}>{abcClass}</span>;
}

function TooltipHeader({ text, tooltip }: { text: string; tooltip: string }) {
  return (
    <div className="relative group cursor-help">
      <span>{text}</span>
      <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-48 bg-gray-900 text-white text-xs rounded-lg p-2 shadow-lg pointer-events-none">
        {tooltip}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
      </div>
    </div>
  );
}

export default function ProductsPageV10() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [stockSummary, setStockSummary] = useState<StockSummary | null>(null);
  const [trendSummary, setTrendSummary] = useState<TrendSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "trends" | "stock">("overview");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [stockDaysFilter, setStockDaysFilter] = useState<string>("");
  const [chartMetric, setChartMetric] = useState<"revenue" | "units">("revenue");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortState, setSortState] = useState<SortState>({ column: "revenue", direction: "desc" });
  const [enlargedImage, setEnlargedImage] = useState<{ url: string; name: string } | null>(null);
  const [stockAlertsPage, setStockAlertsPage] = useState(1);
  const [deadStockPage, setDeadStockPage] = useState(1);

  const ITEMS_PER_PAGE = 30;
  const STOCK_ITEMS_PER_PAGE = 15;

  // Fetch data with defensive numeric parsing
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/metrics/products");
        const data: ApiResponse = await response.json();

        // Defensive data parsing - convert all numerics
        const parsedProducts = data.products.map(p => ({
          ...p,
          revenue: Number(p.revenue) || 0,
          unitsSold: Number(p.unitsSold) || 0,
          avgPrice: Number(p.avgPrice) || 0,
          stock: p.stock != null ? Number(p.stock) : null,
          orders: Number(p.orders) || 0,
          trendData: {
            ...p.trendData,
            wowUnitsPct: Number(p.trendData?.wowUnitsPct) || 0,
            wowRevenuePct: Number(p.trendData?.wowRevenuePct) || 0,
            trendSlope: Number(p.trendData?.trendSlope) || 0,
            weeklyTrend: (p.trendData?.weeklyTrend || []).map(w => ({
              ...w,
              units: Number(w.units) || 0,
              revenue: Number(w.revenue) || 0,
            })),
          },
          stockData: {
            ...p.stockData,
            dailySalesRate: Number(p.stockData?.dailySalesRate) || 0,
            daysOfStock: p.stockData?.daysOfStock != null ? Number(p.stockData.daysOfStock) : null,
          }
        }));

        setProducts(parsedProducts);
        setStockSummary(data.stockSummary);
        setTrendSummary(data.trendSummary);
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Apply filters
  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (brandFilter && p.brand !== brandFilter) return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const nameMatch = p.name.toLowerCase().includes(term);
        const skuMatch = p.sku?.toLowerCase().includes(term) || false;
        if (!nameMatch && !skuMatch) return false;
      }
      if (stockDaysFilter) {
        const days = p.stockData.daysOfStock;
        if (stockDaysFilter === "agotado") {
          if ((p.stock ?? 0) !== 0) return false;
        } else if (stockDaysFilter === "critical") {
          if (days === null || days > 7) return false;
        } else if (stockDaysFilter === "low") {
          if (days === null || days <= 7 || days > 30) return false;
        } else if (stockDaysFilter === "moderate") {
          if (days === null || days <= 30 || days > 90) return false;
        } else if (stockDaysFilter === "high") {
          if (days === null || days <= 90) return false;
        }
      }
      return true;
    });
  }, [products, brandFilter, categoryFilter, searchTerm, stockDaysFilter]);

  // Apply sorting
  const sortedFiltered = useMemo(() => {
    if (!sortState.column || !sortState.direction) {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      let aVal, bVal;

      switch (sortState.column) {
        case "revenue":
          aVal = a.revenue;
          bVal = b.revenue;
          break;
        case "unitsSold":
          aVal = a.unitsSold;
          bVal = b.unitsSold;
          break;
        case "stock":
          aVal = a.stock ?? 0;
          bVal = b.stock ?? 0;
          break;
        case "wowRevenuePct":
          aVal = a.trendData.wowRevenuePct;
          bVal = b.trendData.wowRevenuePct;
          break;
        case "daysOfStock":
          aVal = a.stockData.daysOfStock ?? 0;
          bVal = b.stockData.daysOfStock ?? 0;
          break;
        case "abc":
          aVal = a.trendData.abcClass;
          bVal = b.trendData.abcClass;
          break;
        default:
          return 0;
      }

      if (sortState.column === "abc") {
        const abcOrder = { A: 0, B: 1, C: 2 };
        const comparison = abcOrder[aVal] - abcOrder[bVal];
        return sortState.direction === "asc" ? comparison : -comparison;
      }

      if (sortState.direction === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });
  }, [filtered, sortState]);

  // Pagination
  const totalPages = Math.ceil(sortedFiltered.length / ITEMS_PER_PAGE);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedFiltered.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedFiltered, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [brandFilter, categoryFilter, sortState]);

  // Get unique brands and categories
  const brands = useMemo(() => {
    return [...new Set(products.map((p) => p.brand).filter(Boolean))].sort();
  }, [products]);

  const categories = useMemo(() => {
    return [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
  }, [products]);

  // Revenue calculations for percentage columns
  const revenueCalculations = useMemo(() => {
    const totalRevenue = filtered.reduce((sum, p) => sum + p.revenue, 0);

    const brandTotals = new Map<string, number>();
    filtered.forEach((p) => {
      const brand = p.brand || "Sin marca";
      brandTotals.set(brand, (brandTotals.get(brand) || 0) + p.revenue);
    });

    const categoryTotals = new Map<string, number>();
    filtered.forEach((p) => {
      const cat = p.category || "Sin categoría";
      categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + p.revenue);
    });

    return { totalRevenue, brandTotals, categoryTotals };
  }, [filtered]);

  // Category trends data
  const categoryTrends = useMemo(() => {
    const weekSet = new Set<string>();
    filtered.forEach((p) =>
      p.trendData.weeklyTrend.forEach((w) => weekSet.add(w.weekStart))
    );
    const weeks = [...weekSet].sort();

    const catRevenue = new Map<string, number>();
    filtered.forEach((p) => {
      const cat = p.category || "Sin categoría";
      catRevenue.set(cat, (catRevenue.get(cat) || 0) + p.revenue);
    });
    const topCats = [...catRevenue.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map((e) => e[0]);

    return weeks.map((week) => {
      const row: any = { weekStart: week };
      for (const cat of topCats) {
        row[cat] = filtered
          .filter((p) => (p.category || "Sin categoría") === cat)
          .reduce((sum, p) => {
            const weekData = p.trendData.weeklyTrend.find((w) => w.weekStart === week);
            return sum + (weekData ? weekData.revenue : 0);
          }, 0);
      }
      return row;
    });
  }, [filtered]);

  // Brand trends data
  const brandTrends = useMemo(() => {
    const weekSet = new Set<string>();
    filtered.forEach((p) =>
      p.trendData.weeklyTrend.forEach((w) => weekSet.add(w.weekStart))
    );
    const weeks = [...weekSet].sort();

    const brandRevenue = new Map<string, number>();
    filtered.forEach((p) => {
      const brand = p.brand || "Sin marca";
      brandRevenue.set(brand, (brandRevenue.get(brand) || 0) + p.revenue);
    });
    const topBrands = [...brandRevenue.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map((e) => e[0]);

    return weeks.map((week) => {
      const row: any = { weekStart: week };
      for (const brand of topBrands) {
        row[brand] = filtered
          .filter((p) => (p.brand || "Sin marca") === brand)
          .reduce((sum, p) => {
            const weekData = p.trendData.weeklyTrend.find((w) => w.weekStart === week);
            return sum + (weekData ? weekData.revenue : 0);
          }, 0);
      }
      return row;
    });
  }, [filtered]);

  // Top growing products
  const topGrowing = useMemo(() => {
    return filtered
      .filter((p) => p.trendData.wowRevenuePct > 0)
      .sort((a, b) => b.trendData.wowRevenuePct - a.trendData.wowRevenuePct)
      .slice(0, 10);
  }, [filtered]);

  // Top declining products
  const topDeclining = useMemo(() => {
    return filtered
      .filter((p) => p.trendData.wowRevenuePct < 0)
      .sort((a, b) => a.trendData.wowRevenuePct - b.trendData.wowRevenuePct)
      .slice(0, 10);
  }, [filtered]);

  // Stock alerts
  const stockAlerts = useMemo(() => {
    return filtered
      .filter((p) => p.stockData.stockHealth === "critical" || p.stockData.stockHealth === "low")
      .sort((a, b) => (a.stockData.daysOfStock ?? 999) - (b.stockData.daysOfStock ?? 999));
  }, [filtered]);

  const stockAlertsPaginated = useMemo(() => {
    const start = (stockAlertsPage - 1) * STOCK_ITEMS_PER_PAGE;
    return stockAlerts.slice(start, start + STOCK_ITEMS_PER_PAGE);
  }, [stockAlerts, stockAlertsPage]);

  const stockAlertsTotalPages = Math.ceil(stockAlerts.length / STOCK_ITEMS_PER_PAGE);

  // Dead stock
  const deadStock = useMemo(() => {
    return filtered
      .filter((p) => p.stockData.isDead)
      .sort((a, b) => (b.stock ?? 0) * b.avgPrice - (a.stock ?? 0) * a.avgPrice);
  }, [filtered]);

  const deadStockPaginated = useMemo(() => {
    const start = (deadStockPage - 1) * STOCK_ITEMS_PER_PAGE;
    return deadStock.slice(start, start + STOCK_ITEMS_PER_PAGE);
  }, [deadStock, deadStockPage]);

  const deadStockTotalPages = Math.ceil(deadStock.length / STOCK_ITEMS_PER_PAGE);

  const deadStockCapital = useMemo(() => {
    return deadStock.reduce((sum, p) => sum + ((p.stock ?? 0) * p.avgPrice), 0);
  }, [deadStock]);

  // Stock by brand chart data
  const stockByBrandData = useMemo(() => {
    const brandStock = new Map<string, number>();
    filtered.forEach((p) => {
      const brand = p.brand || "Sin marca";
      brandStock.set(brand, (brandStock.get(brand) || 0) + (p.stock ?? 0));
    });
    return [...brandStock.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value], idx) => ({
        name,
        units: value,
        color: COLORS[idx % COLORS.length],
      }));
  }, [filtered]);

  // ABC classification counts
  const abcCounts = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0 };
    filtered.forEach((p) => {
      counts[p.trendData.abcClass]++;
    });
    return counts;
  }, [filtered]);

  const abcChartData = [
    {
      clase: "Clase A",
      count: abcCounts.A,
      pct: ((abcCounts.A / filtered.length) * 100).toFixed(1),
    },
    {
      clase: "Clase B",
      count: abcCounts.B,
      pct: ((abcCounts.B / filtered.length) * 100).toFixed(1),
    },
    {
      clase: "Clase C",
      count: abcCounts.C,
      pct: ((abcCounts.C / filtered.length) * 100).toFixed(1),
    },
  ];

  // Distribution data
  const distributionData = useMemo(() => {
    if (!stockSummary) return [];
    return [
      { name: "Crítico", value: stockSummary.criticalCount, color: "#ef4444" },
      { name: "Bajo", value: stockSummary.lowCount, color: "#f59e0b" },
      { name: "Óptimo", value: stockSummary.optimalCount, color: "#10b981" },
      { name: "Excesivo", value: stockSummary.excessiveCount, color: "#3b82f6" },
      { name: "Muerto", value: stockSummary.deadCount, color: "#6b7280" },
    ];
  }, [stockSummary]);

  // Brand distribution
  const brandDistribution = useMemo(() => {
    const dist = new Map<string, number>();
    filtered.forEach((p) => {
      const brand = p.brand || "Sin marca";
      const val = chartMetric === "revenue" ? p.revenue : p.unitsSold;
      dist.set(brand, (dist.get(brand) || 0) + val);
    });
    return [...dist.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], idx) => ({
        name,
        value,
        color: COLORS[idx % COLORS.length],
      }));
  }, [filtered, chartMetric]);

  // Category distribution
  const categoryDistribution = useMemo(() => {
    const dist = new Map<string, number>();
    filtered.forEach((p) => {
      const cat = p.category || "Sin categoría";
      const val = chartMetric === "revenue" ? p.revenue : p.unitsSold;
      dist.set(cat, (dist.get(cat) || 0) + val);
    });
    return [...dist.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], idx) => ({
        name,
        value,
        color: COLORS[idx % COLORS.length],
      }));
  }, [filtered, chartMetric]);

  // KPI Stats computed from filtered products
  const kpiStats = useMemo(() => {
    const totalRevenue = filtered.reduce((s, p) => s + p.revenue, 0);
    const totalUnits = filtered.reduce((s, p) => s + p.unitsSold, 0);
    const ticketPromedio = totalUnits > 0 ? totalRevenue / totalUnits : 0;
    const productosActivos = filtered.length;
    const totalStock = filtered.reduce((s, p) => s + (p.stock ?? 0), 0);
    const valorStock = filtered.reduce((s, p) => s + (p.stock ?? 0) * p.avgPrice, 0);
    return { totalRevenue, totalUnits, ticketPromedio, productosActivos, totalStock, valorStock };
  }, [filtered]);

  // Stock health summary for KPI alerts
  const stockHealthAlerts = useMemo(() => {
    let sinStock = 0;
    let critico = 0;
    let sobrestock = 0;
    let diasSum = 0;
    let diasCount = 0;
    filtered.forEach((p) => {
      const stock = p.stock ?? 0;
      const days = p.stockData.daysOfStock;
      if (stock === 0) sinStock++;
      if (days !== null && days <= 7 && stock > 0) critico++;
      if (days !== null && days > 90) sobrestock++;
      if (days !== null && days > 0) {
        diasSum += days;
        diasCount++;
      }
    });
    const diasPromedio = diasCount > 0 ? diasSum / diasCount : 0;
    return { sinStock, critico, sobrestock, diasPromedio };
  }, [filtered]);


  const handleSort = (column: string) => {
    setSortState((prev) => {
      if (prev.column === column) {
        // Cycle: asc -> desc -> no sort
        if (prev.direction === "asc") {
          return { column, direction: "desc" };
        } else if (prev.direction === "desc") {
          return { column: null, direction: null };
        } else {
          return { column, direction: "asc" };
        }
      } else {
        // New column, start with asc
        return { column, direction: "asc" };
      }
    });
  };

  const getSortIndicator = (column: string) => {
    if (sortState.column !== column) return null;
    if (sortState.direction === "asc") return <ArrowUp className="w-4 h-4 inline ml-1" />;
    if (sortState.direction === "desc") return <ArrowDown className="w-4 h-4 inline ml-1" />;
    return null;
  };

  // CSV Export function
  const exportCSV = () => {
    const headers = ["Producto", "SKU", "Marca", "Categoría", "Facturación", "Unidades", "Tendencia WoW%", "Stock", "Días Stock", "Salud Stock", "ABC"];
    const rows = filtered.map((p) => {
      const days = p.stockData.daysOfStock;
      const daysStr = days === null ? "—" : days > 365 ? "+365" : Math.round(days).toString();
      return [
        `"${p.name.replace(/"/g, '""')}"`,
        p.sku || "",
        p.brand || "",
        p.category || "",
        p.revenue.toFixed(2),
        p.unitsSold,
        p.trendData.wowRevenuePct.toFixed(1),
        p.stock ?? 0,
        daysStr,
        p.stockData.stockHealth || "—",
        p.trendData.abcClass,
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `productos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Cargando productos...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Enlarged Image Modal */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative max-w-md">
            <img
              src={enlargedImage.url}
              alt={enlargedImage.name}
              className="w-full rounded-lg"
            />
            <button
              onClick={() => setEnlargedImage(null)}
              className="absolute top-2 right-2 bg-white rounded-full p-1 hover:bg-gray-100 transition-colors"
            >
              <X className="w-6 h-6 text-gray-800" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Productos</h1>
        <p className="text-sm text-gray-600 mt-1">
          Top productos por facturación · Últimos 30 días
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            placeholder="Buscar producto o SKU..."
            className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          {searchTerm && (
            <button
              onClick={() => { setSearchTerm(""); setCurrentPage(1); }}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="relative">
          <select
            value={brandFilter}
            onChange={(e) => { setBrandFilter(e.target.value); setCurrentPage(1); }}
            className={`px-3 py-2 border rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              brandFilter
                ? "border-indigo-300 bg-indigo-50"
                : "border-gray-300 bg-white"
            }`}
          >
            <option value="">Todas las marcas ({brands.length})</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
          {brandFilter && (
            <button
              onClick={() => { setBrandFilter(""); setCurrentPage(1); }}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="relative">
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
            className={`px-3 py-2 border rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              categoryFilter
                ? "border-indigo-300 bg-indigo-50"
                : "border-gray-300 bg-white"
            }`}
          >
            <option value="">Todas las categorías ({categories.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          {categoryFilter && (
            <button
              onClick={() => { setCategoryFilter(""); setCurrentPage(1); }}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="relative">
          <select
            value={stockDaysFilter}
            onChange={(e) => { setStockDaysFilter(e.target.value); setCurrentPage(1); }}
            className={`px-3 py-2 border rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              stockDaysFilter
                ? "border-indigo-300 bg-indigo-50"
                : "border-gray-300 bg-white"
            }`}
          >
            <option value="">Días Stock: Todos</option>
            <option value="agotado">Agotado (0 stock)</option>
            <option value="critical">Crítico (&lt; 7 días)</option>
            <option value="low">Bajo (7–30 días)</option>
            <option value="moderate">Moderado (30–90 días)</option>
            <option value="high">Alto (&gt; 90 días)</option>
          </select>
          {stockDaysFilter && (
            <button
              onClick={() => { setStockDaysFilter(""); setCurrentPage(1); }}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="text-sm text-gray-600 flex items-center">
          {filtered.length} producto{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
        </div>

        {/* Export CSV */}
        <button
          onClick={exportCSV}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="bg-gray-100 p-1 rounded-lg inline-flex gap-1 w-full">
        {(["overview", "trends", "stock"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
              activeTab === tab
                ? "bg-white shadow-sm text-indigo-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab === "overview" && "Overview"}
            {tab === "trends" && "Tendencias de Venta"}
            {tab === "stock" && "Stock Inteligente"}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* KPI Cards Row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-indigo-500" />
                <span className="text-xs text-gray-500 font-medium">Facturación Total</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatCompact(kpiStats.totalRevenue)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-green-500" />
                <span className="text-xs text-gray-500 font-medium">Unidades Vendidas</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{kpiStats.totalUnits.toLocaleString("es-AR")}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-gray-500 font-medium">Ticket Promedio</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatARS(kpiStats.ticketPromedio)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-cyan-500" />
                <span className="text-xs text-gray-500 font-medium">Productos Activos</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{kpiStats.productosActivos.toLocaleString("es-AR")}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-purple-500" />
                <span className="text-xs text-gray-500 font-medium">Stock Total (uds)</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{kpiStats.totalStock.toLocaleString("es-AR")}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-orange-500" />
                <span className="text-xs text-gray-500 font-medium">Valor de Stock</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatCompact(kpiStats.valorStock)}</p>
            </div>
          </div>

          {/* Stock Health Alerts Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <X className="w-4 h-4 text-red-500" />
                <span className="text-xs text-gray-500 font-medium">Sin Stock</span>
              </div>
              <p className={`text-xl font-bold ${stockHealthAlerts.sinStock > 0 ? "text-red-600" : "text-gray-900"}`}>{stockHealthAlerts.sinStock}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">productos con stock = 0</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-gray-500 font-medium">Stock Crítico</span>
              </div>
              <p className={`text-xl font-bold ${stockHealthAlerts.critico > 0 ? "text-amber-600" : "text-gray-900"}`}>{stockHealthAlerts.critico}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">menos de 7 días de stock</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-gray-500 font-medium">Sobrestock</span>
              </div>
              <p className={`text-xl font-bold ${stockHealthAlerts.sobrestock > 0 ? "text-blue-600" : "text-gray-900"}`}>{stockHealthAlerts.sobrestock}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">más de 90 días de stock</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Search className="w-4 h-4 text-gray-500" />
                <span className="text-xs text-gray-500 font-medium">Días Stock Promedio</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{Math.round(stockHealthAlerts.diasPromedio)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">promedio ponderado</p>
            </div>
          </div>


          {/* Metric Toggle Pills */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 font-medium">Métrica:</span>
            <div className="bg-gray-100 p-1 rounded-lg inline-flex gap-1">
              <button
                onClick={() => setChartMetric("revenue")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  chartMetric === "revenue"
                    ? "bg-white shadow-sm text-indigo-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Facturación
              </button>
              <button
                onClick={() => setChartMetric("units")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  chartMetric === "units"
                    ? "bg-white shadow-sm text-indigo-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Unidades
              </button>
            </div>
          </div>

          {/* Distribution Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Brand Chart + Ranking */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4">Por Marca</h3>
              <div className="flex gap-4">
                <div className="flex-shrink-0" style={{width: '220px', height: '220px'}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={brandDistribution.slice(0, 10)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={90}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {brandDistribution.slice(0, 10).map((entry, index) => (
                          <Cell key={`cell-b-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => {
                          const total = brandDistribution.reduce((s, e) => s + e.value, 0);
                          const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
                          return chartMetric === "revenue"
                            ? `${formatARS(value)} (${pct}%)`
                            : `${value.toLocaleString("es-AR")} uds (${pct}%)`;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[220px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr>
                        <th className="text-left py-1 text-gray-500 font-medium">Marca</th>
                        <th className="text-right py-1 text-gray-500 font-medium">{chartMetric === "revenue" ? "Facturación" : "Unidades"}</th>
                        <th className="text-right py-1 text-gray-500 font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const total = brandDistribution.reduce((s, e) => s + e.value, 0);
                        return brandDistribution.map((entry, idx) => (
                          <tr key={entry.name} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="py-1.5 flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor: entry.color}} />
                              <span className="text-gray-800 truncate max-w-[120px]" title={entry.name}>{entry.name}</span>
                            </td>
                            <td className="py-1.5 text-right text-gray-700 font-medium">
                              {chartMetric === "revenue" ? formatCompact(entry.value) : entry.value.toLocaleString("es-AR")}
                            </td>
                            <td className="py-1.5 text-right text-gray-600">
                              {total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0"}%
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Category Chart + Ranking */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4">Por Categoría</h3>
              <div className="flex gap-4">
                <div className="flex-shrink-0" style={{width: '220px', height: '220px'}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryDistribution.slice(0, 10)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={90}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {categoryDistribution.slice(0, 10).map((entry, index) => (
                          <Cell key={`cell-c-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => {
                          const total = categoryDistribution.reduce((s, e) => s + e.value, 0);
                          const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
                          return chartMetric === "revenue"
                            ? `${formatARS(value)} (${pct}%)`
                            : `${value.toLocaleString("es-AR")} uds (${pct}%)`;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[220px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr>
                        <th className="text-left py-1 text-gray-500 font-medium">Categoría</th>
                        <th className="text-right py-1 text-gray-500 font-medium">{chartMetric === "revenue" ? "Facturación" : "Unidades"}</th>
                        <th className="text-right py-1 text-gray-500 font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const total = categoryDistribution.reduce((s, e) => s + e.value, 0);
                        return categoryDistribution.map((entry, idx) => (
                          <tr key={entry.name} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="py-1.5 flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor: entry.color}} />
                              <span className="text-gray-800 truncate max-w-[120px]" title={entry.name}>{entry.name}</span>
                            </td>
                            <td className="py-1.5 text-right text-gray-700 font-medium">
                              {chartMetric === "revenue" ? formatCompact(entry.value) : entry.value.toLocaleString("es-AR")}
                            </td>
                            <td className="py-1.5 text-right text-gray-600">
                              {total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0"}%
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Products Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">
                Productos ({filtered.length})
              </h3>
            </div>
            <div className="overflow-x-auto flex-1 flex flex-col">
              <div className="overflow-y-auto max-h-[600px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3 text-left font-semibold text-gray-700">
                        Producto
                      </th>
                      <th
                        className="px-6 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleSort("revenue")}
                      >
                        <TooltipHeader text="Facturación" tooltip={COLUMN_TOOLTIPS.facturacion} />
                        {getSortIndicator("revenue")}
                      </th>
                      <th className="px-6 py-3 text-right font-semibold text-gray-700">
                        <TooltipHeader text="% Marca" tooltip={COLUMN_TOOLTIPS.porcMarca} />
                      </th>
                      <th className="px-6 py-3 text-right font-semibold text-gray-700">
                        <TooltipHeader text="% Cat." tooltip={COLUMN_TOOLTIPS.porcCat} />
                      </th>
                      <th className="px-6 py-3 text-right font-semibold text-gray-700">
                        <TooltipHeader text="% Total" tooltip={COLUMN_TOOLTIPS.porcTotal} />
                      </th>
                      <th
                        className="px-6 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleSort("unitsSold")}
                      >
                        <TooltipHeader text="Unidades" tooltip={COLUMN_TOOLTIPS.unidades} />
                        {getSortIndicator("unitsSold")}
                      </th>
                      <th
                        className="px-6 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleSort("wowRevenuePct")}
                      >
                        <TooltipHeader text="Tendencia WoW" tooltip={COLUMN_TOOLTIPS.tendencia} />
                        {getSortIndicator("wowRevenuePct")}
                      </th>
                      <th
                        className="px-6 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleSort("stock")}
                      >
                        <TooltipHeader text="Stock" tooltip={COLUMN_TOOLTIPS.stock} />
                        {getSortIndicator("stock")}
                      </th>
                      <th
                        className="px-6 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleSort("daysOfStock")}
                      >
                        <TooltipHeader text="Días Stock" tooltip={COLUMN_TOOLTIPS.diasstock} />
                        {getSortIndicator("daysOfStock")}
                      </th>
                      <th
                        className="px-6 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleSort("abc")}
                      >
                        <TooltipHeader text="ABC" tooltip={COLUMN_TOOLTIPS.abc} />
                        {getSortIndicator("abc")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {paginatedProducts.map((product) => {
                      const brandRevenue = revenueCalculations.brandTotals.get(product.brand || "Sin marca") || 1;
                      const catRevenue = revenueCalculations.categoryTotals.get(product.category || "Sin categoría") || 1;
                      const porcMarca = (product.revenue / brandRevenue) * 100;
                      const porcCat = (product.revenue / catRevenue) * 100;
                      const porcTotal = revenueCalculations.totalRevenue > 0 ? (product.revenue / revenueCalculations.totalRevenue) * 100 : 0;

                      return (
                        <tr
                          key={product.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {product.imageUrl && (
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  className="w-8 h-8 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={() => setEnlargedImage({ url: product.imageUrl!, name: product.name })}
                                />
                              )}
                              <div>
                                <div className="font-medium text-gray-900">
                                  {product.name}
                                </div>
                                <div className="text-xs text-gray-500 mb-2">
                                  {product.sku || "—"}
                                </div>
                                <div className="flex gap-2">
                                  {product.brand && (
                                    <span className="inline-block px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-medium">
                                      {product.brand}
                                    </span>
                                  )}
                                  {product.category && (
                                    <span className="inline-block px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-[10px] font-medium">
                                      {product.category}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-gray-900">
                            {formatARS(product.revenue)}
                          </td>
                          <td className="px-6 py-4 text-right text-gray-700">
                            {porcMarca.toFixed(1)}%
                          </td>
                          <td className="px-6 py-4 text-right text-gray-700">
                            {porcCat.toFixed(1)}%
                          </td>
                          <td className="px-6 py-4 text-right text-gray-700">
                            {porcTotal.toFixed(1)}%
                          </td>
                          <td className="px-6 py-4 text-right text-gray-700">
                            {formatCompact(product.unitsSold)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center">
                              <TrendIndicator
                                wowRevenuePct={product.trendData.wowRevenuePct}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`font-medium ${(product.stock ?? 0) === 0 ? "text-red-600" : "text-gray-900"}`}>
                              {(product.stock ?? 0) === 0 ? "0" : (product.stock ?? 0)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <StockBadge
                              daysOfStock={product.stockData.daysOfStock}
                              stockHealth={product.stockData.stockHealth}
                              stock={product.stock}
                            />
                          </td>
                          <td className="px-6 py-4 text-center">
                            <ABCBadge abcClass={product.trendData.abcClass} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between text-sm">
              <div className="text-gray-600">
                Mostrando {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filtered.length)}-{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} de {filtered.length} productos
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Anterior
                </button>
                <span className="px-4 py-1 text-gray-700 font-medium">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TENDENCIAS DE VENTA */}
      {activeTab === "trends" && (
        <div className="space-y-6">
          {/* Category Evolution */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">
              Evolución por Categoría
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={categoryTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="weekStart"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(date) => {
                    const d = new Date(date);
                    return `${d.getDate()}/${d.getMonth() + 1}`;
                  }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => formatARS(value)}
                  labelFormatter={(date) => {
                    const d = new Date(date);
                    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
                  }}
                />
                {categoryDistribution.slice(0, 5).map((cat, idx) => (
                  <Area
                    key={cat.name}
                    type="monotone"
                    dataKey={cat.name}
                    fill={cat.color}
                    stroke={cat.color}
                    fillOpacity={0.3}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Brand Evolution */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">
              Evolución por Marca
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={brandTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="weekStart"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(date) => {
                    const d = new Date(date);
                    return `${d.getDate()}/${d.getMonth() + 1}`;
                  }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => formatARS(value)}
                  labelFormatter={(date) => {
                    const d = new Date(date);
                    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
                  }}
                />
                {brandDistribution.slice(0, 5).map((brand, idx) => (
                  <Area
                    key={brand.name}
                    type="monotone"
                    dataKey={brand.name}
                    fill={brand.color}
                    stroke={brand.color}
                    fillOpacity={0.3}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Top Growing Products */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-xl shadow-sm border border-green-200">
            <h3 className="font-semibold text-green-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Top Productos en Alza
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-green-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-green-900">
                      #
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-green-900">
                      Producto
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-green-900">
                      WoW%
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-green-900">
                      Facturación 30d
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-green-900">
                      Sparkline
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-green-200">
                  {topGrowing.map((product, idx) => (
                    <tr key={product.id} className="hover:bg-green-100/50">
                      <td className="px-4 py-3 text-green-900 font-bold">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 flex items-center gap-2">
                        {product.imageUrl && (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-6 h-6 rounded object-cover"
                          />
                        )}
                        <span className="text-green-900 font-medium">
                          {product.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 font-bold">
                        +{product.trendData.wowRevenuePct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right text-green-900 font-medium">
                        {formatARS(product.revenue)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Sparkline
                          data={product.trendData.weeklyTrend.map((w) => w.revenue)}
                          color="#10b981"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Declining Products */}
          <div className="bg-gradient-to-br from-red-50 to-rose-50 p-6 rounded-xl shadow-sm border border-red-200">
            <h3 className="font-semibold text-red-900 mb-4 flex items-center gap-2">
              <TrendingDown className="w-5 h-5" />
              Productos en Caída
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-red-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-red-900">
                      #
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-red-900">
                      Producto
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-red-900">
                      WoW%
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-red-900">
                      Facturación 30d
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-red-900">
                      Sparkline
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-200">
                  {topDeclining.map((product, idx) => (
                    <tr key={product.id} className="hover:bg-red-100/50">
                      <td className="px-4 py-3 text-red-900 font-bold">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 flex items-center gap-2">
                        {product.imageUrl && (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-6 h-6 rounded object-cover"
                          />
                        )}
                        <span className="text-red-900 font-medium">
                          {product.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-red-600 font-bold">
                        {product.trendData.wowRevenuePct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right text-red-900 font-medium">
                        {formatARS(product.revenue)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Sparkline
                          data={product.trendData.weeklyTrend.map((w) => w.revenue)}
                          color="#ef4444"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STOCK INTELIGENTE */}
      {activeTab === "stock" && (
        <div className="space-y-6">
          {/* KPI Cards */}
          {stockSummary && (
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total en Stock</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {formatCompact(stockSummary.totalStockUnits)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">unidades</p>
                  </div>
                  <Package className="w-12 h-12 text-blue-500 opacity-20" />
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Valor Inventario</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {formatARS(stockSummary.totalStockValue)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">capital</p>
                  </div>
                  <DollarSign className="w-12 h-12 text-green-500 opacity-20" />
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Productos en Riesgo</p>
                    <p className="text-3xl font-bold text-amber-600 mt-2">
                      {stockSummary.criticalCount + stockSummary.lowCount}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {stockSummary.criticalCount} crítico,{" "}
                      {stockSummary.lowCount} bajo
                    </p>
                  </div>
                  <AlertTriangle className="w-12 h-12 text-amber-500 opacity-20" />
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Productos Muertos</p>
                    <p className="text-3xl font-bold text-red-600 mt-2">
                      {stockSummary.deadCount}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">sin venta</p>
                  </div>
                  <Zap className="w-12 h-12 text-red-500 opacity-20" />
                </div>
              </div>
            </div>
          )}

          {/* Stock Health Pie Chart */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">
              Salud General del Inventario
            </h3>
            <div className="grid grid-cols-3 gap-6">
              <div className="flex justify-center">
                <ResponsiveContainer width={250} height={250}>
                  <PieChart>
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {distributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="col-span-2 space-y-3">
                {distributionData.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm font-medium text-gray-900">
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900">
                        {item.value}
                      </span>
                      <span className="text-xs text-gray-600">
                        (
                        {(
                          (item.value /
                            distributionData.reduce((sum, d) => sum + d.value, 0)) *
                          100
                        ).toFixed(1)}
                        %)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stock por Marca */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">
              Stock por Marca (Top 10)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={stockByBrandData}
                layout="vertical"
                margin={{ top: 0, right: 0, bottom: 0, left: 120 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => `${value} unidades`}
                />
                <Bar dataKey="units" fill="#6366f1" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ABC Classification */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">
              Clasificación ABC por Velocidad de Venta
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={abcChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" />
                <YAxis dataKey="clase" type="category" width={100} />
                <Tooltip
                  formatter={(value) => value}
                  labelFormatter={(label) =>
                    typeof label === "number" ? `${label} productos` : label
                  }
                />
                <Bar dataKey="count" fill="#6366f1" radius={4} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-6 grid grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm font-semibold text-green-900">
                  Clase A
                </p>
                <p className="text-2xl font-bold text-green-600 mt-1">
                  {abcCounts.A}
                </p>
                <p className="text-xs text-green-700 mt-1">
                  {((abcCounts.A / filtered.length) * 100).toFixed(1)}%
                </p>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm font-semibold text-amber-900">
                  Clase B
                </p>
                <p className="text-2xl font-bold text-amber-600 mt-1">
                  {abcCounts.B}
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  {((abcCounts.B / filtered.length) * 100).toFixed(1)}%
                </p>
              </div>
              <div className="p-4 bg-gray-100 rounded-lg border border-gray-300">
                <p className="text-sm font-semibold text-gray-900">
                  Clase C
                </p>
                <p className="text-2xl font-bold text-gray-600 mt-1">
                  {abcCounts.C}
                </p>
                <p className="text-xs text-gray-700 mt-1">
                  {((abcCounts.C / filtered.length) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          {/* Stock Alerts */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              Alertas de Quiebre de Stock
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {stockAlerts.length} producto{stockAlerts.length !== 1 ? 's' : ''} en alerta ({stockSummary?.criticalCount || 0} crítico{stockSummary?.criticalCount !== 1 ? 's' : ''}, {stockSummary?.lowCount || 0} bajo{stockSummary?.lowCount !== 1 ? 's' : ''})
            </p>
            {stockAlerts.length === 0 ? (
              <p className="text-gray-500 py-8">
                No hay productos con alertas de quiebre.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left font-semibold text-gray-700">
                          Producto
                        </th>
                        <th className="px-6 py-3 text-right font-semibold text-gray-700">
                          Stock Actual
                        </th>
                        <th className="px-6 py-3 text-right font-semibold text-gray-700">
                          Velocidad
                        </th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-700">
                          Días Restantes
                        </th>
                        <th className="px-6 py-3 text-left font-semibold text-gray-700">
                          Fecha Quiebre
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {stockAlertsPaginated.map((product) => {
                        const bgClass =
                          product.stockData.stockHealth === "critical"
                            ? "bg-red-50"
                            : "bg-amber-50";
                        return (
                          <tr key={product.id} className={bgClass}>
                            <td className="px-6 py-4 flex items-center gap-3">
                              {product.imageUrl && (
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  className="w-8 h-8 rounded object-cover"
                                />
                              )}
                              <div>
                                <div className="font-medium text-gray-900">
                                  {product.name}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {product.sku || "—"}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right font-medium text-gray-900">
                              {product.stock ?? 0}
                            </td>
                            <td className="px-6 py-4 text-right text-gray-700">
                              {product.stockData.dailySalesRate.toFixed(1)}{" "}
                              uds/día
                            </td>
                            <td className="px-6 py-4 text-center">
                              <StockBadge
                                daysOfStock={product.stockData.daysOfStock}
                                stockHealth={product.stockData.stockHealth}
                                stock={product.stock}
                              />
                            </td>
                            <td className="px-6 py-4 text-gray-700">
                              {product.stockData.stockoutDate
                                ? new Date(
                                    product.stockData.stockoutDate
                                  ).toLocaleDateString("es-AR")
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {stockAlertsTotalPages > 1 && (
                  <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between text-sm mt-4">
                    <div className="text-gray-600">
                      Mostrando {Math.min((stockAlertsPage - 1) * STOCK_ITEMS_PER_PAGE + 1, stockAlerts.length)}-{Math.min(stockAlertsPage * STOCK_ITEMS_PER_PAGE, stockAlerts.length)} de {stockAlerts.length} alertas
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setStockAlertsPage(Math.max(1, stockAlertsPage - 1))}
                        disabled={stockAlertsPage === 1}
                        className="px-3 py-1 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Anterior
                      </button>
                      <span className="px-4 py-1 text-gray-700 font-medium">
                        Página {stockAlertsPage} de {stockAlertsTotalPages}
                      </span>
                      <button
                        onClick={() => setStockAlertsPage(Math.min(stockAlertsTotalPages, stockAlertsPage + 1))}
                        disabled={stockAlertsPage === stockAlertsTotalPages}
                        className="px-3 py-1 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Dead Stock */}
          <div className="bg-gradient-to-br from-red-50 to-rose-50 p-6 rounded-xl shadow-sm border border-red-200">
            <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Stock Muerto — Capital Inmovilizado
            </h3>
            <p className="text-sm text-red-800 mb-4">
              Capital total inmovilizado: {formatARS(deadStockCapital)}
            </p>
            {deadStock.length === 0 ? (
              <p className="text-red-700 py-8">
                No hay productos con stock muerto.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-red-100 border-b border-red-300">
                      <tr>
                        <th className="px-6 py-3 text-left font-semibold text-red-900">
                          Producto
                        </th>
                        <th className="px-6 py-3 text-right font-semibold text-red-900">
                          Stock
                        </th>
                        <th className="px-6 py-3 text-right font-semibold text-red-900">
                          Valor
                        </th>
                        <th className="px-6 py-3 text-left font-semibold text-red-900">
                          Última Venta
                        </th>
                        <th className="px-6 py-3 text-right font-semibold text-red-900">
                          Días sin Venta
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-200">
                      {deadStockPaginated.map((product) => {
                        const lastSaleDate = product.stockData.lastSaleDate
                          ? new Date(product.stockData.lastSaleDate)
                          : null;
                        const daysNoSale = lastSaleDate
                          ? Math.floor(
                              (new Date().getTime() - lastSaleDate.getTime()) /
                                (1000 * 60 * 60 * 24)
                            )
                          : null;
                        return (
                          <tr key={product.id} className="hover:bg-red-100/50">
                            <td className="px-6 py-4 flex items-center gap-3">
                              {product.imageUrl && (
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  className="w-8 h-8 rounded object-cover"
                                />
                              )}
                              <div>
                                <div className="font-medium text-red-900">
                                  {product.name}
                                </div>
                                <div className="text-xs text-red-700">
                                  {product.sku || "—"}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right font-medium text-red-900">
                              {product.stock ?? 0}
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-red-600">
                              {formatARS(
                                (product.stock ?? 0) * product.avgPrice
                              )}
                            </td>
                            <td className="px-6 py-4 text-red-700">
                              {lastSaleDate
                                ? lastSaleDate.toLocaleDateString("es-AR")
                                : "—"}
                            </td>
                            <td className="px-6 py-4 text-right text-red-900 font-semibold">
                              {daysNoSale ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {deadStockTotalPages > 1 && (
                  <div className="border-t border-red-200 px-6 py-4 bg-red-50 flex items-center justify-between text-sm mt-4">
                    <div className="text-red-700">
                      Mostrando {Math.min((deadStockPage - 1) * STOCK_ITEMS_PER_PAGE + 1, deadStock.length)}-{Math.min(deadStockPage * STOCK_ITEMS_PER_PAGE, deadStock.length)} de {deadStock.length} productos muertos
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setDeadStockPage(Math.max(1, deadStockPage - 1))}
                        disabled={deadStockPage === 1}
                        className="px-3 py-1 border border-red-300 rounded-md text-red-700 bg-white hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Anterior
                      </button>
                      <span className="px-4 py-1 text-red-700 font-medium">
                        Página {deadStockPage} de {deadStockTotalPages}
                      </span>
                      <button
                        onClick={() => setDeadStockPage(Math.min(deadStockTotalPages, deadStockPage + 1))}
                        disabled={deadStockPage === deadStockTotalPages}
                        className="px-3 py-1 border border-red-300 rounded-md text-red-700 bg-white hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
