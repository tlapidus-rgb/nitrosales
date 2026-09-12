"use client";

// ═══════════════════════════════════════════════════════════════════
// AvisoDeCobertura — "esto que ves es una parte, y ésta es cuál"
// ═══════════════════════════════════════════════════════════════════
// E-26. Los paneles predictivos puntúan sobre una muestra acotada y hasta
// ahora mostraban el resultado como si fuera el total. Este componente hace
// visible el recorte.
//
// Decisiones de diseño, por si alguien las quiere cambiar:
//
//   · **No es una alerta.** El recorte no es un error ni algo que el usuario
//     tenga que arreglar: es cómo funciona el panel. Va en el tono cálido de
//     aviso que la pantalla ya usa para "Alto", no en el rojo de "Crítico".
//   · **No se puede cerrar.** Un aviso que se descarta vuelve a dejar el
//     número sin contexto, que es exactamente el bug.
//   · **Se renderiza solo si hay algo que decir.** Si la cobertura está
//     completa y no hay exclusiones, no ocupa espacio — un cartel que está
//     siempre entrena a no leerlo.
// ═══════════════════════════════════════════════════════════════════

import { Info } from "lucide-react";
import type { Cobertura } from "@/lib/analytics/cobertura";

export function AvisoDeCobertura({ cobertura }: { cobertura?: Cobertura | null }) {
  if (!cobertura) return null;

  const exclusiones = cobertura.exclusiones ?? [];
  if (!cobertura.aviso && exclusiones.length === 0) return null;

  return (
    <div
      className="mt-3 flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-[#f6edd8] border border-[#dcc494]"
      style={{ boxShadow: "0 1px 0 rgba(15, 23, 42, 0.04)" }}
    >
      <Info size={14} className="mt-0.5 shrink-0 text-[#8a5e12]" aria-hidden />
      <div className="space-y-1 text-[11px] leading-relaxed text-[#8a5e12]">
        {cobertura.aviso && <p>{cobertura.aviso}</p>}
        {exclusiones.map((e) => (
          <p key={e}>{e}</p>
        ))}
      </div>
    </div>
  );
}
