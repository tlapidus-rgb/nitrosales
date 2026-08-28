"use client";

// ══════════════════════════════════════════════════════════════
// DashboardHero — hero header con narrativa del día
// ══════════════════════════════════════════════════════════════
// Enterprise sobrio: superficie plana, sin auroras ni glows.
// Number count-up animado en el valor principal de revenue.
// ══════════════════════════════════════════════════════════════

import { ArrowDownRight, ArrowUpRight, Sparkles } from "lucide-react";
import { useAnimatedValue } from "@/lib/hooks/useAnimatedValue";
import { formatARS } from "@/lib/utils/format";

interface DashboardHeroProps {
  orgName: string;
  revenue: number;
  revenueChange: number | null | undefined;
  orders: number;
  roas: number;
  sessions: number;
}

const DAY_NAMES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];
const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function greetingForHour(hour: number): string {
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function fmtCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("es-AR");
}

export default function DashboardHero({
  orgName,
  revenue,
  revenueChange,
  orders,
  roas,
  sessions,
}: DashboardHeroProps) {
  const now = new Date();
  const greeting = greetingForHour(now.getHours());
  const dayLabel = `${DAY_NAMES[now.getDay()]} ${now.getDate()} de ${MONTH_NAMES[now.getMonth()]}`;

  // Animated revenue string
  const revenueStr = formatARS(revenue);
  const animatedRevenue = useAnimatedValue(revenueStr, 1000);

  // Delta visual
  const hasDelta = revenueChange !== null && revenueChange !== undefined;
  const isPositive = (revenueChange ?? 0) > 0;
  const isNeutral = (revenueChange ?? 0) === 0;
  const deltaColor = isNeutral
    ? "text-ink-40"
    : isPositive
      ? "text-accent"
      : "text-rose-500";
  const DeltaIcon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <section className="dash-hero dash-fade-up mb-5">
      <div className="dash-hero-inner px-6 py-6 sm:px-8 sm:py-7">
        {/* Top row — greeting + date */}
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface border border-hairline px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-60">
            <Sparkles className="w-3 h-3 text-ink-40" />
            {orgName}
          </span>
          <span className="text-xs text-ink-40 capitalize">
            {greeting}, {dayLabel}
          </span>
        </div>

        {/* Main row — big revenue number + delta */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-40 mb-1.5">
              Facturación del período
            </p>
            <p className="text-4xl sm:text-5xl font-bold tabular-nums tracking-tight text-ink">
              {animatedRevenue}
            </p>
            {hasDelta && (
              <div className="flex items-center gap-1.5 mt-2">
                <DeltaIcon className={`w-4 h-4 ${deltaColor}`} />
                <span className={`text-sm font-semibold tabular-nums ${deltaColor}`}>
                  {Math.abs(revenueChange ?? 0).toFixed(1)}%
                </span>
                <span className="text-xs text-ink-40">vs período anterior</span>
              </div>
            )}
          </div>

          {/* Right cluster — secondary KPIs in a row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <HeroStat label="Pedidos" value={fmtCompactNumber(orders)} />
            <HeroStat label="ROAS" value={`${(roas ?? 0).toFixed(2)}x`} />
            <HeroStat label="Sesiones" value={fmtCompactNumber(sessions)} />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  const animated = useAnimatedValue(value, 900);
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-40">
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums tracking-tight text-ink">
        {animated}
      </span>
    </div>
  );
}
