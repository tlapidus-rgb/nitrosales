// ══════════════════════════════════════════════════════════════════════════
// PageLoader — estado de carga ÚNICO y sobrio para todo el panel (2026-08-18)
// ══════════════════════════════════════════════════════════════════════════
// Pedido de Tomy: las páginas cargaban DISTINTO (cada una con su loader ad-hoc,
// algunos llamativos como el orbe «NitroPixel · Cargando atribuciones…»). Este es
// el único estado de carga del panel: un anillo fino y neutro (design system
// enterprise, tokens --ent-* vía las clases text-ink/border-hairline) + un label
// opcional. Reemplaza a los loaders por-página para que TODO cargue igual.
//
// Uso:
//   <PageLoader />                              → spinner solo, centrado (40vh)
//   <PageLoader label="Cargando atribuciones…" /> → con texto
//   <PageLoader minHeight="100vh" />            → pantalla completa
"use client";

export function PageLoader({
  label,
  className = "",
  minHeight = "40vh",
}: {
  /** Texto opcional bajo el spinner (ej. "Cargando atribuciones…"). */
  label?: string;
  /** Clases extra para el contenedor. */
  className?: string;
  /** Alto mínimo del contenedor. "auto" cuando el padre ya centra. */
  minHeight?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full flex items-center justify-center ${className}`}
      style={{ minHeight }}
    >
      <div className="flex flex-col items-center gap-3">
        {/* Anillo fino: borde tenue (hairline) con el tope en ink-60 → giro sutil.
            motion-reduce respeta a quien pidió menos movimiento (a11y). */}
        <span
          className="inline-block w-6 h-6 rounded-full border-2 border-hairline border-t-ink-60 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        {label ? <p className="text-xs text-ink-40">{label}</p> : null}
        <span className="sr-only">{label || "Cargando"}</span>
      </div>
    </div>
  );
}

export default PageLoader;
