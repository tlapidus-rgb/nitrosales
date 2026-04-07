"use client";

// ══════════════════════════════════════════════════════════════
// Customer Journeys — visualizacion del recorrido de cada orden
// ══════════════════════════════════════════════════════════════
// Pagina dedicada que muestra las ultimas N ordenes con su
// journey completo de touchpoints (canales que toco el cliente
// antes de comprar). Pensada como demo visual de NitroSales.
// Tema: light, premium, nivel startup unicornio.
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

// ── Channel meta (logo + color) ───────────────────────────────
const CHANNEL_META: Record<string, { color: string; bg: string; label: string }> = {
  meta:           { color: "#0866FF", bg: "linear-gradient(135deg,#0866FF,#1877F2)", label: "Meta Ads" },
  facebook:       { color: "#1877F2", bg: "linear-gradient(135deg,#0866FF,#1877F2)", label: "Facebook" },
  instagram:      { color: "#E1306C", bg: "linear-gradient(135deg,#F77737,#E1306C,#833AB4)", label: "Instagram" },
  google:         { color: "#4285F4", bg: "linear-gradient(135deg,#4285F4,#34A853)", label: "Google Ads" },
  google_organic: { color: "#34A853", bg: "linear-gradient(135deg,#34A853,#4285F4)", label: "Google Orgánico" },
  tiktok:         { color: "#000000", bg: "linear-gradient(135deg,#25F4EE,#000000,#FE2C55)", label: "TikTok" },
  youtube:        { color: "#FF0000", bg: "linear-gradient(135deg,#FF0000,#CC0000)", label: "YouTube" },
  mercadolibre:   { color: "#FFE600", bg: "linear-gradient(135deg,#FFE600,#FFCC00)", label: "MercadoLibre" },
  email:          { color: "#F59E0B", bg: "linear-gradient(135deg,#FBBF24,#F59E0B)", label: "Email" },
  whatsapp:       { color: "#25D366", bg: "linear-gradient(135deg,#25D366,#128C7E)", label: "WhatsApp" },
  direct:         { color: "#64748B", bg: "linear-gradient(135deg,#94A3B8,#64748B)", label: "Directo" },
  organic:        { color: "#8B5CF6", bg: "linear-gradient(135deg,#A78BFA,#8B5CF6)", label: "Orgánico" },
  referral:       { color: "#EC4899", bg: "linear-gradient(135deg,#F472B6,#EC4899)", label: "Referral" },
};

function metaForChannel(src: string) {
  return (
    CHANNEL_META[src.toLowerCase()] || {
      color: "#6B7280",
      bg: "linear-gradient(135deg,#9CA3AF,#6B7280)",
      label: src,
    }
  );
}

// ── SVG icons (white, en tono blanco para contrastar) ─────────
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
      return (<svg {...props}><circle cx="12" cy="12" r="9" fill="white"/><text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#FFE600">ML</text></svg>);
    case "direct":
      return (<svg {...props} fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>);
    case "organic":
      return (<svg {...props}><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3 4 0 7-3 9-9V8h-2.5l-.5 1c-1.5-1-2-1-2-1zm-3 4l-.5.5L13 11l-1 1 .5.5L12 13l1 1 1-1 .5.5.5-.5-.5-.5L15 12l-1-1-.5.5L13 11l.5-.5z"/></svg>);
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
function shortHash(str: string, len = 6) {
  return str?.slice(-len).toUpperCase() || "";
}

// ── Componentes ───────────────────────────────────────────────
function ChannelBubble({ source, label, size = 44, isLast = false }: { source: string; label: string; size?: number; isLast?: boolean }) {
  const meta = metaForChannel(source);
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[64px]">
      <div className="relative">
        <div
          className="rounded-full flex items-center justify-center shadow-lg ring-2 ring-white"
          style={{
            width: size,
            height: size,
            background: meta.bg,
            boxShadow: `0 4px 14px ${meta.color}40, 0 1px 3px rgba(0,0,0,0.06)`,
            animation: isLast ? "pixelJourneyDot 2.4s ease-in-out infinite" : undefined,
          }}
        >
          <ChannelIcon source={source} size={size * 0.5} />
        </div>
        {isLast && (
          <div
            className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-white flex items-center justify-center"
            title="Conversión"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
      </div>
      <span className="text-[10px] font-medium text-gray-600 text-center max-w-[68px] truncate" title={label}>
        {label}
      </span>
    </div>
  );
}

function JourneyArrow() {
  return (
    <div className="flex items-center px-1 mt-[-12px]">
      <div className="w-6 h-[2px] bg-gradient-to-r from-gray-300 to-gray-200 rounded-full" />
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    APPROVED:  { bg: "#dcfce7", color: "#15803d", label: "Aprobada" },
    INVOICED:  { bg: "#dbeafe", color: "#1e40af", label: "Facturada" },
    DELIVERED: { bg: "#d1fae5", color: "#065f46", label: "Entregada" },
    SHIPPED:   { bg: "#e0e7ff", color: "#4338ca", label: "Enviada" },
    PENDING:   { bg: "#fef3c7", color: "#92400e", label: "Pendiente" },
    CANCELLED: { bg: "#fee2e2", color: "#991b1b", label: "Cancelada" },
    RETURNED:  { bg: "#fce7f3", color: "#9d174d", label: "Devuelta" },
  };
  const m = map[status] || { bg: "#f1f5f9", color: "#475569", label: status };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide" style={{ background: m.bg, color: m.color }}>
      <span className="w-1 h-1 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

function JourneyCard({ order }: { order: JourneyOrder }) {
  const tps = order.touchpoints.length > 0 ? order.touchpoints : [{ source: "direct", label: "Directo", ts: order.orderDate, medium: null, campaign: null, page: null }];
  return (
    <div className="group bg-white rounded-2xl border border-gray-200/80 hover:border-orange-300/70 hover:shadow-[0_8px_30px_rgba(251,146,60,0.10)] transition-all duration-300 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4 border-b border-gray-100">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-gray-400 uppercase tracking-wider">Orden</span>
            <span className="font-mono text-[12px] font-semibold text-gray-900">#{shortHash(order.externalId, 8) || shortHash(order.orderId, 8)}</span>
            <StatusBadge status={order.status} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-gray-500">
            <span className="truncate max-w-[200px]">{order.customerEmail || "Cliente anónimo"}</span>
            <span className="text-gray-300">·</span>
            <span>{fmtRelative(order.orderDate)}</span>
            <span className="text-gray-300">·</span>
            <span>{order.itemCount} {order.itemCount === 1 ? "ítem" : "ítems"}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider">Total</div>
          <div className="text-lg font-bold text-gray-900 tabular-nums">{fmtCurrency(order.totalValue, order.currency)}</div>
        </div>
      </div>

      {/* Journey timeline */}
      <div className="px-5 py-5 bg-gradient-to-b from-gray-50/50 to-white">
        <div className="flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider text-gray-400 mb-3">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24" />
          </svg>
          Customer Journey
          <span className="text-gray-300 normal-case font-normal ml-1">· {tps.length} {tps.length === 1 ? "touchpoint" : "touchpoints"}</span>
          {order.conversionLag != null && (
            <span className="ml-auto text-gray-400 normal-case font-normal">⏱ {order.conversionLag}d hasta conversión</span>
          )}
        </div>
        <div className="flex items-start gap-0 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {tps.map((tp, i) => (
            <div key={i} className="flex items-start snap-start">
              <ChannelBubble source={tp.source} label={tp.label} isLast={i === tps.length - 1} />
              {i < tps.length - 1 && <JourneyArrow />}
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
  const [model, setModel] = useState<"DATA_DRIVEN" | "LAST_CLICK" | "FIRST_CLICK" | "LINEAR">("DATA_DRIVEN");
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/metrics/pixel/journeys?limit=${limit}&model=${model}`)
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j))))
      .then((d: JourneyResponse) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e?.error || "No se pudieron cargar los journeys"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [model, limit]);

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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-gray-200/70">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle at 20% 20%, #f97316 0%, transparent 50%), radial-gradient(circle at 80% 80%, #8b5cf6 0%, transparent 50%)",
          }}
        />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-gray-400 mb-2">
            <Link href="/pixel" className="hover:text-orange-500 transition-colors">NitroPixel</Link>
            <span>/</span>
            <span className="text-orange-500">Customer Journeys</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            El recorrido de cada cliente,{" "}
            <span className="bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 bg-clip-text text-transparent">
              visible por primera vez
            </span>
          </h1>
          <p className="mt-2 text-sm text-gray-500 max-w-2xl">
            Cada orden es un viaje. NitroPixel reconstruye los touchpoints que tocó cada cliente
            antes de comprar, conectando cookies, sesiones y dispositivos en un solo journey.
            Algo que ninguna herramienta en LATAM puede mostrar así.
          </p>

          {/* Stat strip */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatPill icon="🛒" label="Órdenes" value={stats.total.toString()} />
            <StatPill icon="🔀" label="Multi-touch" value={`${stats.multiTouch}/${stats.total || 0}`} />
            <StatPill icon="📍" label="Touchpoints prom." value={stats.avgTouches.toString()} />
            <StatPill icon="🌐" label="Canales únicos" value={stats.channels.toString()} />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
            {(["DATA_DRIVEN", "LAST_CLICK", "FIRST_CLICK", "LINEAR"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModel(m)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wide transition-all ${
                  model === m
                    ? "bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {m === "DATA_DRIVEN" ? "Nitro" : m === "LAST_CLICK" ? "Last" : m === "FIRST_CLICK" ? "First" : "Lineal"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
            {[10, 20, 30, 50].map((n) => (
              <button
                key={n}
                onClick={() => setLimit(n)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                  limit === n ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-gray-400 ml-auto">
            Modelo: <span className="font-semibold text-gray-600">{data?.model || "—"}</span>
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading && <SkeletonGrid />}
        {!loading && error && (
          <div className="text-center py-16">
            <div className="text-4xl mb-2">⚠️</div>
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        )}
        {!loading && !error && data && data.orders.length === 0 && (
          <div className="text-center py-20">
            <div className="text-5xl mb-3">🔭</div>
            <p className="text-lg font-semibold text-gray-900">Todavía no hay journeys atribuidos</p>
            <p className="text-sm text-gray-500 mt-1">Cuando lleguen órdenes con touchpoints, las vas a ver acá.</p>
          </div>
        )}
        {!loading && !error && data && data.orders.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.orders.map((o) => (
              <JourneyCard key={o.orderId} order={o} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm flex items-center gap-3">
      <div className="text-xl leading-none">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{label}</div>
        <div className="text-lg font-bold text-gray-900 tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 animate-pulse">
          <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-1/2 mb-5" />
          <div className="flex items-center gap-3">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="w-11 h-11 rounded-full bg-gray-100" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
