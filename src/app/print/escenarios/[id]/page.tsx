// @ts-nocheck
"use client";

/**
 * /print/escenarios/[id] — Fase 5f
 * ─────────────────────────────────────────────────────────────
 * Vista printable de un escenario. Se abre en nueva tab, dispara
 * window.print() automaticamente y Tomy usa "Guardar como PDF"
 * del navegador. Sin dependencias externas (jspdf, puppeteer).
 *
 * Fuera del route group (app), asi no hereda la sidebar/chrome.
 *
 * Incluye:
 *   - Portada con nombre + kind + descripcion + fecha
 *   - Tabla de drivers con unidades
 *   - KPI grid (Revenue / Margen / Net / Runway)
 *   - Line chart SVG puro (no interactivo)
 *   - Waterfall SVG puro (breakdown Revenue → Net)
 *   - Tabla mensual completa con Revenue / COGS / AdSpend / Opex / Net
 *   - Footer con firma y URL original
 */

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

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

type Scenario = {
  id: string;
  name: string;
  kind: "BASE" | "OPTIMIST" | "CONSERVATIVE" | "CUSTOM";
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

const KIND_COLORS: Record<Scenario["kind"], string> = {
  CONSERVATIVE: "#ef4444",
  BASE: "#0ea5e9",
  OPTIMIST: "#10b981",
  CUSTOM: "#8b5cf6",
};

const KIND_LABELS: Record<Scenario["kind"], string> = {
  CONSERVATIVE: "Conservador",
  BASE: "Base",
  OPTIMIST: "Optimista",
  CUSTOM: "Custom",
};

const PEAK_MONTHS: Record<number, string> = {
  5: "Hot Sale",
  8: "Día del Niño",
  11: "Black Friday",
  12: "Navidad",
};

function fmtARS(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

function shortMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(Math.round(v));
}

function shortMonth(iso: string): string {
  const [y, m] = iso.split("-").map((n) => parseInt(n, 10));
  const names = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
  ];
  return `${names[(m - 1) % 12]} '${String(y).slice(2)}`;
}

function monthIdx(iso: string): number {
  const [, m] = iso.split("-").map((n) => parseInt(n, 10));
  return m;
}

function formatDriver(key: string, v: any): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const num = Number(v);
  switch (key) {
    case "aov":
    case "opexBase":
      return fmtARS(num);
    case "traffic":
      return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(num);
    case "conversionRate":
      return `${num.toFixed(2)}%`;
    case "cogsPct":
    case "inflation":
      return `${num.toFixed(1)}%`;
    case "roas":
      return `${num.toFixed(2)}x`;
    case "adSpend":
      return fmtARS(num);
    case "fxMonthly":
      return `${num.toFixed(1)}%`;
    case "headcount":
      return `${num.toFixed(0)}`;
    default:
      return String(num);
  }
}

const DRIVER_LABELS: Record<string, string> = {
  traffic: "Tráfico mensual",
  conversionRate: "Conversion Rate (CR)",
  aov: "Ticket promedio (AOV)",
  adSpend: "Inversión publicitaria",
  roas: "ROAS objetivo",
  cogsPct: "COGS como % revenue",
  opexBase: "Opex fijo mensual",
  headcount: "Headcount",
  inflation: "Inflación mensual",
  fxMonthly: "Devaluación ARS/USD mensual",
};

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────
export default function ScenarioPrintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/finance/scenarios/${id}`, {
          cache: "no-store",
        });
        const js = await res.json();
        if (!js?.ok) throw new Error(js?.error ?? "No se pudo cargar el escenario");
        setScenario(js.scenario as Scenario);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, [id]);

  // Auto-print despues de que este todo renderizado + fonts cargadas
  useEffect(() => {
    if (!scenario || error) return;
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        /* noop */
      }
    }, 650);
    return () => clearTimeout(t);
  }, [scenario, error]);

  if (error) {
    return (
      <div className="min-h-screen bg-white p-10">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
          <div className="font-semibold">Error</div>
          <div className="mt-1 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="min-h-screen bg-white p-10 text-slate-500">
        Cargando escenario…
      </div>
    );
  }

  const color = scenario.color ?? KIND_COLORS[scenario.kind];
  const totals = scenario.forecast?.totals;
  const months = scenario.forecast?.months ?? [];
  const runway = scenario.forecast?.runway;
  const today = new Date().toLocaleString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const runwayLabel =
    runway?.monthsRemaining === null || runway?.monthsRemaining === undefined
      ? "—"
      : runway.monthsRemaining <= 0
      ? "Crítico"
      : runway.monthsRemaining >= 99
      ? "> 99m"
      : `${runway.monthsRemaining.toFixed(1)} meses`;

  return (
    <div className="print-root min-h-screen bg-white p-10 text-slate-900">
      {/* Barra fixed solo en pantalla */}
      <div className="no-print fixed top-3 right-3 z-50 flex items-center gap-2">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-slate-800"
        >
          Imprimir / PDF
        </button>
        <button
          onClick={() => window.close()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cerrar
        </button>
      </div>

      {/* ── Portada ─────────────────────────────────────────── */}
      <header
        className="relative overflow-hidden rounded-2xl border p-8"
        style={{
          borderColor: `${color}44`,
          background: `linear-gradient(135deg, ${color}08 0%, white 70%)`,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 100% 0%, ${color}18 0%, transparent 55%)`,
          }}
        />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1"
            style={{ borderColor: `${color}66` }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color }}
            >
              Escenario · {KIND_LABELS[scenario.kind]}
            </span>
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">
            {scenario.name}
          </h1>
          {scenario.description && (
            <p className="mt-2 max-w-2xl text-[14px] text-slate-600">
              {scenario.description}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <div>
              <span className="font-semibold text-slate-700">Horizonte:</span>{" "}
              {scenario.horizonMonths} meses
            </div>
            <div>
              <span className="font-semibold text-slate-700">Creado:</span>{" "}
              {new Date(scenario.createdAt).toLocaleDateString("es-AR")}
            </div>
            <div>
              <span className="font-semibold text-slate-700">Calculado:</span>{" "}
              {scenario.lastComputedAt
                ? new Date(scenario.lastComputedAt).toLocaleString("es-AR")
                : "—"}
            </div>
          </div>
        </div>
      </header>

      {/* ── KPIs grandes ────────────────────────────────────── */}
      <section className="mt-6 grid grid-cols-4 gap-3">
        <BigKpi
          label="Revenue 12M"
          value={fmtARS(totals?.revenue)}
          color={color}
        />
        <BigKpi
          label="Margen neto"
          value={fmtPct(totals?.marginPct, 1)}
          color={color}
        />
        <BigKpi
          label="Net profit 12M"
          value={fmtARS(totals?.netProfit)}
          color={color}
        />
        <BigKpi
          label="Runway"
          value={runwayLabel}
          color={
            runway?.status === "critical"
              ? "#dc2626"
              : runway?.status === "warn"
              ? "#d97706"
              : color
          }
        />
      </section>

      {/* ── Drivers ─────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Drivers del modelo
        </h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-3 py-2 text-left font-semibold text-slate-600">
                  Driver
                </th>
                <th className="px-3 py-2 text-right font-semibold text-slate-600">
                  Valor
                </th>
                <th className="px-3 py-2 text-right font-semibold text-slate-600">
                  Min
                </th>
                <th className="px-3 py-2 text-right font-semibold text-slate-600">
                  Max
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(scenario.drivers ?? {}).map(([k, raw]) => {
                const d = raw as any;
                return (
                  <tr key={k} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2 text-slate-700">
                      {DRIVER_LABELS[k] ?? k}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatDriver(k, d?.value)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {d?.min !== null && d?.min !== undefined
                        ? formatDriver(k, d.min)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {d?.max !== null && d?.max !== undefined
                        ? formatDriver(k, d.max)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Forecast chart SVG ──────────────────────────────── */}
      {months.length > 0 && (
        <section className="mt-8 page-break-before">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Forecast 12 meses
          </h2>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
            <StaticForecastChart months={months} color={color} />
          </div>
        </section>
      )}

      {/* ── Waterfall Revenue → Net ─────────────────────────── */}
      {totals && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            De Revenue a Net — breakdown 12M
          </h2>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
            <StaticWaterfall totals={totals} />
          </div>
        </section>
      )}

      {/* ── Tabla mensual ───────────────────────────────────── */}
      {months.length > 0 && (
        <section className="mt-8 page-break-before">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Detalle mes a mes
          </h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-2 py-2 text-left font-semibold text-slate-600">Mes</th>
                  <th className="px-2 py-2 text-right font-semibold text-slate-600">Revenue</th>
                  <th className="px-2 py-2 text-right font-semibold text-slate-600">COGS</th>
                  <th className="px-2 py-2 text-right font-semibold text-slate-600">Ad spend</th>
                  <th className="px-2 py-2 text-right font-semibold text-slate-600">Opex</th>
                  <th className="px-2 py-2 text-right font-semibold text-slate-600">Net</th>
                  <th className="px-2 py-2 text-right font-semibold text-slate-600">Margen</th>
                  <th className="px-2 py-2 text-right font-semibold text-slate-600">Cash fin</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const peak = PEAK_MONTHS[monthIdx(m.month)];
                  return (
                    <tr
                      key={m.month}
                      className="border-b border-slate-100 last:border-b-0"
                      style={peak ? { background: "rgba(245,158,11,0.06)" } : undefined}
                    >
                      <td className="px-2 py-1.5 text-slate-700">
                        {shortMonth(m.month)}
                        {peak && (
                          <span className="ml-2 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700"
                            style={{ background: "rgba(245,158,11,0.16)" }}
                          >
                            {peak}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmtARS(m.revenue)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmtARS(m.cogs)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmtARS(m.adSpend)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmtARS(m.opex)}</td>
                      <td
                        className="px-2 py-1.5 text-right tabular-nums font-semibold"
                        style={{
                          color: m.netProfit >= 0 ? "#059669" : "#dc2626",
                        }}
                      >
                        {fmtARS(m.netProfit)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmtPct(m.marginPct, 1)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                        {m.cashEnd !== null && m.cashEnd !== undefined ? fmtARS(m.cashEnd) : "—"}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                  <td className="px-2 py-2 text-slate-800">Total 12M</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtARS(totals?.revenue)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtARS(totals?.cogs)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtARS(totals?.adSpend)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtARS(totals?.opex)}</td>
                  <td
                    className="px-2 py-2 text-right tabular-nums"
                    style={{
                      color:
                        (totals?.netProfit ?? 0) >= 0 ? "#059669" : "#dc2626",
                    }}
                  >
                    {fmtARS(totals?.netProfit)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtPct(totals?.marginPct, 1)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-500">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="mt-10 border-t border-slate-200 pt-4 text-[10px] text-slate-500">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>Generado: {today} · NitroSales · /finanzas/escenarios</div>
          <div>Escenario ID: {scenario.id}</div>
        </div>
        <div className="mt-1 text-slate-400">
          Forecast determinista · Engine v1 con seasonality LATAM_TOYS ·
          Valores en ARS nominal del momento del cálculo.
        </div>
      </footer>

      {/* ── Print styles ─────────────────────────────────────── */}
      <style jsx global>{`
        @page {
          size: A4;
          margin: 12mm;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          .print-root {
            padding: 0 !important;
            font-size: 11px !important;
          }
          body {
            background: white !important;
          }
          .page-break-before {
            page-break-before: always;
          }
          section {
            break-inside: avoid;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Big KPI card
// ─────────────────────────────────────────────────────────────
function BigKpi({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: "rgba(226,232,240,0.9)",
        background: `linear-gradient(180deg, ${color}06 0%, white 100%)`,
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div
        className="mt-1 truncate text-2xl font-bold tabular-nums tracking-tight"
        style={{ color: "#0f172a" }}
      >
        {value}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Chart estatico para print (sin hover, sin state)
// ─────────────────────────────────────────────────────────────
function StaticForecastChart({
  months,
  color,
}: {
  months: MonthForecast[];
  color: string;
}) {
  const W = 820;
  const H = 260;
  const padL = 60;
  const padR = 16;
  const padT = 20;
  const padB = 44;

  const xs = months.map(
    (_, i) => padL + ((W - padL - padR) * i) / Math.max(1, months.length - 1)
  );
  const maxY = Math.max(...months.map((m) => m.revenue)) * 1.1;
  const minY = 0;
  const yFor = (v: number) =>
    padT + (H - padT - padB) * (1 - (v - minY) / Math.max(1, maxY - minY));
  const ys = months.map((m) => yFor(m.revenue));

  const linePath = months
    .map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${xs[xs.length - 1].toFixed(1)} ${H - padB} L ${xs[0].toFixed(1)} ${H - padB} Z`;

  const hasBand = months.some(
    (m) =>
      m.revenueMin !== null &&
      m.revenueMin !== undefined &&
      m.revenueMax !== null &&
      m.revenueMax !== undefined
  );

  const bandPath = hasBand
    ? [
        ...months.map((m, i) => {
          const v =
            m.revenueMax !== null && m.revenueMax !== undefined
              ? m.revenueMax
              : m.revenue;
          return `${i === 0 ? "M" : "L"} ${xs[i].toFixed(1)} ${yFor(v).toFixed(1)}`;
        }),
        ...[...months].reverse().map((m, i) => {
          const v =
            m.revenueMin !== null && m.revenueMin !== undefined
              ? m.revenueMin
              : m.revenue;
          const idx = months.length - 1 - i;
          return `L ${xs[idx].toFixed(1)} ${yFor(v).toFixed(1)}`;
        }),
        "Z",
      ].join(" ")
    : null;

  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => (maxY * i) / ticks);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block w-full"
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
    >
      <defs>
        <linearGradient id="print-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.26" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid horizontal */}
      {tickVals.map((v, i) => (
        <g key={i}>
          <line
            x1={padL}
            x2={W - padR}
            y1={yFor(v)}
            y2={yFor(v)}
            stroke="#e2e8f0"
            strokeDasharray="3 4"
          />
          <text
            x={padL - 6}
            y={yFor(v) + 4}
            textAnchor="end"
            fontSize="10"
            fill="#64748b"
          >
            {shortMoney(v)}
          </text>
        </g>
      ))}

      {/* Peak backgrounds */}
      {months.map((m, i) => {
        const peak = PEAK_MONTHS[monthIdx(m.month)];
        if (!peak) return null;
        const w = ((W - padL - padR) / Math.max(1, months.length - 1)) * 0.5;
        return (
          <rect
            key={i}
            x={xs[i] - w / 2}
            y={padT}
            width={w}
            height={H - padT - padB}
            fill="rgba(245,158,11,0.08)"
          />
        );
      })}

      {bandPath && <path d={bandPath} fill={`${color}22`} />}
      <path d={areaPath} fill="url(#print-area)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Points */}
      {months.map((_, i) => (
        <circle
          key={i}
          cx={xs[i]}
          cy={ys[i]}
          r={3}
          fill="white"
          stroke={color}
          strokeWidth="1.8"
        />
      ))}

      {/* X labels */}
      {months.map((m, i) => (
        <g key={m.month}>
          <text
            x={xs[i]}
            y={H - padB + 16}
            textAnchor="middle"
            fontSize="10"
            fill="#475569"
          >
            {shortMonth(m.month)}
          </text>
          {PEAK_MONTHS[monthIdx(m.month)] && (
            <text
              x={xs[i]}
              y={H - padB + 30}
              textAnchor="middle"
              fontSize="9"
              fill="#b45309"
              fontWeight="600"
            >
              {PEAK_MONTHS[monthIdx(m.month)]}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Static waterfall
// ─────────────────────────────────────────────────────────────
function StaticWaterfall({ totals }: { totals: ForecastResult["totals"] }) {
  const bars = [
    { label: "Revenue", value: totals.revenue, color: "#0ea5e9", sign: 1 },
    { label: "COGS", value: -totals.cogs, color: "#f97316", sign: -1 },
    { label: "Ad spend", value: -totals.adSpend, color: "#ef4444", sign: -1 },
    { label: "Opex", value: -totals.opex, color: "#a855f7", sign: -1 },
    { label: "Net", value: totals.netProfit, color: totals.netProfit >= 0 ? "#10b981" : "#dc2626", sign: 1 },
  ];

  const W = 820;
  const H = 190;
  const padL = 60;
  const padR = 16;
  const padT = 14;
  const padB = 44;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const gap = 14;
  const barW = (innerW - gap * (bars.length - 1)) / bars.length;

  const maxAbs = Math.max(...bars.map((b) => Math.abs(b.value))) * 1.05;
  const scale = (v: number) => (Math.abs(v) / maxAbs) * innerH;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block w-full"
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
    >
      <line
        x1={padL}
        x2={W - padR}
        y1={padT + innerH}
        y2={padT + innerH}
        stroke="#cbd5e1"
      />
      {bars.map((b, i) => {
        const x = padL + i * (barW + gap);
        const h = scale(b.value);
        const y = padT + innerH - h;
        return (
          <g key={b.label}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={6}
              fill={b.color}
              opacity="0.9"
            />
            <text
              x={x + barW / 2}
              y={y - 6}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="#0f172a"
            >
              {b.sign > 0 ? "" : "−"}
              {shortMoney(Math.abs(b.value))}
            </text>
            <text
              x={x + barW / 2}
              y={padT + innerH + 16}
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill="#334155"
            >
              {b.label}
            </text>
            <text
              x={x + barW / 2}
              y={padT + innerH + 30}
              textAnchor="middle"
              fontSize="9"
              fill="#64748b"
            >
              {fmtARS(b.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
