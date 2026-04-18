"use client";

import { useEffect, useId, useMemo } from "react";
import { X, TrendingUp, TrendingDown } from "lucide-react";

/* ══════════════════════════════════════════════
   WATERFALL DRILL PANEL — panel lateral deslizable
   Se abre al hacer clic en una barra del waterfall.
   ══════════════════════════════════════════════ */

export type DrillRow = {
  label: string;
  value: number;           // valor absoluto (negativo si es costo)
  hint?: string;           // metadata secundaria ("412 órdenes", "% del total", etc.)
  pct?: number;            // porcentaje del item (ej: Meta 65% del Ads total)
  originIcon?: "auto" | "calc" | "manual";
};

export type DrillData = {
  name: string;                             // nombre del ítem clickeado (ej: "Ads")
  value: number;                            // valor total del ítem (signed)
  kind: "positive" | "negative" | "subtotal" | "total";
  description?: string;                     // explicación en lenguaje humano
  revenueShare?: number;                    // % del revenue (para contexto)
  rows: DrillRow[];                         // desglose
  deltaVsPrev?: { value: number; pct: number } | null;
};

export type WaterfallDrillPanelProps = {
  open: boolean;
  data: DrillData | null;
  format: (value: number) => string;
  onClose: () => void;
};

const ES_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const PANEL_ANIM_MS = 420;
const STAGGER_MS = 40;

/* -------- helpers -------- */

function classForKind(kind: DrillData["kind"]) {
  switch (kind) {
    case "subtotal":
      return { text: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200", dot: "bg-violet-500" };
    case "total":
      return { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" };
    case "negative":
      return { text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200", dot: "bg-rose-500" };
    case "positive":
    default:
      return { text: "text-cyan-700", bg: "bg-cyan-50", border: "border-cyan-200", dot: "bg-cyan-500" };
  }
}

function originDot(origin?: DrillRow["originIcon"]) {
  switch (origin) {
    case "auto":
      return { label: "Auto", cls: "bg-cyan-400", tip: "Viene automáticamente de VTEX o MercadoLibre" };
    case "calc":
      return { label: "Calc", cls: "bg-violet-400", tip: "Calculado a partir de otros datos" };
    case "manual":
      return { label: "Manual", cls: "bg-amber-400", tip: "Carga manual del founder" };
    default:
      return null;
  }
}

/* -------- component -------- */

export default function WaterfallDrillPanel({
  open,
  data,
  format,
  onClose,
}: WaterfallDrillPanelProps) {
  const styleId = useId().replace(/:/g, "");

  // ESC cierra el panel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const kindClasses = useMemo(() => classForKind(data?.kind ?? "positive"), [data?.kind]);

  if (!data) return null;

  const absValue = Math.abs(data.value);
  const isCost = data.kind === "negative" || (data.kind === "total" && data.value < 0);
  const delta = data.deltaVsPrev;
  const deltaCls = delta
    ? isCost
      ? delta.value > 0
        ? "text-rose-600"
        : "text-emerald-600"
      : delta.value > 0
        ? "text-emerald-600"
        : "text-rose-600"
    : "";

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm transition-opacity ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ transitionDuration: `${PANEL_ANIM_MS}ms`, transitionTimingFunction: ES_EASING }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={`drill-title-${styleId}`}
        className={`fixed top-0 right-0 h-full w-full sm:w-[440px] z-50 bg-white shadow-2xl ${open ? "translate-x-0" : "translate-x-full pointer-events-none"}`}
        style={{
          transitionProperty: "transform",
          transitionDuration: `${PANEL_ANIM_MS}ms`,
          transitionTimingFunction: ES_EASING,
          boxShadow: "0 20px 50px -20px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.06)",
        }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <header className={`flex items-start justify-between gap-3 px-6 pt-6 pb-5 border-b ${kindClasses.border} ${kindClasses.bg}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-block w-2 h-2 rounded-full ${kindClasses.dot}`} aria-hidden="true" />
                <h2
                  id={`drill-title-${styleId}`}
                  className={`text-base font-semibold ${kindClasses.text} truncate`}
                >
                  {data.name}
                </h2>
                {data.kind === "subtotal" && (
                  <span className="text-[9px] font-bold tracking-wider text-violet-500 uppercase">Subtotal</span>
                )}
                {data.kind === "total" && (
                  <span className={`text-[9px] font-bold tracking-wider uppercase ${data.value >= 0 ? "text-emerald-500" : "text-rose-500"}`}>Total</span>
                )}
              </div>
              <p
                className={`text-2xl font-semibold ${kindClasses.text} tabular-nums`}
                style={{ fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
              >
                {isCost ? "-" : ""}{format(absValue)}
              </p>
              <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                {typeof data.revenueShare === "number" && isFinite(data.revenueShare) && (
                  <span className="tabular-nums" style={{ fontFeatureSettings: '"tnum" 1' }}>
                    {Math.abs(data.revenueShare).toFixed(1)}% del revenue
                  </span>
                )}
                {delta && (
                  <span className={`flex items-center gap-1 font-medium ${deltaCls} tabular-nums`}>
                    {delta.value >= 0 ? (
                      <TrendingUp className="w-3 h-3" aria-hidden="true" />
                    ) : (
                      <TrendingDown className="w-3 h-3" aria-hidden="true" />
                    )}
                    {delta.value >= 0 ? "+" : ""}{delta.pct.toFixed(1)}% vs período anterior
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/70 transition"
              aria-label="Cerrar panel"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          {/* Description */}
          {data.description && (
            <div className="px-6 py-4 border-b border-slate-100">
              <p className="text-sm leading-relaxed text-slate-600">{data.description}</p>
            </div>
          )}

          {/* Breakdown rows */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {data.rows.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No hay desglose adicional para este ítem.</p>
            ) : (
              <>
                <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-3">
                  Desglose
                </p>
                <ul className="space-y-2">
                  {data.rows.map((row, idx) => {
                    const rowIsCost = row.value < 0;
                    const rowAbs = Math.abs(row.value);
                    const origin = originDot(row.originIcon);
                    return (
                      <li
                        key={`${row.label}-${idx}`}
                        className={`drill-row-${styleId} rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3`}
                        style={{ animationDelay: `${idx * STAGGER_MS + 80}ms` }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-slate-700 truncate">{row.label}</p>
                              {origin && (
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded ${origin.cls} text-white`}
                                  title={origin.tip}
                                >
                                  {origin.label}
                                </span>
                              )}
                            </div>
                            {row.hint && (
                              <p className="text-[11px] text-slate-400 mt-0.5 truncate">{row.hint}</p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p
                              className={`text-sm font-semibold tabular-nums ${rowIsCost ? "text-rose-700" : "text-slate-800"}`}
                              style={{ fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
                            >
                              {rowIsCost ? "-" : ""}{format(rowAbs)}
                            </p>
                            {typeof row.pct === "number" && isFinite(row.pct) && (
                              <p className="text-[10px] text-slate-400 tabular-nums">
                                {row.pct.toFixed(1)}%
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          {/* Footer legend */}
          <footer className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              ESC para cerrar · Los números en rojo son costos · Auto = viene de VTEX/ML · Calc = calculado · Manual = carga tuya
            </p>
          </footer>
        </div>
      </aside>

      <style jsx>{`
        .drill-row-${styleId} {
          opacity: 0;
          transform: translateX(12px);
          animation: drillRowIn-${styleId} 420ms ${ES_EASING} both;
        }
        @keyframes drillRowIn-${styleId} {
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .drill-row-${styleId} {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </>
  );
}
