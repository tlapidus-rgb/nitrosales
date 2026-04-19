// @ts-nocheck
"use client";

/**
 * ScenarioCompareView — Fase 5f
 * ─────────────────────────────────────────────────────────────
 * Modal a pantalla completa para comparar 2–3 escenarios lado a lado.
 *
 * Entrada: array de escenarios ya con forecast (como los trae
 * /api/finance/scenarios). El modal deja que Tomy elija cuales ver,
 * muestra una tabla de KPIs con diff vs BASE y mini sparklines SVG
 * por panel.
 *
 * No hace ningun fetch: es puro render sobre data que ya trajo la
 * pagina (evita round-trips).
 *
 * Si hay exactamente 3 presets, arranca con los 3 activos. Si no,
 * arranca con el activo + hasta 2 mas.
 */

import React, { useEffect, useMemo, useState } from "react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

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
  lastComputedAt: string | null;
  forecast: ForecastResult | null;
};

const KIND_COLORS: Record<ScenarioKind, string> = {
  CONSERVATIVE: "#ef4444",
  BASE: "#0ea5e9",
  OPTIMIST: "#10b981",
  CUSTOM: "#8b5cf6",
};

const KIND_LABELS: Record<ScenarioKind, string> = {
  CONSERVATIVE: "Conservador",
  BASE: "Base",
  OPTIMIST: "Optimista",
  CUSTOM: "Custom",
};

function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

function deltaPct(current: number, base: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(base) || base === 0) return null;
  return ((current - base) / Math.abs(base)) * 100;
}

function deltaAbs(current: number, base: number): number {
  return current - base;
}

function DeltaBadge({
  value,
  invert,
}: {
  value: number | null;
  invert?: boolean;
}) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="text-[10px] tabular-nums text-slate-400">—</span>;
  }
  if (Math.abs(value) < 0.01) {
    return (
      <span className="text-[10px] tabular-nums text-slate-500">
        vs Base: 0%
      </span>
    );
  }
  // invert = para metricas donde "menos es mejor" (COGS, Opex)
  const positive = invert ? value < 0 : value > 0;
  return (
    <span
      className="text-[10px] tabular-nums"
      style={{ color: positive ? "#059669" : "#dc2626" }}
    >
      vs Base: {value > 0 ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Mini sparkline SVG puro por panel
// ─────────────────────────────────────────────────────────────
function MiniSparkline({
  months,
  color,
  height = 48,
}: {
  months: MonthForecast[];
  color: string;
  height?: number;
}) {
  if (!months || months.length === 0) return null;
  const W = 200;
  const H = height;
  const padY = 4;
  const max = Math.max(...months.map((m) => m.revenue), 1);
  const min = Math.min(...months.map((m) => m.revenue), 0);
  const range = Math.max(1, max - min);
  const step = W / Math.max(1, months.length - 1);
  const pts = months.map((m, i) => {
    const x = i * step;
    const y = H - padY - ((m.revenue - min) / range) * (H - padY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M ${pts.join(" L ")}`;
  const areaPath = `${linePath} L ${W},${H} L 0,${H} Z`;
  const gid = `mini-${color.replace("#", "")}-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-12 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gid})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Panel de 1 escenario
// ─────────────────────────────────────────────────────────────
function ScenarioPanel({
  scenario,
  fm,
  base,
  isBase,
}: {
  scenario: Scenario;
  fm: (v: number | null | undefined, d?: string) => string;
  base: Scenario | null;
  isBase: boolean;
}) {
  const color = scenario.color ?? KIND_COLORS[scenario.kind];
  const totals = scenario.forecast?.totals;
  const months = scenario.forecast?.months ?? [];
  const runway = scenario.forecast?.runway;

  const baseTotals = base?.forecast?.totals;
  const baseRunway = base?.forecast?.runway;

  const rev = totals?.revenue ?? 0;
  const net = totals?.netProfit ?? 0;
  const cogs = totals?.cogs ?? 0;
  const adSpend = totals?.adSpend ?? 0;
  const opex = totals?.opex ?? 0;
  const marginPct = totals?.marginPct ?? 0;
  const runwayM = runway?.monthsRemaining ?? null;

  const revDelta = baseTotals ? deltaPct(rev, baseTotals.revenue) : null;
  const netDelta = baseTotals ? deltaPct(net, baseTotals.netProfit) : null;
  const marginDelta = baseTotals
    ? deltaAbs(marginPct, baseTotals.marginPct)
    : null;
  const cogsDelta = baseTotals ? deltaPct(cogs, baseTotals.cogs) : null;
  const adSpendDelta = baseTotals ? deltaPct(adSpend, baseTotals.adSpend) : null;
  const opexDelta = baseTotals ? deltaPct(opex, baseTotals.opex) : null;
  const runwayDelta =
    baseRunway?.monthsRemaining !== null &&
    baseRunway?.monthsRemaining !== undefined &&
    runwayM !== null
      ? runwayM - baseRunway.monthsRemaining
      : null;

  return (
    <div
      className="flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white"
      style={{
        borderColor: isBase
          ? `${color}66`
          : scenario.isActive
          ? `${color}88`
          : "rgba(226,232,240,0.9)",
        boxShadow: scenario.isActive
          ? `0 0 0 1px ${color}33, 0 10px 30px -12px ${color}33`
          : "0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.03)",
      }}
    >
      {/* Header */}
      <div className="relative p-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-8 h-20"
          style={{
            background: `radial-gradient(ellipse at 50% 0%, ${color}22 0%, transparent 70%)`,
          }}
        />
        <div className="relative flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: color, boxShadow: `0 0 8px ${color}66` }}
          />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color }}
          >
            {KIND_LABELS[scenario.kind]}
          </span>
          {isBase && (
            <span
              className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]"
              style={{
                borderColor: `${color}55`,
                color,
                background: `${color}12`,
              }}
            >
              Pivot
            </span>
          )}
          {scenario.isActive && (
            <span
              className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]"
              style={{
                borderColor: "rgba(16,185,129,0.45)",
                color: "#059669",
                background: "rgba(16,185,129,0.08)",
              }}
            >
              Activo
            </span>
          )}
        </div>
        <h3 className="relative mt-2 truncate text-lg font-semibold tracking-tight text-slate-900">
          {scenario.name}
        </h3>
      </div>

      {/* Sparkline */}
      {months.length > 0 && (
        <div className="relative px-4 pb-2">
          <MiniSparkline months={months} color={color} />
          <div className="mt-1 flex items-center justify-between text-[10px] font-medium tabular-nums text-slate-500">
            <span>{months[0]?.month}</span>
            <span>{months[months.length - 1]?.month}</span>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="relative grid grid-cols-2 gap-px bg-slate-100 px-px pb-px">
        <KpiRow
          label="Revenue 12M"
          value={fm(rev)}
          delta={isBase ? null : revDelta}
        />
        <KpiRow
          label="Margen neto"
          value={pct(marginPct, 1)}
          delta={
            isBase
              ? null
              : marginDelta !== null
              ? { pct: marginDelta, suffix: "pp" }
              : null
          }
        />
        <KpiRow
          label="Net 12M"
          value={fm(net)}
          delta={isBase ? null : netDelta}
        />
        <KpiRow
          label="Runway"
          value={
            runwayM === null || !Number.isFinite(runwayM)
              ? "—"
              : runwayM <= 0
              ? "Crítico"
              : runwayM >= 99
              ? "> 99m"
              : `${runwayM.toFixed(1)}m`
          }
          delta={
            isBase
              ? null
              : runwayDelta !== null
              ? { abs: runwayDelta, suffix: "m" }
              : null
          }
          accent={
            runway?.status === "critical"
              ? "#dc2626"
              : runway?.status === "warn"
              ? "#d97706"
              : undefined
          }
        />
      </div>

      {/* Costos */}
      <div className="relative grid grid-cols-3 gap-px bg-slate-100 px-px">
        <KpiRow
          label="COGS 12M"
          value={fm(cogs)}
          delta={isBase ? null : cogsDelta}
          invert
          compact
        />
        <KpiRow
          label="Ad spend"
          value={fm(adSpend)}
          delta={isBase ? null : adSpendDelta}
          invert
          compact
        />
        <KpiRow
          label="Opex"
          value={fm(opex)}
          delta={isBase ? null : opexDelta}
          invert
          compact
        />
      </div>

      {/* Drivers resumen */}
      {scenario.drivers && (
        <div className="relative mt-auto border-t border-slate-100 bg-slate-50/60 p-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Drivers clave
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <DriverLine label="CR" value={scenario.drivers?.conversionRate?.value} unit="%" digits={2} />
            <DriverLine label="AOV" value={scenario.drivers?.aov?.value} unit="$" />
            <DriverLine label="ROAS" value={scenario.drivers?.roas?.value} unit="x" digits={2} />
            <DriverLine label="COGS" value={scenario.drivers?.cogsPct?.value} unit="%" digits={0} />
            <DriverLine label="Tráfico" value={scenario.drivers?.traffic?.value} unit="v" digits={0} />
            <DriverLine label="Inflación" value={scenario.drivers?.inflation?.value} unit="%" digits={1} />
          </div>
        </div>
      )}
    </div>
  );
}

function DriverLine({
  label,
  value,
  unit,
  digits = 0,
}: {
  label: string;
  value: any;
  unit: string;
  digits?: number;
}) {
  const v = typeof value === "number" && Number.isFinite(value) ? value : null;
  const fmt = () => {
    if (v === null) return "—";
    if (unit === "$") {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0,
      }).format(v);
    }
    if (unit === "v") {
      return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(v);
    }
    return `${v.toFixed(digits)}${unit}`;
  };
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="tabular-nums font-medium text-slate-800">{fmt()}</span>
    </div>
  );
}

function KpiRow({
  label,
  value,
  delta,
  accent,
  invert,
  compact,
}: {
  label: string;
  value: string;
  delta: number | { pct?: number; abs?: number; suffix?: string } | null;
  accent?: string;
  invert?: boolean;
  compact?: boolean;
}) {
  const renderDelta = () => {
    if (delta === null || delta === undefined) return null;
    if (typeof delta === "number") {
      return <DeltaBadge value={delta} invert={invert} />;
    }
    if (delta.pct !== undefined) {
      const positive = invert ? delta.pct < 0 : delta.pct > 0;
      if (Math.abs(delta.pct) < 0.01) {
        return (
          <span className="text-[10px] tabular-nums text-slate-500">
            vs Base: 0{delta.suffix ?? ""}
          </span>
        );
      }
      return (
        <span
          className="text-[10px] tabular-nums"
          style={{ color: positive ? "#059669" : "#dc2626" }}
        >
          vs Base: {delta.pct > 0 ? "+" : ""}
          {delta.pct.toFixed(1)}
          {delta.suffix ?? ""}
        </span>
      );
    }
    if (delta.abs !== undefined) {
      const positive = invert ? delta.abs < 0 : delta.abs > 0;
      if (Math.abs(delta.abs) < 0.05) {
        return (
          <span className="text-[10px] tabular-nums text-slate-500">
            vs Base: 0{delta.suffix ?? ""}
          </span>
        );
      }
      return (
        <span
          className="text-[10px] tabular-nums"
          style={{ color: positive ? "#059669" : "#dc2626" }}
        >
          vs Base: {delta.abs > 0 ? "+" : ""}
          {delta.abs.toFixed(1)}
          {delta.suffix ?? ""}
        </span>
      );
    }
    return null;
  };

  return (
    <div
      className="bg-white px-3 py-2"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div
        className={`mt-0.5 truncate tabular-nums font-semibold tracking-tight ${
          compact ? "text-sm" : "text-base"
        }`}
        style={{ color: accent ?? "#0f172a" }}
      >
        {value}
      </div>
      {renderDelta()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main view
// ─────────────────────────────────────────────────────────────
export default function ScenarioCompareView({
  scenarios,
  fm,
  onClose,
}: {
  scenarios: Scenario[];
  fm: (v: number | null | undefined, d?: string) => string;
  onClose: () => void;
}) {
  // Arranca con hasta 3: activo + presets, pero solo los que tienen forecast.
  const defaultSelected = useMemo(() => {
    const withForecast = scenarios.filter((s) => s.forecast);
    const active = withForecast.find((s) => s.isActive);
    const base = withForecast.find((s) => s.kind === "BASE");
    const others = withForecast.filter(
      (s) => s.id !== active?.id && s.id !== base?.id
    );
    const seed: string[] = [];
    if (base) seed.push(base.id);
    if (active && active.id !== base?.id) seed.push(active.id);
    for (const o of others) {
      if (seed.length >= 3) break;
      seed.push(o.id);
    }
    return seed.slice(0, 3);
  }, [scenarios]);

  const [selected, setSelected] = useState<string[]>(defaultSelected);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        return [prev[1], prev[2], id];
      }
      return [...prev, id];
    });
  };

  const selectedScenarios = useMemo(
    () =>
      selected
        .map((id) => scenarios.find((s) => s.id === id))
        .filter((x): x is Scenario => !!x && !!x.forecast),
    [selected, scenarios]
  );

  // El BASE de comparacion: el BASE del sistema si esta seleccionado, si no
  // el primero seleccionado.
  const baseForDelta = useMemo(() => {
    const baseSel = selectedScenarios.find((s) => s.kind === "BASE");
    return baseSel ?? selectedScenarios[0] ?? null;
  }, [selectedScenarios]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-center"
      style={{
        background: "rgba(15,23,42,0.55)",
        backdropFilter: "blur(4px)",
        animation: `compareFade 240ms ${ES}`,
      }}
      onClick={onClose}
    >
      <div
        className="relative m-0 flex h-full w-full max-w-7xl flex-col overflow-hidden bg-white shadow-2xl sm:my-6 sm:h-auto sm:max-h-[calc(100vh-48px)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background:
                    "linear-gradient(135deg, #a855f7 0%, #6d28d9 100%)",
                  boxShadow: "0 0 8px rgba(168,85,247,0.6)",
                }}
              />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                Comparativo · Fase 5f
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              Comparar escenarios
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-slate-500">
              Elegí hasta 3 escenarios. Los deltas se calculan contra el{" "}
              <span className="font-semibold text-slate-700">
                {baseForDelta?.name ?? "primero seleccionado"}
              </span>
              .
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
            style={{ transition: `all 200ms ${ES}` }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        {/* Selector */}
        <div className="border-b border-slate-100 bg-slate-50/50 p-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Selección — {selected.length} / 3
          </div>
          <div className="flex flex-wrap gap-2">
            {scenarios.map((s) => {
              const active = selected.includes(s.id);
              const disabled = !s.forecast;
              const color = s.color ?? KIND_COLORS[s.kind];
              return (
                <button
                  key={s.id}
                  onClick={() => !disabled && toggle(s.id)}
                  disabled={disabled}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    borderColor: active ? `${color}88` : "rgba(226,232,240,0.9)",
                    background: active ? `${color}12` : "white",
                    color: active ? color : "#334155",
                    boxShadow: active ? `0 0 0 1px ${color}33` : "none",
                    transition: `all 200ms ${ES}`,
                  }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background: color,
                      boxShadow: active ? `0 0 8px ${color}` : "none",
                    }}
                  />
                  {s.name}
                  {s.isActive && (
                    <span
                      className="text-[9px] font-semibold uppercase tracking-[0.1em]"
                      style={{ color: "#059669" }}
                    >
                      · activo
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Paneles */}
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {selectedScenarios.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-10 text-center text-sm text-slate-500">
              Seleccioná al menos un escenario para ver la comparación.
            </div>
          ) : (
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${selectedScenarios.length}, minmax(0, 1fr))`,
              }}
            >
              {selectedScenarios.map((s) => (
                <ScenarioPanel
                  key={s.id}
                  scenario={s}
                  fm={fm}
                  base={baseForDelta}
                  isBase={baseForDelta?.id === s.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-[11px] text-slate-500">
          <div>
            Los deltas en % se calculan vs el escenario pivot. "pp" = puntos
            porcentuales (márgenes), "m" = meses.
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300"
            style={{ transition: `all 200ms ${ES}` }}
          >
            Cerrar
          </button>
        </footer>
      </div>

      <style jsx>{`
        @keyframes compareFade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
