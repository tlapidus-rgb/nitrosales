// ═══════════════════════════════════════════════════════════════════
// NarrativeHero — banner narrativo del Pulso (Fase 1d)
// ═══════════════════════════════════════════════════════════════════
// Muestra 1-2 líneas en lenguaje humano generadas por reglas
// deterministas (ver /lib/finanzas/narrative.ts).
//
// Varía el fondo + accent según severity: critical, warning, positive
// o info. Icono SVG inline por severidad.
// ═══════════════════════════════════════════════════════════════════

"use client";

import { severityToPalette } from "@/lib/finanzas/narrative";
import type { NarrativeData } from "@/types/finanzas";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

interface NarrativeHeroProps {
  narrative: NarrativeData | null;
  loading: boolean;
}

export default function NarrativeHero({ narrative, loading }: NarrativeHeroProps) {
  if (loading) {
    return (
      <div
        className="h-24 rounded-2xl"
        style={{
          background:
            "linear-gradient(90deg, rgba(15,23,42,0.04) 0%, rgba(15,23,42,0.08) 50%, rgba(15,23,42,0.04) 100%)",
          backgroundSize: "200% 100%",
          animation: "narrShimmer 1.4s ease-in-out infinite",
        }}
      >
        <style jsx>{`
          @keyframes narrShimmer {
            0% {
              background-position: 200% 0;
            }
            100% {
              background-position: -200% 0;
            }
          }
        `}</style>
      </div>
    );
  }

  if (!narrative) return null;

  const palette = severityToPalette(narrative.severity);

  return (
    <section
      className="relative overflow-hidden rounded-2xl border p-5 sm:p-6"
      style={{
        borderColor: palette.ring,
        background: `linear-gradient(135deg, ${palette.bg} 0%, rgba(255,255,255,0.6) 100%)`,
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -14px rgba(15,23,42,0.08)",
        transition: `all 400ms ${ES}`,
      }}
    >
      {/* Halo de color */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full blur-3xl"
        style={{
          background: palette.accent,
          opacity: 0.08,
        }}
      />

      <div className="relative flex items-start gap-4">
        {/* Icono de severidad */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: palette.bg,
            border: `1px solid ${palette.ring}`,
            color: palette.fg,
          }}
        >
          <SeverityIcon rule={narrative.rule} severity={narrative.severity} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: palette.fg, opacity: 0.7 }}
            >
              {palette.label}
            </span>
            <span
              className="h-1 w-1 rounded-full"
              style={{ background: palette.accent }}
            />
            <span
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "rgba(15,23,42,0.4)" }}
            >
              Narrativa del Pulso
            </span>
          </div>
          <h2
            className="mt-1 text-lg font-bold tracking-tight sm:text-xl"
            style={{ letterSpacing: "-0.02em", color: "#0f172a" }}
          >
            {narrative.title}
          </h2>
          <p
            className="mt-1 text-[13px] leading-relaxed"
            style={{ color: "rgba(15,23,42,0.72)" }}
          >
            {narrative.body}
          </p>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Icono según severidad / rule
// ─────────────────────────────────────────────────────────────
function SeverityIcon({
  severity,
  rule,
}: {
  severity: string;
  rule: string;
}) {
  const stroke = "currentColor";
  const props = {
    width: 18,
    height: 18,
    fill: "none",
    stroke,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
  };

  // Runway: sand clock
  if (rule.startsWith("runway")) {
    return (
      <svg {...props} aria-hidden>
        <path d="M6 2h12" />
        <path d="M6 22h12" />
        <path d="M6 2c0 6 12 6 12 0" transform="translate(0 2)" />
        <path d="M6 22c0-6 12-6 12 0" transform="translate(0 -2)" />
      </svg>
    );
  }

  // Revenue: trending arrow
  if (rule.startsWith("revenue") || rule.startsWith("growing") || rule.startsWith("healthy")) {
    return (
      <svg {...props} aria-hidden>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    );
  }

  // Margin: percent
  if (rule.startsWith("margin")) {
    return (
      <svg {...props} aria-hidden>
        <line x1="19" y1="5" x2="5" y2="19" />
        <circle cx="6.5" cy="6.5" r="2.5" />
        <circle cx="17.5" cy="17.5" r="2.5" />
      </svg>
    );
  }

  // Default según severity
  if (severity === "critical" || severity === "warning") {
    return (
      <svg {...props} aria-hidden>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }

  return (
    <svg {...props} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
