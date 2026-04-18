// ═══════════════════════════════════════════════════════════════════
// FinancialAlertsCard — alertas accionables del Pulso (Fase 1d)
// ═══════════════════════════════════════════════════════════════════
// Lista compacta de alertas con prioridad (HIGH/MEDIUM/LOW),
// título, body y pill visual. Si no hay alertas, muestra empty state
// positivo ("sin señales críticas hoy").
//
// Dismiss solo a nivel UI (local state). La persistencia en el modelo
// Insight queda para cuando haga falta.
// ═══════════════════════════════════════════════════════════════════

"use client";

import { useMemo, useState } from "react";
import { priorityToPalette } from "@/lib/finanzas/narrative";
import type { FinancialAlert } from "@/types/finanzas";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

interface FinancialAlertsCardProps {
  alerts: FinancialAlert[] | null;
  loading: boolean;
}

export default function FinancialAlertsCard({
  alerts,
  loading,
}: FinancialAlertsCardProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    if (!alerts) return [];
    return alerts.filter((a) => !dismissed.has(a.id));
  }, [alerts, dismissed]);

  return (
    <section
      className="relative overflow-hidden rounded-2xl border bg-white p-5 sm:p-6"
      style={{
        borderColor: "rgba(15,23,42,0.06)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.08)",
        transition: `box-shadow 400ms ${ES}`,
      }}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: "rgba(15,23,42,0.5)" }}
          >
            Alertas financieras
          </div>
          <h2
            className="mt-1 text-lg font-bold tracking-tight text-slate-900"
            style={{ letterSpacing: "-0.02em" }}
          >
            Qué mirar hoy
          </h2>
        </div>
        {!loading && visible.length > 0 && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{
              background: "rgba(15,23,42,0.04)",
              color: "rgba(15,23,42,0.6)",
              border: "1px solid rgba(15,23,42,0.08)",
            }}
          >
            {visible.length}
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 w-full rounded-lg"
              style={{
                background:
                  "linear-gradient(90deg, rgba(15,23,42,0.04) 0%, rgba(15,23,42,0.08) 50%, rgba(15,23,42,0.04) 100%)",
                backgroundSize: "200% 100%",
                animation: "faShimmer 1.4s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && visible.length === 0 && (
        <div
          className="mt-4 rounded-lg border border-dashed p-6 text-center"
          style={{ borderColor: "rgba(15,23,42,0.12)" }}
        >
          <div
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: "rgba(16,185,129,0.1)" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#065f46"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="mt-3 text-sm font-semibold text-slate-800">
            Sin señales críticas hoy
          </div>
          <div className="mt-1 text-xs" style={{ color: "rgba(15,23,42,0.55)" }}>
            Todo corriendo dentro de rangos saludables. Seguí con el plan.
          </div>
        </div>
      )}

      {/* Lista de alertas */}
      {!loading && visible.length > 0 && (
        <ul className="mt-4 space-y-2">
          {visible.map((a) => {
            const palette = priorityToPalette(a.priority);
            return (
              <li
                key={a.id}
                className="group relative flex items-start gap-3 rounded-xl border p-3"
                style={{
                  borderColor: palette.ring,
                  background: palette.bg,
                  transition: `all 200ms ${ES}`,
                }}
              >
                {/* Dot de prioridad */}
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: palette.fg }}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                      style={{
                        background: "rgba(255,255,255,0.6)",
                        color: palette.fg,
                        border: `1px solid ${palette.ring}`,
                        letterSpacing: "0.04em",
                      }}
                    >
                      {palette.label}
                    </span>
                    <span
                      className="truncate text-[11px] uppercase tracking-wider"
                      style={{ color: "rgba(15,23,42,0.45)" }}
                    >
                      {a.type}
                    </span>
                  </div>
                  <div
                    className="mt-1 text-sm font-semibold"
                    style={{ color: palette.fg }}
                  >
                    {a.title}
                  </div>
                  <div
                    className="mt-0.5 text-[12px] leading-relaxed"
                    style={{ color: "rgba(15,23,42,0.72)" }}
                  >
                    {a.body}
                  </div>
                </div>

                {/* Dismiss */}
                <button
                  type="button"
                  onClick={() =>
                    setDismissed((prev) => {
                      const next = new Set(prev);
                      next.add(a.id);
                      return next;
                    })
                  }
                  aria-label="Ocultar alerta"
                  className="rounded-md p-1 opacity-40 hover:opacity-100"
                  style={{ transition: `opacity 180ms ${ES}` }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: palette.fg }}
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <style jsx>{`
        @keyframes faShimmer {
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
