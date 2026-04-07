"use client";

// ══════════════════════════════════════════════════════════════
// Customer Journeys — recorrido visual de cada cliente
// ══════════════════════════════════════════════════════════════
// Tema: dark, premium, nivel startup unicornio.
// Solo visualizacion del recorrido. La atribucion vive en /pixel.
// ══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

// ── Tipos ─────────────────────────────────────────────────────
interface JourneyTouchpoint {
  ts: string | null;
  source: string;
  medium: string | null;
  campaign: string | null;
  page: string | null;
  label: string;
}

interface JourneyOrder {
  orderId: string;
  externalId: string;
  orderDate: string;
  totalValue: number;
  currency: string;
  itemCount: number;
  status: string;
  customerEmail: string | null;
  visitorId: string | null;
  model: string | null;
  touchpointCount: number;
  conversionLag: number | null;
  attributedValue: number;
  touchpoints: JourneyTouchpoint[];
}

interface JourneyResponse {
  orders: JourneyOrder[];
  model: string;
}

// ── Channel meta (color + gradient para dark) ─────────────────
const CHANNEL_META: Record<string, { color: string; bg: string; ring: string; label: string }> = {
  meta:           { color: "#0866FF", bg: "linear-gradient(135deg,#0866FF,#1877F2)",                 ring: "rgba(8,102,255,0.55)",  label: "Meta Ads" },
  facebook:       { color: "#1877F2", bg: "linear-gradient(135deg,#0866FF,#1877F2)",                 ring: "rgba(8,102,255,0.55)",  label: "Facebook" },
  instagram:      { color: "#E1306C", bg: "linear-gradient(135deg,#F77737,#E1306C,#833AB4)",         ring: "rgba(225,48,108,0.55)", label: "Instagram" },
  google:         { color: "#4285F4", bg: "linear-gradient(135deg,#4285F4,#34A853)",                 ring: "rgba(66,133,244,0.55)", label: "Google Ads" },
  google_organic: { color: "#34A853", bg: "linear-gradient(135deg,#34A853,#4285F4)",                 ring: "rgba(52,168,83,0.55)",  label: "Google Orgánico" },
  tiktok:         { color: "#25F4EE", bg: "linear-gradient(135deg,#25F4EE,#0a0a0f,#FE2C55)",         ring: "rgba(254,44,85,0.55)",  label: "TikTok" },
  youtube:        { color: "#FF0000", bg: "linear-gradient(135deg,#FF0000,#CC0000)",                 ring: "rgba(255,0,0,0.55)",    label: "YouTube" },
  mercadolibre:   { color: "#FFE600", bg: "linear-gradient(135deg,#FFE600,#FFCC00)",                 ring: "rgba(255,230,0,0.55)",  label: "MercadoLibre" },
  email:          { color: "#FBBF24", bg: "linear-gradient(135deg,#FBBF24,#F59E0B)",                 ring: "rgba(251,191,36,0.55)", label: "Email" },
  whatsapp:       { color: "#25D366", bg: "linear-gradient(135deg,#25D366,#128C7E)",                 ring: "rgba(37,211,102,0.55)", label: "WhatsApp" },
  direct:         { color: "#94A3B8", bg: "linear-gradient(135deg,#94A3B8,#475569)",                 ring: "rgba(148,163,184,0.55)", label: "Directo" },
  organic:        { color: "#A78BFA", bg: "linear-gradient(135deg,#A78BFA,#8B5CF6)",                 ring: "rgba(167,139,250,0.55)", label: "Orgánico" },
  referral:       { color: "#F472B6", bg: "linear-gradient(135deg,#F472B6,#EC4899)",                 ring: "rgba(244,114,182,0.55)", label: "Referral" },
};

function metaForChannel(src: string) {
  return (
    CHANNEL_META[src.toLowerCase()] || {
      color: "#9CA3AF",
      bg: "linear-gradient(135deg,#9CA3AF,#6B7280)",
      ring: "rgba(156,163,175,0.55)",
      label: src,
    }
  );
}

// ── SVG icons (white) ─────────────────────────────────────────
function ChannelIcon({ source, size = 20 }: { source: string; size?: number }) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "white" };
  const s = source.toLowerCase();
  switch (s) {
    case "meta":
    case "facebook":
      return (<svg {...props}><path d="M12 10.203c-1.047-1.45-2.183-2.403-3.64-2.403-2.16 0-4.36 2.1-4.36 5.2 0 2.1 1.1 4 3.1 4 1.6 0 2.7-.9 4.1-2.9l.8-1.2.8 1.2c1.4 2 2.5 2.9 4.1 2.9 2 0 3.1-1.9 3.1-4 0-3.1-2.2-5.2-4.36-5.2-1.457 0-2.593.953-3.64 2.403z"/></svg>);
    case "instagram":
      return (<svg {...props}><path d="M12 2.982c2.937 0 3.285.011 4.445.064a6.087 6.087 0 012.042.379 3.408 3.408 0 011.265.823c.37.37.632.803.823 1.265.234.543.362 1.16.379 2.042.053 1.16.064 1.508.064 4.445s-.011 3.285-.064 4.445a6.087 6.087 0 01-.379 2.042 3.643 3.643 0 01-2.088 2.088 6.087 6.087 0 01-2.042.379c-1.16.053-1.508.064-4.445.064s-3.285-.011-4.445-.064a6.087 6.087 0 01-2.042-.379 3.408 3.408 0 01-1.265-.823 3.408 3.408 0 01-.823-1.265 6.087 6.087 0 01-.379-2.042C2.993 15.285 2.982 14.937 2.982 12s.011-3.285.064-4.445a6.087 6.087 0 01.379-2.042c.191-.462.452-.895.823-1.265a3.408 3.408 0 011.265-.823 6.087 6.087 0 012.042-.379C8.715 2.993 9.063 2.982 12 2.982zM12 1c-2.987 0-3.362.013-4.535.066a8.074 8.074 0 00-2.67.511 5.392 5.392 0 00-1.949 1.27 5.392 5.392 0 00-1.27 1.949 8.074 8.074 0 00-.51 2.67C1.013 8.638 1 9.013 1 12s.013 3.362.066 4.535a8.074 8.074 0 00.511 2.67 5.392 5.392 0 001.27 1.949 5.392 5.392 0 001.949 1.27 8.074 8.074 0 002.67.51C8.638 22.987 9.013 23 12 23s3.362-.013 4.535-.066a8.074 8.074 0 002.67-.511 5.625 5.625 0 003.218-3.218 8.074 8.074 0 00.511-2.67C22.987 15.362 23 14.987 23 12s-.013-3.362-.066-4.535a8.074 8.074 0 00-.511-2.67 5.392 5.392 0 00-1.27-1.949 5.392 5.392 0 00-1.949-1.27 8.074 8.074 0 00-2.67-.51C15.362 1.013 14.987 1 12 1zm0 5.351A5.649 5.649 0 1017.649 12 5.649 5.649 0 0012 6.351zm0 9.316A3.667 3.667 0 1115.667 12 3.667 3.667 0 0112 15.667zM18.804 5.34a1.44 1.44 0 10-1.44 1.44 1.44 1.44 0 001.44-1.44z"/></svg>);
    case "google":
    case "google_organic":
      return (<svg {...props}><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fillOpacity="0.85"/><path d="M5.84 14.09A6.68 6.68 0 015.5 12c0-.72.13-1.43.34-2.09V7.07H2.18A11 11 0 001 12c0 1.77.43 3.44 1.18 4.93l3.66-2.84z" fillOpacity="0.7"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fillOpacity="0.55"/></svg>);
    case "tiktok":
      return (<svg {...props}><path d="M16.6 5.82A4.278 4.278 0 0115.54 3h-3.09v12.4a2.592 2.592 0 01-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 004.3 1.38V7.3s-1.88.09-4.24-1.48z"/></svg>);
    case "youtube":
      return (<svg {...props}><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>);
    case "whatsapp":
      return (<svg {...props}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>);
    case "email":
      return (<svg {...props} fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>);
    case "mercadolibre":
      return (<svg {...props}><circle cx="12" cy="12" r="9" fill="white"/><text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#1e3a8a">ML</text></svg>);
    case "direct":
      return (<svg {...props} fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>);
    case "organic":
      return (<svg {...props}><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3 4 0 7-3 9-9V8h-2.5l-.5 1c-1.5-1-2-1-2-1z"/></svg>);
    case "referral":
      return (<svg {...props} fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
    default:
      return <span style={{ color: "white", fontWeight: 700, fontSize: size * 0.55 }}>{source.charAt(0).toUpperCase()}</span>;
  }
}

// ── Helpers ───────────────────────────────────────────────────
function fmtCurrency(n: number, currency = "ARS") {
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${Math.round(n).toLocaleString("es-AR")}`;
  }
}
function fmtRelative(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days}d`;
  return new Date(iso).toLocaleDateString("es-AR");
}
function shortHash(str: string, len = 8) {
  return str?.slice(-len).toUpperCase() || "";
}

// ── Componentes ───────────────────────────────────────────────
function ChannelBubble({ source, label, size = 48, isLast = false, index = 0 }: { source: string; label: string; size?: number; isLast?: boolean; index?: number }) {
  const meta = metaForChannel(source);
  return (
    <div className="flex flex-col items-center gap-2 min-w-[72px]">
      <div className="relative">
        {/* Outer glow ring */}
        <div
          className="absolute inset-0 rounded-full blur-md"
          style={{ background: meta.bg, opacity: 0.45, transform: "scale(1.25)" }}
        />
        <div
          className="relative rounded-full flex items-center justify-center"
          style={{
            width: size,
            height: size,
            background: meta.bg,
            boxShadow: `0 0 24px ${meta.ring}, inset 0 1px 0 rgba(255,255,255,0.18)`,
            border: "1px solid rgba(255,255,255,0.12)",
            animation: isLast ? "pixelJourneyDot 2.4s ease-in-out infinite" : `pixelFadeUp 600ms ease-out ${index * 80}ms both`,
          }}
        >
          <ChannelIcon source={source} size={size * 0.5} />
        </div>
        {isLast && (
          <div
            className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg,#10b981,#059669)",
              boxShadow: "0 0 12px rgba(16,185,129,0.7), 0 0 0 2px #05060a",
            }}
            title="Conversión"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
      </div>
      <span className="text-[10px] font-medium text-cyan-100/70 text-center max-w-[76px] truncate" title={label}>
        {label}
      </span>
    </div>
  );
}

function JourneyConnector() {
  return (
    <div className="flex items-center px-1 mt-[-14px] relative">
      <div
        className="w-7 h-[2px] rounded-full relative overflow-hidden"
        style={{
          background: "linear-gradient(90deg, rgba(6,182,212,0.5), rgba(139,92,246,0.5))",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)",
            animation: "pixelShimmer 2.2s linear infinite",
          }}
        />
      </div>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.85)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; border: string; label: string }> = {
    APPROVED:  { bg: "rgba(16,185,129,0.12)", color: "#34d399", border: "rgba(16,185,129,0.35)", label: "Aprobada" },
    INVOICED:  { bg: "rgba(59,130,246,0.12)", color: "#60a5fa", border: "rgba(59,130,246,0.35)", label: "Facturada" },
    DELIVERED: { bg: "rgba(16,185,129,0.12)", color: "#34d399", border: "rgba(16,185,129,0.35)", label: "Entregada" },
    SHIPPED:   { bg: "rgba(99,102,241,0.12)", color: "#818cf8", border: "rgba(99,102,241,0.35)", label: "Enviada" },
    PENDING:   { bg: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "rgba(245,158,11,0.35)", label: "Pendiente" },
    CANCELLED: { bg: "rgba(239,68,68,0.12)",  color: "#f87171", border: "rgba(239,68,68,0.35)",  label: "Cancelada" },
    RETURNED:  { bg: "rgba(236,72,153,0.12)", color: "#f472b6", border: "rgba(236,72,153,0.35)", label: "Devuelta" },
  };
  const m = map[status] || { bg: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "rgba(148,163,184,0.35)", label: status };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider"
      style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: m.color, boxShadow: `0 0 4px ${m.color}` }} />
      {m.label}
    </span>
  );
}

function JourneyCard({ order, idx }: { order: JourneyOrder; idx: number }) {
  const tps = order.touchpoints.length > 0
    ? order.touchpoints
    : [{ source: "direct", label: "Directo", ts: order.orderDate, medium: null, campaign: null, page: null }];

  return (
    <div
      className="group relative rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(160deg, rgba(15,23,42,0.85), rgba(8,12,24,0.95))",
        border: "1px solid rgba(6,182,212,0.18)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(165,243,252,0.05)",
        animation: `pixelFadeUp 700ms ease-out ${idx * 60}ms both`,
      }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-4 right-4 h-[1px] opacity-70"
        style={{ background: "linear-gradient(90deg, transparent, rgba(6,182,212,0.6), rgba(139,92,246,0.6), transparent)" }}
      />

      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4 border-b border-white/[0.05]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] text-cyan-300/40 uppercase tracking-[0.25em]">Orden</span>
            <span className="font-mono text-[12px] font-semibold text-cyan-50/95">
              #{shortHash(order.externalId) || shortHash(order.orderId)}
            </span>
            <StatusBadge status={order.status} />
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-cyan-100/40">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            </svg>
            <span className="truncate max-w-[180px]">{order.customerEmail || "Cliente anónimo"}</span>
            <span className="text-cyan-300/20">·</span>
            <span>{fmtRelative(order.orderDate)}</span>
            <span className="text-cyan-300/20">·</span>
            <span>{order.itemCount} {order.itemCount === 1 ? "ítem" : "ítems"}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-cyan-300/40">Total</div>
          <div
            className="text-xl font-bold tabular-nums"
            style={{
              background: "linear-gradient(135deg, #06b6d4, #a855f7)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "#a5f3fc",
            }}
          >
            {fmtCurrency(order.totalValue, order.currency)}
          </div>
        </div>
      </div>

      {/* Journey timeline */}
      <div
        className="px-5 py-5 relative"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(6,182,212,0.08), transparent 70%), radial-gradient(ellipse at bottom right, rgba(139,92,246,0.06), transparent 60%)",
        }}
      >
        <div className="flex items-center gap-2 text-[9px] uppercase font-semibold tracking-[0.25em] text-cyan-300/50 mb-4">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24" />
          </svg>
          Customer Journey
          <span className="text-cyan-300/25 normal-case font-normal tracking-normal ml-1">
            · {tps.length} {tps.length === 1 ? "touchpoint" : "touchpoints"}
          </span>
          {order.conversionLag != null && (
            <span className="ml-auto text-cyan-300/40 normal-case font-normal tracking-normal flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              {order.conversionLag}d hasta conversión
            </span>
          )}
        </div>
        <div className="flex items-start gap-0 overflow-x-auto pb-2 -mx-1 px-1 snap-x scrollbar-hide">
          {tps.map((tp, i) => (
            <div key={i} className="flex items-start snap-start">
              <ChannelBubble source={tp.source} label={tp.label} isLast={i === tps.length - 1} index={i} />
              {i < tps.length - 1 && <JourneyConnector />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Pagina principal ──────────────────────────────────────────
export default function CustomerJourneysPage() {
  const [data, setData] = useState<JourneyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Modelo fijo: DATA_DRIVEN (Nitro). La eleccion de modelo vive en /pixel.
    fetch(`/api/metrics/pixel/journeys?limit=${limit}&model=DATA_DRIVEN`)
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j))))
      .then((d: JourneyResponse) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e?.error || "No se pudieron cargar los journeys"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [limit]);

  const stats = useMemo(() => {
    if (!data?.orders?.length) return { total: 0, multiTouch: 0, avgTouches: 0, channels: 0 };
    const total = data.orders.length;
    const multiTouch = data.orders.filter((o) => (o.touchpoints?.length || 0) > 1).length;
    const totalTouches = data.orders.reduce((s, o) => s + (o.touchpoints?.length || 0), 0);
    const channelSet = new Set<string>();
    data.orders.forEach((o) => o.touchpoints?.forEach((t) => channelSet.add(t.source)));
    return {
      total,
      multiTouch,
      avgTouches: total ? +(totalTouches / total).toFixed(1) : 0,
      channels: channelSet.size,
    };
  }, [data]);

  return (
    <div className="min-h-screen text-cyan-50" style={{ background: "#05060a" }}>
      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ═══ HERO ═══ */}
      <div className="relative overflow-hidden border-b border-cyan-500/10">
        {/* Ambient glow background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 30% 20%, rgba(6,182,212,0.16), transparent 70%), radial-gradient(ellipse 50% 60% at 80% 80%, rgba(139,92,246,0.14), transparent 70%)",
          }}
        />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(165,243,252,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(165,243,252,0.6) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            animation: "pixelGridShift 60s linear infinite",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-6 py-10">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.35em] text-cyan-300/40 mb-3">
            <Link href="/nitropixel" className="hover:text-cyan-300 transition-colors">NitroPixel</Link>
            <span className="text-cyan-300/20">/</span>
            <span className="text-cyan-300">Customer Journeys</span>
          </div>

          <h1 className="text-3xl lg:text-5xl font-bold tracking-tight leading-tight">
            <span className="text-cyan-50">El recorrido de cada cliente,</span>
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #06b6d4 0%, #a855f7 50%, #ec4899 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                color: "#a5f3fc",
              }}
            >
              visible por primera vez
            </span>
          </h1>
          <p className="mt-3 text-sm lg:text-base text-cyan-100/55 max-w-2xl leading-relaxed">
            Cada orden es un viaje. NitroPixel reconstruye los touchpoints que tocó tu cliente
            antes de comprar — cookies, sesiones, dispositivos — en un solo recorrido visual.
            Algo que ninguna herramienta en LATAM puede mostrar así.
          </p>

          {/* Stat strip */}
          <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatPill icon="cart"   label="Órdenes"            value={stats.total.toString()} />
            <StatPill icon="branch" label="Multi-touch"        value={`${stats.multiTouch}/${stats.total || 0}`} />
            <StatPill icon="pin"    label="Touchpoints prom."  value={stats.avgTouches.toString()} />
            <StatPill icon="globe"  label="Canales únicos"     value={stats.channels.toString()} />
          </div>
        </div>
      </div>

      {/* ═══ CONTROLS ═══ */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-center gap-1 rounded-xl p-1"
            style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(6,182,212,0.18)" }}
          >
            <span className="px-2 text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-300/40">Mostrar</span>
            {[10, 20, 30, 50].map((n) => (
              <button
                key={n}
                onClick={() => setLimit(n)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                style={{
                  background: limit === n ? "linear-gradient(135deg, #06b6d4, #8b5cf6)" : "transparent",
                  color: limit === n ? "white" : "rgba(165,243,252,0.55)",
                  boxShadow: limit === n ? "0 0 16px rgba(6,182,212,0.45)" : undefined,
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-300/40">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" style={{ boxShadow: "0 0 8px #06b6d4", animation: "pixelHeartbeat 1.6s ease-in-out infinite" }} />
            EN VIVO
          </div>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="max-w-7xl mx-auto px-6 py-8 pb-16">
        {loading && <SkeletonGrid />}
        {!loading && error && (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">⚠</div>
            <p className="text-sm text-cyan-100/50">{error}</p>
          </div>
        )}
        {!loading && !error && data && data.orders.length === 0 && (
          <div className="text-center py-24">
            <div className="text-5xl mb-4 opacity-50">⌬</div>
            <p className="text-lg font-semibold text-cyan-50/90">Todavía no hay journeys atribuidos</p>
            <p className="text-sm text-cyan-100/50 mt-1">Cuando lleguen órdenes con touchpoints del pixel, las vas a ver acá.</p>
          </div>
        )}
        {!loading && !error && data && data.orders.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.orders.map((o, i) => (
              <JourneyCard key={o.orderId} order={o} idx={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({ icon, label, value }: { icon: "cart" | "branch" | "pin" | "globe"; label: string; value: string }) {
  const ICONS: Record<string, JSX.Element> = {
    cart:   (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>),
    branch: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="3" r="3"/><circle cx="6" cy="21" r="3"/><circle cx="18" cy="12" r="3"/><path d="M6 6v3a3 3 0 0 0 3 3h6"/><path d="M6 12v6"/></svg>),
    pin:    (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>),
    globe:  (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>),
  };
  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3 relative overflow-hidden group"
      style={{
        background: "linear-gradient(135deg, rgba(6,182,212,0.08), rgba(139,92,246,0.04))",
        border: "1px solid rgba(6,182,212,0.20)",
      }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ background: "linear-gradient(135deg, rgba(6,182,212,0.10), rgba(139,92,246,0.06))" }}
      />
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-cyan-300"
        style={{ background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.25)" }}
      >
        {ICONS[icon]}
      </div>
      <div className="min-w-0 relative">
        <div className="text-[9px] uppercase tracking-[0.25em] text-cyan-300/45 font-semibold">{label}</div>
        <div className="text-xl font-bold text-cyan-50 tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl p-5 animate-pulse"
          style={{
            background: "linear-gradient(160deg, rgba(15,23,42,0.7), rgba(8,12,24,0.9))",
            border: "1px solid rgba(6,182,212,0.15)",
          }}
        >
          <div className="h-3 bg-cyan-500/10 rounded w-1/3 mb-2" />
          <div className="h-2 bg-cyan-500/10 rounded w-1/2 mb-5" />
          <div className="flex items-center gap-3">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="w-12 h-12 rounded-full bg-cyan-500/10" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
