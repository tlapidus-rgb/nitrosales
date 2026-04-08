"use client";

// ══════════════════════════════════════════════════════════════
// OrdersHero — hero header especializado para Orders
// ══════════════════════════════════════════════════════════════
// Misma estética que DashboardHero (auroras + prism delimiter)
// pero con métricas centradas en pedidos: facturación bruta,
// facturación neta (sin IVA), margen y cantidad de pedidos.
// Count-up animado en el valor principal.
// ══════════════════════════════════════════════════════════════

import { ArrowDownRight, ArrowUpRight, ShoppingBag } from "lucide-react";
import { useAnimatedValue } from "@/lib/hooks/useAnimatedValue";
import { formatARS } from "@/lib/utils/format";

interface OrdersHeroProps {
  orgName: string;
  grossRevenue: number;
  netRevenue: number;
  marginPct: number;
  ordersCount: number;
  revenueChange: number | null | undefined;
}

export default function OrdersHero({
  orgName,
  grossRevenue,
  netRevenue,
  marginPct,
  ordersCount,
  revenueChange,
}: OrdersHeroProps) {
  const animatedRevenue = useAnimatedValue(formatARS(grossRevenue), 1000);

  const hasDelta = revenueChange !== null && revenueChange !== undefined;
  const isPositive = (revenueChange ?? 0) > 0;
  const isNeutral = (revenueChange ?? 0) === 0;
  const deltaColor = isNeutral
    ? "text-slate-400"
    : isPositive
      ? "text-cyan-600"
      : "text-rose-500";
  const DeltaIcon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <section className="dash-hero dash-fade-up mb-5">
      <div className="dash-hero-inner px-6 py-6 sm:px-8 sm:py-7">
        {/* Top row — tag + contexto */}
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 backdrop-blur-sm border border-slate-200/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            <ShoppingBag className="w-3 h-3 text-orange-500" />
            {orgName} · Pedidos
          </span>
          <span className="text-xs text-slate-500">
            Resumen del período seleccionado
          </span>
        </div>

        {/* Main row — facturación bruta (count-up) + secundarios */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1.5">
              Facturación bruta
            </p>
            <p className="text-4xl sm:text-5xl font-bold tabular-nums tracking-tight text-slate-900">
              {animatedRevenue}
            </p>
            {hasDelta && (
              <div className="flex items-center gap-1.5 mt-2">
                <DeltaIcon className={`w-4 h-4 ${deltaColor}`} />
                <span className={`text-sm font-semibold tabular-nums ${deltaColor}`}>
                  {Math.abs(revenueChange ?? 0).toFixed(1)}%
                </span>
                <span className="text-xs text-slate-500">vs período anterior</span>
              </div>
            )}
          </div>

          {/* KPIs secundarios */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <HeroStat
              label="Neto (sin IVA)"
              value={formatARS(netRevenue)}
              hint="Facturación descontando IVA 21%"
            />
            <HeroStat
              label="Margen"
              value={`${(marginPct ?? 0).toFixed(1)}%`}
              hint="Qué queda después de costos"
            />
            <HeroStat
              label="Pedidos"
              value={(ordersCount ?? 0).toLocaleString("es-AR")}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const animated = useAnimatedValue(value, 900);
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums tracking-tight text-slate-900">
        {animated}
      </span>
      {hint && <span className="text-[10px] text-slate-400 mt-0.5">{hint}</span>}
    </div>
  );
}
