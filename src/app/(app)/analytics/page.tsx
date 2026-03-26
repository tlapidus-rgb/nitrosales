"use client";

import { useState, useEffect, Fragment } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from "recharts";

// ══════════════════════════════════════════════════════════════
// Analytics Dashboard — GA4 Data (Funnel, Traffic, Devices)
// ══════════════════════════════════════════════════════════════

const MS_PER_DAY = 86400000;
const fmt = (n: number) => n.toLocaleString("es-AR");
const COLORS = ["#6366F1", "#06b6d4", "#a855f7", "#22c55e", "#eab308", "#ec4899"];

const EVENT_LABELS: Record<string, string> = {
  PAGE_VIEW: "Vistas de Pagina",
  VIEW_PRODUCT: "Vista Producto",
  ADD_TO_CART: "Agregar al Carrito",
  PURCHASE: "Compra",
  IDENTIFY: "Identificacion",
  CUSTOM: "Custom",
};

type PixelData = {
  kpis: {
    totalVisitors: number;
    totalSessions: number;
    totalPageViews: number;
    pagesPerSession: number;
    changes: { visitors: number; sessions: number; pageViews: number };
  };
  funnel: { pageView: number; viewProduct: number; addToCart: number; checkoutStart: number; purchase: number };
  dailyVisitors: Array<{ day: string; visitors: number; sessions: number; pageViews: number }>;
  deviceBreakdown: Array<{ device: string; count: number; percentage: number }>;
  eventTypes: Array<{ type: string; count: number; uniqueVisitors: number; percentage: number }>;
  popularPages: Array<{ url: string; pageViews: number; uniqueVisitors: number }>;
  businessKpis: { webOrders: number; webRevenue: number; totalOrders: number };
};

function KpiCard({ label, value, sub, change, color }: { label: string; value: string; sub?: string; change?: number; color: string }) {
  const colorMap: Record<string, string> = {
    indigo: "from-indigo-50 to-indigo-100/50 border-indigo-200",
    cyan: "from-cyan-50 to-cyan-100/50 border-cyan-200",
    purple: "from-purple-50 to-purple-100/50 border-purple-200",
    orange: "from-orange-50 to-orange-100/50 border-orange-200",
    emerald: "from-emerald-50 to-emerald-100/50 border-emerald-200",
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${colorMap[color] || colorMap.indigo} p-3`}>
      <p className="text-[11px] text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-800">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      {change !== undefined && change !== 0 && (
        <span className={`text-[10px] font-medium ${change > 0 ? "text-emerald-600" : "text-red-500"}`}>
          {change > 0 ? "+" : ""}{change}% vs periodo anterior
        </span>
      )}
    </div>
  );
}

function cleanUrl(url: string) {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || "");
  } catch {
    return url.replace(/https?:\/\/[^/]+/, "");
  }
}

export default function AnalyticsPage() {
  const [d, setD] = useState<PixelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date range (last 7 days default)
  const [range, setRange] = useState(() => {
    const to = new Date(); to.setHours(23, 59, 59, 999);
    const from = new Date(to.getTime() - 6 * MS_PER_DAY); from.setHours(0, 0, 0, 0);
    return { from, to };
  });

  const dateLabel = (d: Date) => d.toISOString().split("T")[0];

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/metrics/pixel?from=${dateLabel(range.from)}&to=${dateLabel(range.to)}&model=NITRO`)
      .then((r) => r.json())
      .then((data) => { setD(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [range]);

  const setPreset = (days: number) => {
    const to = new Date(); to.setHours(23, 59, 59, 999);
    const from = new Date(to.getTime() - (days - 1) * MS_PER_DAY); from.setHours(0, 0, 0, 0);
    setRange({ from, to });
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Cargando analytics...</p>
      </div>
    </div>
  );

  if (error || !d) return (
    <div className="p-8 text-center">
      <p className="text-red-500 text-sm">{error || "Error cargando datos"}</p>
    </div>
  );

  const conversionRate = d.funnel && d.funnel.pageView > 0
    ? ((d.funnel.purchase / d.funnel.pageView) * 100).toFixed(2)
    : "0";

  return (
    <div className="space-y-4 pb-12">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-0 z-20 bg-gray-50/95 backdrop-blur-sm py-3 -mx-1 px-1">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
          <p className="text-xs text-gray-500 mt-0.5">Fuente: Google Analytics 4</p>
        </div>
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-0.5">
          {[{ label: "7D", days: 7 }, { label: "14D", days: 14 }, { label: "30D", days: 30 }].map((p) => {
            const diff = Math.round((range.to.getTime() - range.from.getTime()) / MS_PER_DAY);
            const active = diff === p.days || diff === p.days - 1;
            return (
              <button
                key={p.days}
                onClick={() => setPreset(p.days)}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${active ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ TRAFFIC KPIs ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Visitantes" value={fmt(d.kpis.totalVisitors)} change={d.kpis.changes.visitors} color="indigo" />
        <KpiCard label="Sesiones" value={fmt(d.kpis.totalSessions)} change={d.kpis.changes.sessions} color="cyan" />
        <KpiCard label="Page Views" value={fmt(d.kpis.totalPageViews)} change={d.kpis.changes.pageViews} color="purple" />
        <KpiCard label="Pags/Sesion" value={String(d.kpis.pagesPerSession)} color="orange" />
        <KpiCard label="Tasa Conversion" value={`${conversionRate}%`} color="emerald" />
      </div>

      {/* ═══ FUNNEL ═══ */}
      {d.funnel && d.funnel.pageView > 0 && (() => {
        const funnelSteps = [
          { label: "Visitantes", value: d.funnel.pageView, color: "#6366F1", bg: "rgba(99,102,241,0.15)" },
          { label: "Vieron Producto", value: d.funnel.viewProduct, color: "#8B5CF6", bg: "rgba(139,92,246,0.15)" },
          { label: "Agregaron al Carrito", value: d.funnel.addToCart, color: "#A855F7", bg: "rgba(168,85,247,0.15)" },
          { label: "Iniciaron Checkout", value: d.funnel.checkoutStart, color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
          { label: "Compraron", value: d.funnel.purchase, color: "#22C55E", bg: "rgba(34,197,94,0.15)" },
        ];
        const maxVal = funnelSteps[0].value || 1;
        return (
          <div className="rounded-2xl bg-white border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-800">Funnel de Conversión</h2>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Google Analytics 4</span>
            </div>
            <div className="flex flex-col gap-1">
              {funnelSteps.map((step, i) => {
                const widthPct = Math.max((step.value / maxVal) * 100, 8);
                let prevWithData = 0;
                for (let j = i - 1; j >= 0; j--) {
                  if (funnelSteps[j].value > 0) { prevWithData = funnelSteps[j].value; break; }
                }
                const stepRate = i > 0 && prevWithData > 0 && step.value > 0
                  ? ((step.value / prevWithData) * 100).toFixed(1) : null;
                const overallRate = i > 0 && step.value > 0
                  ? ((step.value / maxVal) * 100).toFixed(1) : null;
                const isEmpty = step.value === 0;
                return (
                  <Fragment key={step.label}>
                    {i > 0 && stepRate && (
                      <div className="flex items-center gap-2 pl-2 -my-0.5">
                        <svg width="12" height="12" viewBox="0 0 12 12" className="text-gray-500 flex-shrink-0">
                          <path d="M6 2 L6 10 M3 7 L6 10 L9 7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="text-[10px] text-gray-500">{stepRate}%</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3" style={isEmpty ? { opacity: 0.4 } : undefined}>
                      <div className="flex-1 relative" style={{ minHeight: '32px' }}>
                        <div
                          className="absolute inset-y-0 left-0 rounded-lg transition-all"
                          style={{
                            width: isEmpty ? '100%' : `${widthPct}%`,
                            backgroundColor: isEmpty ? 'rgba(255,255,255,0.03)' : step.bg,
                            borderLeft: `3px solid ${isEmpty ? 'rgba(255,255,255,0.1)' : step.color}`,
                            borderStyle: isEmpty ? 'dashed' : 'solid',
                          }}
                        />
                        <div className="relative flex items-center justify-between px-3 py-1.5" style={{ width: isEmpty ? '100%' : `${Math.max(widthPct, 40)}%` }}>
                          <span className="text-[11px] text-gray-700 font-medium truncate">{step.label}</span>
                          <span className="text-[11px] text-gray-800 font-semibold ml-2 flex-shrink-0">
                            {isEmpty ? <span className="text-[10px] text-gray-500 font-normal italic">Esperando datos...</span> : fmt(step.value)}
                          </span>
                        </div>
                      </div>
                      {overallRate && (
                        <span className="text-[10px] text-gray-500 w-12 text-right flex-shrink-0">{overallRate}%</span>
                      )}
                    </div>
                  </Fragment>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
              <span className="text-[10px] text-gray-500">Tasa de conversión general</span>
              <span className="text-sm font-semibold" style={{ color: '#22C55E' }}>
                {conversionRate}%
              </span>
            </div>
          </div>
        );
      })()}

      {/* ═══ DAILY VISITORS TREND ═══ */}
      {d.dailyVisitors && d.dailyVisitors.length > 1 && (
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Visitantes Diarios</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.dailyVisitors}>
                <defs>
                  <linearGradient id="gradVisitors" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} width={40} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Area type="monotone" dataKey="visitors" stroke="#6366F1" fill="url(#gradVisitors)" strokeWidth={2} name="Visitantes" />
                <Area type="monotone" dataKey="sessions" stroke="#06b6d4" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Sesiones" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ═══ DEVICES + EVENT TYPES ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Devices */}
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Dispositivos</h2>
          {d.deviceBreakdown.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="w-32 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={d.deviceBreakdown} dataKey="count" nameKey="device" cx="50%" cy="50%" outerRadius={55} strokeWidth={0}>
                      {d.deviceBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {d.deviceBreakdown.map((dev, i) => (
                  <div key={dev.device} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-sm text-gray-700 capitalize">{dev.device}</span>
                    </div>
                    <span className="text-sm text-gray-400">{dev.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-xs text-gray-400">Sin datos de dispositivos</p>}
        </div>

        {/* Event Types */}
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Tipos de Eventos</h2>
          {d.eventTypes.length > 0 ? (
            <div className="space-y-2">
              {d.eventTypes.map((evt) => (
                <div key={evt.type} className="flex items-center gap-3">
                  <div className="w-24 text-xs text-gray-400 truncate">{EVENT_LABELS[evt.type] || evt.type}</div>
                  <div className="flex-1 h-5 bg-gray-100 rounded-lg overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-400 to-indigo-200 rounded-lg flex items-center px-2" style={{ width: `${Math.max(evt.percentage, 3)}%` }}>
                      <span className="text-[10px] text-white font-medium">{fmt(evt.count)}</span>
                    </div>
                  </div>
                  <div className="w-10 text-right text-xs text-gray-500">{evt.percentage}%</div>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-gray-400">Sin eventos</p>}
        </div>
      </div>

      {/* ═══ POPULAR PAGES ═══ */}
      {d.popularPages.length > 0 && (
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Páginas Populares</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-gray-200">
                <th className="text-left pb-2 font-medium">URL</th>
                <th className="text-right pb-2 font-medium">Views</th>
                <th className="text-right pb-2 font-medium">Visitantes</th>
              </tr>
            </thead>
            <tbody>
              {d.popularPages.map((p, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 text-gray-700 max-w-md truncate text-xs">{cleanUrl(p.url)}</td>
                  <td className="py-2 text-right text-gray-400 text-xs">{fmt(p.pageViews)}</td>
                  <td className="py-2 text-right text-gray-400 text-xs">{fmt(p.uniqueVisitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
