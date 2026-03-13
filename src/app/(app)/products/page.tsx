// @ts-nocheck
"use client";

import { useEffect, useState, useMemo } from "react";
import { formatARS, formatCompact } from "@/lib/utils/format";
import NitroInsightsPanel from "@/components/NitroInsightsPanel";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ── Types ─────────────────────────────────────────────────── */
interface ProductItem {
  id: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  category: string | null;
  brand: string | null;
  stock: number | null;
  stockUpdatedAt: string | null;
  unitsSold: number;
  revenue: number;
  orders: number;
  avgPrice: number;
}

interface ProductSummary {
  estimatedTotalUnits: number;
  estimatedTotalRevenue: number;
  totalOrders: number;
  detailedUnits: number;
  detailedRevenue: number;
  uniqueProducts: number;
  paretoConcentration: number;
}

/* ── Color palette ─────────────────────────────────────────── */
const COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // rose
  "#06b6d4", // cyan
  "#8b5cf6", // violet
  "#f97316", // orange
  "#14b8a6", // teal
  "#ec4899", // pink
  "#94a3b8", // gray (for "Otros")
];

/* ── Types for metric toggle ──────────────────────────────── */
type PieMetric = "revenue" | "unitsSold";

/* ── Stock helpers ─────────────────────────────────────────── */
function getDaysOfStock(product: ProductItem): number | null {
  if (product.stock === null || product.stock === undefined) return null;
  const dailySales = product.unitsSold / 30;
  if (dailySales <= 0) return 999; // no sales = infinite stock
  return Math.round(product.stock / dailySales);
}

function getStockLevel(days: number | null): "critical" | "low" | "ok" | "nodata" {
  if (days === null) return "nodata";
  if (days < 7) return "critical";
  if (days < 14) return "low";
  return "ok";
}

/* ── Helpers ───────────────────────────────────────────────── */
function aggregateByField(
  products: ProductItem[],
  field: "brand" | "category",
  metric: PieMetric
): { name: string; value: number; pct: number }[] {
  const map = new Map<string, number>();
  let total = 0;
  for (const p of products) {
    const key = p[field] || "Sin datos";
    const v = metric === "revenue" ? p.revenue : p.unitsSold;
    map.set(key, (map.get(key) || 0) + v);
    total += v;
  }

  const sorted = [...map.entries()]
    .map(([name, value]) => ({
      name,
      value,
      pct: total > 0 ? Math.round((value / total) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // Top 8 + agrupar resto en "Otros"
  if (sorted.length <= 9) return sorted;
  const top = sorted.slice(0, 8);
  const rest = sorted.slice(8);
  const othersValue = rest.reduce((s, r) => s + r.value, 0);
  const othersPct = total > 0 ? Math.round((othersValue / total) * 100) : 0;
  return [
    ...top,
    { name: `Otros (${rest.length})`, value: othersValue, pct: othersPct },
  ];
}

/* ── Custom pie label (shows % outside for slices > 4%) ───── */
function renderCustomLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  pct,
}: any) {
  if (pct < 4) return null;
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 18;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#374151"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
    >
      {pct}%
    </text>
  );
}

/* ── Custom tooltip ────────────────────────────────────────── */
function PieTooltip({ active, payload, metric }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isUnits = metric === "unitsSold";
  return (
    <div
      style={{
        backgroundColor: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: 2, color: "#111827" }}>
        {d.name}
      </p>
      <p style={{ color: "#6b7280" }}>
        {isUnits
          ? `${d.value.toLocaleString("es-AR")} uds`
          : formatARS(d.value)}{" "}
        &middot; {d.pct}%
      </p>
    </div>
  );
}

/* ── Custom legend ─────────────────────────────────────────── */
function PieLegend({
  data,
}: {
  data: { name: string; value: number; pct: number }[];
}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
      {data.map((d, i) => (
        <div key={d.name} className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: COLORS[i % COLORS.length] }}
          />
          <span className="text-xs text-gray-600 truncate">{d.name}</span>
          <span className="text-xs font-medium text-gray-400 ml-auto flex-shrink-0">
            {d.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Stock Alert Banner ────────────────────────────────────── */
function StockAlertBanner({ products }: { products: ProductItem[] }) {
  const analysis = useMemo(() => {
    const withStock = products.filter((p) => p.stock !== null && p.stock !== undefined);
    if (withStock.length === 0) return null;

    const critical: ProductItem[] = [];
    const low: ProductItem[] = [];

    for (const p of withStock) {
      const days = getDaysOfStock(p);
      const level = getStockLevel(days);
      if (level === "critical") critical.push(p);
      else if (level === "low") low.push(p);
    }

    if (critical.length === 0 && low.length === 0) return null;

    // Aggregate by brand
    const brandRisk = new Map<string, { count: number; avgDays: number; totalDays: number }>();
    for (const p of [...critical, ...low]) {
      const brand = p.brand || "Sin marca";
      const days = getDaysOfStock(p) || 0;
      const entry = brandRisk.get(brand) || { count: 0, avgDays: 0, totalDays: 0 };
      entry.count++;
      entry.totalDays += days;
      entry.avgDays = Math.round(entry.totalDays / entry.count);
      brandRisk.set(brand, entry);
    }

    // Aggregate by category
    const catRisk = new Map<string, { count: number; avgDays: number; totalDays: number }>();
    for (const p of [...critical, ...low]) {
      const cat = p.category || "Sin categoria";
      const days = getDaysOfStock(p) || 0;
      const entry = catRisk.get(cat) || { count: 0, avgDays: 0, totalDays: 0 };
      entry.count++;
      entry.totalDays += days;
      entry.avgDays = Math.round(entry.totalDays / entry.count);
      catRisk.set(cat, entry);
    }

    const topBrands = [...brandRisk.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3);
    const topCats = [...catRisk.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3);

    return { critical, low, topBrands, topCats, withStock };
  }, [products]);

  if (!analysis) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">📦</span>
        <h3 className="text-sm font-semibold text-amber-800">
          Alertas de Inventario
        </h3>
      </div>

      <div className="space-y-1.5 mb-3">
        {analysis.critical.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
            <span className="text-sm text-gray-700">
              <span className="font-semibold text-red-700">{analysis.critical.length}</span>
              {" "}producto{analysis.critical.length !== 1 ? "s" : ""} con stock critico
              <span className="text-gray-400"> (&lt;7 dias de inventario)</span>
            </span>
          </div>
        )}
        {analysis.low.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
            <span className="text-sm text-gray-700">
              <span className="font-semibold text-amber-700">{analysis.low.length}</span>
              {" "}producto{analysis.low.length !== 1 ? "s" : ""} con stock bajo
              <span className="text-gray-400"> (&lt;14 dias de inventario)</span>
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-gray-600">
        {analysis.topBrands.length > 0 && (
          <div>
            <span className="font-medium text-gray-700">Marcas en riesgo: </span>
            {analysis.topBrands.map(([brand, info], i) => (
              <span key={brand}>
                {i > 0 && ", "}
                {brand}
                <span className="text-gray-400"> ({info.count} prod, ~{info.avgDays}d)</span>
              </span>
            ))}
          </div>
        )}
        {analysis.topCats.length > 0 && (
          <div>
            <span className="font-medium text-gray-700">Categorias en riesgo: </span>
            {analysis.topCats.map(([cat, info], i) => (
              <span key={cat}>
                {i > 0 && ", "}
                {cat}
                <span className="text-gray-400"> ({info.count} prod, ~{info.avgDays}d)</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Stock Badge Component ─────────────────────────────────── */
function StockBadge({ product }: { product: ProductItem }) {
  const days = getDaysOfStock(product);
  const level = getStockLevel(days);

  if (level === "nodata") {
    return (
      <span className="text-xs text-gray-300">—</span>
    );
  }

  const styles = {
    critical: "bg-red-50 text-red-700 border-red-200",
    low: "bg-amber-50 text-amber-700 border-amber-200",
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  return (
    <div className="text-right">
      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${styles[level]}`}>
        {product.stock!.toLocaleString("es-AR")} uds
      </span>
      <div className="text-[10px] text-gray-400 mt-0.5">
        {days === 999
          ? "Sin ventas recientes"
          : `~${days} dias`}
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────── */
export default function ProductsPage() {
  const [allProducts, setAllProducts] = useState<ProductItem[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [summary, setSummary] = useState<ProductSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [brandMetric, setBrandMetric] = useState<PieMetric>("revenue");
  const [categoryMetric, setCategoryMetric] = useState<PieMetric>("revenue");

  useEffect(() => {
    fetch("/api/metrics/products")
      .then((r) => r.json())
      .then((data) => {
        if (data.products) setAllProducts(data.products);
        if (data.brands) setBrands(data.brands);
        if (data.categories) setCategories(data.categories);
        if (data.summary) setSummary(data.summary);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /* ── Filtered products ─────────────────────────────────── */
  const filtered = useMemo(() => {
    return allProducts.filter(
      (p) =>
        (brandFilter === "ALL" || p.brand === brandFilter) &&
        (categoryFilter === "ALL" || p.category === categoryFilter)
    );
  }, [allProducts, brandFilter, categoryFilter]);

  const topFiltered = filtered.slice(0, 20);
  const isFiltered = brandFilter !== "ALL" || categoryFilter !== "ALL";

  /* ── KPIs for filtered subset ──────────────────────────── */
  const filteredUnits = filtered.reduce((s, p) => s + p.unitsSold, 0);
  const filteredRevenue = filtered.reduce((s, p) => s + p.revenue, 0);
  const filteredUniqueProducts = filtered.length;
  const top20pct = Math.max(1, Math.ceil(filtered.length * 0.2));
  const top20revenue = filtered
    .slice(0, top20pct)
    .reduce((s, p) => s + p.revenue, 0);
  const filteredPareto =
    filteredRevenue > 0
      ? Math.round((top20revenue / filteredRevenue) * 100)
      : 0;

  /* ── Stock KPI ──────────────────────────────────────────── */
  const productsAtRisk = useMemo(() => {
    return filtered.filter((p) => {
      const days = getDaysOfStock(p);
      return days !== null && days < 14;
    }).length;
  }, [filtered]);

  /* ── Pie chart data ────────────────────────────────────── */
  const brandChartData = useMemo(
    () => aggregateByField(filtered, "brand", brandMetric),
    [filtered, brandMetric]
  );
  const categoryChartData = useMemo(
    () => aggregateByField(filtered, "category", categoryMetric),
    [filtered, categoryMetric]
  );

  if (loading)
    return <p className="text-gray-400 p-8">Cargando productos...</p>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Productos</h2>
        <p className="text-gray-500">
          Top productos por facturacion &middot; Ultimos 30 dias
        </p>
      </div>

      {allProducts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <p className="text-gray-400">No hay datos de productos aun.</p>
        </div>
      ) : (
        <>
          {/* ── Stock Alerts Banner ──────────────────────── */}
          <StockAlertBanner products={filtered} />

          {/* ── Pie Charts ──────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Brand pie */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-1">
                    Ventas por Marca
                  </h3>
                  <p className="text-xs text-gray-400">
                    Distribucion de{" "}
                    {brandMetric === "revenue"
                      ? "facturacion"
                      : "unidades vendidas"}{" "}
                    por marca
                  </p>
                </div>
                <div className="flex bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
                  <button
                    onClick={() => setBrandMetric("revenue")}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                      brandMetric === "revenue"
                        ? "bg-white text-indigo-600 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Facturacion
                  </button>
                  <button
                    onClick={() => setBrandMetric("unitsSold")}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                      brandMetric === "unitsSold"
                        ? "bg-white text-indigo-600 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Unidades
                  </button>
                </div>
              </div>
              {brandChartData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={brandChartData}
                        cx="50%"
                        cy="50%"
                        outerRadius={95}
                        innerRadius={40}
                        dataKey="value"
                        label={renderCustomLabel}
                        labelLine={false}
                        stroke="#fff"
                        strokeWidth={2}
                      >
                        {brandChartData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip metric={brandMetric} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <PieLegend data={brandChartData} />
                </>
              ) : (
                <p className="text-gray-300 text-sm text-center py-12">
                  Sin datos
                </p>
              )}
            </div>

            {/* Category pie */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-1">
                    Ventas por Categoria
                  </h3>
                  <p className="text-xs text-gray-400">
                    Distribucion de{" "}
                    {categoryMetric === "revenue"
                      ? "facturacion"
                      : "unidades vendidas"}{" "}
                    por categoria
                  </p>
                </div>
                <div className="flex bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
                  <button
                    onClick={() => setCategoryMetric("revenue")}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                      categoryMetric === "revenue"
                        ? "bg-white text-indigo-600 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Facturacion
                  </button>
                  <button
                    onClick={() => setCategoryMetric("unitsSold")}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                      categoryMetric === "unitsSold"
                        ? "bg-white text-indigo-600 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Unidades
                  </button>
                </div>
              </div>
              {categoryChartData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={categoryChartData}
                        cx="50%"
                        cy="50%"
                        outerRadius={95}
                        innerRadius={40}
                        dataKey="value"
                        label={renderCustomLabel}
                        labelLine={false}
                        stroke="#fff"
                        strokeWidth={2}
                      >
                        {categoryChartData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={<PieTooltip metric={categoryMetric} />}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <PieLegend data={categoryChartData} />
                </>
              ) : (
                <p className="text-gray-300 text-sm text-center py-12">
                  Sin datos
                </p>
              )}
            </div>
          </div>

          {/* ── Products table card ─────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            {/* ── Header with KPIs ───────────────────────────── */}
            <div className="p-6 border-b">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="font-semibold text-gray-700">
                    Top Productos por Facturacion
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {filteredUniqueProducts.toLocaleString("es-AR")} productos
                    {isFiltered && (
                      <span className="text-indigo-500">
                        {" "}
                        (filtrado de{" "}
                        {allProducts.length.toLocaleString("es-AR")})
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-4">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Unidades vendidas</p>
                    <p className="text-sm font-bold text-gray-700">
                      {filteredUnits.toLocaleString("es-AR")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Facturacion</p>
                    <p className="text-sm font-bold text-gray-700">
                      {formatARS(filteredRevenue)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Pareto</p>
                    <p className="text-sm font-bold text-indigo-600">
                      Top 20% = {filteredPareto}% revenue
                    </p>
                  </div>
                  {productsAtRisk > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-gray-400">En riesgo</p>
                      <p className="text-sm font-bold text-amber-600">
                        {productsAtRisk} producto{productsAtRisk !== 1 ? "s" : ""}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Filter bar ─────────────────────────────────── */}
            {(brands.length > 0 || categories.length > 0) && (
              <div className="px-6 py-3 bg-gray-50 border-b flex items-center gap-4 flex-wrap">
                {brands.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-500 uppercase">
                      Marca
                    </label>
                    <select
                      value={brandFilter}
                      onChange={(e) => setBrandFilter(e.target.value)}
                      className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    >
                      <option value="ALL">
                        Todas ({allProducts.filter((p) => p.brand).length})
                      </option>
                      {brands.map((b) => (
                        <option key={b} value={b}>
                          {b} (
                          {allProducts.filter((p) => p.brand === b).length})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {categories.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-500 uppercase">
                      Categoria
                    </label>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    >
                      <option value="ALL">
                        Todas (
                        {allProducts.filter((p) => p.category).length})
                      </option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c} (
                          {
                            allProducts.filter((p) => p.category === c)
                              .length
                          }
                          )
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {isFiltered && (
                  <button
                    onClick={() => {
                      setBrandFilter("ALL");
                      setCategoryFilter("ALL");
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium ml-auto"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            )}

            {/* ── Table ──────────────────────────────────────── */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase w-10">
                      #
                    </th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase">
                      Producto
                    </th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-right">
                      Unidades
                    </th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-right">
                      Pedidos
                    </th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-right">
                      Precio Prom.
                    </th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-right">
                      Stock
                    </th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-right">
                      Facturacion
                    </th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-right">
                      % del Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topFiltered.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          {p.imageUrl && (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="w-10 h-10 rounded-lg object-cover border"
                              onError={(e) => {
                                (
                                  e.target as HTMLImageElement
                                ).style.display = "none";
                              }}
                            />
                          )}
                          <div>
                            <div className="font-medium text-gray-800 truncate max-w-[250px]">
                              {p.name}
                            </div>
                            <div className="flex gap-2 mt-0.5">
                              {p.sku && (
                                <span className="text-xs text-gray-400">
                                  SKU: {p.sku}
                                </span>
                              )}
                              {p.brand && (
                                <span className="text-xs text-indigo-500 bg-indigo-50 px-1.5 rounded">
                                  {p.brand}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-700 text-right">
                        {p.unitsSold.toLocaleString("es-AR")}
                      </td>
                      <td className="px-3 py-3 text-gray-700 text-right">
                        {p.orders.toLocaleString("es-AR")}
                      </td>
                      <td className="px-3 py-3 text-gray-700 text-right">
                        {formatARS(p.avgPrice)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <StockBadge product={p} />
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-800 text-right">
                        {formatARS(p.revenue)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-gray-100 rounded-full h-1.5">
                            <div
                              className="bg-indigo-500 h-1.5 rounded-full"
                              style={{
                                width:
                                  Math.min(
                                    100,
                                    Math.round(
                                      (p.revenue / (filteredRevenue || 1)) *
                                        100
                                    )
                                  ) + "%",
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-8">
                            {Math.round(
                              (p.revenue / (filteredRevenue || 1)) * 100
                            )}
                            %
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Footer ─────────────────────────────────────── */}
            {filtered.length > 20 && (
              <div className="px-6 py-3 border-t bg-gray-50 text-center">
                <p className="text-xs text-gray-400">
                  Mostrando top 20 de{" "}
                  {filtered.length.toLocaleString("es-AR")} productos
                </p>
              </div>
            )}
          </div>
        </>
      )}

      <NitroInsightsPanel section="products" />
    </div>
  );
}
