"use client";

// ══════════════════════════════════════════════════════════════
// OrdersHero — hero header especializado para Orders
// ══════════════════════════════════════════════════════════════
// Misma estética que DashboardHero (auroras + prism delimiter)
// pero con métricas centradas en pedidos: facturación bruta,
// facturación neta (sin IVA), margen y cantidad de pedidos.
// Count-up animado en el valor principal.
// ══════════════════════════════════════════════════════════════

import { ArrowDownRight, ArrowUpRight, ShoppingBag, Activity } from "lucide-react";
import { useAnimatedValue } from "@/lib/hooks/useAnimatedValue";
import { formatARS } from "@/lib/utils/format";
import { useState, useEffect } from "react";

interface OrdersHeroProps {
  orgName: string;
  grossRevenue: number;
  netRevenue: number;
  /**
   * Tanda 7.6 \u2014 Plata real que entra al negocio (neto sin IVA menos
   * comisiones de marketplace). Si no est\u00e1 definido, se omite.
   */
  realNetRevenue?: number;
  /** Total de comisiones retenidas por marketplaces (ML sale_fee). */
  totalMarketplaceFee?: number;
  marginPct: number;
  ordersCount: number;
  revenueChange: number | null | undefined;
}

export default function OrdersHero({
  orgName,
  grossRevenue,
  netRevenue,
  realNetRevenue,
  totalMarketplaceFee,
  marginPct,
  ordersCount,
  revenueChange,
}: OrdersHeroProps) {
  const animatedRevenue = useAnimatedValue(formatARS(grossRevenue), 1200);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    setLastUpdate(new Date());
  }, [grossRevenue, ordersCount]);

  const minutesAgo = Math.max(0, Math.round((Date.now() - lastUpdate.getTime()) / 60000));

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
      <div className="dash-hero-inner px-6 py-6 sm:px-8 sm:py-8">
        {/* Top row — tag + contexto + pulse */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 backdrop-blur-sm border border-slate-200/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              <ShoppingBag className="w-3 h-3 text-orange-500" />
              {orgName} · Pedidos
            </span>
            <span className="text-xs text-slate-500">
              Resumen del período seleccionado
            </span>
          </div>
          {/* Pulse indicator */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] text-slate-400 font-medium tabular-nums">
              {minutesAgo === 0 ? "Actualizado ahora" : `Hace ${minutesAgo} min`}
            </span>
          </div>
        </div>

        {/* Main row — facturación bruta (count-up) + secundarios */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">
              Facturación bruta
            </p>
            <p className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tabular-nums tracking-tight text-slate-900 leading-none">
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

          {/* KPIs secundarios — vital signs */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 sm:border-l sm:border-slate-200/60 sm:pl-8">
            <HeroStat
              label="Neto sin IVA"
              value={formatARS(netRevenue)}
              hint="Bruto / 1,21"
            />
            {typeof realNetRevenue === "number" && (
              <HeroStat
                label="Ingreso real"
                value={formatARS(realNetRevenue)}
                hint={
                  (totalMarketplaceFee ?? 0) > 0
                    ? `\u2212 ${formatARS(totalMarketplaceFee ?? 0)} comisi\u00f3n ML`
                    : Math.abs((realNetRevenue ?? 0) - netRevenue) < 1
                      ? "sin comisi\u00f3n cargada"
                      : "despu\u00e9s de comisiones"
                }
                emphasize={Math.abs((realNetRevenue ?? 0) - netRevenue) >= 1}
              />
            )}
            <HeroStat
              label="Margen"
              value={`${(marginPct ?? 0).toFixed(1)}%`}
              hint="sobre items con costo"
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
  emphasize,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
}) {
  const animated = useAnimatedValue(value, 1000);
  return (
    <div className="flex flex-col">
      <span className={`text-[10px] font-semibold uppercase tracking-[0.2em] mb-0.5 ${emphasize ? "text-cyan-600" : "text-slate-500"}`}>
        {label}
      </span>
      <span className={`text-xl font-bold tabular-nums tracking-tight ${emphasize ? "text-cyan-700" : "text-slate-900"}`}>
        {animated}
      </span>
      {hint && <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">{hint}</span>}
    </div>
  );
}
