"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { DateRangeFilter } from "@/components/dashboard";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ComposedChart, Line, Cell, PieChart, Pie, ReferenceLine,
} from "recharts";

// ══════════════════════════════════════════════════════════════
// NitroPixel Analytics — World-Class Intelligence Dashboard
// ══════════════════════════════════════════════════════════════
// Powered by first-party pixel data. No intermediaries.
// "Google mide para Google. Meta mide para Meta. NitroPixel mide para vos."

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
  v > 0 ? `+${v.toFixed(1)}%` : v < 0 ? `${v.toFixed(1)}%` : "0%";
const pctColor = (v: number) =>
  v > 0 ? "text-emerald-600" : v < 0 ? "text-red-500" : "text-gray-400";

const COLORS = ["#f97316", "#06b6d4", "#a855f7", "#22c55e", "#eab308", "#ec4899", "#3b82f6", "#14b8a6"];

// ── Channel Identity ──
const SOURCE_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  meta: { icon: "M", color: "#1877F2", label: "Meta" },
  facebook: { icon: "M", color: "#1877F2", label: "Meta" },
  instagram: { icon: "I", color: "#E4405F", label: "Instagram" },
  google: { icon: "G", color: "#EA4335", label: "Google" },
  bing: { icon: "B", color: "#008373", label: "Bing" },
  tiktok: { icon: "T", color: "#000000", label: "TikTok" },
  direct: { icon: "D", color: "#22C55E", label: "Directo" },
  organic: { icon: "O", color: "#8B5CF6", label: "Orgánico" },
  google_organic: { icon: "G", color: "#34A853", label: "Google Orgánico" },
  bing_organic: { icon: "B", color: "#008373", label: "Bing Orgánico" },
  email: { icon: "E", color: "#F59E0B", label: "Email" },
  "email-marketing": { icon: "E", color: "#F59E0B", label: "Email Marketing" },
  "vtex-abandoned-cart": { icon: "C", color: "#E85D04", label: "Carrito Abandonado" },
  "email-remarketing": { icon: "R", color: "#FB923C", label: "Email Remarketing" },
  referral: { icon: "R", color: "#EC4899", label: "Referido" },
  whatsapp: { icon: "W", color: "#25D366", label: "WhatsApp" },
};

function getSourceInfo(source: string) {
  const key = (source || "direct").toLowerCase();
  return SOURCE_ICONS[key] || { icon: key.charAt(0).toUpperCase(), color: "#6B7280", label: source };
}

// SVG channel logos — white icons inside colored circles
function ChannelLogo({ source, size = 14 }: { source?: string; size?: number }) {
  const s = (source || "").toLowerCase();
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "white", className: "flex-shrink-0" };
  switch (s) {
    case "meta": case "facebook":
      return (<svg {...props}><path d="M12 10.203c-1.047-1.45-2.183-2.403-3.64-2.403-2.16 0-4.36 2.1-4.36 5.2 0 2.1 1.1 4 3.1 4 1.6 0 2.7-.9 4.1-2.9l.8-1.2.8 1.2c1.4 2 2.5 2.9 4.1 2.9 2 0 3.1-1.9 3.1-4 0-3.1-2.2-5.2-4.36-5.2-1.457 0-2.593.953-3.64 2.403zm-1.44 2.197L9.2 14.3c-1 1.5-1.5 1.9-2.3 1.9-.9 0-1.5-.8-1.5-2.2 0-1.9 1-3.4 2.5-3.4.8 0 1.4.4 2.66 1.8zm2.88 0c1.26-1.4 1.86-1.8 2.66-1.8 1.5 0 2.5 1.5 2.5 3.4 0 1.4-.6 2.2-1.5 2.2-.8 0-1.3-.4-2.3-1.9l-1.36-1.9z"/></svg>);
    case "instagram":
      return (<svg {...props}><path d="M12 2.982c2.937 0 3.285.011 4.445.064a6.087 6.087 0 012.042.379 3.408 3.408 0 011.265.823c.37.37.632.803.823 1.265.234.543.362 1.16.379 2.042.053 1.16.064 1.508.064 4.445s-.011 3.285-.064 4.445a6.087 6.087 0 01-.379 2.042 3.643 3.643 0 01-2.088 2.088 6.087 6.087 0 01-2.042.379c-1.16.053-1.508.064-4.445.064s-3.285-.011-4.445-.064a6.087 6.087 0 01-2.042-.379 3.408 3.408 0 01-1.265-.823 3.408 3.408 0 01-.823-1.265 6.087 6.087 0 01-.379-2.042C2.993 15.285 2.982 14.937 2.982 12s.011-3.285.064-4.445a6.087 6.087 0 01.379-2.042c.191-.462.452-.895.823-1.265a3.408 3.408 0 011.265-.823 6.087 6.087 0 012.042-.379C8.715 2.993 9.063 2.982 12 2.982zM12 1c-2.987 0-3.362.013-4.535.066a8.074 8.074 0 00-2.67.511 5.392 5.392 0 00-1.949 1.27 5.392 5.392 0 00-1.27 1.949 8.074 8.074 0 00-.51 2.67C1.013 8.638 1 9.013 1 12s.013 3.362.066 4.535a8.074 8.074 0 00.511 2.67 5.392 5.392 0 001.27 1.949 5.392 5.392 0 001.949 1.27 8.074 8.074 0 002.67.51C8.638 22.987 9.013 23 12 23s3.362-.013 4.535-.066a8.074 8.074 0 002.67-.511 5.625 5.625 0 003.218-3.218 8.074 8.074 0 00.511-2.67C22.987 15.362 23 14.987 23 12s-.013-3.362-.066-4.535a8.074 8.074 0 00-.511-2.67 5.392 5.392 0 00-1.27-1.949 5.392 5.392 0 00-1.949-1.27 8.074 8.074 0 00-2.67-.51C15.362 1.013 14.987 1 12 1zm0 5.351A5.649 5.649 0 1017.649 12 5.649 5.649 0 0012 6.351zm0 9.316A3.667 3.667 0 1115.667 12 3.667 3.667 0 0112 15.667zM18.804 5.34a1.44 1.44 0 10-1.44 1.44 1.44 1.44 0 001.44-1.44z"/></svg>);
    case "google":
      return (<svg {...props}><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="rgba(255,255,255,0.85)"/><path d="M5.84 14.09A6.68 6.68 0 015.5 12c0-.72.13-1.43.34-2.09V7.07H2.18A11 11 0 001 12c0 1.77.43 3.44 1.18 4.93l3.66-2.84z" fill="rgba(255,255,255,0.7)"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="rgba(255,255,255,0.55)"/></svg>);
    case "google_organic":
      return (<svg {...props} fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>);
    case "bing_organic":
      return (<svg {...props} fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>);
    case "tiktok":
      return (<svg {...props}><path d="M16.6 5.82A4.278 4.278 0 0115.54 3h-3.09v12.4a2.592 2.592 0 01-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 004.3 1.38V7.3s-1.88.09-4.24-1.48z"/></svg>);
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

// ── Info Tooltip ──
function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex ml-1 cursor-help" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <svg className="w-3.5 h-3.5 text-gray-400 hover:text-cyan-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4m0-4h.01" />
      </svg>
      {show && (
        <span className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-gray-100 text-[11px] leading-relaxed rounded-lg px-3 py-2 w-60 z-50 shadow-xl pointer-events-none">{text}</span>
      )}
    </span>
  );
}

// ── Types ──
interface PixelData {
  liveStatus: { status: string; lastEventAt: string | null; totalEvents: number; lastHourEvents: number };
  kpis: {
    totalVisitors: number; totalSessions: number; totalPageViews: number;
    identifiedVisitors: number; cartVisitors: number; purchaseVisitors: number;
    pagesPerSession: number; daysInPeriod: number;
    changes: { visitors: number; sessions: number; pageViews: number };
  };
  businessKpis: {
    pixelRevenue: number; pixelRoas: number; pixelRoasRaw: number;
    ordersAttributed: number; attributionRate: number; aov: number;
    totalAdSpend: number; totalOrders: number; webOrders: number; webRevenue: number;
    marketplaceOrders: number; marketplaceRevenue: number;
    changes: { pixelRevenue: number; ordersAttributed: number; pixelRoas: number };
    projectedRevenue?: number;
  };
  channelRoas: Array<{
    source: string; orders: number; pixelRevenue: number; projectedRevenue?: number;
    platformRevenue: number; spend: number; platformConversions: number;
    pixelRoas: number; pixelRoasRaw?: number; platformRoas: number; diffPercent: number | null;
  }>;
  funnel: { pageView: number; viewProduct: number; addToCart: number; checkoutStart: number; purchase: number };
  dailyRevenue: Array<{ day: string; revenue: number; orders: number; spend: number; roas: number }>;
  dailyChannelBreakdown: Array<{
    day: string; totalRevenue: number; totalOrders: number; totalSpend: number;
    totalRoas: number; visitors: number;
    channels: Array<{ source: string; revenue: number; orders: number; spend: number; roas: number }>;
  }>;
  recentJourneys: Array<{
    orderId: string; orderExternalId?: string; revenue: number;
    touchpointCount: number; conversionLag: number;
    touchpoints: Array<{ timestamp?: string; source?: string; medium?: string; campaign?: string; page?: string }>;
    orderDate: string; orderStatus?: string;
  }>;
  channelRoles?: Array<{ source: string; firstTouch: number; assistTouch: number; lastTouch: number; soloTouch: number }>;
  pixelHealth: {
    attributionRate: number;
    clickCoverage: { total: number; withClickId: number; clickIdRate: number };
    eventsInPeriod: number; pixelAgeDays?: number;
  };
  attribution?: {
    byModel: Array<{ model: string; ordersAttributed: number; revenue: number }>;
    bySource: Array<{ source: string; orders: number; revenue: number; percentage: number }>;
    conversionLag: Array<{ bucket: string; orders: number; revenue: number }>;
  };
  deviceBreakdown?: Array<{ deviceType: string; count: number; percentage: number }>;
  popularPages?: Array<{ pageUrl: string; views: number }>;
  perDayCoverage?: Array<{ day: string; totalOrders: number; attributedOrders: number; coverage: number }>;
  meta: { dateFrom: string; dateTo: string; daysInPeriod: number; nitroWeights?: { first: number; middle: number; last: number } };
}

interface DiscrepancyData {
  summary: {
    totalPixelRevenue: number; totalPlatformRevenue: number; totalSpend: number;
    totalDelta: number; totalDeltaPercent: number;
    pixelRoas: number; platformRoas: number;
    attributionCoverage: number; totalOrders: number; attributedOrders: number;
    verdict: string;
  };
  bySource: Array<{
    source: string; pixelRevenue: number; pixelOrders: number;
    platformRevenue: number; platformConversions: number; spend: number;
    delta: number; deltaPercent: number;
    pixelRoas: number; platformRoas: number;
    verdict: string;
  }>;
  byCampaign: Array<{
    campaign: string; source: string;
    pixelRevenue: number; pixelOrders: number;
    platformRevenue: number; spend: number;
    delta: number; deltaPercent: number;
    pixelRoas: number; platformRoas: number;
  }>;
  dailyTrend: Array<{ day: string; pixelRevenue: number; platformRevenue: number; spend: number; delta: number }>;
}

// NitroScoreData type removed — NitroScore lives in /pixel

// ── Count-up hook ──
function useCountUp(target: number, duration = 800): number {
  const [current, setCurrent] = useState(0);
  const prevTarget = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = prevTarget.current;
    const to = target;
    prevTarget.current = to;
    if (from === to) { setCurrent(to); return; }

    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 4); // easeOutQuart

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setCurrent(from + (to - from) * ease(progress));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };

    // Respect prefers-reduced-motion
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCurrent(to);
      return;
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return current;
}

// ── Truth Score color logic ──
function truthScoreColor(pixelRev: number, platformRev: number): { color: string; bg: string; label: string } {
  if (!platformRev || platformRev === 0) return { color: "text-gray-500", bg: "bg-gray-100", label: "N/A" };
  const ratio = (pixelRev / platformRev) * 100;
  if (ratio >= 90 && ratio <= 110) return { color: "text-emerald-700", bg: "bg-emerald-50", label: `${Math.round(ratio)}%` };
  if (ratio >= 70 && ratio <= 130) return { color: "text-amber-700", bg: "bg-amber-50", label: `${Math.round(ratio)}%` };
  return { color: "text-red-700", bg: "bg-red-50", label: `${Math.round(ratio)}%` };
}

// ══════════════════════════════════════════════════════════════
// CARD SHELL — shared styling for all cards
// ══════════════════════════════════════════════════════════════
const cardStyle = "bg-white rounded-2xl border border-gray-100 transition-all duration-[280ms]";
const cardShadow = { boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.12), 0 22px 40px -28px rgba(15,23,42,0.10)" };

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function AnalyticsPage() {
  // Data states
  const [pixelData, setPixelData] = useState<PixelData | null>(null);
  const [discrepancy, setDiscrepancy] = useState<DiscrepancyData | null>(null);
  // NitroScore removed — belongs in /pixel, not analytics
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date range
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(Date.now() - 7 * MS_PER_DAY);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(7);

  // UI states
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [expandedJourney, setExpandedJourney] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<"truth" | "channels">("truth");

  // Refetch indicator
  const [isRefetching, setIsRefetching] = useState(false);

  // ── Fetch all data in parallel ──
  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefetching(true);
    setError(null);

    try {
      const [pixelRes, discRes] = await Promise.all([
        fetch(`/api/metrics/pixel?from=${dateFrom}&to=${dateTo}&model=NITRO`),
        fetch(`/api/metrics/pixel/discrepancy?from=${dateFrom}&to=${dateTo}&model=NITRO`),
      ]);

      if (!pixelRes.ok) throw new Error(`Pixel: HTTP ${pixelRes.status}`);

      const [pixelJson, discJson] = await Promise.all([
        pixelRes.json(),
        discRes.ok ? discRes.json() : null,
      ]);

      setPixelData(pixelJson);
      setDiscrepancy(discJson);
    } catch (e: any) {
      setError(e.message || "Error cargando datos");
    } finally {
      setLoading(false);
      setIsRefetching(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Count-up values ──
  const revCountUp = useCountUp(pixelData?.businessKpis?.pixelRevenue || 0);
  const roasCountUp = useCountUp(pixelData?.businessKpis?.pixelRoas || 0, 600);
  const ordersCountUp = useCountUp(pixelData?.businessKpis?.ordersAttributed || 0, 600);
  const attrRateCountUp = useCountUp(pixelData?.businessKpis?.attributionRate || 0, 600);

  // ── Loading state ──
  if (loading && !pixelData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white via-[#fbfbfd] to-[#f4f5f8] p-6">
        <div className="max-w-[1440px] mx-auto space-y-6">
          {/* Skeleton header */}
          <div className="h-10 bg-gray-100 rounded-xl w-72 animate-pulse" />
          {/* Skeleton KPI cards */}
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`${cardStyle} p-6 h-32 animate-pulse`} style={{ ...cardShadow, animationDelay: `${i * 80}ms` }}>
                <div className="h-4 bg-gray-100 rounded w-24 mb-4" />
                <div className="h-8 bg-gray-100 rounded w-36" />
              </div>
            ))}
          </div>
          {/* Skeleton table */}
          <div className={`${cardStyle} p-6 h-64 animate-pulse`} style={cardShadow}>
            <div className="h-4 bg-gray-100 rounded w-48 mb-6" />
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-50 rounded mb-2" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error && !pixelData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white via-[#fbfbfd] to-[#f4f5f8] flex items-center justify-center">
        <div className={`${cardStyle} p-8 max-w-md text-center`} style={cardShadow}>
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-900 font-medium mb-1">Error cargando analytics</p>
          <p className="text-gray-500 text-sm mb-4">{error}</p>
          <button onClick={() => fetchAll()} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const bk = pixelData?.businessKpis;
  const channels = pixelData?.channelRoas || [];
  const funnel = pixelData?.funnel;
  const journeys = pixelData?.recentJourneys || [];
  const dailyTrend = discrepancy?.dailyTrend || [];
  const dailyChannels = pixelData?.dailyChannelBreakdown || [];

  // All unique channel sources for stacked bar
  const allSources = Array.from(new Set(dailyChannels.flatMap(d => d.channels.map(c => c.source))));

  // Channel roles from backend (computed over ALL journeys in period, not just recent 15)
  const channelRolesRaw = pixelData?.channelRoles || [];
  const channelRoles: Record<string, { first: number; assist: number; last: number; total: number }> = {};
  for (const cr of channelRolesRaw) {
    channelRoles[cr.source] = {
      first: cr.firstTouch + cr.soloTouch, // solo touches count as first+last
      assist: cr.assistTouch,
      last: cr.lastTouch + cr.soloTouch,
      total: cr.firstTouch + cr.assistTouch + cr.lastTouch + cr.soloTouch,
    };
  }
  const totalJourneys = Object.values(channelRoles).reduce((s, r) => s + r.first, 0) || 1;

  return (
    <div className={`min-h-screen bg-gradient-to-b from-white via-[#fbfbfd] to-[#f4f5f8] ${isRefetching ? "pixel-refetching" : ""}`}>
      <style>{`
        .pixel-refetching { position: relative; }
        .pixel-refetching::after {
          content: ''; position: absolute; inset: 0; z-index: 50; pointer-events: none;
          background: linear-gradient(90deg, transparent 25%, rgba(6,182,212,0.04) 50%, transparent 75%);
          background-size: 400% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
        }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          .pixel-refetching::after { animation: none; }
          .stagger-card { animation: none !important; opacity: 1 !important; }
        }
        .stagger-card { animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
      `}</style>

      <div className="max-w-[1440px] mx-auto px-6 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Analytics</h1>
              <p className="text-xs text-gray-500 mt-0.5">Powered by NitroPixel — datos propios, sin intermediarios</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Live indicator */}
            {pixelData?.liveStatus?.status === "LIVE" && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[11px] font-medium text-emerald-700">Pixel activo</span>
              </div>
            )}
            <DateRangeFilter
              dateFrom={dateFrom} dateTo={dateTo}
              onDateChange={(type, value) => {
                if (type === "from") setDateFrom(value);
                else setDateTo(value);
                setActiveQuickRange(null);
              }}
              quickRanges={[
                { label: "7 días", days: 7 },
                { label: "14 días", days: 14 },
                { label: "30 días", days: 30 },
              ]}
              activeQuickRange={activeQuickRange}
              onQuickRange={(days) => {
                setActiveQuickRange(days);
                const to = new Date(); const from = new Date(Date.now() - days * MS_PER_DAY);
                setDateFrom(from.toISOString().slice(0, 10));
                setDateTo(to.toISOString().slice(0, 10));
              }}
            />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ZONA 1 — KPI Strip                                     */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Revenue Atribuido", value: fmtCompact(revCountUp),
              detail: bk ? `${fmt(bk.ordersAttributed)} de ${fmt(bk.webOrders)} órdenes web` : "",
              change: bk?.changes?.pixelRevenue || 0,
              icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>),
              gradient: "from-cyan-500 to-blue-600",
            },
            {
              label: "ROAS Real", value: `${roasCountUp.toFixed(1)}x`,
              detail: `Spend: ${fmtCompact(bk?.totalAdSpend || 0)}`,
              change: bk?.changes?.pixelRoas || 0,
              icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"/></svg>),
              gradient: "from-violet-500 to-purple-600",
            },
            {
              label: "Ordenes Atribuidas", value: fmt(Math.round(ordersCountUp)),
              detail: bk ? `Ticket promedio: ${fmtCompact(bk.aov || 0)}` : "",
              change: bk?.changes?.ordersAttributed || 0,
              icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg>),
              gradient: "from-emerald-500 to-teal-600",
            },
            {
              label: "Tasa de Atribución", value: `${attrRateCountUp.toFixed(0)}%`,
              detail: `${fmt(pixelData?.pixelHealth?.eventsInPeriod || 0)} eventos capturados`,
              change: 0,
              icon: (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z"/></svg>),
              gradient: "from-orange-500 to-amber-600",
            },
          ].map((kpi, i) => (
            <div
              key={kpi.label}
              className={`${cardStyle} p-5 stagger-card group hover:scale-[1.02] hover:shadow-lg`}
              style={{ ...cardShadow, animationDelay: `${i * 70}ms` }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{kpi.label}</span>
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${kpi.gradient} flex items-center justify-center text-white opacity-80 group-hover:opacity-100 transition-opacity`}>
                  {kpi.icon}
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900 tracking-tight">{kpi.value}</div>
              <div className="flex items-center gap-2 mt-1.5">
                {kpi.change !== 0 && (
                  <span className={`text-xs font-semibold ${pctColor(kpi.change)}`}>{pctBadge(kpi.change)}</span>
                )}
                <span className="text-[11px] text-gray-400">{kpi.detail}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ZONA 2 — Channel Truth Table                           */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className={`${cardStyle} stagger-card`} style={{ ...cardShadow, animationDelay: "300ms" }}>
          {/* Header row: title + verdict */}
          <div className="px-6 pt-4 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Canales — Truth Score</h2>
              <InfoTip text="El Truth Score compara lo que el pixel midió vs lo que la plataforma reporta. 100% = alineados. Menos de 90% = la plataforma sobre-reporta. Más de 110% = sub-reporta." />
            </div>
            {discrepancy?.summary && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Veredicto global:</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  discrepancy.summary.totalDeltaPercent < -10 ? "bg-red-50 text-red-700" :
                  discrepancy.summary.totalDeltaPercent > 10 ? "bg-amber-50 text-amber-700" :
                  "bg-emerald-50 text-emerald-700"
                }`}>
                  {discrepancy.summary.totalDeltaPercent < 0
                    ? `Plataformas sobre-reportan ${Math.abs(Math.round(discrepancy.summary.totalDeltaPercent))}%`
                    : discrepancy.summary.totalDeltaPercent > 10
                    ? `Plataformas sub-reportan ${Math.round(discrepancy.summary.totalDeltaPercent)}%`
                    : "Alineados"
                  }
                </span>
              </div>
            )}
          </div>

          {/* Attribution model indicator (read-only — configured in /pixel) */}
          {(() => {
            const w = pixelData?.meta?.nitroWeights ?? null;
            const wFirst = w?.first ?? 30;
            const wMiddle = w?.middle ?? 30;
            const wLast = w?.last ?? 40;
            return (
              <div className="px-6 pb-3 border-b border-gray-50 flex items-center gap-3">
                <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Atribución:</span>
                <div className="relative group/attr">
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 cursor-default">
                    <span className="text-[11px] font-semibold text-gray-700">NitroAttribution</span>
                    <div className="flex items-center gap-0.5 h-2.5 w-20 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-l-full" style={{ width: `${wFirst}%` }} />
                      <div className="h-full bg-violet-400" style={{ width: `${wMiddle}%` }} />
                      <div className="h-full bg-orange-400 rounded-r-full" style={{ width: `${wLast}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-400">{wFirst}/{wMiddle}/{wLast}</span>
                  </div>
                  {/* Tooltip explaining the model */}
                  <div className="absolute top-full left-0 mt-2 w-64 px-3 py-2.5 bg-gray-900 text-white text-[11px] leading-relaxed rounded-lg opacity-0 pointer-events-none group-hover/attr:opacity-100 transition-opacity duration-200 z-50 shadow-lg">
                    <div className="absolute bottom-full left-4 border-4 border-transparent border-b-gray-900" />
                    <div className="font-semibold mb-1">Modelo multi-touch ponderado</div>
                    <div className="space-y-0.5 text-gray-300">
                      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" /> Primer toque: {wFirst}%</div>
                      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-400 inline-block" /> Asistencias: {wMiddle}%</div>
                      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> Último toque: {wLast}%</div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-700 text-[10px] text-gray-400">
                      Estos pesos definen cómo se reparte el crédito de cada venta entre los canales del journey. Configuralo desde NitroPixel.
                    </div>
                  </div>
                </div>
                <a href="/pixel" className="text-[11px] text-gray-400 hover:text-gray-600 underline decoration-dotted underline-offset-2 transition-colors">
                  Cambiar ponderación
                </a>
              </div>
            );
          })()}

          {channels.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">No hay datos de canales para este período</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-400 uppercase tracking-wider border-b border-gray-50">
                  <th className="text-left px-6 py-3 font-medium">Canal</th>
                  <th className="text-right px-4 py-3 font-medium">Revenue Pixel</th>
                  <th className="text-right px-4 py-3 font-medium">Revenue Plataforma</th>
                  <th className="text-center px-4 py-3 font-medium">Truth Score</th>
                  <th className="text-right px-4 py-3 font-medium">Spend</th>
                  <th className="text-right px-4 py-3 font-medium">ROAS Real</th>
                  <th className="text-right px-4 py-3 font-medium">ROAS Plat.</th>
                  <th className="text-right px-6 py-3 font-medium">Órdenes</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch, idx) => {
                  const info = getSourceInfo(ch.source);
                  const ts = truthScoreColor(ch.pixelRevenue, ch.platformRevenue);
                  const isExpanded = expandedChannel === ch.source;
                  const campaignsForChannel = discrepancy?.byCampaign?.filter(c => c.source === ch.source) || [];

                  return (
                    <Fragment key={ch.source}>
                      <tr
                        className={`border-b border-gray-50 transition-colors duration-200 cursor-pointer hover:bg-gray-50/50 ${isExpanded ? "bg-gray-50/50" : ""}`}
                        onClick={() => setExpandedChannel(isExpanded ? null : ch.source)}
                      >
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: info.color }}>
                              <ChannelLogo source={ch.source} size={14} />
                            </div>
                            <span className="font-medium text-gray-900">{info.label}</span>
                            {/* Channel journey role tooltip */}
                            {channelRoles[ch.source] && (() => {
                              const r = channelRoles[ch.source];
                              const pFirst = Math.round((r.first / totalJourneys) * 100);
                              const pAssist = Math.round((r.assist / totalJourneys) * 100);
                              const pLast = Math.round((r.last / totalJourneys) * 100);
                              const dominantRole = r.first >= r.last && r.first >= r.assist ? "Descubrimiento"
                                : r.last >= r.first && r.last >= r.assist ? "Cierre"
                                : "Asistencia";
                              const roleColor = dominantRole === "Descubrimiento" ? "text-blue-500"
                                : dominantRole === "Cierre" ? "text-emerald-500" : "text-amber-500";
                              return (
                                <div className="relative group/role">
                                  <span className={`text-[10px] font-medium ${roleColor} bg-gray-50 px-1.5 py-0.5 rounded`}>
                                    {dominantRole}
                                  </span>
                                  <div className="absolute top-full left-0 mt-2 w-60 px-3 py-2.5 bg-gray-900 text-white text-[11px] leading-relaxed rounded-lg opacity-0 pointer-events-none group-hover/role:opacity-100 transition-opacity duration-200 z-50 shadow-lg">
                                    <div className="absolute bottom-full left-4 border-4 border-transparent border-b-gray-900" />
                                    <div className="font-semibold mb-1.5">Rol en los journeys</div>
                                    <div className="space-y-1">
                                      <div className="flex justify-between"><span>Primer toque:</span><span className="font-medium">{pFirst}% de journeys</span></div>
                                      <div className="flex justify-between"><span>Asistencia:</span><span className="font-medium">{pAssist}% de journeys</span></div>
                                      <div className="flex justify-between"><span>Último toque:</span><span className="font-medium">{pLast}% de journeys</span></div>
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-gray-700 text-[10px] text-gray-300">
                                      {dominantRole === "Descubrimiento"
                                        ? "Este canal trae usuarios nuevos. Si su Truth Score es bajo, puede ser porque warmea audiencias que convierten por otro canal."
                                        : dominantRole === "Cierre"
                                        ? "Este canal cierra ventas. Su Truth Score tiende a ser alto porque captura la última interacción."
                                        : "Este canal participa en el journey sin ser primero ni último. Contribuye a la conversión de forma indirecta."
                                      }
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                            {campaignsForChannel.length > 0 && (
                              <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </div>
                        </td>
                        <td className="text-right px-4 py-3.5 font-medium text-gray-900">{fmtCompact(ch.pixelRevenue)}</td>
                        <td className="text-right px-4 py-3.5 text-gray-500">{ch.platformRevenue ? fmtCompact(ch.platformRevenue) : "—"}</td>
                        <td className="text-center px-4 py-3.5">
                          {ch.platformRevenue ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ts.color} ${ts.bg}`}>
                              {ts.label}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="text-right px-4 py-3.5 text-gray-500">{ch.spend ? fmtCompact(ch.spend) : "—"}</td>
                        <td className="text-right px-4 py-3.5 font-semibold text-gray-900">{ch.pixelRoas ? `${ch.pixelRoas.toFixed(1)}x` : "—"}</td>
                        <td className="text-right px-4 py-3.5 text-gray-400">{ch.platformRoas ? `${ch.platformRoas.toFixed(1)}x` : "—"}</td>
                        <td className="text-right px-6 py-3.5 text-gray-600">{fmt(ch.orders)}</td>
                      </tr>

                      {/* Expanded campaign rows */}
                      {isExpanded && campaignsForChannel.length > 0 && campaignsForChannel.map((camp) => {
                        const campTs = truthScoreColor(camp.pixelRevenue, camp.platformRevenue);
                        return (
                          <tr key={camp.campaign} className="bg-gray-50/80 border-b border-gray-100/50 text-xs">
                            <td className="pl-16 pr-6 py-2.5 text-gray-600 truncate max-w-[200px]">{camp.campaign || "Sin campaña"}</td>
                            <td className="text-right px-4 py-2.5 text-gray-700">{fmtCompact(camp.pixelRevenue)}</td>
                            <td className="text-right px-4 py-2.5 text-gray-500">{camp.platformRevenue ? fmtCompact(camp.platformRevenue) : "—"}</td>
                            <td className="text-center px-4 py-2.5">
                              {camp.platformRevenue ? (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${campTs.color} ${campTs.bg}`}>
                                  {campTs.label}
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="text-right px-4 py-2.5 text-gray-500">{camp.spend ? fmtCompact(camp.spend) : "—"}</td>
                            <td className="text-right px-4 py-2.5 font-medium text-gray-700">{camp.pixelRoas ? `${camp.pixelRoas.toFixed(1)}x` : "—"}</td>
                            <td className="text-right px-4 py-2.5 text-gray-400">{camp.platformRoas ? `${camp.platformRoas.toFixed(1)}x` : "—"}</td>
                            <td className="text-right px-6 py-2.5 text-gray-500">{fmt(camp.pixelOrders)}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ZONA 2b — Channel Role Map                              */}
        {/* ═══════════════════════════════════════════════════════ */}
        {Object.keys(channelRoles).length > 0 && (() => {
          const totalFirst = Object.values(channelRoles).reduce((s, r) => s + r.first, 0) || 1;
          const totalAssist = Object.values(channelRoles).reduce((s, r) => s + r.assist, 0) || 1;
          const totalLast = Object.values(channelRoles).reduce((s, r) => s + r.last, 0) || 1;

          type RoleColumn = { key: string; title: string; subtitle: string; color: string; gradient: string; borderColor: string; getVal: (r: { first: number; assist: number; last: number }) => number; total: number };
          const columns: RoleColumn[] = [
            { key: "first", title: "Descubrimiento", subtitle: "Primer toque", color: "#06b6d4", gradient: "from-cyan-50 to-cyan-100/50", borderColor: "border-cyan-200", getVal: (r) => r.first, total: totalFirst },
            { key: "assist", title: "Asistencia", subtitle: "Toques intermedios", color: "#8b5cf6", gradient: "from-violet-50 to-violet-100/50", borderColor: "border-violet-200", getVal: (r) => r.assist, total: totalAssist },
            { key: "last", title: "Cierre", subtitle: "Último toque", color: "#f97316", gradient: "from-orange-50 to-orange-100/50", borderColor: "border-orange-200", getVal: (r) => r.last, total: totalLast },
          ];

          return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 stagger-card" style={{ animationDelay: "340ms" }}>
              {columns.map((col) => {
                const entries = Object.entries(channelRoles)
                  .map(([src, r]) => ({ src, value: col.getVal(r), pct: Math.round((col.getVal(r) / col.total) * 100) }))
                  .filter((e) => e.value > 0)
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 6);

                return (
                  <div key={col.key} className={`${cardStyle} p-5 relative`} style={cardShadow}>
                    {/* Top accent line */}
                    <div className="absolute top-0 left-6 right-6 h-0.5 rounded-full" style={{ backgroundColor: col.color }} />

                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-gray-900">{col.title}</h3>
                      <p className="text-[11px] text-gray-400 mt-0.5">{col.subtitle} — ¿Quién participa?</p>
                    </div>

                    <div className="space-y-2.5">
                      {entries.map((e, ei) => {
                        const info = getSourceInfo(e.src);
                        return (
                          <div key={e.src} className="flex items-center gap-3">
                            {/* Rank */}
                            <span className="text-[10px] font-bold text-gray-300 w-3 text-right">{ei + 1}</span>
                            {/* Logo */}
                            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: info.color }}>
                              <ChannelLogo source={e.src} size={13} />
                            </div>
                            {/* Name + bar */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-gray-700 truncate">{info.label}</span>
                                <span className="text-xs font-bold tabular-nums" style={{ color: col.color }}>{e.pct}%</span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{ width: `${e.pct}%`, backgroundColor: col.color, opacity: 0.7 + (0.3 * (1 - ei / Math.max(entries.length - 1, 1))) }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {entries.length === 0 && (
                        <div className="text-center text-gray-300 text-xs py-4">Sin datos</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ZONA 3 — Funnel + Customer Journeys                    */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Funnel — 3 cols */}
          <div className={`${cardStyle} lg:col-span-3 p-6 stagger-card`} style={{ ...cardShadow, animationDelay: "380ms" }}>
            <h2 className="text-sm font-semibold text-gray-900 mb-6">Funnel de Conversión</h2>
            {funnel ? (() => {
              const steps = [
                { label: "Visitas", value: funnel.pageView, color: "#06b6d4", gradient: "from-cyan-400 to-cyan-600" },
                { label: "Vio Producto", value: funnel.viewProduct, color: "#8b5cf6", gradient: "from-violet-400 to-violet-600" },
                { label: "Carrito", value: funnel.addToCart, color: "#f97316", gradient: "from-orange-400 to-orange-600" },
                { label: "Checkout", value: funnel.checkoutStart, color: "#eab308", gradient: "from-yellow-400 to-yellow-600" },
                { label: "Compra", value: funnel.purchase, color: "#22c55e", gradient: "from-emerald-400 to-emerald-600" },
              ];
              const firstVal = steps[0].value || 1;

              return (
                <div className="space-y-0">
                  {steps.map((step, i) => {
                    // Static narrowing: each step is ~15% narrower regardless of data
                    const STATIC_WIDTHS = [100, 84, 68, 52, 38];
                    const widthPct = STATIC_WIDTHS[i] ?? 38;
                    const prevStepRate = i > 0 && steps[i - 1].value > 0
                      ? ((step.value / steps[i - 1].value) * 100).toFixed(1)
                      : null;
                    const globalRate = i > 0
                      ? ((step.value / firstVal) * 100).toFixed(2)
                      : null;

                    return (
                      <div key={step.label}>
                        {/* Conversion arrow between steps */}
                        {i > 0 && (
                          <div className="flex items-center justify-center h-6 relative">
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] font-semibold" style={{ color: step.color }}>
                                {prevStepRate}%
                              </span>
                              <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                              </svg>
                            </div>
                          </div>
                        )}

                        {/* Funnel bar — centered trapezoid shape */}
                        <div className="flex justify-center">
                          <div
                            className="relative rounded-xl overflow-hidden transition-all duration-700 group/step cursor-default"
                            style={{
                              width: `${widthPct}%`,
                              height: 52,
                            }}
                          >
                            {/* Gradient background */}
                            <div className={`absolute inset-0 bg-gradient-to-r ${step.gradient} opacity-90 group-hover/step:opacity-100 transition-opacity`} />

                            {/* Content overlay */}
                            <div className="relative h-full flex items-center justify-between px-4">
                              <div className="flex items-center gap-2">
                                <span className="text-white text-sm font-semibold">{step.label}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-white text-lg font-bold tracking-tight">{fmt(step.value)}</span>
                                {globalRate && (
                                  <span className="text-white/60 text-[11px] font-medium">
                                    {globalRate}% del total
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })() : (
              <div className="text-center text-gray-400 text-sm py-8">Sin datos de funnel</div>
            )}
          </div>

          {/* Customer Journeys — 2 cols */}
          <div className={`${cardStyle} lg:col-span-2 p-6 stagger-card overflow-hidden`} style={{ ...cardShadow, animationDelay: "440ms" }}>
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Últimos Customer Journeys</h2>
            {journeys.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-8">Sin journeys en este período</div>
            ) : (
              <div className="space-y-2.5">
                {journeys.slice(0, 10).map((j) => {
                  const isOpen = expandedJourney === j.orderId;
                  return (
                    <div key={j.orderId} className="group">
                      <button
                        className="w-full flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                        onClick={() => setExpandedJourney(isOpen ? null : j.orderId)}
                      >
                        {/* Touchpoint dots */}
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {j.touchpoints.slice(0, 6).map((tp, ti) => {
                            const tpInfo = getSourceInfo(tp.source || "direct");
                            return (
                              <div key={ti} className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: tpInfo.color }}>
                                <ChannelLogo source={tp.source} size={10} />
                              </div>
                            );
                          })}
                          {j.touchpoints.length > 6 && (
                            <span className="text-[10px] text-gray-400 ml-1">+{j.touchpoints.length - 6}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-gray-700 truncate block">
                            {j.orderExternalId || j.orderId.slice(0, 8)}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-gray-900 flex-shrink-0">{fmtCompact(j.revenue)}</span>
                        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isOpen && (
                        <div className="pl-6 pr-3 pb-3 pt-1 space-y-1.5">
                          {j.touchpoints.map((tp, ti) => {
                            const tpInfo = getSourceInfo(tp.source || "direct");
                            return (
                              <div key={ti} className="flex items-center gap-2 text-[11px]">
                                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: tpInfo.color }}>
                                  <ChannelLogo source={tp.source} size={8} />
                                </div>
                                <span className="text-gray-600 font-medium">{tpInfo.label}</span>
                                {tp.campaign && <span className="text-gray-400 truncate max-w-[120px]">{tp.campaign}</span>}
                                {tp.timestamp && (
                                  <span className="text-gray-300 ml-auto flex-shrink-0">
                                    {new Date(tp.timestamp).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {j.conversionLag > 0 && (
                            <div className="text-[10px] text-gray-400 pt-1 border-t border-gray-100">
                              {j.conversionLag} día{j.conversionLag !== 1 ? "s" : ""} entre primer contacto y compra
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ZONA 4 — Revenue Intelligence                          */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className={`${cardStyle} p-6 stagger-card`} style={{ ...cardShadow, animationDelay: "500ms" }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-gray-900">Revenue Intelligence</h2>
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              {[
                { key: "truth" as const, label: "Pixel vs Plataformas" },
                { key: "channels" as const, label: "Por Canal" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                    chartMode === tab.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                  onClick={() => setChartMode(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-72">
            {chartMode === "truth" ? (
              dailyTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dailyTrend} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="pixelGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="platGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => new Date(v).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })} />
                    <YAxis yAxisId="rev" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtCompact(v)} />
                    <YAxis yAxisId="spend" orientation="right" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtCompact(v)} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
                      formatter={(value: number, name: string) => [fmtARS(value), name === "pixelRevenue" ? "Pixel" : name === "platformRevenue" ? "Plataformas" : "Spend"]}
                      labelFormatter={(v) => new Date(v).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}
                    />
                    <Area yAxisId="rev" type="monotone" dataKey="pixelRevenue" fill="url(#pixelGrad)" stroke="#06b6d4" strokeWidth={2.5} name="pixelRevenue" />
                    <Area yAxisId="rev" type="monotone" dataKey="platformRevenue" fill="url(#platGrad)" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="6 3" name="platformRevenue" />
                    <Line yAxisId="spend" type="monotone" dataKey="spend" stroke="#f97316" strokeWidth={1.5} dot={false} name="spend" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">Sin datos de comparación para este período</div>
              )
            ) : (
              dailyChannels.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChannels.map(d => {
                    const row: any = { day: d.day };
                    d.channels.forEach(ch => { row[ch.source] = ch.revenue; });
                    return row;
                  })} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => new Date(v).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtCompact(v)} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
                      formatter={(value: number, name: string) => [fmtARS(value), getSourceInfo(name).label]}
                      labelFormatter={(v) => new Date(v).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}
                    />
                    {allSources.map((src, i) => (
                      <Bar key={src} dataKey={src} stackId="revenue" fill={getSourceInfo(src).color} radius={i === allSources.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">Sin datos de canales diarios</div>
              )
            )}
          </div>

          {/* Chart legend */}
          {chartMode === "truth" && (
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-cyan-500" /><span className="text-[11px] text-gray-500">Pixel (real)</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-violet-500" style={{ borderBottom: "1px dashed #8b5cf6" }} /><span className="text-[11px] text-gray-500">Plataformas (reportado)</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-orange-500" /><span className="text-[11px] text-gray-500">Ad Spend</span></div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ZONA 5 — Conversion Speed                              */}
        {/* ═══════════════════════════════════════════════════════ */}
        {(() => {
          try {
          const lagData = (pixelData?.attribution?.conversionLag || []).map(d => ({
            bucket: d.bucket || "unknown",
            orders: Number(d.orders) || 0,
            revenue: Number(d.revenue) || 0,
          }));
          if (lagData.length === 0) return null;

          const totalOrders = lagData.reduce((s, d) => s + d.orders, 0) || 1;
          const maxOrders = lagData.length > 0 ? Math.max(...lagData.map(d => d.orders)) : 1;
          // Find dominant bucket for insight
          const dominant = lagData.reduce((a, b) => b.orders > a.orders ? b : a, lagData[0]);
          const dominantPct = Math.round((dominant.orders / totalOrders) * 100);
          // Cumulative: what % converts within 3 days?
          const FAST_BUCKETS = ["Mismo día", "1-3 días"];
          const fastOrders = lagData.filter(d => FAST_BUCKETS.includes(d.bucket)).reduce((s, d) => s + d.orders, 0);
          const fastPct = Math.round((fastOrders / totalOrders) * 100);

          const LAG_COLORS = ["#06b6d4", "#22d3ee", "#67e8f9", "#a5f3fc", "#cffafe", "#e0f2fe"];

          return (
            <div className={`${cardStyle} p-6 stagger-card`} style={{ ...cardShadow, animationDelay: "560ms" }}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Velocidad de Conversión</h2>
                  <p className="text-[11px] text-gray-400 mt-0.5">¿Cuánto tardan tus clientes en comprar después del primer contacto?</p>
                </div>
                <InfoTip text="El conversion lag mide los días entre el primer touchpoint del pixel y la compra. Menor lag = journey más directo." />
              </div>

              <div className="space-y-2.5">
                {lagData.filter(d => d.bucket !== "unknown").map((d, i) => {
                  const pct = Math.round((d.orders / totalOrders) * 100);
                  const barWidth = maxOrders > 0 ? Math.max(4, (d.orders / maxOrders) * 100) : 0;
                  const isDominant = d.bucket === dominant.bucket;
                  return (
                    <div key={d.bucket} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-20 text-right flex-shrink-0">{d.bucket}</span>
                      <div className="flex-1 h-7 bg-gray-50 rounded-lg overflow-hidden relative">
                        <div
                          className="h-full rounded-lg transition-all duration-700 flex items-center"
                          style={{ width: `${barWidth}%`, backgroundColor: LAG_COLORS[i] || LAG_COLORS[5], opacity: isDominant ? 1 : 0.7 }}
                        >
                          {barWidth > 20 && (
                            <span className="text-[11px] font-semibold text-gray-700 ml-2.5">{pct}%</span>
                          )}
                        </div>
                        {barWidth <= 20 && (
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-gray-400" style={{ left: `calc(${barWidth}% + 8px)` }}>{pct}%</span>
                        )}
                      </div>
                      <div className="flex-shrink-0 w-28 text-right">
                        <span className="text-xs font-medium text-gray-700">{fmt(d.orders)} ord.</span>
                        <span className="text-[10px] text-gray-400 ml-1.5">{fmtCompact(d.revenue)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Auto-insight */}
              <div className="mt-4 bg-gradient-to-r from-cyan-50/80 to-transparent p-3 rounded-xl">
                <p className="text-xs text-gray-600">
                  <span className="font-semibold text-cyan-700">Insight:</span>{" "}
                  {fastPct >= 70
                    ? `${fastPct}% de tus ventas ocurren dentro de 3 días. Tu ecommerce tiene un ciclo de compra rápido — optimizá remarketing para esa ventana.`
                    : fastPct >= 40
                    ? `${fastPct}% convierte en 3 días, pero ${100 - fastPct}% necesita más tiempo. Considerá nurturing con email flows para los que tardan más.`
                    : `Solo ${fastPct}% convierte en 3 días — tu producto requiere decisión larga. Invertí en contenido educativo y secuencias de remarketing extendidas.`
                  }
                </p>
              </div>
            </div>
          );
          } catch { return null; }
        })()}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ZONA 6 — Devices & Top Pages                           */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Device Breakdown — 3 cols */}
          <div className={`${cardStyle} lg:col-span-3 p-6 stagger-card`} style={{ ...cardShadow, animationDelay: "620ms" }}>
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Dispositivos</h2>
            {(() => {
              try {
              // API returns "device" field, normalize to "deviceType"
              const rawDevices = pixelData?.deviceBreakdown || [];
              const devices = rawDevices.map((d: any) => ({
                deviceType: d.deviceType || d.device || "unknown",
                count: Number(d.count) || 0,
                percentage: Number(d.percentage) || 0,
              }));
              if (devices.length === 0) return <div className="text-center text-gray-400 text-sm py-8">Sin datos de dispositivos</div>;

              const totalCount = devices.reduce((s, d) => s + d.count, 0);
              const DEVICE_COLORS: Record<string, string> = { mobile: "#06b6d4", desktop: "#8b5cf6", tablet: "#f97316" };
              const DEVICE_ICONS: Record<string, string> = { mobile: "📱", desktop: "💻", tablet: "📟" };
              const DEVICE_LABELS: Record<string, string> = { mobile: "Mobile", desktop: "Desktop", tablet: "Tablet" };

              const pieData = devices.map(d => ({
                name: DEVICE_LABELS[d.deviceType] || d.deviceType,
                value: d.count,
                fill: DEVICE_COLORS[d.deviceType] || "#94a3b8",
              }));

              return (
                <div className="flex items-center gap-8">
                  {/* Ring chart */}
                  <div className="flex-shrink-0 w-40 h-40 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%" cy="50%"
                          innerRadius={45} outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {pieData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-bold text-gray-900">{fmt(totalCount)}</span>
                      <span className="text-[10px] text-gray-400">sesiones</span>
                    </div>
                  </div>

                  {/* Device stats */}
                  <div className="flex-1 space-y-3">
                    {devices.map((d) => {
                      const color = DEVICE_COLORS[d.deviceType] || "#94a3b8";
                      return (
                        <div key={d.deviceType} className="flex items-center gap-3">
                          <span className="text-lg flex-shrink-0">{DEVICE_ICONS[d.deviceType] || "🖥️"}</span>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-gray-700">{DEVICE_LABELS[d.deviceType] || d.deviceType}</span>
                              <span className="text-xs font-bold" style={{ color }}>{d.percentage}%</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${d.percentage}%`, backgroundColor: color }} />
                            </div>
                          </div>
                          <span className="text-[11px] text-gray-400 flex-shrink-0 w-16 text-right">{fmt(d.count)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
              } catch { return <div className="text-center text-gray-400 text-sm py-8">Sin datos de dispositivos</div>; }
            })()}
          </div>

          {/* Top Landing Pages — 2 cols */}
          <div className={`${cardStyle} lg:col-span-2 p-6 stagger-card`} style={{ ...cardShadow, animationDelay: "680ms" }}>
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Top Páginas</h2>
            {(() => {
              try {
              // API returns {url, pageViews}, normalize to {pageUrl, views}
              const rawPages = (pixelData?.popularPages || []).map((p: any) => ({
                pageUrl: p.pageUrl || p.url || "",
                views: Number(p.views ?? p.pageViews) || 0,
              }));
              if (rawPages.length === 0) return <div className="text-center text-gray-400 text-sm py-8">Sin datos de páginas</div>;

              const simplifyUrl = (url: string) => {
                try {
                  const parsed = new URL(url);
                  const path = decodeURIComponent(parsed.pathname);
                  if (path === "/" || path === "") return "Home";
                  const clean = path.replace(/^\//, "").replace(/\/$/, "");
                  // Keep first meaningful segment, prettify slug
                  const segments = clean.split("/").filter(Boolean);
                  const label = segments.slice(0, 2).join(" / ");
                  // Convert slugs: "bebes-y-primera-infancia" → "Bebes y Primera Infancia"
                  return label.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                } catch {
                  const clean = decodeURIComponent(url).replace(/https?:\/\/[^/]+/, "").replace(/^\//, "").replace(/\?.*$/, "");
                  return clean.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "Home";
                }
              };

              // Aggregate by simplified URL (different query params/trailing slashes → same page)
              const grouped = new Map<string, { label: string; views: number; rawUrl: string }>();
              for (const p of rawPages) {
                const label = simplifyUrl(p.pageUrl);
                const existing = grouped.get(label);
                if (existing) {
                  existing.views += p.views;
                } else {
                  grouped.set(label, { label, views: p.views, rawUrl: p.pageUrl });
                }
              }
              const pages = Array.from(grouped.values())
                .sort((a, b) => b.views - a.views)
                .slice(0, 6);

              const maxViews = pages.length > 0 ? Math.max(...pages.map(p => p.views)) : 1;

              return (
                <div className="space-y-2">
                  {pages.map((p, i) => {
                    const barW = maxViews > 0 ? Math.max(8, (p.views / maxViews) * 100) : 0;
                    return (
                      <div key={p.label} className="flex items-center gap-2.5">
                        <span className="text-[10px] font-bold text-gray-300 w-3 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs text-gray-700 truncate font-medium" title={p.rawUrl}>{p.label}</span>
                            <span className="text-xs font-semibold text-gray-900 flex-shrink-0 ml-2">{fmt(p.views)}</span>
                          </div>
                          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-violet-400 transition-all duration-700" style={{ width: `${barW}%`, opacity: 1 - i * 0.12 }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
              } catch { return <div className="text-center text-gray-400 text-sm py-8">Sin datos de páginas</div>; }
            })()}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ZONA 7 — Pixel Coverage Timeline                       */}
        {/* ═══════════════════════════════════════════════════════ */}
        {(() => {
          try {
          const coverage = (pixelData?.perDayCoverage || []).map(d => ({
            day: d.day || "",
            totalOrders: Number(d.totalOrders) || 0,
            attributedOrders: Number(d.attributedOrders) || 0,
            coverage: Number(d.coverage) || 0,
          }));
          if (coverage.length === 0) return null;

          const avgCoverage = Math.round(coverage.reduce((s, d) => s + d.coverage, 0) / coverage.length);
          // Find drops
          const drops = coverage.filter(d => d.coverage < 50 && d.totalOrders > 0);
          const worstDay = drops.length > 0 ? drops.reduce((a, b) => a.coverage < b.coverage ? a : b) : null;

          return (
            <div className={`${cardStyle} p-6 stagger-card`} style={{ ...cardShadow, animationDelay: "740ms" }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Cobertura del Pixel</h2>
                  <p className="text-[11px] text-gray-400 mt-0.5">% de órdenes con atribución por día — muestra la salud del tracking</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Promedio:</span>
                  <span className={`text-sm font-bold ${avgCoverage >= 80 ? "text-emerald-600" : avgCoverage >= 50 ? "text-amber-600" : "text-red-600"}`}>
                    {avgCoverage}%
                  </span>
                </div>
              </div>

              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={coverage} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="coverageGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => new Date(v).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
                      formatter={(value: number, name: string) => {
                        if (name === "coverage") return [`${value}%`, "Cobertura"];
                        return [value, name];
                      }}
                      labelFormatter={(v) => new Date(v).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}
                    />
                    <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.5} />
                    <Area type="monotone" dataKey="coverage" fill="url(#coverageGrad)" stroke="#22c55e" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Coverage insight */}
              {worstDay && (
                <div className="mt-3 bg-gradient-to-r from-amber-50/80 to-transparent p-3 rounded-xl">
                  <p className="text-xs text-gray-600">
                    <span className="font-semibold text-amber-700">Alerta:</span>{" "}
                    El {new Date(worstDay.day).toLocaleDateString("es-AR", { day: "numeric", month: "short" })} la cobertura cayó a {worstDay.coverage}% ({worstDay.attributedOrders} de {worstDay.totalOrders} órdenes atribuidas). Posible issue técnico con el pixel ese día.
                  </p>
                </div>
              )}

              {/* Legend */}
              <div className="flex items-center justify-center gap-6 mt-3">
                <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-emerald-500" /><span className="text-[11px] text-gray-500">Cobertura real</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 border-b border-dashed border-emerald-400" style={{ width: 12 }} /><span className="text-[11px] text-gray-500">Meta 80%</span></div>
              </div>
            </div>
          );
          } catch { return null; }
        })()}

        {/* Footer tagline */}
        <div className="text-center py-4">
          <p className="text-[11px] text-gray-300">
            NitroPixel Analytics — Datos propios. Sin intermediarios. La verdad de tu negocio.
          </p>
        </div>
      </div>
    </div>
  );
}
