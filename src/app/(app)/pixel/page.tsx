"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, ComposedChart, Line,
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
  v > 0 ? "text-emerald-600" : v < 0 ? "text-red-600" : "text-gray-400";

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
  LINEAR: "El credito se reparte en partes iguales entre todos los canales",
  NITRO: "El modelo Nitro pondera el credito segun el rol de cada canal. El ultimo contacto (cerro la venta) recibe la mayor parte, el primero (descubrio tu marca) la segunda, y los intermedios comparten el resto.",
};
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
  whatsapp: { icon: "W", color: "#25D366", label: "WhatsApp" },
};

function getSourceInfo(source: string) {
  const key = (source || "direct").toLowerCase();
  return SOURCE_ICONS[key] || { icon: key.charAt(0).toUpperCase(), color: "#6B7280", label: source };
}

// ── Credit distribution calculation ──
function getCreditsForModel(
  touchpoints: any[],
  model: string,
  weights: { first: number; last: number; middle: number }
): Array<{ source: string; pct: number; label: string; color: string }> {
  if (!touchpoints?.length) return [];
  const credits: Record<string, number> = {};
  const count = touchpoints.length;

  if (model === "LAST_CLICK") {
    const src = touchpoints[count - 1]?.source || "direct";
    credits[src] = 100;
  } else if (model === "FIRST_CLICK") {
    const src = touchpoints[0]?.source || "direct";
    credits[src] = 100;
  } else if (model === "LINEAR") {
    const share = Math.round(100 / count);
    touchpoints.forEach((tp, i) => {
      const src = tp?.source || "direct";
      credits[src] = (credits[src] || 0) + (i === count - 1 ? 100 - share * (count - 1) : share);
    });
  } else {
    // NITRO — weighted model
    // When there are no middle touchpoints (count=2), redistribute middle weight
    // proportionally to first and last so total always sums to 100%.
    touchpoints.forEach((tp, i) => {
      const src = tp?.source || "direct";
      let pct: number;
      if (count === 1) {
        pct = 100;
      } else if (count === 2) {
        // No middle touchpoints — redistribute middle weight proportionally
        const total = weights.first + weights.last;
        if (i === 0) {
          pct = Math.round((weights.first / total) * 100);
        } else {
          pct = 100 - Math.round((weights.first / total) * 100);
        }
      } else if (i === 0) {
        pct = weights.first;
      } else if (i === count - 1) {
        pct = weights.last;
      } else {
        pct = Math.round(weights.middle / Math.max(count - 2, 1));
      }
      credits[src] = (credits[src] || 0) + pct;
    });
  }

  return Object.entries(credits).map(([source, pct]) => {
    const info = getSourceInfo(source);
    return { source, pct, label: info.label, color: info.color };
  });
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
        <span className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-gray-100 text-[11px] leading-relaxed rounded-lg px-3 py-2 w-56 z-50 shadow-xl border border-gray-200 pointer-events-none">
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
    webOrders: number;
    webRevenue: number;
    marketplaceOrders: number;
    marketplaceRevenue: number;
    changes: { pixelRevenue: number; ordersAttributed: number; pixelRoas: number };
  };
  channelRoas: Array<{
    source: string; orders: number; pixelRevenue: number; platformRevenue: number;
    spend: number; platformConversions: number; pixelRoas: number; platformRoas: number;
    diffPercent: number | null;
  }>;
  funnel: { pageView: number; viewProduct: number; addToCart: number; checkoutShipping: number; checkoutPayment: number; purchase: number };
  dailyVisitors: Array<{ day: string; visitors: number; sessions: number; pageViews: number }>;
  dailyRevenue: Array<{ day: string; revenue: number; orders: number; spend: number; roas: number }>;
  dailyChannelBreakdown: Array<{
    day: string; totalRevenue: number; totalOrders: number; totalSpend: number;
    totalRoas: number; visitors: number;
    channels: Array<{ source: string; revenue: number; orders: number; spend: number; roas: number }>;
  }>;
  recentJourneys: Array<{
    orderId: string; orderExternalId: string; revenue: number;
    touchpointCount: number; conversionLag: number;
    touchpoints: Array<{ timestamp: string; source?: string; medium?: string; campaign?: string; clickType?: string; page?: string }>;
    orderDate: string; orderStatus: string;
  }>;
  pixelHealth: {
    attributionRate: number;
    clickCoverage: { total: number; withClickId: number; clickIdRate: number };
    eventsInPeriod: number;
    pixelAgeDays?: number;
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
  meta: { dateFrom: string; dateTo: string; daysInPeriod: number; attributionModel?: string; nitroWeights?: { first: number; last: number; middle: number } };
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
  // dailyMetric state removed — chart now shows all three metrics simultaneously
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [trendMetric, setTrendMetric] = useState<"revenue" | "roas" | "visitors">("revenue");

  // Attribution model selector — Nitro is the default
  const [selectedModel, setSelectedModel] = useState<string>("NITRO");

  // Nitro custom weights
  const [nitroWeights, setNitroWeights] = useState(DEFAULT_NITRO_WEIGHTS);
  const [editingWeights, setEditingWeights] = useState(DEFAULT_NITRO_WEIGHTS);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [savingWeights, setSavingWeights] = useState(false);
  const [weightsError, setWeightsError] = useState<string | null>(null);

  // Tabs + sections
  const [activeTab, setActiveTab] = useState<"resumen" | "ordenes" | "canales">("resumen");
  const [showTrackingDetails, setShowTrackingDetails] = useState(false);
  const [expandedJourney, setExpandedJourney] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Ventas por Canal section
  const [salesBySource, setSalesBySource] = useState<Array<{
    source: string;
    revenue: number; orders: number; units: number; avgTicket: number;
    products: Array<{ name: string; image: string | null; sku: string | null; units: number; revenue: number; avgPrice: number }>;
  }> | null>(null);
  const [selectedSource, setSelectedSource] = useState<number>(0);
  const [salesLoading, setSalesLoading] = useState(false);

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

  // Fetch sales by source data
  useEffect(() => {
    setSalesLoading(true);
    fetch(`/api/metrics/pixel/sales-by-source?from=${dateFrom}&to=${dateTo}&model=${selectedModel}`)
      .then((r) => r.json())
      .then((d) => {
        setSalesBySource(d.sources || []);
        setSelectedSource(0);
      })
      .catch(() => setSalesBySource(null))
      .finally(() => setSalesLoading(false));
  }, [dateFrom, dateTo, selectedModel]);

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
    if (data?.meta?.nitroWeights) {
      const w = data.meta.nitroWeights;
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
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <span>Cargando datos del pixel...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-red-600 text-center">
          <p className="text-lg font-semibold mb-2">Error al cargar datos</p>
          <p className="text-sm text-gray-500">{error}</p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 text-gray-700">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const d = data!;
  const hasData = d.liveStatus.totalEvents > 0;
  const hasAttribution = d.attribution?.byModel?.length > 0;
  const bk = d.businessKpis || { pixelRevenue: 0, pixelRoas: 0, ordersAttributed: 0, attributionRate: 0, aov: 0, totalAdSpend: 0, totalOrders: 0, webOrders: 0, webRevenue: 0, marketplaceOrders: 0, marketplaceRevenue: 0, changes: { pixelRevenue: 0, ordersAttributed: 0, pixelRoas: 0 } };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ══════════════════════════════════════════════════════════ */}
      {/* STICKY HEADER                                            */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          {/* Top bar: Title + Period selector */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">NitroPixel</h1>
                <p className="text-xs text-gray-500">Revenue Attribution</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {[7, 30, 90].map((days) => (
                <button
                  key={days}
                  onClick={() => setQuickRange(days)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeQuickRange === days
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-gray-400 hover:bg-gray-100"
                  }`}
                >
                  {`${days}d`}
                </button>
              ))}
              <div className="flex items-center gap-1 ml-1">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setActiveQuickRange(null); }}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700"
                />
                <span className="text-gray-500 text-xs">→</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setActiveQuickRange(null); }}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700"
                />
              </div>
            </div>
          </div>

          {/* ═══ ATTRIBUTION MODEL SELECTOR ═══ */}
          <div className="flex items-center gap-2 pb-3">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1">Modelo</span>
            <InfoTip text="El modelo de atribucion define como se reparte el credito de una venta entre los distintos canales que toco el cliente antes de comprar. Cambia de modelo y vas a ver como cambian todos los numeros." />
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 ml-2">
              {MODEL_ORDER.map((model) => (
                <button
                  key={model}
                  onClick={() => setSelectedModel(model)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    selectedModel === model
                      ? model === "NITRO"
                        ? "bg-orange-500 text-white shadow-sm"
                        : "bg-white text-gray-700 shadow-sm border border-gray-200"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {model === "NITRO" && (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
                    </svg>
                  )}
                  {MODEL_LABELS[model]}
                </button>
              ))}
            </div>
          </div>

          {/* ═══ MODEL DESCRIPTION BAR ═══ */}
          <div className={`rounded-lg px-4 py-2.5 mb-2 flex items-start gap-3 ${
            selectedModel === "NITRO" ? "bg-orange-500/5 border border-orange-500/20" : "bg-white border border-gray-200"
          }`}>
            <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
              selectedModel === "NITRO" ? "bg-orange-500/20" : "bg-gray-200"
            }`}>
              {selectedModel === "LAST_CLICK" && <span className="text-xs font-bold text-gray-400">L</span>}
              {selectedModel === "FIRST_CLICK" && <span className="text-xs font-bold text-gray-400">F</span>}
              {selectedModel === "LINEAR" && <span className="text-xs font-bold text-gray-400">=</span>}
              {selectedModel === "NITRO" && (
                <svg className="w-3.5 h-3.5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
                </svg>
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-400 leading-relaxed">{MODEL_DESCRIPTIONS[selectedModel]}</p>

              {/* ═══ NITRO WEIGHTS DISPLAY + EDITOR ═══ */}
              {selectedModel === "NITRO" && (
                <div className="mt-3">
                  {/* Weight indicators */}
                  <div className="flex items-center gap-5 mb-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-cyan-500"/>
                      <span className="text-xs text-gray-500">Ultimo contacto: <span className="text-cyan-400 font-bold">{nitroWeights.last}%</span></span>
                      <InfoTip text="El canal que cerro la venta. Es el ultimo que toco el cliente antes de comprar. Recibe el mayor credito porque 'sello el deal'." />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-orange-500"/>
                      <span className="text-xs text-gray-500">Primer contacto: <span className="text-orange-400 font-bold">{nitroWeights.first}%</span></span>
                      <InfoTip text="El canal que descubrio tu marca. Es el primero que trajo al cliente. Tiene merito porque sin el, el cliente nunca hubiera llegado." />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-purple-500"/>
                      <span className="text-xs text-gray-500">Intermedios: <span className="text-purple-400 font-bold">{nitroWeights.middle}%</span></span>
                      <InfoTip text="Todos los canales que ayudaron entre medio (retargeting, emails, organico). Comparten este porcentaje en partes iguales." />
                    </div>
                  </div>

                  {/* Weight bar */}
                  <div className="h-2.5 rounded-full overflow-hidden flex bg-gray-200">
                    <div className="bg-cyan-500 transition-all duration-300" style={{ width: `${nitroWeights.last}%` }} />
                    <div className="bg-orange-500 transition-all duration-300" style={{ width: `${nitroWeights.first}%` }} />
                    <div className="bg-purple-500 transition-all duration-300" style={{ width: `${nitroWeights.middle}%` }} />
                  </div>

                  {/* Customize button */}
                  <button
                    onClick={() => { setWeightsOpen(!weightsOpen); setEditingWeights({ ...nitroWeights }); }}
                    className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-orange-400 transition-colors"
                  >
                    <svg className={`w-3 h-3 transition-transform ${weightsOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7"/></svg>
                    Personalizar ponderacion
                  </button>

                  {/* Weight Editor Panel */}
                  {weightsOpen && (
                    <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl p-4">
                      <p className="text-xs text-gray-500 mb-4">Ajusta los pesos y los otros se redistribuyen automaticamente. Deben sumar 100%.</p>
                      <div className="grid grid-cols-3 gap-6">
                        {[
                          { key: "last", label: "Ultimo contacto", color: "cyan" },
                          { key: "first", label: "Primer contacto", color: "orange" },
                          { key: "middle", label: "Intermedios", color: "purple" },
                        ].map(({ key, label, color }) => (
                          <div key={key}>
                            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-2">{label}</label>
                            <div className="flex items-center gap-3">
                              <input
                                type="range" min={0} max={100}
                                value={(editingWeights as any)[key]}
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
                                className="flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer"
                                style={{ accentColor: color === "cyan" ? "#06b6d4" : color === "orange" ? "#f97316" : "#a855f7" }}
                              />
                              <span className="text-lg font-bold w-12 text-right" style={{ color: color === "cyan" ? "#06b6d4" : color === "orange" ? "#f97316" : "#a855f7" }}>
                                {(editingWeights as any)[key]}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Preview bar */}
                      <div className="h-2 rounded-full overflow-hidden flex mt-4 bg-gray-200">
                        <div className="bg-cyan-500 transition-all" style={{ width: `${editingWeights.last}%` }}/>
                        <div className="bg-orange-500 transition-all" style={{ width: `${editingWeights.first}%` }}/>
                        <div className="bg-purple-500 transition-all" style={{ width: `${editingWeights.middle}%` }}/>
                      </div>
                      {weightsError && <p className="text-xs text-red-500 mt-2">{weightsError}</p>}
                      <div className="flex items-center justify-between mt-4">
                        <button onClick={() => setEditingWeights({ ...DEFAULT_NITRO_WEIGHTS })} className="text-xs text-gray-500 hover:text-gray-700 underline">
                          Restaurar default (40/30/30)
                        </button>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingWeights(nitroWeights); setWeightsOpen(false); setWeightsError(null); }} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-100">Cancelar</button>
                          <button
                            onClick={saveNitroWeights}
                            disabled={savingWeights || (editingWeights.first + editingWeights.last + editingWeights.middle !== 100)}
                            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                          >
                            {savingWeights ? "Guardando..." : "Guardar pesos"}
                          </button>
                        </div>
                      </div>
                      {editingWeights.first + editingWeights.last + editingWeights.middle !== 100 && (
                        <p className="text-xs text-red-500 mt-2">Los pesos deben sumar 100% (actual: {editingWeights.first + editingWeights.last + editingWeights.middle}%)</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══ NAV TABS ═══ */}
          <div className="flex gap-1 -mb-px mt-1">
            {([
              { id: "resumen" as const, label: "Resumen" },
              { id: "ordenes" as const, label: "Ordenes en Vivo" },
              { id: "canales" as const, label: "Canales" },
            ]).map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
                  activeTab === tab.id ? "border-orange-500 text-orange-400" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PAGE CONTENT                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ═══ PIXEL HEALTH BAR ═══ */}
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
                  ? "text-emerald-600"
                  : d.liveStatus.status === "ACTIVE"
                  ? "text-amber-600"
                  : "text-red-500"
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
              <p className={`font-semibold ${(d.pixelHealth?.attributionRate || 0) >= 50 ? "text-emerald-600" : (d.pixelHealth?.attributionRate || 0) >= 25 ? "text-amber-600" : "text-red-500"}`}>
                {d.pixelHealth?.attributionRate || 0}%
              </p>
            </div>
            <div className="w-px h-6 bg-gray-200" />
            <div className="text-center">
              <p className="text-gray-500">Click IDs<InfoTip text="Porcentaje de visitantes que llegaron con un click ID (fbclid, gclid). Mas alto = mejor atribucion." /></p>
              <p className="font-medium text-gray-700">{d.pixelHealth?.clickCoverage?.clickIdRate || 0}%</p>
            </div>
            <div className="w-px h-6 bg-gray-200" />
            <div className="text-center">
              <p className="text-gray-500">Eventos<InfoTip text="Total de eventos que el pixel registro en este periodo." /></p>
              <p className="font-medium text-gray-700">{fmt(d.liveStatus.totalEvents)}</p>
            </div>
          </div>
        </div>

        {/* ═══ EMPTY STATE ═══ */}
        {!hasData && (
          <div className="rounded-2xl bg-white border border-gray-200 p-12 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">Pixel activado</h3>
            <p className="text-sm text-gray-400 max-w-md mx-auto">
              NitroPixel esta instalado y funcionando. Los primeros eventos apareceran cuando los visitantes
              naveguen la tienda.
            </p>
          </div>
        )}

        {hasData && (
          <>
            {/* ══════════════════════════════════════════════════════════ */}
            {/* KPI CARDS (Resumen + Ordenes tabs)                       */}
            {/* ══════════════════════════════════════════════════════════ */}
            {(activeTab === "resumen" || activeTab === "ordenes") && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <KpiCard
                  label="Revenue Atribuido"
                  value={fmtCompact(bk.pixelRevenue)}
                  change={bk.changes.pixelRevenue}
                  color="orange"
                  info="Ingresos que NitroPixel atribuyo segun el modelo seleccionado. Cambia de modelo y vas a ver como cambian los numeros."
                  sub={`Modelo: ${MODEL_LABELS[selectedModel]}`}
                />
                <KpiCard
                  label="ROAS Blended"
                  value={bk.pixelRoas > 0 ? `${bk.pixelRoas}x` : "-"}
                  change={bk.changes.pixelRoas}
                  color="cyan"
                  info="Por cada $1 que gastas en ads, NitroPixel detecto que volvieron esta cantidad en ventas reales."
                />
                <KpiCard
                  label="Ordenes Web"
                  value={fmt(bk.ordersAttributed)}
                  change={bk.changes.ordersAttributed}
                  color="indigo"
                  info="Ordenes del sitio web atribuidas a un canal. Excluye MercadoLibre (se trackea aparte)."
                  sub={bk.marketplaceOrders > 0 ? `${fmt(bk.webOrders)} web + ${fmt(bk.marketplaceOrders)} ML` : `De ${fmt(bk.totalOrders)} totales`}
                />
                <KpiCard
                  label="Tasa Conversion"
                  value={d.funnel && d.funnel.pageView > 0 ? `${((d.funnel.purchase / d.funnel.pageView) * 100).toFixed(2)}%` : `${bk.attributionRate}%`}
                  color={bk.attributionRate >= 50 ? "green" : bk.attributionRate >= 25 ? "orange" : "pink"}
                  info="De cada 100 visitantes, este porcentaje compro."
                />
                <KpiCard
                  label="Inversion Ads"
                  value={bk.totalAdSpend > 0 ? fmtCompact(bk.totalAdSpend) : "-"}
                  color="pink"
                  info="Lo que gastaste en Meta + Google este periodo."
                />
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* LIVE ORDERS WITH JOURNEY (Resumen + Ordenes tabs)        */}
            {/* ══════════════════════════════════════════════════════════ */}
            {(activeTab === "resumen" || activeTab === "ordenes") && d.recentJourneys && d.recentJourneys.length > 0 && (
              <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"/>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"/>
                    </span>
                    <h2 className="text-base font-semibold text-gray-800">Ordenes en Vivo</h2>
                    <InfoTip text="Cada orden muestra su recorrido completo y como el modelo de atribucion seleccionado reparte el credito entre los canales." />
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full ml-2">Modelo: {MODEL_LABELS[selectedModel]}</span>
                  </div>
                </div>

                <div className="divide-y divide-gray-100">
                  {d.recentJourneys.slice(0, activeTab === "ordenes" ? 15 : 5).map((journey) => {
                    const isExpanded = expandedJourney === journey.orderId;
                    const touchpoints = Array.isArray(journey.touchpoints) ? journey.touchpoints : [];
                    const creditSummary = getCreditsForModel(touchpoints, selectedModel, nitroWeights);

                    return (
                      <div key={journey.orderId} className="hover:bg-gray-50 transition-colors">
                        {/* Order row */}
                        <div className="px-5 py-3 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedJourney(isExpanded ? null : journey.orderId)}>
                          <svg className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7"/></svg>
                          <span className="text-sm font-mono font-medium text-gray-400 w-28">#{journey.orderExternalId?.slice(-8) || "?"}</span>
                          <span className="text-xs text-gray-500 w-24">
                            {new Date(journey.orderDate).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-sm font-bold text-gray-800 w-24">{fmtARS(journey.revenue)}</span>
                          <span className="text-xs text-gray-500 w-20">{journey.touchpointCount} touchpoints</span>
                          {/* Credit mini-bar */}
                          <div className="flex-1 flex items-center gap-2">
                            <div className="flex-1 h-3 rounded-full overflow-hidden flex bg-gray-200">
                              {creditSummary.map((c, ci) => (
                                <div key={ci} className="h-full transition-all" style={{ width: `${c.pct}%`, backgroundColor: c.color }} title={`${c.label}: ${c.pct}%`} />
                              ))}
                            </div>
                            <span className="text-xs text-gray-500 w-16 text-right">{creditSummary[0]?.label}</span>
                          </div>
                          {journey.conversionLag !== null && (
                            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{journey.conversionLag}d</span>
                          )}
                        </div>

                        {/* Expanded Journey */}
                        {isExpanded && (
                          <div className="px-5 pb-5 ml-10">
                            <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                              {/* Credit Distribution */}
                              {creditSummary.length > 0 && (
                                <div className="mb-4 bg-white rounded-lg p-3 border border-gray-200">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-semibold text-gray-400">Distribucion del credito</span>
                                    <InfoTip text={`Asi reparte el modelo ${MODEL_LABELS[selectedModel]} el credito de esta venta (${fmtARS(journey.revenue)}) entre los canales que participaron.`} />
                                  </div>
                                  <div className="h-4 rounded-full overflow-hidden flex bg-gray-200 mb-2">
                                    {creditSummary.map((c, ci) => (
                                      <div key={ci} className="h-full flex items-center justify-center transition-all"
                                        style={{ width: `${c.pct}%`, backgroundColor: c.color }}>
                                        {c.pct >= 15 && <span className="text-[9px] font-bold text-white">{c.pct}%</span>}
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex flex-wrap gap-3">
                                    {creditSummary.map((c, ci) => (
                                      <div key={ci} className="flex items-center gap-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }}/>
                                        <span className="text-xs text-gray-400">{c.label}: <strong className="text-gray-800">{c.pct}%</strong></span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Timeline */}
                              <div className="relative">
                                {touchpoints.map((tp: any, j: number) => {
                                  const isLast = j === touchpoints.length - 1;
                                  const info = getSourceInfo(tp.source || tp.clickType || "direct");
                                  return (
                                    <div key={j} className="flex items-start gap-3 relative">
                                      <div className="flex flex-col items-center">
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2" style={{ borderColor: info.color, backgroundColor: `${info.color}22` }}>
                                          <span className="text-[10px] font-bold text-white">{info.icon}</span>
                                        </div>
                                        {!isLast && <div className="w-0.5 h-6 bg-gray-200"/>}
                                      </div>
                                      <div className="pt-1 pb-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-xs font-medium text-gray-700">{info.label}</span>
                                          {tp.campaign && <span className="text-[10px] text-gray-500">{tp.campaign}</span>}
                                          {tp.clickType && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{tp.clickType}</span>}
                                          <span className="text-[10px] text-gray-600">
                                            {new Date(tp.timestamp).toLocaleString("es-AR", {
                                              timeZone: "America/Argentina/Buenos_Aires",
                                              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                                            })}
                                          </span>
                                        </div>
                                        {tp.page && <p className="text-[10px] text-gray-600 mt-0.5 truncate max-w-[300px]">{cleanUrl(tp.page)}</p>}
                                      </div>
                                    </div>
                                  );
                                })}
                                {/* Purchase marker */}
                                <div className="flex items-start gap-3 relative">
                                  <div className="flex flex-col items-center">
                                    <div className="w-7 h-7 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center flex-shrink-0">
                                      <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                                    </div>
                                  </div>
                                  <div className="pt-1">
                                    <span className="text-xs font-semibold text-emerald-600">Compra — {fmtARS(journey.revenue)}</span>
                                    <p className="text-[10px] text-gray-600">
                                      {new Date(journey.orderDate).toLocaleString("es-AR", {
                                        timeZone: "America/Argentina/Buenos_Aires",
                                        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                                      })}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Attribution Summary */}
                              <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                                <span>Modelo: <strong className="text-gray-700">{MODEL_LABELS[selectedModel]}</strong></span>
                                <span>Fuente principal: <strong className="text-gray-700">{creditSummary[0]?.label} ({creditSummary[0]?.pct}%)</strong></span>
                                <span>Touchpoints: <strong className="text-gray-700">{journey.touchpointCount}</strong></span>
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
            {/* CHANNEL TABLE (Resumen + Canales tabs)                   */}
            {/* ══════════════════════════════════════════════════════════ */}
            {(activeTab === "resumen" || activeTab === "canales") && (d.channelRoas?.length > 0 || hasAttribution) && (
              <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-gray-800">Rendimiento por Canal</h2>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Modelo: {MODEL_LABELS[selectedModel]}</span>
                    <InfoTip text="Los numeros de esta tabla cambian segun el modelo de atribucion seleccionado. Proba cambiar entre Nitro, Last Click, First Click y Linear para ver como se redistribuye el credito." />
                  </div>
                </div>
                {d.channelRoas && d.channelRoas.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Canal</th>
                          <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Inversion</th>
                          <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Rev. Pixel<InfoTip text="Revenue atribuido por NitroPixel segun el modelo seleccionado. Es TU verdad." /></th>
                          <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Rev. Plat.<InfoTip text="Lo que Meta/Google dicen en sus dashboards. Suelen inflar 20-40%." /></th>
                          <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Ordenes</th>
                          <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">ROAS Pixel<InfoTip text="Retorno real. Si es 3x, por cada $1 invertido volvieron $3." /></th>
                          <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">ROAS Plat.<InfoTip text="ROAS que dice la plataforma. Suele ser mas alto porque se auto-atribuyen." /></th>
                          <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">CPA<InfoTip text="Costo por orden. Cuanto te costo cada venta en este canal." /></th>
                          <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">AOV<InfoTip text="Ticket promedio de las ordenes de este canal." /></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {d.channelRoas.map((ch) => {
                          const info = getSourceInfo(ch.source);
                          const cpa = ch.spend > 0 && ch.orders > 0 ? Math.round(ch.spend / ch.orders) : 0;
                          const aov = ch.orders > 0 ? Math.round(ch.pixelRevenue / ch.orders) : 0;
                          return (
                            <tr key={ch.source} className="hover:bg-gray-50 transition-colors">
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: info.color }}>
                                    {info.icon}
                                  </div>
                                  <span className="text-gray-700 capitalize">{info.label}</span>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right text-gray-400 font-medium">{ch.spend > 0 ? fmtARS(ch.spend) : "-"}</td>
                              <td className="px-3 py-3 text-right text-gray-800 font-bold">{fmtARS(ch.pixelRevenue)}</td>
                              <td className="px-3 py-3 text-right text-gray-500">{ch.platformRevenue > 0 ? fmtARS(ch.platformRevenue) : "-"}</td>
                              <td className="px-3 py-3 text-right text-gray-400">{ch.orders}</td>
                              <td className="px-3 py-3 text-right font-semibold text-orange-600">{ch.pixelRoas > 0 ? `${ch.pixelRoas}x` : "-"}</td>
                              <td className="px-3 py-3 text-right text-gray-500">{ch.platformRoas > 0 ? `${ch.platformRoas}x` : "-"}</td>
                              <td className="px-3 py-3 text-right text-gray-400">{cpa > 0 ? fmtARS(cpa) : "-"}</td>
                              <td className="px-3 py-3 text-right text-gray-400">{aov > 0 ? fmtARS(aov) : "-"}</td>
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
                  <div className="px-5 py-3 bg-amber-500/5 border-t border-amber-500/20 flex items-center gap-3">
                    <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    <p className="text-xs text-amber-700">
                      <strong>Las plataformas sobre-reportan.</strong> Usa los numeros de NitroPixel ({MODEL_LABELS[selectedModel]}) para tus decisiones de presupuesto.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* DAILY TREND TABLE with Sparkline (Resumen tab only)      */}
            {/* ══════════════════════════════════════════════════════════ */}
            {activeTab === "resumen" && (
              <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
                {/* Header + Metric toggle */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                  <h2 className="text-sm font-semibold text-gray-800">Tendencia Diaria</h2>
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                    {([
                      { key: "revenue" as const, label: "Revenue" },
                      { key: "roas" as const, label: "ROAS" },
                      { key: "visitors" as const, label: "Visitantes" },
                    ]).map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => setTrendMetric(opt.key)}
                        className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                          trendMetric === opt.key
                            ? "bg-white text-gray-800 shadow-sm"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sparkline */}
                {(() => {
                  const sortedDays = (d.dailyChannelBreakdown || []).slice().sort((a: any, b: any) => a.day.localeCompare(b.day));
                  const sparkData = sortedDays.map((day: any) => ({
                    day: day.day,
                    value: trendMetric === "revenue" ? day.totalRevenue
                         : trendMetric === "roas" ? day.totalRoas
                         : day.visitors,
                  }));
                  const sparkColor = trendMetric === "revenue" ? "#22c55e" : trendMetric === "roas" ? "#06b6d4" : "#8b5cf6";
                  return sparkData.length > 1 ? (
                    <div className="px-5 pt-3 pb-1">
                      <ResponsiveContainer width="100%" height={40}>
                        <AreaChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                          <defs>
                            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={sparkColor} stopOpacity={0.25} />
                              <stop offset="95%" stopColor={sparkColor} stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="value" stroke={sparkColor} strokeWidth={1.5} fill="url(#sparkGrad)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : null;
                })()}

                {/* Daily Table with all metrics */}
                <div className="border-t border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="text-gray-500 border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-medium w-8"></th>
                        <th className="text-left py-2 px-2 font-medium">Fecha</th>
                        <th className="text-right py-2 px-2 font-medium">Revenue</th>
                        <th className="text-right py-2 px-2 font-medium">Órdenes</th>
                        <th className="text-right py-2 px-2 font-medium">Spend</th>
                        <th className="text-right py-2 px-2 font-medium">ROAS</th>
                        <th className="text-right py-2 px-2 font-medium">Visitantes</th>
                      </tr>
                    </thead>
                  </table>
                  <div className="max-h-[320px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <tbody>
                        {(d.dailyChannelBreakdown || []).map((day: any) => {
                          const isExpanded = expandedDay === day.day;
                          const dayParts = day.day.split("-");
                          const dayLabel = `${dayParts[2]}/${dayParts[1]}`;
                          const channels = day.channels || [];
                          const hasChannels = channels.length > 1;
                          return (
                            <Fragment key={day.day}>
                              <tr
                                onClick={() => hasChannels ? setExpandedDay(isExpanded ? null : day.day) : null}
                                className={`border-b border-gray-100 transition-colors text-gray-700 ${hasChannels ? "hover:bg-gray-50 cursor-pointer" : ""}`}
                              >
                                <td className="py-2 px-3 text-gray-400 w-8">
                                  {hasChannels && (
                                    <svg className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  )}
                                </td>
                                <td className="py-2 px-2 font-medium">{dayLabel}</td>
                                <td className="py-2 px-2 text-right font-medium text-emerald-700">{day.totalRevenue > 0 ? fmtCompact(day.totalRevenue) : "-"}</td>
                                <td className="py-2 px-2 text-right text-gray-500">{day.totalOrders > 0 ? fmt(day.totalOrders) : "-"}</td>
                                <td className="py-2 px-2 text-right text-orange-600/80">{day.totalSpend > 0 ? fmtCompact(day.totalSpend) : "-"}</td>
                                <td className="py-2 px-2 text-right">
                                  <span className={day.totalRoas >= 3 ? "text-emerald-600 font-medium" : day.totalRoas >= 1 ? "text-amber-600" : day.totalRoas > 0 ? "text-red-500" : "text-gray-400"}>
                                    {day.totalRoas > 0 ? `${day.totalRoas}x` : "-"}
                                  </span>
                                </td>
                                <td className="py-2 px-2 text-right text-gray-500">{day.visitors > 0 ? fmt(day.visitors) : "-"}</td>
                              </tr>
                              {isExpanded && channels.map((ch: any) => {
                                const info = getSourceInfo(ch.source);
                                return (
                                  <tr key={`${day.day}-${ch.source}`} className="border-b border-gray-50 bg-gray-50/50 text-gray-500">
                                    <td className="py-1.5 px-3"></td>
                                    <td className="py-1.5 px-2 pl-5 text-[11px]">
                                      <div className="flex items-center gap-1.5">
                                        <div className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold text-white" style={{ backgroundColor: info.color }}>
                                          {info.icon}
                                        </div>
                                        <span className="capitalize">{info.label}</span>
                                      </div>
                                    </td>
                                    <td className="py-1.5 px-2 text-right text-[11px]">{ch.revenue > 0 ? fmtCompact(ch.revenue) : "-"}</td>
                                    <td className="py-1.5 px-2 text-right text-[11px]">{ch.orders > 0 ? ch.orders : "-"}</td>
                                    <td className="py-1.5 px-2 text-right text-[11px] text-orange-500/60">{ch.spend > 0 ? fmtCompact(ch.spend) : "-"}</td>
                                    <td className="py-1.5 px-2 text-right text-[11px]">
                                      {ch.roas > 0 ? (
                                        <span className={ch.roas >= 3 ? "text-emerald-600/70" : ch.roas >= 1 ? "text-amber-600/70" : "text-red-500/70"}>
                                          {ch.roas}x
                                        </span>
                                      ) : "-"}
                                    </td>
                                    <td className="py-1.5 px-2 text-right text-[11px] text-gray-400">-</td>
                                  </tr>
                                );
                              })}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* FUNNEL (Resumen tab only)                                */}
            {/* ══════════════════════════════════════════════════════════ */}
            {activeTab === "resumen" && d.funnel && d.funnel.pageView > 0 && (() => {
              const funnelSteps = [
                { label: "Visitantes", value: d.funnel.pageView, color: "#6366F1", bg: "rgba(99,102,241,0.15)" },
                { label: "Vieron Producto", value: d.funnel.viewProduct, color: "#8B5CF6", bg: "rgba(139,92,246,0.15)" },
                { label: "Agregaron al Carrito", value: d.funnel.addToCart, color: "#A855F7", bg: "rgba(168,85,247,0.15)" },
                { label: "Eligieron Entrega", value: d.funnel.checkoutShipping, color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
                { label: "Eligieron Pago", value: d.funnel.checkoutPayment, color: "#F97316", bg: "rgba(249,115,22,0.15)" },
                { label: "Compraron", value: d.funnel.purchase, color: "#22C55E", bg: "rgba(34,197,94,0.15)" },
              ];
              const maxVal = funnelSteps[0].value || 1;
              return (
                <div className="rounded-2xl bg-white border border-gray-200 p-4">
                  <h2 className="text-sm font-semibold text-gray-800 mb-4">Funnel de Conversión</h2>
                  <div className="flex flex-col gap-1">
                    {funnelSteps.map((step, i) => {
                      const widthPct = Math.max((step.value / maxVal) * 100, 8);
                      // Find the last step with data before this one for step rate
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
                      {((d.funnel.purchase / maxVal) * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* CONVERSION LAG (Resumen tab only)                        */}
            {/* ══════════════════════════════════════════════════════════ */}
            {activeTab === "resumen" && d.attribution?.conversionLag?.length > 0 && (
              <div className="rounded-2xl bg-white border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-semibold text-gray-800">Tiempo hasta la Compra</h2>
                  {d.pixelHealth?.pixelAgeDays !== undefined && d.pixelHealth.pixelAgeDays <= 30 && (
                    <span className="text-[10px] text-amber-600/80 bg-amber-400/10 px-2 py-0.5 rounded-full">
                      Pixel activo hace {d.pixelHealth.pixelAgeDays} {d.pixelHealth.pixelAgeDays === 1 ? "día" : "días"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Días entre el primer contacto del pixel y la conversión
                  {d.pixelHealth?.pixelAgeDays !== undefined && d.pixelHealth.pixelAgeDays <= 7 && (
                    <span className="text-amber-600/60"> — datos limitados por la edad del pixel</span>
                  )}
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.attribution.conversionLag.filter((b: any) => b.bucket !== "unknown")}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="bucket" tick={{ fill: "#9ca3af", fontSize: 11 }} stroke="rgba(255,255,255,0.1)" />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} stroke="rgba(255,255,255,0.1)" allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} formatter={(v: number, name: string) => [name === "orders" ? `${v} órdenes` : fmtARS(v), name === "orders" ? "Órdenes" : "Revenue"]} labelFormatter={(v) => `${v}`} />
                    <Bar dataKey="orders" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* PIXEL HEALTH CARDS (Resumen tab only)                    */}
            {/* ══════════════════════════════════════════════════════════ */}
            {activeTab === "resumen" && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl bg-white border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Match Rate (Web)<InfoTip text="Porcentaje de ordenes WEB que NitroPixel pudo atribuir. Excluye MercadoLibre (no trackeable por pixel)." /></span>
                    <div className={`w-2 h-2 rounded-full ${bk.attributionRate >= 50 ? "bg-emerald-400" : bk.attributionRate >= 25 ? "bg-amber-400" : "bg-red-400"}`}/>
                  </div>
                  <span className="text-xl font-bold text-gray-800">{bk.attributionRate}%</span>
                  {bk.marketplaceOrders > 0 && <p className="text-[10px] text-gray-400 mt-0.5">{fmt(bk.marketplaceOrders)} ML excluidas</p>}
                </div>
                <div className="rounded-xl bg-white border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Eventos/hora<InfoTip text="Eventos que el pixel recibe por hora. Si cae mucho, algo se rompio." /></span>
                    <div className={`w-2 h-2 rounded-full ${d.liveStatus.lastHourEvents > 0 ? "bg-emerald-400" : "bg-red-400"}`}/>
                  </div>
                  <span className="text-xl font-bold text-gray-800">{fmt(d.liveStatus.lastHourEvents)}</span>
                </div>
                <div className="rounded-xl bg-white border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Click IDs<InfoTip text="Porcentaje de visitas con click ID (fbclid/gclid). Mas alto = mejor atribucion." /></span>
                    <div className={`w-2 h-2 rounded-full ${(d.pixelHealth?.clickCoverage?.clickIdRate || 0) >= 30 ? "bg-emerald-400" : "bg-amber-400"}`}/>
                  </div>
                  <span className="text-xl font-bold text-gray-800">{d.pixelHealth?.clickCoverage?.clickIdRate || 0}%</span>
                </div>
                <div className="rounded-xl bg-white border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">AOV<InfoTip text="Ticket promedio de ordenes atribuidas." /></span>
                  </div>
                  <span className="text-xl font-bold text-gray-800">{bk.aov > 0 ? fmtARS(bk.aov) : "-"}</span>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* TRACKING DETAILS (collapsible, all tabs)                 */}
            {/* ══════════════════════════════════════════════════════════ */}
            {activeTab === "resumen" && (
              <div className="rounded-2xl bg-white border border-gray-200">
                <button
                  onClick={() => setShowTrackingDetails(!showTrackingDetails)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-gray-700">Tracking Details</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{fmt(d.kpis.totalVisitors)} visitantes · {fmt(d.kpis.totalSessions)} sesiones</span>
                  </div>
                  <svg className={`w-4 h-4 text-gray-500 transition-transform ${showTrackingDetails ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showTrackingDetails && (
                  <div className="px-4 pb-4 space-y-4 border-t border-gray-200 pt-4">
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
                                    <span className="text-sm text-gray-700 capitalize">{dev.device}</span>
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
                                <div className="flex-1 h-5 bg-gray-100 rounded-lg overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-orange-400 to-orange-200 rounded-lg flex items-center px-2" style={{ width: `${Math.max(evt.percentage, 3)}%` }}>
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
                )}
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* VENTAS POR ANUNCIO — Two-panel layout (mockup v2)          */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {salesBySource && salesBySource.length > 0 && (
          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Ventas por Canal</h2>
              <p className="text-xs text-gray-500 mt-1">
                Que productos vendio cada canal — Modelo: {MODEL_LABELS[selectedModel] || selectedModel}
              </p>
            </div>

            <div className="flex flex-col md:flex-row min-h-[400px]">
              {/* Left panel: Source list */}
              <div className="md:w-[340px] border-r border-gray-100 overflow-y-auto max-h-[600px]">
                {salesBySource.map((src, idx) => {
                  const info = getSourceInfo(src.source);
                  const isSelected = idx === selectedSource;
                  return (
                    <button
                      key={`${src.source}-${idx}`}
                      onClick={() => setSelectedSource(idx)}
                      className={`w-full text-left px-5 py-4 border-b border-gray-50 transition-colors ${
                        isSelected ? "bg-blue-50 border-l-4 border-l-blue-500" : "hover:bg-gray-50 border-l-4 border-l-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                          style={{ backgroundColor: info.color }}
                        >
                          {info.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-900 text-sm truncate">
                            {info.label}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                            <span>{fmtARS(src.revenue)}</span>
                            <span className="text-gray-700">|</span>
                            <span>{src.orders} {src.orders === 1 ? "orden" : "ordenes"}</span>
                            <span className="text-gray-700">|</span>
                            <span>{src.units} uds</span>
                          </div>
                        </div>
                        {isSelected && (
                          <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right panel: Product detail */}
              <div className="flex-1 p-6 overflow-y-auto max-h-[600px]">
                {(() => {
                  const selected = salesBySource[selectedSource];
                  if (!selected) return null;
                  const info = getSourceInfo(selected.source);

                  return (
                    <>
                      {/* Source summary cards */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <div className="text-lg font-bold text-gray-900">{fmtARS(selected.revenue)}</div>
                          <div className="text-xs text-gray-500 mt-0.5">Facturacion</div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <div className="text-lg font-bold text-gray-900">{selected.orders}</div>
                          <div className="text-xs text-gray-500 mt-0.5">Ordenes</div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <div className="text-lg font-bold text-gray-900">{selected.units}</div>
                          <div className="text-xs text-gray-500 mt-0.5">Unidades</div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <div className="text-lg font-bold text-gray-900">{fmtARS(selected.avgTicket)}</div>
                          <div className="text-xs text-gray-500 mt-0.5">Ticket Prom.</div>
                        </div>
                      </div>

                      {/* Product table */}
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">
                        Productos vendidos via {info.label}
                      </h3>

                      {selected.products.length === 0 ? (
                        <p className="text-sm text-gray-400 py-8 text-center">Sin datos de productos</p>
                      ) : (
                        <div className="space-y-2">
                          {selected.products.map((prod, pidx) => (
                            <div
                              key={pidx}
                              className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                            >
                              {/* Product image */}
                              <div className="w-14 h-14 rounded-lg bg-white border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                                {prod.image ? (
                                  <img
                                    src={prod.image}
                                    alt={prod.name}
                                    className="w-full h-full object-contain"
                                    loading="lazy"
                                  />
                                ) : (
                                  <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                                  </svg>
                                )}
                              </div>

                              {/* Product info */}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">{prod.name}</div>
                                {prod.sku && (
                                  <div className="text-xs text-gray-400 mt-0.5">SKU: {prod.sku}</div>
                                )}
                              </div>

                              {/* Stats */}
                              <div className="flex items-center gap-5 shrink-0">
                                <div className="text-center">
                                  <div className="text-sm font-semibold text-gray-900">{prod.units}</div>
                                  <div className="text-[10px] text-gray-400 uppercase">Uds</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-sm font-semibold text-gray-900">{fmtARS(prod.avgPrice)}</div>
                                  <div className="text-[10px] text-gray-400 uppercase">Precio</div>
                                </div>
                                <div className="text-center min-w-[80px]">
                                  <div className="text-sm font-bold text-gray-900">{fmtARS(prod.revenue)}</div>
                                  <div className="text-[10px] text-gray-400 uppercase">Total</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {salesBySource && salesBySource.length === 0 && !salesLoading && (
          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-8 text-center">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Ventas por Canal</h2>
            <p className="text-sm text-gray-400">No hay ventas atribuidas en este periodo</p>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 py-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400"/> OK</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"/> Revisar</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400"/> Atencion</span>
          <span className="ml-4 flex items-center gap-1">
            <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
            Hover para ver explicacion
          </span>
        </div>
      </div>
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
  sub,
}: {
  label: string;
  value: string;
  change?: number;
  color?: string;
  info?: string;
  sub?: string;
}) {
  const colorMap: Record<string, string> = {
    indigo: "bg-white border-indigo-200",
    cyan: "bg-white border-cyan-200",
    purple: "bg-white border-purple-200",
    orange: "bg-white border-orange-200",
    green: "bg-white border-emerald-200",
    pink: "bg-white border-pink-200",
    gray: "bg-white border-gray-200",
  };

  return (
    <div className={`rounded-xl ${colorMap[color] || colorMap.gray} border p-4 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}{info && <InfoTip text={info} />}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        {change !== undefined && <span className={`text-xs font-medium ${pctColor(change)}`}>{pctBadge(change)}</span>}
      </div>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
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
