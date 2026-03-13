// @ts-nocheck
"use client";

import { useEffect, useState, useMemo } from "react";
import { formatARS, formatCompact } from "@/lib/utils/format";
/* NitroInsightsPanel removed â€” replaced by NitroAdvisorAI chat */
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

/* â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

/* â”€â”€ Color palette for charts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const COLORS = ["#FF5E1A","#FF2E2E","#FFB800","#4ADE80","#06b6d4","#8b5cf6","#f97316","#14b8a6","#ec4899","#64748b"];

type PieMetric = "revenue" | "unitsSold";
const ITEMS_PER_PAGE = 15;

/* â”€â”€ Stock helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

/* â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

/* â”€â”€ Custom bar tooltip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

/* â”€â”€ Stock Alert Banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function StockFreshnessLabel({ syncedAt, className = "" }: { syncedAt: string | null; className?: string }) {
  if (!syncedAt) return <span className={`text-[10px] font-mono text-gray-300 ${className}`}>Stock no sincronizado</span>;
  const d = new Date(syncedAt);
  const formatted = d.toLocaleDateString("es-AR", { day: "numeric", month: "long" }) + ", " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) + " hs";
  return (
    <span className={`text-[10px] font-mono text-gray-400 flex items-center gap-1 ${className}`}>
      <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      Stock actualizado al {formatted}
    </span>
  );
}

function StockAlertBanner({ products, stockSyncedAt }: { products: ProductItem[]; stockSyncedAt: string | null }) {
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
        <div className="flex items-center gap-3">
          <StockFreshnessLabel syncedAt={stockSyncedAt} />
          <button onClick={() => setExpanded(!expanded)} className="text-xs font-medium text-nitro-orange hover:text-gray-900 transition-colors duration-300 flex items-center gap-1">
          {expanded ? "Ocultar" : "Ver detalle"}
          <svg className={`w-3.5 h-3.5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
        </div>
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

/* â”€â”€ Stock Badge Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

/* â”€â”€ KPI Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-right">
      <p className="font-mono text-[11px] text-gray-400 uppercase tracking-widest mb-0.5">{label}</p>
      <p className={`text-sm font-bold font-mono ${accent ? "text-nitro-orange" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

/* â”€â”€ Metric Toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function MetricToggle({ metric, setMetric }: { metric: PieMetric; setMetric: (m: PieMetric) => void }) {
  return (
    <div className="flex bg-gray-100 rounded-lg p-0.5 flex-shrink-0 border border-gray-200">
      <button onClick={() => setMetric("revenue")} className={`text-[11px] px-2.5 py-1 rounded-md font-mono uppercase tracking-wider transition-all duration-300 ease-nitro ${metric === "revenue" ? "bg-white text-nitro-orange shadow-sm" : "text-gray-400 hover:text-gray-500"}`}>Revenue</button>
      <button onClick={() => setMetric("unitsSold")} className={`text-[11px] px-2.5 py-1 rounded-md font-mono uppercase tracking-wider transition-all duration-300 ease-nitro ${metric === "unitsSold" ? "bg-white text-nitro-orange shadow-sm" : "text-gray-400 hover:text-gray-500"}`}>Unidades</button>
    </div>
  );
}

/* â”€â”€ Expanded Product Detail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

/* â”€â”€ AI Advisor Chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface ChatMessage { role: "user" | "assistant"; content: string; }

function NitroAdvisorAI({ insights, healthScore, loading, stockSyncedAt }: { insights: Insight[]; healthScore: number; loading: boolean; stockSyncedAt?: string | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const chatEndRef = { current: null as HTMLDivElement | null };

  const scoreColor = healthScore >= 70 ? "#4ADE80" : healthScore >= 50 ? "#FFB800" : "#FF5E5E";

  // Auto-generate initial insights summary
  useEffect(() => {
    if (!loading && insights.length > 0 && messages.length === 0) {
      const urgentes = insights.filter((i) => i.type === "urgente");
      const oportunidades = insights.filter((i) => i.type === "oportunidad");
      const alertas = insights.filter((i) => i.type === "alerta");
      const tips = insights.filter((i) => i.type === "tip");

      let welcome = `Hola! Analice tu operacion comercial. Salud comercial: **${healthScore}%**\n\n`;
      if (urgentes.length > 0) {
        welcome += `**${urgentes.length} alertas urgentes:**\n`;
        for (const u of urgentes.slice(0, 3)) welcome += `- ${u.icon} ${u.title}\n`;
        if (urgentes.length > 3) welcome += `- ...y ${urgentes.length - 3} mas\n`;
        welcome += `\n`;
      }
      if (oportunidades.length > 0) {
        welcome += `**${oportunidades.length} oportunidades detectadas:**\n`;
        for (const o of oportunidades.slice(0, 2)) welcome += `- ${o.icon} ${o.title}\n`;
        welcome += `\n`;
      }
      if (alertas.length > 0) welcome += `**${alertas.length} alertas** de stock y concentracion.\n`;
      if (tips.length > 0) welcome += `**${tips.length} tips** de optimizacion.\n\n`;
      welcome += `Preguntame lo que necesitas: stock, marcas, categorias, precios, tendencias, oportunidades, o cualquier analisis comercial.`;

      setMessages([{ role: "assistant", content: welcome }]);
    }
  }, [loading, insights]);

  const scrollToBottom = () => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    try {
      const res = await fetch("/api/metrics/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.response || "No pude procesar tu consulta." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error de conexion. Intenta de nuevo." }]);
    } finally {
      setSending(false);
    }
  };

  const quickActions = [
    { label: "Stock critico", q: "Que productos tienen stock critico?" },
    { label: "Top sellers", q: "Cuales son los productos mas vendidos?" },
    { label: "Oportunidades", q: "Que oportunidades de crecimiento tengo?" },
    { label: "Diagnostico", q: "Dame un diagnostico general del negocio" },
    { label: "Marcas", q: "Como rinden las marcas?" },
    { label: "Busquedas", q: "Que buscan mis clientes?" },
  ];

  const renderMarkdown = (text: string) => {
    return text.split("\n").map((line, i) => {
      // Headers
      if (line.startsWith("## ")) return <p key={i} className="text-sm font-bold text-gray-900 mt-3 mb-1">{line.replace("## ", "")}</p>;
      // Bold lines with dash (list items)
      if (line.startsWith("- **")) {
        const parts = line.substring(2).split("**");
        return (
          <p key={i} className="text-sm text-gray-600 pl-3 py-0.5 border-l-2 border-gray-200 my-0.5">
            <span className="font-semibold text-gray-800">{parts[1]}</span>{parts[2] || ""}
          </p>
        );
      }
      // Regular list items
      if (line.startsWith("- ")) return <p key={i} className="text-sm text-gray-600 pl-3 py-0.5">{line.substring(2)}</p>;
      // Numbered items
      if (line.match(/^\d+\.\s/)) {
        const parts = line.split("**");
        if (parts.length >= 3) {
          return (
            <p key={i} className="text-sm text-gray-600 pl-1 py-0.5">
              <span className="font-semibold text-gray-800">{parts[0]}{parts[1]}</span>{parts[2]}
            </p>
          );
        }
        return <p key={i} className="text-sm text-gray-600 pl-1 py-0.5">{line}</p>;
      }
      // Table rows
      if (line.startsWith("|") && !line.startsWith("|---")) {
        const cells = line.split("|").filter(Boolean).map((c) => c.trim());
        if (cells.length >= 2) {
          return (
            <div key={i} className="flex justify-between text-sm py-0.5 px-2 even:bg-gray-50 rounded">
              <span className="text-gray-500">{cells[0]}</span>
              <span className="font-mono font-medium text-gray-900">{cells[1]}</span>
            </div>
          );
        }
      }
      if (line.startsWith("|---")) return null;
      // Bold text inline
      if (line.includes("**")) {
        const parts = line.split("**");
        return (
          <p key={i} className="text-sm text-gray-600 my-0.5">
            {parts.map((part, j) => j % 2 === 1 ? <span key={j} className="font-semibold text-gray-800">{part}</span> : part)}
          </p>
        );
      }
      // Empty line
      if (line.trim() === "") return <div key={i} className="h-2" />;
      // Normal text
      return <p key={i} className="text-sm text-gray-600 my-0.5">{line}</p>;
    });
  };

  if (loading) {
    return (
      <div className="nitro-card bg-white border border-gray-200 rounded-[16px] p-6 mb-6 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center animate-pulse" style={{ background: "linear-gradient(135deg, #FF5E1A 0%, #FF2E2E 100%)" }}>
            <span className="text-white text-lg">&#x1F9E0;</span>
          </div>
          <div>
            <div className="h-4 w-48 bg-gray-200 rounded animate-pulse mb-1" />
            <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nitro-card bg-white border border-gray-200 rounded-[16px] overflow-hidden mb-6 animate-fade-in-up" style={{ boxShadow: "0 0 80px rgba(255, 94, 26, 0.06)" }}>
      {/* Header */}
      <div className="p-5 border-b border-gray-200 cursor-pointer" style={{ background: "linear-gradient(135deg, rgba(255, 94, 26, 0.03) 0%, rgba(255, 46, 46, 0.02) 100%)" }} onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #FF5E1A 0%, #FF2E2E 100%)", boxShadow: "0 4px 15px rgba(255, 94, 26, 0.3)" }}>
              <span className="text-white text-lg">&#x1F9E0;</span>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Nitro Advisor AI</h3>
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-mono text-gray-400 uppercase tracking-widest">Consultor comercial inteligente</p>
                {stockSyncedAt && <span className="text-[9px] font-mono text-gray-300">&middot;</span>}
                <StockFreshnessLabel syncedAt={stockSyncedAt || null} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {healthScore > 0 && (
              <div className="text-right">
                <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Salud</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="w-16 bg-gray-200 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all duration-1000" style={{ width: `${healthScore}%`, background: scoreColor }} />
                  </div>
                  <span className="text-sm font-bold font-mono" style={{ color: scoreColor }}>{healthScore}%</span>
                </div>
              </div>
            )}
            <svg class=${`w-5 h-5 text-gray-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Chat body */}
      <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isOpen ? "max-h-[700px]" : "max-h-0"}`}>
        {/* Messages */}
        <div className="overflow-y-auto px-5 py-4 space-y-4" style={{ maxHeight: "460px" }}>
          {messages.map((msg, idx) => (
            <div key={idx} class={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "ass\İ[ˆ	‰ˆ
ˆ]ˆÛ\ÜÓ˜[YOHËMÈMÈ›İ[™Y[È›^][\ËXÙ[\ˆ\İYKXÙ[\ˆ\‹Lˆ]LH›^\Úš[šËLˆİ[O^ŞÈ˜XÚÙÜ›İ[™ˆ›[™X\‹YÜ˜YY[
LÍYYËÑ‘QLPH	KÑ‘Œ‘L‘HL	JHˆ_O‚ˆÜ[ˆÛ\ÜÓ˜[YOH^]Ú]H^^È‰ˆŞQQLÏÜÜ[‚ˆÙ]‚ˆ
_Bˆ]ˆÛ\ÜÓ˜[YO^ØX^]ËVÎIWH›İ[™YLMKLÈ	Û\ÙËœ›ÛHOOH\Ù\ˆˆÈ˜™ËYÜ˜^KNL^]Ú]Hˆˆ˜™ËYÜ˜^KML›Ü™\ˆ›Ü™\‹YÜ˜^KLŒŸXHİ[O^Û\ÙËœ›ÛHOOH\Ù\ˆˆÈßHˆß_O‚ˆÛ\ÙËœ›ÛHOOH\Ù\ˆˆÈ
ˆÛ\ÜÓ˜[YOH^\ÛHÛ\ÙË˜ÛÛ[OÜ‚ˆ
Hˆ
ˆ]Ü™[™\“X\šÙİÛŠ\ÙË˜ÛÛ[
_OÙ]‚ˆ
_BˆÙ]‚ˆÙ]‚ˆ
J_BˆÜÙ[™[™È	‰ˆ
ˆ]ˆÛ\ÜÏH™›^\İYK\İ\‚ˆ]ˆÛ\ÜÓ˜[YOHËMÈMÈ›İ[™Y[È›^][\ËXÙ[\ˆ\İYKXÙ[\ˆ\‹Lˆ]LH›^\Ú[šËLˆİ[O^ŞÈ˜XÚÙÜ›İ[™ˆ›[™X\‹YÜ˜YY[
LÍYYËÑ‘QLPH	KÑ‘Œ‘L‘HL	JHˆ_O‚ˆÜ[ˆÛ\ÜÓ˜[YOH^]Ú]H^^È‰ˆŞQQLÏÜÜ[‚ˆÙ]‚ˆ]ˆÛ\ÜÓ˜[YOH˜™ËYÜ˜^KML›Ü™\ˆ›Ü™\‹YÜ˜^KLŒ›İ[™YLMKLÈ‚ˆ]ˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆØ\LKH‚ˆ]ˆÛ\ÜÓ˜[YOHËLˆLˆ›İ[™YY[™Ë[š]›Ë[Ü˜[™ÙH[š[X]KX›İ[˜ÙHˆİ[O^ŞÈ[š[X][Û‘[^NˆŒ\Èˆ_HÏ‚ˆ]ˆÛ\ÜÓ˜[YObs-2 h-2 rounded-full bg-nitro-orange animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 rounded-full bg-nitro-orange animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={(el) => { chatEndRef.current = el; }} />
        </div>

        {/* Quick actions */}
        {messages.length <= 1 && (
          <div className="px-5 pb-3">
            <div className="flex flex-wrap gap-2">
              {quickActions.map((a) => (
                <button key={a.label} onClick={() => { setInput(a.q); setTimeout(() => { setInput(""); setSending(true); setMessages((prev) => [...prev, { role: "user", content: a.q }]); fetch("/api/metrics/advisor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: a.q }) }).then((r) => r.json()).then((d) => setMessages((prev) => [...prev, { role: "assistant", content: d.response }])).catch(() => setMessages((prev) => [...prev, { role: "assistant", content: "Error de conexion." }])).finally(() => setSending(false)); }, 50); }} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-nitro-orange hover:text-nitro-orange transition-all duration-200 bg-white">
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-5 pb-5 pt-2 border-t border-gray-100">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Preguntale a Nitro Advisor AI..."
              className="flex-1 text-sm px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-nitro-orange focus:ring-1 focus:ring-nitro-orange/20 transition-all duration-200"
              disabled={sending}
            />
            <button onClick={sendMessage} disabled={sending || !input.trim()} className="px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 disabled:opacity-40" style={{ background: "linear-gradient(135deg, #FF5E1A 0%, #FF2E2E 100%)" }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
  const [stockSyncedAt, setStockSyncedAt] = useState<string | null>(null);
  const [totalActiveProducts, setTotalActiveProducts] = useState(0);

  useEffect(() => {
    fetch("/api/metrics/products")
      .then((r) => r.json())
      .then((data) => {
        if (data.products) setAllProducts(data.products);
        if (data.brands) setBrands(data.brands);
        if (data.categories) setCategories(data.categories);
        if (data.summary) setSummary(data.summary);
        if (data.stockSyncedAt) setStockSyncedAt(data.stockSyncedAt);
        if (data.totalActiveProducts) setTotalActiveProducts(data.totalActiveProducts);
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
eshLabel syncedAt={stockSyncedAt} className="mt-1.5" />
              </div>
          </div>

          {/* â”€â”€ Stock Alerts Banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€€¨½ô(€€€€€€€€€€ñMÑ½­±•ÉÑ	…¹¹•ÈÁÉ½‘ÕÑÌõí™¥±Ñ•É•‘ôÍÑ½­Må¹•‘ĞõíÍÑ½­Må¹•‘Ñô€¼ø((€€€€€€€€€ì¼¨ƒŠRŠR 	…È¡…ÉÑÌƒŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠR €¨½ô(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É¥É¥µ½±Ì´ÄµéÉ¥µ½±Ì´È…À´Øµˆ´ØÍÑ…•Èµ¡¥±‘É•¸ˆø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰¹¥ÑÉ¼µ…É‰œµİ¡¥Ñ”É½Õ¹‘•µlÄÙÁát‰½É‘•È‰½É‘•ÈµÉ…ä´ÈÀÀÀ´Øˆø(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰™±•à¥Ñ•µÌµÍÑ…ÉĞ©ÕÍÑ¥™äµ‰•Ñİ••¸µˆ´Ğˆø(€€€€€€€€€€€€€€€€ñ‘¥Øøñ Ì±…ÍÌô‰Ñ•áĞµÍ´™½¹ĞµÍ•µ¥‰½±Ñ•áĞµÉ…ä´äÀÀµˆ´ÄˆùY•¹Ñ…ÌÁ½È5…É„ğ½ ÌøñÀ±…ÍÌô‰Ñ•áĞµlÄÅÁátÑ•áĞµÉ…ä´ĞÀÀ™½¹Ğµµ½¹¼ÕÁÁ•É…Í”ÑÉ…­¥¹œµİ¥‘•Èˆùí‰É…¹‘5•ÑÉ¥Œ€ôôô€‰É•Ù•¹Õ”ˆ€ü€‰…ÑÕÉ…¥½¸ˆ€è€‰U¹¥‘…‘•Ì‰ôÁ½Èµ…É„ğ½Àøğ½‘¥Øø(€€€€€€€€€€€€€€€€ñ5•ÑÉ¥Q½±”µ•ÑÉ¥Œõí‰É…¹‘5•ÑÉ¥ôÍ•Ñ5•ÑÉ¥ŒõíÍ•Ñ	É…¹‘5•ÑÉ¥ô€¼ø(€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€í‰É…¹‘¡…ÉÑ…Ñ„¹±•¹Ñ €ø€À€ü€ (€€€€€€€€€€€€€€€€ñI•ÍÁ½¹Í¥Ù•½¹Ñ…¥¹•Èİ¥‘Ñ ôˆÄÀÀ”ˆ¡•¥¡Ğõí5…Ñ ¹µ…à ÈÔÀ°‰É…¹‘¡…ÉÑ…Ñ„¹±•¹Ñ €¨€ÌÈ¥ôø(€€€€€€€€€€€€€€€€€€ñ	…É¡…ÉĞ±…å½ÕĞô‰Ù•ÉÑ¥…°ˆ‘…Ñ„õí‰É…¹‘¡…ÉÑ…Ñ…ôµ…É¥¸õíìÑ½Àè€À°É¥¡Ğè€ÈÀ°‰½ÑÑ½´è€À°±•™Ğè€Àõôø(€€€€€€€€€€€€€€€€€€€€ñ…ÉÑ•Í¥…¹É¥ÍÑÉ½­•…Í¡…ÉÉ…äôˆÌ€ÌˆÍÑÉ½­”ôˆÍÑØˆ¡½É¥é½¹Ñ…°õí™…±Í•ô€¼ø(€€€€€€€€€€€€€€€€€€€€ñaá¥ÌÑåÁ”ô‰¹Õµ‰•Èˆ¡¥‘”€¼øñeá¥ÌÑåÁ”ô‰…Ñ•½Éäˆ‘…Ñ…-•äô‰¹…µ”ˆİ¥‘Ñ õìÄÀÁôÑ¥¬õíì™½¹ÑM¥é”è€ÄÄ°™¥±°è€ˆŒÙÜÈàÀˆ°™½¹Ñ…µ¥±äè€‰4M…¹ÌˆõôÑ¥­1¥¹”õí™…±Í•ô…á¥Í1¥¹”õí™…±Í•ô€¼ø(€€€€€€€€€€€€€€€€€€€€ñQ½½±Ñ¥À½¹Ñ•¹Ğõìñ	…ÉQ½½±Ñ¥Àµ•ÑÉ¥Œõí‰É…¹‘5•ÑÉ¥ô€¼ùôÕÉÍ½Èõíì™¥±°è€‰É‰„ ÈÔÔ°€äĞ°€ÈØ°€À¸ÀĞ¤ˆõô€¼ø(€€€€€€€€€€€€€€€€€€€€ñ	…È‘…Ñ…-•äô‰Ù…±Õ”ˆÉ…‘¥ÕÌõílÀ°€Ø°€Ø°€Áuô‰…ÉM¥é”õìÄáôùí‰É…¹‘¡…ÉÑ…Ñ„¹µ…À ¡|°¤¤€ôø€ñ•±°­•äõí¥ô™¥±°õí=1=IMm¤€”=1=IL¹±•¹Ñ¡uô€¼ø¥ôğ½	…Èø(€€€€€€€€€€€€€€€€€€ğ½	…É¡…ÉĞø(€€€€€€€€€€€€€€€€ğ½I•ÍÁ½¹Í¥Ù•½¹Ñ…¥¹•Èø(€€€€€€€€€€€€€€¤€è€ñÀ±…ÍÌô‰Ñ•áĞµÉ…ä´ĞÀÀÑ•áĞµÍ´Ñ•áĞµ•¹Ñ•ÈÁä´ÄÈˆùM¥¸‘…Ñ½Ìğ½Àùô(€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰¹¥ÑÉ¼µ…É‰œµİ¡¥Ñ”É½Õ¹‘•µlÄÙÁát‰½É‘•È‰½É‘•ÈµÉ…ä´ÈÀÀÀ´Øˆø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰™±•à¥Ñ•µÌµÍÑ…ÉĞ©ÕÍÑ¥™äµ‰•Ñİ••¸µˆ´Ğˆø(€€€€€€€€€€€€€€€€€€ñ‘¥Øøñ Ì±…ÍÌô‰Ñ•áĞµÍ´™½¹ĞµÍ•µ¥‰½±Ñ•áĞµÉ…ä´äÀÀµˆ´ÄˆùY•¹Ñ…ÌÁ½È…Ñ•½É¥„ğ½ ÌøñÀ±…ÍÌô‰Ñ•áĞµlÄÅÁátÑ•áĞµÉ…ä´ĞÀÀ™½¹Ğµµ½¹¼ÕÁÁ•É…Í”ÑÉ…­¥¹œµİ¥‘•Èˆùí…Ñ•½Éå5•ÑÉ¥Œ€ôôô€‰É•Ù•¹Õ”ˆ€ü€‰…ÑÕÉ…¥½¸ˆ€è€‰U¹¥‘…‘•Ì‰ôÁ½È…Ñ•½É¥„ğ½Àøğ½‘¥Øø(€€€€€€€€€€€€€€€€€€ñ5•ÑÉ¥Q½±”µ•ÑÉ¥Œõí…Ñ•½Éå5•ÑÉ¥ôÍ•Ñ5•ÑÉ¥ŒõíÍ•Ñ…Ñ•½Éå5•ÑÉ¥ô€¼ø(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€í…Ñ•½Éå¡…ÉÑ…Ñ„¹±•¹Ñ €ø€À€ü€ (€€€€€€€€€€€€€€€€€€ñI•ÍÁ½¹Í¥Ù•½¹Ñ…¥¹•Èİ¥‘Ñ ôˆÄÀÀ”ˆ¡•¥¡Ğõí5…Ñ ¹µ…à ÈÔÀ°…Ñ•½Éå¡…ÉÑ…Ñ„¹±•¹Ñ €¨€ÌÈ¥ôø(€€€€€€€€€€€€€€€€€€€€ñ	…É¡…ÉĞ±…å½ÕĞô‰Ù•ÉÑ¥…°ˆ‘…Ñ„õí…Ñ•½Éå¡…ÉÑ…Ñ…ôµ…É¥¸õíìÑ½Àè€À°É¥¡Ğè€ÈÀ°‰½ÑÑ½´è€À°±•™Ğè€Àõôø(€€€€€€€€€€€€€€€€€€€€€€ñ…ÉÑ•Í¥…¹É¥ÍÑÉ½­•…Í¡…ÉÉ…äôˆÌ€ÌˆÍÑÉ½­”ôˆÍÑØˆ¡½É¥é½¹Ñ…°õí™…±Í•ô€¼ø(€€€€€€€€€€€€€€€€€€€€€€ñaá¥ÌÑåÁ”ô‰¹Õµ‰•Èˆ¡¥‘”€¼øñeá¥ÌÑåÁ”ô‰…Ñ•½Éäˆ‘…Ñ…-•äô‰¹…µ”ˆİ¥‘Ñ õìÄĞÁôÑ¥¬õíì™½¹ÑM¥é”è€ÄÄ°™¥±°è€ˆŒÙÜÈàÀˆ°™½¹Ñ…µ¥±äè€‰4M…¹ÌˆõôÑ¥­1¥¹”õí™…±Í•ô…á¥Í1¥¹”õí™…±Í•ô€¼ø(€€€€€€€€€€€€€€€€€€€€€€ñQ½½±Ñ¥À½¹Ñ•¹Ğõìñ	…ÉQ½½±Ñ¥Àµ•ÑÉ¥Œõí…Ñ•½Éå5•ÑÉ¥ô€¼ùôÕÉÍ½Èõíì™¥±°è€‰É‰„ ÈÔÔ°€äĞ°€ÈØ°€À¸ÀĞ¤ˆõô€¼ø(€€€€€€€€€€€€€€€€€€€€€€ñ	…È‘…Ñ…-•äô‰Ù…±Õ”ˆÉ…‘¥ÕÌõílÀ°€Ø°€Ø°€Áuô‰…ÉM¥é”õìÄáôùí…Ñ•½Éå¡…ÉÑ…Ñ„¹µ…À ¡|°¤¤€ôø€ñ•±°­•äõí¥ô™¥±°õí=1=IMm¤€”=1=IL¹±•¹Ñ¡uô€¼ø¥ôğ½	…Èø(€€€€€€€€€€€€€€€€€€€€€€ğ½	…É¡…ÉĞø(€€€€€€€€€€€€€€€€€€ğ½I•ÍÁ½¹Í¥Ù•½¹Ñ…¥¹•Èø(€€€€€€€€€€€€€€€€¤€è€ñÀ±…ÍÌô‰Ñ•áĞµÉ…ä´ĞÀÀÑ•áĞµÍ´Ñ•áĞµ•¹Ñ•ÈÁä´ÄÈˆùM¥¸‘…Ñ½Ìğ½Àùô(€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€ğ½‘¥Øø((€€€€€€€€€ì¼¨ƒŠRŠR AÉ½‘ÕÑÌÑ…‰±”…ÉƒŠRŠRŠRŠRŠRŠRŠRŠRŠRŠR €¨½ô(€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰¹¥ÑÉ¼µ…É‰œµİ¡¥Ñ”É½Õ¹‘•µlÄÙÁát‰½É‘•È‰½É‘•ÈµÉ…ä´ÈÀÀ½Ù•É™±½Üµ¡¥‘‘•¸…¹¥µ…Ñ”µ™…‘”µ¥¸µÕÀˆÍÑå±”õíì…¹¥µ…Ñ¥½¹•±…äè€ˆÈÀÁµÌˆõôø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰À´Ø‰½É‘•Èµˆ‰½É‘•ÈµÉ…ä´ÈÀÀˆø(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ‰•Ñİ••¸™±•àµİÉ…À…À´Ğˆø(€€€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€€€ñ Ì±…ÍÌô‰™½¹ĞµÍ•µ¥‰½±Ñ•áĞµÉ…ä´äÀÀˆùQ½ÀAÉ½‘ÕÑ½ÌÁ½È…ÑÕÉ…¥½¸ğ½ Ìø(€€€€€€€€€€€€€€€€€€ñÀ±…ÍÌô‰Ñ•áĞµáÌÑ•áĞµÉ…ä´ĞÀÀµĞ´Ä™½¹Ğµµ½¹¼ˆùí™¥±Ñ•É•‘U¹¥ÅÕ•AÉ½‘ÕÑÌ¹Ñ½1½…±•MÑÉ¥¹œ ‰•ÌµHˆ¥ôÁÉ½‘ÕÑ½Íí¥Í¥±Ñ•É•€˜˜€ñÍÁ…¸±…ÍÌô‰Ñ•áĞµ¹¥ÑÉ¼µ½É…¹”ˆø€¡™¥±ÑÉ…‘¼‘”ì…±±AÉ½‘ÕÑÌ¹±•¹Ñ ¹Ñ½1½…±•MÑÉ¥¹œ ‰•ÌµHˆ¥ô¤ğ½ÍÁ…¸ùôğ½Àø(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰™±•à…À´Øˆø(€€€€€€€€€€€€€€€€€€ñ-Â•&BÆ&VÃÒ%VG2fVæF–F2"fÇVS×¶f–ÇFW&VEVæ—G2çFôÆö6ÆU7G&–ær‚&W2Ô""—Òóà¢Ä·
T\™X™[H‘˜Xİ\˜XÚ[Ûˆˆ˜[YO^Ù›Ü›X]T”Êš[\™Y™]™[YJ_HÏ‚ˆÜ)Pard label="Pareto" value={`Top 20% = ${filteredPareto}%`} accent />
                  {productsAtRisk > 0 && (
                    <div class="text-right">
                      <p class="font-mono text-[11px] text-gray-400 uppercase tracking-widest mb-0.5">En riesgo</p>
                      <p class="text-sm font-bold font-mono text-nitro-err flex items-center justify-end gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-nitro-err animate-pulse-live" />{productsAtRisk } producto{productsAtRisk !== 1 ? "s" : ""}</p>
                      </div>
                  )}
                  </div>
              </div>
            </div>
            <div class="px-6 py-3 bg-white border-b border-gray-200 flex items-center gap-4 flex-wrap">
              <div class="relative flex-1 min-w-[200px] max-w-[360px]">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 01100z" /></svg>
                <input type="text" placeholder="Buscar por nombre, SKU, marca..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} class="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#FF5E1A] focus:ring-2 focus:ring-[rgba(255,94,26,0.15)] transition-all" />
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
(€€€€€€€€€€€€€€€íÍ•…É¡Q•É´€˜˜€ñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÍ•ÑM•…É¡Q•É´ ˆˆ¥ô±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”É¥¡Ğ´ÌÑ½À´Ä¼È€µÑÉ…¹Í±…Ñ”µä´Ä¼ÈÑ•áĞµÉ…ä´ĞÀÀ¡½Ù•ÈéÑ•áĞµÉ…ä´ØÀÀˆøñÍÙœ±…ÍÍ9…µ”ô‰Ü´Ğ ´Ğˆ™¥±°ô‰¹½¹”ˆÙ¥•İ	½àôˆÀ€À€ÈĞ€ÈĞˆÍÑÉ½­”ô‰ÕÉÉ•¹Ñ½±½ÈˆÍÑÉ½­•]¥‘Ñ õìÉôøñÁ…Ñ ÍÑÉ½­•1¥¹•…Àô‰É½Õ¹ˆÍÑÉ½­•1¥¹•©½¥¸ô‰É½Õ¹ˆô‰4Ø€Äá0Äà€Ù4Ø€Ù°ÄÈ€ÄÈˆ€¼øğ½ÍÙœøğ½‰ÕÑÑ½¸ùô(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€í‰É…¹‘Ì¹±•¹Ñ €ø€À€˜˜€ (€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Èˆø(€€€€€€€€€€€€€€€€€€ñ±…‰•°±…ÍÍ9…µ”ô‰™½¹Ğµµ½¹¼Ñ•áĞµlÄÅÁátÑ•áĞµÉ…ä´ĞÀÀÕÁÁ•É…Í”ÑÉ…­¥¹œµİ¥‘•ÍĞˆù5…É„ğ½±…‰•°ø(€€€€€€€€€€€€€€€€€€ñÍ•±•ĞÙ…±Õ”õí‰É…¹‘¥±Ñ•Éô½¹¡…¹”õì¡”¤€ôøÍ•Ñ	É…¹‘¥±Ñ•È¡”¹Ñ…É•Ğ¹Ù…±Õ”¥ô±…ÍÍ9…µ”ô‰¹¥ÑÉ¼µÍ•±•ĞÑ•áĞµÍ´ˆø(€€€€€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ô‰10ˆùQ½‘…Ì€¡í…±±AÉ½‘ÕÑÌ¹™¥±Ñ•È ¡À¤€ôøÀ¹‰É…¹¤¹±•¹Ñ¡ô¤ğ½½ÁÑ¥½¸ø(€€€€€€€€€€€€€€€€€€€í‰É…¹‘Ì¹µ…À ¡ˆ¤€ôø€ñ½ÁÑ¥½¸­•äõí‰ôÙ…±Õ”õí‰ôùí‰ô€¡í…±±AÉ½‘ÕÑÌ¹™¥±Ñ•È ¡À¤€ôøÀ¹‰É…¹€ôôôˆ¤¹±•¹Ñ¡ô¤ğ½½ÁÑ¥½¸ø¥ô(€€€€€€€€€€€€€€€€€€ğ½Í•±•Ğø(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€í…Ñ•½É¥•Ì¹±•¹Ñ €ø€À€˜˜€ (€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Èˆø(€€€€€€€€€€€€€€€€€€ñ±…‰•°±…ÍÍ9…µ”ô‰™½¹Ğµµ½¹¼Ñ•áĞµlÄÅÁátÑ•áĞµÉ…ä´ĞÀÀÕÁÁ•É…Í”ÑÉ…­¥¹œµİ¥‘•ÍĞˆù…Ñ•½É¥„ğ½±…‰•°ø(€€€€€€€€€€€€€€€€€€ñÍ•±•ĞÙ…±Õ”õí…Ñ•½Éå¥±Ñ•Éô½¹¡…¹”õì¡”¤€ôøÍ•Ñ…Ñ•½Éå¥±Ñ•È¡”¹Ñ…É•Ğ¹Ù…±Õ”¥ô±…ÍÍ9…µ”ô‰¹¥ÑÉ¼µÍ•±•ĞÑ•áĞµÍ´ˆø(€€€€€€€€€€€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ô‰10ˆùQ½‘…Ì€¡í…±±AÉ½‘ÕÑÌ¹™¥±Ñ•È ¡À¤€ôøÀ¹…Ñ•½Éä¤¹±•¹Ñ¡ô¤ğ½½ÁÑ¥½¸ø(€€€€€€€€€€€€€€€€€€€í…Ñ•½É¥•Ì¹µ…À ¡Œ¤€ôø€ñ½ÁÑ¥½¸­•äõíôÙ…±Õ”õíôùíô€¡í…±±AÉ½‘ÕÑÌ¹™¥±Ñ•È ¡À¤€ôøÀ¹…Ñ•½Éä€ôôôŒ¤¹±•¹Ñ¡ô¤ğ½½ÁÑ¥½¸ø¥ô(€€€€€€€€€€€€€€€€€€ğ½Í•±•Ğø(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€¤¤‡àisFiltered || searchTerm) && <button onClick={() => { setBrandFilter("ALL"); setCategoryFilter("ALL"); setSearchTerm(""); }} class="text-xs text-nitro-orange hover:text-gray-900 font-medium ml-auto transition-colors duration-300">Limpiar filtros</button>}
              {/searchTerm && (
                <div class="px-6 py-2 bg-gray-50 border-b border-gray-200"><p class="text-xs text-gray-500 font-mono">{srted.length} resultados {sorted.length !== 1 ? "s" : ""} para &ldquo;{searchTerm}&rdquo;</p></div>
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
 ))}
              <div class="overflow-x-auto">
                <table class="w-full text-sm nitro-table">
                  <thead><tr class="bg-white text-left"><th class="px-4 py-3 w-10">#</th><th class="px-3 py-3">Producto</th><th class="px-3 py-3 text-right">Unidades</th><th class="px-3 py-3 text-right">Pedidos</th><th class="px-3 py-3 text-right">Precio Prom.</th><th class="px-3 py-3 text-right">Stock</th><th class="px-3 py-3 text-right">Facturacion</th><th class="px-3 py-3 text-right">% del Total</th></tr></thead>
                  <tbody class="divide-y divide-gray-200">
                    {paginatedProducts.map((p, idx) => {
                      const globalIdx = (currentPage - 1) * ITEMS_PER_PAGE + idx + 1;
                      const isExpanded = expandedProduct === p.id;
                      return (
                        <>
                          <tr key={p.id} class={`transition-colors duration-200 cursor-pointer ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50"}`} onClick={() => setExpandedProduct(isExpanded ? null :p.id)}>
                          <td class="px-4 py-3 text-gray-400 text-xs font-mono"><div class="flex items-center gap-1.5"><svg class={`w-3 h-3 text-gray-300 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>{globalIdx}</div></td>
                          <td class="px-3 py-3">
                            <div class="flex items-center gap-3">
                              {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="w-10 h-10 rounded-lg object-cover border border-gray-200" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                              <div>
                                <div className="font-medium text-gray-900 truncate max-w-[250px]">{p.name}</div>
                                <div class="flex gap-2 mt-0.5">
                                  {p.sku && <span class="text-[11px] text-gray-400 font-mono uppercase tracking-wider">SKU: {p.sku}</span>}
                                  {p.brand && <span class="text-[11px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: "#FF5E1A", background: "rgba(255, 94, 26, 0.1)", border: "1px solid rgba(255, 94, 26, 0.2)" }}>{p.brand}</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td class="px-3 py-3 text-gray-900/80 text-right font-mono text-xs">{p.unitsSold.toLocaleString("es-AR")}</td>
                          <td class="px-3 py-3 text-gray-900/80 text-right font-mono text-xs">{p.orders.toLocaleString("es-AR")}</td>
                          <td class="px-3 py-3 text-gray-900/80 text-right font-mono text-xs">{formatARS(p.avgPrice)}</td>
                          <td class="px-3 py-3 text-right"><StockBadge product={p} /></td>
                          <td class="px-3 py-3 font-bold text-gray-900 text-right font-mono text-xs">{formatARS(p.revenue)}</td>
                          <td class="px-3 py-3 text-right">
                            <div class="flex items-center justify-end gap-2">
                              <div class="w-16 bg-gray-200 rounded-full h-1.5"><div class="h-1.5 rounded-full" style={{ width: Math.min(100, Math.round((p.revenue / (filteredRevenue || 1)) * 100)) + "%", background: "var(--nitro-gradient)" }} /></div>
                              <span class="text-[11px] text-gray-400 w-8 font-mono">{Math.round((p.revenue / (filteredRevenue || 1)) * 100)}%</span>
                            </div>
                          </td>
                        </tr>
                        { isExpanded && <ProductDetail key={`detail-${p.id}`} product={p} totalRevenue={filteredRevenue} />}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div class="px-6 py-3 border-t border-gray-200 bg-white flex items-center justify-between">
              <p class="text-[11px] text-gray-400 font-mono">Mostrando {(currentPage - 1) * ITEMS_PER_PAGE} + 1}-{ Math.min(surrentPage * ITEMS_PER_PAGE, sorted.length)} de {sorted.length.toLocaleString("es-AR")} productos</p>
              <div class="flex items-center gap-2">
                <button disabled={currentPage === 1} onClick={() => { setCurrentPage(currentPage - 1); setExpandedProduct(null); }} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${currentPage === 1 ? "border-gray-200 text-gray-300 cursor-not-allowed" : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"}`}>Anterior</button>
                <span className="text-xs font-mono text-gray-400 px-2">{currentPage} / {totalPages}</span>
                <button disabled={currentPage === totalPages} onClick={() => { setCurrentPage(currentPage + 1); setExpandedProduct(null); }} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${currentPage === totalPages ? "border-gray-200 text-gray-300 cursor-not-allowed" : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"}`}>Siguiente</button>
              </div>
            </div>
          </div>
              {storeSearches.length > 0 && (
            <div className="nitro-card bg-white border border-gray-200 rounded-[16px] p-5 mt-6 animate-fade-in-up" style={{ boxShadow: "0 0 60px rgba(255, 94, 26, 0.04)" }}>
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(255, 94, 26, 0.1)", border: "1px solid #E5E7EB" }}>
                    <svg className="v-4 h-4" style={{ color: "#FF5E1A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Busquedas Populares en la Tienda</h3>
                    <p class="text-[11px] font-mono text-gray-400 uppercase tracking-widest">GA4 &middot; Ultimos 30 dias &"middot;  {storeSearches.length} terminos</p>
                  </div>
                </div>
                <p class="text-[11px] font-mono text-gray-400">Click para buscar en el catalogo</p>
              </div>
              <div class="overflow-y-auto space-y-1" style={{ maxHeight: "400px" }}>
                {storeSearches.map((s, i) => {
                  const maxCount = storeSearches[0]?.count || 1;
                  const pct = Math.max(4, Math.round((s.count / maxCount) * 100));
                  const isOrange = i < 3;
                  return (
                    <div key={s.term} class="flex items-center gap-3 group cursor-pointer rounded-lg px-1 py-0.5 hover:bg-gray-50 transition-colors duration-200" onClick={() => { setSearchTerm(s.term); setBrandFilter("ALL"); setCategoryFilter("ALL"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      <span class="text-[11px] font-mono text-gray-300 w-5 text-right flex-shrink-0">{i + 1}</span>
                      <div class="flex-1 relative h-7 overflow-hidden rounded-md">
                        <div className="absolute inset-y-0 left-0 rounded-md transition-all duration-500 ease-out" style={{ width: `${pct}%`, background: isOrange ? "rgba(255, 94, 26, 0.08)" : "rgba(107, 114, 128, 0.06)" }} />
                        <div class="relative flex items-center justify-between px-3 h-full">
                          <span class={`text-sm transition-colors duration-200 ${isOrange ? "text-gray-800 font-medium group-hover:text-[#FF5E1A]" : "text-gray-600 group-hover:text-gray-900"}`}>{s.term}</span>
                          <span class="text-[11px] font-mono text-gray-400 flex-shrink-0 ml-3">{s.count.toLocaleString("es-AR")}</span>
                        </div>
                      </div>
                      {{!s.hasStock && s.matchedProducts.length > 0 && (
                        <span class="text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: "rgba(255, 94, 94, 0.08)", border: "1px solid rgba(255, 94, 94, 0.2)", color: "#FF5E5E" }}>Sin stock</span>
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  )}
                        </div>
                      );
                  })}
              </div>
            </div>
          )
 * * gtopKast?.response-|| button></div>
          <div class="mt-6">
            <NitroAdvisorAI insights={aiInsights} healthScore={aiHealthScore} loading={aiLoading} stockSyncedAt={stockSyncedAt} />
          </div>
        </>
      )}
    </div>
  );
}
