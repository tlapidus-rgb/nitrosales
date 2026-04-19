// ═══════════════════════════════════════════════════════════════════
// MarketingFinanceCard — CAC vs LTV por canal (Fase 1b)
// ═══════════════════════════════════════════════════════════════════
// Card premium que muestra:
//   - Top row: blended CAC · blended LTV · ratio global
//   - Tabla por canal: CAC | LTV | ratio | payback (m) | health pill
//
// Datos: /api/metrics/ltv (solo VTEX; MELI no expone customerId así
// que no puede calcularse LTV por canal ahí).
//
// Fetches sus propios datos (independiente del endpoint /finanzas/pulso)
// para no bloquear el render del Runway.
//
// Conversión de plata: useCurrencyView.
// ═══════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useState } from "react";
import { useCurrencyView } from "@/hooks/useCurrencyView";
import {
  buildMarketingFinance,
  healthToColor,
  type LtvApiChannelRow,
  type LtvApiSummary,
} from "@/lib/finanzas/marketing";
import type { MarketingFinanceData } from "@/types/finanzas";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

interface MarketingFinanceCardProps {
  // "YYYY-MM-DD" — rango YTD del Pulso (default: 1 enero → hoy)
  ytdFrom?: string;
  ytdTo?: string;
}

export default function MarketingFinanceCard({
  ytdFrom,
  ytdTo,
}: MarketingFinanceCardProps) {
  const { convert, format, ready } = useCurrencyView();
  const [data, setData] = useState<MarketingFinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calcular rango YTD si no se pasa
  const fromStr = ytdFrom ?? `${new Date().getFullYear()}-01-01`;
  const toStr = ytdTo ?? new Date().toISOString().substring(0, 10);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const url = `/api/metrics/ltv?from=${fromStr}&to=${toStr}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as {
          summary: {
            avgLtv: number;
            globalCac: number;
            globalLtvCac: number;
          };
          byChannel: LtvApiChannelRow[];
        };
        if (!active) return;
        const finance = buildMarketingFinance({
          byChannel: json.byChannel ?? [],
          summary: {
            avgLtv: json.summary?.avgLtv ?? 0,
            globalCac: json.summary?.globalCac ?? 0,
            globalLtvCac: json.summary?.globalLtvCac ?? 0,
          } as LtvApiSummary,
        });
        setData(finance);
        setLoading(false);
      } catch (e: unknown) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Error desconocido");
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [fromStr, toStr]);

  const fm = (ars: number | null | undefined) => {
    if (ars === null || ars === undefined) return "—";
    const converted = convert(ars, toStr);
    return format(converted);
  };

  return (
    <section
      className="relative overflow-hidden rounded-2xl border bg-white"
      style={{
        borderColor: "rgba(15,23,42,0.06)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.08)",
        transition: `box-shadow 400ms ${ES}`,
      }}
    >
      <div className="p-6 sm:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: "rgba(15,23,42,0.5)" }}
            >
              Marketing Financiero
            </div>
            <h2
              className="mt-1 text-lg font-bold tracking-tight text-slate-900"
              style={{ letterSpacing: "-0.02em" }}
            >
              CAC vs LTV por canal
            </h2>
            <p
              className="mt-1 text-[12px] leading-relaxed"
              style={{ color: "rgba(15,23,42,0.5)" }}
            >
              Solo tienda VTEX. MELI no expone customer para rastrear LTV.
              Payback asume lifespan de 12 meses.
            </p>
            <a
              href="/bondly/clientes"
              className="mt-2 inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
              style={{ transition: `all 160ms ${ES}` }}
            >
              Ver clientes en Bondly →
            </a>
          </div>

          {/* Blended summary */}
          {data && !loading && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm tabular-nums">
              <SummaryStat
                label="CAC blended"
                value={ready ? fm(data.summary.blendedCac) : "—"}
              />
              <Divider />
              <SummaryStat
                label="LTV blended"
                value={ready ? fm(data.summary.blendedLtv) : "—"}
              />
              <Divider />
              <SummaryStat
                label="Ratio"
                value={
                  data.summary.blendedCac && data.summary.blendedLtv
                    ? `${(
                        data.summary.blendedLtv / data.summary.blendedCac
                      ).toFixed(1)}×`
                    : "—"
                }
                emphasize
              />
            </div>
          )}
        </div>

        {/* Estados: error / loading / empty / tabla */}
        {error && (
          <div
            className="mt-5 rounded-lg border p-3 text-xs"
            style={{
              borderColor: "rgba(239,68,68,0.25)",
              background: "rgba(239,68,68,0.04)",
              color: "#991b1b",
            }}
          >
            No se pudieron cargar los datos de marketing: {error}
          </div>
        )}

        {loading && !error && (
          <div className="mt-5 space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-12 w-full rounded-lg"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(15,23,42,0.04) 0%, rgba(15,23,42,0.08) 50%, rgba(15,23,42,0.04) 100%)",
                  backgroundSize: "200% 100%",
                  animation: "mfShimmer 1.4s ease-in-out infinite",
                }}
              />
            ))}
          </div>
        )}

        {!loading && !error && data && data.rows.length === 0 && (
          <div
            className="mt-6 rounded-lg border border-dashed p-6 text-center text-sm"
            style={{
              borderColor: "rgba(15,23,42,0.12)",
              color: "rgba(15,23,42,0.55)",
            }}
          >
            <div className="font-semibold text-slate-700">
              Sin datos suficientes todavía
            </div>
            <div className="mt-1 text-xs">
              Necesitás órdenes VTEX con customer identificado + spend de Meta /
              Google imputado al período.
            </div>
          </div>
        )}

        {!loading && !error && data && data.rows.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr
                  className="text-[10px] uppercase tracking-[0.08em]"
                  style={{ color: "rgba(15,23,42,0.45)" }}
                >
                  <th className="py-2 pr-3 text-left font-semibold">Canal</th>
                  <th className="px-3 text-right font-semibold">CAC</th>
                  <th className="px-3 text-right font-semibold">LTV</th>
                  <th className="px-3 text-right font-semibold">Ratio</th>
                  <th className="px-3 text-right font-semibold">Payback</th>
                  <th className="py-2 pl-3 text-right font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const palette = healthToColor(row.health);
                  return (
                    <tr
                      key={row.channel}
                      className="border-t"
                      style={{
                        borderColor: "rgba(15,23,42,0.05)",
                        transition: `background 200ms ${ES}`,
                      }}
                    >
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ background: palette.fg }}
                          />
                          <span className="font-medium text-slate-800">
                            {row.channel}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 text-right text-slate-700">
                        {row.cac > 0 ? (ready ? fm(row.cac) : "—") : (
                          <span style={{ color: "rgba(15,23,42,0.35)" }}>
                            sin spend
                          </span>
                        )}
                      </td>
                      <td className="px-3 text-right font-medium text-slate-800">
                        {ready ? fm(row.ltv) : "—"}
                      </td>
                      <td className="px-3 text-right">
                        {row.ltvCacRatio !== null ? (
                          <span
                            className="font-semibold"
                            style={{
                              color:
                                row.ltvCacRatio >= 3
                                  ? "#065f46"
                                  : row.ltvCacRatio >= 1.5
                                    ? "#9a3412"
                                    : "#991b1b",
                            }}
                          >
                            {row.ltvCacRatio.toFixed(1)}×
                          </span>
                        ) : (
                          <span style={{ color: "rgba(15,23,42,0.35)" }}>—</span>
                        )}
                      </td>
                      <td className="px-3 text-right text-slate-700">
                        {row.paybackMonths !== null
                          ? `${row.paybackMonths.toFixed(1)}m`
                          : (
                            <span style={{ color: "rgba(15,23,42,0.35)" }}>
                              —
                            </span>
                          )}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                          style={{
                            background: palette.bg,
                            color: palette.fg,
                            border: `1px solid ${palette.ring}`,
                            letterSpacing: "0.04em",
                          }}
                        >
                          <span
                            className="h-1 w-1 rounded-full"
                            style={{ background: palette.fg }}
                          />
                          {palette.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes mfShimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </section>
  );
}

function SummaryStat({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "rgba(15,23,42,0.45)" }}
      >
        {label}
      </span>
      <span
        className="font-semibold"
        style={{
          color: emphasize ? "#0f172a" : "rgba(15,23,42,0.8)",
          fontSize: emphasize ? 15 : 13,
        }}
      >
        {value}
      </span>
    </span>
  );
}

function Divider() {
  return <span style={{ color: "rgba(15,23,42,0.2)" }}>·</span>;
}
