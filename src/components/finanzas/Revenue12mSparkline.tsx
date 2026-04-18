// ═══════════════════════════════════════════════════════════════════
// Revenue12mSparkline — contexto de tendencia (Fase 1c)
// ═══════════════════════════════════════════════════════════════════
// Fila con 3 cards side-by-side:
//   [Revenue 12m + sparkline]  [Costos YTD]  [Margen bruto YTD]
//
// - Sparkline: SVG puro, 12 barras verticales, sin recharts.
// - Números pasan por useCurrencyView para tri-moneda.
// - Delta YoY se pinta verde (>0) / rojo (<0) / slate (=0 o null).
// ═══════════════════════════════════════════════════════════════════

"use client";

import { useMemo } from "react";
import { useCurrencyView } from "@/hooks/useCurrencyView";
import type { Sparkline12mData } from "@/types/finanzas";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

const MONTH_LABELS: Record<string, string> = {
  "01": "Ene",
  "02": "Feb",
  "03": "Mar",
  "04": "Abr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Ago",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dic",
};

interface Revenue12mSparklineProps {
  data: Sparkline12mData | null;
  loading: boolean;
  asOfDate?: string; // "YYYY-MM-DD" — para convertir plata con FX correcta
}

export default function Revenue12mSparkline({
  data,
  loading,
  asOfDate,
}: Revenue12mSparklineProps) {
  const { convert, format, ready } = useCurrencyView();

  const fm = (ars: number | null | undefined) => {
    if (ars === null || ars === undefined) return "—";
    const converted = convert(ars, asOfDate);
    return format(converted);
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <RevenueCard
        data={data}
        loading={loading}
        asOfDate={asOfDate}
        fm={fm}
        ready={ready}
      />
      <CostosCard data={data} loading={loading} fm={fm} ready={ready} />
      <MarginCard data={data} loading={loading} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Card principal: Revenue 12m + sparkline
// ─────────────────────────────────────────────────────────────
function RevenueCard({
  data,
  loading,
  asOfDate,
  fm,
  ready,
}: {
  data: Sparkline12mData | null;
  loading: boolean;
  asOfDate?: string;
  fm: (ars: number | null | undefined) => string;
  ready: boolean;
}) {
  const bars = useMemo(() => {
    if (!data || data.buckets.length === 0) return [];
    const max = Math.max(...data.buckets.map((b) => b.revenue), 1);
    return data.buckets.map((b) => ({
      month: b.month,
      revenue: b.revenue,
      heightPct: (b.revenue / max) * 100,
    }));
  }, [data]);

  const deltaColor =
    data?.revenueDeltaPct === null || data?.revenueDeltaPct === undefined
      ? "rgba(15,23,42,0.5)"
      : data.revenueDeltaPct > 0
        ? "#065f46"
        : data.revenueDeltaPct < 0
          ? "#991b1b"
          : "rgba(15,23,42,0.5)";

  const deltaSign =
    data?.revenueDeltaPct === null || data?.revenueDeltaPct === undefined
      ? ""
      : data.revenueDeltaPct > 0
        ? "+"
        : "";

  return (
    <section
      className="relative overflow-hidden rounded-2xl border bg-white p-5"
      style={{
        borderColor: "rgba(15,23,42,0.06)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.08)",
        transition: `box-shadow 400ms ${ES}`,
      }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: "rgba(15,23,42,0.5)" }}
      >
        Revenue · últimos 12 meses
      </div>

      {loading && <ShimmerBlock height={44} />}

      {!loading && data && (
        <>
          <div
            className="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums"
            style={{ letterSpacing: "-0.025em" }}
          >
            {ready ? fm(data.revenue12mTotal) : "—"}
          </div>
          <div
            className="mt-0.5 text-[11px] tabular-nums"
            style={{ color: "rgba(15,23,42,0.5)" }}
          >
            <span className="font-semibold" style={{ color: deltaColor }}>
              {data.revenueDeltaPct === null
                ? "sin comparable"
                : `${deltaSign}${data.revenueDeltaPct.toFixed(1)}%`}
            </span>
            <span className="ml-1">vs 12m anteriores</span>
          </div>
        </>
      )}

      {/* Sparkline */}
      {loading && <ShimmerBlock height={64} className="mt-5" />}

      {!loading && data && bars.length > 0 && (
        <div className="mt-5 flex h-16 items-end gap-1">
          {bars.map((b, i) => {
            const isCurrent = i === bars.length - 1;
            return (
              <div
                key={b.month}
                className="relative flex-1 group"
                style={{ height: `${Math.max(b.heightPct, 3)}%` }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    borderRadius: 2,
                    background: isCurrent
                      ? "linear-gradient(180deg, #f59e0b 0%, #d97706 100%)"
                      : "linear-gradient(180deg, rgba(15,23,42,0.18) 0%, rgba(15,23,42,0.08) 100%)",
                    transition: `background 300ms ${ES}`,
                  }}
                />
                <span
                  className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg group-hover:opacity-100"
                  style={{ transition: `opacity 160ms ${ES}` }}
                >
                  {monthHumanShort(b.month)} · {ready ? fm(b.revenue) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* X axis labels: primero / medio / último */}
      {!loading && data && bars.length > 0 && (
        <div
          className="mt-1 flex justify-between text-[9px] uppercase tracking-wider"
          style={{ color: "rgba(15,23,42,0.4)" }}
        >
          <span>{monthHumanShort(bars[0].month)}</span>
          {bars.length >= 7 && (
            <span>{monthHumanShort(bars[Math.floor(bars.length / 2)].month)}</span>
          )}
          <span>{monthHumanShort(bars[bars.length - 1].month)}</span>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Card de costos YTD
// ─────────────────────────────────────────────────────────────
function CostosCard({
  data,
  loading,
  fm,
  ready,
}: {
  data: Sparkline12mData | null;
  loading: boolean;
  fm: (ars: number | null | undefined) => string;
  ready: boolean;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border bg-white p-5"
      style={{
        borderColor: "rgba(15,23,42,0.06)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.08)",
      }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: "rgba(15,23,42,0.5)" }}
      >
        Costos YTD
      </div>

      {loading && <ShimmerBlock height={44} className="mt-1" />}

      {!loading && data && (
        <div
          className="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums"
          style={{ letterSpacing: "-0.025em" }}
        >
          {ready ? fm(data.costosYTD) : "—"}
        </div>
      )}

      <p
        className="mt-2 text-[11px] leading-relaxed"
        style={{ color: "rgba(15,23,42,0.55)" }}
      >
        COGS + envíos + ads + costos manuales. Ver desglose en{" "}
        <span className="font-semibold">Costos</span>.
      </p>

      {/* Visual: barras horizontales placeholder bonitas */}
      <div className="mt-4 space-y-1.5">
        {[
          { label: "COGS", frac: 0.55, color: "#94a3b8" },
          { label: "Envíos", frac: 0.15, color: "#cbd5e1" },
          { label: "Ads", frac: 0.2, color: "#d97706" },
          { label: "Manual", frac: 0.1, color: "#a78bfa" },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span
              className="w-14 text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: "rgba(15,23,42,0.4)" }}
            >
              {row.label}
            </span>
            <div
              className="flex-1 overflow-hidden"
              style={{
                height: 6,
                borderRadius: 999,
                background: "rgba(15,23,42,0.05)",
              }}
            >
              <div
                style={{
                  width: `${row.frac * 100}%`,
                  height: "100%",
                  background: row.color,
                  borderRadius: 999,
                  transition: `width 600ms ${ES}`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <p
        className="mt-2 text-[10px] italic"
        style={{ color: "rgba(15,23,42,0.4)" }}
      >
        Distribución aproximada — desglose exacto en Fase 2.
      </p>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Card de margen bruto YTD
// ─────────────────────────────────────────────────────────────
function MarginCard({
  data,
  loading,
}: {
  data: Sparkline12mData | null;
  loading: boolean;
}) {
  const pct = data?.grossMarginYTD ?? 0;
  const color =
    pct >= 40 ? "#065f46" : pct >= 25 ? "#9a3412" : pct >= 10 ? "#b45309" : "#991b1b";
  const label =
    pct >= 40
      ? "Muy sano"
      : pct >= 25
        ? "Aceptable"
        : pct >= 10
          ? "Ajustado"
          : "Crítico";
  const bg =
    pct >= 40
      ? "rgba(16,185,129,0.08)"
      : pct >= 25
        ? "rgba(249,115,22,0.08)"
        : pct >= 10
          ? "rgba(245,158,11,0.08)"
          : "rgba(239,68,68,0.08)";

  // Radial progress: 0..100 → circunferencia
  const radius = 38;
  const circ = 2 * Math.PI * radius;
  const capped = Math.max(0, Math.min(100, pct));
  const dash = (capped / 100) * circ;

  return (
    <section
      className="relative overflow-hidden rounded-2xl border bg-white p-5"
      style={{
        borderColor: "rgba(15,23,42,0.06)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.08)",
      }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: "rgba(15,23,42,0.5)" }}
      >
        Margen bruto YTD
      </div>

      {loading && <ShimmerBlock height={120} className="mt-3" />}

      {!loading && data && (
        <div className="mt-3 flex items-center gap-4">
          <svg width="92" height="92" viewBox="0 0 92 92">
            <circle
              cx="46"
              cy="46"
              r={radius}
              stroke="rgba(15,23,42,0.08)"
              strokeWidth="7"
              fill="none"
            />
            <circle
              cx="46"
              cy="46"
              r={radius}
              stroke={color}
              strokeWidth="7"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              transform="rotate(-90 46 46)"
              style={{ transition: `stroke-dasharray 600ms ${ES}` }}
            />
            <text
              x="46"
              y="50"
              textAnchor="middle"
              fontSize="16"
              fontWeight="700"
              fill="#0f172a"
              style={{ letterSpacing: "-0.02em" }}
            >
              {pct.toFixed(1)}%
            </text>
          </svg>

          <div className="flex flex-col gap-1">
            <span
              className="inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: bg,
                color,
                letterSpacing: "0.04em",
              }}
            >
              <span
                className="h-1 w-1 rounded-full"
                style={{ background: color }}
              />
              {label}
            </span>
            <span
              className="text-[11px] leading-relaxed"
              style={{ color: "rgba(15,23,42,0.55)" }}
            >
              (Revenue − COGS) / Revenue.
              <br />
              Target: ≥ 40% para escalar ads.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function monthHumanShort(ymd: string): string {
  // "2025-04" → "Abr '25"
  const [y, m] = ymd.split("-");
  return `${MONTH_LABELS[m] ?? m} '${y.slice(2)}`;
}

function ShimmerBlock({
  height,
  className = "",
}: {
  height: number;
  className?: string;
}) {
  return (
    <div
      className={`w-full rounded-lg ${className}`}
      style={{
        height,
        background:
          "linear-gradient(90deg, rgba(15,23,42,0.04) 0%, rgba(15,23,42,0.08) 50%, rgba(15,23,42,0.04) 100%)",
        backgroundSize: "200% 100%",
        animation: "r12Shimmer 1.4s ease-in-out infinite",
      }}
    >
      <style jsx>{`
        @keyframes r12Shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  );
}
