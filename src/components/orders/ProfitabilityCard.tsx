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
  if (loading || !data) {
    return (
      <section className="dash-card dash-fade-up p-5">
        <div className="h-40 dash-skeleton rounded-lg" />
      </section>
    );
  }

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

  // Confiabilidad: coverage % de pedidos con costo cargado
  const coverage = data.coveragePct ?? 0;
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
        >
          <Info className="w-3 h-3" />
          {coverage.toFixed(0)}% con costo
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
          label="Costo mercadería"
          value={formatARS(data.totalCogs ?? 0)}
          hint="Lo que te costó"
          negative
        />
      </div>

      {/* Nota de confiabilidad */}
      {coverage < 90 && (
        <p className="mt-3 text-[11px] text-slate-500 leading-snug">
          Nota: {coverage < 60 ? "solo" : ""} {coverage.toFixed(0)}% de los
          pedidos tienen costo cargado. El margen real puede diferir cuando
          completes los costos faltantes.
        </p>
      )}
    </section>
  );
}

function BreakdownItem({
  label,
  value,
  hint,
  negative,
}: {
  label: string;
  value: string;
  hint?: string;
  negative?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
        {label}
      </p>
      <p
        className={`text-sm font-semibold tabular-nums mt-0.5 ${
          negative ? "text-rose-600" : "text-slate-900"
        }`}
      >
        {negative ? "−" : ""}
        {value}
      </p>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}
