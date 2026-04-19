// @ts-nocheck
"use client";

/**
 * /finanzas/fiscal — Fase 6c
 * ─────────────────────────────────────────────────────────────
 * Pestaña Fiscal: calendario AFIP derivado del fiscalProfile +
 * tablero de retenciones recibidas + acciones AFIP.
 *
 * Carga tres endpoints en paralelo:
 *   - GET /api/finance/fiscal-profile  (profile + provinces/categorias)
 *   - GET /api/finance/fiscal/calendar (obligaciones expanded 12 meses)
 *   - GET /api/finance/fiscal/retentions (agregado 12 meses)
 *
 * Fase 6d agrega alertas Monotributo + sugerencia de régimen.
 * Fase 6g agrega PDF export del calendario.
 *
 * Ver PROPUESTA_PNL_REORG.md §Fase 5 (Fiscal enhanced).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCurrencyView } from "@/hooks/useCurrencyView";
import {
  CalendarDays,
  FileText,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  TrendingDown,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  Info,
  ClipboardList,
  Clock,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────
type ExpandedObligation = {
  defaultKey: string;
  name: string;
  category:
    | "MONOTRIBUTO"
    | "IVA"
    | "IIBB"
    | "GANANCIAS"
    | "PERCEPCION_ML"
    | "CUSTOM";
  frequency:
    | "MONTHLY"
    | "BIMONTHLY"
    | "QUARTERLY"
    | "SEMIANNUAL"
    | "YEARLY";
  dueDate: string;
  dueDay: number;
  amount: number | null;
  amountSource: string;
  note?: string;
  isInformative: boolean;
};

type Profile = {
  taxRegime: "MONOTRIBUTO" | "RESPONSABLE_INSCRIPTO";
  monotributoCategory?: string;
  province?: string;
  hasConvenioMultilateral?: boolean;
  additionalProvinces?: string[];
  sellsOnMarketplace?: boolean;
  completedAt?: string;
} | null;

type RetentionRow = { month: string; total: number; orders: number };

// ─────────────────────────────────────────────────────────────
// Paletas por categoria
// ─────────────────────────────────────────────────────────────
const CATEGORY_META: Record<
  ExpandedObligation["category"],
  { label: string; color: string; bg: string; border: string }
> = {
  MONOTRIBUTO: {
    label: "Monotributo",
    color: "#10b981",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.22)",
  },
  IVA: {
    label: "IVA",
    color: "#0ea5e9",
    bg: "rgba(14,165,233,0.08)",
    border: "rgba(14,165,233,0.22)",
  },
  IIBB: {
    label: "IIBB",
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.08)",
    border: "rgba(139,92,246,0.22)",
  },
  GANANCIAS: {
    label: "Ganancias",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.22)",
  },
  PERCEPCION_ML: {
    label: "Retención ML",
    color: "#f43f5e",
    bg: "rgba(244,63,94,0.08)",
    border: "rgba(244,63,94,0.22)",
  },
  CUSTOM: {
    label: "Custom",
    color: "#64748b",
    bg: "rgba(100,116,139,0.08)",
    border: "rgba(100,116,139,0.22)",
  },
};

function daysUntil(iso: string): number {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDueLabel(iso: string): string {
  const diff = daysUntil(iso);
  if (diff < 0) return `Vencido hace ${Math.abs(diff)}d`;
  if (diff === 0) return "Vence hoy";
  if (diff === 1) return "Vence mañana";
  if (diff < 7) return `En ${diff} días`;
  if (diff < 30) return `En ${Math.round(diff / 7)} semanas`;
  return new Date(iso + "T00:00:00").toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
  });
}

function urgencyColor(iso: string): string {
  const diff = daysUntil(iso);
  if (diff < 0) return "#ef4444";
  if (diff <= 3) return "#f59e0b";
  if (diff <= 7) return "#eab308";
  return "#64748b";
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────
export default function FiscalPage() {
  const { convert, format, mode } = useCurrencyView();
  const today = new Date().toISOString().slice(0, 10);
  const fm = (v: number | null | undefined, d?: string) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    const c = convert(v, d ?? today);
    return format(c);
  };

  const [profile, setProfile] = useState<Profile>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [obligations, setObligations] = useState<ExpandedObligation[]>([]);
  const [retentions, setRetentions] = useState<{
    monthly: RetentionRow[];
    total12m: number;
    totalLifetime: number;
  } | null>(null);
  const [monoAlert, setMonoAlert] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profRes, calRes, retRes, monoRes] = await Promise.all([
        fetch("/api/finance/fiscal-profile"),
        fetch("/api/finance/fiscal/calendar?monthsAhead=12"),
        fetch("/api/finance/fiscal/retentions?months=12"),
        fetch("/api/finance/fiscal/monotributo-alert"),
      ]);
      const prof = await profRes.json();
      const cal = await calRes.json();
      const ret = await retRes.json();
      const mono = await monoRes.json();
      setProfile(prof.fiscalProfile ?? null);
      setProfileLoaded(true);
      setObligations(cal.obligations ?? []);
      setRetentions({
        monthly: ret.monthly ?? [],
        total12m: ret.total12m ?? 0,
        totalLifetime: ret.totalLifetime ?? 0,
      });
      setMonoAlert(mono);
    } catch (err: any) {
      setError(err.message ?? "Error cargando datos fiscales");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Clasificaciones derivadas
  const next30d = useMemo(
    () =>
      obligations.filter((o) => {
        if (o.isInformative) return false;
        const d = daysUntil(o.dueDate);
        return d >= 0 && d <= 30;
      }),
    [obligations]
  );

  const nextUpcoming = next30d[0] ?? null;

  const byCategory = useMemo(() => {
    const acc: Record<
      ExpandedObligation["category"],
      { count: number; total: number }
    > = {
      MONOTRIBUTO: { count: 0, total: 0 },
      IVA: { count: 0, total: 0 },
      IIBB: { count: 0, total: 0 },
      GANANCIAS: { count: 0, total: 0 },
      PERCEPCION_ML: { count: 0, total: 0 },
      CUSTOM: { count: 0, total: 0 },
    };
    for (const o of obligations) {
      acc[o.category].count++;
      if (o.amount) acc[o.category].total += o.amount;
    }
    return acc;
  }, [obligations]);

  // Next 12m total estimated (solo obligaciones con amount conocido)
  const estimatedTotal12m = useMemo(
    () =>
      obligations
        .filter((o) => !o.isInformative && o.amount)
        .reduce((s, o) => s + (o.amount ?? 0), 0),
    [obligations]
  );

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  if (loading && !profileLoaded) {
    return <SkeletonLoading />;
  }

  if (!profile) {
    return <MissingProfile />;
  }

  return (
    <div className="relative space-y-6">
      {/* HERO */}
      <Hero
        profile={profile}
        nextUpcoming={nextUpcoming}
        count30d={next30d.length}
        estimatedTotal12m={estimatedTotal12m}
        retentions={retentions}
        fm={fm}
        onReload={loadAll}
      />

      {/* ALERTA MONOTRIBUTO / SUGERENCIA RÉGIMEN */}
      {monoAlert && monoAlert.hasProfile && (
        <MonotributoAlertCard alert={monoAlert} fm={fm} />
      )}

      {/* CALENDARIO 12 meses */}
      <CalendarCard
        obligations={obligations.filter((o) => !o.isInformative)}
        fm={fm}
      />

      {/* RETENCIONES ML */}
      {retentions && retentions.total12m > 0 && (
        <RetentionsCard retentions={retentions} obligations={obligations} fm={fm} />
      )}

      {/* BY CATEGORY */}
      <CategoryBreakdown byCategory={byCategory} />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HERO
// ─────────────────────────────────────────────────────────────
function Hero({
  profile,
  nextUpcoming,
  count30d,
  estimatedTotal12m,
  retentions,
  fm,
  onReload,
}: any) {
  const isMono = profile.taxRegime === "MONOTRIBUTO";
  const regimeLabel = isMono
    ? `Monotributo cat. ${profile.monotributoCategory ?? "—"}`
    : "Responsable Inscripto";

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 85% 0%, rgba(16,185,129,0.10) 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(251,191,36,0.06) 0%, transparent 55%)",
        }}
      />
      {/* prism delimiter bottom */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(16,185,129,0.35) 25%, rgba(14,165,233,0.35) 50%, rgba(139,92,246,0.35) 75%, transparent 100%)",
        }}
      />

      <div className="relative p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                {regimeLabel}
              </span>
              {profile.province && (
                <span className="text-[10px] text-emerald-600/80">
                  · {profile.province.replace(/_/g, " ")}
                </span>
              )}
            </div>
            <h1 className="mt-5 text-[28px] font-semibold tracking-tight text-slate-900">
              Fiscal
            </h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-slate-600">
              Tu relación con AFIP organizada: calendario automático según tu
              régimen, tablero de retenciones recibidas por marketplace, y
              obligaciones custom cuando necesites.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReload}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              style={{ transition: `all 180ms ${ES}` }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refrescar
            </button>
            <Link
              href="/finanzas/costos"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100"
              style={{ transition: `all 180ms ${ES}` }}
            >
              <FileText className="h-3.5 w-3.5" />
              Resincronizar constancia
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* KPI STRIP */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <KPICard
            label="Próximo vencimiento"
            value={
              nextUpcoming
                ? nextUpcoming.name
                : "Sin vencimientos próximos"
            }
            subvalue={nextUpcoming ? formatDueLabel(nextUpcoming.dueDate) : ""}
            accent={nextUpcoming ? urgencyColor(nextUpcoming.dueDate) : "#64748b"}
            icon={<Clock className="h-4 w-4" />}
          />
          <KPICard
            label="Vencimientos 30 días"
            value={`${count30d}`}
            subvalue={
              count30d > 0 ? "Ver calendario abajo" : "Tranquilo por ahora"
            }
            accent={count30d > 3 ? "#f59e0b" : "#10b981"}
            icon={<CalendarDays className="h-4 w-4" />}
          />
          <KPICard
            label="Obligaciones estimadas 12m"
            value={fm(estimatedTotal12m)}
            subvalue="Solo con monto conocido"
            accent="#0ea5e9"
            icon={<ClipboardList className="h-4 w-4" />}
          />
          <KPICard
            label="Retenciones ML 12m"
            value={fm(retentions?.total12m ?? 0)}
            subvalue="Crédito fiscal a recuperar"
            accent="#f43f5e"
            icon={<TrendingDown className="h-4 w-4" />}
          />
        </div>
      </div>
    </div>
  );
}

function KPICard({
  label,
  value,
  subvalue,
  accent,
  icon,
}: {
  label: string;
  value: string;
  subvalue?: string;
  accent: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/70 p-4 backdrop-blur-sm"
      style={{
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.03)",
        transition: `all 180ms ${ES}`,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ background: accent }}
      />
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {label}
        </div>
        {icon && (
          <div className="text-slate-300" style={{ color: accent }}>
            {icon}
          </div>
        )}
      </div>
      <div
        className="mt-2 text-[17px] font-semibold tracking-tight tabular-nums text-slate-900"
        style={{ lineHeight: 1.15 }}
      >
        {value}
      </div>
      {subvalue && (
        <div className="mt-1 text-[11px] text-slate-500">{subvalue}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CALENDARIO
// ─────────────────────────────────────────────────────────────
function CalendarCard({
  obligations,
  fm,
}: {
  obligations: ExpandedObligation[];
  fm: (v: number | null | undefined) => string;
}) {
  // Agrupar por mes
  const byMonth = useMemo(() => {
    const acc = new Map<string, ExpandedObligation[]>();
    for (const o of obligations) {
      const key = o.dueDate.slice(0, 7); // YYYY-MM
      if (!acc.has(key)) acc.set(key, []);
      acc.get(key)!.push(o);
    }
    return Array.from(acc.entries())
      .map(([month, items]) => ({
        month,
        items: items.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [obligations]);

  const [expanded, setExpanded] = useState<string | null>(
    byMonth[0]?.month ?? null
  );

  if (obligations.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
        <h3 className="mt-3 text-sm font-semibold text-slate-700">
          Sin obligaciones derivadas
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Completá tu perfil fiscal en Costos para ver el calendario.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">
            Calendario fiscal · próximos 12 meses
          </h2>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
          {obligations.length} vencimientos
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {byMonth.map(({ month, items }) => {
          const isOpen = expanded === month;
          const monthLabel = new Date(month + "-01T00:00:00").toLocaleDateString(
            "es-AR",
            { month: "long", year: "numeric" }
          );
          const totalMonth = items.reduce((s, o) => s + (o.amount ?? 0), 0);
          return (
            <div key={month}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : month)}
                className="flex w-full items-center justify-between px-6 py-3.5 text-left transition hover:bg-slate-50"
                style={{ transition: `background 120ms ${ES}` }}
              >
                <div className="flex items-center gap-3">
                  <ChevronRight
                    className="h-4 w-4 text-slate-400 transition-transform"
                    style={{
                      transform: isOpen ? "rotate(90deg)" : "rotate(0)",
                      transition: `transform 160ms ${ES}`,
                    }}
                  />
                  <div>
                    <div className="text-sm font-semibold capitalize tracking-tight text-slate-900">
                      {monthLabel}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {items.length} vencimiento{items.length !== 1 ? "s" : ""}
                      {totalMonth > 0 ? ` · ${fm(totalMonth)}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {items.slice(0, 5).map((i, idx) => (
                    <span
                      key={idx}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        background: CATEGORY_META[i.category].color,
                      }}
                    />
                  ))}
                  {items.length > 5 && (
                    <span className="text-[10px] text-slate-400">
                      +{items.length - 5}
                    </span>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 bg-slate-50/40 px-6 py-3">
                  <div className="space-y-2">
                    {items.map((o, idx) => (
                      <ObligationRow
                        key={`${o.defaultKey}-${o.dueDate}-${idx}`}
                        o={o}
                        fm={fm}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ObligationRow({
  o,
  fm,
}: {
  o: ExpandedObligation;
  fm: (v: number | null | undefined) => string;
}) {
  const meta = CATEGORY_META[o.category];
  const diff = daysUntil(o.dueDate);
  const urgent = diff >= 0 && diff <= 3;
  const overdue = diff < 0;

  return (
    <div
      className="flex items-center gap-3 rounded-xl border bg-white p-3"
      style={{
        borderColor: urgent
          ? "rgba(245,158,11,0.35)"
          : overdue
          ? "rgba(239,68,68,0.35)"
          : "rgba(226,232,240,1)",
        boxShadow:
          urgent || overdue
            ? "0 1px 0 rgba(245,158,11,0.08)"
            : "0 1px 2px rgba(15,23,42,0.03)",
      }}
    >
      <div
        className="h-10 w-10 shrink-0 rounded-xl border"
        style={{ background: meta.bg, borderColor: meta.border }}
      >
        <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold tracking-tight" style={{ color: meta.color }}>
          {o.category === "MONOTRIBUTO" && "MT"}
          {o.category === "IVA" && "IVA"}
          {o.category === "IIBB" && "IIBB"}
          {o.category === "GANANCIAS" && "Gan"}
          {o.category === "PERCEPCION_ML" && "ML"}
          {o.category === "CUSTOM" && "·"}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate text-[13px] font-semibold tracking-tight text-slate-900">
          {o.name}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-slate-500">
          {o.note ?? meta.label}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <div
          className="text-[12px] font-semibold tabular-nums"
          style={{ color: urgencyColor(o.dueDate) }}
        >
          {formatDueLabel(o.dueDate)}
        </div>
        {o.amount ? (
          <div className="text-[11px] font-medium tabular-nums text-slate-700">
            {fm(o.amount)}
          </div>
        ) : (
          <div className="text-[10px] italic text-slate-400">
            Monto a calcular
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RETENCIONES
// ─────────────────────────────────────────────────────────────
function RetentionsCard({
  retentions,
  obligations,
  fm,
}: {
  retentions: { monthly: RetentionRow[]; total12m: number; totalLifetime: number };
  obligations: ExpandedObligation[];
  fm: (v: number | null | undefined, d?: string) => string;
}) {
  const max = Math.max(1, ...retentions.monthly.map((r) => r.total));
  const hasML = obligations.some((o) => o.category === "PERCEPCION_ML");

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-rose-600" />
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">
            Retenciones MercadoLibre · últimos 12 meses
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Total 12m
            </div>
            <div className="text-[13px] font-semibold tabular-nums text-rose-600">
              {fm(retentions.total12m)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Lifetime
            </div>
            <div className="text-[13px] font-semibold tabular-nums text-slate-900">
              {fm(retentions.totalLifetime)}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Bar chart */}
        <div className="grid grid-cols-12 gap-1.5 items-end" style={{ minHeight: 80 }}>
          {retentions.monthly.map((r) => {
            const pct = (r.total / max) * 100;
            const month = new Date(r.month + "-01T00:00:00").toLocaleDateString(
              "es-AR",
              { month: "short" }
            );
            return (
              <div
                key={r.month}
                className="flex flex-col items-center gap-1"
                title={`${r.month}: ${fm(r.total, r.month + "-15")} (${r.orders} órdenes)`}
              >
                <div
                  className="w-full rounded-t-sm"
                  style={{
                    height: `${Math.max(4, pct * 0.6)}px`,
                    minHeight: 4,
                    background:
                      r.total > 0
                        ? "linear-gradient(180deg, #fb7185 0%, #f43f5e 100%)"
                        : "rgba(226,232,240,0.5)",
                    transition: `height 320ms ${ES}`,
                  }}
                />
                <div className="text-[9px] uppercase tracking-wider text-slate-400">
                  {month}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50/50 p-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <div className="text-[11px] leading-relaxed text-rose-700">
            MercadoLibre te retiene IVA / IIBB / Ganancias sobre cada venta.
            {hasML
              ? " Estos montos son recuperables como crédito fiscal contra tu DDJJ mensual (IVA) o anual (Ganancias)."
              : " Marcá \"Vendo en MercadoLibre\" en tu perfil fiscal para recuperar este monto como crédito."}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BREAKDOWN POR CATEGORIA
// ─────────────────────────────────────────────────────────────
function CategoryBreakdown({ byCategory }: { byCategory: any }) {
  const cats: ExpandedObligation["category"][] = [
    "MONOTRIBUTO",
    "IVA",
    "IIBB",
    "GANANCIAS",
    "PERCEPCION_ML",
    "CUSTOM",
  ];
  const items = cats
    .map((c) => ({ c, ...byCategory[c] }))
    .filter((x) => x.count > 0);
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
      {items.map(({ c, count }) => {
        const meta = CATEGORY_META[c];
        return (
          <div
            key={c}
            className="rounded-xl border p-3"
            style={{
              borderColor: meta.border,
              background: meta.bg,
            }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: meta.color }}>
              {meta.label}
            </div>
            <div className="mt-1 text-[18px] font-semibold tabular-nums" style={{ color: meta.color }}>
              {count}
            </div>
            <div className="text-[10px] text-slate-500">
              {count === 1 ? "vencimiento" : "vencimientos"} 12m
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MONOTRIBUTO ALERT / REGIME SUGGESTION
// ─────────────────────────────────────────────────────────────
function MonotributoAlertCard({
  alert,
  fm,
}: {
  alert: any;
  fm: (v: number | null | undefined, d?: string) => string;
}) {
  const isMonotributo = alert.regime === "MONOTRIBUTO";
  const primaryAlert = alert.alerts?.[0];
  const sev: AlertSeverityStr = primaryAlert?.severity ?? "info";

  const sevMeta: Record<
    AlertSeverityStr,
    { color: string; bg: string; border: string; glow: string; label: string }
  > = {
    critical: {
      color: "#dc2626",
      bg: "rgba(239,68,68,0.06)",
      border: "rgba(239,68,68,0.25)",
      glow: "0 0 0 1px rgba(239,68,68,0.12), 0 10px 40px -12px rgba(239,68,68,0.25)",
      label: "Acción requerida",
    },
    warning: {
      color: "#d97706",
      bg: "rgba(245,158,11,0.06)",
      border: "rgba(245,158,11,0.25)",
      glow: "0 0 0 1px rgba(245,158,11,0.12), 0 10px 30px -12px rgba(245,158,11,0.20)",
      label: "Atención",
    },
    info: {
      color: "#0ea5e9",
      bg: "rgba(14,165,233,0.05)",
      border: "rgba(14,165,233,0.22)",
      glow: "0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.03)",
      label: "Estado",
    },
  };
  const m = sevMeta[sev];

  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-white p-6"
      style={{ borderColor: m.border, boxShadow: m.glow }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 85% 0%, ${m.bg.replace("0.06", "0.12").replace("0.05", "0.10")} 0%, transparent 55%)`,
        }}
      />

      <div className="relative flex items-start gap-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}
        >
          {sev === "critical" && <AlertTriangle className="h-5 w-5" />}
          {sev === "warning" && <AlertTriangle className="h-5 w-5" />}
          {sev === "info" && <Sparkles className="h-5 w-5" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]"
              style={{ background: m.bg, color: m.color }}
            >
              {m.label}
            </span>
            {isMonotributo && (
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                Cat. {alert.currentCategory}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-[16px] font-semibold tracking-tight text-slate-900">
            {alert.headline}
          </h3>

          {primaryAlert && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
              {primaryAlert.body}
            </p>
          )}

          {/* Progress bar si Monotributo */}
          {isMonotributo && alert.utilizationPct != null && (
            <div className="mt-4">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-slate-500">Utilización de cat. {alert.currentCategory}</span>
                <span className="font-semibold tabular-nums" style={{ color: m.color }}>
                  {Math.round(alert.utilizationPct)}%
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, alert.utilizationPct)}%`,
                    background:
                      alert.utilizationPct >= 100
                        ? "linear-gradient(90deg, #ef4444, #dc2626)"
                        : alert.utilizationPct >= 85
                        ? "linear-gradient(90deg, #f59e0b, #d97706)"
                        : "linear-gradient(90deg, #10b981, #059669)",
                    transition: `width 480ms ${ES}`,
                  }}
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-[11px]">
                <div>
                  <div className="text-slate-400 uppercase tracking-wider">
                    Últimos 12m
                  </div>
                  <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
                    {fm(alert.actualRevenueLast12m)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 uppercase tracking-wider">
                    Proyectado 12m
                  </div>
                  <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
                    {fm(alert.projectedRevenue12m)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 uppercase tracking-wider">
                    Tope cat. {alert.currentCategory}
                  </div>
                  <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
                    {fm(alert.currentLimit)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {primaryAlert?.cta && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Sparkles className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[12px] font-medium text-slate-700">
                Sugerencia: {primaryAlert.cta}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type AlertSeverityStr = "info" | "warning" | "critical";

// ─────────────────────────────────────────────────────────────
// EMPTY / LOADING STATES
// ─────────────────────────────────────────────────────────────
function MissingProfile() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 80% 0%, rgba(251,191,36,0.10) 0%, transparent 55%)",
        }}
      />
      <div className="relative">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
            Perfil fiscal requerido
          </span>
        </div>
        <h1 className="mt-5 text-[28px] font-semibold tracking-tight text-slate-900">
          Completá tu perfil fiscal
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-slate-600">
          Para armar tu calendario fiscal automáticamente necesitamos saber si
          sos Monotributo o Responsable Inscripto, tu provincia y si vendés en
          marketplace. Todo esto se carga desde{" "}
          <Link
            href="/finanzas/costos"
            className="font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2"
          >
            Costos → Fiscal
          </Link>{" "}
          escaneando tu constancia AFIP.
        </p>
        <Link
          href="/finanzas/costos"
          className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Ir a configurar perfil fiscal
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function SkeletonLoading() {
  return (
    <div className="space-y-6">
      <div className="h-56 rounded-3xl border border-slate-200 bg-slate-100/50 shimmer-bg" />
      <div className="h-96 rounded-2xl border border-slate-200 bg-slate-100/50 shimmer-bg" />
      <style jsx>{`
        .shimmer-bg {
          position: relative;
          overflow: hidden;
        }
        .shimmer-bg::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.45) 50%,
            transparent 100%
          );
          transform: translateX(-100%);
          animation: shimmer 1.4s ${ES} infinite;
        }
        @keyframes shimmer {
          to {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}
