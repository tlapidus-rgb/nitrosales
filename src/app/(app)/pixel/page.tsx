"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";

// ══════════════════════════════════════════════════════════════
// NitroPixel Dashboard — Tracking & Attribution Analytics
// ══════════════════════════════════════════════════════════════

const MS_PER_DAY = 86400000;

// ── Helpers ──
const fmt = (n: number) => n.toLocaleString("es-AR");
const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const pctBadge = (v: number) =>
  v > 0 ? `+${v}%` : v < 0 ? `${v}%` : "0%";
const pctColor = (v: number) =>
  v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-gray-400";

const COLORS = ["#f97316", "#06b6d4", "#a855f7", "#22c55e", "#eab308", "#ec4899"];
const EVENT_LABELS: Record<string, string> = {
  PAGE_VIEW: "Vistas de Pagina",
  VIEW_PRODUCT: "Vista Producto",
  ADD_TO_CART: "Agregar al Carrito",
  PURCHASE: "Compra",
  IDENTIFY: "Identificacion",
  CUSTOM: "Custom",
};
const MODEL_LABELS: Record<string, string> = {
  LAST_CLICK: "Last Click",
  FIRST_CLICK: "First Click",
  LINEAR: "Linear",
  NITRO: "Nitro",
};

// ── Types ──
interface PixelData {
  liveStatus: {
    status: "LIVE" | "ACTIVE" | "INACTIVE";
    lastEventAt: string | null;
    totalEvents: number;
    lastHourEvents: number;
  };
  kpis: {
    totalVisitors: number;
    totalSessions: number;
    totalPageViews: number;
    identifiedVisitors: number;
    cartVisitors: number;
    purchaseVisitors: number;
    pagesPerSession: number;
    daysInPeriod: number;
    changes: { visitors: number; sessions: number; pageViews: number };
  };
  dailyVisitors: Array<{ day: string; visitors: number; sessions: number; pageViews: number }>;
  deviceBreakdown: Array<{ device: string; count: number; percentage: number }>;
  eventTypes: Array<{ type: string; count: number; uniqueVisitors: number; percentage: number }>;
  popularPages: Array<{ url: string; pageViews: number; uniqueVisitors: number }>;
  attribution: {
    byModel: Array<{ model: string; ordersAttributed: number; revenue: number; avgValue: number; avgTouchpoints: number }>;
    bySource: Array<{ source: string; orders: number; revenue: number; percentage: number }>;
    conversionLag: Array<{ bucket: string; orders: number; revenue: number }>;
  };
  recentEvents: Array<{
    id: string; type: string; visitorId: string; pageUrl: string | null;
    deviceType: string | null; timestamp: string; sessionId: string;
  }>;
  pagination: { page: number; pageSize: number; totalCount: number; totalPages: number };
  meta: { dateFrom: string; dateTo: string; daysInPeriod: number };
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

export default function PixelPage() {
  const [data, setData] = useState<PixelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date state
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(Date.now() - 7 * MS_PER_DAY);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(7);

  // Chart toggle
  const [dailyMetric, setDailyMetric] = useState<"visitors" | "sessions" | "pageViews">("visitors");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/metrics/pixel?from=${dateFrom}&to=${dateTo}&page=${currentPage}&pageSize=20`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, currentPage]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setQuickRange = (days: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - days * MS_PER_DAY);
    setDateFrom(from.toISOString().slice(0, 10));
    setDateTo(to.toISOString().slice(0, 10));
    setActiveQuickRange(days);
    setCurrentPage(1);
  };

  // ── Loading state ──
  if (loading && !data) {
    return (
      <div className="min-h-screen bg-nitro-bg p-6 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-2 h-2 rounded-full bg-nitro-orange animate-pulse" />
          <span>Cargando datos del pixel...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-nitro-bg p-6 flex items-center justify-center">
        <div className="text-red-400 text-center">
          <p className="text-lg font-semibold mb-2">Error al cargar datos</p>
          <p className="text-sm text-gray-500">{error}</p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const d = data!;
  const hasData = d.liveStatus.totalEvents > 0;
  const hasAttribution = d.attribution.byModel.length > 0;

  return (
    <div className="min-h-screen bg-nitro-bg p-4 md:p-6 space-y-6">
      {/* ══════════════════════════════════════════════════════════ */}
      {/* HEADER + DATE FILTERS                                    */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Pixel</h1>
          <p className="text-sm text-gray-400 mt-1">Tracking de visitantes y atribucion de canales</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[7, 30, 90, 365].map((days) => (
            <button
              key={days}
              onClick={() => setQuickRange(days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeQuickRange === days
                  ? "bg-nitro-orange/20 text-nitro-orange border border-nitro-orange/30"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 border border-transparent"
              }`}
            >
              {days === 365 ? "12m" : `${days}d`}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setActiveQuickRange(null); }}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-gray-300"
            />
            <span className="text-gray-500 text-xs">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setActiveQuickRange(null); }}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-gray-300"
            />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* LIVE STATUS CARD                                         */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className={`rounded-2xl border p-4 flex items-center justify-between ${
        d.liveStatus.status === "LIVE"
          ? "bg-emerald-500/5 border-emerald-500/20"
          : d.liveStatus.status === "ACTIVE"
          ? "bg-amber-500/5 border-amber-500/20"
          : "bg-red-500/5 border-red-500/20"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            d.liveStatus.status === "LIVE"
              ? "bg-emerald-400 animate-pulse"
              : d.liveStatus.status === "ACTIVE"
              ? "bg-amber-400"
              : "bg-red-400"
          }`} />
          <div>
            <span className={`text-sm font-semibold ${
              d.liveStatus.status === "LIVE"
                ? "text-emerald-400"
                : d.liveStatus.status === "ACTIVE"
                ? "text-amber-400"
                : "text-red-400"
            }`}>
              {d.liveStatus.status === "LIVE" ? "EN VIVO" : d.liveStatus.status === "ACTIVE" ? "ACTIVO" : "INACTIVO"}
            </span>
            {d.liveStatus.lastEventAt && (
              <p className="text-xs text-gray-400 mt-0.5">
                Ultimo evento: {new Date(d.liveStatus.lastEventAt).toLocaleString("es-AR", {
                  timeZone: "America/Argentina/Buenos_Aires",
                  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                })}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-300">{fmt(d.liveStatus.totalEvents)} eventos totales</p>
          {d.liveStatus.lastHourEvents > 0 && (
            <p className="text-xs text-gray-500">{fmt(d.liveStatus.lastHourEvents)} en la ultima hora</p>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* EMPTY STATE                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      {!hasData && (
        <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-12 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-200 mb-1">Pixel activado</h3>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            NitroPixel esta instalado y funcionando. Los primeros eventos apareceran cuando los visitantes
            naveguen la tienda. Proba visitando elmundodeljuguete.com.ar
          </p>
          <p className="text-xs text-gray-500 mt-4">Instalado: 23 de marzo de 2026 via GTM</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* KPI CARDS ROW 1                                          */}
      {/* ══════════════════════════════════════════════════════════ */}
      {hasData && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard
              label="Visitantes"
              value={fmt(d.kpis.totalVisitors)}
              change={d.kpis.changes.visitors}
              color="indigo"
            />
            <KpiCard
              label="Sesiones"
              value={fmt(d.kpis.totalSessions)}
              change={d.kpis.changes.sessions}
              color="cyan"
            />
            <KpiCard
              label="Page Views"
              value={fmt(d.kpis.totalPageViews)}
              change={d.kpis.changes.pageViews}
              color="purple"
            />
            <KpiCard
              label="Pags/Sesion"
              value={String(d.kpis.pagesPerSession)}
              color="orange"
            />
            <KpiCard
              label="Identificados"
              value={fmt(d.kpis.identifiedVisitors)}
              color="green"
            />
            <KpiCard
              label="Compradores"
              value={fmt(d.kpis.purchaseVisitors)}
              color="pink"
            />
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* DAILY VISITORS CHART                                     */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-200">Tendencia Diaria</h2>
              <div className="flex gap-1">
                {(["visitors", "sessions", "pageViews"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setDailyMetric(m)}
                    className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                      dailyMetric === m
                        ? "bg-nitro-orange/20 text-nitro-orange"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {m === "visitors" ? "Visitantes" : m === "sessions" ? "Sesiones" : "Page Views"}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={d.dailyVisitors}>
                <defs>
                  <linearGradient id="npGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => { const p = v.split("-"); return `${p[2]}/${p[1]}`; }}
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <YAxis
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                  labelFormatter={(v) => { const p = String(v).split("-"); return `${p[2]}/${p[1]}/${p[0]}`; }}
                  formatter={(v: number) => [fmt(v), dailyMetric === "visitors" ? "Visitantes" : dailyMetric === "sessions" ? "Sesiones" : "Page Views"]}
                />
                <Area
                  type="monotone"
                  dataKey={dailyMetric}
                  stroke="#f97316"
                  strokeWidth={2}
                  fill="url(#npGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* DEVICES + EVENT TYPES (2 columns)                        */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Device Breakdown */}
            <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4">
              <h2 className="text-sm font-semibold text-gray-200 mb-4">Dispositivos</h2>
              {d.deviceBreakdown.length > 0 ? (
                <div className="flex items-center gap-6">
                  <div className="w-40 h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={d.deviceBreakdown}
                          dataKey="count"
                          nameKey="device"
                          cx="50%"
                          cy="50%"
                          outerRadius={65}
                          strokeWidth={0}
                        >
                          {d.deviceBreakdown.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {d.deviceBreakdown.map((dev, i) => (
                      <div key={dev.device} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-sm text-gray-300 capitalize">{dev.device}</span>
                        </div>
                        <span className="text-sm text-gray-400">{dev.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptySection text="Sin datos de dispositivos aun" />
              )}
            </div>

            {/* Event Types */}
            <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4">
              <h2 className="text-sm font-semibold text-gray-200 mb-4">Tipos de Eventos</h2>
              {d.eventTypes.length > 0 ? (
                <div className="space-y-2.5">
                  {d.eventTypes.map((evt) => (
                    <div key={evt.type} className="flex items-center gap-3">
                      <div className="w-28 text-xs text-gray-400 truncate">
                        {EVENT_LABELS[evt.type] || evt.type}
                      </div>
                      <div className="flex-1 h-6 bg-white/5 rounded-lg overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-nitro-orange/60 to-nitro-orange/30 rounded-lg flex items-center px-2"
                          style={{ width: `${Math.max(evt.percentage, 3)}%` }}
                        >
                          <span className="text-[10px] text-white font-medium">{fmt(evt.count)}</span>
                        </div>
                      </div>
                      <div className="w-12 text-right text-xs text-gray-500">{evt.percentage}%</div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptySection text="Sin eventos registrados aun" />
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* POPULAR PAGES                                            */}
          {/* ══════════════════════════════════════════════════════════ */}
          {d.popularPages.length > 0 && (
            <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4">
              <h2 className="text-sm font-semibold text-gray-200 mb-4">Paginas Populares</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs border-b border-white/5">
                      <th className="text-left pb-2 font-medium">URL</th>
                      <th className="text-right pb-2 font-medium">Page Views</th>
                      <th className="text-right pb-2 font-medium">Visitantes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.popularPages.map((p, i) => (
                      <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="py-2.5 text-gray-300 max-w-md truncate">{cleanUrl(p.url)}</td>
                        <td className="py-2.5 text-right text-gray-400">{fmt(p.pageViews)}</td>
                        <td className="py-2.5 text-right text-gray-400">{fmt(p.uniqueVisitors)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════ */}
          {/* ATTRIBUTION SECTION                                      */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4">
            <h2 className="text-sm font-semibold text-gray-200 mb-4">Atribucion</h2>
            {hasAttribution ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Attribution by Model */}
                <div>
                  <h3 className="text-xs text-gray-500 mb-3 uppercase tracking-wide">Comparacion de Modelos</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={d.attribution.byModel} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => fmtARS(v)}
                        tick={{ fill: "#6b7280", fontSize: 10 }}
                        stroke="rgba(255,255,255,0.1)"
                      />
                      <YAxis
                        type="category"
                        dataKey="model"
                        tickFormatter={(v) => MODEL_LABELS[v] || v}
                        tick={{ fill: "#9ca3af", fontSize: 11 }}
                        stroke="rgba(255,255,255,0.1)"
                        width={80}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                        formatter={(v: number) => [fmtARS(v), "Revenue"]}
                        labelFormatter={(v) => MODEL_LABELS[v] || v}
                      />
                      <Bar dataKey="revenue" fill="#f97316" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Attribution by Source */}
                <div>
                  <h3 className="text-xs text-gray-500 mb-3 uppercase tracking-wide">Revenue por Canal</h3>
                  {d.attribution.bySource.length > 0 ? (
                    <div className="space-y-2">
                      {d.attribution.bySource.map((src, i) => (
                        <div key={src.source} className="flex items-center justify-between py-2 border-b border-white/[0.03]">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="text-sm text-gray-300 capitalize">{src.source}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-gray-500">{src.orders} ordenes</span>
                            <span className="text-sm font-medium text-gray-200">{fmtARS(src.revenue)}</span>
                            <span className="text-xs text-gray-500 w-8 text-right">{src.percentage}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptySection text="Sin datos de fuentes aun" />
                  )}
                </div>
              </div>
            ) : (
              <EmptySection text="Esperando la primera compra atribuida. Cuando un visitante trackeado por NitroPixel complete una compra, veras los datos de atribucion aca." />
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* CONVERSION LAG                                           */}
          {/* ══════════════════════════════════════════════════════════ */}
          {d.attribution.conversionLag.length > 0 && (
            <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4">
              <h2 className="text-sm font-semibold text-gray-200 mb-1">Tiempo hasta la Compra</h2>
              <p className="text-xs text-gray-500 mb-4">Dias entre el primer contacto y la conversion</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={d.attribution.conversionLag}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    stroke="rgba(255,255,255,0.1)"
                  />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    stroke="rgba(255,255,255,0.1)"
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                    formatter={(v: number, name: string) => [
                      name === "orders" ? `${v} ordenes` : fmtARS(v),
                      name === "orders" ? "Ordenes" : "Revenue",
                    ]}
                    labelFormatter={(v) => `${v} dias`}
                  />
                  <Bar dataKey="orders" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════ */}
          {/* RECENT EVENTS TABLE                                      */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-200">Eventos Recientes</h2>
              <span className="text-xs text-gray-500">{fmt(d.pagination.totalCount)} eventos en periodo</span>
            </div>
            {d.recentEvents.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs border-b border-white/5">
                        <th className="text-left pb-2 font-medium">Tipo</th>
                        <th className="text-left pb-2 font-medium">Visitor</th>
                        <th className="text-left pb-2 font-medium">Pagina</th>
                        <th className="text-left pb-2 font-medium">Dispositivo</th>
                        <th className="text-right pb-2 font-medium">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.recentEvents.map((evt) => (
                        <tr key={evt.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="py-2">
                            <EventBadge type={evt.type} />
                          </td>
                          <td className="py-2 text-gray-400 text-xs font-mono">{evt.visitorId.slice(0, 8)}...</td>
                          <td className="py-2 text-gray-400 text-xs max-w-[200px] truncate">{cleanUrl(evt.pageUrl || "")}</td>
                          <td className="py-2 text-gray-500 text-xs capitalize">{evt.deviceType || "-"}</td>
                          <td className="py-2 text-right text-gray-500 text-xs">
                            {new Date(evt.timestamp).toLocaleString("es-AR", {
                              timeZone: "America/Argentina/Buenos_Aires",
                              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {d.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
                    <span className="text-xs text-gray-500">
                      Pagina {d.pagination.page} de {d.pagination.totalPages}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        className="px-3 py-1 rounded-lg text-xs bg-white/5 text-gray-400 hover:bg-white/10 disabled:opacity-30"
                      >
                        Anterior
                      </button>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(d.pagination.totalPages, p + 1))}
                        disabled={currentPage >= d.pagination.totalPages}
                        className="px-3 py-1 rounded-lg text-xs bg-white/5 text-gray-400 hover:bg-white/10 disabled:opacity-30"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <EmptySection text="Sin eventos en este periodo" />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════

function KpiCard({
  label,
  value,
  change,
  color = "gray",
}: {
  label: string;
  value: string;
  change?: number;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    indigo: "from-indigo-500/10 to-transparent border-indigo-500/10",
    cyan: "from-cyan-500/10 to-transparent border-cyan-500/10",
    purple: "from-purple-500/10 to-transparent border-purple-500/10",
    orange: "from-orange-500/10 to-transparent border-orange-500/10",
    green: "from-emerald-500/10 to-transparent border-emerald-500/10",
    pink: "from-pink-500/10 to-transparent border-pink-500/10",
    gray: "from-gray-500/10 to-transparent border-gray-500/10",
  };

  return (
    <div className={`rounded-xl bg-gradient-to-br ${colorMap[color] || colorMap.gray} border p-3`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
      {change !== undefined && (
        <p className={`text-xs mt-1 ${pctColor(change)}`}>{pctBadge(change)} vs anterior</p>
      )}
    </div>
  );
}

function EventBadge({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    PAGE_VIEW: "bg-blue-500/10 text-blue-400",
    VIEW_PRODUCT: "bg-purple-500/10 text-purple-400",
    ADD_TO_CART: "bg-amber-500/10 text-amber-400",
    PURCHASE: "bg-emerald-500/10 text-emerald-400",
    IDENTIFY: "bg-cyan-500/10 text-cyan-400",
    CUSTOM: "bg-gray-500/10 text-gray-400",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${colorMap[type] || colorMap.CUSTOM}`}>
      {EVENT_LABELS[type] || type}
    </span>
  );
}

function EmptySection({ text }: { text: string }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}

function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search ? u.search.slice(0, 30) : "");
  } catch {
    return url.replace(/https?:\/\/[^/]+/, "").slice(0, 60);
  }
}
