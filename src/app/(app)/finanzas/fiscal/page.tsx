// @ts-nocheck
"use client";

/**
 * /finanzas/fiscal — AFIP, IVA, obligaciones, calendario fiscal.
 *
 * Fase 5 del plan. Por ahora (Fase 0) es placeholder y el contenido fiscal
 * vivo sigue dentro de /finanzas/estado (tab interno "Fiscal" del page
 * heredado).
 *
 * Va a tener:
 *   - Botón "Resincronizar constancia AFIP" (con el scan que ya existe)
 *   - Calendario de obligaciones con alertas 3 días antes
 *   - Tablero de retenciones (IVA / IIBB / Ganancias por marketplace)
 *   - Alertas de límite Monotributo con proyección
 *   - Sugerencia de régimen con Aurum
 *
 * Ver PROPUESTA_PNL_REORG.md, sección 5.5 y capacidad 4.
 */

import React from "react";
import Link from "next/link";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

export default function FiscalPage() {
  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 80% 0%, rgba(16,185,129,0.09) 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(251,191,36,0.05) 0%, transparent 55%)",
          }}
        />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background:
                  "linear-gradient(135deg, #10b981 0%, #047857 100%)",
                animation: "fiscalPing 1.8s ease-in-out infinite",
                boxShadow: "0 0 10px rgba(16,185,129,0.7)",
              }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
              Próximamente · Fase 5
            </span>
          </div>

          <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900">
            Fiscal
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600">
            Tu relación con AFIP, limpia y predecible. Calendario de
            obligaciones automático según tu régimen, tablero de retenciones
            recibidas por marketplace, alertas de límite Monotributo con 2
            meses de anticipación, y sugerencia de régimen vía Aurum cuando
            los números pidan cambio.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FiscalSketch
              label="Próximo vencimiento"
              lines={["Monotributo", "Vence 20/04", "en 3 días"]}
            />
            <FiscalSketch
              label="Retenciones recuperables"
              lines={["IVA $ 142k", "IIBB $ 38k", "Ganancias $ 21k"]}
            />
            <FiscalSketch
              label="Proyección anual"
              lines={["Facturación 12m", "$ 38.2M", "Categoría H · OK"]}
            />
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-600">
            <strong className="text-slate-700">Mientras tanto:</strong> el
            IVA débito fiscal, las retenciones automáticas de MELI, el scan
            de constancia AFIP y la config fiscal onboarding siguen viviendo
            dentro de <Link href="/finanzas/estado" className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-2">Estado</Link>{" "}
            y <Link href="/finanzas/costos" className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-2">Costos</Link>. No se perdió nada — se va a
            consolidar acá en Fase 5.
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fiscalPing {
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

function FiscalSketch({
  label,
  lines,
}: {
  label: string;
  lines: string[];
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
            className="text-sm font-semibold tabular-nums tracking-tight text-slate-700"
          >
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
