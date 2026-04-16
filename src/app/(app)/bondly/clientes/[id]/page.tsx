// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft, MapPin, Mail, Phone, MessageCircle, Copy, Check,
  Crown, Heart, Users, Sparkles, AlertTriangle, Moon, Star,
  ShoppingCart, Eye, MousePointerClick, Package, CreditCard,
  Clock, TrendingUp, TrendingDown, Activity, Globe, Hourglass,
  Zap, Flame, Target, Compass, BarChart3, Shield, Lock,
  ArrowUpRight, ArrowDownRight, RefreshCw, Smartphone, Monitor,
  Tablet, Calendar, CircleDot, Layers, ChevronRight,
} from "lucide-react";
import { formatARS, formatCompact } from "@/lib/utils/format";
import { SourceLogo, CHANNEL_LABEL, CHANNEL_TINT } from "@/components/bondly/SourceLogo";

// ═══════════════════════════════════════════════════════════════════
// Constantes visuales Bondly
// ═══════════════════════════════════════════════════════════════════
const ES = "cubic-bezier(0.16, 1, 0.3, 1)";
const BONDLY_GRAD = "linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #6366f1 100%)";
const VIP_GRAD = "linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #f97316 100%)";
const GOLD_GRAD = "linear-gradient(135deg, #fbbf24 0%, #f97316 100%)";

const TIER_CONFIG: Record<string, { icon: any; accent: string; glow: string; gradient: string; label: string; bg: string }> = {
  VIP: {
    icon: Crown, accent: "#a855f7", glow: "rgba(168,85,247,0.45)",
    gradient: "linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #f97316 100%)",
    bg: "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(236,72,153,0.08))",
    label: "VIP",
  },
  Loyal: {
    icon: Heart, accent: "#ec4899", glow: "rgba(236,72,153,0.35)",
    gradient: "linear-gradient(135deg, #ec4899 0%, #a855f7 100%)",
    bg: "linear-gradient(135deg, rgba(236,72,153,0.08), rgba(168,85,247,0.06))",
    label: "LEAL",
  },
  Regular: {
    icon: Users, accent: "#6366f1", glow: "rgba(99,102,241,0.30)",
    gradient: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
    bg: "linear-gradient(135deg, rgba(99,102,241,0.06), rgba(59,130,246,0.05))",
    label: "REGULAR",
  },
  New: {
    icon: Sparkles, accent: "#06b6d4", glow: "rgba(6,182,212,0.35)",
    gradient: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
    bg: "linear-gradient(135deg, rgba(6,182,212,0.08), rgba(59,130,246,0.06))",
    label: "NUEVO",
  },
  "At Risk": {
    icon: AlertTriangle, accent: "#f59e0b", glow: "rgba(245,158,11,0.40)",
    gradient: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
    bg: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(239,68,68,0.06))",
    label: "EN RIESGO",
  },
  Dormant: {
    icon: Moon, accent: "#94a3b8", glow: "rgba(148,163,184,0.30)",
    gradient: "linear-gradient(135deg, #94a3b8 0%, #64748b 100%)",
    bg: "linear-gradient(135deg, rgba(148,163,184,0.06), rgba(100,116,139,0.05))",
    label: "DORMIDO",
  },
};

const EVENT_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  // Tipos reales que escribe el píxel de NitroSales
  PAGE_VIEW:         { icon: Eye,               color: "#64748b", label: "Vio página" },
  VIEW_PRODUCT:      { icon: Eye,               color: "#3b82f6", label: "Vio producto" },
  ADD_TO_CART:       { icon: ShoppingCart,      color: "#f97316", label: "Agregó al carrito" },
  INITIATE_CHECKOUT: { icon: CreditCard,        color: "#a855f7", label: "Inició checkout" },
  CHECKOUT_SHIPPING: { icon: CreditCard,        color: "#a855f7", label: "Eligió envío" },
  CHECKOUT_PAYMENT:  { icon: CreditCard,        color: "#a855f7", label: "Eligió pago" },
  PURCHASE:          { icon: Zap,               color: "#10b981", label: "Compró" },
  IDENTIFY:          { icon: Users,             color: "#14b8a6", label: "Se identificó" },
  // Variantes GA4-style (por si alguna integración las usa)
  VIEW_ITEM:         { icon: Eye,               color: "#3b82f6", label: "Vio producto" },
  VIEW_ITEM_LIST:    { icon: Layers,            color: "#6366f1", label: "Exploró listado" },
  REMOVE_FROM_CART:  { icon: ShoppingCart,      color: "#94a3b8", label: "Quitó del carrito" },
  BEGIN_CHECKOUT:    { icon: CreditCard,        color: "#a855f7", label: "Inició checkout" },
  SEARCH:            { icon: Compass,           color: "#0891b2", label: "Buscó" },
  SESSION_START:     { icon: CircleDot,         color: "#06b6d4", label: "Sesión iniciada" },
  CLICK:             { icon: MousePointerClick, color: "#6366f1", label: "Click" },
  default:           { icon: Activity,          color: "#64748b", label: "Actividad" },
};

function eventMeta(type: string) {
  return EVENT_CONFIG[type] || EVENT_CONFIG.default;
}

// ─── Timeline label helpers ────────────────────────────────────────
// Convierte un slug (auto-spider-man) en un título humano (Auto Spider Man).
function slugToTitle(slug: string): string {
  if (!slug) return "";
  try {
    const decoded = decodeURIComponent(slug).replace(/\?.*$/, "");
    return decoded
      .replace(/-+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return slug;
  }
}

// Deriva un "qué vio exactamente" del evento, combinando type + pageUrl + productName.
// Devuelve null si no podemos decir nada más concreto que el label del tipo.
function describeEventSubject(item: any): string | null {
  // 1) Si el backend ya nos dio nombre de producto desde props, usamos eso.
  if (item.productName) return item.productName;

  const raw = item.pageUrl;
  if (!raw) return null;

  let path = raw;
  let search = "";
  try {
    const u = new URL(raw);
    path = u.pathname || "/";
    search = u.search || "";
  } catch {
    // raw puede ser un path relativo — lo usamos tal cual
    const qIdx = raw.indexOf("?");
    if (qIdx >= 0) {
      path = raw.slice(0, qIdx);
      search = raw.slice(qIdx);
    }
  }

  const params = new URLSearchParams(search);

  // Home
  if (path === "/" || path === "") return "Home";

  // Checkout / Carrito / Cuenta
  if (path.startsWith("/checkout")) return "Checkout";
  if (path.startsWith("/cart") || path === "/carrito") return "Carrito";
  if (path.startsWith("/account") || path.startsWith("/cuenta") || path.startsWith("/login") || path.startsWith("/ingresar")) {
    return "Mi cuenta";
  }

  // Búsqueda (VTEX usa ?_q=...; genérico usa ?q=...)
  const q = params.get("_q") || params.get("q") || params.get("query");
  if (q) return `Búsqueda: "${q}"`;
  if (path.startsWith("/busqueda") || path.startsWith("/search")) return "Búsqueda";

  // Producto VTEX: la URL termina en /p o /p/
  if (/\/p\/?$/.test(path)) {
    const segs = path.replace(/\/p\/?$/, "").split("/").filter(Boolean);
    const slug = segs[segs.length - 1] || "";
    return slugToTitle(slug);
  }

  // Categoría / departamento VTEX: path con segmentos que no son /p
  const segs = path.split("/").filter(Boolean);
  if (segs.length > 0) {
    return slugToTitle(segs[segs.length - 1]);
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════
function initialsFrom(name: string): string {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarGradientFor(id: string): string {
  const GRADIENTS = [
    "linear-gradient(135deg, #06b6d4 0%, #6366f1 100%)",
    "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
    "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
    "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
    "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)",
    "linear-gradient(135deg, #ec4899 0%, #a855f7 100%)",
    "linear-gradient(135deg, #f97316 0%, #fbbf24 100%)",
    "linear-gradient(135deg, #14b8a6 0%, #0891b2 100%)",
    "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    "linear-gradient(135deg, #0ea5e9 0%, #22d3ee 100%)",
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `hace ${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months > 1 ? "es" : ""}`;
  return `hace ${Math.floor(months / 12)} año${Math.floor(months / 12) > 1 ? "s" : ""}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDateOnly(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

// Count-up hook
function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (target == null || !Number.isFinite(target)) { setValue(0); return; }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, durationMs]);
  return value;
}

// ═══════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════
export default function ClienteDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"email" | "phone" | null>(null);

  useEffect(() => {
    let abort = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const r = await fetch(`/api/bondly/clientes/${id}`, { cache: "no-store" });
        const j = await r.json();
        if (abort) return;
        if (!j.ok) {
          setError(j.error || "Error");
        } else {
          setData(j);
        }
      } catch (e: any) {
        if (!abort) setError(e?.message || "Error");
      } finally {
        if (!abort) setLoading(false);
      }
    }
    if (id) load();
    return () => { abort = true; };
  }, [id]);

  const handleCopy = (which: "email" | "phone", value: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value);
    setCopied(which);
    setTimeout(() => setCopied(null), 1600);
  };

  // ═══════════════════════════════════════════════════════════════
  // Loading state
  // ═══════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className="min-h-screen">
        <style jsx global>{bondlyDetailKeyframes}</style>
        <DetailSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center max-w-md">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <div className="text-lg font-semibold text-red-700">No se pudo cargar el cliente</div>
          <div className="text-sm text-red-600 mt-1">{error || "Cliente no encontrado"}</div>
          <button
            onClick={() => router.push("/bondly/clientes")}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            style={{ transition: `all 200ms ${ES}` }}
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a clientes
          </button>
        </div>
      </div>
    );
  }

  const { customer, stats, segmentation, activity, acquisition, topProducts, timeline } = data;
  const tierCfg = TIER_CONFIG[segmentation.tier] || TIER_CONFIG.Regular;
  const TierIcon = tierCfg.icon;
  const isVIP = segmentation.tier === "VIP";

  return (
    <div className="min-h-screen">
      <style jsx global>{bondlyDetailKeyframes}</style>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* HERO                                                        */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Aurora background */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute -top-32 -left-24 w-[640px] h-[640px] rounded-full opacity-40 blur-3xl"
            style={{ background: `radial-gradient(circle, ${tierCfg.accent}33 0%, transparent 70%)`, animation: `bondlyAuroraFloat 14s ${ES} infinite` }}
          />
          <div
            className="absolute -bottom-40 -right-32 w-[720px] h-[720px] rounded-full opacity-35 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(16,185,129,0.30) 0%, transparent 70%)", animation: `bondlyAuroraFloat 18s ${ES} infinite reverse` }}
          />
          <div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[540px] h-[540px] rounded-full opacity-20 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(6,182,212,0.35) 0%, transparent 70%)" }}
          />
        </div>

        <div className="relative px-6 md:px-8 pt-6 pb-8 max-w-7xl mx-auto">
          {/* Back nav */}
          <button
            onClick={() => router.push("/bondly/clientes")}
            className="group inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-5"
            style={{ transition: `all 200ms ${ES}` }}
          >
            <span
              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white border border-slate-200 group-hover:border-slate-300 group-hover:-translate-x-0.5"
              style={{ transition: `all 200ms ${ES}`, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
            >
              <ArrowLeft className="w-4 h-4" />
            </span>
            <span>Volver a clientes</span>
          </button>

          {/* Header row — avatar + info + actions */}
          <div
            className="flex flex-col lg:flex-row lg:items-start gap-6"
            style={{ animation: `bondlyFadeSlideIn 600ms ${ES} both` }}
          >
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div
                className="relative w-28 h-28 md:w-32 md:h-32 rounded-3xl flex items-center justify-center text-white font-bold text-3xl md:text-4xl tracking-tight"
                style={{
                  background: avatarGradientFor(customer.id),
                  boxShadow: `0 20px 50px -12px ${tierCfg.glow}, 0 0 0 4px white, 0 0 0 5px ${tierCfg.accent}22`,
                  transform: "rotate(-2deg)",
                }}
              >
                {initialsFrom(customer.name)}
                {/* Active indicator */}
                {activity.isActiveNow && (
                  <span
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white flex items-center justify-center"
                    style={{ boxShadow: "0 6px 18px rgba(16,185,129,0.45)" }}
                  >
                    <span
                      className="w-4 h-4 rounded-full bg-emerald-500"
                      style={{ animation: `bondlyLivePulse 1.8s ${ES} infinite` }}
                    />
                  </span>
                )}
              </div>
              {/* Tier corner badge */}
              <div
                className="absolute -top-2 -left-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold text-white tracking-wide"
                style={{
                  background: tierCfg.gradient,
                  boxShadow: `0 6px 18px ${tierCfg.glow}`,
                  transform: "rotate(-6deg)",
                }}
              >
                <TierIcon className="w-3 h-3" />
                {tierCfg.label}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start flex-wrap gap-x-3 gap-y-2">
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
                  {customer.name}
                </h1>
                {isVIP && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                    style={{
                      background: VIP_GRAD,
                      boxShadow: "0 6px 18px rgba(236,72,153,0.30)",
                      animation: `bondlyShimmer 3s linear infinite`,
                      backgroundSize: "200% 100%",
                    }}
                  >
                    <Crown className="w-3 h-3" />
                    TOP {100 - stats.clvRank}%
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600">
                {customer.email && (
                  <button
                    onClick={() => handleCopy("email", customer.email)}
                    className="inline-flex items-center gap-1.5 hover:text-slate-900"
                    style={{ transition: `all 180ms ${ES}` }}
                    title="Copiar email"
                  >
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-medium">{customer.email}</span>
                    {copied === "email"
                      ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                      : <Copy className="w-3 h-3 text-slate-300" />}
                  </button>
                )}
                {customer.phone && (
                  <button
                    onClick={() => handleCopy("phone", customer.phone)}
                    className="inline-flex items-center gap-1.5 hover:text-slate-900"
                    style={{ transition: `all 180ms ${ES}` }}
                    title="Copiar teléfono"
                  >
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-medium">{customer.phone}</span>
                    {copied === "phone"
                      ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                      : <Copy className="w-3 h-3 text-slate-300" />}
                  </button>
                )}
                {(customer.city || customer.state) && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{[customer.city, customer.state].filter(Boolean).join(", ")}</span>
                  </span>
                )}
                {activity.isActiveNow && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ animation: `bondlyLivePulse 1.6s ${ES} infinite` }} />
                    NAVEGANDO AHORA
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-slate-500">
                {stats.firstOrderAt && (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Primera compra {formatDateOnly(stats.firstOrderAt)}
                  </span>
                )}
                <span className="text-slate-300">·</span>
                {activity.lastVisitAt && (
                  <span className="inline-flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    Última visita {formatRelative(activity.lastVisitAt)}
                  </span>
                )}
                {stats.lastOrderAt && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="inline-flex items-center gap-1">
                      <ShoppingCart className="w-3 h-3" />
                      Última compra {formatRelative(stats.lastOrderAt)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 lg:flex-col lg:w-[200px]">
              {customer.phone && (
                <a
                  href={`https://wa.me/${customer.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                  style={{
                    background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
                    boxShadow: "0 8px 22px -6px rgba(37,211,102,0.45)",
                    transition: `all 220ms ${ES}`,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </a>
              )}
              {customer.email && (
                <a
                  href={`mailto:${customer.email}`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200"
                  style={{
                    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                    transition: `all 220ms ${ES}`,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
                >
                  <Mail className="w-4 h-4" />
                  Enviar email
                </a>
              )}
            </div>
          </div>

          {/* KPI strip */}
          <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiTile
              icon={<TrendingUp className="w-4 h-4" />}
              label="Gastado total"
              value={<FormatCurrency value={stats.totalSpent} />}
              accent="#10b981"
              delay={0}
            />
            <KpiTile
              icon={<ShoppingCart className="w-4 h-4" />}
              label="Órdenes"
              value={<CountUpNum target={stats.totalOrders} />}
              accent="#06b6d4"
              delay={60}
            />
            <KpiTile
              icon={<CreditCard className="w-4 h-4" />}
              label="Ticket promedio"
              value={<FormatCurrency value={stats.avgTicket} />}
              accent="#6366f1"
              delay={120}
            />
            <KpiTile
              icon={<Clock className="w-4 h-4" />}
              label="Recencia"
              value={
                stats.recencyDays != null
                  ? <><CountUpNum target={stats.recencyDays} /><span className="text-[11px] font-semibold text-slate-400 ml-1">días</span></>
                  : <span className="text-slate-400 text-base">—</span>
              }
              accent="#f59e0b"
              delay={180}
            />
            <KpiTile
              icon={<Crown className="w-4 h-4" />}
              label="CLV rank"
              value={<><CountUpNum target={stats.clvRank} />%</>}
              accent="#a855f7"
              delay={240}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MAIN GRID                                                   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section className="relative px-6 md:px-8 pb-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ═════════════════ LEFT (timeline — 2 cols) ════════════ */}
          <div className="lg:col-span-2 space-y-5">
            {/* Timeline card */}
            <Card title="Timeline de actividad" icon={<Activity className="w-4 h-4" />} delay={60}>
              {timeline.length === 0 ? (
                <EmptyInline icon={<Activity className="w-5 h-5" />} text="Sin actividad registrada" />
              ) : (
                <TimelineList items={timeline} />
              )}
            </Card>
          </div>

          {/* ═════════════════ RIGHT (sidebar) ═════════════════════ */}
          <div className="lg:col-span-1 space-y-5">
            {/* Segment & predictions */}
            <Card title="Segmentación & predicciones" icon={<Target className="w-4 h-4" />} delay={120}>
              <div className="space-y-4">
                {/* Tier box */}
                <div
                  className="rounded-xl p-4 flex items-center gap-3"
                  style={{
                    background: tierCfg.bg,
                    border: `1px solid ${tierCfg.accent}22`,
                  }}
                >
                  <div
                    className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-white"
                    style={{
                      background: tierCfg.gradient,
                      boxShadow: `0 8px 22px -6px ${tierCfg.glow}`,
                    }}
                  >
                    <TierIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Tier · {segmentation.segment}
                    </div>
                    <div className="text-lg font-bold text-slate-900">
                      {tierCfg.label}
                    </div>
                  </div>
                </div>

                {/* Churn + Purchase prob bars */}
                <ProbabilityBar
                  label="Probabilidad de próxima compra"
                  value={segmentation.nextPurchaseProbability}
                  color="#10b981"
                  icon={<TrendingUp className="w-3.5 h-3.5" />}
                />
                <ProbabilityBar
                  label="Riesgo de churn"
                  value={segmentation.churnRisk}
                  color="#f59e0b"
                  inverted
                  icon={<AlertTriangle className="w-3.5 h-3.5" />}
                />

                {/* CLV rank + avg gap */}
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat
                    label="CLV rank"
                    value={`${stats.clvRank}%`}
                    hint={stats.clvRank >= 80 ? "top" : stats.clvRank >= 50 ? "medio" : "bajo"}
                    accent="#a855f7"
                  />
                  <MiniStat
                    label="Cadencia"
                    value={stats.avgGapDays != null ? `${stats.avgGapDays}d` : "—"}
                    hint="entre compras"
                    accent="#06b6d4"
                  />
                </div>

                {/* Next category */}
                {segmentation.nextCategory && (
                  <div
                    className="rounded-xl px-3 py-2.5 flex items-center gap-2"
                    style={{
                      background: "linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(99,102,241,0.06) 100%)",
                      border: "1px solid rgba(6,182,212,0.18)",
                    }}
                  >
                    <Compass className="w-3.5 h-3.5 text-cyan-600" />
                    <div className="text-[11px] text-slate-600">
                      Próximo probable:
                      <span className="ml-1 font-semibold text-slate-900">{segmentation.nextCategory}</span>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Acquisition */}
            <Card title="Adquisición" icon={<Compass className="w-4 h-4" />} delay={180}>
              {acquisition.channel ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{
                        background: `${CHANNEL_TINT[acquisition.channel] || "#94a3b8"}14`,
                        border: `1px solid ${CHANNEL_TINT[acquisition.channel] || "#94a3b8"}24`,
                      }}
                    >
                      <SourceLogo channel={acquisition.channel as any} size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Primer canal</div>
                      <div className="text-sm font-bold text-slate-900">
                        {CHANNEL_LABEL[acquisition.channel] || acquisition.channel}
                      </div>
                    </div>
                  </div>
                  {(acquisition.campaign || acquisition.source || acquisition.medium) && (
                    <div className="space-y-1.5 text-[12px]">
                      {acquisition.campaign && <AttrRow label="Campaña" value={acquisition.campaign} />}
                      {acquisition.source && <AttrRow label="Fuente" value={acquisition.source} />}
                      {acquisition.medium && <AttrRow label="Medio" value={acquisition.medium} />}
                    </div>
                  )}
                  {acquisition.firstTouchAt && (
                    <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                      Primer toque: {formatDateTime(acquisition.firstTouchAt)}
                    </div>
                  )}
                </div>
              ) : (
                <EmptyInline icon={<Compass className="w-5 h-5" />} text="Sin datos de adquisición" />
              )}
            </Card>

            {/* Top products */}
            <Card title="Productos favoritos" icon={<Package className="w-4 h-4" />} delay={240}>
              {topProducts.length === 0 ? (
                <EmptyInline icon={<Package className="w-5 h-5" />} text="Sin productos registrados" />
              ) : (
                <div className="space-y-2">
                  {topProducts.map((p: any, idx: number) => (
                    <ProductRow key={p.productId || idx} product={p} rank={idx + 1} />
                  ))}
                </div>
              )}
            </Card>

            {/* Activity summary */}
            <Card title="Actividad on-site" icon={<Eye className="w-4 h-4" />} delay={300}>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat
                  label="Sesiones"
                  value={<CountUpNum target={activity.totalSessions} />}
                  accent="#06b6d4"
                />
                <MiniStat
                  label="Páginas vistas"
                  value={<CountUpNum target={activity.totalPageViews} />}
                  accent="#6366f1"
                />
              </div>
              {Object.keys(activity.deviceBreakdown || {}).length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Dispositivos</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(activity.deviceBreakdown).map(([d, _n]) => (
                      <DeviceChip key={d} device={d} />
                    ))}
                  </div>
                </div>
              )}
              {activity.firstSeenAt && (
                <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  Primera visita {formatDateOnly(activity.firstSeenAt)}
                </div>
              )}
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Subcomponents
// ═══════════════════════════════════════════════════════════════════

function KpiTile({
  icon, label, value, accent, delay = 0,
}: { icon: React.ReactNode; label: string; value: React.ReactNode; accent: string; delay?: number }) {
  return (
    <div
      className="relative rounded-2xl bg-white border border-slate-200 p-4 overflow-hidden"
      style={{
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 10px 30px -15px rgba(15,23,42,0.10)",
        animation: `bondlyFadeSlideIn 500ms ${ES} ${delay}ms both`,
        transition: `all 280ms ${ES}`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLElement).style.boxShadow = `0 1px 2px rgba(15,23,42,0.04), 0 16px 38px -18px ${accent}55`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 2px rgba(15,23,42,0.04), 0 10px 30px -15px rgba(15,23,42,0.10)";
      }}
    >
      {/* Accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accent }} />
      {/* Glow */}
      <div
        className="absolute -top-8 -right-8 w-28 h-28 rounded-full opacity-15 blur-2xl pointer-events-none"
        style={{ background: accent }}
      />
      <div className="relative flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
        <span style={{ color: accent }}>{icon}</span>
        {label}
      </div>
      <div className="relative text-xl font-bold text-slate-900 tabular-nums tracking-tight">
        {value}
      </div>
    </div>
  );
}

function Card({
  title, icon, children, delay = 0, action,
}: { title: string; icon?: React.ReactNode; children: React.ReactNode; delay?: number; action?: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl bg-white border border-slate-200 overflow-hidden"
      style={{
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 10px 30px -15px rgba(15,23,42,0.08)",
        animation: `bondlyFadeSlideIn 500ms ${ES} ${delay}ms both`,
      }}
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {icon && <span className="text-slate-400">{icon}</span>}
          {title}
        </div>
        {action}
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}

function EmptyInline({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-slate-400">
      <div className="mb-2">{icon}</div>
      <div className="text-sm">{text}</div>
    </div>
  );
}

function ProbabilityBar({
  label, value, color, inverted, icon,
}: { label: string; value: number; color: string; inverted?: boolean; icon?: React.ReactNode }) {
  const animated = useCountUp(value, 900);
  const v = Math.max(0, Math.min(100, value));
  // Banner color: if inverted (churn), red at high values, green at low.
  const severity = inverted
    ? v >= 70 ? "#ef4444" : v >= 40 ? "#f59e0b" : "#10b981"
    : v >= 60 ? "#10b981" : v >= 30 ? "#06b6d4" : "#94a3b8";
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
          <span style={{ color: severity }}>{icon}</span>
          {label}
        </div>
        <div className="text-[13px] font-bold tabular-nums" style={{ color: severity }}>
          {Math.round(animated)}%
        </div>
      </div>
      <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${v}%`,
            background: `linear-gradient(90deg, ${severity}99 0%, ${severity} 100%)`,
            transition: `width 900ms ${ES}`,
            boxShadow: `0 0 14px ${severity}77`,
          }}
        />
      </div>
    </div>
  );
}

function MiniStat({
  label, value, hint, accent,
}: { label: string; value: React.ReactNode; hint?: string; accent: string }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{
        background: `${accent}08`,
        border: `1px solid ${accent}18`,
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
        {label}
      </div>
      <div className="text-base font-bold text-slate-900 tabular-nums tracking-tight">
        {value}
      </div>
      {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
}

function AttrRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800 max-w-[160px] truncate" title={value}>{value}</span>
    </div>
  );
}

function ProductRow({ product, rank }: { product: any; rank: number }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-slate-50"
      style={{ transition: `all 180ms ${ES}` }}
    >
      {/* Rank */}
      <div
        className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
        style={{
          background: rank === 1 ? GOLD_GRAD : rank === 2 ? "linear-gradient(135deg, #94a3b8 0%, #64748b 100%)" : "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)",
        }}
      >
        {rank}
      </div>
      {/* Thumb */}
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-10 h-10 rounded-lg object-cover border border-slate-200"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
          <Package className="w-4 h-4 text-slate-400" />
        </div>
      )}
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-slate-900 truncate" title={product.name}>
          {product.name}
        </div>
        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
          {product.category && (
            <>
              <span className="truncate max-w-[120px]" title={product.category}>{product.category}</span>
              <span className="text-slate-300">·</span>
            </>
          )}
          <span>{product.quantity}u</span>
        </div>
      </div>
      {/* Spent */}
      <div className="text-right flex-shrink-0">
        <div className="text-[12px] font-bold text-slate-900 tabular-nums">
          {formatARS(product.totalSpent)}
        </div>
      </div>
    </div>
  );
}

function DeviceChip({ device }: { device: string }) {
  const cfg = device === "mobile" ? { icon: Smartphone, label: "Móvil", color: "#06b6d4" }
            : device === "tablet" ? { icon: Tablet, label: "Tablet", color: "#6366f1" }
            : { icon: Monitor, label: "Desktop", color: "#475569" };
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{
        background: `${cfg.color}12`,
        color: cfg.color,
        border: `1px solid ${cfg.color}22`,
      }}
    >
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Timeline
// ═══════════════════════════════════════════════════════════════════
function TimelineList({ items }: { items: any[] }) {
  // Group by day
  const groups = useMemo(() => {
    const out: Array<{ day: string; items: any[] }> = [];
    let currentDay = "";
    for (const it of items) {
      const d = new Date(it.timestamp);
      const dayKey = d.toDateString();
      if (dayKey !== currentDay) {
        currentDay = dayKey;
        out.push({ day: d.toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }), items: [] });
      }
      out[out.length - 1].items.push(it);
    }
    return out;
  }, [items]);

  return (
    <div className="relative pl-5">
      {/* Vertical line */}
      <div
        className="absolute left-[9px] top-2 bottom-2 w-px"
        style={{ background: "linear-gradient(to bottom, #e2e8f0 0%, #e2e8f0 50%, transparent 100%)" }}
      />
      <div className="space-y-5">
        {groups.map((g, gi) => (
          <div key={gi}>
            <div
              className="relative -ml-5 pl-5 mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500"
              style={{ animation: `bondlyFadeSlideIn 400ms ${ES} ${gi * 40}ms both` }}
            >
              <span className="inline-block w-3 h-3 rounded-full bg-slate-200 -ml-[23px] mr-3 border-2 border-white align-middle" />
              {g.day}
            </div>
            <div className="space-y-2">
              {g.items.map((it, i) => (
                <TimelineItem key={it.id || `${gi}-${i}`} item={it} delay={gi * 40 + i * 20} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineItem({ item, delay }: { item: any; delay: number }) {
  if (item.kind === "order") {
    return <TimelineOrder item={item} delay={delay} />;
  }
  return <TimelineEvent item={item} delay={delay} />;
}

function TimelineOrder({ item, delay }: { item: any; delay: number }) {
  return (
    <div
      className="relative rounded-xl pl-3 pr-3 py-2.5 border"
      style={{
        background: "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(6,182,212,0.04) 100%)",
        borderColor: "rgba(16,185,129,0.22)",
        animation: `bondlyFadeSlideIn 420ms ${ES} ${delay}ms both`,
      }}
    >
      {/* Bullet */}
      <span
        className="absolute -left-[25px] top-3 w-3.5 h-3.5 rounded-full flex items-center justify-center"
        style={{ background: BONDLY_GRAD, boxShadow: "0 0 0 3px white, 0 6px 14px rgba(16,185,129,0.35)" }}
      >
        <Zap className="w-2 h-2 text-white" />
      </span>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
              style={{ background: BONDLY_GRAD }}
            >
              <Zap className="w-2.5 h-2.5" />
              Compra
            </span>
            <span className="text-[10px] text-slate-500">
              {new Date(item.timestamp).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="text-[13px] font-semibold text-slate-900 truncate">
            Orden #{item.externalId}
            <span className="ml-2 text-[11px] font-normal text-slate-500">
              · {item.itemCount} {item.itemCount === 1 ? "producto" : "productos"}
            </span>
          </div>
          {(item.paymentMethod || item.trafficSource) && (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
              {item.paymentMethod && (
                <span className="inline-flex items-center gap-1">
                  <CreditCard className="w-3 h-3" />
                  {item.paymentMethod}
                </span>
              )}
              {item.paymentMethod && item.trafficSource && <span className="text-slate-300">·</span>}
              {item.trafficSource && (
                <span className="inline-flex items-center gap-1">
                  <Compass className="w-3 h-3" />
                  {item.trafficSource}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-[15px] font-bold text-emerald-600 tabular-nums tracking-tight">
            {formatARS(item.total)}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineEvent({ item, delay }: { item: any; delay: number }) {
  const cfg = eventMeta(item.type);
  const Icon = cfg.icon;
  const subject = describeEventSubject(item);

  return (
    <div
      className="relative rounded-lg pl-3 pr-3 py-2 border border-slate-200 bg-white"
      style={{
        animation: `bondlyFadeSlideIn 380ms ${ES} ${delay}ms both`,
      }}
      title={item.pageUrl || undefined}
    >
      <span
        className="absolute -left-[25px] top-2.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
        style={{
          background: "white",
          boxShadow: `0 0 0 3px white, 0 0 0 4px ${cfg.color}`,
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
      </span>
      <div className="flex items-center gap-2">
        <span
          className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: `${cfg.color}14`, color: cfg.color }}
        >
          <Icon className="w-3 h-3" />
        </span>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-[12px] font-semibold text-slate-800 flex-shrink-0">{cfg.label}</span>
          {subject && (
            <span
              className="text-[12px] text-slate-600 truncate"
              title={subject}
            >
              · {subject}
            </span>
          )}
          {item.value != null && (
            <span className="text-[11px] font-semibold text-emerald-600 tabular-nums flex-shrink-0">
              {formatARS(item.value)}
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400 flex-shrink-0 tabular-nums">
          {new Date(item.timestamp).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

function safeUrlPath(u: string): string {
  try {
    const x = new URL(u);
    return x.pathname + (x.search || "");
  } catch {
    return u;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Format helpers (inside component tree)
// ═══════════════════════════════════════════════════════════════════
function CountUpNum({ target }: { target: number }) {
  const v = useCountUp(target || 0, 900);
  return <span>{Math.round(v).toLocaleString("es-AR")}</span>;
}

function FormatCurrency({ value }: { value: number }) {
  const v = useCountUp(value || 0, 950);
  return <span>{formatARS(v)}</span>;
}

// ═══════════════════════════════════════════════════════════════════
// Skeleton
// ═══════════════════════════════════════════════════════════════════
function DetailSkeleton() {
  return (
    <div className="px-6 md:px-8 py-6 max-w-7xl mx-auto">
      <div className="h-5 w-40 rounded bg-slate-100 mb-5 animate-pulse" />
      <div className="flex flex-col lg:flex-row gap-6 mb-8">
        <div className="w-32 h-32 rounded-3xl bg-slate-100 animate-pulse" />
        <div className="flex-1 space-y-3">
          <div className="h-8 w-64 rounded bg-slate-100 animate-pulse" />
          <div className="h-4 w-80 rounded bg-slate-100 animate-pulse" />
          <div className="h-4 w-48 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-[86px] rounded-2xl bg-slate-100 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 h-[500px] rounded-2xl bg-slate-100 animate-pulse" />
        <div className="space-y-4">
          <div className="h-[200px] rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-[200px] rounded-2xl bg-slate-100 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Keyframes
// ═══════════════════════════════════════════════════════════════════
const bondlyDetailKeyframes = `
  @keyframes bondlyFadeSlideIn {
    0% { opacity: 0; transform: translateY(8px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes bondlyLivePulse {
    0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(16,185,129,0.55); }
    50% { opacity: 0.85; transform: scale(1.08); box-shadow: 0 0 0 8px rgba(16,185,129,0); }
  }
  @keyframes bondlyShimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @keyframes bondlyAuroraFloat {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(20px, -15px) scale(1.05); }
    66% { transform: translate(-15px, 10px) scale(0.97); }
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
`;
