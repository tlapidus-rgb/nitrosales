"use client";

import React from "react";

/**
 * AurumOrb — marca sobria del asistente Aurum (design system enterprise).
 *
 * Antes era una esfera dorada "viva" con anillo tipo Saturno + glows + partículas
 * orbitando. Ahora, alineado con el resto de la app (Linear/Vercel/Claude sobrio),
 * es una marca ESTÁTICA: un aro hairline + un disco de acento. Cuando `thinking`
 * está activo, un pulso suave (respiración) reemplaza al spinner dorado.
 *
 * Se mantiene la API (`size`, `thinking`) para no romper los call sites
 * (FloatingAurum, chat, OnboardingAurumChat, OnboardingOverlay, aura/inicio).
 */
export function AurumOrb({
  size = 52,
  thinking = false,
}: {
  size?: number;
  thinking?: boolean;
}) {
  const core = Math.round(size * 0.42);
  const ring = Math.round(size * 0.82);

  return (
    <div
      className="relative grid place-items-center shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Pulso suave sólo mientras "piensa" (respeta reduced-motion) */}
      {thinking && (
        <span
          className="absolute rounded-full bg-accent/25 animate-live-pulse motion-reduce:hidden"
          style={{ width: core, height: core }}
        />
      )}
      {/* Aro hairline */}
      <span
        className="absolute rounded-full border border-hairline-2"
        style={{ width: ring, height: ring }}
      />
      {/* Núcleo accent */}
      <span
        className="relative rounded-full bg-accent"
        style={{ width: core, height: core }}
      />
    </div>
  );
}

export default AurumOrb;
