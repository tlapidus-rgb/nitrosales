"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { DateRangeFilter } from "@/components/dashboard";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

// ══════════════════════════════════════════════════════════════
// NitroPixel — Atribución · Dark Premium
// ══════════════════════════════════════════════════════════════
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
  v > 0 ? `+${v}%` : v < 0 ? `${v}%` : "0%";

const MODEL_LABELS: Record<string, string> = {
  LAST_CLICK: "Last Click",
  FIRST_CLICK: "First Click",
  LINEAR: "Linear",
  NITRO: "Nitro",
  CUSTOM: "Precisión",
};
const MODEL_DESCRIPTIONS: Record<string, string> = {
  LAST_CLICK: "100% del crédito al último canal antes de la compra",
  FIRST_CLICK: "100% del crédito al primer canal que trajo al cliente",
  LINEAR: "El crédito se reparte en partes iguales entre todos los canales",
  NITRO: "El modelo Nitro pondera el crédito según el rol de cada canal. El último contacto recibe la mayor parte, el primero la segunda, y los intermedios comparten el resto.",
  CUSTOM: "Definí tus propios pesos de atribución. Control total sobre cómo se distribuye el crédito entre canales.",
};
const MODEL_ORDER = ["NITRO", "LAST_CLICK", "FIRST_CLICK", "LINEAR", "CUSTOM"];
const DEFAULT_NITRO_WEIGHTS = { first: 30, last: 40, middle: 30 };

// S60 EXT-2 BIS+++++: paleta expandida con color UNICO por canal.
// Antes 5 canales (adwords, google_organic, tv, omnichannel, perfil) caian
// al fallback gris #6B7280 y se confundian visualmente en el Hero Bar.
// Ahora cada canal tiene un color de marca distintivo + email/email-marketing
// con tonos distintos.
const SOURCE_ICONS: Record<string, { icon: string; color: string; label: string; svg?: string }> = {
  // ── Meta family ──
  meta: { icon: "M", color: "#1877F2", label: "Meta", svg: "meta" },
  facebook: { icon: "F", color: "#4267B2", label: "Facebook", svg: "facebook" },
  instagram: { icon: "I", color: "#E4405F", label: "Instagram", svg: "instagram" },
  // ── Google family ──
  google: { icon: "G", color: "#EA4335", label: "Google Ads", svg: "google" },
  adwords: { icon: "G", color: "#4285F4", label: "Google Ads", svg: "google" },
  google_organic: { icon: "G", color: "#34A853", label: "Google Orgánico", svg: "google" },
  "google-organic": { icon: "G", color: "#34A853", label: "Google Orgánico", svg: "google" },
  // ── Otros search/social ──
  bing: { icon: "B", color: "#008373", label: "Bing", svg: "bing" },
  tiktok: { icon: "T", color: "#69C9D0", label: "TikTok", svg: "tiktok" },
  youtube: { icon: "Y", color: "#FF0000", label: "YouTube", svg: "youtube" },
  linkedin: { icon: "L", color: "#0A66C2", label: "LinkedIn", svg: "linkedin" },
  twitter: { icon: "X", color: "#1DA1F2", label: "Twitter", svg: "twitter" },
  // ── Mensajeria ──
  whatsapp: { icon: "W", color: "#25D366", label: "WhatsApp", svg: "whatsapp" },
  // ── Email family (tonos distintos) ──
  email: { icon: "E", color: "#F59E0B", label: "Email", svg: "email" },
  "email-marketing": { icon: "E", color: "#D97706", label: "Email Marketing", svg: "email" },
  "vtex-abandoned-cart": { icon: "C", color: "#E85D04", label: "Carrito Abandonado", svg: "email" },
  "email-remarketing": { icon: "R", color: "#FB923C", label: "Email Remarketing", svg: "email" },
  // ── Tradicional / offline ──
  tv: { icon: "T", color: "#FBBF24", label: "TV", svg: "direct" },
  radio: { icon: "R", color: "#FACC15", label: "Radio", svg: "direct" },
  ooh: { icon: "O", color: "#EAB308", label: "Vía pública", svg: "direct" },
  podcast: { icon: "P", color: "#A78BFA", label: "Podcast", svg: "direct" },
  // ── Catch-all / agregados ──
  omnichannel: { icon: "O", color: "#14B8A6", label: "Omnichannel", svg: "direct" },
  perfil: { icon: "P", color: "#A855F7", label: "Perfil", svg: "direct" },
  direct: { icon: "D", color: "#22C55E", label: "Directo", svg: "direct" },
  organic: { icon: "O", color: "#8B5CF6", label: "Orgánico", svg: "organic" },
  referral: { icon: "R", color: "#EC4899", label: "Referido", svg: "referral" },
};

// Paleta de fallback determinista — si un canal no esta en SOURCE_ICONS,
// le asignamos un color basado en hash del nombre para que NO se repita
// con otros canales sin definicion. Mejor que el gris generico para todos.
const FALLBACK_PALETTE = ["#F87171", "#FB923C", "#FBBF24", "#A3E635", "#34D399", "#22D3EE", "#60A5FA", "#A78BFA", "#F472B6", "#94A3B8"];
function fallbackColor(source: string): string {
  let hash = 0;
  for (let i = 0; i < source.length; i++) hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}

// SVG logo paths for each channel — rendered as white icons inside colored circles
function ChannelLogo({ source, size = 14 }: { source?: string; size?: number }) {
  const s = (source || "").toLowerCase();
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "white", className: "flex-shrink-0" };
  switch (s) {
    case "meta":
    case "facebook":
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
      return <span className="font-bold text-white" style={{ fontSize: size * 0.7 }}>{(source || "?").charAt(0).toUpperCase()}</span>;
  }
}

function getSourceInfo(source: string) {
  const key = (source || "direct").toLowerCase();
  if (SOURCE_ICONS[key]) return SOURCE_ICONS[key];
  // Sin definicion explicita: color determinista por hash, label = source
  return { icon: key.charAt(0).toUpperCase(), color: fallbackColor(key), label: source };
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
    credits[touchpoints[count - 1]?.source || "direct"] = 100;
  } else if (model === "FIRST_CLICK") {
    credits[touchpoints[0]?.source || "direct"] = 100;
  } else if (model === "LINEAR") {
    const share = Math.round(100 / count);
    touchpoints.forEach((tp, i) => {
      const src = tp?.source || "direct";
      credits[src] = (credits[src] || 0) + (i === count - 1 ? 100 - share * (count - 1) : share);
    });
  } else {
    touchpoints.forEach((tp, i) => {
      const src = tp?.source || "direct";
      let pct: number;
      if (count === 1) { pct = 100; }
      else if (count === 2) {
        const total = weights.first + weights.last;
        pct = i === 0 ? Math.round((weights.first / total) * 100) : 100 - Math.round((weights.first / total) * 100);
      } else if (i === 0) { pct = weights.first; }
      else if (i === count - 1) { pct = weights.last; }
      else { pct = Math.round(weights.middle / Math.max(count - 2, 1)); }
      credits[src] = (credits[src] || 0) + pct;
    });
  }
  return Object.entries(credits).map(([source, pct]) => {
    const info = getSourceInfo(source);
    return { source, pct, label: info.label, color: info.color };
  });
}

// ── Count-up animation hook ──
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);
  useEffect(() => {
    const start = prevTarget.current;
    prevTarget.current = target;
    if (start === target) { setValue(target); return; }
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(start + (target - start) * eased);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return value;
}

// ── Clean URL for display ──
function cleanUrl(url?: string) {
  if (!url) return "";
  try {
    const u = new URL(url);
    const short = u.pathname + (u.search ? u.search.slice(0, 20) : "");
    return short.length > 60 ? short.slice(0, 57) + "…" : short;
  } catch { return url.slice(0, 60); }
}

// ── Types ──
interface PixelData {
  liveStatus: { status: "LIVE" | "ACTIVE" | "INACTIVE"; lastEventAt: string | null; totalEvents: number; lastHourEvents: number };
  kpis: { totalVisitors: number; totalSessions: number; totalPageViews: number; identifiedVisitors: number; cartVisitors: number; purchaseVisitors: number; pagesPerSession: number; daysInPeriod: number; changes: { visitors: number; sessions: number; pageViews: number } };
  businessKpis: { pixelRevenue: number; pixelRoas: number; ordersAttributed: number; attributionRate: number; aov: number; totalAdSpend: number; totalOrders: number; webOrders: number; webRevenue: number; marketplaceOrders: number; marketplaceRevenue: number; changes: { pixelRevenue: number; ordersAttributed: number; pixelRoas: number } };
  channelRoas: Array<{ source: string; orders: number; pixelRevenue: number; platformRevenue: number; spend: number; platformConversions: number; pixelRoas: number; platformRoas: number; diffPercent: number | null }>;
  funnel: { pageView: number; viewProduct: number; addToCart: number; checkoutStart: number; purchase: number };
  dailyVisitors: Array<{ day: string; visitors: number; sessions: number; pageViews: number }>;
  dailyRevenue: Array<{ day: string; revenue: number; orders: number; spend: number; roas: number }>;
  dailyChannelBreakdown: Array<{ day: string; totalRevenue: number; totalOrders: number; totalSpend: number; totalRoas: number; visitors: number; channels: Array<{ source: string; revenue: number; orders: number; spend: number; roas: number }> }>;
  recentJourneys: Array<{ orderId: string; orderExternalId: string; revenue: number; touchpointCount: number; conversionLag: number; touchpoints: Array<{ timestamp: string; source?: string; medium?: string; campaign?: string; clickType?: string; page?: string }>; orderDate: string; orderStatus: string; isAttributed?: boolean }>;
  pixelHealth: { attributionRate: number; clickCoverage: { total: number; withClickId: number; clickIdRate: number }; eventsInPeriod: number; pixelAgeDays?: number };
  deviceBreakdown: Array<{ device: string; count: number; percentage: number }>;
  eventTypes: Array<{ type: string; count: number; uniqueVisitors: number; percentage: number }>;
  popularPages: Array<{ url: string; pageViews: number; uniqueVisitors: number }>;
  attribution: { byModel: Array<{ model: string; ordersAttributed: number; revenue: number; avgValue: number; avgTouchpoints: number }>; bySource: Array<{ source: string; orders: number; revenue: number; percentage: number }>; byModelChannel?: Array<{ model: string; source: string; revenue: number }>; conversionLag: Array<{ bucket: string; orders: number; revenue: number }> };
  recentEvents: Array<{ id: string; type: string; visitorId: string; pageUrl: string | null; deviceType: string | null; timestamp: string; sessionId: string }>;
  pagination: { page: number; pageSize: number; totalCount: number; totalPages: number };
  meta: { dateFrom: string; dateTo: string; daysInPeriod: number; attributionModel?: string; nitroWeights?: { first: number; last: number; middle: number } };
}


// ══════════════════════════════════════════════════════════════
// DARK STYLES
// ══════════════════════════════════════════════════════════════
function DarkStyles() {
  return (
    <style>{`
      @keyframes attrBarGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      @keyframes attrFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes attrPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
      @keyframes attrGlow { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
      @keyframes attrShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      @keyframes attrHeartbeat { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
      @keyframes attrCountUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes attrGridDrift { 0% { background-position: 0 0; } 100% { background-position: 40px 40px; } }
      @keyframes attrJourneyDot { 0%, 100% { box-shadow: 0 0 0 0 currentColor; } 50% { box-shadow: 0 0 0 6px transparent; } }
      @keyframes pixelOrbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes pixelOrbitReverse { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
      @keyframes pixelNeuronPulse { 0%, 100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 1; transform: scale(1.6); } }
      @keyframes pixelSynapseFlow { 0% { stroke-dashoffset: 100; } 50% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -100; } }
      @keyframes pixelBreath { 0%, 100% { transform: scale(1); filter: brightness(1); } 50% { transform: scale(1.05); filter: brightness(1.2); } }
      .attr-refetching { position: relative; transition: opacity 0.4s ease; }
      .attr-refetching::after { content: ""; position: absolute; inset: 0; border-radius: inherit; z-index: 20; pointer-events: none; background: linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.06) 30%, rgba(6,182,212,0.12) 50%, rgba(6,182,212,0.06) 70%, transparent 100%); background-size: 200% 100%; animation: attrShimmer 1.8s ease-in-out infinite; }
      .attr-stagger > * { animation: attrFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
      .attr-stagger > *:nth-child(1) { animation-delay: 0ms; }
      .attr-stagger > *:nth-child(2) { animation-delay: 60ms; }
      .attr-stagger > *:nth-child(3) { animation-delay: 120ms; }
      .attr-stagger > *:nth-child(4) { animation-delay: 180ms; }
      .attr-stagger > *:nth-child(5) { animation-delay: 240ms; }
      .attr-stagger > *:nth-child(6) { animation-delay: 300ms; }
      .attr-stagger > *:nth-child(7) { animation-delay: 360ms; }
      .attr-stagger > *:nth-child(8) { animation-delay: 420ms; }
      .attr-glass { background: linear-gradient(160deg, rgba(15,23,42,0.85), rgba(8,12,24,0.95)); border: 1px solid rgba(6,182,212,0.12); }
      .attr-glass:hover { border-color: rgba(6,182,212,0.25); }
      .attr-grid-bg { background-image: linear-gradient(rgba(6,182,212,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.08) 1px, transparent 1px); background-size: 40px 40px; animation: attrGridDrift 60s linear infinite; }
      input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; }
      input[type="range"]::-moz-range-thumb { appearance: none; border: none; background: transparent; }
      .scrollbar-dark::-webkit-scrollbar { width: 4px; }
      .scrollbar-dark::-webkit-scrollbar-track { background: transparent; }
      .scrollbar-dark::-webkit-scrollbar-thumb { background: rgba(6,182,212,0.2); border-radius: 2px; }
    `}</style>
  );
}

// ── PixelBrain Mini — Animated logo from NitroPixel hero ──
function PixelBrainMini({ size = 32, color = "#06b6d4" }: { size?: number; color?: string }) {
  const neurons = useMemo(() => {
    const count = 8;
    const arr = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 90 + (i % 3) * 10;
      arr.push({ id: i, x: 150 + Math.cos(angle) * radius, y: 150 + Math.sin(angle) * radius, delay: (i * 120) % 2000 });
    }
    return arr;
  }, []);
  const synapses = useMemo(() => {
    const arr: Array<{ x1: number; y1: number; x2: number; y2: number; delay: number }> = [];
    for (let i = 0; i < neurons.length; i++) {
      const a = neurons[i];
      const b = neurons[(i + 2) % neurons.length];
      arr.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, delay: i * 200 });
    }
    return arr;
  }, [neurons]);
  return (
    <div style={{ width: size, height: size }}>
      <svg viewBox="0 0 300 300" className="w-full h-full">
        <defs>
          <radialGradient id="coreMini" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a5f3fc" stopOpacity="1" />
            <stop offset="35%" stopColor={color} stopOpacity="0.95" />
            <stop offset="70%" stopColor="#0891b2" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0c1424" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="haloMini" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0" />
            <stop offset="60%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
          <filter id="blurMini"><feGaussianBlur stdDeviation="2" /></filter>
        </defs>
        <circle cx="150" cy="150" r="140" fill="url(#haloMini)" />
        <g style={{ transformOrigin: "150px 150px", animation: "pixelOrbitReverse 28s linear infinite" }}>
          <circle cx="150" cy="150" r="120" fill="none" stroke={color} strokeOpacity="0.18" strokeWidth="0.8" strokeDasharray="3 6" />
          <circle cx="270" cy="150" r="3" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
        </g>
        <g style={{ transformOrigin: "150px 150px", animation: "pixelOrbit 18s linear infinite" }}>
          <circle cx="150" cy="150" r="100" fill="none" stroke="#8b5cf6" strokeOpacity="0.25" strokeWidth="0.8" strokeDasharray="2 5" />
          <circle cx="50" cy="150" r="3" fill="#a855f7" style={{ filter: `drop-shadow(0 0 4px #a855f7)` }} />
        </g>
        {synapses.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={color} strokeOpacity="0.35" strokeWidth="0.6" strokeDasharray="100" style={{ animation: `pixelSynapseFlow 3s ease-in-out infinite ${s.delay}ms` }} />
        ))}
        {neurons.map((n) => (
          <circle key={n.id} cx={n.x} cy={n.y} r="2.5" fill={color} style={{ transformOrigin: `${n.x}px ${n.y}px`, animation: `pixelNeuronPulse 2.4s ease-in-out infinite ${n.delay}ms`, filter: `drop-shadow(0 0 4px ${color})` }} />
        ))}
        <g style={{ transformOrigin: "150px 150px", animation: "pixelBreath 2.8s ease-in-out infinite" }}>
          <circle cx="150" cy="150" r="55" fill="url(#coreMini)" filter="url(#blurMini)" />
          <circle cx="150" cy="150" r="32" fill="#a5f3fc" opacity="0.85" />
          <circle cx="150" cy="150" r="20" fill="#ffffff" opacity="0.9" />
        </g>
      </svg>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
// DarkTip — tooltip dark consistente para KPIs
// ══════════════════════════════════════════════════════════════
function DarkTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex items-center align-middle cursor-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400/40 hover:text-cyan-400 transition-colors">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      {open && (
        <span
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg text-[10px] leading-snug font-normal w-56 text-left pointer-events-none"
          style={{
            background: "rgba(15,23,42,0.98)",
            border: "1px solid rgba(6,182,212,0.25)",
            color: "rgba(226,232,240,0.9)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            whiteSpace: "normal",
          }}
        >
          {text}
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
            style={{ background: "rgba(15,23,42,0.98)", borderRight: "1px solid rgba(6,182,212,0.25)", borderBottom: "1px solid rgba(6,182,212,0.25)", marginTop: "-4px" }}
          />
        </span>
      )}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

export default function PixelPage() {
  const [data, setData] = useState<PixelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(Date.now() - 7 * MS_PER_DAY);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(7);
  const [selectedModel, setSelectedModel] = useState<string>("NITRO");
  const [nitroWeights, setNitroWeights] = useState(DEFAULT_NITRO_WEIGHTS);
  const [editingWeights, setEditingWeights] = useState(DEFAULT_NITRO_WEIGHTS);
  const [lockedWeights, setLockedWeights] = useState<Record<string, boolean>>({ first: false, middle: false, last: false });
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [savingWeights, setSavingWeights] = useState(false);
  const [weightsError, setWeightsError] = useState<string | null>(null);
  const [windowOpen, setWindowOpen] = useState(false);
  const [globalWindow, setGlobalWindow] = useState(30);
  const [editingGlobalWindow, setEditingGlobalWindow] = useState(30);
  const [channelWindows, setChannelWindows] = useState<Record<string, number | null>>({});
  const [editingChannelWindows, setEditingChannelWindows] = useState<Record<string, number | null>>({});
  const [savingWindow, setSavingWindow] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);
  const [expandedJourney, setExpandedJourney] = useState<string | null>(null);
  const [truthGapOpen, setTruthGapOpen] = useState(false);
  const [applyingModel, setApplyingModel] = useState<string | null>(null);
  // Filtros de Live Orders (Fase 3.1)
  const [journeyChannelFilter, setJourneyChannelFilter] = useState<string[]>([]);
  const [journeyMinValue, setJourneyMinValue] = useState<number>(0);
  const [journeyMinTouchpoints, setJourneyMinTouchpoints] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hoveredChannel, setHoveredChannel] = useState<string | null>(null);
  // Debounced refetching state — minimum 800ms to avoid flash/glitch
  const [showRefetching, setShowRefetching] = useState(false);
  const refetchTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    const isActuallyRefetching = loading && !!data;
    if (isActuallyRefetching) {
      setShowRefetching(true);
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      refetchTimerRef.current = null;
    } else if (showRefetching) {
      // Keep showing for at least 800ms total
      refetchTimerRef.current = setTimeout(() => setShowRefetching(false), 600);
    }
    return () => { if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current); };
  }, [loading, data]);
  const isRefetching = showRefetching;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const scrollRef = useRef<HTMLElement | null>(null);

  // Cache en memoria por sesion para evitar refetch innecesario al togglear rangos
  // o navegar entre paginas (ej. Atribucion → Analytics → volver). TTL: 60s.
  const dataCacheRef = useRef<Map<string, { data: PixelData; ts: number }>>(new Map());
  const CACHE_TTL_MS = 60_000;

  const fetchData = useCallback(async () => {
    const apiModel = selectedModel === "CUSTOM" ? "NITRO" : selectedModel;
    const cacheKey = `${dateFrom}|${dateTo}|${currentPage}|${apiModel}`;
    const cached = dataCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setData(cached.data);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/metrics/pixel?from=${dateFrom}&to=${dateTo}&page=${currentPage}&pageSize=20&model=${apiModel}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PixelData = await res.json();
      dataCacheRef.current.set(cacheKey, { data: json, ts: Date.now() });
      // Limit cache to last 8 entries (LRU-ish)
      if (dataCacheRef.current.size > 8) {
        const firstKey = dataCacheRef.current.keys().next().value;
        if (firstKey) dataCacheRef.current.delete(firstKey);
      }
      setData(json);
    } catch (e) { setError(String(e)); } finally { setLoading(false); }
  }, [dateFrom, dateTo, currentPage, selectedModel]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Cmd+K listener
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(p => !p); }
      else if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Fetch attribution settings (S60 EXT-2 BIS++: el modelo se gestiona en /pixel/configuracion).
  // Aca solo lo leemos para mostrar el chip read-only y pasarlo a la API.
  useEffect(() => {
    fetch("/api/settings/attribution").then(r => r.json()).then(d => {
      if (d.weights) { setNitroWeights(d.weights); setEditingWeights(d.weights); }
      if (d.attributionWindowDays) { setGlobalWindow(d.attributionWindowDays); setEditingGlobalWindow(d.attributionWindowDays); }
      if (d.channelWindows) { setChannelWindows(d.channelWindows); setEditingChannelWindows(d.channelWindows); }
      if (d.attributionModel && MODEL_ORDER.includes(d.attributionModel)) {
        setSelectedModel(d.attributionModel);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (data?.meta?.nitroWeights) { const w = data.meta.nitroWeights; setNitroWeights(w); setEditingWeights(w); }
  }, [data]);

  const saveNitroWeights = async () => {
    const sum = editingWeights.first + editingWeights.last + editingWeights.middle;
    if (sum !== 100) { setWeightsError(`Los pesos deben sumar 100% (actual: ${sum}%)`); return; }
    setSavingWeights(true); setWeightsError(null);
    try {
      const res = await fetch("/api/settings/attribution", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingWeights) });
      if (!res.ok) throw new Error("Error al guardar");
      setNitroWeights(editingWeights); setWeightsOpen(false);
      if (selectedModel === "NITRO") fetchData();
    } catch { setWeightsError("Error al guardar la configuración"); } finally { setSavingWeights(false); }
  };

  const saveWindowSettings = async () => {
    setSavingWindow(true); setWindowError(null);
    try {
      const cleanCW: Record<string, number | null> = {};
      for (const [ch, val] of Object.entries(editingChannelWindows)) {
        cleanCW[ch] = val !== null && val !== editingGlobalWindow ? val : null;
      }
      const res = await fetch("/api/settings/attribution", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attributionWindowDays: editingGlobalWindow, channelWindows: cleanCW }) });
      if (!res.ok) throw new Error("Error al guardar");
      const d = await res.json();
      setGlobalWindow(d.attributionWindowDays); setChannelWindows(d.channelWindows); setEditingChannelWindows(d.channelWindows); setWindowOpen(false); fetchData();
    } catch { setWindowError("Error al guardar la configuración"); } finally { setSavingWindow(false); }
  };

  const setQuickRange = (days: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - days * MS_PER_DAY);
    setDateFrom(from.toISOString().slice(0, 10));
    setDateTo(to.toISOString().slice(0, 10));
    setActiveQuickRange(days);
    setCurrentPage(1);
  };

  // ── Derived data ──
  const bk = data?.businessKpis || { pixelRevenue: 0, pixelRoas: 0, ordersAttributed: 0, attributionRate: 0, aov: 0, totalAdSpend: 0, totalOrders: 0, webOrders: 0, webRevenue: 0, marketplaceOrders: 0, marketplaceRevenue: 0, changes: { pixelRevenue: 0, ordersAttributed: 0, pixelRoas: 0 } };
  const channels = data?.channelRoas || [];
  const journeys = data?.recentJourneys || [];
  const health = data?.pixelHealth;
  const totalPixelRevenue = channels.reduce((s, c) => s + c.pixelRevenue, 0);
  const totalPlatformRevenue = channels.reduce((s, c) => s + c.platformRevenue, 0);
  const overReportPct = totalPixelRevenue > 0 ? Math.round(((totalPlatformRevenue - totalPixelRevenue) / totalPixelRevenue) * 100) : 0;

  // Count-up values
  const revCountUp = useCountUp(bk.pixelRevenue);
  const roasCountUp = useCountUp(bk.pixelRoas, 600);

  // ── LOADING STATE (dark) ──
  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#05060a" }}>
        <DarkStyles />
        <div className="flex flex-col items-center gap-5">
          <PixelBrainMini size={80} />
          <div className="text-center">
            <p className="text-sm font-semibold text-white tracking-tight">NitroPixel</p>
            <p className="text-xs text-cyan-400/60 mt-1">Cargando atribuciones...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#05060a" }}>
        <div className="text-center">
          <p className="text-lg font-semibold text-red-400 mb-2">Error al cargar datos</p>
          <p className="text-sm text-gray-500">{error}</p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 rounded-lg text-sm text-white" style={{ background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)" }}>Reintentar</button>
        </div>
      </div>
    );
  }

  // Sort channels by revenue desc for the hero bar
  const sortedChannels = [...channels].sort((a, b) => b.pixelRevenue - a.pixelRevenue);
  const maxChannelRevenue = Math.max(...channels.map(c => Math.max(c.pixelRevenue, c.platformRevenue)), 1);

  return (
    <div className={`min-h-screen relative ${isRefetching ? "attr-refetching" : ""}`} style={{ background: "#05060a", color: "#e2e8f0" }}>
      <DarkStyles />

      {/* ── Refetching overlay ── */}
      {/* Recalculando pill with smooth fade */}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full flex items-center gap-2.5 pointer-events-none" style={{ background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.25)", backdropFilter: "blur(16px)", opacity: isRefetching ? 1 : 0, transform: isRefetching ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(-8px)", transition: "opacity 0.4s cubic-bezier(0.16,1,0.3,1), transform 0.4s cubic-bezier(0.16,1,0.3,1)" }}>
        <div className="w-2 h-2 rounded-full bg-cyan-400" style={{ animation: "attrPulse 1s ease-in-out infinite" }} />
        <span className="text-[11px] font-semibold text-cyan-300 tracking-wide">Recalculando atribuciones</span>
        <div className="flex gap-0.5">
          <div className="w-1 h-1 rounded-full bg-cyan-400" style={{ animation: "attrPulse 1.2s ease-in-out infinite 0ms" }} />
          <div className="w-1 h-1 rounded-full bg-cyan-400" style={{ animation: "attrPulse 1.2s ease-in-out infinite 200ms" }} />
          <div className="w-1 h-1 rounded-full bg-cyan-400" style={{ animation: "attrPulse 1.2s ease-in-out infinite 400ms" }} />
        </div>
      </div>

      {/* ── Background ambient ── */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div className="absolute inset-0 attr-grid-bg opacity-[0.03]" />
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full" style={{ background: "radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)", filter: "blur(80px)" }} />
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* BLOQUE 0 — STICKY HEADER                                 */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-40" style={{ background: "rgba(5,6,10,0.85)", backdropFilter: "blur(20px) saturate(1.5)", WebkitBackdropFilter: "blur(20px) saturate(1.5)", borderBottom: "1px solid rgba(6,182,212,0.08)" }}>
        <div className="max-w-[1440px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
          {/* Left — Logo + Title */}
          <div className="flex items-center gap-3">
            <PixelBrainMini size={32} />
            <div>
              <h1 className="text-sm font-semibold text-white tracking-tight">Atribución</h1>
              <p className="text-[10px] text-cyan-400/50 font-mono uppercase tracking-widest">NitroPixel</p>
            </div>
          </div>

          {/* Center — Read-only model+window chip (S60 EXT-2 BIS++: editar en /pixel/configuracion) */}
          <a
            href="/pixel/configuracion"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-medium transition-all hover:scale-[1.02]"
            style={{
              background: "rgba(15,23,42,0.6)",
              border: "1px solid rgba(6,182,212,0.15)",
              color: "rgba(148,163,184,0.85)",
            }}
            title="Cambiar modelo y ventanas en Configuración"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400/70">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="text-white font-semibold">{MODEL_LABELS[selectedModel] || selectedModel}</span>
            <span className="text-white/30">·</span>
            <span>{globalWindow}d</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-white/40 ml-1">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </a>

          {/* Right — Date + Live */}
          <div className="flex items-center gap-3">
            {data?.liveStatus?.status === "LIVE" && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                </span>
                <span className="text-[10px] font-medium text-emerald-400">LIVE</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => setQuickRange(d)} className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all" style={activeQuickRange === d ? { background: "rgba(6,182,212,0.15)", color: "#67e8f9", border: "1px solid rgba(6,182,212,0.3)" } : { color: "rgba(148,163,184,0.5)" }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* Rainbow line */}
        <div className="h-[1px]" style={{ background: "linear-gradient(90deg, transparent, rgba(6,182,212,0.4) 20%, rgba(139,92,246,0.4) 50%, rgba(249,115,22,0.4) 80%, transparent)" }} />
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* CONTENT                                                   */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="relative z-10 max-w-[1440px] mx-auto px-6 py-8 space-y-10">

        {/* ════════════════════════════════════════════════════════ */}
        {/* BLOQUE 1 — HERO: Revenue Attribution Map               */}
        {/* ════════════════════════════════════════════════════════ */}
        <section style={{ animation: "attrFadeUp 0.7s cubic-bezier(0.16,1,0.3,1) both" }}>
          {/* Title */}
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan-400/50 mb-1">Revenue Attribution Map</p>
              <div className="flex items-baseline gap-4">
                <span className="text-4xl font-bold tracking-tight" style={{ background: "linear-gradient(135deg, #e2e8f0, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  {fmtCompact(Math.round(revCountUp))}
                </span>
                <span className="text-lg font-semibold text-white/40">
                  ROAS <span className="text-cyan-400">{roasCountUp.toFixed(1)}x</span>
                </span>
              </div>
            </div>
            {totalPlatformRevenue > totalPixelRevenue && (
              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-red-400/60">Plataformas reportan</p>
                  <DarkTip text="Suma de revenue que Meta Ads y Google Ads se atribuyen a sí mismos. Tipicamente está inflado porque cada plataforma se queda con el crédito completo de cada venta (last-click), generando double-counting. NitroPixel mide la verdad: una venta = un crédito repartido según el modelo elegido." />
                </div>
                <p className="text-sm text-red-400/80">
                  {fmtCompact(totalPlatformRevenue)}
                  <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                    +{overReportPct}% inflado
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* ── The Hero Bar ── */}
          <div className="relative rounded-2xl overflow-hidden" style={{ background: "rgba(15,23,42,0.4)", border: "1px solid rgba(6,182,212,0.1)", padding: "3px" }}>
            <div className="flex rounded-[13px] overflow-hidden" style={{ height: "72px" }}>
              {sortedChannels.filter(c => c.pixelRevenue > 0).map((ch, i) => {
                const info = getSourceInfo(ch.source);
                const pct = totalPixelRevenue > 0 ? (ch.pixelRevenue / totalPixelRevenue) * 100 : 0;
                const isHovered = hoveredChannel === ch.source;
                return (
                  <div
                    key={ch.source}
                    className="relative flex items-center justify-center gap-2 transition-all duration-500 cursor-pointer overflow-hidden"
                    style={{
                      width: `${pct}%`,
                      minWidth: pct > 3 ? "60px" : "24px",
                      background: `linear-gradient(180deg, ${info.color}dd, ${info.color}99)`,
                      boxShadow: isHovered ? `0 0 30px ${info.color}40, inset 0 1px 0 rgba(255,255,255,0.2)` : `inset 0 1px 0 rgba(255,255,255,0.1)`,
                      transform: isHovered ? "scaleY(1.08)" : "scaleY(1)",
                      zIndex: isHovered ? 10 : 1,
                      animation: `attrBarGrow 0.8s cubic-bezier(0.16,1,0.3,1) ${i * 80}ms both`,
                      transformOrigin: "left center",
                    }}
                    onMouseEnter={() => setHoveredChannel(ch.source)}
                    onMouseLeave={() => setHoveredChannel(null)}
                  >
                    {/* Channel logo */}
                    <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.25)" }}>
                      <ChannelLogo source={ch.source} size={14} />
                    </div>
                    {/* Label + amount — only show if segment wide enough */}
                    {pct > 8 && (
                      <div className="flex flex-col items-start min-w-0">
                        <span className="text-[10px] font-bold text-white/90 truncate">{info.label}</span>
                        <span className="text-[11px] font-mono font-bold text-white">{fmtCompact(ch.pixelRevenue)}</span>
                      </div>
                    )}
                    {/* Hover tooltip */}
                    {isHovered && (
                      <div className="absolute -top-[88px] left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl text-center z-50 whitespace-nowrap" style={{ background: "rgba(15,23,42,0.95)", border: `1px solid ${info.color}40`, boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${info.color}15` }}>
                        <p className="text-[10px] font-semibold text-white/60 mb-1">{info.label}</p>
                        <p className="text-sm font-bold text-white">{fmtCompact(ch.pixelRevenue)} · ROAS {ch.pixelRoas.toFixed(1)}x</p>
                        <p className="text-[10px] text-white/40 mt-0.5">{fmt(ch.orders)} órdenes · CPA {ch.spend > 0 && ch.orders > 0 ? fmtCompact(ch.spend / ch.orders) : "—"}</p>
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45" style={{ background: "rgba(15,23,42,0.95)", borderRight: `1px solid ${info.color}40`, borderBottom: `1px solid ${info.color}40` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Channel legend below bar */}
          <div className="flex flex-wrap gap-3 mt-4">
            {sortedChannels.filter(c => c.pixelRevenue > 0).map(ch => {
              const info = getSourceInfo(ch.source);
              const pct = totalPixelRevenue > 0 ? ((ch.pixelRevenue / totalPixelRevenue) * 100).toFixed(1) : "0";
              return (
                <div key={ch.source} className="flex items-center gap-1.5 text-[11px] text-white/50">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: info.color }} />
                  <span className="font-medium text-white/70">{info.label}</span>
                  <span className="font-mono">{pct}%</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════ */}
        {/* BLOQUE 2 — TRUTH GAP · Pixel vs Plataforma (colapsable) */}
        {/* ════════════════════════════════════════════════════════ */}
        {(() => {
          const channelsWithData = sortedChannels.filter(c => c.pixelRevenue > 0 || c.platformRevenue > 0);
          const overReporting = channelsWithData.filter(c => c.diffPercent !== null && c.diffPercent > 5);
          if (channelsWithData.length === 0) return null;
          return (
            <section className="attr-glass rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setTruthGapOpen(o => !o)}
                className="w-full flex items-center justify-between gap-4 p-4 hover:bg-cyan-500/5 transition-colors"
              >
                <div className="flex items-center gap-3 text-left">
                  <span className="text-[9px] font-mono uppercase tracking-[0.4em] text-cyan-400/50">La Verdad</span>
                  <span className="text-sm font-semibold text-white">Pixel vs Plataformas</span>
                  {overReporting.length > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}>
                      {overReporting.length} {overReporting.length === 1 ? "canal infla" : "canales inflan"} sus números
                    </span>
                  )}
                  <DarkTip text="Compara revenue real (NitroPixel) vs revenue que reportan Meta y Google. Las plataformas tipicamente inflan porque cada una se queda con el crédito completo (last-click). Si Meta dice $100 y Pixel dice $70, +43% inflado significa que Meta se atribuye ventas que también ven otros canales." />
                </div>
                <svg className={`w-4 h-4 text-cyan-400/50 transition-transform ${truthGapOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {truthGapOpen && (
                <div className="px-4 pb-4 space-y-3 attr-stagger" style={{ borderTop: "1px solid rgba(6,182,212,0.08)" }}>
                  {channelsWithData.map(ch => {
                    const info = getSourceInfo(ch.source);
                    const diff = ch.diffPercent;
                    const pixelPct = maxChannelRevenue > 0 ? (ch.pixelRevenue / maxChannelRevenue) * 100 : 0;
                    const platPct = maxChannelRevenue > 0 ? (ch.platformRevenue / maxChannelRevenue) * 100 : 0;
                    const isOverReporting = diff !== null && diff > 5;
                    return (
                      <div key={ch.source} className="attr-glass rounded-xl p-4 transition-all duration-300" style={{ borderTop: `2px solid ${info.color}60`, marginTop: "1rem" }}>
                        <div className="flex items-center gap-4">
                          <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${info.color}20`, boxShadow: `0 0 20px ${info.color}10` }}>
                            <ChannelLogo source={ch.source} size={20} />
                          </div>
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-mono uppercase tracking-wider text-cyan-400/50 w-16 flex-shrink-0">Pixel</span>
                              <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ background: "rgba(15,23,42,0.5)" }}>
                                <div className="h-full rounded-md flex items-center px-2 transition-all duration-700" style={{ width: `${Math.max(pixelPct, 2)}%`, background: `linear-gradient(90deg, ${info.color}cc, ${info.color}88)`, boxShadow: `0 0 12px ${info.color}30` }}>
                                  <span className="text-[10px] font-bold text-white whitespace-nowrap">{fmtCompact(ch.pixelRevenue)}</span>
                                </div>
                              </div>
                            </div>
                            {ch.platformRevenue > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-mono uppercase tracking-wider text-white/25 w-16 flex-shrink-0">{info.label}</span>
                                <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ background: "rgba(15,23,42,0.5)" }}>
                                  <div className="h-full rounded-md flex items-center px-2 transition-all duration-700" style={{ width: `${Math.max(platPct, 2)}%`, background: "repeating-linear-gradient(135deg, rgba(148,163,184,0.12), rgba(148,163,184,0.12) 4px, rgba(148,163,184,0.06) 4px, rgba(148,163,184,0.06) 8px)" }}>
                                    <span className="text-[10px] font-medium text-white/40 whitespace-nowrap">{fmtCompact(ch.platformRevenue)}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0 text-right w-28">
                            <div className="text-sm font-bold text-white">{ch.pixelRoas.toFixed(1)}x <span className="text-[9px] font-normal text-cyan-400/50">ROAS</span></div>
                            {ch.platformRoas > 0 && (
                              <div className="text-xs text-white/25 line-through">{ch.platformRoas.toFixed(1)}x plat.</div>
                            )}
                            {isOverReporting && (
                              <div className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}>
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                +{Math.round(diff!)}%
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })()}

        {/* ── Section divider ── */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(6,182,212,0.15), transparent)" }} />
          <span className="text-[9px] font-mono uppercase tracking-[0.4em] text-cyan-400/30">Métricas</span>
          <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(6,182,212,0.15), transparent)" }} />
        </div>

        {/* ════════════════════════════════════════════════════════ */}
        {/* BLOQUE 3 — KPIs Strip                                   */}
        {/* ════════════════════════════════════════════════════════ */}
        <section className="attr-glass rounded-2xl p-5" style={{ animation: "attrFadeUp 0.6s 0.3s both" }}>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
            {[
              {
                label: "Revenue Atribuido",
                value: fmtCompact(bk.pixelRevenue),
                change: bk.changes?.pixelRevenue,
                gradient: "from-cyan-400 to-blue-400",
                tip: `Suma del valor de las órdenes atribuidas por NitroPixel en el período, según el modelo ${MODEL_LABELS[selectedModel]}. Excluye marketplace (FVG/BPR/MELI). Cambia si cambiás el modelo en /pixel/configuracion.`,
              },
              {
                label: "ROAS Blended",
                value: `${bk.pixelRoas.toFixed(1)}x`,
                change: bk.changes?.pixelRoas,
                gradient: "from-emerald-400 to-cyan-400",
                tip: "Revenue Atribuido ÷ Inversión Total (Meta + Google + manual). Es 'blended' porque combina todas las plataformas en un solo número. Mayor que el ROAS reportado por las plataformas suele indicar inflado de ellas.",
              },
              {
                label: "Órdenes Atribuidas",
                value: fmt(bk.ordersAttributed),
                change: bk.changes?.ordersAttributed,
                gradient: "from-violet-400 to-purple-400",
                tip: "Cantidad de órdenes a las que NitroPixel asoció al menos un touchpoint. No es el total de órdenes — solo las que el cliente pasó por el pixel antes de comprar.",
              },
              {
                label: "Tasa de Atribución",
                value: `${bk.attributionRate}%`,
                change: null,
                gradient: "from-orange-400 to-amber-400",
                tip: "Órdenes atribuidas ÷ órdenes totales del período. Si está baja: el snippet del pixel no está en todas las páginas, los visitantes llegan directo al checkout sin pasar por el sitio, o el dominio del pixel no matchea el del checkout. Benchmark sano: >40%.",
              },
              {
                label: "Inversión Total",
                value: fmtCompact(bk.totalAdSpend),
                change: null,
                gradient: "from-pink-400 to-rose-400",
                tip: "Suma de spend de Meta Ads + Google Ads + spend manual cargado en /pixel/analytics (TV, radio, OOH, etc). Es lo que está en juego: el ROAS Blended divide Revenue Atribuido por este número.",
              },
            ].map((kpi, i) => (
              <div key={i} className="text-center lg:text-left">
                <div className="flex items-center justify-center lg:justify-start gap-1.5 mb-1">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-white/30">{kpi.label}</p>
                  <DarkTip text={kpi.tip} />
                </div>
                <p className="text-xl font-bold tracking-tight" style={{ background: `linear-gradient(135deg, var(--tw-gradient-stops))`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  <span className={`bg-gradient-to-r ${kpi.gradient} bg-clip-text text-transparent`}>{kpi.value}</span>
                </p>
                {kpi.change !== null && kpi.change !== undefined && (
                  <span className={`text-[11px] font-semibold ${kpi.change > 0 ? "text-emerald-400" : kpi.change < 0 ? "text-red-400" : "text-white/20"}`}>
                    {pctBadge(kpi.change)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════ */}
        {/* BLOQUE 3.5 — Comparacion de modelos (barras segmentadas por canal) */}
        {/* ════════════════════════════════════════════════════════ */}
        {(() => {
          const byModelChannel = data?.attribution?.byModelChannel || [];
          if (byModelChannel.length === 0) return null;

          // Agrupar por modelo → array de { source, revenue }
          const modelOrder = ["NITRO", "LAST_CLICK", "FIRST_CLICK", "LINEAR"];
          const modelData: Record<string, { total: number; channels: Array<{ source: string; revenue: number }> }> = {};
          for (const m of modelOrder) modelData[m] = { total: 0, channels: [] };
          for (const row of byModelChannel) {
            if (!modelData[row.model]) continue;
            modelData[row.model].total += row.revenue;
            modelData[row.model].channels.push({ source: row.source, revenue: row.revenue });
          }
          // Sort canales por revenue desc + recortar a top 8 + agrupar el resto
          const TOP_N = 8;
          for (const m of modelOrder) {
            const sorted = modelData[m].channels.sort((a, b) => b.revenue - a.revenue);
            if (sorted.length > TOP_N) {
              const top = sorted.slice(0, TOP_N);
              const rest = sorted.slice(TOP_N).reduce((s, c) => s + c.revenue, 0);
              if (rest > 0) top.push({ source: "otros", revenue: rest });
              modelData[m].channels = top;
            }
          }

          const activeModel = selectedModel === "CUSTOM" ? "NITRO" : selectedModel;
          const activeTotal = modelData[activeModel]?.total || 0;
          const maxTotal = Math.max(...modelOrder.map(m => modelData[m].total), 1);

          // Coleccion unificada de canales presentes en cualquier modelo (para leyenda)
          const allSources = new Set<string>();
          for (const m of modelOrder) for (const c of modelData[m].channels) allSources.add(c.source);
          const legendSources = Array.from(allSources).sort();

          const applyModel = async (model: string) => {
            if (model === activeModel || applyingModel) return;
            setApplyingModel(model);
            try {
              await fetch("/api/settings/attribution", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ attributionModel: model }),
              });
              setSelectedModel(model);
              setCurrentPage(1);
              fetchData();
            } catch {
              // silent
            } finally {
              setApplyingModel(null);
            }
          };

          return (
            <section className="attr-glass rounded-2xl p-5" style={{ animation: "attrFadeUp 0.6s 0.4s both" }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-white tracking-tight">Comparación de modelos</h2>
                  <DarkTip text={`Cómo cambia la distribución del revenue entre canales según el modelo de atribución. El total queda igual (es la misma plata). Lo que cambia es CUÁNTO de cada canal se queda con el crédito. El modelo activo (${MODEL_LABELS[activeModel]}) se usa en todo el dashboard.`} />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400/40">
                  Activo: <span className="text-cyan-300 font-semibold">{MODEL_LABELS[activeModel]}</span>
                </span>
              </div>

              <div className="space-y-2">
                {modelOrder.map(model => {
                  const md = modelData[model];
                  const isActive = model === activeModel;
                  const total = md.total;
                  const widthPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                  // Distribucion por canal de ESTE modelo (porcentajes que suman 100% del bar width)
                  return (
                    <div
                      key={model}
                      className={`rounded-xl p-3 transition-all duration-300 ${
                        isActive ? "border" : "border border-transparent hover:border-white/10"
                      }`}
                      style={isActive ? {
                        background: "linear-gradient(90deg, rgba(249,115,22,0.08), rgba(249,115,22,0.02))",
                        borderColor: "rgba(249,115,22,0.25)",
                      } : { background: "rgba(15,23,42,0.4)" }}
                    >
                      <div className="flex items-center gap-4">
                        {/* Model name */}
                        <div className="w-28 flex-shrink-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-sm font-bold ${isActive ? "text-orange-400" : "text-white/80"}`}>
                              {MODEL_LABELS[model]}
                            </span>
                            {isActive && (
                              <span className="text-[9px] font-mono uppercase tracking-wider text-orange-400/70">activo</span>
                            )}
                          </div>
                        </div>

                        {/* Segmented bar (revenue por canal) */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {/* Track */}
                            <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "rgba(15,23,42,0.6)" }}>
                              {/* Container con ancho proporcional al maxTotal */}
                              <div className="h-full flex" style={{ width: `${Math.max(widthPct, 2)}%` }}>
                                {md.channels.map((c, i) => {
                                  const info = c.source === "otros"
                                    ? { color: "#475569", label: "Otros" }
                                    : getSourceInfo(c.source);
                                  const segPct = total > 0 ? (c.revenue / total) * 100 : 0;
                                  if (segPct < 0.5) return null;
                                  return (
                                    <div
                                      key={c.source + i}
                                      className="h-full transition-all duration-700"
                                      style={{
                                        width: `${segPct}%`,
                                        background: info.color,
                                        minWidth: "2px",
                                      }}
                                      title={`${info.label}: ${fmtCompact(c.revenue)} (${segPct.toFixed(1)}%)`}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                            <span className={`text-sm font-bold tabular-nums w-24 text-right ${isActive ? "text-orange-400" : "text-cyan-400"}`}>
                              {fmtCompact(total)}
                            </span>
                          </div>
                          {/* Mini-leyenda inline: top 3 canales del modelo */}
                          <div className="flex items-center gap-2 text-[10px] text-white/40 font-mono flex-wrap">
                            {md.channels.slice(0, 3).map(c => {
                              const info = c.source === "otros"
                                ? { color: "#475569", label: "Otros" }
                                : getSourceInfo(c.source);
                              const pct = total > 0 ? (c.revenue / total) * 100 : 0;
                              return (
                                <span key={c.source} className="flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: info.color }} />
                                  <span className="text-white/60">{info.label}</span>
                                  <span>{pct.toFixed(0)}%</span>
                                </span>
                              );
                            })}
                            {md.channels.length > 3 && (
                              <span className="text-white/20">+{md.channels.length - 3} más</span>
                            )}
                          </div>
                        </div>

                        {/* Apply button */}
                        <div className="flex-shrink-0 w-24 text-right">
                          {isActive ? (
                            <span className="text-[10px] text-orange-400/50 font-mono uppercase tracking-wider">en uso</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => applyModel(model)}
                              disabled={applyingModel !== null}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                              style={{
                                background: applyingModel === model ? "rgba(6,182,212,0.15)" : "rgba(6,182,212,0.08)",
                                border: "1px solid rgba(6,182,212,0.2)",
                                color: "#67e8f9",
                                opacity: applyingModel !== null && applyingModel !== model ? 0.4 : 1,
                              }}
                            >
                              {applyingModel === model ? "Aplicando..." : "Aplicar"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Leyenda global (canales unicos presentes en cualquier modelo) */}
              {legendSources.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 pt-3 border-t border-white/5">
                  {legendSources.slice(0, 12).map(src => {
                    const info = src === "otros" ? { color: "#475569", label: "Otros" } : getSourceInfo(src);
                    return (
                      <span key={src} className="flex items-center gap-1.5 text-[10px] text-white/50">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: info.color }} />
                        <span>{info.label}</span>
                      </span>
                    );
                  })}
                </div>
              )}

              <p className="text-[10px] text-white/30 mt-3 leading-relaxed">
                El total de revenue queda igual (mismas órdenes). Lo que cambia es <strong className="text-white/50">cómo se reparte el crédito entre canales</strong>: <strong className="text-white/50">Last Click</strong> le da todo al último, <strong className="text-white/50">First Click</strong> al primero, <strong className="text-white/50">Linear</strong> reparte parejo, <strong className="text-white/50">Nitro</strong> pondera según el rol.
              </p>
            </section>
          );
        })()}

        {/* ── Section divider ── */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(6,182,212,0.15), transparent)" }} />
          <span className="text-[9px] font-mono uppercase tracking-[0.4em] text-cyan-400/30">Órdenes en Vivo</span>
          <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(6,182,212,0.15), transparent)" }} />
        </div>

        {/* ════════════════════════════════════════════════════════ */}
        {/* BLOQUE 4 — Live Orders with Journey Dots + Filtros      */}
        {/* ════════════════════════════════════════════════════════ */}
        {(() => {
          // Canales presentes en las journeys (para chips)
          const channelsInJourneys = new Set<string>();
          for (const j of journeys) {
            for (const tp of (j.touchpoints || [])) {
              channelsInJourneys.add((tp.source || "direct").toLowerCase());
            }
          }
          // Filtrado client-side
          const filteredJourneys = journeys.filter(j => {
            if (journeyMinValue > 0 && j.revenue < journeyMinValue) return false;
            if (journeyMinTouchpoints > 0 && (j.touchpointCount || 0) < journeyMinTouchpoints) return false;
            if (journeyChannelFilter.length > 0) {
              const sources = (j.touchpoints || []).map(tp => (tp.source || "direct").toLowerCase());
              const hasMatch = journeyChannelFilter.some(ch => sources.includes(ch.toLowerCase()));
              if (!hasMatch) return false;
            }
            return true;
          });
          const visibleJourneys = filteredJourneys.slice(0, 12);
          const hasFilters = journeyChannelFilter.length > 0 || journeyMinValue > 0 || journeyMinTouchpoints > 0;
          const totalAvailable = journeys.length;
          // Top channels in journeys, ordenados por frecuencia
          const channelCounts: Record<string, number> = {};
          for (const j of journeys) {
            for (const tp of (j.touchpoints || [])) {
              const s = (tp.source || "direct").toLowerCase();
              channelCounts[s] = (channelCounts[s] || 0) + 1;
            }
          }
          const sortedChannelChips = Array.from(channelsInJourneys)
            .sort((a, b) => (channelCounts[b] || 0) - (channelCounts[a] || 0))
            .slice(0, 8);

          return (
            <>
              {/* Barra de filtros */}
              <div className="attr-glass rounded-xl p-3 flex items-center gap-3 flex-wrap">
                {/* Channel chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-white/30 mr-1">Canal</span>
                  {sortedChannelChips.map(ch => {
                    const info = getSourceInfo(ch);
                    const isSelected = journeyChannelFilter.includes(ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setJourneyChannelFilter(prev =>
                          isSelected ? prev.filter(c => c !== ch) : [...prev, ch]
                        )}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all"
                        style={{
                          background: isSelected ? `${info.color}25` : "rgba(15,23,42,0.5)",
                          border: `1px solid ${isSelected ? info.color + "60" : "rgba(6,182,212,0.1)"}`,
                          color: isSelected ? "#fff" : "rgba(148,163,184,0.7)",
                        }}
                      >
                        <span className="w-3 h-3 rounded-full flex items-center justify-center" style={{ background: info.color }}>
                          <ChannelLogo source={ch} size={8} />
                        </span>
                        <span>{info.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Divider */}
                <div className="w-px h-5 bg-white/10" />

                {/* Min value */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-white/30">Min</span>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    value={journeyMinValue || ""}
                    placeholder="$0"
                    onChange={e => setJourneyMinValue(Number(e.target.value) || 0)}
                    className="w-24 px-2 py-1 rounded-md text-[11px] text-white/80 font-mono outline-none"
                    style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(6,182,212,0.1)" }}
                  />
                </div>

                {/* Touchpoints */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-white/30">Touchpoints ≥</span>
                  <select
                    value={journeyMinTouchpoints}
                    onChange={e => setJourneyMinTouchpoints(Number(e.target.value))}
                    className="px-2 py-1 rounded-md text-[11px] text-white/80 font-mono outline-none cursor-pointer"
                    style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(6,182,212,0.1)" }}
                  >
                    <option value={0}>Todos</option>
                    <option value={2}>≥ 2</option>
                    <option value={3}>≥ 3</option>
                    <option value={5}>≥ 5</option>
                    <option value={7}>≥ 7</option>
                  </select>
                </div>

                {/* Counter + clear */}
                <div className="flex-1" />
                <span className="text-[11px] text-white/40 font-mono">
                  {hasFilters ? (
                    <span>
                      <span className="text-cyan-400 font-semibold">{filteredJourneys.length}</span>
                      {" / "}
                      {totalAvailable} órdenes
                    </span>
                  ) : (
                    <span>{Math.min(visibleJourneys.length, totalAvailable)} órdenes</span>
                  )}
                </span>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setJourneyChannelFilter([]);
                      setJourneyMinValue(0);
                      setJourneyMinTouchpoints(0);
                    }}
                    className="text-[10px] text-cyan-400/70 hover:text-cyan-400 underline-offset-2 hover:underline"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>

              {/* Lista de journeys filtradas */}
              {visibleJourneys.length === 0 ? (
                <div className="attr-glass rounded-xl p-8 text-center">
                  <p className="text-sm text-white/40">No hay órdenes que coincidan con los filtros aplicados.</p>
                  <p className="text-[11px] text-white/20 mt-1">Probá quitando algún filtro o ampliando el rango de fechas.</p>
                </div>
              ) : (
                <section className="space-y-3 attr-stagger">
                  {visibleJourneys.map(j => {
            const credits = getCreditsForModel(j.touchpoints, selectedModel, nitroWeights);
            const isExpanded = expandedJourney === j.orderId;
            return (
              <div key={j.orderId} className="attr-glass rounded-xl overflow-hidden transition-all duration-300">
                {/* Order header */}
                <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedJourney(isExpanded ? null : j.orderId)}>
                  {/* Revenue */}
                  <div className="flex-shrink-0">
                    <span className="text-lg font-bold text-white">{fmtCompact(j.revenue)}</span>
                  </div>

                  {/* Journey dots */}
                  <div className="flex-1 flex items-center gap-0 min-w-0">
                    {j.touchpoints.map((tp, i) => {
                      const info = getSourceInfo(tp.source || "direct");
                      const isLast = i === j.touchpoints.length - 1;
                      return (
                        <div key={i} className="flex items-center">
                          {i > 0 && (
                            <div className="w-4 lg:w-8 h-px flex-shrink-0" style={{ background: `linear-gradient(90deg, ${getSourceInfo(j.touchpoints[i-1]?.source || "direct").color}60, ${info.color}60)` }} />
                          )}
                          <div
                            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center relative"
                            title={`${info.label}${tp.campaign ? ` · ${tp.campaign}` : ""}`}
                            style={{
                              background: `${info.color}25`,
                              border: `1.5px solid ${info.color}60`,
                              boxShadow: isLast ? `0 0 12px ${info.color}40` : undefined,
                            }}
                          >
                            <ChannelLogo source={tp.source} size={12} />
                            {isLast && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400" style={{ animation: "attrHeartbeat 2s ease-in-out infinite", boxShadow: "0 0 8px rgba(34,197,94,0.5)" }} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {/* Purchase icon */}
                    <div className="flex items-center">
                      <div className="w-4 lg:w-6 h-px flex-shrink-0" style={{ background: "linear-gradient(90deg, rgba(34,197,94,0.3), rgba(34,197,94,0.6))" }} />
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center" style={{ border: "1.5px solid rgba(34,197,94,0.5)" }}>
                        <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </div>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex-shrink-0 text-right">
                    <p className="text-[10px] text-white/30 font-mono">#{(j.orderExternalId || j.orderId).slice(-6)}</p>
                    <p className="text-[10px] text-white/20">{j.touchpointCount} touchpoints · {j.conversionLag}d</p>
                  </div>

                  {/* Expand arrow */}
                  <svg className={`w-4 h-4 text-white/20 transition-transform duration-300 flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>

                {/* Credit bar (mini version of hero) */}
                {credits.length > 0 && (
                  <div className="px-4 pb-3">
                    <div className="flex rounded-full overflow-hidden h-1.5">
                      {credits.map((c, i) => (
                        <div key={i} className="transition-all duration-500" style={{ width: `${c.pct}%`, background: c.color, minWidth: "3px" }} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 space-y-2" style={{ borderTop: "1px solid rgba(6,182,212,0.06)" }}>
                    {j.touchpoints.map((tp, i) => {
                      const info = getSourceInfo(tp.source || "direct");
                      const credit = credits.find(c => c.source === (tp.source || "direct"));
                      return (
                        <div key={i} className="flex items-center gap-3 text-[11px]">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${info.color}20` }}>
                            <ChannelLogo source={tp.source} size={10} />
                          </div>
                          <span className="font-medium text-white/70 w-20 flex-shrink-0">{info.label}</span>
                          <span className="text-white/30 flex-1 truncate font-mono text-[10px]">{tp.campaign || cleanUrl(tp.page) || "—"}</span>
                          {tp.clickType && <span className="text-cyan-400/40 text-[9px] font-mono">{tp.clickType}</span>}
                          <span className="text-white/20 text-[10px] font-mono flex-shrink-0">{new Date(tp.timestamp).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                          {credit && <span className="text-white/50 font-bold text-[10px] flex-shrink-0 w-10 text-right">{credit.pct}%</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

                  {/* Pagination — solo cuando NO hay filtros activos */}
                  {!hasFilters && data && data.pagination.totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-4">
                      {currentPage > 1 && (
                        <button onClick={() => setCurrentPage(p => p - 1)} className="px-3 py-1.5 rounded-lg text-xs text-white/50" style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(6,182,212,0.1)" }}>Anterior</button>
                      )}
                      <span className="text-xs text-white/20 font-mono">{currentPage} / {data.pagination.totalPages}</span>
                      {currentPage < data.pagination.totalPages && (
                        <button onClick={() => setCurrentPage(p => p + 1)} className="px-3 py-1.5 rounded-lg text-xs text-white/50" style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(6,182,212,0.1)" }}>Siguiente</button>
                      )}
                    </div>
                  )}
                </section>
              )}
            </>
          );
        })()}

        {/* ════════════════════════════════════════════════════════ */}
        {/* BLOQUE 5 — Pixel Health Footer                          */}
        {/* ════════════════════════════════════════════════════════ */}
        {health && (
          <section className="attr-glass rounded-2xl p-4" style={{ animation: "attrFadeUp 0.6s 0.5s both" }}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              {/* Status */}
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: data?.liveStatus?.status === "LIVE" ? "#4ade80" : data?.liveStatus?.status === "ACTIVE" ? "#fbbf24" : "#ef4444", animation: data?.liveStatus?.status === "LIVE" ? "attrPulse 2s infinite" : undefined }} />
                <span className="text-[11px] font-semibold text-white/60">{data?.liveStatus?.status || "—"}</span>
              </div>

              {/* Attribution Rate */}
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(6,182,212,0.1)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#06b6d4" strokeWidth="3" strokeDasharray={`${(health.attributionRate / 100) * 97.4} 97.4`} strokeLinecap="round" transform="rotate(-90 18 18)" />
                </svg>
                <div>
                  <p className="text-xs font-bold text-cyan-400">{health.attributionRate}%</p>
                  <p className="text-[9px] text-white/25 font-mono uppercase">Atribución</p>
                </div>
              </div>

              {/* Click coverage — con CTA si <50% */}
              {(() => {
                const rate = Math.round(health.clickCoverage?.clickIdRate || 0);
                const lowCoverage = rate < 50;
                const content = (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke={lowCoverage ? "rgba(239,68,68,0.15)" : "rgba(139,92,246,0.1)"} strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke={lowCoverage ? "#f87171" : "#8b5cf6"} strokeWidth="3" strokeDasharray={`${(rate / 100) * 97.4} 97.4`} strokeLinecap="round" transform="rotate(-90 18 18)" />
                    </svg>
                    <div>
                      <p className={`text-xs font-bold ${lowCoverage ? "text-red-400" : "text-violet-400"}`}>{rate}%</p>
                      <p className="text-[9px] text-white/25 font-mono uppercase">Click IDs</p>
                    </div>
                    {lowCoverage && (
                      <span className="text-[9px] text-red-300/80 ml-1 hidden md:inline">
                        Subila configurando UTMs ›
                      </span>
                    )}
                  </>
                );
                return lowCoverage ? (
                  <a
                    href="/pixel/configuracion"
                    className="flex items-center gap-2 transition-all hover:scale-[1.02]"
                    title="Cobertura baja: configurá UTMs en /pixel/configuracion para llegar al 80%+"
                  >
                    {content}
                  </a>
                ) : (
                  <div className="flex items-center gap-2" title="Click IDs (gclid, fbclid, etc) capturados por el pixel. Indica trazabilidad de campañas pagas.">
                    {content}
                  </div>
                );
              })()}

              {/* Events */}
              <div>
                <p className="text-xs font-bold text-white/60">{fmt(health.eventsInPeriod)}</p>
                <p className="text-[9px] text-white/25 font-mono uppercase">Eventos</p>
              </div>

              {/* Model + weights chip — read-only, link a /pixel/configuracion */}
              <a
                href="/pixel/configuracion"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all hover:scale-[1.02]"
                style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)" }}
                title="Editar modelo y pesos en Configuración"
              >
                <span className="text-[10px] font-bold text-orange-400">{MODEL_LABELS[selectedModel]}</span>
                {selectedModel === "NITRO" && (
                  <>
                    <span className="text-orange-400/30">·</span>
                    <span className="text-[10px] font-mono text-orange-300/80">
                      {nitroWeights.first}/{nitroWeights.middle}/{nitroWeights.last}
                    </span>
                  </>
                )}
                <svg className="w-3 h-3 text-orange-400/60 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </a>
            </div>
          </section>
        )}

        {/* Bottom spacer */}
        <div className="h-8" />
      </div>

      {/* ── Command palette (Cmd+K) ── */}
      {paletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPaletteOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl p-4 space-y-3" style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(6,182,212,0.2)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <div className="flex items-center gap-2 text-sm text-white/50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <span>Acciones rápidas</span>
            </div>
            <button onClick={() => { fetchData(); setPaletteOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/5 transition-colors">
              Actualizar datos
            </button>
            <button onClick={() => { setWeightsOpen(true); setPaletteOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/5 transition-colors">
              Configurar modelo Nitro
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
