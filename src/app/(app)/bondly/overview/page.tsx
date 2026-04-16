"use client";

// ══════════════════════════════════════════════════════════════════════
// Bondly — Overview (hub)
// ──────────────────────────────────────────────────────────────────────
// Entry-point del módulo de clientes y fidelización.
// Zona 1 — Hero identidad (gradient emerald → cyan → indigo).
// Zona 2 — KPI strip (clientes, LTV, recompra, audiencias).
// Zona 3 — Mapa RFM clickeable (7 segmentos).
// Zona 4 — Quick access cards (Clientes / LTV / Audiencias).
// Light mode premium. Benchmark: Linear / Stripe / Vercel.
// ══════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Users, Heart, Sparkles, TrendingUp, ArrowRight, Star,
  AlertTriangle, UserPlus, XCircle, Zap, Target, Layers,
  DollarSign, RefreshCw, Radio,
} from "lucide-react";
import { formatARS, formatCompact } from "@/lib/utils/format";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";
const BONDLY_GRAD = "linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #6366f1 100%)";

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

// ─── Segment metadata ─────────────────────────────────────────────────

const SEGMENTS: Array<{
  key: string;
  label: string;
  icon: any;
  desc: string;
  color: string;
  bg: string;
  border: string;
}> = [
  { key: "Champions", label: "Champions", icon: Star, desc: "Gastan mucho, compran siempre", color: "#10b981", bg: "bg-emerald-50", border: "border-emerald-200" },
  { key: "Leales", label: "Leales", icon: Heart, desc: "Clientes recurrentes fieles", color: "#6366f1", bg: "bg-indigo-50", border: "border-indigo-200" },
  { key: "Potenciales", label: "Potenciales", icon: TrendingUp, desc: "Segunda compra reciente", color: "#f59e0b", bg: "bg-amber-50", border: "border-amber-200" },
  { key: "Nuevos", label: "Nuevos", icon: UserPlus, desc: "Primera compra este mes", color: "#06b6d4", bg: "bg-cyan-50", border: "border-cyan-200" },
  { key: "En riesgo", label: "En riesgo", icon: AlertTriangle, desc: "No compran hace 90+ días", color: "#ef4444", bg: "bg-rose-50", border: "border-rose-200" },
  { key: "Ocasionales", label: "Ocasionales", icon: Users, desc: "Compran esporádicamente", color: "#94a3b8", bg: "bg-slate-50", border: "border-slate-200" },
  { key: "Perdidos", label: "Perdidos", icon: XCircle, desc: "Sin actividad hace 180+ días", color: "#6b7280", bg: "bg-gray-50", border: "border-gray-200" },
];

// ─── Page ─────────────────────────────────────────────────────────────

export default function BondlyOverviewPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("ultimos_365");
  const [data, setData] = useState<any>(null);
  const [audienceSummary, setAudienceSummary] = useState<any>(null);
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
        const [custRes, audRes] = await Promise.all([
          fetch(`/api/metrics/customers?from=${from}&to=${to}`, { cache: "no-store" }),
          fetch(`/api/audiences`, { cache: "no-store" }).catch(() => null),
        ]);
        if (!custRes.ok) throw new Error(`customers ${custRes.status}`);
        const custJson = await custRes.json();
        const audJson = audRes && audRes.ok ? await audRes.json() : null;
        if (cancel) return;
        setData(custJson);
        setAudienceSummary(audJson?.summary ?? null);
      } catch (e: any) {
        if (!cancel) setError(e?.message || "Error cargando datos");
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    fetchAll();
    return () => { cancel = true; };
  }, [range.from, range.to]);

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

  // Sparkline peak accent based on rfm revenue
  const topSegment = useMemo(() => {
    let best: { key: string; customers: number; revenue: number } | null = null;
    for (const [k, v] of rfmMap.entries()) {
      if (!best || v.revenue > best.revenue) best = { key: k, ...v };
    }
    return best;
  }, [rfmMap]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-[#fbfbfd] to-[#f4f5f8]">
      {/* ───── Zona 1: Hero ───── */}
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
                    <Sparkles className="w-3 h-3" /> LOYALTY
                  </span>
                </div>
                <h1 className="text-[44px] leading-[1.05] font-semibold tracking-tight text-slate-900">
                  <span style={{ background: BONDLY_GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Bondly</span>
                </h1>
                <p className="mt-2 max-w-xl text-[15px] text-slate-600 leading-relaxed">
                  Inteligencia de clientes, lifetime value y activación de audiencias en un solo lugar. Entendé quién te compra, por qué vuelven y cómo convertir cada segmento en ventas.
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

      {/* ───── Zona 2: KPI strip ───── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <BondlyKpi
            label="Clientes totales"
            value={formatCompact(Math.round(totalCustomersCount))}
            accent="#10b981"
            icon={Users}
            delayMs={0}
            loading={loading}
          />
          <BondlyKpi
            label="LTV promedio"
            value={formatARS(Math.round(ltvCount))}
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

      {/* ───── Zona 3: RFM map ───── */}
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
                className={`group relative rounded-2xl bg-white border border-slate-900/[0.06] p-4 overflow-hidden transition-[transform,box-shadow,border-color] duration-[260ms] hover:-translate-y-0.5 hover:border-slate-900/10`}
                style={{
                  transitionTimingFunction: ES,
                  animation: `bondlyStagger 520ms ${ES} ${idx * 55}ms both`,
                  boxShadow: "0 1px 0 rgba(15,23,42,0.05), 0 8px 24px -16px rgba(15,23,42,0.18)",
                }}
              >
                {/* Accent corner */}
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

      {/* ───── Zona 4: Quick access ───── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-10 pb-16">
        <div>
          <p className="text-[10px] font-mono tracking-[0.28em] uppercase text-slate-500">Explorar</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
            Entrá al detalle
          </h2>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
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

// ─── Sub-components ──────────────────────────────────────────────────

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

function QuickAccessCard({
  href, badge, title, desc, accent, icon: Icon, stat,
}: {
  href: string;
  badge: string;
  title: string;
  desc: string;
  accent: string;
  icon: any;
  stat?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative rounded-2xl bg-white border border-slate-900/[0.06] p-6 overflow-hidden transition-[transform,box-shadow,border-color] duration-[320ms] hover:-translate-y-1 hover:border-slate-900/10"
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
        <span className="text-[10px] font-mono tracking-[0.28em] uppercase text-slate-400">{badge}</span>
      </div>
      <h3 className="relative mt-4 text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
      <p className="relative mt-1 text-sm text-slate-600 leading-relaxed">{desc}</p>
      <div className="relative mt-5 flex items-center justify-between">
        <span className="text-xs text-slate-500 tabular-nums">{stat ?? " "}</span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-900 group-hover:gap-2 transition-all duration-200" style={{ transitionTimingFunction: ES }}>
          Ver <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}
