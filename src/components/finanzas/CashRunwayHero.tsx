// ═══════════════════════════════════════════════════════════════════
// CashRunwayHero
// ═══════════════════════════════════════════════════════════════════
// Hero premium de la portada /finanzas/pulso.
//
// Muestra:
//   - Número XL: meses de runway restantes (con count-up animado)
//   - Semáforo 🟢 saludable / 🟠 atención / 🔴 crítico
//   - Sub-linea: cash balance + burn rate /mes
//   - Breakdown colapsable con revenue/costos YTD
//   - Badge "Auto" (Fase 1a) o "Manual" (Fase 1e)
//   - CTA "Ajustar saldo real" (wire-up en Fase 1e)
//
// Todos los números monetarios pasan por `fm(amount, date)` — conversión
// tri-moneda vía useCurrencyView. Los meses se muestran tal cual.
//
// Design (UI_VISION_NITROSALES.md):
//   - Multi-layer shadow + border sutil
//   - Aurora radial del color del status en la esquina superior derecha
//   - tabular-nums, tracking-tight
//   - Transitions: 280-400ms cubic-bezier(0.16, 1, 0.3, 1)
// ═══════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useState } from "react";
import { useCurrencyView } from "@/hooks/useCurrencyView";
import { statusToColor } from "@/lib/finanzas/runway";
import type { RunwayData } from "@/types/finanzas";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

interface CashRunwayHeroProps {
  runway: RunwayData | null;
  loading?: boolean;
  asOfDate?: string; // "YYYY-MM-DD" — fecha del dato para la conversión FX
}

// ─────────────────────────────────────────────────────────────
// Count-up hook (pequeño, sin dependencias)
// ─────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(target)) {
      setValue(0);
      return;
    }
    const from = 0;
    const to = target;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const elapsed = t - start;
      const progress = Math.min(1, elapsed / duration);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (to - from) * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

export default function CashRunwayHero({
  runway,
  loading = false,
  asOfDate,
}: CashRunwayHeroProps) {
  const { convert, format, mode, ready } = useCurrencyView();
  const [expanded, setExpanded] = useState(false);

  const months = runway?.monthsRemaining ?? 0;
  const monthsDisplay = useCountUp(months);

  // Helper local para convertir + formatear valores ARS nominales
  const fm = (ars: number | null | undefined, opts?: { decimals?: number }) => {
    const converted = convert(ars ?? 0, asOfDate ?? null);
    return format(converted, opts);
  };

  const status = runway?.status ?? "critical";
  const palette = statusToColor(status);

  // Formateo del número de meses
  const monthsLabel = (() => {
    if (loading || !runway) return "—";
    if (months >= 999) return "∞";
    if (months < 1) {
      // Menos de 1 mes → mostrar en semanas
      const weeks = Math.max(0, months * 4.33);
      return `${weeks.toFixed(1)}`;
    }
    return monthsDisplay.toFixed(1);
  })();

  const monthsUnit = (() => {
    if (loading || !runway) return "—";
    if (months >= 999) return "sin burn";
    if (months < 1) return "semanas";
    return "meses";
  })();

  return (
    <section
      className="relative overflow-hidden rounded-2xl border bg-white"
      style={{
        borderColor: "rgba(15,23,42,0.06)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.08), 0 24px 40px -28px rgba(15,23,42,0.08)",
        transition: `box-shadow 400ms ${ES}`,
      }}
    >
      {/* Aurora del color del status (esquina sup. derecha) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 95% -10%, ${palette.ring} 0%, transparent 55%)`,
          opacity: 0.85,
          transition: `opacity 600ms ${ES}`,
        }}
      />

      <div className="relative p-8">
        {/* Header row: label + badge fuente + pill status */}
        <div className="flex items-center gap-3">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: "rgba(15,23,42,0.5)" }}
          >
            Cash Runway
          </span>

          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
            style={{
              background: palette.bg,
              color: palette.fg,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              border: `1px solid ${palette.ring}`,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: palette.fg,
                animation:
                  status === "critical"
                    ? "cashRunwayPulse 1.6s ease-in-out infinite"
                    : "none",
              }}
            />
            {palette.label}
          </span>

          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              background: "rgba(15,23,42,0.04)",
              color: "rgba(15,23,42,0.6)",
              border: "1px solid rgba(15,23,42,0.06)",
            }}
            title={
              runway?.source === "manual"
                ? "Saldo cargado manualmente por vos"
                : "Cálculo automático: revenue YTD − costos YTD"
            }
          >
            {runway?.source === "manual" ? "Manual" : "Auto"}
          </span>
        </div>

        {/* Número grande */}
        <div className="mt-4 flex items-baseline gap-3">
          <span
            className="font-bold tabular-nums tracking-tight"
            style={{
              fontSize: 64,
              lineHeight: 1,
              color: "#0f172a",
              letterSpacing: "-0.03em",
            }}
          >
            {monthsLabel}
          </span>
          <span
            className="text-xl font-medium tabular-nums tracking-tight"
            style={{ color: "rgba(15,23,42,0.55)" }}
          >
            {monthsUnit}
          </span>
        </div>

        {/* Sub-linea: cash + burn */}
        <div
          className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm tabular-nums"
          style={{ color: "rgba(15,23,42,0.7)" }}
        >
          <span className="inline-flex items-center gap-1.5">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "rgba(15,23,42,0.45)" }}
            >
              Caja estimada
            </span>
            <span className="font-semibold" style={{ color: "#0f172a" }}>
              {ready ? fm(runway?.cashBalance ?? 0) : "—"}
            </span>
          </span>
          <span style={{ color: "rgba(15,23,42,0.2)" }}>·</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "rgba(15,23,42,0.45)" }}
            >
              Burn /mes
            </span>
            <span className="font-semibold" style={{ color: "#0f172a" }}>
              {ready ? fm(runway?.burnRate30d ?? 0) : "—"}
            </span>
          </span>
          <span style={{ color: "rgba(15,23,42,0.2)" }}>·</span>
          <span
            className="text-xs"
            style={{ color: "rgba(15,23,42,0.45)" }}
          >
            base 90 días · {mode === "USD" ? "USD" : mode === "ARS_ADJ" ? "ARS ajustado" : "ARS nominal"}
          </span>
        </div>

        {/* Caveat + CTAs */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p
            className="max-w-xl text-[12px] leading-relaxed"
            style={{ color: "rgba(15,23,42,0.5)" }}
          >
            Cálculo aproximado sobre base contable devengada (revenue − costos
            YTD). No contempla inventario comprado, impuestos ni retiros.
            Ajustá con tu saldo real de banco para mayor precisión.
          </p>

          <button
            type="button"
            disabled
            title="Disponible en Fase 1e"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"
            style={{
              borderColor: "rgba(15,23,42,0.1)",
              color: "rgba(15,23,42,0.45)",
              background: "rgba(15,23,42,0.02)",
              cursor: "not-allowed",
            }}
          >
            Ajustar saldo real
            <span aria-hidden>→</span>
          </button>
        </div>

        {/* Breakdown colapsable */}
        <div className="mt-5 border-t pt-4" style={{ borderColor: "rgba(15,23,42,0.06)" }}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{
              color: "rgba(15,23,42,0.55)",
              transition: `color 200ms ${ES}`,
            }}
          >
            {expanded ? "Ocultar cálculo" : "Ver cálculo"}
            <span
              aria-hidden
              style={{
                display: "inline-block",
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: `transform 240ms ${ES}`,
              }}
            >
              ›
            </span>
          </button>

          <div
            style={{
              maxHeight: expanded ? 280 : 0,
              opacity: expanded ? 1 : 0,
              overflow: "hidden",
              transition: `max-height 400ms ${ES}, opacity 300ms ${ES}`,
            }}
          >
            <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
              <BreakdownItem
                label="Revenue YTD"
                value={ready ? fm(runway?.breakdown.revenueYTD ?? 0) : "—"}
                positive
              />
              <BreakdownItem
                label="COGS YTD"
                value={ready ? `− ${fm(runway?.breakdown.cogsYTD ?? 0)}` : "—"}
              />
              <BreakdownItem
                label="Envíos YTD"
                value={ready ? `− ${fm(runway?.breakdown.shippingYTD ?? 0)}` : "—"}
              />
              <BreakdownItem
                label="Ads YTD"
                value={ready ? `− ${fm(runway?.breakdown.adSpendYTD ?? 0)}` : "—"}
              />
              <BreakdownItem
                label="Costos manuales YTD"
                value={
                  ready ? `− ${fm(runway?.breakdown.manualCostsYTD ?? 0)}` : "—"
                }
              />
              <BreakdownItem
                label="= Caja estimada"
                value={ready ? fm(runway?.cashBalanceAuto ?? 0) : "—"}
                emphasis
              />
              <BreakdownItem
                label="÷ Burn /mes"
                value={ready ? fm(runway?.burnRate30d ?? 0) : "—"}
              />
              <BreakdownItem
                label="= Meses restantes"
                value={
                  runway ? (months >= 999 ? "∞" : `${months.toFixed(1)}`) : "—"
                }
                emphasis
              />
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes cashRunwayPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.6);
            opacity: 0.5;
          }
        }
      `}</style>
    </section>
  );
}

function BreakdownItem({
  label,
  value,
  positive = false,
  emphasis = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "rgba(15,23,42,0.42)" }}
      >
        {label}
      </span>
      <span
        className="mt-0.5 font-semibold tabular-nums tracking-tight"
        style={{
          color: emphasis
            ? "#0f172a"
            : positive
              ? "#065f46"
              : "rgba(15,23,42,0.78)",
          fontSize: emphasis ? 15 : 13,
        }}
      >
        {value}
      </span>
    </div>
  );
}
