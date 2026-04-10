"use client";

// ══════════════════════════════════════════════════════════════
// ProfitabilityCard — Margen real en palabras simples
// ══════════════════════════════════════════════════════════════
// Muestra bruto → neto → costos → margen con una narrativa
// BIEN SIMPLE. Incluye coverage % (cuántos pedidos tienen
// costo cargado) para que el usuario entienda la confiabilidad.
// ══════════════════════════════════════════════════════════════

import { Calculator, Info } from "lucide-react";
import { useAnimatedValue } from "@/lib/hooks/useAnimatedValue";
import { formatARS } from "@/lib/utils/format";
import type { ProfitabilityData } from "./types";

interface ProfitabilityCardProps {
  data: ProfitabilityData | null | undefined;
  loading?: boolean;
}

export default function ProfitabilityCard({
  data,
  loading,
}: ProfitabilityCardProps) {
  if (loading) {
    return (
      <section className="dash-card dash-fade-up p-5">
        <div className="h-40 dash-skeleton rounded-lg" />
      </section>
    );
  }
  if (!data) return null;

  const animatedMargin = useAnimatedValue(
    `${(data.marginPct ?? 0).toFixed(1)}%`,
    900
  );
  const animatedNet = useAnimatedValue(formatARS(data.netRevenue ?? 0), 900);

  const marginTone =
    data.marginPct >= 25
      ? "text-cyan-600"
      : data.marginPct >= 10
        ? "text-slate-900"
        : "text-rose-500";

  // TANDA 7.3: coverage por facturaci\u00f3n es m\u00e1s honesto que por cantidad de pedidos.
  // Fallback a coveragePct (por pedidos) si el backend todav\u00eda no expone el nuevo campo.
  const coverage = data.coveragePctByRevenue ?? data.coveragePct ?? 0;
  const grossWithCost = data.grossWithCost ?? data.grossRevenue ?? 0;
  const grossWithoutCost = data.grossWithoutCost ?? 0;
  const coverageTone =
    coverage >= 90
      ? { color: "text-cyan-700", bg: "bg-cyan-50 border-cyan-100" }
      : coverage >= 60
        ? { color: "text-amber-700", bg: "bg-amber-50 border-amber-100" }
        : { color: "text-rose-700", bg: "bg-rose-50 border-rose-100" };

  return (
    <section className="dash-card dash-fade-up p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
            <Calculator className="w-4.5 h-4.5 text-slate-700" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Margen real del período
            </h3>
            <p className="text-[11px] text-slate-500">
              Cuánto queda después de IVA y costos de productos.
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${coverageTone.bg} ${coverageTone.color}`}
          title="Porcentaje de la facturaci\u00f3n que tiene costo de mercader\u00eda cargado"
        >
          <Info className="w-3 h-3" />
          {coverage.toFixed(0)}% facturaci\u00f3n con costo
        </span>
      </div>

      {/* Big margin number */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1">
          Margen bruto
        </p>
        <p
          className={`text-4xl font-bold tabular-nums tracking-tight ${marginTone}`}
        >
          {animatedMargin}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Equivale a{" "}
          <span className="font-semibold text-slate-700 tabular-nums">
            {formatARS(data.marginAbs ?? 0)}
          </span>{" "}
          en plata.
        </p>
      </div>

      {/* Breakdown: bruto → neto → costos */}
      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100">
        <BreakdownItem
          label="Bruto (con IVA)"
          value={formatARS(data.grossRevenue ?? 0)}
          hint="Lo que facturaste"
        />
        <BreakdownItem
          label="Neto (sin IVA)"
          value={animatedNet}
          hint="Descontando el 21%"
        />
        <BreakdownItem
          label="Costo mercader\u00eda"
          value={formatARS(data.totalCogs ?? 0)}
          hint={
            grossWithCost > 0
              ? `sobre ${formatARS(grossWithCost)} con costo`
              : "Lo que te cost\u00f3"
          }
          negative
        />
      </div>

      {/* Tanda 7.6 \u2014 Comisiones de marketplace e ingreso real */}
      {((data.totalMarketplaceFee ?? 0) > 0 || typeof data.realNetRevenue === "number") && (
        <div className="grid grid-cols-2 gap-3 pt-3 mt-3 border-t border-slate-100">
          <BreakdownItem
            label="Comisiones ML"
            value={formatARS(data.totalMarketplaceFee ?? 0)}
            hint={
              (data.feeCoveragePct ?? 0) < 95 && (data.ordersWithFee ?? 0) > 0
                ? `${(data.feeCoveragePct ?? 0).toFixed(0)}% ped. ML cubiertos`
                : "Retenido por el marketplace"
            }
            negative
          />
          <BreakdownItem
            label="Ingreso real"
            value={formatARS(data.realNetRevenue ?? 0)}
            hint="Neto \u2212 comisiones"
            emphasize
          />
        </div>
      )}

      {/* Nota de confiabilidad \u2014 TANDA 7.3 honest disclosure */}
      {coverage < 95 && (
        <div className="mt-3 rounded-md bg-amber-50 border border-amber-100 px-2.5 py-1.5 flex items-start gap-1.5">
          <Info className="w-3 h-3 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-[10px] text-amber-900 leading-snug">
            <p className="font-semibold">
              El margen se calcula sobre {coverage.toFixed(0)}% de la
              facturaci\u00f3n ({formatARS(grossWithCost)}).
            </p>
            {grossWithoutCost > 0 && (
              <p className="mt-0.5 text-amber-800">
                Quedan {formatARS(grossWithoutCost)} en facturaci\u00f3n sin costo
                cargado \u2014 el margen real puede ser distinto.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function BreakdownItem({
  label,
  value,
  hint,
  negative,
  emphasize,
}: {
  label: string;
  value: string;
  hint?: string;
  negative?: boolean;
  emphasize?: boolean;
}) {
  const valueTone = negative
    ? "text-rose-600"
    : emphasize
      ? "text-cyan-700"
      : "text-slate-900";
  return (
    <div>
      <p
        className={`text-[10px] font-semibold uppercase tracking-[0.15em] ${
          emphasize ? "text-cyan-700" : "text-slate-500"
        }`}
      >
        {label}
      </p>
      <p className={`text-sm font-semibold tabular-nums mt-0.5 ${valueTone}`}>
        {negative ? "\u2212" : ""}
        {value}
      </p>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}
