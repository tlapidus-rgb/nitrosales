// @ts-nocheck
"use client";

/**
 * /finanzas/escenarios — Fase 5c
 * ─────────────────────────────────────────────────────────────
 * UI de escenarios financieros. Carga `/api/finance/scenarios`,
 * que hace lazy seed de los 3 defaults (Conservador / Base /
 * Optimista) si la org no tiene ninguno, y lista tambien los
 * custom creados por el usuario.
 *
 * Cada card muestra KPIs calculados de `forecast` que viene del
 * engine (compute) del backend: Revenue 12M, Margen neto, Runway,
 * ROAS actual + ultimo mes del horizonte (status cashEnd).
 *
 * Acciones ya disponibles en 5c:
 *   - Activar  (POST ?action=activate)
 *   - Clonar   (POST ?action=clone)
 *   - Borrar   (DELETE, solo CUSTOM y nunca el ultimo)
 *
 * 5d agrega sliders de drivers. 5e la line chart 12m con bandas.
 * 5f acciones extra (hacerlo realidad, split, export PDF).
 *
 * Ver PROPUESTA_PNL_REORG.md §5.4 y §Capacidad 7.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCurrencyView } from "@/hooks/useCurrencyView";
import ScenarioDriversDrawer from "@/components/finanzas/ScenarioDriversDrawer";
import ScenarioForecastChart from "@/components/finanzas/ScenarioForecastChart";
import ScenarioCompareView from "@/components/finanzas/ScenarioCompareView";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

// ─────────────────────────────────────────────────────────────
// Tipos (match engine.ts)
// ─────────────────────────────────────────────────────────────
type MonthForecast = {
  month: string;
  days: number;
  revenue: number;
  revenueMin?: number | null;
  revenueMax?: number | null;
  cogs: number;
  adSpend: number;
  opex: number;
  grossProfit: number;
  netProfit: number;
  marginPct: number;
  cashEnd?: number | null;
};

type ForecastResult = {
  months: MonthForecast[];
  totals: {
    revenue: number;
    cogs: number;
    adSpend: number;
    opex: number;
    netProfit: number;
    marginPct: number;
  };
  runway?: {
    monthsRemaining: number | null;
    status: "safe" | "warn" | "critical";
    lastPositiveMonth?: string | null;
  };
};

type ScenarioKind = "BASE" | "OPTIMIST" | "CONSERVATIVE" | "CUSTOM";

type Scenario = {
  id: string;
  name: string;
  kind: ScenarioKind;
  color: string | null;
  description: string | null;
  isActive: boolean;
  drivers: Record<string, any>;
  horizonMonths: number;
  createdAt: string;
  updatedAt: string;
  lastComputedAt: string | null;
  forecast: ForecastResult | null;
};

// ─────────────────────────────────────────────────────────────
// Paletas por kind
// ─────────────────────────────────────────────────────────────
const KIND_META: Record<
  ScenarioKind,
  { label: string; color: string; ring: string; glow: string }
> = {
  CONSERVATIVE: {
    label: "Conservador",
    color: "#ef4444",
    ring: "rgba(239,68,68,0.35)",
    glow: "0 0 0 1px rgba(239,68,68,0.18), 0 10px 30px -12px rgba(239,68,68,0.28)",
  },
  BASE: {
    label: "Base",
    color: "#0ea5e9",
    ring: "rgba(14,165,233,0.35)",
    glow: "0 0 0 1px rgba(14,165,233,0.18), 0 10px 30px -12px rgba(14,165,233,0.28)",
  },
  OPTIMIST: {
    label: "Optimista",
    color: "#10b981",
    ring: "rgba(16,185,129,0.35)",
    glow: "0 0 0 1px rgba(16,185,129,0.18), 0 10px 30px -12px rgba(16,185,129,0.28)",
  },
  CUSTOM: {
    label: "Custom",
    color: "#8b5cf6",
    ring: "rgba(139,92,246,0.35)",
    glow: "0 0 0 1px rgba(139,92,246,0.18), 0 10px 30px -12px rgba(139,92,246,0.28)",
  },
};

// ─────────────────────────────────────────────────────────────
// Formatters auxiliares
// ─────────────────────────────────────────────────────────────
function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

function monthsText(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n <= 0) return "Crítico";
  if (n >= 99) return "> 99m";
  return `${n.toFixed(1)}m`;
}

function humanDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-AR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

// ─────────────────────────────────────────────────────────────
// Pagina
// ─────────────────────────────────────────────────────────────
export default function EscenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(
    null
  );
  const [driversOpenId, setDriversOpenId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [realityConfirm, setRealityConfirm] = useState<{
    scenario: Scenario;
  } | null>(null);

  const { convert, format, mode } = useCurrencyView();
  const today = new Date().toISOString().slice(0, 10);
  const fm = (v: number | null | undefined, d?: string) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    return format(convert(v, d ?? today));
  };

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/scenarios", { cache: "no-store" });
      const js = await res.json();
      if (!js?.ok) throw new Error(js?.error ?? "Error al cargar escenarios");
      setScenarios(js.scenarios as Scenario[]);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  async function doAction(
    id: string,
    kind: "activate" | "clone" | "delete",
    successMsg: string
  ) {
    setBusyId(id);
    try {
      let res: Response;
      if (kind === "delete") {
        res = await fetch(`/api/finance/scenarios/${id}`, { method: "DELETE" });
      } else {
        res = await fetch(`/api/finance/scenarios/${id}?action=${kind}`, {
          method: "POST",
        });
      }
      const js = await res.json().catch(() => ({}));
      if (!res.ok || js?.ok === false) {
        throw new Error(js?.error ?? `Fallo ${kind}`);
      }
      setToast({ msg: successMsg, kind: "ok" });
      await reload();
    } catch (e: any) {
      setToast({ msg: String(e?.message ?? e), kind: "err" });
    } finally {
      setBusyId(null);
    }
  }

  const presets = useMemo(
    () =>
      (scenarios ?? []).filter(
        (s) => s.kind === "CONSERVATIVE" || s.kind === "BASE" || s.kind === "OPTIMIST"
      ),
    [scenarios]
  );
  const customs = useMemo(
    () => (scenarios ?? []).filter((s) => s.kind === "CUSTOM"),
    [scenarios]
  );

  // Para el chart: prioridad activo > Base > primero disponible
  const chartScenario = useMemo(() => {
    if (!scenarios || scenarios.length === 0) return null;
    const active = scenarios.find((s) => s.isActive);
    if (active) return active;
    const base = scenarios.find((s) => s.kind === "BASE");
    if (base) return base;
    return scenarios[0];
  }, [scenarios]);

  return (
    <div className="relative space-y-8">
      {/* ── Hero ───────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 80% 0%, rgba(139,92,246,0.10) 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(6,182,212,0.06) 0%, transparent 55%)",
          }}
        />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background:
                  "linear-gradient(135deg, #a855f7 0%, #6d28d9 100%)",
                boxShadow: "0 0 10px rgba(168,85,247,0.7)",
              }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">
              Fase 5 · Escenarios
            </span>
          </div>

          <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900">
            Escenarios
          </h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-600">
            3 vistas del futuro del negocio — Conservador, Base y Optimista —
            con 12 meses de forecast, estacionalidad LATAM (Día del Niño, Black
            Friday, Navidad) y KPIs calculados en vivo. Activá uno para que el
            resto del P&amp;L use sus drivers, o cloná cualquiera para jugar
            con sliders.
          </p>

          {scenarios && scenarios.filter((s) => s.forecast).length >= 2 && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={() => setCompareOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white"
                style={{
                  background:
                    "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
                  boxShadow: "0 4px 14px -4px rgba(124,58,237,0.55)",
                  transition: `all 220ms ${ES}`,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path
                    d="M3 2.5v9M7 2.5v9M11 2.5v9M1.5 5.5H4.5M5.5 5.5H8.5M9.5 5.5H12.5M1.5 8.5H4.5M5.5 8.5H8.5M9.5 8.5H12.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
                Comparar escenarios
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Estado de carga / error ───────────────────────── */}
      {scenarios === null && !error && <SkeletonGrid />}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-sm text-rose-800">
          <div className="font-semibold">No se pudieron cargar los escenarios</div>
          <div className="mt-1 text-rose-700/90">{error}</div>
          <button
            onClick={reload}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
            style={{ transition: `all 220ms ${ES}` }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ── 3 presets (Conservador / Base / Optimista) ─────── */}
      {scenarios && presets.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Escenarios del sistema
            </h2>
            <span className="text-xs text-slate-400">
              {scenarios.length} total · {presets.length} presets ·{" "}
              {customs.length} custom
            </span>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {presets.map((s) => (
              <ScenarioCard
                key={s.id}
                scenario={s}
                busy={busyId === s.id}
                fm={fm}
                onActivate={() => setRealityConfirm({ scenario: s })}
                onClone={() =>
                  doAction(s.id, "clone", `"${s.name}" clonado como custom`)
                }
                onOpenDrivers={() => setDriversOpenId(s.id)}
                onExportPdf={() =>
                  window.open(`/print/escenarios/${s.id}`, "_blank")
                }
                onDelete={null}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Forecast chart del escenario activo (Fase 5e) ─── */}
      {scenarios && chartScenario && chartScenario.forecast && (
        <section>
          <ScenarioForecastChart
            forecast={chartScenario.forecast}
            color={
              chartScenario.color ??
              (chartScenario.kind === "CONSERVATIVE"
                ? "#ef4444"
                : chartScenario.kind === "OPTIMIST"
                ? "#10b981"
                : chartScenario.kind === "CUSTOM"
                ? "#8b5cf6"
                : "#0ea5e9")
            }
            fm={fm}
            scenarioName={chartScenario.name}
          />
        </section>
      )}

      {/* ── Customs ────────────────────────────────────────── */}
      {scenarios && customs.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Tus escenarios custom
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {customs.map((s) => (
              <ScenarioCard
                key={s.id}
                scenario={s}
                busy={busyId === s.id}
                fm={fm}
                onActivate={() => setRealityConfirm({ scenario: s })}
                onClone={() =>
                  doAction(s.id, "clone", `"${s.name}" clonado`)
                }
                onOpenDrivers={() => setDriversOpenId(s.id)}
                onExportPdf={() =>
                  window.open(`/print/escenarios/${s.id}`, "_blank")
                }
                onDelete={() =>
                  doAction(s.id, "delete", `"${s.name}" borrado`)
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Footer con contexto del bloque ──────────────────── */}
      {scenarios && (
        <footer className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <div>
              Los KPIs de cada card se calculan con el engine del backend —
              inflación mensual compuesta, estacionalidad LATAM y bandas
              min/max si los drivers tienen rango. Próximo paso: sliders
              para ajustar drivers en vivo.
            </div>
            <Link
              href="/finanzas/estado"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-violet-300 hover:text-violet-700"
              style={{ transition: `all 220ms ${ES}` }}
            >
              Ver P&amp;L actual
              <span aria-hidden>→</span>
            </Link>
          </div>
        </footer>
      )}

      {/* ── Drivers Drawer (Fase 5d) ───────────────────────── */}
      {driversOpenId &&
        (() => {
          const s = scenarios?.find((x) => x.id === driversOpenId) ?? null;
          if (!s) return null;
          return (
            <ScenarioDriversDrawer
              scenario={s}
              fm={fm}
              onClose={() => setDriversOpenId(null)}
              onSaved={async () => {
                setToast({ msg: `"${s.name}" actualizado`, kind: "ok" });
                setDriversOpenId(null);
                await reload();
              }}
            />
          );
        })()}

      {/* ── Compare modal (Fase 5f) ─────────────────────────── */}
      {compareOpen && scenarios && (
        <ScenarioCompareView
          scenarios={scenarios}
          fm={fm}
          onClose={() => setCompareOpen(false)}
        />
      )}

      {/* ── Reality confirm modal (Fase 5f) ─────────────────── */}
      {realityConfirm && (
        <RealityConfirmModal
          scenario={realityConfirm.scenario}
          busy={busyId === realityConfirm.scenario.id}
          onCancel={() => setRealityConfirm(null)}
          onConfirm={async () => {
            const s = realityConfirm.scenario;
            setRealityConfirm(null);
            await doAction(
              s.id,
              "activate",
              `"${s.name}" es ahora el escenario real · todo el P&L usa sus drivers`
            );
          }}
        />
      )}

      {/* ── Toast ───────────────────────────────────────────── */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg"
          style={{
            background:
              toast.kind === "ok"
                ? "linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 100%)"
                : "linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%)",
            borderColor:
              toast.kind === "ok"
                ? "rgba(16,185,129,0.35)"
                : "rgba(239,68,68,0.35)",
            color: toast.kind === "ok" ? "#047857" : "#b91c1c",
            backdropFilter: "blur(8px)",
            animation: "toastIn 260ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {toast.msg}
        </div>
      )}

      <style jsx global>{`
        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes skelShimmer {
          0% {
            background-position: -400px 0;
          }
          100% {
            background-position: 400px 0;
          }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Card de escenario
// ─────────────────────────────────────────────────────────────
function ScenarioCard({
  scenario,
  busy,
  fm,
  onActivate,
  onClone,
  onOpenDrivers,
  onExportPdf,
  onDelete,
}: {
  scenario: Scenario;
  busy: boolean;
  fm: (v: number | null | undefined, d?: string) => string;
  onActivate: () => void;
  onClone: () => void;
  onOpenDrivers: () => void;
  onExportPdf: () => void;
  onDelete: (() => void) | null;
}) {
  const meta = KIND_META[scenario.kind] ?? KIND_META.CUSTOM;
  const color = scenario.color ?? meta.color;
  const isActive = scenario.isActive;

  const totals = scenario.forecast?.totals;
  const runway = scenario.forecast?.runway;
  const firstMonth = scenario.forecast?.months?.[0];
  const lastMonth =
    scenario.forecast?.months?.[scenario.forecast.months.length - 1];

  const revenue12m = totals?.revenue ?? null;
  const marginPct = totals?.marginPct ?? null;
  const runwayMonths = runway?.monthsRemaining ?? null;
  const roasDriver = scenario.drivers?.roas?.value ?? null;
  const cogsDriver = scenario.drivers?.cogsPct?.value ?? null;

  return (
    <article
      className="relative flex flex-col overflow-hidden rounded-2xl border bg-white p-5"
      style={{
        borderColor: isActive ? meta.ring : "rgba(226,232,240,0.9)",
        boxShadow: isActive
          ? meta.glow
          : "0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.03)",
        transition: `all 260ms ${ES}`,
      }}
    >
      {/* aurora decorativa arriba */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-12 h-32"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${color}22 0%, transparent 70%)`,
        }}
      />

      {/* Header */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: color, boxShadow: `0 0 8px ${color}66` }}
            />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color }}
            >
              {meta.label}
            </span>
            {isActive && (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]"
                style={{
                  borderColor: meta.ring,
                  color,
                  background: `${color}10`,
                }}
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="none"
                  aria-hidden
                >
                  <circle
                    cx="4"
                    cy="4"
                    r="3"
                    fill={color}
                    style={{ filter: `drop-shadow(0 0 3px ${color})` }}
                  />
                </svg>
                Activo
              </span>
            )}
          </div>
          <h3 className="mt-2 truncate text-xl font-semibold tracking-tight text-slate-900">
            {scenario.name}
          </h3>
          {scenario.description && (
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-slate-500">
              {scenario.description}
            </p>
          )}
        </div>
      </div>

      {/* KPIs 2x2 */}
      <div className="relative mt-5 grid grid-cols-2 gap-3">
        <KpiCell
          label="Revenue 12M"
          value={fm(revenue12m)}
          dim={revenue12m === null}
        />
        <KpiCell label="Margen neto" value={pct(marginPct, 1)} />
        <KpiCell
          label="Runway"
          value={monthsText(runwayMonths)}
          accent={
            runway?.status === "critical"
              ? "#dc2626"
              : runway?.status === "warn"
              ? "#d97706"
              : undefined
          }
        />
        <KpiCell
          label="ROAS"
          value={
            roasDriver !== null && Number.isFinite(roasDriver)
              ? `${Number(roasDriver).toFixed(2)}x`
              : "—"
          }
          hint={
            cogsDriver !== null && Number.isFinite(cogsDriver)
              ? `COGS ${Number(cogsDriver).toFixed(0)}%`
              : undefined
          }
        />
      </div>

      {/* Mini range bar: revenue del primer → ultimo mes */}
      {firstMonth && lastMonth && (
        <div className="relative mt-5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            <span>{shortMonth(firstMonth.month)}</span>
            <span>{shortMonth(lastMonth.month)}</span>
          </div>
          <div
            className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "rgba(226,232,240,0.9)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: "100%",
                background: `linear-gradient(90deg, ${color}33 0%, ${color} 100%)`,
              }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] font-medium tabular-nums text-slate-600">
            <span>{fm(firstMonth.revenue, firstMonth.month + "-15")}</span>
            <span>{fm(lastMonth.revenue, lastMonth.month + "-15")}</span>
          </div>
        </div>
      )}

      {/* Footer: acciones */}
      <div className="relative mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {isActive ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold"
            style={{
              borderColor: meta.ring,
              color,
              background: `${color}10`,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M2 6l3 3 5-5"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Ya es el activo
          </span>
        ) : (
          <button
            onClick={onActivate}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
              boxShadow: `0 4px 14px -4px ${color}88`,
              transition: `all 220ms ${ES}`,
            }}
            title="Convertí este escenario en la base real del negocio"
          >
            {busy ? (
              "…"
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path
                    d="M6 1.5l1.5 3 3.3.5-2.4 2.3.6 3.3L6 9.1l-3 1.5.6-3.3L1.2 5l3.3-.5L6 1.5z"
                    fill="currentColor"
                  />
                </svg>
                Hacerlo realidad
              </>
            )}
          </button>
        )}

        <button
          onClick={onOpenDrivers}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          style={{ transition: `all 220ms ${ES}` }}
          aria-label="Ajustar drivers"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M3 4h8M3 7h8M3 10h8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="5" cy="4" r="1.4" fill="#fff" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="9" cy="7" r="1.4" fill="#fff" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="5" cy="10" r="1.4" fill="#fff" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          Drivers
        </button>

        <button
          onClick={onClone}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          style={{ transition: `all 220ms ${ES}` }}
        >
          Clonar
        </button>

        <button
          onClick={onExportPdf}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          style={{ transition: `all 220ms ${ES}` }}
          aria-label="Exportar PDF"
          title="Abre una vista imprimible en una nueva pestaña"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M4 2.5h5l2 2V11a.5.5 0 0 1-.5.5h-6.5A.5.5 0 0 1 3.5 11V3a.5.5 0 0 1 .5-.5z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
              fill="none"
            />
            <path d="M9 2.5V4.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
            <path d="M5.2 7.5h3.6M5.2 9.2h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </svg>
          PDF
        </button>

        {onDelete && (
          <button
            onClick={onDelete}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-xs font-medium text-rose-600 hover:border-rose-200 hover:bg-rose-50 disabled:opacity-50"
            style={{ transition: `all 220ms ${ES}` }}
            aria-label="Borrar escenario"
          >
            Borrar
          </button>
        )}
      </div>

      {scenario.lastComputedAt && (
        <div className="relative mt-2 text-[10px] text-slate-400">
          Calculado {humanDate(scenario.lastComputedAt)}
        </div>
      )}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────
// Celda KPI
// ─────────────────────────────────────────────────────────────
function KpiCell({
  label,
  value,
  hint,
  accent,
  dim,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  dim?: boolean;
}) {
  return (
    <div
      className="rounded-xl border px-3 py-2"
      style={{
        borderColor: "rgba(226,232,240,0.9)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.6) 100%)",
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div
        className="mt-0.5 truncate text-base font-semibold tabular-nums tracking-tight"
        style={{
          color: accent ?? (dim ? "#94a3b8" : "#0f172a"),
        }}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[10px] tabular-nums text-slate-400">{hint}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Skeleton de carga
// ─────────────────────────────────────────────────────────────
function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200 bg-white p-5"
        >
          <SkelBar w="40%" h={10} />
          <SkelBar w="70%" h={22} className="mt-3" />
          <SkelBar w="90%" h={12} className="mt-2" />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <SkelBar h={52} />
            <SkelBar h={52} />
            <SkelBar h={52} />
            <SkelBar h={52} />
          </div>
          <SkelBar h={36} className="mt-5" />
        </div>
      ))}
    </div>
  );
}

function SkelBar({
  w = "100%",
  h = 14,
  className = "",
}: {
  w?: string;
  h?: number;
  className?: string;
}) {
  return (
    <div
      className={`rounded-md ${className}`}
      style={{
        width: w,
        height: h,
        background:
          "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
        backgroundSize: "800px 100%",
        animation: "skelShimmer 1.6s ease-in-out infinite",
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function shortMonth(m: string): string {
  // "2026-04-01" → "abr 26"
  if (!m || m.length < 7) return m ?? "";
  const [y, mo] = m.split("-");
  const names = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  const idx = Math.max(0, Math.min(11, parseInt(mo, 10) - 1));
  return `${names[idx]} ${y.slice(2)}`;
}

// ─────────────────────────────────────────────────────────────
// Reality Confirm Modal (Fase 5f)
// ─────────────────────────────────────────────────────────────
function RealityConfirmModal({
  scenario,
  busy,
  onCancel,
  onConfirm,
}: {
  scenario: Scenario;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const meta = KIND_META[scenario.kind] ?? KIND_META.CUSTOM;
  const color = scenario.color ?? meta.color;
  const totals = scenario.forecast?.totals;
  const runway = scenario.forecast?.runway;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && !busy) onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onCancel, onConfirm, busy]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{
        background: "rgba(15,23,42,0.6)",
        backdropFilter: "blur(6px)",
        animation: `realityFade 220ms ${ES}`,
      }}
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl"
        style={{
          borderColor: `${color}44`,
          animation: `realityIn 280ms ${ES}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-10 h-32"
          style={{
            background: `radial-gradient(ellipse at 50% 0%, ${color}33 0%, transparent 70%)`,
          }}
        />
        <div className="relative p-6">
          <div className="inline-flex items-center gap-2 rounded-full border bg-white px-2.5 py-1"
            style={{ borderColor: `${color}55` }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: color, boxShadow: `0 0 8px ${color}` }}
            />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color }}
            >
              Hacer realidad · {meta.label}
            </span>
          </div>

          <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
            Activar “{scenario.name}”
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
            Este escenario pasa a ser la <strong>base real</strong> del
            negocio. Todo el P&amp;L, el Pulso y los reportes van a usar los
            drivers de este escenario para calcular KPIs y forecasts.
          </p>

          {/* Mini resumen de lo que va a pasar */}
          <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[12px]">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Revenue 12M esperado
              </div>
              <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
                {totals?.revenue !== undefined
                  ? new Intl.NumberFormat("es-AR", {
                      style: "currency",
                      currency: "ARS",
                      maximumFractionDigits: 0,
                    }).format(totals.revenue)
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Margen neto
              </div>
              <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
                {pct(totals?.marginPct, 1)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Runway
              </div>
              <div
                className="mt-0.5 font-semibold tabular-nums"
                style={{
                  color:
                    runway?.status === "critical"
                      ? "#dc2626"
                      : runway?.status === "warn"
                      ? "#d97706"
                      : "#0f172a",
                }}
              >
                {monthsText(runway?.monthsRemaining)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Horizonte
              </div>
              <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
                {scenario.horizonMonths} meses
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              onClick={onCancel}
              disabled={busy}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
              style={{ transition: `all 200ms ${ES}` }}
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{
                background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
                boxShadow: `0 4px 14px -4px ${color}aa`,
                transition: `all 200ms ${ES}`,
              }}
            >
              {busy ? (
                "Activando…"
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path
                      d="M6 1.5l1.5 3 3.3.5-2.4 2.3.6 3.3L6 9.1l-3 1.5.6-3.3L1.2 5l3.3-.5L6 1.5z"
                      fill="currentColor"
                    />
                  </svg>
                  Sí, hacerlo realidad
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes realityFade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes realityIn {
          from {
            opacity: 0;
            transform: translateY(14px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
