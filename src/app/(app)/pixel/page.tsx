"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend, ComposedChart, Line,
} from "recharts";

// ══════════════════════════════════════════════════════════════
// NitroPixel Dashboard — Revenue Attribution Analytics
// ══════════════════════════════════════════════════════════════

const MS_PER_DAY = 86400000;

// ── Helpers ──
const fmt = (n: number) => n.toLocaleString("es-AR");
const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const fmtCompact = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return fmtARS(n);
};
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
const MODEL_DESCRIPTIONS: Record<string, string> = {
  LAST_CLICK: "100% del credito al ultimo canal antes de la compra",
  FIRST_CLICK: "100% del credito al primer canal que trajo al cliente",
  LINEAR: "Credito repartido en partes iguales entre todos los canales",
  NITRO: "",
};
const NITRO_EXPLANATION = "El modelo Nitro pondera el credito de cada venta segun el rol de cada canal en el recorrido del cliente. " +
  "El ultimo contacto (el que cerro la venta) recibe la mayor parte, el primer contacto (el que descubrio tu marca) " +
  "recibe la segunda parte, y los contactos intermedios comparten el resto.";
const MODEL_ORDER = ["NITRO", "LAST_CLICK", "FIRST_CLICK", "LINEAR"];
const DEFAULT_NITRO_WEIGHTS = { first: 30, last: 40, middle: 30 };

const SOURCE_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  meta: { icon: "M", color: "#1877F2", label: "Meta" },
  facebook: { icon: "M", color: "#1877F2", label: "Meta" },
  google: { icon: "G", color: "#EA4335", label: "Google" },
  tiktok: { icon: "T", color: "#000000", label: "TikTok" },
  direct: { icon: "D", color: "#22C55E", label: "Directo" },
  organic: { icon: "O", color: "#8B5CF6", label: "Organico" },
  email: { icon: "E", color: "#F59E0B", label: "Email" },
  referral: { icon: "R", color: "#EC4899", label: "Referido" },
};

function getSourceInfo(source: string) {
  const key = (source || "direct").toLowerCase();
  return SOURCE_ICONS[key] || { icon: key.charAt(0).toUpperCase(), color: "#6B7280", label: source };
}

// ── InfoIcon tooltip ──
function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex ml-1 cursor-help"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <svg className="w-3.5 h-3.5 text-gray-500 hover:text-orange-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4m0-4h.01" />
      </svg>
      {show && (
        <span className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-gray-100 text-[11px] leading-relaxed rounded-lg px-3 py-2 w-56 z-50 shadow-xl border border-white/10 pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}

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
  businessKpis: {
    pixelRevenue: number;
    pixelRoas: number;
    ordersAttributed: number;
    attributionRate: number;
    aov: number;
    totalAdSpend: number;
    totalOrders: number;
    changes: { pixelRevenue: number; ordersAttributed: number; pixelRoas: number };
  };
  channelRoas: Array<{
    source: string; orders: number; pixelRevenue: number; platformRevenue: number;
    spend: number; platformConversions: number; pixelRoas: number; platformRoas: number;
    diffPercent: number | null;
  }>;
  funnel: { pageView: number; viewProduct: number; addToCart: number; purchase: number };
  dailyVisitors: Array<{ day: string; visitors: number; sessions: number; pageViews: number }>;
  dailyRevenue: Array<{ day: string; revenue: number; orders: number; spend: number; roas: number }>;
  recentJourneys: Array<{
    orderId: string; orderExternalId: string; revenue: number;
    touchpointCount: number; conversionLag: number;
    touchpoints: Array<{ timestamp: string; source?: string; medium?: string; campaign?: string; clickType?: string; page?: string }>;
    orderDate: string; orderStatus: string;
  }>;
  pixelHealth: {
    attributionRate: number;
    matchStrategies: Array<{ strategy: string; count: number }>;
    clickCoverage: { total: number; withClickIds: number; withUtm: number; clickIdRate: number; utmRate: number };
  };
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
  meta: { dateFrom: string; dateTo: string; daysInPeriod: number; nitroWeights?: { first: number; last: number; middle: number } };
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
  const [dailyMetric, setDailyMetric] = useState<"revenue" | "roas" | "visitors">("revenue");

  // Attribution model selector — Nitro is the default
  const [selectedModel, setSelectedModel] = useState<string>("NITRO");

  // Nitro custom weights
  const [nitroWeights, setNitroWeights] = useState(DEFAULT_NITRO_WEIGHTS);
  const [editingWeights, setEditingWeights] = useState(DEFAULT_NITRO_WEIGHTS);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [savingWeights, setSavingWeights] = useState(false);
  const [weightsError, setWeightsError] = useState<string | null>(null);

  // Sections toggle
  const [showTrackingDetails, setShowTrackingDetails] = useState(false);
  const [expandedJourney, setExpandedJourney] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/metrics/pixel?from=${dateFrom}&to=${dateTo}&page=${currentPage}&pageSize=20&model=${selectedModel}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, currentPage, selectedModel]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch Nitro weights on mount
  useEffect(() => {
    fetch("/api/settings/attribution")
      .then((r) => r.json())
      .then((d) => {
        if (d.weights) {
          setNitroWeights(d.weights);
          setEditingWeights(d.weights);
        }
      })
      .catch(() => {});
  }, []);

  // Update weights when data comes back with meta.nitroWeights
  useEffect(() => {
    if (data?.meta && (data.meta as any).nitroWeights) {
      const w = (data.meta as any).nitroWeights;
      setNitroWeights(w);
      setEditingWeights(w);
    }
  }, [data]);

  const saveNitroWeights = async () => {
    const sum = editingWeights.first + editingWeights.last + editingWeights.middle;
    if (sum !== 100) {
      setWeightsError(`Los pesos deben sumar 100% (actual: ${sum}%)`);
      return;
    }
    setSavingWeights(true);
    setWeightsError(null);
    try {
      const res = await fetch("/api/settings/attribution", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingWeights),
      });
      if (!res.ok) throw new Error("Error al guardar");
      setNitroWeights(editingWeights);
      setWeightsOpen(false);
      if (selectedModel === "NITRO") fetchData();
    } catch {
      setWeightsError("Error al guardar la configuracion");
    } finally {
      setSavingWeights(false);
    }
  };

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
  const hasAttribution = d.attribution?.byModel?.length > 0;
  const bk = d.businessKpis || { pixelRevenue: 0, pixelRoas: 0, ordersAttributed: 0, attributionRate: 0, aov: 0, totalAdSpend: 0, totalOrders: 0, changes: { pixelRevenue: 0, ordersAttributed: 0, pixelRoas: 0 } };

  return (
    <div className="min-h-screen bg-nitro-bg p-4 md:p-6 space-y-6">
      {/* ══════════════════════════════════════════════════════════ */}
      {/* HEADER + DATE FILTERS                                    */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Pixel</h1>
            <p className="text-sm text-gray-400 mt-1">Revenue attribution y performance de canales</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Model selector */}
          <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-0.5 mr-2">
            {MODEL_ORDER.map((model) => (
              <button
                key={model}
                onClick={() => setSelectedModel(model)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  selectedModel === model
                    ? model === "NITRO"
                      ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                      : "bg-white/10 text-gray-200 border border-white/20"
                    : "text-gray-500 hover:text-gray-300 border border-transparent"
                }`}
              >
                {MODEL_LABELS[model]}
              </button>
            ))}
          </div>
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              onClick={() => setQuickRange(days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeQuickRange === days
                  ? "bg-nitro-orange/20 text-nitro-orange border border-nitro-orange/30"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 border border-transparent"
              }`}
            >
              {`${days}d`}
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
      {/* MODEL DESCRIPTION (all models)                           */}
      {/* ══════════════════════════════════════════════════════════ */}
      {MODEL_DESCRIPTIONS[selectedModel] && selectedModel !== "NITRO" && (
        <div className="rounded-xl bg-white/[0.02] border border-white/5 px-4 py-2.5 flex items-center gap-2">
          <span className="text-[11px] text-gray-400">{MODEL_LABELS[selectedModel]}:</span>
          <span className="text-[11px] text-gray-500">{MODEL_DESCRIPTIONS[selectedModel]}</span>
          <InfoTip text="Cambia de modelo para ver como se redistribuye el credito entre los canales. Cada modelo tiene una logica diferente." />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PIXEL HEALTH BAR                                         */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
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
        <div className="flex items-center gap-4 text-xs">
          <div className="text-center">
            <p className="text-gray-500">Atribucion</p>
            <p className={`font-semibold ${(d.pixelHealth?.attributionRate || 0) >= 50 ? "text-emerald-400" : (d.pixelHealth?.attributionRate || 0) >= 25 ? "text-amber-400" : "text-red-400"}`}>
              {d.pixelHealth?.attributionRate || 0}%
            </p>
          </div>
          <div className="w-px h-6 bg-white/10" />
          <div className="text-center">
            <p className="text-gray-500">Click IDs<InfoTip text="Porcentaje de visitantes que llegaron con un click ID (fbclid, gclid). Mas alto = mejor atribucion." /></p>
            <p className="font-medium text-gray-300">{d.pixelHealth?.clickCoverage?.clickIdRate || 0}%</p>
          </div>
          <div className="w-px h-6 bg-white/10" />
          <div className="text-center">
            <p className="text-gray-500">Eventos/periodo<InfoTip text="Total de eventos (page views, clicks, compras) que el pixel registro en este periodo." /></p>
            <p className="font-medium text-gray-300">{fmt(d.liveStatus.totalEvents)}</p>
          </div>
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
            naveguen la tienda.
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* ══════════════════════════════════════════════════════════ */}
          {/* BUSINESS KPI CARDS                                       */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard
              label="Pixel Revenue"
              value={fmtCompact(bk.pixelRevenue)}
              change={bk.changes.pixelRevenue}
              color="orange"
              info="Ingresos atribuidos por NitroPixel segun el modelo seleccionado. Es TU verdad, no lo que dice Meta o Google."
            />
            <KpiCard
              label="Pixel ROAS"
              value={bk.pixelRoas > 0 ? `${bk.pixelRoas}x` : "-"}
              change={bk.changes.pixelRoas}
              color="cyan"
              info="Por cada $1 que gastas en ads, NitroPixel detecto que volvieron esta cantidad en ventas reales."
            />
            <KpiCard
              label="Ordenes Atribuidas"
              value={`${fmt(bk.ordersAttributed)} / ${fmt(bk.totalOrders)}`}
              change={bk.changes.ordersAttributed}
              color="indigo"
              info="Ordenes que el pixel pudo conectar con un canal de origen vs total de ordenes del periodo."
            />
            <KpiCard
              label="Tasa Atribucion"
              value={`${bk.attributionRate}%`}
              color={bk.attributionRate >= 50 ? "green" : bk.attributionRate >= 25 ? "orange" : "pink"}
              info="Porcentaje de ordenes que NitroPixel pudo atribuir a un canal. Arriba de 70% es bueno."
            />
            <KpiCard
              label="AOV Atribuido"
              value={bk.aov > 0 ? fmtARS(bk.aov) : "-"}
              color="purple"
              info="Ticket promedio de las ordenes atribuidas por el pixel."
            />
            <KpiCard
              label="Ad Spend"
              value={bk.totalAdSpend > 0 ? fmtCompact(bk.totalAdSpend) : "-"}
              color="pink"
              info="Inversion total en ads (Meta + Google) durante este periodo."
            />
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* DAILY REVENUE / ROAS CHART                               */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-200">Tendencia Diaria</h2>
              <div className="flex gap-1">
                {(["revenue", "roas", "visitors"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setDailyMetric(m)}
                    className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                      dailyMetric === m
                        ? "bg-nitro-orange/20 text-nitro-orange"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {m === "revenue" ? "Revenue" : m === "roas" ? "ROAS" : "Visitantes"}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              {dailyMetric === "visitors" ? (
                <AreaChart data={d.dailyVisitors}>
                  <defs>
                    <linearGradient id="npGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="day" tickFormatter={(v) => { const p = v.split("-"); return `${p[2]}/${p[1]}`; }} tick={{ fill: "#6b7280", fontSize: 11 }} stroke="rgba(255,255,255,0.1)" />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} stroke="rgba(255,255,255,0.1)" allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} labelFormatter={(v) => { const p = String(v).split("-"); return `${p[2]}/${p[1]}/${p[0]}`; }} formatter={(v: number) => [fmt(v), "Visitantes"]} />
                  <Area type="monotone" dataKey="visitors" stroke="#f97316" strokeWidth={2} fill="url(#npGrad)" />
                </AreaChart>
              ) : (
                <ComposedChart data={d.dailyRevenue || []}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="day" tickFormatter={(v) => { const p = v.split("-"); return `${p[2]}/${p[1]}`; }} tick={{ fill: "#6b7280", fontSize: 11 }} stroke="rgba(255,255,255,0.1)" />
                  <YAxis yAxisId="left" tick={{ fill: "#6b7280", fontSize: 11 }} stroke="rgba(255,255,255,0.1)" tickFormatter={(v) => dailyMetric === "revenue" ? fmtCompact(v) : `${v}x`} />
                  {dailyMetric === "revenue" && (
                    <>
                      <Bar yAxisId="left" dataKey="spend" fill="rgba(239,68,68,0.3)" radius={[2, 2, 0, 0]} name="Spend" />
                      <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} fill="url(#revGrad)" name="Revenue" />
                    </>
                  )}
                  {dailyMetric === "roas" && (
                    <Line yAxisId="left" type="monotone" dataKey="roas" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 3, fill: "#06b6d4" }} name="ROAS" />
                  )}
                  <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} labelFormatter={(v) => { const p = String(v).split("-"); return `${p[2]}/${p[1]}/${p[0]}`; }} formatter={(v: number, name: string) => [name === "ROAS" ? `${v}x` : fmtARS(v), name === "spend" ? "Spend" : name === "revenue" ? "Revenue" : "ROAS"]} />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* CHANNEL ROAS TABLE                                       */}
          {/* ══════════════════════════════════════════════════════════ */}
          {(d.channelRoas?.length > 0 || hasAttribution) && (
            <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-200">Revenue por Canal</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Pixel vs Plataforma · Modelo: {MODEL_LABELS[selectedModel]}</p>
                </div>
              </div>
              {d.channelRoas && d.channelRoas.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs border-b border-white/5">
                        <th className="text-left pb-2 font-medium">Canal</th>
                        <th className="text-right pb-2 font-medium">Revenue Pixel<InfoTip text="Revenue atribuido por NitroPixel. Esta es TU verdad, basada en tu pixel first-party." /></th>
                        <th className="text-right pb-2 font-medium">Revenue Plat.<InfoTip text="Lo que Meta/Google dicen en sus dashboards. Suelen inflar 20-40%." /></th>
                        <th className="text-right pb-2 font-medium">Spend</th>
                        <th className="text-right pb-2 font-medium">ROAS Pixel<InfoTip text="Retorno real segun NitroPixel. Si es 3x, por cada $1 invertido volvieron $3." /></th>
                        <th className="text-right pb-2 font-medium">ROAS Plat.<InfoTip text="ROAS que reporta la plataforma. Suele ser mas alto porque se auto-atribuyen ventas." /></th>
                        <th className="text-right pb-2 font-medium">Diff<InfoTip text="Diferencia porcentual entre NitroPixel y la plataforma. Si es negativo, la plataforma sobre-reporta." /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.channelRoas.map((ch) => {
                        const info = getSourceInfo(ch.source);
                        return (
                          <tr key={ch.source} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                            <td className="py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: info.color }}>
                                  {info.icon}
                                </div>
                                <span className="text-gray-300 capitalize">{info.label}</span>
                                <span className="text-gray-600 text-xs">{ch.orders} ord.</span>
                              </div>
                            </td>
                            <td className="py-2.5 text-right text-gray-200 font-medium">{fmtARS(ch.pixelRevenue)}</td>
                            <td className="py-2.5 text-right text-gray-400">{ch.platformRevenue > 0 ? fmtARS(ch.platformRevenue) : "-"}</td>
                            <td className="py-2.5 text-right text-gray-400">{ch.spend > 0 ? fmtARS(ch.spend) : "-"}</td>
                            <td className="py-2.5 text-right font-semibold text-orange-400">{ch.pixelRoas > 0 ? `${ch.pixelRoas}x` : "-"}</td>
                            <td className="py-2.5 text-right text-gray-400">{ch.platformRoas > 0 ? `${ch.platformRoas}x` : "-"}</td>
                            <td className={`py-2.5 text-right font-medium ${ch.diffPercent !== null ? (ch.diffPercent > 0 ? "text-emerald-400" : ch.diffPercent < 0 ? "text-red-400" : "text-gray-400") : "text-gray-600"}`}>
                              {ch.diffPercent !== null ? `${ch.diffPercent > 0 ? "+" : ""}${ch.diffPercent}%` : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptySection text="Sin datos de canales. Cuando NitroPixel atribuya ordenes a canales de ads, la tabla de ROAS aparecera aca." />
              )}
              {/* Over-reporting alert */}
              {d.channelRoas && d.channelRoas.some((ch) => ch.platformRevenue > 0 && ch.pixelRevenue > 0 && ch.platformRevenue > ch.pixelRevenue) && (
                <div className="mt-3 rounded-xl bg-amber-500/5 border border-amber-500/20 px-4 py-2.5 flex items-center gap-3">
                  <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-[11px] text-amber-200/80">
                    Las plataformas reportan mas revenue del que NitroPixel atribuye. Usa los numeros de NitroPixel para decisiones de presupuesto.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════ */}
          {/* FUNNEL DE CONVERSIÓN                                     */}
          {/* ══════════════════════════════════════════════════════════ */}
          {d.funnel && d.funnel.pageView > 0 && (
            <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4">
              <h2 className="text-sm font-semibold text-gray-200 mb-4">Funnel de Conversion</h2>
              <div className="flex items-end gap-2 h-32">
                {[
                  { label: "Visitantes", value: d.funnel.pageView, color: "#6366F1" },
                  { label: "Vieron Producto", value: d.funnel.viewProduct, color: "#A855F7" },
                  { label: "Agregaron al Carrito", value: d.funnel.addToCart, color: "#F59E0B" },
                  { label: "Compraron", value: d.funnel.purchase, color: "#22C55E" },
                ].map((step, i, arr) => {
                  const maxVal = arr[0].value || 1;
                  const heightPct = Math.max((step.value / maxVal) * 100, 4);
                  const prevValue = i > 0 ? arr[i - 1].value : 0;
                  const stepRate = prevValue > 0 ? Math.round((step.value / prevValue) * 100) : 100;
                  return (
                    <div key={step.label} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-gray-400">{i > 0 ? `${stepRate}%` : ""}</span>
                      <div className="w-full rounded-t-lg transition-all" style={{ height: `${heightPct}%`, backgroundColor: step.color, opacity: 0.8 }} />
                      <span className="text-[11px] text-gray-300 font-medium">{fmt(step.value)}</span>
                      <span className="text-[10px] text-gray-500 text-center leading-tight">{step.label}</span>
                    </div>
                  );
                })}
              </div>
              {d.funnel.pageView > 0 && (
                <p className="text-xs text-gray-500 mt-3 text-center">
                  Conversion total: <span className="text-orange-400 font-medium">{d.funnel.pageView > 0 ? ((d.funnel.purchase / d.funnel.pageView) * 100).toFixed(2) : 0}%</span> de visitantes compraron
                </p>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════ */}
          {/* CUSTOMER JOURNEY TIMELINE                                */}
          {/* ══════════════════════════════════════════════════════════ */}
          {d.recentJourneys && d.recentJourneys.length > 0 && (
            <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4">
              <h2 className="text-sm font-semibold text-gray-200 mb-1">Recorrido de Compradores</h2>
              <p className="text-xs text-gray-500 mb-4">Cada orden con el camino que hizo el cliente antes de comprar</p>
              <div className="space-y-2">
                {d.recentJourneys.slice(0, 10).map((journey) => {
                  const isExpanded = expandedJourney === journey.orderId;
                  const touchpoints = Array.isArray(journey.touchpoints) ? journey.touchpoints : [];
                  return (
                    <div key={journey.orderId} className="border border-white/5 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedJourney(isExpanded ? null : journey.orderId)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 font-mono">#{journey.orderExternalId?.slice(-8) || "?"}</span>
                          {/* Journey channel icons */}
                          <div className="flex items-center gap-0.5">
                            {touchpoints.map((tp: any, i: number) => {
                              const info = getSourceInfo(tp.source || tp.clickType || "direct");
                              return (
                                <div key={i} className="flex items-center">
                                  <div
                                    className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white"
                                    style={{ backgroundColor: info.color }}
                                    title={`${info.label}${tp.campaign ? ` — ${tp.campaign}` : ""}`}
                                  >
                                    {info.icon}
                                  </div>
                                  {i < touchpoints.length - 1 && (
                                    <svg className="w-3 h-3 text-gray-600 mx-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                  )}
                                </div>
                              );
                            })}
                            <div className="flex items-center">
                              <svg className="w-3 h-3 text-gray-600 mx-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              <div className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center text-[9px] font-bold text-white">✓</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {journey.conversionLag !== null && (
                            <span className="text-[10px] text-gray-500">{journey.conversionLag}d</span>
                          )}
                          <span className="text-sm font-medium text-gray-200">{fmtARS(journey.revenue)}</span>
                          <svg className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      {isExpanded && touchpoints.length > 0 && (
                        <div className="px-4 pb-4 pt-1 border-t border-white/5">
                          <div className="relative pl-4 space-y-3">
                            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />
                            {touchpoints.map((tp: any, i: number) => {
                              const info = getSourceInfo(tp.source || tp.clickType || "direct");
                              return (
                                <div key={i} className="relative flex items-start gap-3">
                                  <div className="w-4 h-4 rounded-full border-2 flex-shrink-0 -ml-2 mt-0.5" style={{ borderColor: info.color, backgroundColor: `${info.color}33` }} />
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-gray-300">{info.label}</span>
                                      {tp.campaign && <span className="text-[10px] text-gray-500">{tp.campaign}</span>}
                                      {tp.clickType && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500">{tp.clickType}</span>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      {tp.page && <span className="text-[10px] text-gray-600 truncate max-w-[200px]">{cleanUrl(tp.page)}</span>}
                                      <span className="text-[10px] text-gray-600">
                                        {new Date(tp.timestamp).toLocaleString("es-AR", {
                                          timeZone: "America/Argentina/Buenos_Aires",
                                          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                                        })}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            {/* Purchase marker */}
                            <div className="relative flex items-start gap-3">
                              <div className="w-4 h-4 rounded-full border-2 border-emerald-500 bg-emerald-500/30 flex-shrink-0 -ml-2 mt-0.5" />
                              <div>
                                <span className="text-xs font-medium text-emerald-400">Compra — {fmtARS(journey.revenue)}</span>
                                <p className="text-[10px] text-gray-600">
                                  {new Date(journey.orderDate).toLocaleString("es-AR", {
                                    timeZone: "America/Argentina/Buenos_Aires",
                                    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                                  })}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════ */}
          {/* CONVERSION LAG                                           */}
          {/* ══════════════════════════════════════════════════════════ */}
          {d.attribution?.conversionLag?.length > 0 && (
            <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4">
              <h2 className="text-sm font-semibold text-gray-200 mb-1">Tiempo hasta la Compra</h2>
              <p className="text-xs text-gray-500 mb-4">Dias entre el primer contacto y la conversion</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={d.attribution.conversionLag}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="bucket" tick={{ fill: "#9ca3af", fontSize: 11 }} stroke="rgba(255,255,255,0.1)" />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} stroke="rgba(255,255,255,0.1)" allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} formatter={(v: number, name: string) => [name === "orders" ? `${v} ordenes` : fmtARS(v), name === "orders" ? "Ordenes" : "Revenue"]} labelFormatter={(v) => `${v} dias`} />
                  <Bar dataKey="orders" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════ */}
          {/* NITRO MODEL CONFIG (collapsible)                         */}
          {/* ══════════════════════════════════════════════════════════ */}
          {selectedModel === "NITRO" && (
            <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-300 leading-relaxed">{NITRO_EXPLANATION}</p>
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                      <span className="text-[11px] text-gray-400">Ultimo: <span className="text-cyan-400 font-medium">{nitroWeights.last}%</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                      <span className="text-[11px] text-gray-400">Primero: <span className="text-orange-400 font-medium">{nitroWeights.first}%</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                      <span className="text-[11px] text-gray-400">Intermedios: <span className="text-purple-400 font-medium">{nitroWeights.middle}%</span></span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden flex mt-2">
                    <div className="bg-cyan-500 transition-all" style={{ width: `${nitroWeights.last}%` }} />
                    <div className="bg-orange-500 transition-all" style={{ width: `${nitroWeights.first}%` }} />
                    <div className="bg-purple-500 transition-all" style={{ width: `${nitroWeights.middle}%` }} />
                  </div>
                </div>
              </div>
              <button onClick={() => setWeightsOpen(!weightsOpen)} className="flex items-center gap-2 text-xs text-gray-500 hover:text-orange-400 transition-colors">
                <svg className={`w-3 h-3 transition-transform ${weightsOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Personalizar ponderacion
              </button>
              {weightsOpen && (
                <div className="mt-3 bg-white/[0.03] border border-orange-500/10 rounded-xl p-4 space-y-4">
                  <p className="text-xs text-gray-500">Los 3 valores deben sumar 100%.</p>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { key: "first", label: "Primer contacto", color: "orange" },
                      { key: "last", label: "Ultimo contacto", color: "cyan" },
                      { key: "middle", label: "Intermedios", color: "purple" },
                    ].map(({ key, label, color }) => (
                      <div key={key}>
                        <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
                        <div className="flex items-center gap-2">
                          <input type="range" min={0} max={100} value={(editingWeights as any)[key]}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              const otherKeys = ["first", "last", "middle"].filter(k => k !== key);
                              const otherTotal = (editingWeights as any)[otherKeys[0]] + (editingWeights as any)[otherKeys[1]];
                              const remaining = 100 - v;
                              const ratio = otherTotal > 0 ? (editingWeights as any)[otherKeys[0]] / otherTotal : 0.5;
                              setEditingWeights({
                                ...editingWeights,
                                [key]: v,
                                [otherKeys[0]]: Math.round(remaining * ratio),
                                [otherKeys[1]]: remaining - Math.round(remaining * ratio),
                              } as any);
                            }}
                            className={`flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-${color}-500`}
                          />
                          <span className={`text-sm font-mono text-${color}-400 w-10 text-right`}>{(editingWeights as any)[key]}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {weightsError && <p className="text-xs text-red-400">{weightsError}</p>}
                  <div className="flex items-center justify-between pt-1">
                    <button onClick={() => setEditingWeights(DEFAULT_NITRO_WEIGHTS)} className="text-xs text-gray-500 hover:text-gray-300">Restaurar default (30/40/30)</button>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingWeights(nitroWeights); setWeightsOpen(false); setWeightsError(null); }} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-white/5">Cancelar</button>
                      <button onClick={saveNitroWeights} disabled={savingWeights || (editingWeights.first + editingWeights.last + editingWeights.middle !== 100)} className="px-4 py-1.5 rounded-lg text-xs font-medium bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 disabled:opacity-40">{savingWeights ? "Guardando..." : "Guardar"}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════ */}
          {/* TRACKING DETAILS (collapsible)                           */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/5">
            <button
              onClick={() => setShowTrackingDetails(!showTrackingDetails)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/[0.01] transition-colors"
            >
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-300">Tracking Details</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-500">{fmt(d.kpis.totalVisitors)} visitantes · {fmt(d.kpis.totalSessions)} sesiones</span>
              </div>
              <svg className={`w-4 h-4 text-gray-500 transition-transform ${showTrackingDetails ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showTrackingDetails && (
              <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
                {/* Tracking KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard label="Visitantes" value={fmt(d.kpis.totalVisitors)} change={d.kpis.changes.visitors} color="indigo" />
                  <KpiCard label="Sesiones" value={fmt(d.kpis.totalSessions)} change={d.kpis.changes.sessions} color="cyan" />
                  <KpiCard label="Page Views" value={fmt(d.kpis.totalPageViews)} change={d.kpis.changes.pageViews} color="purple" />
                  <KpiCard label="Pags/Sesion" value={String(d.kpis.pagesPerSession)} color="orange" />
                </div>

                {/* Devices + Event Types */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-xs text-gray-500 mb-3 uppercase tracking-wide">Dispositivos</h3>
                    {d.deviceBreakdown.length > 0 ? (
                      <div className="flex items-center gap-6">
                        <div className="w-32 h-32">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={d.deviceBreakdown} dataKey="count" nameKey="device" cx="50%" cy="50%" outerRadius={55} strokeWidth={0}>
                                {d.deviceBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                              </Pie>
                              <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} />
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
                    ) : <EmptySection text="Sin datos de dispositivos" />}
                  </div>
                  <div>
                    <h3 className="text-xs text-gray-500 mb-3 uppercase tracking-wide">Tipos de Eventos</h3>
                    {d.eventTypes.length > 0 ? (
                      <div className="space-y-2">
                        {d.eventTypes.map((evt) => (
                          <div key={evt.type} className="flex items-center gap-3">
                            <div className="w-24 text-xs text-gray-400 truncate">{EVENT_LABELS[evt.type] || evt.type}</div>
                            <div className="flex-1 h-5 bg-white/5 rounded-lg overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-nitro-orange/60 to-nitro-orange/30 rounded-lg flex items-center px-2" style={{ width: `${Math.max(evt.percentage, 3)}%` }}>
                                <span className="text-[10px] text-white font-medium">{fmt(evt.count)}</span>
                              </div>
                            </div>
                            <div className="w-10 text-right text-xs text-gray-500">{evt.percentage}%</div>
                          </div>
                        ))}
                      </div>
                    ) : <EmptySection text="Sin eventos" />}
                  </div>
                </div>

                {/* Popular Pages */}
                {d.popularPages.length > 0 && (
                  <div>
                    <h3 className="text-xs text-gray-500 mb-3 uppercase tracking-wide">Paginas Populares</h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 text-xs border-b border-white/5">
                          <th className="text-left pb-2 font-medium">URL</th>
                          <th className="text-right pb-2 font-medium">Views</th>
                          <th className="text-right pb-2 font-medium">Visitantes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.popularPages.map((p, i) => (
                          <tr key={i} className="border-b border-white/[0.03]">
                            <td className="py-2 text-gray-300 max-w-md truncate text-xs">{cleanUrl(p.url)}</td>
                            <td className="py-2 text-right text-gray-400 text-xs">{fmt(p.pageViews)}</td>
                            <td className="py-2 text-right text-gray-400 text-xs">{fmt(p.uniqueVisitors)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
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
  info,
}: {
  label: string;
  value: string;
  change?: number;
  color?: string;
  info?: string;
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
      <p className="text-xs text-gray-500 mb-1">{label}{info && <InfoTip text={info} />}</p>
      <p className="text-xl font-bold text-white">{value}</p>
      {change !== undefined && (
        <p className={`text-xs mt-1 ${pctColor(change)}`}>{pctBadge(change)} vs anterior</p>
      )}
    </div>
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
