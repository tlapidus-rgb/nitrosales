// @ts-nocheck
"use client";

/**
 * PlaceholderPage — Fase 7b (settings)
 * ─────────────────────────────────────────────────────────────
 * Componente reusable para sub-pages de /settings que todavia no
 * estan productivas (Billing, Seguridad, API Keys). Sigue el patron
 * visual del /finanzas/fiscal placeholder (antes de Fase 6c):
 *   - Badge "Próximamente" con dot pulsante accent-colored.
 *   - Titulo + subtitulo + description corta.
 *   - Grid de 3 sketches con icon + label + 3 lineas de preview.
 */

import React from "react";

export default function PlaceholderPage({
  title,
  subtitle,
  description,
  accent,
  sketches,
}: {
  title: string;
  subtitle: string;
  description: string;
  accent: string;
  sketches: { icon: React.ComponentType<any>; label: string; lines: string[] }[];
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 85% 0%, ${accent}12 0%, transparent 55%)`,
        }}
      />
      <div className="relative">
        <div
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1"
          style={{
            borderColor: `${accent}40`,
            background: `${accent}0d`,
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: accent,
              boxShadow: `0 0 10px ${accent}80`,
              animation: "placeholderPing 1.8s ease-in-out infinite",
            }}
          />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: accent }}
          >
            Próximamente
          </span>
        </div>

        <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-slate-600">
          {description}
        </p>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {sketches.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={i}
                className="rounded-xl border border-slate-200 bg-white/70 p-4 backdrop-blur-sm"
                style={{
                  boxShadow:
                    "0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.03)",
                }}
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{
                    background: `${accent}10`,
                    color: accent,
                    border: `1px solid ${accent}22`,
                  }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {s.label}
                </div>
                <div className="mt-1 space-y-0.5">
                  {s.lines.map((l, j) => (
                    <div
                      key={j}
                      className="text-[13px] font-semibold tabular-nums tracking-tight text-slate-700"
                    >
                      {l}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style jsx global>{`
        @keyframes placeholderPing {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.5);
            opacity: 0.55;
          }
        }
      `}</style>
    </div>
  );
}
