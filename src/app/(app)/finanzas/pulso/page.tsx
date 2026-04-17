// @ts-nocheck
"use client";

/**
 * /finanzas/pulso — portada del módulo Finanzas.
 *
 * En Fase 0 es un placeholder elegante. En Fase 1 va a tener:
 *   - Cash Runway hero
 *   - Marketing Financiero (bridge con ad_metrics_daily + Bondly)
 *   - Narrativa auto-generada con Aurum
 *   - Sparkline 12 meses
 *   - Alertas card
 *
 * Ver PROPUESTA_PNL_REORG.md, sección 5.1.
 */

import React from "react";
import Link from "next/link";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

export default function PulsoPage() {
  return (
    <div className="relative">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 80% 0%, rgba(251,191,36,0.10) 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(139,92,246,0.06) 0%, transparent 55%)",
          }}
        />

        <div className="relative">
          {/* Badge próximamente */}
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background:
                  "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)",
                animation: "pulsoPing 1.8s ease-in-out infinite",
                boxShadow: "0 0 10px rgba(251,191,36,0.7)",
              }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
              Próximamente · Fase 1
            </span>
          </div>

          <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900">
            Pulso
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600">
            La portada narrativa de Finanzas. Abrís la app y entendés tu
            negocio en 10 segundos: <strong className="text-slate-800">cash
            runway</strong>, <strong className="text-slate-800">marketing
            financiero</strong> (CAC / LTV / ROAS cruzado con el P&amp;L) y una{" "}
            <strong className="text-slate-800">narrativa generada por Aurum</strong>{" "}
            que te dice qué mirar hoy.
          </p>

          {/* Sketch preview de lo que va a venir */}
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SketchCard
              label="Cash Runway"
              lines={["$ 8.3M", "≈ 4.2 meses", "↑ vs mes pasado"]}
            />
            <SketchCard
              label="Marketing Financiero"
              lines={["CAC $ 4.2k", "LTV $ 38k", "Payback 2.8 meses"]}
            />
            <SketchCard
              label="Narrativa Aurum"
              lines={[
                "Abril arrancó +14% en",
                "margen neto. El driver",
                "fue caída de shipping.",
              ]}
              italic
            />
          </div>

          {/* Mientras tanto */}
          <div className="mt-8 flex items-center gap-3 text-sm text-slate-600">
            <span>Mientras, podés ir a:</span>
            <Link
              href="/finanzas/estado"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-amber-300 hover:text-amber-700"
              style={{ transition: `all 220ms ${ES}` }}
            >
              Estado de Resultados
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/finanzas/costos"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-amber-300 hover:text-amber-700"
              style={{ transition: `all 220ms ${ES}` }}
            >
              Costos
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulsoPing {
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

function SketchCard({
  label,
  lines,
  italic = false,
}: {
  label: string;
  lines: string[];
  italic?: boolean;
}) {
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white/70 p-4 backdrop-blur-sm"
      style={{
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.03)",
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 space-y-1">
        {lines.map((l, i) => (
          <div
            key={i}
            className={`text-sm tabular-nums tracking-tight ${
              italic ? "italic text-slate-500" : "font-semibold text-slate-700"
            }`}
          >
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
