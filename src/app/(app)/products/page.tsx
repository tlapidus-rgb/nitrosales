// @ts-nocheck
"use client";

import { useEffect, useState, useMemo } from "react";
import { formatARS, formatCompact } from "@/lib/utils/format";
import NitroInsightsPanel from "@/components/NitroInsightsPanel";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

/* ── Types ──────────────────────────────────────── */
interface ProductItem {
  id: string; name: string; sku: string | null; imageUrl: string | null;
  category: string | null; brand: string | null; stock: number | null;
  stockUpdatedAt: string | null; unitsSold: number; revenue: number;
  orders: number; avgPrice: number;
}
interface ProductSummary {
  estimatedTotalUnits: number; estimatedTotalRevenue: number;
  totalOrders: number; detailedUnits: number; detailedRevenue: number;
  uniqueProducts: number; paretoConcentration: number;
}
interface Insight {
  type: "urgente" | "oportunidad" | "alerta" | "tip";
  icon: string; title: string; detail: string;
  metric?: string; tags?: string[];
}

/* ── Color palette for charts ──────────────────── */
const COLORS = ["#FF5E1A","#FF2E2E","#FFB800","#4ADE80","#06b6d4","#8b5cf6","#f97316","#14b8a6","#ec4899","#64748b"];

type PieMetric = "revenue" | "unitsSold";
const ITEMS_PER_PAGE = 15;

/* ── Stock helpers ──────────────────────────────── */
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

/* ── Helpers ──────────────────────────────────── */
function aggregateByField(products: ProductItem[], field: "brand" | "category", metric: PieMetric): { name: string; value: number; pct: number }[] {
  const map = new Map<string, number>();
  let total = 0;
  for (const p of products) {
    const key = p[field] || "Sin datos";
    const v = metric === "revenue" ? p.revenue : p.unitsSold;
    map.set(key, (map.get(key) || 0) + v);
    total += v;
  }
  const sorted = [...map.entries()]
    .map(([name, value]) => ({ name, value, pct: total > 0 ? Math.round((value / total) * 100) : 0 }))
    .sort((a, b) => b.value - a.value);
  if (sorted.length <= 9) return sorted;
  const top = sorted.slice(0, 8);
  const rest = sorted.slice(8);
  const othersValue = rest.reduce((s, r) => s + r.value, 0);
  const othersPct = total > 0 ? Math.round((othersValue / total) * 100) : 0;
  return [...top, { name: `Otros (${rest.length})`, value: othersValue, pct: othersPct }];
}

/* ── Custom bar tooltip ──────────────────────── */
function BarTooltip({ active, payload, metric }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isUnits = metric === "unitsSold";
  return (
    <div style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(255, 94, 26, 0.3)", borderRadius: 12, padding: "10px 14px", fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
      <p style={{ fontWeight: 600, marginBottom: 2, color: "#111827", fontFamily: "DM Sans" }}>{d.name}</p>
      <p style={{ color: "#6B7280", fontFamily: "Space Mono, monospace", fontSize: 11 }}>
        {isUnits ? `${d.value.toLocaleString("es-AR")} uds` : formatARS(d.value)} &middot; {d.pct}%
      </p>
    </div>
  );
}

/* ── Stock Alert Banner ──────────────────────── */
function StockAlertBanner({ products }: { products: ProductItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const analysis = useMemo(() => {
    const withStock = products.filter((p) => p.stock !== null && p.stock !== undefined);
    if (withStock.length === 0) return null;
    const critical: (ProductItem & { days: number })[] = [];
    const low: (ProductItem & { days: number })[] = [];
    for (const p of withStock) {
      const days = getDaysOfStock(p);
      const level = getStockLevel(days);
      if (level === "critical") critical.push({ ...p, days: days || 0 });
      else if (level === "low") low.push({ ...p, days: days || 0 });
    }
    if (critical.length === 0 && low.length === 0) return null;
    const brandRisk = new Map<string, { count: number; avgDays: number; totalDays: number }>();
    for (const p of [...critical, ...low]) {
      const brand = p.brand || "Sin marca";
      const entry = brandRisk.get(brand) || { count: 0, avgDays: 0, totalDays: 0 };
      entry.count++; entry.totalDays += p.days;
      entry.avgDays = Math.round(entry.totalDays / entry.count);
      brandRisk.set(brand, entry);
    }
    const topBrands = [...brandRisk.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 3);
    const urgent = [...critical, ...low].sort((a, b) => a.days - b.days).slice(0, 10);
    return { critical, low, topBrands, urgent, withStock };
  }, [products]);

  if (!analysis) return null;

  return (
    <div className="nitro-card bg-white border border-gray-200 rounded-[16px] p-5 mb-6 animate-fade-in-up" style={{ boxShadow: "0 0 60px rgba(255, 94, 26, 0.06)" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(255, 94, 26, 0.1)", border: "1px solid #E5E7EB" }}>
            <span className="text-sm">&#x26A0;&#xFE0F;</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Alertas de Inventario</h3>
            <p className="text-[11px] font-mono text-gray-400 uppercase tracking-widest">Stock monitor</p>
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-xs font-medium text-nitro-orange hover:text-gray-900 transition-colors duration-300 flex items-center gap-1">
          {expanded ? "Ocultar" : "Ver detalle"}
          <svg className={`w-3.5 h-3.5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
      </div>
      <div className="space-y-2 mb-4">
        {analysis.critical.length > 0 && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: "rgba(255, 94, 94, 0.06)", border: "1px solid rgba(255, 94, 94, 0.15)" }}>
            <span className="w-2 h-2 rounded-full bg-nitro-err animate-pulse-live flex-shrink-0" />
            <span className="text-sm text-gray-500"><span className="font-bold text-nitro-err font-mono">{analysis.critical.length}</span> producto{analysis.critical.length !== 1 ? "s" : ""} con stock critico <span className="text-gray-400">(&lt;7 dias)</span></span>
          </div>
        )}
        {analysis.low.length > 0 && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: "rgba(255, 184, 0, 0.06)", border: "1px solid rgba(255, 184, 0, 0.15)" }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#FFB800" }} />
            <span className="text-sm text-gray-500"><span className="font-bold font-mono" style={{ color: "#FFB800" }}>{analysis.low.length}</span> producto{analysis.low.length !== 1 ? "s" : ""} con stock bajo <span className="text-gray-400">(&lt;14 dias)</span></span>
          </div>
        )}
      </div>
      <div className={`overflow-hidden transition-all duration-500 ease-in-out ${expanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="border-t border-gray-200 pt-4 mt-2">
          <p className="text-[11px] font-mono text-gray-400 uppercase tracking-widest mb-3">Productos mas urgentes</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-gray-400 font-mono uppercase tracking-wider"><th className="pb-2 pr-4">Producto</th><th className="pb-2 pr-4 text-right">Stock</th><th className="pb-2 pr-4 text-right">Dias restantes</th><th className="pb-2 text-right">Ventas/dia</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {analysis.urgent.map((p) => {
                  const daily = (p.unitsSold / 30).toFixed(1);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="py-2 pr-4"><span className="text-gray-900 font-medium truncate block max-w-[200px]">{p.name}</span>{p.brand && <span className="text-gray-400 text-[10px] font-mono">{p.brand}</span>}</td>
                      <td className="py-2 pr-4 text-right font-mono font-bold" style={{ color: p.days < 7 ? "#FF5E5E" : "#FFB800" }}>{p.stock} uds</td>
                      <td className="py-2 pr-4 text-right font-mono font-bold" style={{ color: p.days < 7 ? "#FF5E5E" : "#FFB800" }}>{p.days === 999 ? "\u2014" : `${p.days}d`}</td>
                      <td className="py-2 text-right font-mono text-gray-500">{daily}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-gray-500">
        {analysis.topBrands.length > 0 && (
          <div>
            <span className="font-mono text-[11px] text-gray-400 uppercase tracking-widest">Marcas en riesgo: </span>
            {analysis.topBrands.map(([brand, info], i) => (
              <span key={brand}>{i > 0 && ", "}<span className="text-gray-900">{brand}</span><span className="text-gray-400 font-mono text-[11px]"> ({info.count} prod, ~{info.avgDays}d)</span></span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Stock Badge Component ──────────────────── */
function StockBadge({ product }: { product: ProductItem }) {
  const days = getDaysOfStock(product);
  const level = getStockLevel(days);
  if (level === "nodata") return <span className="text-xs text-gray-400 font-mono">&mdash;</span>;
  const styles = {
    critical: { bg: "rgba(255, 94, 94, 0.1)", border: "rgba(255, 94, 94, 0.25)", text: "#FF5E5E", dot: "#FF5E5E" },
    low: { bg: "rgba(255, 184, 0, 0.1)", border: "rgba(255, 184, 0, 0.25)", text: "#FFB800", dot: "#FFB800" },
    ok: { bg: "rgba(74, 222, 128, 0.1)", border: "rgba(74, 222, 128, 0.25)", text: "#4ADE80", dot: "#4ADE80" },
  };
  const s = styles[level];
  return (
    <div className="text-right">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg" style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}>
        {level === "critical" && <span className="w-1.5 h-1.5 rounded-full animate-pulse-live" style={{ background: s.dot }} />}
        {product.stock!.toLocaleString("es-AR")} uds
      </span>
      <div className="text-[11px] text-gray-400 mt-0.5 font-mono">{days === 999 ? "Sin ventas" : `~${days}d stock`}</div>
    </div>
  );
}

/* ── KPI Card ──────────────────────────────── */
function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-right">
      <p className="font-mono text-[11px] text-gray-400 uppercase tracking-widest mb-0.5">{label}</p>
      <p className={`text-sm font-bold font-mono ${accent ? "text-nitro-orange" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

/* ── Metric Toggle ──────────────────────────── */
function MetricToggle({ metric, setMetric }: { metric: PieMetric; setMetric: (m: PieMetric) => void }) {
  return (
    <div className="flex bg-gray-100 rounded-lg p-0.5 flex-shrink-0 border border-gray-200">
      <button onClick={() => setMetric("revenue")} className={`text-[11px] px-2.5 py-1 rounded-md font-mono uppercase tracking-wider transition-all duration-300 ease-nitro ${metric === "revenue" ? "bg-white text-nitro-orange shadow-sm" : "text-gray-400 hover:text-gray-500"}`}>Revenue</button>
      <button onClick={() => setMetric("unitsSold")} className={`text-[11px] px-2.5 py-1 rounded-md font-mono uppercase tracking-wider transition-all duration-300 ease-nitro ${metric === "unitsSold" ? "bg-white text-nitro-orange shadow-sm" : "text-gray-400 hover:text-gray-500"}`}>Unidades</button>
    </div>
  );
}

/* ── Expanded Product Detail ──────────────── */
function ProductDetail({ product, totalRevenue }: { product: ProductItem; totalRevenue: number }) {
  const days = getDaysOfStock(product);
  const dailySales = (product.unitsSold / 30).toFixed(1);
  const revPct = totalRevenue > 0 ? ((product.revenue / totalRevenue) * 100).toFixed(1) : "0";
  return (
    <tr className="animate-fade-in-up">
      <td colSpan={8} className="px-4 py-4 bg-gray-50 border-t border-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex gap-3">
            {product.imageUrl && <img src={product.imageUrl} alt={product.name} className="w-16 h-16 rounded-xl object-cover border border-gray-200 flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
            <div className="min-w-0">
              <p className="font-medium text-gray-900 text-sm">{product.name}</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {product.sku && <span className="text-[10px] text-gray-400 font-mono">SKU: {product.sku}</span>}
                {product.brand && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: "#FF5E1A", background: "rgba(255, 94, 26, 0.1)", border: "1px solid rgba(255, 94, 26, 0.2)" }}>{product.brand}</span>}
                {product.category && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">{product.category}</span>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Facturacion</p><p className="text-sm font-bold font-mono text-gray-900">{formatARS(product.revenue)}</p></div>
            <div><p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Pedidos</p><p className="text-sm font-bold font-mono text-gray-900">{product.orders.toLocaleString("es-AR")}</p></div>
            <div><p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Unidades</p><p className="text-sm font-bold font-mono text-gray-900">{product.unitsSold.toLocaleString("es-AR")}</p></div>
            <div><p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Precio Prom</p><p className="text-sm font-bold font-mono text-gray-900">{formatARS(product.avgPrice)}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">% del Total</p><p className="text-sm font-bold font-mono text-nitro-orange">{revPct}%</p></div>
            <div><p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Ventas/dia</p><p className="text-sm font-bold font-mono text-gray-900">{dailySales}</p></div>
            <div><p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Stock</p><p className="text-sm font-bold font-mono text-gray-900">{product.stock !== null ? `${product.stock} uds` : "\u2014"}</p></div>
            <div><p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Dias stock</p><p className="text-sm font-bold font-mono text-gray-900">{days === null ? "\u2014" : days === 999 ? "Sin ventas" : `${days}d`}</p></div>
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ── AI Advisor Card ──────────────────────── */
function NitroAdvisor({ insights, healthScore, loading }: { insights: Insight[]; healthScore: number; loading: boolean }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="nitro-card bg-white border border-gray-200 rounded-[16px] p-6 mb-6 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center animate-pulse" style={{ background: "linear-gradient(135deg, #FF5E1A 0%, #FF2E2E 100%)" }}>
            <span className="text-white text-lg">&#x2728;</span>
          </div>
          <div>
            <div className="h-4 w-48 bg-gray-200 rounded animate-pulse mb-1" />
            <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (insights.length === 0) return null;

  const typeStyles: Record<string, { bg: string; border: string; accent: string; label: string }> = {
    urgente: { bg: "rgba(255, 94, 94, 0.04)", border: "rgba(255, 94, 94, 0.15)", accent: "#FF5E5E", label: "URGENTE" },
    oportunidad: { bg: "rgba(74, 222, 128, 0.04)", border: "rgba(74, 222, 128, 0.15)", accent: "#4ADE80", label: "OPORTUNIDAD" },
    alerta: { bg: "rgba(255, 184, 0, 0.04)", border: "rgba(255, 184, 0, 0.15)", accent: "#FFB800", label: "ALERTA" },
    tip: { bg: "rgba(6, 182, 212, 0.04)", border: "rgba(6, 182, 212, 0.15)", accent: "#06b6d4", label: "TIP" },
  };

  const scoreColor = healthScore >= 70 ? "#4ADE80" : healthScore >= 50 ? "#FFB800" : "#FF5E5E";

  return (
    <div className="nitro-card bg-white border border-gray-200 rounded-[16px] overflow-hidden mb-6 animate-fade-in-up" style={{ boxShadow: "0 0 80px rgba(255, 94, 26, 0.06)" }}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200" style={{ background: "linear-gradient(135deg, rgba(255, 94, 26, 0.02) 0%, rgba(255, 46, 46, 0.02) 100%)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #FF5E1A 0%, #FF2E2E 100%)", boxShadow: "0 4px 15px rgba(255, 94, 26, 0.3)" }}>
              <span className="text-white text-lg">&#x1F9E0;</span>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Nitro Advisor</h3>
              <p className="text-[11px] font-mono text-gray-400 uppercase tracking-widest">Analisis comercial inteligente</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Salud Comercial</p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-20 bg-gray-200 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all duration-1000" style={{ width: `${healthScore}%`, background: scoreColor }} />
                </div>
                <span className="text-sm font-bold font-mono" style={{ color: scoreColor }}>{healthScore}%</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Insights</p>
              <p className="text-sm font-bold font-mono text-gray-900">{insights.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Insights list */}
      <div className="divide-y divide-gray-100">
        {insights.map((insight, idx) => {
          const style = typeStyles[insight.type];
          const isExpanded = expandedIdx === idx;
          return (
            <div
              key={idx}
              className="px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors duration-200"
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0 mt-0.5">{insight.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md uppercase tracking-wider" style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.accent }}>
                      {style.label}
                    </span>
                    {insight.metric && (
                      <span className="text-[10px] font-mono text-gray-400">{insight.metric}</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900 leading-snug">{insight.title}</p>
                  <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? "max-h-40 opacity-100 mt-2" : "max-h-0 opacity-0"}`}>
                    <p className="text-sm text-gray-500 leading-relaxed">{insight.detail}</p>
                    {insight.tags && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {insight.tags.map((tag) => (
                          <span key={tag} className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-gray-100 text-gray-400 border border-gray-200">#{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <svg className={`w-4 h-4 text-gray-300 flex-shrink-0 mt-1 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
        <p className="text-[10px] font-mono text-gray-400 text-center uppercase tracking-widest">
          Analisis basado en ventas, stock y busquedas GA4 de los ultimos 30 dias
        </p>
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────── */
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
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [storeSearches, setStoreSearches] = useState<{ term: string; count: number; matchedProducts: any[]; hasStock: boolean }[]>([]);
  const [aiInsights, setAiInsights] = useState<Insight[]>([]);
  const [aiHealthScore, setAiHealthScore] = useState(0);
  const [aiLoading, setAiLoading] = useState(true);

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

    fetch("/api/metrics/searches")
      .then((r) => r.json())
      .then((data) => { if (data.searchTerms) setStoreSearches(data.searchTerms); })
      .catch(() => {});

    fetch("/api/metrics/insights")
      .then((r) => r.json())
      .then((data) => {
        if (data.insights) setAiInsights(data.insights);
        if (data.healthScore) setAiHealthScore(data.healthScore);
      })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return allProducts.filter(
      (p) => (brandFilter === "ALL" || p.brand === brandFilter) && (categoryFilter === "ALL" || p.category === categoryFilter)
    );
  }, [allProducts, brandFilter, categoryFilter]);

  const searched = useMemo(() => {
    if (!searchTerm.trim()) return filtered;
    const term = searchTerm.toLowerCase();
    return filtered.filter(
      (p) => p.name.toLowerCase().includes(term) || (p.sku && p.sku.toLowerCase().includes(term)) || (p.brand && p.brand.toLowerCase().includes(term)) || (p.category && p.category.toLowerCase().includes(term))
    );
  }, [filtered, searchTerm]);

  const sorted = useMemo(() => [...searched].sort((a, b) => b.revenue - a.revenue), [searched]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const paginatedProducts = sorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); setExpandedProduct(null); }, [brandFilter, categoryFilter, searchTerm]);

  const isFiltered = brandFilter !== "ALL" || categoryFilter !== "ALL";
  const filteredUnits = filtered.reduce((s, p) => s + p.unitsSold, 0);
  const filteredRevenue = filtered.reduce((s, p) => s + p.revenue, 0);
  const filteredUniqueProducts = filtered.length;
  const top20pct = Math.max(1, Math.ceil(filtered.length * 0.2));
  const top20revenue = [...filtered].sort((a, b) => b.revenue - a.revenue).slice(0, top20pct).reduce((s, p) => s + p.revenue, 0);
  const filteredPareto = filteredRevenue > 0 ? Math.round((top20revenue / filteredRevenue) * 100) : 0;

  const productsAtRisk = useMemo(() => filtered.filter((p) => { const days = getDaysOfStock(p); return days !== null && days < 14; }).length, [filtered]);
  const productsNoStock = useMemo(() => filtered.filter((p) => !p.stock || p.stock === 0).length, [filtered]);

  const brandChartData = useMemo(() => aggregateByField(filtered, "brand", brandMetric), [filtered, brandMetric]);
  const categoryChartData = useMemo(() => aggregateByField(filtered, "category", categoryMetric), [filtered, categoryMetric]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-nitro-orange animate-pulse-live" />
        <p className="text-gray-500 font-mono text-sm tracking-wider uppercase">Cargando productos</p>
      </div>
    </div>
  );

  return (
    <div className="light-canvas min-h-screen">
      {/* ── Header ─────────────────────────── */}
      <div className="mb-6 animate-fade-in-up">
        <h2 className="font-headline text-3xl text-gray-900 tracking-tight" style={{ letterSpacing: "-1px" }}>Productos</h2>
        <p className="text-gray-500 mt-1">Top productos por facturacion &middot; <span className="font-mono text-[11px] text-gray-400 uppercase tracking-wider">Ultimos 30 dias</span></p>
      </div>

      {allProducts.length === 0 ? (
        <div className="bg-white rounded-[16px] border border-gray-200 p-12 text-center"><p className="text-gray-400">No hay datos de productos aun.</p></div>
      ) : (
        <>
          {/* ── KPI Summary Cards ────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6 animate-fade-in-up">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="font-mono text-[11px] text-gray-400 uppercase tracking-widest mb-1">Productos Activos</p>
              <p className="text-xl font-bold font-mono text-gray-900">{(summary?.uniqueProducts || allProducts.length).toLocaleString("es-AR")}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="font-mono text-[11px] text-gray-400 uppercase tracking-widest mb-1">Facturacion</p>
              <p className="text-xl font-bold font-mono text-gray-900">{formatCompact(summary?.estimatedTotalRevenue || filteredRevenue)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="font-mono text-[11px] text-gray-400 uppercase tracking-widest mb-1">Uds Vendidas</p>
              <p className="text-xl font-bold font-mono text-gray-900">{(summary?.estimatedTotalUnits || filteredUnits).toLocaleString("es-AR")}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="font-mono text-[11px] text-gray-400 uppercase tracking-widest mb-1">Ticket Promedio</p>
              <p className="text-xl font-bold font-mono text-gray-900">{formatARS(Math.round((summary?.estimatedTotalRevenue || filteredRevenue) / (summary?.totalOrders || 1)))}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="font-mono text-[11px] text-gray-400 uppercase tracking-widest mb-1">Sin Stock</p>
              <p className="text-xl font-bold font-mono" style={{ color: productsNoStock > 0 ? "#FF5E5E" : "#4ADE80" }}>{productsNoStock} <span className="text-xs text-gray-400 font-normal ml-1">productos</span></p>
            </div>
          </div>

          {/* ── Stock Alerts Banner ────────── */}
          <StockAlertBanner products={filtered} />

          {/* ── Bar Charts ──────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 stagger-children">
            <div className="nitro-card bg-white rounded-[16px] border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div><h3 className="text-sm font-semibold text-gray-900 mb-1">Ventas por Marca</h3><p className="text-[11px] text-gray-400 font-mono uppercase tracking-wider">{brandMetric === "revenue" ? "Facturacion" : "Unidades"} por marca</p></div>
                <MetricToggle metric={brandMetric} setMetric={setBrandMetric} />
              </div>
              {brandChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(250, brandChartData.length * 32)}>
                  <BarChart layout="vertical" data={brandChartData} margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                    <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: "#6B7280", fontFamily: "DM Sans" }} tickLine={false} axisLine={false} />
                    <Tooltip content={<BarTooltip metric={brandMetric} />} cursor={{ fill: "rgba(255, 94, 26, 0.04)" }} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>{brandChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-gray-400 text-sm text-center py-12">Sin datos</p>}
            </div>
            <div className="nitro-card bg-white rounded-[16px] border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div><h3 className="text-sm font-semibold text-gray-900 mb-1">Ventas por Categoria</h3><p className="text-[11px] text-gray-400 font-mono uppercase tracking-wider">{categoryMetric === "revenue" ? "Facturacion" : "Unidades"} por categoria</p></div>
                <MetricToggle metric={categoryMetric} setMetric={setCategoryMetric} />
              </div>
              {categoryChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(250, categoryChartData.length * 32)}>
                  <BarChart layout="vertical" data={categoryChartData} margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                    <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: "#6B7280", fontFamily: "DM Sans" }} tickLine={false} axisLine={false} />
                    <Tooltip content={<BarTooltip metric={categoryMetric} />} cursor={{ fill: "rgba(255, 94, 26, 0.04)" }} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>{categoryChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-gray-400 text-sm text-center py-12">Sin datos</p>}
            </div>
          </div>

          {/* ── Products table card ────────── */}
          <div className="nitro-card bg-white rounded-[16px] border border-gray-200 overflow-hidden animate-fade-in-up" style={{ animationDelay: "200ms" }}>
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="font-semibold text-gray-900">Top Productos por Facturacion</h3>
                  <p className="text-xs text-gray-400 mt-1 font-mono">{filteredUniqueProducts.toLocaleString("es-AR")} productos{isFiltered && <span className="text-nitro-orange"> (filtrado de {allProducts.length.toLocaleString("es-AR")})</span>}</p>
                </div>
                <div className="flex gap-6">
                  <KpiCard label="Uds vendidas" value={filteredUnits.toLocaleString("es-AR")} />
                  <KpiCard label="Facturacion" value={formatARS(filteredRevenue)} />
                  <KpiCard label="Pareto" value={`Top 20% = ${filteredPareto}%`} accent />
                  {productsAtRisk > 0 && (
                    <div className="text-right">
                      <p className="font-mono text-[11px] text-gray-400 uppercase tracking-widest mb-0.5">En riesgo</p>
                      <p className="text-sm font-bold font-mono text-nitro-err flex items-center justify-end gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-nitro-err animate-pulse-live" />{productsAtRisk} producto{productsAtRisk !== 1 ? "s" : ""}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-3 bg-white border-b border-gray-200 flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-[360px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input type="text" placeholder="Buscar por nombre, SKU, marca..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#FF5E1A] focus:ring-2 focus:ring-[rgba(255,94,26,0.15)] transition-all" />
                {searchTerm && <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>}
              </div>
              {brands.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="font-mono text-[11px] text-gray-400 uppercase tracking-widest">Marca</label>
                  <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="nitro-select text-sm">
                    <option value="ALL">Todas ({allProducts.filter((p) => p.brand).length})</option>
                    {brands.map((b) => <option key={b} value={b}>{b} ({allProducts.filter((p) => p.brand === b).length})</option>)}
                  </select>
                </div>
              )}
              {categories.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="font-mono text-[11px] text-gray-400 uppercase tracking-widest">Categoria</label>
                  <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="nitro-select text-sm">
                    <option value="ALL">Todas ({allProducts.filter((p) => p.category).length})</option>
                    {categories.map((c) => <option key={c} value={c}>{c} ({allProducts.filter((p) => p.category === c).length})</option>)}
                  </select>
                </div>
              )}
              {(isFiltered || searchTerm) && <button onClick={() => { setBrandFilter("ALL"); setCategoryFilter("ALL"); setSearchTerm(""); }} className="text-xs text-nitro-orange hover:text-gray-900 font-medium ml-auto transition-colors duration-300">Limpiar filtros</button>}
            </div>
            {searchTerm && (
              <div className="px-6 py-2 bg-gray-50 border-b border-gray-200"><p className="text-xs text-gray-500 font-mono">{sorted.length} resultado{sorted.length !== 1 ? "s" : ""} para &ldquo;{searchTerm}&rdquo;</p></div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm nitro-table">
                <thead><tr className="bg-white text-left"><th className="px-4 py-3 w-10">#</th><th className="px-3 py-3">Producto</th><th className="px-3 py-3 text-right">Unidades</th><th className="px-3 py-3 text-right">Pedidos</th><th className="px-3 py-3 text-right">Precio Prom.</th><th className="px-3 py-3 text-right">Stock</th><th className="px-3 py-3 text-right">Facturacion</th><th className="px-3 py-3 text-right">% del Total</th></tr></thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedProducts.map((p, idx) => {
                    const globalIdx = (currentPage - 1) * ITEMS_PER_PAGE + idx + 1;
                    const isExpanded = expandedProduct === p.id;
                    return (
                      <>
                        <tr key={p.id} className={`transition-colors duration-200 cursor-pointer ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50"}`} onClick={() => setExpandedProduct(isExpanded ? null : p.id)}>
                          <td className="px-4 py-3 text-gray-400 text-xs font-mono"><div className="flex items-center gap-1.5"><svg className={`w-3 h-3 text-gray-300 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>{globalIdx}</div></td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-3">
                              {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="w-10 h-10 rounded-lg object-cover border border-gray-200" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                              <div>
                                <div className="font-medium text-gray-900 truncate max-w-[250px]">{p.name}</div>
                                <div className="flex gap-2 mt-0.5">
                                  {p.sku && <span className="text-[11px] text-gray-400 font-mono uppercase tracking-wider">SKU: {p.sku}</span>}
                                  {p.brand && <span className="text-[11px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: "#FF5E1A", background: "rgba(255, 94, 26, 0.1)", border: "1px solid rgba(255, 94, 26, 0.2)" }}>{p.brand}</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-gray-900/80 text-right font-mono text-xs">{p.unitsSold.toLocaleString("es-AR")}</td>
                          <td className="px-3 py-3 text-gray-900/80 text-right font-mono text-xs">{p.orders.toLocaleString("es-AR")}</td>
                          <td className="px-3 py-3 text-gray-900/80 text-right font-mono text-xs">{formatARS(p.avgPrice)}</td>
                          <td className="px-3 py-3 text-right"><StockBadge product={p} /></td>
                          <td className="px-3 py-3 font-bold text-gray-900 text-right font-mono text-xs">{formatARS(p.revenue)}</td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-gray-200 rounded-full h-1.5"><div className="h-1.5 rounded-full" style={{ width: Math.min(100, Math.round((p.revenue / (filteredRevenue || 1)) * 100)) + "%", background: "var(--nitro-gradient)" }} /></div>
                              <span className="text-[11px] text-gray-400 w-8 font-mono">{Math.round((p.revenue / (filteredRevenue || 1)) * 100)}%</span>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && <ProductDetail key={`detail-${p.id}`} product={p} totalRevenue={filteredRevenue} />}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 border-t border-gray-200 bg-white flex items-center justify-between">
              <p className="text-[11px] text-gray-400 font-mono">Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, sorted.length)} de {sorted.length.toLocaleString("es-AR")} productos</p>
              <div className="flex items-center gap-2">
                <button disabled={currentPage === 1} onClick={() => { setCurrentPage(currentPage - 1); setExpandedProduct(null); }} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${currentPage === 1 ? "border-gray-200 text-gray-300 cursor-not-allowed" : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"}`}>Anterior</button>
                <span className="text-xs font-mono text-gray-400 px-2">{currentPage} / {totalPages}</span>
                <button disabled={currentPage === totalPages} onClick={() => { setCurrentPage(currentPage + 1); setExpandedProduct(null); }} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${currentPage === totalPages ? "border-gray-200 text-gray-300 cursor-not-allowed" : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"}`}>Siguiente</button>
              </div>
            </div>
          </div>

          {/* ── Store Search Terms (GA4) — MOVED BELOW TABLE ──── */}
          {storeSearches.length > 0 && (
            <div className="nitro-card bg-white border border-gray-200 rounded-[16px] p-5 mt-6 animate-fade-in-up" style={{ boxShadow: "0 0 60px rgba(255, 94, 26, 0.04)" }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(255, 94, 26, 0.1)", border: "1px solid #E5E7EB" }}>
                    <svg className="w-4 h-4" style={{ color: "#FF5E1A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Busquedas Populares en la Tienda</h3>
                    <p className="text-[11px] font-mono text-gray-400 uppercase tracking-widest">GA4 &middot; Ultimos 30 dias &middot; {storeSearches.length} terminos</p>
                  </div>
                </div>
                <p className="text-[11px] font-mono text-gray-400">Click para buscar en el catalogo</p>
              </div>
              <div className="overflow-y-auto space-y-1" style={{ maxHeight: "400px" }}>
                {storeSearches.map((s, i) => {
                  const maxCount = storeSearches[0]?.count || 1;
                  const pct = Math.max(4, Math.round((s.count / maxCount) * 100));
                  const isOrange = i < 3;
                  return (
                    <div key={s.term} className="flex items-center gap-3 group cursor-pointer rounded-lg px-1 py-0.5 hover:bg-gray-50 transition-colors duration-200" onClick={() => { setSearchTerm(s.term); setBrandFilter("ALL"); setCategoryFilter("ALL"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      <span className="text-[11px] font-mono text-gray-300 w-5 text-right flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 relative h-7 overflow-hidden rounded-md">
                        <div className="absolute inset-y-0 left-0 rounded-md transition-all duration-500 ease-out" style={{ width: `${pct}%`, background: isOrange ? "rgba(255, 94, 26, 0.08)" : "rgba(107, 114, 128, 0.06)" }} />
                        <div className="relative flex items-center justify-between px-3 h-full">
                          <span className={`text-sm transition-colors duration-200 ${isOrange ? "text-gray-800 font-medium group-hover:text-[#FF5E1A]" : "text-gray-600 group-hover:text-gray-900"}`}>{s.term}</span>
                          <span className="text-[11px] font-mono text-gray-400 flex-shrink-0 ml-3">{s.count.toLocaleString("es-AR")}</span>
                        </div>
                      </div>
                      {!s.hasStock && s.matchedProducts.length > 0 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: "rgba(255, 94, 94, 0.08)", border: "1px solid rgba(255, 94, 94, 0.2)", color: "#FF5E5E" }}>Sin stock</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── AI Advisor ────────────────── */}
          <div className="mt-6">
            <NitroAdvisor insights={aiInsights} healthScore={aiHealthScore} loading={aiLoading} />
          </div>
        </>
      )}

      <NitroInsightsPanel section="products" />
    </div>
  );
}
