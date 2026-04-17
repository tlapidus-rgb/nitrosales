// @ts-nocheck
"use client";

/**
 * /finanzas/escenarios — forecast + what-if simulation.
 *
 * Fase 4 del plan (semanas 9-11). En Fase 0 es placeholder.
 *
 * Va a tener:
 *   - Tabla FinancialScenario con 3 escenarios (base / optimista / pesimista)
 *   - Drivers con sliders y rangos (causal pattern, Jirav/Mosaic style)
 *   - Forecast line chart con estacionalidad LATAM (Día del Niño, Hot Sale, etc.)
 *   - Split screen comparativo
 *   - Export PDF por escenario
 *
 * Ver PROPUESTA_PNL_REORG.md, sección 5.4.
 */

import React from "react";
import Link from "next/link";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

export default function EscenariosPage() {
  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 80% 0%, rgba(139,92,246,0.10) 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(6,182,212,0.06) 0%, transparent 55%)",
          }}
        />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background:
                  "linear-gradient(135deg, #a855f7 0%, #6d28d9 100%)",
                animation: "escPing 1.8s ease-in-out infinite",
                boxShadow: "0 0 10px rgba(168,85,247,0.7)",
              }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">
              Próximamente · Fase 4
            </span>
          </div>

          <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900">
            Escenarios
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600">
            Forecast y simulación what-if. Respondé preguntas como{" "}
            <em className="text-slate-700">"¿qué pasa si contrato 2 personas
            más?"</em>, <em className="text-slate-700">"¿y si el shipping sube
            30%?"</em>,{" "}
            <em className="text-slate-700">"¿cuánto puedo gastar en ads sin
            comerme el runway?"</em> — todo con sliders que recalculan el P&amp;L
            proyectado en vivo.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ScenarioSketch
              label="Base"
              color="#0ea5e9"
              lines={[
                "Abril — Jul 2026",
                "Revenue +8% m/m",
                "Margen neto 12.5%",
              ]}
            />
            <ScenarioSketch
              label="Optimista"
              color="#10b981"
              lines={[
                "Hot Sale x2.3",
                "CAC baja 15%",
                "Margen neto 18.2%",
              ]}
            />
            <ScenarioSketch
              label="Pesimista"
              color="#ef4444"
              lines={[
                "Dólar +30%",
                "Shipping +25%",
                "Margen neto 4.1%",
              ]}
            />
          </div>

          <div className="mt-8 flex items-center gap-3 text-sm text-slate-600">
            <span>Mientras, podés ir a:</span>
            <Link
              href="/finanzas/estado"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-violet-300 hover:text-violet-700"
              style={{ transition: `all 220ms ${ES}` }}
            >
              Estado de Resultados
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes escPing {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.5);
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  );
}

function ScenarioSketch({
  label,
  color,
  lines,
}: {
  label: string;
  color: string;
  lines: string[];
}) {
  return (
    <div
      className="rounded-xl border bg-white/70 p-4 backdrop-blur-sm"
      style={{
        borderColor: "rgba(226,232,240,0.8)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.03)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}55` }}
        />
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {lines.map((l, i) => (
          <div
            key={i}
            className="text-sm font-semibold tabular-nums tracking-tight text-slate-700"
          >
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
