// @ts-nocheck
"use client";

// ═══════════════════════════════════════════════════════════════════
// BONDLY · SEÑALES (Live)
// ═══════════════════════════════════════════════════════════════════
// Híbrido: Moments curados + Live Feed.
// Zonas:
//   1. Hero + KPIs live
//   2. Moments (eventos curados con acciones)
//   3. Live Feed (stream continuo con auto-refresh)
//
// Benchmark: Linear Realtime · Stripe Sigma · Vercel Observability
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Waves, Heart, Crown, Repeat, ShoppingCart, Flame, UserCheck,
  MessageCircle, Mail, ExternalLink, Copy, Check, Loader2,
  Eye, CreditCard, MousePointerClick, ArrowRight, Zap,
  Filter, Radio, Sparkles, User as UserIcon,
} from "lucide-react";

// ─── Constants ─────────────────────────────────────────────────────
const ES = "cubic-bezier(0.16, 1, 0.3, 1)";
const BONDLY_GRAD = "linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #6366f1 100%)";
const SIGNAL_GRAD = "linear-gradient(135deg, #06b6d4 0%, #6366f1 50%, #8b5cf6 100%)";

// ─── Types ─────────────────────────────────────────────────────────
type MomentType =
  | "VIP_ACTIVE" | "REAPPEARANCE" | "HIGH_VALUE_ABANDON"
  | "INTENSE_INTEREST" | "CHECKOUT_STARTED" | "NEW_IDENTIFIED";

interface Visitor {
  visitorId: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  deviceType: string | null;
  isIdentified: boolean;
  displayName: string;
  customerId: string | null;
}

interface Moment {
  id: string;
  type: MomentType;
  priority: "high" | "medium" | "low";
  title: string;
  subtitle: string;
  when: string;
  visitor: Visitor;
  context: Record<string, any>;
  actions: Array<{ type: string; label: string; href?: string }>;
}

interface FeedItem {
  id: string;
  timestamp: string;
  eventType: string;
  visitor: Visitor;
  pageUrl: string | null;
  productName: string | null;
  value: number | null;
}

interface SignalsResponse {
  ok: boolean;
  updatedAt: string;
  kpis: {
    activeVisitors5min: number;
    identifiedActive30min: number;
    signalsLast24h: number;
    highValueAbandoned: number;
  };
  moments: Moment[];
  feed: FeedItem[];
}

// ─── Moment visual config ──────────────────────────────────────────
const MOMENT_CONFIG: Record<MomentType, { icon: any; accent: string; label: string }> = {
  VIP_ACTIVE:         { icon: Crown,            accent: "#a855f7", label: "VIP ACTIVO" },
  REAPPEARANCE:       { icon: Repeat,           accent: "#10b981", label: "REAPARICIÓN" },
  HIGH_VALUE_ABANDON: { icon: ShoppingCart,     accent: "#f97316", label: "CARRITO ABANDONADO" },
  INTENSE_INTEREST:   { icon: Flame,            accent: "#ef4444", label: "INTERÉS ALTO" },
  CHECKOUT_STARTED:   { icon: CreditCard,       accent: "#0891b2", label: "CHECKOUT" },
  NEW_IDENTIFIED:     { icon: UserCheck,        accent: "#06b6d4", label: "NUEVO CONTACTO" },
};

const EVENT_ICONS: Record<string, { icon: any; color: string }> = {
  PAGE_VIEW:     { icon: Eye,                color: "#64748b" },
  VIEW_PRODUCT:  { icon: Eye,                color: "#6366f1" },
  ADD_TO_CART:   { icon: ShoppingCart,       color: "#f97316" },
  PURCHASE:      { icon: Check,              color: "#10b981" },
  IDENTIFY:      { icon: UserCheck,          color: "#06b6d4" },
  CHECKOUT:      { icon: CreditCard,         color: "#0891b2" },
  CUSTOM:        { icon: MousePointerClick,  color: "#94a3b8" },
};

function eventLabel(type: string): string {
  switch (type) {
    case "PAGE_VIEW":    return "vio una página";
    case "VIEW_PRODUCT": return "vio un producto";
    case "ADD_TO_CART":  return "agregó al carrito";
    case "PURCHASE":     return "compró";
    case "IDENTIFY":     return "se identificó";
    case "CHECKOUT":     return "inició checkout";
    default:             return type.toLowerCase().replace(/_/g, " ");
  }
}

// ─── Time formatting ───────────────────────────────────────────────
function useNow(intervalMs = 1000): number {
  const [t, setT] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setT(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return t;
}

function formatRelative(isoDate: string, now: number): string {
  const d = new Date(isoDate).getTime();
  const secs = Math.max(0, Math.floor((now - d) / 1000));
  if (secs < 5)   return "ahora";
  if (secs < 60)  return `hace ${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

// ─── Count-up hook ─────────────────────────────────────────────────
function useCountUp(target: number, durationMs = 800): number {
  const [val, setVal] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef<number>(0);

  useEffect(() => {
    fromRef.current = val;
    startRef.current = null;
    const to = target;
    const from = fromRef.current;

    let raf = 0;
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const p = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - p, 4);
      setVal(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return val;
}

// ─── Main page ─────────────────────────────────────────────────────
export default function SenalesPage() {
  const [data, setData] = useState<SignalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedFilter, setFeedFilter] = useState<"all" | "identified" | "anonymous">("all");
  const [isTabVisible, setIsTabVisible] = useState(true);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await fetch("/api/bondly/senales", { cache: "no-store", signal });
      if (!r.ok) return;
      const j = (await r.json()) as SignalsResponse;
      if (j?.ok) setData(j);
    } catch { /* noop */ }
  }, []);

  // Initial load
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    fetchData(ac.signal).finally(() => setLoading(false));
    return () => ac.abort();
  }, [fetchData]);

  // Visibility API — sólo refetch si la pestaña está visible
  useEffect(() => {
    const onVis = () => setIsTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Polling auto-refresh cada 7s
  useEffect(() => {
    if (!isTabVisible) return;
    const id = window.setInterval(() => { fetchData(); }, 7000);
    return () => window.clearInterval(id);
  }, [fetchData, isTabVisible]);

  const filteredFeed = useMemo(() => {
    if (!data?.feed) return [];
    if (feedFilter === "all") return data.feed;
    if (feedFilter === "identified") return data.feed.filter((f) => f.visitor.isIdentified);
    return data.feed.filter((f) => !f.visitor.isIdentified);
  }, [data?.feed, feedFilter]);

  return (
    <div className="space-y-10 pb-16 -mx-6 lg:-mx-10 -mt-6 lg:-mt-8">
      <style jsx global>{`
        @keyframes senalesLive {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(6,182,212,0.6); }
          50%      { opacity: 0.6; box-shadow: 0 0 0 6px rgba(6,182,212,0); }
        }
        @keyframes senalesShimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes senalesFadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .senales-shimmer {
          background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0) 100%);
          background-size: 200% 100%;
          animation: senalesShimmer 2.2s linear infinite;
        }
      `}</style>

      {/* ═════════ Zona 1: HERO + KPIs ═════════ */}
      <section className="relative overflow-hidden">
        {/* Aurora background */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -top-32 -left-40 w-[640px] h-[640px] rounded-full blur-3xl opacity-30" style={{ background: "radial-gradient(closest-side, rgba(6,182,212,0.55), transparent 70%)" }} />
          <div className="absolute -top-24 right-[-160px] w-[560px] h-[560px] rounded-full blur-3xl opacity-25" style={{ background: "radial-gradient(closest-side, rgba(139,92,246,0.55), transparent 70%)" }} />
          <div className="absolute bottom-[-160px] left-1/3 w-[520px] h-[520px] rounded-full blur-3xl opacity-20" style={{ background: "radial-gradient(closest-side, rgba(99,102,241,0.5), transparent 70%)" }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 lg:px-10 pt-12 pb-6">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="flex-1 min-w-0">
              {/* Eyebrow + live dot */}
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white/80 backdrop-blur-sm px-3 py-1 text-[11px] font-mono tracking-[0.28em] uppercase text-cyan-700 shadow-sm">
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-cyan-500" style={{ animation: "senalesLive 2s infinite" }} />
                Señales · Live
              </div>

              <h1 className="mt-4 text-[34px] lg:text-[42px] font-semibold tracking-tight text-slate-900 leading-[1.08]">
                Lo que está pasando
                <br/>
                <span style={{ backgroundImage: SIGNAL_GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  ahora mismo
                </span>
              </h1>

              <p className="mt-3 text-[15px] text-slate-600 leading-relaxed max-w-2xl">
                Cada señal es una oportunidad de activar a un cliente en el momento exacto.
                Bondly detecta los momentos que importan y te muestra exactamente qué hacer con cada uno.
              </p>
            </div>

            {/* Quick-glance aside */}
            <div className="shrink-0 flex items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 backdrop-blur-sm px-3 py-2 shadow-sm">
                <Radio size={14} className="text-cyan-600" />
                <span className="text-[11px] font-medium text-slate-600">
                  Actualización cada 7s
                </span>
                {loading && <Loader2 size={12} className="animate-spin text-slate-400" />}
              </div>
            </div>
          </div>

          {/* KPIs strip */}
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
            <KpiTile
              label="Activos ahora"
              value={data?.kpis.activeVisitors5min ?? 0}
              helper="últimos 5 min"
              icon={Zap}
              color="#06b6d4"
              live
            />
            <KpiTile
              label="Identificados activos"
              value={data?.kpis.identifiedActive30min ?? 0}
              helper="últimos 30 min"
              icon={UserCheck}
              color="#10b981"
              live
            />
            <KpiTile
              label="Señales 24h"
              value={data?.kpis.signalsLast24h ?? 0}
              helper="eventos capturados"
              icon={Sparkles}
              color="#8b5cf6"
            />
            <KpiTile
              label="Carritos abandonados"
              value={data?.kpis.highValueAbandoned ?? 0}
              helper="últimas 2h · sin compra"
              icon={ShoppingCart}
              color="#f97316"
            />
          </div>
        </div>

        {/* Prism delimiter */}
        <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
          <div className="h-px w-full" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.6) 20%, rgba(139,92,246,0.6) 50%, rgba(16,185,129,0.6) 80%, transparent 100%)" }} />
        </div>
      </section>

      {/* ═════════ Zona 2: MOMENTS ═════════ */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-[10px] font-mono tracking-[0.28em] uppercase text-slate-500 flex items-center gap-2">
              <Flame size={12} className="text-orange-500" />
              Moments · Oportunidades activas
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
              {data?.moments.length ? `${data.moments.length} momentos accionables` : "Esperando señales..."}
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Eventos curados con alto valor de negocio y acción sugerida
            </p>
          </div>
        </div>

        {/* Moments grid */}
        {!loading && (!data?.moments || data.moments.length === 0) ? (
          <EmptyState
            icon={Sparkles}
            title="No hay moments activos en este momento"
            subtitle="Cuando un cliente VIP se conecte, alguien deje un carrito alto o un visitante vuelva después de tiempo, vas a ver la señal acá."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {loading && !data
              ? Array.from({ length: 4 }).map((_, i) => <MomentSkeleton key={i} />)
              : data!.moments.map((m) => <MomentCard key={m.id} moment={m} />)
            }
          </div>
        )}
      </section>

      {/* ═════════ Zona 3: LIVE FEED ═════════ */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] font-mono tracking-[0.28em] uppercase text-slate-500 flex items-center gap-2">
              <Radio size={12} className="text-cyan-500" />
              Live Feed · Todos los eventos
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
              Stream en tiempo real
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Últimos eventos · identificados y anónimos · últimas 24h
            </p>
          </div>

          {/* Filter chips */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {([
              { k: "all",         label: "Todos" },
              { k: "identified",  label: "Identificados" },
              { k: "anonymous",   label: "Anónimos" },
            ] as const).map((opt) => (
              <button
                key={opt.k}
                onClick={() => setFeedFilter(opt.k)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  feedFilter === opt.k
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                style={{ transitionTimingFunction: ES }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <FeedList items={filteredFeed} loading={loading && !data} />
      </section>
    </div>
  );
}

// ─── KpiTile ────────────────────────────────────────────────────────
function KpiTile({
  label, value, helper, icon: Icon, color, live,
}: {
  label: string;
  value: number;
  helper: string;
  icon: any;
  color: string;
  live?: boolean;
}) {
  const animatedValue = useCountUp(value);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm p-4 shadow-sm">
      {/* Inner glow */}
      <div
        className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl opacity-25 pointer-events-none"
        style={{ background: `radial-gradient(closest-side, ${color}66, transparent 70%)` }}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: `${color}15`, color }}
            >
              <Icon size={14} />
            </div>
            <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-slate-500">
              {label}
            </span>
          </div>
          <p className="mt-2 text-[26px] font-semibold tracking-tight text-slate-900 tabular-nums">
            {animatedValue.toLocaleString("es-AR")}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{helper}</p>
        </div>
        {live && (
          <span
            className="relative inline-flex w-2 h-2 rounded-full"
            style={{ background: color, animation: "senalesLive 2s infinite" }}
          />
        )}
      </div>
    </div>
  );
}

// ─── MomentCard ─────────────────────────────────────────────────────
function MomentCard({ moment }: { moment: Moment }) {
  const now = useNow(1000);
  const config = MOMENT_CONFIG[moment.type];
  const Icon = config.icon;
  const isHigh = moment.priority === "high";

  const [copiedEmail, setCopiedEmail] = useState(false);
  const handleCopyEmail = useCallback(() => {
    if (!moment.visitor.email) return;
    navigator.clipboard.writeText(moment.visitor.email);
    setCopiedEmail(true);
    window.setTimeout(() => setCopiedEmail(false), 1800);
  }, [moment.visitor.email]);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all"
      style={{
        borderColor: isHigh ? `${config.accent}40` : "rgb(226 232 240)",
        transitionTimingFunction: ES,
        transitionDuration: "220ms",
        animation: "senalesFadeSlideIn 320ms ease-out",
      }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: config.accent }}
      />
      {/* Glow in top-right */}
      <div
        className="absolute -top-20 -right-20 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: `radial-gradient(closest-side, ${config.accent}, transparent 70%)` }}
      />

      <div className="relative p-5 pl-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `${config.accent}15`, color: config.accent }}
            >
              <Icon size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-mono tracking-[0.2em] uppercase"
                  style={{
                    background: `${config.accent}15`,
                    color: config.accent,
                    border: `1px solid ${config.accent}30`,
                  }}
                >
                  {config.label}
                </span>
                {isHigh && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 border border-orange-200 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-orange-700">
                    <Flame size={8} />
                    high
                  </span>
                )}
                {moment.visitor.isIdentified && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-700">
                    <UserCheck size={8} />
                    identificado
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
            {formatRelative(moment.when, now)}
          </span>
        </div>

        {/* Title + subtitle */}
        <div className="mt-3">
          <h3 className="text-[17px] font-semibold text-slate-900 leading-snug">
            {moment.title}
          </h3>
          <p className="mt-1 text-[13px] text-slate-600 leading-relaxed">
            {moment.subtitle}
          </p>
        </div>

        {/* Identity + metadata */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          {moment.visitor.email && (
            <span className="inline-flex items-center gap-1">
              <Mail size={10} className="text-slate-400" />
              <span className="text-slate-700 font-medium">{moment.visitor.email}</span>
            </span>
          )}
          {moment.visitor.phone && (
            <span className="inline-flex items-center gap-1">
              <MessageCircle size={10} className="text-slate-400" />
              <span className="text-slate-700 font-medium">{moment.visitor.phone}</span>
            </span>
          )}
          {moment.visitor.city && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              {moment.visitor.city}
            </span>
          )}
          {moment.visitor.deviceType && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              {moment.visitor.deviceType}
            </span>
          )}
        </div>

        {/* Actions */}
        {moment.actions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {moment.actions.map((a, i) => {
              if (a.type === "whatsapp") {
                return (
                  <a
                    key={i}
                    href={a.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition-all shadow-sm"
                    style={{ transitionTimingFunction: ES }}
                  >
                    <MessageCircle size={12} />
                    {a.label}
                  </a>
                );
              }
              if (a.type === "email") {
                return (
                  <a
                    key={i}
                    href={a.href}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-all"
                    style={{ transitionTimingFunction: ES }}
                  >
                    <Mail size={12} />
                    {a.label}
                  </a>
                );
              }
              if (a.type === "view_profile") {
                return (
                  <Link
                    key={i}
                    href={a.href ?? "#"}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-white transition-all shadow-sm"
                    style={{ transitionTimingFunction: ES }}
                  >
                    <UserIcon size={12} />
                    {a.label}
                    <ArrowRight size={12} />
                  </Link>
                );
              }
              if (a.type === "copy_email") {
                return (
                  <button
                    key={i}
                    onClick={handleCopyEmail}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-all"
                    style={{ transitionTimingFunction: ES }}
                  >
                    {copiedEmail ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    {copiedEmail ? "Copiado" : a.label}
                  </button>
                );
              }
              return null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MomentSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="h-4 w-20 bg-slate-100 rounded mb-3 senales-shimmer" />
      <div className="h-5 w-3/4 bg-slate-100 rounded mb-2 senales-shimmer" />
      <div className="h-3 w-1/2 bg-slate-100 rounded mb-4 senales-shimmer" />
      <div className="flex gap-2">
        <div className="h-7 w-24 bg-slate-100 rounded-lg senales-shimmer" />
        <div className="h-7 w-20 bg-slate-100 rounded-lg senales-shimmer" />
      </div>
    </div>
  );
}

// ─── Feed List ──────────────────────────────────────────────────────
function FeedList({ items, loading }: { items: FeedItem[]; loading: boolean }) {
  const now = useNow(1000);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm divide-y divide-slate-50">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-5 py-3 flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-slate-100 senales-shimmer" />
            <div className="flex-1">
              <div className="h-3 w-40 bg-slate-100 rounded senales-shimmer" />
              <div className="mt-1 h-3 w-72 bg-slate-100 rounded senales-shimmer" />
            </div>
            <div className="h-3 w-16 bg-slate-100 rounded senales-shimmer" />
          </div>
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon={Radio}
        title="Sin actividad en este filtro"
        subtitle="Los eventos aparecen acá a medida que ocurren."
      />
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="max-h-[700px] overflow-y-auto divide-y divide-slate-50">
        {items.map((it) => <FeedRow key={it.id} item={it} now={now} />)}
      </div>
    </div>
  );
}

function FeedRow({ item, now }: { item: FeedItem; now: number }) {
  const cfg = EVENT_ICONS[item.eventType] ?? EVENT_ICONS.CUSTOM;
  const Icon = cfg.icon;
  const isIdentified = item.visitor.isIdentified;

  return (
    <div
      className={`relative px-5 py-3 flex items-center gap-3 transition-colors ${
        isIdentified ? "hover:bg-slate-50/70" : "hover:bg-slate-50/50 opacity-80"
      }`}
      style={{
        transitionTimingFunction: ES,
        animation: "senalesFadeSlideIn 260ms ease-out",
      }}
    >
      {/* Event icon */}
      <div
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ background: `${cfg.color}15`, color: cfg.color }}
      >
        <Icon size={14} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[13px] truncate ${
              isIdentified ? "text-slate-900 font-medium" : "text-slate-500"
            }`}
          >
            {item.visitor.displayName}
          </span>
          {isIdentified && (
            <span className="inline-flex items-center rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-700">
              <span className="w-1 h-1 rounded-full bg-emerald-500 mr-1" />
              ident.
            </span>
          )}
          <span className="text-[12px] text-slate-500">{eventLabel(item.eventType)}</span>
          {item.productName && (
            <span className="text-[12px] text-slate-700 font-medium truncate max-w-[280px]">
              · {item.productName}
            </span>
          )}
          {item.value != null && item.value > 0 && (
            <span className="text-[11px] text-slate-500 tabular-nums">
              · ${Math.round(item.value).toLocaleString("es-AR")}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
          {item.visitor.city && <span>{item.visitor.city}</span>}
          {item.visitor.city && item.visitor.deviceType && <span>·</span>}
          {item.visitor.deviceType && <span>{item.visitor.deviceType}</span>}
          {item.pageUrl && (
            <>
              <span>·</span>
              <span className="truncate max-w-[260px]" title={item.pageUrl}>
                {shortenUrl(item.pageUrl)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Time */}
      <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
        {formatRelative(item.timestamp, now)}
      </span>
    </div>
  );
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 30 ? u.pathname.slice(0, 30) + "…" : u.pathname;
    return path === "/" ? u.host : path;
  } catch {
    return url.length > 40 ? url.slice(0, 40) + "…" : url;
  }
}

// ─── EmptyState ─────────────────────────────────────────────────────
function EmptyState({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 backdrop-blur-sm p-10 text-center">
      <div className="inline-flex w-12 h-12 rounded-full bg-slate-100 items-center justify-center text-slate-400 mb-3">
        <Icon size={20} />
      </div>
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <p className="mt-1 text-[12px] text-slate-500 max-w-md mx-auto leading-relaxed">{subtitle}</p>
    </div>
  );
}
