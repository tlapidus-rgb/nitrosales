// @ts-nocheck
"use client";

/**
 * ScenarioForecastChart — Fase 5e
 * ─────────────────────────────────────────────────────────────
 * Line chart SVG puro (sin recharts) para mostrar el forecast de
 * 12 meses de un escenario. Incluye:
 *
 *   - Linea principal de Revenue mes a mes.
 *   - Banda sombreada entre revenueMin / revenueMax si los drivers
 *     del escenario tienen rangos (Causal pattern).
 *   - Grid de 4 lineas horizontales + ticks mensuales.
 *   - Hover: crosshair vertical + dot + tooltip con Revenue / Margen
 *     y cashEnd si existe.
 *   - Click en un mes: abre waterfall inline (5 barras: revenue +,
 *     -COGS, -AdSpend, -Opex, =Net).
 *   - Seasonality highlights (Agosto Dia del Niño, Noviembre Black
 *     Friday, Diciembre Navidad) como vertical glow detras de los
 *     meses pico.
 *
 * Usa el formatter tri-moneda `fm` que baja de la page.
 *
 * Responsive: el SVG se renderiza con viewBox y escala al contenedor.
 */

import React, { useMemo, useState } from "react";

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
};

// Meses con seasonality relevante LATAM toys
const PEAK_MONTHS: Record<number, string> = {
  5: "Hot Sale",
  8: "Día del Niño",
  11: "Black Friday",
  12: "Navidad",
};

function shortMonth(m: string): string {
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

function monthIdx(m: string): number {
  if (!m || m.length < 7) return 0;
  return parseInt(m.substring(5, 7), 10);
}

// ─────────────────────────────────────────────────────────────
// Chart
// ─────────────────────────────────────────────────────────────
export default function ScenarioForecastChart({
  forecast,
  color,
  fm,
  scenarioName,
}: {
  forecast: ForecastResult | null;
  color: string;
  fm: (v: number | null | undefined, d?: string) => string;
  scenarioName?: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);

  const months = forecast?.months ?? [];
  const hasBand = useMemo(
    () =>
      months.some(
        (m) =>
          m.revenueMin !== null &&
          m.revenueMin !== undefined &&
          m.revenueMax !== null &&
          m.revenueMax !== undefined &&
          m.revenueMax > m.revenueMin
      ),
    [months]
  );

  // ── Escala ─────────────────────────────────────────────
  const W = 880;
  const H = 320;
  const padL = 70;
  const padR = 24;
  const padT = 24;
  const padB = 48;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const values = useMemo(() => {
    const arr: number[] = [];
    for (const m of months) {
      arr.push(m.revenue);
      if (typeof m.revenueMin === "number") arr.push(m.revenueMin);
      if (typeof m.revenueMax === "number") arr.push(m.revenueMax);
    }
    return arr;
  }, [months]);

  const yMin = 0;
  const yMaxRaw = values.length ? Math.max(...values) : 1;
  const yMax = yMaxRaw * 1.1 || 1;

  const xFor = (i: number) =>
    padL + (months.length <= 1 ? innerW / 2 : (i / (months.length - 1)) * innerW);
  const yFor = (v: number) => padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  // Paths
  const linePath = useMemo(() => {
    if (!months.length) return "";
    return months
      .map((m, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(m.revenue).toFixed(1)}`)
      .join(" ");
  }, [months, innerH, innerW]);

  const bandPath = useMemo(() => {
    if (!hasBand || !months.length) return "";
    const top: string[] = [];
    const bottom: string[] = [];
    for (let i = 0; i < months.length; i++) {
      const m = months[i];
      const mx = typeof m.revenueMax === "number" ? m.revenueMax : m.revenue;
      const mn = typeof m.revenueMin === "number" ? m.revenueMin : m.revenue;
      top.push(`${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(mx).toFixed(1)}`);
      bottom.push(`L ${xFor(i).toFixed(1)} ${yFor(mn).toFixed(1)}`);
    }
    return `${top.join(" ")} ${bottom.reverse().join(" ")} Z`;
  }, [months, hasBand, innerH, innerW]);

  // Y ticks (4 lineas horizontales)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = yMin + (yMax - yMin) * t;
    return { v, y: yFor(v) };
  });

  // ── Interaccion ─────────────────────────────────────────
  function handleSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!months.length) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    if (relX < padL - 6 || relX > W - padR + 6) {
      setHoverIdx(null);
      return;
    }
    const raw = ((relX - padL) / innerW) * (months.length - 1);
    const idx = Math.max(0, Math.min(months.length - 1, Math.round(raw)));
    setHoverIdx(idx);
  }

  function handleSvgLeave() {
    setHoverIdx(null);
  }

  function handleClickMonth(idx: number) {
    setPinnedIdx((prev) => (prev === idx ? null : idx));
  }

  const focusedIdx = hoverIdx ?? pinnedIdx ?? null;
  const focused = focusedIdx !== null ? months[focusedIdx] ?? null : null;

  // Waterfall data del mes pinneado
  const pinned = pinnedIdx !== null ? months[pinnedIdx] ?? null : null;

  if (!forecast || !months.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Sin forecast calculado.
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm"
      style={{
        borderColor: "rgba(226,232,240,0.9)",
      }}
    >
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Forecast 12 meses
          </div>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
            {scenarioName ?? "Escenario"}
          </h3>
          {hasBand && (
            <p className="mt-0.5 text-[12px] text-slate-500">
              Banda sombreada = rango min/max por Causal drivers.
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Revenue total
          </div>
          <div className="text-lg font-semibold tabular-nums text-slate-900">
            {fm(forecast.totals.revenue)}
          </div>
          <div className="text-[11px] tabular-nums text-slate-500">
            Margen {forecast.totals.marginPct.toFixed(1)}% · Net{" "}
            {fm(forecast.totals.netProfit)}
          </div>
        </div>
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          width="100%"
          height="auto"
          style={{ display: "block", maxHeight: 360 }}
          onMouseMove={handleSvgMouseMove}
          onMouseLeave={handleSvgLeave}
          role="img"
          aria-label="Forecast line chart"
        >
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={`${color}cc`} />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
            <linearGradient id="peakGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.16} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Y grid */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={padL}
                x2={W - padR}
                y1={t.y}
                y2={t.y}
                stroke="rgba(226,232,240,0.8)"
                strokeWidth={1}
                strokeDasharray={i === 0 ? "0" : "3 3"}
              />
              <text
                x={padL - 10}
                y={t.y + 4}
                textAnchor="end"
                fontSize={10}
                fill="#94a3b8"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {i === 0 ? "0" : shortMoney(t.v)}
              </text>
            </g>
          ))}

          {/* Seasonality glows */}
          {months.map((m, i) => {
            const mi = monthIdx(m.month);
            if (!PEAK_MONTHS[mi]) return null;
            const x = xFor(i);
            return (
              <rect
                key={`peak-${i}`}
                x={x - 14}
                y={padT}
                width={28}
                height={innerH}
                fill="url(#peakGlow)"
                style={{ pointerEvents: "none" }}
              />
            );
          })}

          {/* Band area (min-max) */}
          {hasBand && (
            <path
              d={bandPath}
              fill={color}
              fillOpacity={0.12}
              stroke={color}
              strokeOpacity={0.18}
              strokeWidth={1}
            />
          )}

          {/* Area gradient debajo de la linea principal */}
          <path
            d={`${linePath} L ${xFor(months.length - 1)} ${padT + innerH} L ${xFor(0)} ${padT + innerH} Z`}
            fill="url(#areaGrad)"
          />

          {/* Linea principal */}
          <path
            d={linePath}
            fill="none"
            stroke="url(#lineGrad)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dots en cada punto */}
          {months.map((m, i) => {
            const x = xFor(i);
            const y = yFor(m.revenue);
            const isFocus = focusedIdx === i;
            const isPinned = pinnedIdx === i;
            return (
              <g key={`dot-${i}`}>
                {isFocus && (
                  <>
                    <line
                      x1={x}
                      x2={x}
                      y1={padT}
                      y2={padT + innerH}
                      stroke={color}
                      strokeWidth={1}
                      strokeOpacity={0.35}
                      strokeDasharray="2 3"
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={7}
                      fill={color}
                      fillOpacity={0.15}
                    />
                  </>
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={isFocus ? 4.5 : 3}
                  fill={isPinned ? color : "#fff"}
                  stroke={color}
                  strokeWidth={2}
                  style={{ cursor: "pointer", transition: `all 160ms ${ES}` }}
                  onClick={() => handleClickMonth(i)}
                />
              </g>
            );
          })}

          {/* X axis labels */}
          {months.map((m, i) => {
            const x = xFor(i);
            const isPeak = !!PEAK_MONTHS[monthIdx(m.month)];
            return (
              <g key={`xl-${i}`}>
                <text
                  x={x}
                  y={H - padB + 16}
                  textAnchor="middle"
                  fontSize={10}
                  fill={isPeak ? "#b45309" : "#64748b"}
                  fontWeight={isPeak ? 600 : 400}
                >
                  {shortMonth(m.month)}
                </text>
                {isPeak && (
                  <text
                    x={x}
                    y={H - padB + 28}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#b45309"
                    fontWeight={600}
                    style={{ letterSpacing: "0.04em" }}
                  >
                    {PEAK_MONTHS[monthIdx(m.month)]}
                  </text>
                )}
              </g>
            );
          })}

          {/* Tooltip HTML-like (fg text en SVG) */}
          {focused &&
            focusedIdx !== null &&
            (() => {
              const x = xFor(focusedIdx);
              const tooltipW = 220;
              const tooltipH = 90;
              const tx = Math.min(Math.max(padL, x - tooltipW / 2), W - padR - tooltipW);
              const ty = padT + 6;
              return (
                <g style={{ pointerEvents: "none" }}>
                  <rect
                    x={tx}
                    y={ty}
                    width={tooltipW}
                    height={tooltipH}
                    rx={10}
                    fill="#0f172a"
                    fillOpacity={0.96}
                    stroke={`${color}55`}
                    strokeWidth={1}
                  />
                  <text x={tx + 12} y={ty + 18} fontSize={11} fontWeight={600} fill="#f1f5f9">
                    {shortMonth(focused.month).toUpperCase()}
                  </text>
                  <text x={tx + 12} y={ty + 36} fontSize={11} fill="#cbd5e1">
                    Revenue
                  </text>
                  <text
                    x={tx + tooltipW - 12}
                    y={ty + 36}
                    fontSize={11}
                    textAnchor="end"
                    fontWeight={600}
                    fill="#fff"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {fm(focused.revenue, focused.month + "-15")}
                  </text>
                  <text x={tx + 12} y={ty + 52} fontSize={11} fill="#cbd5e1">
                    Margen
                  </text>
                  <text
                    x={tx + tooltipW - 12}
                    y={ty + 52}
                    fontSize={11}
                    textAnchor="end"
                    fontWeight={600}
                    fill="#fff"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {focused.marginPct.toFixed(1)}%
                  </text>
                  <text x={tx + 12} y={ty + 68} fontSize={11} fill="#cbd5e1">
                    Cash fin de mes
                  </text>
                  <text
                    x={tx + tooltipW - 12}
                    y={ty + 68}
                    fontSize={11}
                    textAnchor="end"
                    fontWeight={600}
                    fill={
                      focused.cashEnd !== null && focused.cashEnd !== undefined && focused.cashEnd < 0
                        ? "#fca5a5"
                        : "#fff"
                    }
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {focused.cashEnd !== null && focused.cashEnd !== undefined
                      ? fm(focused.cashEnd, focused.month + "-15")
                      : "—"}
                  </text>
                  <text x={tx + 12} y={ty + tooltipH - 6} fontSize={9} fill="#94a3b8">
                    {pinnedIdx === focusedIdx
                      ? "Click para cerrar waterfall"
                      : "Click para ver desglose"}
                  </text>
                </g>
              );
            })()}
        </svg>
      </div>

      {/* Waterfall del mes pinneado */}
      {pinned && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Desglose del mes
              </div>
              <div className="text-sm font-semibold text-slate-900">
                {shortMonth(pinned.month)}
              </div>
            </div>
            <button
              onClick={() => setPinnedIdx(null)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-slate-300"
              style={{ transition: `all 180ms ${ES}` }}
            >
              Cerrar
            </button>
          </div>
          <Waterfall month={pinned} color={color} fm={fm} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Waterfall: Revenue + (-COGS) + (-AdSpend) + (-Opex) = Net
// ─────────────────────────────────────────────────────────────
function Waterfall({
  month,
  color,
  fm,
}: {
  month: MonthForecast;
  color: string;
  fm: (v: number | null | undefined, d?: string) => string;
}) {
  const steps = [
    { label: "Revenue", value: month.revenue, type: "pos" as const },
    { label: "COGS", value: -month.cogs, type: "neg" as const },
    { label: "Ad Spend", value: -month.adSpend, type: "neg" as const },
    { label: "Opex", value: -month.opex, type: "neg" as const },
    { label: "Net", value: month.netProfit, type: "net" as const },
  ];
  const maxAbs = Math.max(...steps.map((s) => Math.abs(s.value)), 1);
  const running: number[] = [];
  let cum = 0;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].type === "net") {
      running.push(cum);
    } else {
      running.push(cum);
      cum += steps[i].value;
    }
  }

  return (
    <div className="mt-3 grid grid-cols-5 gap-2">
      {steps.map((s, i) => {
        const h = (Math.abs(s.value) / maxAbs) * 96;
        const fill =
          s.type === "pos"
            ? color
            : s.type === "net"
            ? s.value >= 0
              ? "#10b981"
              : "#ef4444"
            : "#ef4444";
        return (
          <div key={i} className="flex flex-col items-center">
            <div
              className="flex w-full items-end justify-center"
              style={{ height: 110 }}
            >
              <div
                className="w-10 rounded-md"
                style={{
                  height: Math.max(4, h),
                  background: `linear-gradient(180deg, ${fill}f0 0%, ${fill}80 100%)`,
                  boxShadow: `0 2px 10px -4px ${fill}99`,
                  transition: `all 280ms ${ES}`,
                }}
              />
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              {s.label}
            </div>
            <div
              className="text-[11px] font-semibold tabular-nums"
              style={{
                color:
                  s.type === "net"
                    ? s.value >= 0
                      ? "#047857"
                      : "#b91c1c"
                    : s.type === "neg"
                    ? "#b91c1c"
                    : "#0f172a",
              }}
            >
              {s.value > 0 ? "+" : ""}
              {fm(s.value, month.month + "-15")}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function shortMoney(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return `${Math.round(v)}`;
}
