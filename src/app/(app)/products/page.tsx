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

/* ââ Types âââââââââââââââââââââââââââââââââââââââââââââââââââ */
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

/* ââ Color palette for charts âââââââââââââââââââââââââââââââ */
const COLORS = [
  "#FF5E1A", // nitro orange
  "#FF2E2E", // nitro red
  "#FFB800", // nitro yellow
  "#4ADE80", // nitro green
  "#06b6d4", // cyan
  "#8b5cf6", // violet
  "#f97316", // orange variant
  "#14b8a6", // teal
  "#ec4899", // pink
  "#64748b", // slate (for "Otros")
];

/* ââ Types for metric toggle ââââââââââââââââââââââââââââââââ */
type PieMetric = "revenue" | "unitsSold";

/* ââ Stock helpers âââââââââââââââââââââââââââââââââââââââââââ */
function getDaysOfStock(product: ProductItem): number | null {
  if (product.stock === null || product.stock === undefined) return null;
  const dailySales = product.unitsSold / 30;
  if (dailySales <= 0) return 999;
  return Math.round(product.stock / dailySales);
}

function getStockLevel(days: number | null): "critical" | "low" | "ok" | "nodata" {
  if (days === null) return "nodata";
  if (days < 7) return "critical";
  if (days < 14) return "low";
  return "ok";
}

/* ââ Helpers âââââââââââââââââââââââââââââââââââââââââââââââââ */
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

/* ââ Custom pie label âââââââââââââââââââââââââââââââââââââââ */
function renderCustomLabel({
  cx,
  cy,
  midAngle,
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
      fill="#8A8A8A"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
      fontFamily="Space Mono, monospace"
    >
      {pct}%
    </text>
  );
}

/* ââ Custom tooltip ââââââââââââââââââââââââââââââââââââââââââ */
function PieTooltip({ active, payload, metric }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isUnits = metric === "unitsSold";
  return (
    <div
      style={{
        backgroundColor: "#161616",
        border: "1px solid rgba(255, 94, 26, 0.3)",
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: 2, color: "#FFFFFF", fontFamily: "DM Sans" }}>
        {d.name}
      </p>
      <p style={{ color: "#8A8A8A", fontFamily: "Space Mono, monospace", fontSize: 11 }}>
        {isUnits
          ? `${d.value.toLocaleString("es-AR")} uds`
          : formatARS(d.value)}{" "}
        &middot; {d.pct}%
      </p>
    </div>
  );
}

/* ââ Custom legend âââââââââââââââââââââââââââââââââââââââââââ */
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
          <span className="text-xs text-nitro-text2 truncate">{d.name}</span>
          <span className="text-xs font-medium text-nitro-muted ml-auto flex-shrink-0 font-mono">
            {d.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

/* ââ Stock Alert Banner ââââââââââââââââââââââââââââââââââââââ */
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
    <div className="nitro-card bg-nitro-card border border-nitro-border rounded-[16px] p-5 mb-6 animate-fade-in-up"
      style={{ boxShadow: "0 0 60px rgba(255, 94, 26, 0.06)" }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(255, 94, 26, 0.1)", border: "1px solid rgba(255, 94, 26, 0.2)" }}>
          <span className="text-sm">&#x26A0;&#xFE0F;</span>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Alertas de Inventario</h3>
          <p className="text-[11px] font-mono text-nitro-muted uppercase tracking-widest">Stock monitor</p>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {analysis.critical.length > 0 && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl"
            style={{ background: "rgba(255, 94, 94, 0.06)", border: "1px solid rgba(255, 94, 94, 0.15)" }}>
            <span className="w-2 h-2 rounded-full bg-nitro-err animate-pulse-live flex-shrink-0" />
            <span className="text-sm text-nitro-text2">
              <span className="font-bold text-nitro-err font-mono">{analysis.critical.length}</span>
              {" "}producto{analysis.critical.length !== 1 ? "s" : ""} con stock critico
              <span className="text-nitro-muted"> (&lt;7 dias)</span>
            </span>
          </div>
        )}
        {analysis.low.length > 0 && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl"
            style={{ background: "rgba(255, 184, 0, 0.06)", border: "1px solid rgba(255, 184, 0, 0.15)" }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#FFB800" }} />
            <span className="text-sm text-nitro-text2">
              <span className="font-bold font-mono" style={{ color: "#FFB800" }}>{analysis.low.length}</span>
              {" "}producto{analysis.low.length !== 1 ? "s" : ""} con stock bajo
              <span className="text-nitro-muted"> (&lt;14 dias)</span>
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-nitro-text2">
        {analysis.topBrands.length > 0 && (
          <div>
            <span className="font-mono text-[11px] text-nitro-muted uppercase tracking-widest">Marcas en riesgo: </span>
            {analysis.topBrands.map(([brand, info], i) => (
              <span key={brand}>
                {i > 0 && ", "}
                <span className="text-white">{brand}</span>
                <span className="text-nitro-muted font-mono text-[11px]"> ({info.count} prod, ~{info.avgDays}d)</span>
              </span>
            ))}
          </div>
        )}
        {analysis.topCats.length > 0 && (
          <div>
            <span className="font-mono text-[11px] text-nitro-muted uppercase tracking-widest">Categorias: </span>
            {analysis.topCats.map(([cat, info], i) => (
              <span key={cat}>
                {i > 0 && ", "}
                <span className="text-white">{cat}</span>
                <span className="text-nitro-muted font-mono text-[11px]"> ({info.count} prod, ~{info.avgDays}d)</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ââ Stock Badge Component âââââââââââââââââââââââââââââââââââ */
function StockBadge({ product }: { product: ProductItem }) {
  const days = getDaysOfStock(product);
  const level = getStockLevel(days);

  if (level === "nodata") {
    return <span className="text-xs text-nitro-muted font-mono">&mdash;</span>;
  }

  const styles = {
    critical: {
      bg: "rgba(255, 94, 94, 0.1)",
      border: "rgba(255, 94, 94, 0.25)",
      text: "#FF5E5E",
      dot: "#FF5E5E",
    },
    low: {
      bg: "rgba(255, 184, 0, 0.1)",
      border: "rgba(255, 184, 0, 0.25)",
      text: "#FFB800",
      dot: "#FFB800",
    },
    ok: {
      bg: "rgba(74, 222, 128, 0.1)",
      border: "rgba(74, 222, 128, 0.25)",
      text: "#4ADE80",
      dot: "#4ADE80",
    },
  };

  const s = styles[level];

  return (
    <div className="text-right">
      <span
        className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg"
        style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
      >
        {level === "critical" && <span className="w-1.5 h-1.5 rounded-full animate-pulse-live" style={{ background: s.dot }} />}
        {product.stock!.toLocaleString("es-AR")} uds
      </span>
      <div className="text-[11px] text-nitro-muted mt-0.5 font-mono">
        {days === 999 ? "Sin ventas" : `~${days}d stock`}
      </div>
    </div>
  );
}

/* ââ KPI Card ââââââââââââââââââââââââââââââââââââââââââââââââ */
function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-right">
      <p className="font-mono text-[11px] text-nitro-muted uppercase tracking-widest mb-0.5">{label}</p>
      <p className={`text-sm font-bold font-mono ${accent ? "text-nitro-orange" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

/* ââ Metric Toggle âââââââââââââââââââââââââââââââââââââââââââ */
function MetricToggle({ metric, setMetric }: { metric: PieMetric; setMetric: (m: PieMetric) => void }) {
  return (
    <div className="flex bg-nitro-bg rounded-lg p-0.5 flex-shrink-0 border border-nitro-border">
      <button
        onClick={() => setMetric("revenue")}
        className={`text-[11px] px-2.5 py-1 rounded-md font-mono uppercase tracking-wider transition-all duration-300 ease-nitro ${
          metric === "revenue"
            ? "bg-nitro-card text-nitro-orange shadow-sm"
            : "text-nitro-muted hover:text-nitro-text2"
        }`}
      >
        Revenue
      </button>
      <button
        onClick={() => setMetric("unitsSold")}
        className={`text-[11px] px-2.5 py-1 rounded-md font-mono uppercase tracking-wider transition-all duration-300 ease-nitro ${
          metric === "unitsSold"
            ? "bg-nitro-card text-nitro-orange shadow-sm"
            : "text-nitro-muted hover:text-nitro-text2"
        }`}
      >
        Unidades
      </button>
    </div>
  );
}

/* ââ Page âââââââââââââââââââââââââââââââââââââââââââââââââââââ */
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

  /* ââ Filtered products âââââââââââââââââââââââââââââââââââ */
  const filtered = useMemo(() => {
    return allProducts.filter(
      (p) =>
        (brandFilter === "ALL" || p.brand === brandFilter) &&
        (categoryFilter === "ALL" || p.category === categoryFilter)
    );
  }, [allProducts, brandFilter, categoryFilter]);

  const topFiltered = filtered.slice(0, 20);
  const isFiltered = brandFilter !== "ALL" || categoryFilter !== "ALL";

  /* ââ KPIs for filtered subset ââââââââââââââââââââââââââââ */
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

  /* ââ Stock KPI ââââââââââââââââââââââââââââââââââââââââââââ */
  const productsAtRisk = useMemo(() => {
    return filtered.filter((p) => {
      const days = getDaysOfStock(p);
      return days !== null && days < 14;
    }).length;
  }, [filtered]);

  /* ââ Pie chart data ââââââââââââââââââââââââââââââââââââââ */
  const brandChartData = useMemo(
    () => aggregateByField(filtered, "brand", brandMetric),
    [filtered, brandMetric]
  );
  const categoryChartData = useMemo(
    () => aggregateByField(filtered, "category", categoryMetric),
    [filtered, categoryMetric]
  );

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-nitro-orange animate-pulse-live" />
          <p className="text-nitro-text2 font-mono text-sm tracking-wider uppercase">
            Cargando productos
          </p>
        </div>
      </div>
    );

  return (
    <div>
      {/* ââ Header ââââââââââââââââââââââââââââââââââââââââââââ */}
      <div className="mb-8 animate-fade-in-up">
        <h2 className="font-headline text-3xl text-white tracking-tight" style={{ letterSpacing: "-1px" }}>
          Productos
        </h2>
        <p className="text-nitro-text2 mt-1">
          Top productos por facturacion &middot;{" "}
          <span className="font-mono text-[11px] text-nitro-muted uppercase tracking-wider">Ultimos 30 dias</span>
        </p>
      </div>

      {allProducts.length === 0 ? (
        <div className="bg-nitro-card rounded-[16px] border border-nitro-border p-12 text-center">
          <p className="text-nitro-muted">No hay datos de productos aun.</p>
        </div>
      ) : (
        <>
          {/* ââ Stock Alerts Banner ââââââââââââââââââââââââ */}
          <StockAlertBanner products={filtered} />

          {/* ââ Pie Charts ââââââââââââââââââââââââââââââââââââ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 stagger-children">
            {/* Brand pie */}
            <div className="nitro-card bg-nitro-card rounded-[16px] border border-nitro-border p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">
                    Ventas por Marca
                  </h3>
                  <p className="text-[11px] text-nitro-muted font-mono uppercase tracking-wider">
                    {brandMetric === "revenue" ? "Facturacion" : "Unidades"} por marca
                  </p>
                </div>
                <MetricToggle metric={brandMetric} setMetric={setBrandMetric} />
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
                        stroke="#0A0A0A"
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
                <p className="text-nitro-muted text-sm text-center py-12">Sin datos</p>
              )}
            </div>

            {/* Category pie */}
            <div className="nitro-card bg-nitro-card rounded-[16px] border border-nitro-border p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">
                    Ventas por Categoria
                  </h3>
                  <p className="text-[11px] text-nitro-muted font-mono uppercase tracking-wider">
                    {categoryMetric === "revenue" ? "Facturacion" : "Unidades"} por categoria
                  </p>
                </div>
                <MetricToggle metric={categoryMetric} setMetric={setCategoryMetric} />
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
                        stroke="#0A0A0A"
                        strokeWidth={2}
                      >
                        {categoryChartData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip metric={categoryMetric} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <PieLegend data={categoryChartData} />
                </>
              ) : (
                <p className="text-nitro-muted text-sm text-center py-12">Sin datos</p>
              )}
            </div>
          </div>

          {/* ââ Products table card âââââââââââââââââââââââââââ */}
          <div className="nitro-card bg-nitro-card rounded-[16px] border border-nitro-border overflow-hidden animate-fade-in-up"
            style={{ animationDelay: "200ms" }}>
            {/* ââ Header with KPIs âââââââââââââââââââââââââââââ */}
            <div className="p-6 border-b border-nitro-border">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="font-semibold text-white">
                    Top Productos por Facturacion
                  </h3>
                  <p className="text-xs text-nitro-muted mt-1 font-mono">
                    {filteredUniqueProducts.toLocaleString("es-AR")} productos
                    {isFiltered && (
                      <span className="text-nitro-orange">
                        {" "}(filtrado de {allProducts.length.toLocaleString("es-AR")})
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-6">
                  <KpiCard label="Uds vendidas" value={filteredUnits.toLocaleString("es-AR")} />
                  <KpiCard label="Facturacion" value={formatARS(filteredRevenue)} />
                  <KpiCard label="Pareto" value={`Top 20% = ${filteredPareto}%`} accent />
                  {productsAtRisk > 0 && (
                    <div className="text-right">
                      <p className="font-mono text-[11px] text-nitro-muted uppercase tracking-widest mb-0.5">En riesgo</p>
                      <p className="text-sm font-bold font-mono text-nitro-err flex items-center justify-end gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-nitro-err animate-pulse-live" />
                        {productsAtRisk} producto{productsAtRisk !== 1 ? "s" : ""}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ââ Filter bar âââââââââââââââââââââââââââââââââââ */}
            {(brands.length > 0 || categories.length > 0) && (
              <div className="px-6 py-3 bg-nitro-bg2 border-b border-nitro-border flex items-center gap-4 flex-wrap">
                {brands.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="font-mono text-[11px] text-nitro-muted uppercase tracking-widest">
                      Marca
                    </label>
                    <select
                      value={brandFilter}
                      onChange={(e) => setBrandFilter(e.target.value)}
                      className="nitro-select text-sm"
                    >
                      <option value="ALL">
                        Todas ({allProducts.filter((p) => p.brand).length})
                      </option>
                      {brands.map((b) => (
                        <option key={b} value={b}>
                          {b} ({allProducts.filter((p) => p.brand === b).length})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {categories.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="font-mono text-[11px] text-nitro-muted uppercase tracking-widest">
                      Categoria
                    </label>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="nitro-select text-sm"
                    >
                      <option value="ALL">
                        Todas ({allProducts.filter((p) => p.category).length})
                      </option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c} ({allProducts.filter((p) => p.category === c).length})
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
                    className="text-xs text-nitro-orange hover:text-white font-medium ml-auto transition-colors duration-300"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            )}

            {/* ââ Table ââââââââââââââââââââââââââââââââââââââââ */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm nitro-table">
                <thead>
                  <tr className="bg-nitro-card text-left">
                    <th className="px-4 py-3 w-10">#</th>
                    <th className="px-3 py-3">Producto</th>
                    <th className="px-3 py-3 text-right">Unidades</th>
                    <th className="px-3 py-3 text-right">Pedidos</th>
                    <th className="px-3 py-3 text-right">Precio Prom.</th>
                    <th className="px-3 py-3 text-right">Stock</th>
                    <th className="px-3 py-3 text-right">Facturacion</th>
                    <th className="px-3 py-3 text-right">% del Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nitro-border/70">
                  {topFiltered.map((p, idx) => (
                    <tr key={p.id} className="transition-colors duration-200 hover:bg-white/[0.03]">
                      <td className="px-4 py-3 text-nitro-muted text-xs font-mono">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          {p.imageUrl && (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="w-10 h-10 rounded-lg object-cover border border-nitro-border"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          )}
                          <div>
                            <div className="font-medium text-white truncate max-w-[250px]">
                              {p.name}
                            </div>
                            <div className="flex gap-2 mt-0.5">
                              {p.sku && (
                                <span className="text-[11px] text-nitro-muted font-mono uppercase tracking-wider">
                                  SKU: {p.sku}
                                </span>
                              )}
                              {p.brand && (
                                <span
                                  className="text-[11px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                                  style={{
                                    color: "#FF5E1A",
                                    background: "rgba(255, 94, 26, 0.1)",
                                    border: "1px solid rgba(255, 94, 26, 0.2)",
                                  }}
                                >
                                  {p.brand}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-white/80 text-right font-mono text-xs">
                        {p.unitsSold.toLocaleString("es-AR")}
                      </td>
                      <td className="px-3 py-3 text-white/80 text-right font-mono text-xs">
                        {p.orders.toLocaleString("es-AR")}
                      </td>
                      <td className="px-3 py-3 text-white/80 text-right font-mono text-xs">
                        {formatARS(p.avgPrice)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <StockBadge product={p} />
                      </td>
                      <td className="px-3 py-3 font-bold text-white text-right font-mono text-xs">
                        {formatARS(p.revenue)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-nitro-bg rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full"
                              style={{
                                width:
                                  Math.min(
                                    100,
                                    Math.round(
                                      (p.revenue / (filteredRevenue || 1)) * 100
                                    )
                                  ) + "%",
                                background: "var(--nitro-gradient)",
                              }}
                            />
                          </div>
                          <span className="text-[11px] text-nitro-muted w-8 font-mono">
                            {Math.round(
                              (p.revenue / (filteredRevenue || 1)) * 100
                            )}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ââ Footer âââââââââââââââââââââââââââââââââââââââ */}
            {filtered.length > 20 && (
              <div className="px-6 py-3 border-t border-nitro-border bg-nitro-bg2 text-center">
                <p className="text-[11px] text-nitro-muted font-mono uppercase tracking-widest">
                  Mostrando top 20 de {filtered.length.toLocaleString("es-AR")} productos
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
