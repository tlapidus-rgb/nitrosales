"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { DateRangeFilter } from "@/components/dashboard";
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

const SOURCE_ICONS: Record<string, { icon: string; color: string; label: string; svg?: string }> = {
  meta: { icon: "M", color: "#1877F2", label: "Meta", svg: "meta" },
  facebook: { icon: "M", color: "#1877F2", label: "Meta", svg: "meta" },
  instagram: { icon: "I", color: "#E4405F", label: "Instagram", svg: "instagram" },
  google: { icon: "G", color: "#EA4335", label: "Google", svg: "google" },
  bing: { icon: "B", color: "#008373", label: "Bing", svg: "bing" },
  tiktok: { icon: "T", color: "#000000", label: "TikTok", svg: "tiktok" },
  direct: { icon: "D", color: "#22C55E", label: "Directo", svg: "direct" },
  organic: { icon: "O", color: "#8B5CF6", label: "Organico", svg: "organic" },
  email: { icon: "E", color: "#F59E0B", label: "Email", svg: "email" },
  "email-marketing": { icon: "E", color: "#F59E0B", label: "Email Marketing", svg: "email" },
  "vtex-abandoned-cart": { icon: "C", color: "#E85D04", label: "Carrito Abandonado", svg: "email" },
  "email-remarketing": { icon: "R", color: "#FB923C", label: "Email Remarketing", svg: "email" },
  referral: { icon: "R", color: "#EC4899", label: "Referido", svg: "referral" },
  whatsapp: { icon: "W", color: "#25D366", label: "WhatsApp", svg: "whatsapp" },
};

// SVG logo paths for each channel — rendered as white icons inside colored circles
function ChannelLogo({ source, size = 14 }: { source?: string; size?: number }) {
  const s = (source || "").toLowerCase();
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "white", className: "flex-shrink-0" };
  switch (s) {
    case "meta":
    case "facebook":
      // Meta "infinity" logo
      return (<svg {...props}><path d="M12 10.203c-1.047-1.45-2.183-2.403-3.64-2.403-2.16 0-4.36 2.1-4.36 5.2 0 2.1 1.1 4 3.1 4 1.6 0 2.7-.9 4.1-2.9l.8-1.2.8 1.2c1.4 2 2.5 2.9 4.1 2.9 2 0 3.1-1.9 3.1-4 0-3.1-2.2-5.2-4.36-5.2-1.457 0-2.593.953-3.64 2.403zm-1.44 2.197L9.2 14.3c-1 1.5-1.5 1.9-2.3 1.9-.9 0-1.5-.8-1.5-2.2 0-1.9 1-3.4 2.5-3.4.8 0 1.4.4 2.66 1.8zm2.88 0c1.26-1.4 1.86-1.8 2.66-1.8 1.5 0 2.5 1.5 2.5 3.4 0 1.4-.6 2.2-1.5 2.2-.8 0-1.3-.4-2.3-1.9l-1.36-1.9z"/></svg>);
    case "instagram":
      return (<svg {...props}><path d="M12 2.982c2.937 0 3.285.011 4.445.064a6.087 6.087 0 012.042.379 3.408 3.408 0 011.265.823c.37.37.632.803.823 1.265.234.543.362 1.16.379 2.042.053 1.16.064 1.508.064 4.445s-.011 3.285-.064 4.445a6.087 6.087 0 01-.379 2.042 3.643 3.643 0 01-2.088 2.088 6.087 6.087 0 01-2.042.379c-1.16.053-1.508.064-4.445.064s-3.285-.011-4.445-.064a6.087 6.087 0 01-2.042-.379 3.408 3.408 0 01-1.265-.823 3.408 3.408 0 01-.823-1.265 6.087 6.087 0 01-.379-2.042C2.993 15.285 2.982 14.937 2.982 12s.011-3.285.064-4.445a6.087 6.087 0 01.379-2.042c.191-.462.452-.895.823-1.265a3.408 3.408 0 011.265-.823 6.087 6.087 0 012.042-.379C8.715 2.993 9.063 2.982 12 2.982zM12 1c-2.987 0-3.362.013-4.535.066a8.074 8.074 0 00-2.67.511 5.392 5.392 0 00-1.949 1.27 5.392 5.392 0 00-1.27 1.949 8.074 8.074 0 00-.51 2.67C1.013 8.638 1 9.013 1 12s.013 3.362.066 4.535a8.074 8.074 0 00.511 2.67 5.392 5.392 0 001.27 1.949 5.392 5.392 0 001.949 1.27 8.074 8.074 0 002.67.51C8.638 22.987 9.013 23 12 23s3.362-.013 4.535-.066a8.074 8.074 0 002.67-.511 5.625 5.625 0 003.218-3.218 8.074 8.074 0 00.511-2.67C22.987 15.362 23 14.987 23 12s-.013-3.362-.066-4.535a8.074 8.074 0 00-.511-2.67 5.392 5.392 0 00-1.27-1.949 5.392 5.392 0 00-1.949-1.27 8.074 8.074 0 00-2.67-.51C15.362 1.013 14.987 1 12 1zm0 5.351A5.649 5.649 0 1017.649 12 5.649 5.649 0 0012 6.351zm0 9.316A3.667 3.667 0 1115.667 12 3.667 3.667 0 0112 15.667zM18.804 5.34a1.44 1.44 0 10-1.44 1.44 1.44 1.44 0 001.44-1.44z"/></svg>);
    case "google":
      return (<svg {...props}><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="rgba(255,255,255,0.85)"/><path d="M5.84 14.09A6.68 6.68 0 015.5 12c0-.72.13-1.43.34-2.09V7.07H2.18A11 11 0 001 12c0 1.77.43 3.44 1.18 4.93l3.66-2.84z" fill="rgba(255,255,255,0.7)"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="rgba(255,255,255,0.55)"/></svg>);
    case "tiktok":
      return (<svg {...props}><path d="M16.6 5.82A4.278 4.278 0 0115.54 3h-3.09v12.4a2.592 2.592 0 01-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 004.3 1.38V7.3s-1.88.09-4.24-1.48z"/></svg>);
    case "bing":
      return (<svg {...props}><path d="M5 3v16.5l4.06 2.3 7.94-4.03V13.5l-5.06-2.48L5 3zm4.06 12.52V8.44l4.94 2.43-4.94 4.65z"/></svg>);
    case "whatsapp":
      return (<svg {...props}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 1C5.935 1 1 5.935 1 12c0 1.94.508 3.762 1.395 5.34L1 23l5.812-1.364A10.95 10.95 0 0012 23c6.065 0 11-4.935 11-11S18.065 1 12 1zm0 20.1a9.06 9.06 0 01-4.63-1.27l-.33-.197-3.442.903.92-3.357-.216-.343A9.055 9.055 0 012.9 12c0-5.014 4.086-9.1 9.1-9.1S21.1 6.986 21.1 12s-4.086 9.1-9.1 9.1z"/></svg>);
    case "email":
      return (<svg {...props} fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>);
    case "referral":
      return (<svg {...props} fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
    case "organic":
      return (<svg {...props} fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>);
    case "direct":
      return (<svg {...props} fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/></svg>);
    default:
      return <span className="font-bold" style={{ fontSize: size * 0.7 }}>{(source || "?").charAt(0).toUpperCase()}</span>;
  }
}

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
  funnel: { pageView: number; viewProduct: number; addToCart: number; checkoutStart: number; purchase: number };
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
    isAttributed?: boolean;
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

  // Attribution window settings
  const [windowOpen, setWindowOpen] = useState(false);
  const [globalWindow, setGlobalWindow] = useState(30);
  const [editingGlobalWindow, setEditingGlobalWindow] = useState(30);
  const [channelWindows, setChannelWindows] = useState<Record<string, number | null>>({});
  const [editingChannelWindows, setEditingChannelWindows] = useState<Record<string, number | null>>({});
  const [savingWindow, setSavingWindow] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);

  // Tabs + sections
  const [activeTab, setActiveTab] = useState<"resumen" | "ordenes" | "canales">("resumen");

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

  // Fetch attribution settings on mount (weights + windows)
  useEffect(() => {
    fetch("/api/settings/attribution")
      .then((r) => r.json())
      .then((d) => {
        if (d.weights) {
          setNitroWeights(d.weights);
          setEditingWeights(d.weights);
        }
        if (d.attributionWindowDays) {
          setGlobalWindow(d.attributionWindowDays);
          setEditingGlobalWindow(d.attributionWindowDays);
        }
        if (d.channelWindows) {
          setChannelWindows(d.channelWindows);
          setEditingChannelWindows(d.channelWindows);
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

  const saveWindowSettings = async () => {
    setSavingWindow(true);
    setWindowError(null);
    try {
      // Clean channel windows: remove null entries (means "use global")
      const cleanCW: Record<string, number | null> = {};
      for (const [ch, val] of Object.entries(editingChannelWindows)) {
        if (val !== null && val !== editingGlobalWindow) {
          cleanCW[ch] = val;
        } else {
          cleanCW[ch] = null; // will be removed by API
        }
      }
      const res = await fetch("/api/settings/attribution", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attributionWindowDays: editingGlobalWindow,
          channelWindows: cleanCW,
        }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      const data = await res.json();
      setGlobalWindow(data.attributionWindowDays);
      setChannelWindows(data.channelWindows);
      setEditingChannelWindows(data.channelWindows);
      setWindowOpen(false);
      fetchData(); // Refresh data with new windows
    } catch {
      setWindowError("Error al guardar la configuracion");
    } finally {
      setSavingWindow(false);
    }
  };

  const PIXEL_QUICK_RANGES = [
    { label: "7 dias", days: 7 },
    { label: "30 dias", days: 30 },
    { label: "90 dias", days: 90 },
  ];

  const setQuickRange = (days: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - days * MS_PER_DAY);
    setDateFrom(from.toISOString().slice(0, 10));
    setDateTo(to.toISOString().slice(0, 10));
    setActiveQuickRange(days);
    setCurrentPage(1);
  };

  const handlePixelDateChange = (type: "from" | "to", value: string) => {
    if (type === "from") setDateFrom(value);
    else setDateTo(value);
    setActiveQuickRange(null);
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
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">NitroPixel</h1>
              <p className="text-xs text-gray-500">Revenue Attribution</p>
            </div>
          </div>
          <div className="mb-3">
            <DateRangeFilter
              dateFrom={dateFrom} dateTo={dateTo} activeQuickRange={activeQuickRange}
              quickRanges={PIXEL_QUICK_RANGES} onQuickRange={setQuickRange}
              onDateChange={handlePixelDateChange} loading={loading}
            />
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

          {/* ═══ ATTRIBUTION WINDOW CONFIG ═══ */}
          <div className="mt-3">
            <button
              onClick={() => { setWindowOpen(!windowOpen); setEditingGlobalWindow(globalWindow); setEditingChannelWindows({...channelWindows}); setWindowError(null); }}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-orange-400 transition-colors"
            >
              <svg className={`w-3 h-3 transition-transform ${windowOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7"/></svg>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              Configurar ventana de atribucion
              <span className="text-gray-400 font-normal ml-1">({globalWindow}d global{Object.keys(channelWindows).length > 0 ? ` + ${Object.keys(channelWindows).length} override${Object.keys(channelWindows).length > 1 ? 's' : ''}` : ''})</span>
            </button>

            {windowOpen && (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-4">Define cuantos dias hacia atras se consideran los touchpoints para la atribucion. Podes usar una ventana global o personalizarla por canal.</p>

                {/* Global window selector */}
                <div className="mb-4">
                  <label className="text-xs font-medium text-gray-600 mb-2 block">Ventana global</label>
                  <div className="flex gap-2">
                    {[7, 14, 30, 60].map(d => (
                      <button
                        key={d}
                        onClick={() => setEditingGlobalWindow(d)}
                        className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                          editingGlobalWindow === d
                            ? "bg-blue-500 text-white shadow-sm"
                            : "bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-500"
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>

                {/* Per-channel overrides */}
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-2 block">Overrides por canal <span className="text-gray-400 font-normal">(opcional)</span></label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {["meta", "google", "instagram", "tiktok", "direct", "email", "whatsapp", "referral"].map(ch => {
                      const info = getSourceInfo(ch);
                      const val = editingChannelWindows[ch];
                      const isOverridden = val !== null && val !== undefined;
                      return (
                        <div key={ch} className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${isOverridden ? "border-blue-300 bg-white" : "border-gray-200 bg-gray-50"}`}>
                          <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: info.color }}>
                            <ChannelLogo source={ch} size={11} />
                          </span>
                          <span className="text-xs text-gray-700 flex-1 truncate">{info.label}</span>
                          <select
                            value={isOverridden ? String(val) : "global"}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditingChannelWindows(prev => ({
                                ...prev,
                                [ch]: v === "global" ? null : Number(v),
                              }));
                            }}
                            className="text-xs bg-transparent border-none text-right font-semibold text-blue-600 cursor-pointer focus:outline-none w-16"
                          >
                            <option value="global">Global</option>
                            <option value="1">1d</option>
                            <option value="7">7d</option>
                            <option value="14">14d</option>
                            <option value="30">30d</option>
                            <option value="60">60d</option>
                            <option value="90">90d</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {windowError && <p className="text-xs text-red-500 mt-3">{windowError}</p>}

                <div className="flex items-center justify-between mt-4">
                  <button
                    onClick={() => { setEditingGlobalWindow(30); setEditingChannelWindows({}); }}
                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                  >
                    Restaurar default (30d, sin overrides)
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => { setWindowOpen(false); setWindowError(null); }} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-100">Cancelar</button>
                    <button
                      onClick={saveWindowSettings}
                      disabled={savingWindow}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                    >
                      {savingWindow ? "Guardando..." : "Guardar ventana"}
                    </button>
                  </div>
                </div>
              </div>
            )}
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
                          {/* Credit mini-bar or unattributed badge */}
                          {journey.isAttributed === false ? (
                            <div className="flex-1 flex items-center gap-2">
                              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Sin atribuir</span>
                            </div>
                          ) : (
                            <div className="flex-1 flex items-center gap-2">
                              <div className="flex-1 h-3 rounded-full overflow-hidden flex bg-gray-200">
                                {creditSummary.map((c, ci) => (
                                  <div key={ci} className="h-full transition-all" style={{ width: `${c.pct}%`, backgroundColor: c.color }} title={`${c.label}: ${c.pct}%`} />
                                ))}
                              </div>
                              <span className="text-xs text-gray-500 w-16 text-right">{creditSummary[0]?.label}</span>
                            </div>
                          )}
                          {journey.conversionLag !== null && (
                            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{journey.conversionLag}d</span>
                          )}
                        </div>

                        {/* Expanded Journey */}
                        {isExpanded && (
                          <div className="px-5 pb-5 ml-10">
                            <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                              {/* Unattributed order message */}
                              {journey.isAttributed === false && (
                                <div className="mb-4 bg-amber-50 rounded-lg p-3 border border-amber-200">
                                  <span className="text-xs text-amber-800">El pixel no pudo vincular esta orden con una sesion de navegacion. La venta fue registrada por el webhook de VTEX pero no se encontro el recorrido del comprador en el browser.</span>
                                </div>
                              )}
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
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2" style={{ borderColor: info.color, backgroundColor: info.color }}>
                                          <ChannelLogo source={tp.source || tp.clickType || "direct"} size={14} />
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
                                  <div className="w-6 h-6 rounded-md flex items-center justify-center text-white" style={{ backgroundColor: info.color }}>
                                    <ChannelLogo source={ch.source} size={13} />
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
                                        <div className="w-4 h-4 rounded flex items-center justify-center text-white" style={{ backgroundColor: info.color }}>
                                          <ChannelLogo source={ch.source} size={9} />
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
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: info.color }}
                        >
                          <ChannelLogo source={src.source} size={16} />
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
