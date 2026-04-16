"use client";

// ══════════════════════════════════════════════════════════════════════
// Bondly — Overview (hub)
// ──────────────────────────────────────────────────────────────────────
// Entry-point del módulo de clientes y fidelización.
//
// Zonas:
//  1. Hero (gradient emerald → cyan → indigo + aurora + prism delimiter)
//  2. Pulse Banner (2 timelines: Commerce + Pixel Live — el differentiator)
//  3. KPI strip (clientes / LTV / recompra / audiencias)
//  4. Señales live preview (top 5 eventos pixel de última hora)
//  5. Mapa RFM clickeable (7 segmentos)
//  6. Quick access (Clientes / LTV / Audiencias / Señales)
//  7. Value statement (footer emocional orientado a resultados)
//
// Benchmark: Linear / Stripe / Vercel. First-class product.
// ══════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Users, Heart, Sparkles, TrendingUp, ArrowRight, Star,
  AlertTriangle, UserPlus, XCircle, Zap, Target, Layers,
  DollarSign, RefreshCw, Radio, ShoppingCart, Eye, UserCheck,
  Globe, Smartphone, Laptop, Activity, Waves,
} from "lucide-react";
import { formatARS, formatCompact } from "@/lib/utils/format";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";
const BONDLY_GRAD = "linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #6366f1 100%)";
const COMMERCE_GRAD = "linear-gradient(90deg, #10b981 0%, #059669 100%)";
const PIXEL_GRAD = "linear-gradient(90deg, #06b6d4 0%, #6366f1 50%, #8b5cf6 100%)";

// ─── Helpers ──────────────────────────────────────────────────────────

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

type RangeKey = "ultimos_30" | "ultimos_90" | "ultimos_365" | "todo";

function computeRange(key: RangeKey): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  if (key === "ultimos_30") {
    const from = new Date(now); from.setDate(now.getDate() - 30); return { from, to };
  }
  if (key === "ultimos_90") {
    const from = new Date(now); from.setDate(now.getDate() - 90); return { from, to };
  }
  if (key === "todo") {
    const from = new Date(now); from.setDate(now.getDate() - 730); return { from, to };
  }
  const from = new Date(now); from.setDate(now.getDate() - 365);
  return { from, to };
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

function formatMonthLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", { month: "short", year: "2-digit" });
}

function formatAgoSeconds(secs: number | null): string {
  if (secs === null || secs === undefined) return "sin actividad";
  if (secs < 60) return `hace ${secs}s`;
  if (secs < 3600) return `hace ${Math.floor(secs / 60)}min`;
  if (secs < 86400) return `hace ${Math.floor(secs / 3600)}h`;
  return `hace ${Math.floor(secs / 86400)}d`;
}

function formatAgoMinutes(mins: number | null): string {
  if (mins === null || mins === undefined) return "sin actividad";
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}min`;
  if (mins < 1440) return `hace ${Math.floor(mins / 60)}h`;
  return `hace ${Math.floor(mins / 1440)}d`;
}

// ─── Count-up hook ────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const start = prevRef.current;
    const startTs = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - startTs) / duration);
      const eased = 1 - Math.pow(1 - p, 4); // easeOutQuart
      const v = start + (target - start) * eased;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// ─── Live "hace X segundos" ticker ────────────────────────────────────
function useLiveSecondsAgo(lastEventIso: string | null) {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (!lastEventIso) { setSeconds(null); return; }
    const compute = () => {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(lastEventIso).getTime()) / 1000));
      setSeconds(diff);
    };
    compute();
    const id = window.setInterval(compute, 1000);
    return () => window.clearInterval(id);
  }, [lastEventIso]);
  return seconds;
}

// ─── Segment metadata ─────────────────────────────────────────────────

const SEGMENTS: Array<{
  key: string;
  label: string;
  icon: any;
  desc: string;
  color: string;
}> = [
  { key: "Champions", label: "Champions", icon: Star, desc: "Gastan mucho, compran siempre", color: "#10b981" },
  { key: "Leales", label: "Leales", icon: Heart, desc: "Clientes recurrentes fieles", color: "#6366f1" },
  { key: "Potenciales", label: "Potenciales", icon: TrendingUp, desc: "Segunda compra reciente", color: "#f59e0b" },
  { key: "Nuevos", label: "Nuevos", icon: UserPlus, desc: "Primera compra este mes", color: "#06b6d4" },
  { key: "En riesgo", label: "En riesgo", icon: AlertTriangle, desc: "No compran hace 90+ días", color: "#ef4444" },
  { key: "Ocasionales", label: "Ocasionales", icon: Users, desc: "Compran esporádicamente", color: "#94a3b8" },
  { key: "Perdidos", label: "Perdidos", icon: XCircle, desc: "Sin actividad hace 180+ días", color: "#6b7280" },
];

// ─── Event type metadata ──────────────────────────────────────────────

function eventMeta(type: string): { label: string; icon: any; color: string } {
  switch (type) {
    case "PURCHASE": return { label: "Compró", icon: ShoppingCart, color: "#10b981" };
    case "ADD_TO_CART": return { label: "Agregó al carrito", icon: ShoppingCart, color: "#f59e0b" };
    case "VIEW_PRODUCT": return { label: "Vio producto", icon: Eye, color: "#06b6d4" };
    case "IDENTIFY": return { label: "Se identificó", icon: UserCheck, color: "#8b5cf6" };
    case "PAGE_VIEW": return { label: "Navega", icon: Eye, color: "#64748b" };
    default: return { label: type, icon: Activity, color: "#64748b" };
  }
}

// ─── Types ────────────────────────────────────────────────────────────

type PulseResp = {
  ok: boolean;
  commerce: {
    firstOrderAt: string | null;
    lastOrderAt: string | null;
    daysCovered: number;
    totalOrders: number;
    ordersLast24h: number;
    ordersLast60min: number;
    lastOrderMinutesAgo: number | null;
    timeline30d: Array<{ day: string; count: number }>;
  };
  pixel: {
    firstEventAt: string | null;
    lastEventAt: string | null;
    daysCovered: number;
    totalEvents: number;
    eventsLast24h: number;
    eventsLast5min: number;
    activeVisitors5min: number;
    lastEventSecondsAgo: number | null;
    timeline30d: Array<{ day: string; count: number }>;
  };
  signalsPreview: Array<{
    id: string;
    type: string;
    visitorLabel: string;
    identified: boolean;
    country: string | null;
    deviceType: string | null;
    pageUrl: string | null;
    receivedAt: string;
  }>;
};

// ─── Page ─────────────────────────────────────────────────────────────

export default function BondlyOverviewPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ultimos_365");
  const [data, setData] = useState<any>(null);
  const [audienceSummary, setAudienceSummary] = useState<any>(null);
  const [pulse, setPulse] = useState<PulseResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => computeRange(rangeKey), [rangeKey]);

  useEffect(() => {
    let cancel = false;
    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const from = toInputDate(range.from);
        const to = toInputDate(range.to);
        const [custRes, audRes, pulseRes] = await Promise.all([
          fetch(`/api/metrics/customers?from=${from}&to=${to}`, { cache: "no-store" }),
          fetch(`/api/audiences`, { cache: "no-store" }).catch(() => null),
          fetch(`/api/bondly/pulse`, { cache: "no-store" }).catch(() => null),
        ]);
        if (!custRes.ok) throw new Error(`customers ${custRes.status}`);
        const custJson = await custRes.json();
        const audJson = audRes && audRes.ok ? await audRes.json() : null;
        const pulseJson = pulseRes && pulseRes.ok ? await pulseRes.json() : null;
        if (cancel) return;
        setData(custJson);
        setAudienceSummary(audJson?.summary ?? null);
        setPulse(pulseJson?.ok ? pulseJson : null);
      } catch (e: any) {
        if (!cancel) setError(e?.message || "Error cargando datos");
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    fetchAll();
    return () => { cancel = true; };
  }, [range.from, range.to]);

  // Refresh pulse silently every 15s
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/bondly/pulse`, { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (j?.ok) setPulse(j);
        }
      } catch { /* noop */ }
    }, 15000);
    return () => window.clearInterval(id);
  }, []);

  // KPI derivations ─────────────────────────────────────────────────
  const totalCustomers = Number(data?.kpis?.totalCustomers ?? 0) || 0;
  const avgLtv = Number(data?.kpis?.avgSpentPerCustomer ?? 0) || 0;
  const repeatPct = Number(data?.kpis?.repeatRate ?? 0) || 0;
  const totalAudiences = Number(audienceSummary?.totalAudiences ?? 0) || 0;
  const activeAudiences = Number(audienceSummary?.activeAudiences ?? audienceSummary?.active ?? 0) || 0;

  const rfm = (data?.rfmSegments ?? data?.segments ?? []) as Array<{ segment: string; customers: number | string; revenue?: number | string }>;
  const rfmMap = useMemo(() => {
    const m = new Map<string, { customers: number; revenue: number }>();
    for (const r of rfm) m.set(r.segment, { customers: Number(r.customers) || 0, revenue: Number(r.revenue) || 0 });
    return m;
  }, [rfm]);

  const totalCustomersCount = useCountUp(totalCustomers, 900);
  const ltvCount = useCountUp(avgLtv, 900);
  const repeatCount = useCountUp(repeatPct, 900);
  const audienceCount = useCountUp(totalAudiences, 900);

  const topSegment = useMemo(() => {
    let best: { key: string; customers: number; revenue: number } | null = null;
    for (const [k, v] of rfmMap.entries()) {
      if (!best || v.revenue > best.revenue) best = { key: k, ...v };
    }
    return best;
  }, [rfmMap]);

  const liveSecondsAgo = useLiveSecondsAgo(pulse?.pixel?.lastEventAt ?? null);

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-[#fbfbfd] to-[#f4f5f8]">
      {/* ═════════ Zona 1: HERO ═════════ */}
      <section className="relative overflow-hidden border-b border-slate-900/[0.06]">
        {/* Aurora gradients */}
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <div style={{ position: "absolute", top: "-30%", left: "-10%", width: "55%", height: "120%", background: "radial-gradient(circle, rgba(16,185,129,0.22) 0%, transparent 60%)", filter: "blur(50px)" }} />
          <div style={{ position: "absolute", top: "-20%", left: "25%", width: "45%", height: "110%", background: "radial-gradient(circle, rgba(6,182,212,0.22) 0%, transparent 60%)", filter: "blur(55px)" }} />
          <div style={{ position: "absolute", top: "-15%", right: "-10%", width: "50%", height: "110%", background: "radial-gradient(circle, rgba(99,102,241,0.22) 0%, transparent 60%)", filter: "blur(60px)" }} />
        </div>
        {/* Prism delimiter bottom */}
        <div aria-hidden className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: BONDLY_GRAD }} />

        <div className="relative max-w-7xl mx-auto px-6 lg:px-10 py-10 lg:py-14">
          <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-6">
            <div className="flex items-start gap-4">
              {/* Logo badge */}
              <div className="relative flex-shrink-0" style={{ animation: "bondlyBreathe 3.5s ease-in-out infinite" }}>
                <div className="absolute inset-[-8px] rounded-[22px] blur-2xl opacity-70" style={{ background: BONDLY_GRAD }} />
                <div className="relative w-14 h-14 rounded-[18px] flex items-center justify-center shadow-lg" style={{ background: BONDLY_GRAD, boxShadow: "0 10px 30px -8px rgba(16,185,129,0.35), 0 0 0 1px rgba(255,255,255,0.55) inset" }}>
                  <Heart className="w-7 h-7 text-white" strokeWidth={2.2} />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-mono tracking-[0.28em] uppercase text-slate-500">Módulo</span>
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(99,102,241,0.15))", color: "#0f766e", letterSpacing: "0.05em" }}>
                    <Sparkles className="w-3 h-3" /> LOYALTY · CDP
                  </span>
                </div>
                <h1 className="text-[44px] leading-[1.05] font-semibold tracking-tight text-slate-900">
                  <span style={{ background: BONDLY_GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Bondly</span>
                </h1>
                <p className="mt-2 max-w-xl text-[15px] text-slate-600 leading-relaxed">
                  El único lugar donde tus ventas y el comportamiento real de cada cliente viven juntos. Entendé quién compra, qué mira, cuándo vuelve y activalo todo.
                </p>
              </div>
            </div>

            {/* Period selector */}
            <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-[0_1px_0_rgba(15,23,42,0.06),0_8px_24px_-12px_rgba(15,23,42,0.18)] border border-slate-900/[0.06]">
              {(["ultimos_30","ultimos_90","ultimos_365","todo"] as RangeKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setRangeKey(k)}
                  className="relative px-3 py-1.5 text-xs font-medium rounded-lg transition-[color,background] duration-200"
                  style={{
                    color: rangeKey === k ? "#fff" : "#475569",
                    background: rangeKey === k ? BONDLY_GRAD : "transparent",
                    transitionTimingFunction: ES,
                  }}
                >
                  {k === "ultimos_30" ? "30 días" : k === "ultimos_90" ? "90 días" : k === "ultimos_365" ? "1 año" : "Todo"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═════════ Zona 2: PULSE BANNER (el differentiator) ═════════ */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-8">
        <PulseBanner pulse={pulse} loading={loading} liveSecondsAgo={liveSecondsAgo} />
      </section>

      {/* ═════════ Zona 3: KPI strip ═════════ */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <BondlyKpi
            label="Clientes totales"
            value={formatCompact(Math.round(totalCustomersCount))}
            subvalue={pulse && pulse.pixel.activeVisitors5min > 0 ? `${pulse.pixel.activeVisitors5min} activos ahora` : undefined}
            accent="#10b981"
            icon={Users}
            delayMs={0}
            loading={loading}
          />
          <BondlyKpi
            label="LTV promedio"
            value={formatARS(Math.round(ltvCount))}
            subvalue={pulse && pulse.commerce.ordersLast24h > 0 ? `${pulse.commerce.ordersLast24h} órdenes 24h` : undefined}
            accent="#06b6d4"
            icon={DollarSign}
            delayMs={60}
            loading={loading}
          />
          <BondlyKpi
            label="Tasa de recompra"
            value={`${repeatCount.toFixed(1)}%`}
            accent="#6366f1"
            icon={RefreshCw}
            delayMs={120}
            loading={loading}
          />
          <BondlyKpi
            label="Audiencias creadas"
            value={Math.round(audienceCount).toString()}
            subvalue={activeAudiences ? `${activeAudiences} activas` : undefined}
            accent="#8b5cf6"
            icon={Radio}
            delayMs={180}
            loading={loading}
          />
        </div>
      </section>

      {/* ═════════ Zona 4: SEÑALES LIVE preview ═════════ */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-10">
        <SignalsPreview pulse={pulse} />
      </section>

      {/* ═════════ Zona 5: RFM map ═════════ */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-10">
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-[10px] font-mono tracking-[0.28em] uppercase text-slate-500">Segmentación RFM</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
              Mapa de clientes por comportamiento
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">Clickeá cualquier segmento para ver esos clientes en detalle.</p>
          </div>
          {topSegment && (
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-900/[0.06] rounded-xl px-3 py-1.5 shadow-[0_1px_0_rgba(15,23,42,0.05)]">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-slate-500">Segmento estrella:</span>
              <span className="font-semibold text-slate-900">{topSegment.key}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {SEGMENTS.map((seg, idx) => {
            const stat = rfmMap.get(seg.key);
            const customers = stat?.customers ?? 0;
            const revenue = stat?.revenue ?? 0;
            return (
              <Link
                key={seg.key}
                href={`/bondly/clientes?segment=${encodeURIComponent(seg.key)}`}
                className="group relative rounded-2xl bg-white border border-slate-900/[0.06] p-4 overflow-hidden transition-[transform,box-shadow,border-color] duration-[260ms] hover:-translate-y-0.5 hover:border-slate-900/10"
                style={{
                  transitionTimingFunction: ES,
                  animation: `bondlyStagger 520ms ${ES} ${idx * 55}ms both`,
                  boxShadow: "0 1px 0 rgba(15,23,42,0.05), 0 8px 24px -16px rgba(15,23,42,0.18)",
                }}
              >
                <div aria-hidden className="absolute -top-8 -right-8 w-20 h-20 rounded-full opacity-30 group-hover:opacity-60 transition-opacity duration-[260ms]" style={{ background: `radial-gradient(circle, ${seg.color}55 0%, transparent 60%)`, transitionTimingFunction: ES }} />
                <div className="relative flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${seg.color}14`, color: seg.color }}>
                    <seg.icon className="w-4 h-4" strokeWidth={2.2} />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-900 transition-colors duration-200" style={{ transitionTimingFunction: ES }} />
                </div>
                <div className="mt-3">
                  <p className="text-[11px] font-mono tracking-[0.22em] uppercase text-slate-500">{seg.label}</p>
                  <p className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight text-slate-900">
                    {customers > 0 ? formatCompact(customers) : "—"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">clientes</p>
                  {revenue > 0 && (
                    <p className="mt-1.5 text-[11px] text-slate-400 tabular-nums">
                      {formatARS(revenue)} ingresos
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-slate-500 leading-snug">{seg.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ═════════ Zona 6: QUICK ACCESS ═════════ */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-10">
        <div>
          <p className="text-[10px] font-mono tracking-[0.28em] uppercase text-slate-500">Explorar</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
            Entrá al detalle
          </h2>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickAccessCard
            href="/bondly/clientes"
            badge="CLIENTES"
            title="Base de clientes"
            desc="Tabla completa con filtros, búsqueda y drill-down por cliente."
            accent="#10b981"
            icon={Users}
            stat={totalCustomers > 0 ? `${formatCompact(totalCustomers)} clientes` : undefined}
          />
          <QuickAccessCard
            href="/bondly/ltv"
            badge="LIFETIME VALUE"
            title="LTV y churn"
            desc="Predicción de valor futuro y riesgo de pérdida por cohorte."
            accent="#06b6d4"
            icon={Target}
            stat={avgLtv > 0 ? `${formatARS(avgLtv)} LTV prom.` : undefined}
          />
          <QuickAccessCard
            href="/bondly/audiencias"
            badge="AUDIENCIAS"
            title="Audience Sync"
            desc="Creá segmentos y sincronizalos a Meta, Google o exportá a CRM."
            accent="#6366f1"
            icon={Layers}
            stat={totalAudiences > 0 ? `${totalAudiences} audiencias` : "Crear primera"}
          />
          <QuickAccessCard
            href="/bondly/senales"
            badge="SEÑALES"
            title="Señales en vivo"
            desc="Feed real-time de momentos de oportunidad por cliente."
            accent="#8b5cf6"
            icon={Waves}
            stat={pulse ? `${pulse.pixel.eventsLast5min} eventos / 5min` : undefined}
            comingSoon={true}
          />
        </div>
      </section>

      {/* ═════════ Zona 7: VALUE STATEMENT (footer emocional) ═════════ */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-14 pb-16">
        <div
          className="relative overflow-hidden rounded-3xl border border-slate-900/[0.06] p-8 lg:p-12"
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)",
            boxShadow: "0 1px 0 rgba(15,23,42,0.08), 0 20px 60px -24px rgba(15,23,42,0.45)",
          }}
        >
          {/* Aurora en el footer */}
          <div aria-hidden className="absolute inset-0 pointer-events-none">
            <div style={{ position: "absolute", top: "-40%", left: "-10%", width: "60%", height: "180%", background: "radial-gradient(circle, rgba(16,185,129,0.22) 0%, transparent 60%)", filter: "blur(60px)" }} />
            <div style={{ position: "absolute", top: "-30%", right: "-10%", width: "55%", height: "160%", background: "radial-gradient(circle, rgba(99,102,241,0.28) 0%, transparent 60%)", filter: "blur(70px)" }} />
          </div>
          {/* Prism top */}
          <div aria-hidden className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: BONDLY_GRAD }} />

          <div className="relative grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-8 items-center">
            <div>
              <span className="inline-flex items-center gap-2 text-[10px] font-mono tracking-[0.28em] uppercase text-emerald-300/80">
                <Sparkles className="w-3 h-3" /> Qué hace único a Bondly
              </span>
              <h3 className="mt-3 text-[28px] lg:text-[32px] font-semibold tracking-tight text-white leading-[1.15]">
                Commerce <span style={{ background: "linear-gradient(90deg,#34d399,#22d3ee)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>+</span> comportamiento,<br/>por primera vez en un mismo lugar.
              </h3>
              <p className="mt-3 text-[15px] text-slate-300 leading-relaxed max-w-2xl">
                Los CDPs muestran eventos. Los CRMs muestran compras. Bondly muestra <span className="text-white font-medium">la historia completa</span>: cómo llegó cada cliente, qué lo enamoró, cuándo va a volver, y cómo activarlo hoy —en tiempo real.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  "Unifica VTEX + MELI + NitroPixel",
                  "Customer 360 enriquecido",
                  "Audiencias por comportamiento",
                  "Señales live accionables",
                ].map((chip) => (
                  <span key={chip} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium text-slate-200 bg-white/5 border border-white/10 backdrop-blur-sm">
                    <span className="w-1 h-1 rounded-full" style={{ background: "#34d399" }} />
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            {/* Stat proof grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatProof label="Días de datos" value={pulse?.commerce.daysCovered ?? 0} suffix="d" accent="#34d399" />
              <StatProof label="Eventos trackeados" value={pulse?.pixel.totalEvents ?? 0} accent="#22d3ee" />
              <StatProof label="Órdenes procesadas" value={pulse?.commerce.totalOrders ?? 0} accent="#a78bfa" />
              <StatProof label="Clientes únicos" value={totalCustomers} accent="#f472b6" />
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-6 text-xs text-rose-500 font-mono">Error: {error}</p>
        )}
      </section>

      {/* Global animations */}
      <style jsx global>{`
        @keyframes bondlyStagger {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes bondlyBreathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @keyframes bondlyPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.35); }
        }
        @keyframes bondlyShimmer {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }
        @keyframes bondlyLiveDot {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.6); }
          50% { box-shadow: 0 0 0 8px rgba(34,197,94,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </main>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Sub-components
// ═════════════════════════════════════════════════════════════════════

// ─── PulseBanner: las 2 timelines ─────────────────────────────────────

function PulseBanner({ pulse, loading, liveSecondsAgo }: { pulse: PulseResp | null; loading: boolean; liveSecondsAgo: number | null }) {
  const commerceStart = pulse?.commerce.firstOrderAt ?? null;
  const pixelStart = pulse?.pixel.firstEventAt ?? null;
  const hasCommerce = !!commerceStart;
  const hasPixel = !!pixelStart;

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-white border border-slate-900/[0.06] p-6"
      style={{
        boxShadow: "0 1px 0 rgba(15,23,42,0.06), 0 10px 28px -16px rgba(15,23,42,0.2), 0 28px 48px -32px rgba(15,23,42,0.16)",
        animation: `bondlyStagger 560ms ${ES} both`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono tracking-[0.28em] uppercase text-slate-500">Pulso de Bondly</span>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80">
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ animation: "bondlyLiveDot 2s infinite" }} />
            LIVE
          </span>
        </div>
        {pulse && liveSecondsAgo !== null && (
          <p className="text-[11px] text-slate-500 tabular-nums">
            Último evento <span className="text-slate-900 font-medium">{formatAgoSeconds(liveSecondsAgo)}</span>
          </p>
        )}
      </div>

      {/* Grid: 2 barras lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TimelineBar
          kind="commerce"
          label="Datos de ventas"
          helper="VTEX · órdenes con cliente"
          startIso={commerceStart}
          endLabel={pulse?.commerce.lastOrderAt ? formatAgoMinutes(pulse.commerce.lastOrderMinutesAgo) : null}
          daysCovered={pulse?.commerce.daysCovered ?? 0}
          total={pulse?.commerce.totalOrders ?? 0}
          totalLabel="órdenes"
          last24hLabel={`${pulse?.commerce.ordersLast24h ?? 0} en 24h`}
          accent={COMMERCE_GRAD}
          accentSolid="#10b981"
          timeline={pulse?.commerce.timeline30d ?? []}
          loading={loading}
          exists={hasCommerce}
        />
        <TimelineBar
          kind="pixel"
          label="Datos de comportamiento"
          helper="NitroPixel"
          startIso={pixelStart}
          endLabel={liveSecondsAgo !== null ? formatAgoSeconds(liveSecondsAgo) : null}
          daysCovered={pulse?.pixel.daysCovered ?? 0}
          total={pulse?.pixel.totalEvents ?? 0}
          totalLabel="eventos"
          last24hLabel={`${formatCompact(pulse?.pixel.eventsLast24h ?? 0)} en 24h`}
          accent={PIXEL_GRAD}
          accentSolid="#06b6d4"
          timeline={pulse?.pixel.timeline30d ?? []}
          loading={loading}
          exists={hasPixel}
          liveActive={!!pulse && (pulse.pixel.eventsLast5min > 0)}
        />
      </div>
    </div>
  );
}

// ─── TimelineBar: una barra con sparkline + mini-stats ────────────────

function TimelineBar({
  kind, label, helper, startIso, endLabel, daysCovered, total, totalLabel, last24hLabel,
  accent, accentSolid, timeline, loading, exists, liveActive,
}: {
  kind: "commerce" | "pixel";
  label: string;
  helper: string;
  startIso: string | null;
  endLabel: string | null;
  daysCovered: number;
  total: number;
  totalLabel: string;
  last24hLabel: string;
  accent: string;
  accentSolid: string;
  timeline: Array<{ day: string; count: number }>;
  loading: boolean;
  exists: boolean;
  liveActive?: boolean;
}) {
  const maxCount = useMemo(() => Math.max(1, ...timeline.map((t) => t.count)), [timeline]);

  return (
    <div
      className="relative rounded-xl border border-slate-900/[0.06] p-5 overflow-hidden"
      style={{
        background: kind === "pixel" ? "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)" : "linear-gradient(180deg, #ffffff 0%, #fbfefb 100%)",
        boxShadow: "0 1px 0 rgba(15,23,42,0.04), 0 6px 18px -14px rgba(15,23,42,0.18)",
      }}
    >
      {/* Subtle decorative corner */}
      <div aria-hidden className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-30" style={{ background: `radial-gradient(circle, ${accentSolid}33 0%, transparent 60%)` }} />

      {/* Top row: label + LIVE indicator */}
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-mono tracking-[0.26em] uppercase text-slate-500">{label}</p>
          <p className="mt-0.5 text-xs text-slate-400">{helper}</p>
        </div>
        {kind === "pixel" && exists && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold text-cyan-700 bg-cyan-50 border border-cyan-200/80">
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-cyan-500" style={{ animation: liveActive ? "bondlyLiveDot 2s infinite" : undefined }} />
            {liveActive ? "LIVE" : "pausado"}
          </span>
        )}
      </div>

      {/* Sparkline */}
      <div className="relative mt-4 h-12">
        {loading ? (
          <div className="absolute inset-0 rounded-md bg-slate-100 animate-pulse" />
        ) : exists ? (
          <svg width="100%" height="100%" viewBox="0 0 300 48" preserveAspectRatio="none" className="absolute inset-0">
            <defs>
              <linearGradient id={`spark-${kind}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor={kind === "pixel" ? "#06b6d4" : "#10b981"} stopOpacity="0.9" />
                <stop offset="100%" stopColor={kind === "pixel" ? "#8b5cf6" : "#059669"} stopOpacity="0.9" />
              </linearGradient>
              <linearGradient id={`spark-fill-${kind}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={kind === "pixel" ? "#06b6d4" : "#10b981"} stopOpacity="0.25" />
                <stop offset="100%" stopColor={kind === "pixel" ? "#06b6d4" : "#10b981"} stopOpacity="0" />
              </linearGradient>
            </defs>
            {(() => {
              if (timeline.length === 0) return null;
              const w = 300;
              const h = 48;
              const step = w / Math.max(1, timeline.length - 1);
              const points = timeline.map((t, i) => {
                const x = i * step;
                const y = h - 2 - ((t.count / maxCount) * (h - 6));
                return `${x},${y}`;
              });
              const pathLine = `M ${points.join(" L ")}`;
              const pathFill = `${pathLine} L ${w},${h} L 0,${h} Z`;
              return (
                <>
                  <path d={pathFill} fill={`url(#spark-fill-${kind})`} />
                  <path d={pathLine} fill="none" stroke={`url(#spark-${kind})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </>
              );
            })()}
          </svg>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50/50">
            <span className="text-[11px] text-slate-400">Sin datos todavía</span>
          </div>
        )}
        {/* Shimmer overlay en pixel (real-time feel) */}
        {kind === "pixel" && exists && liveActive && (
          <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
            <div
              className="absolute top-0 bottom-0 w-1/3"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.18) 50%, transparent 100%)",
                animation: "bondlyShimmer 2.4s linear infinite",
              }}
            />
          </div>
        )}
      </div>

      {/* Timeline bar ("Desde X ———— Hasta ahora") */}
      <div className="relative mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        {exists && (
          <>
            <div className="absolute inset-0 rounded-full" style={{ background: accent, opacity: 0.9 }} />
            {kind === "pixel" && liveActive && (
              <div
                aria-hidden
                className="absolute top-0 bottom-0 w-20 rounded-full"
                style={{
                  background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)",
                  animation: "bondlyShimmer 3.2s linear infinite",
                }}
              />
            )}
            {/* End dot live */}
            <div
              aria-hidden
              className="absolute -top-1 w-3.5 h-3.5 rounded-full border-2 border-white"
              style={{
                right: "-3px",
                background: accentSolid,
                animation: liveActive ? "bondlyLiveDot 2s infinite" : undefined,
                boxShadow: `0 0 0 2px ${accentSolid}22`,
              }}
            />
          </>
        )}
      </div>

      {/* Endpoints labels */}
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 tabular-nums">
        <span>{exists ? `Desde ${formatShortDate(startIso)}` : "—"}</span>
        <span className="text-slate-900 font-medium">{exists ? (endLabel ?? "Ahora") : "—"}</span>
      </div>

      {/* Stats row */}
      <div className="mt-4 flex items-baseline gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-mono tracking-[0.22em] uppercase text-slate-400">{daysCovered} días</p>
          <p className="mt-0.5 text-[20px] font-semibold tabular-nums tracking-tight text-slate-900">
            {exists ? formatCompact(total) : "—"} <span className="text-xs font-normal text-slate-500">{totalLabel}</span>
          </p>
        </div>
        <div className="flex-1" />
        <div className="text-right">
          <p className="text-[10px] font-mono tracking-[0.22em] uppercase text-slate-400">24h</p>
          <p className="mt-0.5 text-xs font-medium text-slate-700 tabular-nums">{last24hLabel}</p>
        </div>
      </div>
    </div>
  );
}

// ─── SignalsPreview: top eventos live ─────────────────────────────────

function SignalsPreview({ pulse }: { pulse: PulseResp | null }) {
  const signals = pulse?.signalsPreview ?? [];
  const hasSignals = signals.length > 0;

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="text-[10px] font-mono tracking-[0.28em] uppercase text-slate-500 flex items-center gap-2">
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-cyan-500" style={{ animation: hasSignals ? "bondlyLiveDot 2s infinite" : undefined }} />
            Señales en tiempo real
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
            Lo que está pasando ahora mismo
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Eventos capturados por NitroPixel en la última hora.
          </p>
        </div>
        <Link
          href="/bondly/senales"
          className="hidden md:inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 transition-colors"
          style={{ transitionTimingFunction: ES }}
        >
          Ver todas <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl bg-white border border-slate-900/[0.06]"
        style={{ boxShadow: "0 1px 0 rgba(15,23,42,0.05), 0 10px 24px -18px rgba(15,23,42,0.18)" }}
      >
        {hasSignals ? (
          <ul className="divide-y divide-slate-100">
            {signals.slice(0, 5).map((s, i) => {
              const meta = eventMeta(s.type);
              const Icon = meta.icon;
              const DeviceIcon = s.deviceType === "mobile" ? Smartphone : Laptop;
              const ageSecs = Math.floor((Date.now() - new Date(s.receivedAt).getTime()) / 1000);
              return (
                <li
                  key={s.id}
                  className="relative flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/60 transition-colors"
                  style={{
                    transitionTimingFunction: ES,
                    animation: `bondlyStagger 420ms ${ES} ${i * 45}ms both`,
                  }}
                >
                  <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: `${meta.color}14`, color: meta.color }}>
                    <Icon className="w-4 h-4" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 truncate">{s.visitorLabel}</span>
                      {s.identified && (
                        <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200/80">
                          <UserCheck className="w-2.5 h-2.5" /> identificado
                        </span>
                      )}
                      <span className="text-sm text-slate-600">{meta.label.toLowerCase()}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                      {s.country && (
                        <span className="inline-flex items-center gap-1"><Globe className="w-3 h-3" /> {s.country}</span>
                      )}
                      {s.deviceType && (
                        <span className="inline-flex items-center gap-1"><DeviceIcon className="w-3 h-3" /> {s.deviceType}</span>
                      )}
                      {s.pageUrl && (
                        <span className="truncate max-w-[280px]">· {s.pageUrl}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-[11px] text-slate-500 tabular-nums">{formatAgoSeconds(ageSecs)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex items-center justify-center py-10 px-6">
            <div className="text-center max-w-md">
              <div className="mx-auto w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-400">
                <Activity className="w-5 h-5" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">Esperando la próxima señal</p>
              <p className="mt-1 text-xs text-slate-500">Cuando un visitante interactúe con tu tienda, vas a verlo acá en tiempo real.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────

function BondlyKpi({
  label, value, subvalue, accent, icon: Icon, delayMs = 0, loading,
}: {
  label: string;
  value: string;
  subvalue?: string;
  accent: string;
  icon: any;
  delayMs?: number;
  loading?: boolean;
}) {
  return (
    <div
      className="relative rounded-2xl bg-white border border-slate-900/[0.06] p-5 overflow-hidden transition-[transform,box-shadow] duration-[260ms] hover:-translate-y-0.5"
      style={{
        boxShadow: "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.18), 0 22px 40px -28px rgba(15,23,42,0.16)",
        transitionTimingFunction: ES,
        animation: `bondlyStagger 560ms ${ES} ${delayMs}ms both`,
      }}
    >
      <div aria-hidden className="absolute -top-10 -right-10 w-28 h-28 rounded-full opacity-50" style={{ background: `radial-gradient(circle, ${accent}22 0%, transparent 60%)` }} />
      <div className="relative flex items-start justify-between">
        <p className="text-[10px] font-mono tracking-[0.28em] uppercase text-slate-500">{label}</p>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${accent}14`, color: accent }}>
          <Icon className="w-4 h-4" strokeWidth={2.2} />
        </div>
      </div>
      <p className="relative mt-3 text-[32px] font-semibold tabular-nums tracking-tight text-slate-900">
        {loading ? (
          <span className="inline-block w-24 h-8 rounded bg-slate-100 animate-pulse align-middle" />
        ) : value}
      </p>
      {subvalue && <p className="relative mt-0.5 text-xs text-slate-500 tabular-nums">{subvalue}</p>}
    </div>
  );
}

// ─── Quick access card ───────────────────────────────────────────────

function QuickAccessCard({
  href, badge, title, desc, accent, icon: Icon, stat, comingSoon,
}: {
  href: string;
  badge: string;
  title: string;
  desc: string;
  accent: string;
  icon: any;
  stat?: string;
  comingSoon?: boolean;
}) {
  const content = (
    <div
      className="group relative rounded-2xl bg-white border border-slate-900/[0.06] p-6 overflow-hidden transition-[transform,box-shadow,border-color] duration-[320ms] hover:-translate-y-1 hover:border-slate-900/10 h-full"
      style={{
        transitionTimingFunction: ES,
        boxShadow: "0 1px 0 rgba(15,23,42,0.05), 0 10px 28px -18px rgba(15,23,42,0.2)",
      }}
    >
      <div aria-hidden className="absolute -top-16 -right-16 w-44 h-44 rounded-full opacity-40 group-hover:opacity-80 transition-opacity duration-[320ms]" style={{ background: `radial-gradient(circle, ${accent}33 0%, transparent 60%)`, transitionTimingFunction: ES }} />
      <div className="relative flex items-start justify-between">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${accent}14`, color: accent }}>
          <Icon className="w-5 h-5" strokeWidth={2.2} />
        </div>
        <div className="flex items-center gap-1.5">
          {comingSoon && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200">
              pronto
            </span>
          )}
          <span className="text-[10px] font-mono tracking-[0.28em] uppercase text-slate-400">{badge}</span>
        </div>
      </div>
      <h3 className="relative mt-4 text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
      <p className="relative mt-1 text-sm text-slate-600 leading-relaxed">{desc}</p>
      <div className="relative mt-5 flex items-center justify-between">
        <span className="text-xs text-slate-500 tabular-nums">{stat ?? " "}</span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-900 group-hover:gap-2 transition-all duration-200" style={{ transitionTimingFunction: ES }}>
          {comingSoon ? "Próximamente" : "Ver"} <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );

  if (comingSoon) {
    return <div className="opacity-[0.78]">{content}</div>;
  }
  return <Link href={href} className="block h-full">{content}</Link>;
}

// ─── StatProof (footer grid) ─────────────────────────────────────────

function StatProof({ label, value, accent, suffix }: { label: string; value: number; accent: string; suffix?: string }) {
  const animated = useCountUp(value, 1100);
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/10 p-4"
      style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)" }}
    >
      <div aria-hidden className="absolute -top-8 -right-8 w-20 h-20 rounded-full opacity-30" style={{ background: `radial-gradient(circle, ${accent}66 0%, transparent 60%)` }} />
      <p className="relative text-[10px] font-mono tracking-[0.24em] uppercase text-slate-400">{label}</p>
      <p className="relative mt-1 text-[22px] font-semibold tabular-nums tracking-tight text-white">
        {formatCompact(Math.round(animated))}{suffix ? <span className="text-sm text-slate-400 font-normal">{suffix}</span> : null}
      </p>
    </div>
  );
}
