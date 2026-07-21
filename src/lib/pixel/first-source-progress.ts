// ══════════════════════════════════════════════════════════════════════════
// NitroPixel — control del loop de refresh-pixel-first-source
// ══════════════════════════════════════════════════════════════════════════
// La fase `first-source` es resumible en DOS ejes y eso hace que la condición
// de corte sea sutil:
//   · por ORG    → `nextOrgCursor` avanza.
//   · DENTRO de una org → `maxVisitors` acota los faltantes por llamada y la
//     respuesta trae `pending:true`; el cursor VUELVE a 0 para rebarrer.
//
// El bug a evitar es doble y simétrico:
//   · cortar de más → quedan visitantes sin first_source y NADIE avisa (es el
//     agujero de 5 semanas que este fix vino a cerrar).
//   · no cortar     → el cron loopea hasta el maxDuration.
//
// Con `pending` el cursor NO avanza a propósito, así que la vieja regla "si el
// cursor no avanzó, cortar" da un falso positivo. El anti-loop correcto es el
// PROGRESO REAL: si una llamada no insertó a nadie, la siguiente tampoco va a.
//
// Pura y sin I/O para poder testear la regla sin levantar el cron.
// ══════════════════════════════════════════════════════════════════════════

export interface FirstSourcePhaseResponse {
  ok?: boolean;
  done?: boolean;
  /** true si alguna org llegó al tope de visitantes y quedó cola. */
  pending?: boolean;
  processedThisCall?: number;
  nextOrgCursor?: number | null;
  error?: string;
}

export type LoopDecision =
  | { action: "stop"; reason: "done" | "error" | "no-progress" | "cursor-stuck" }
  | { action: "continue"; nextCursor: number };

/**
 * Decide si el loop del cron sigue y con qué cursor, dada la respuesta de la
 * fase y el cursor con el que se la llamó.
 */
export function decideNextCall(
  res: FirstSourcePhaseResponse | null | undefined,
  currentCursor: number
): LoopDecision {
  if (!res || res.ok === false) return { action: "stop", reason: "error" };
  if (res.done === true) return { action: "stop", reason: "done" };

  if (res.pending === true) {
    // Quedó cola. Sólo tiene sentido volver si esta llamada insertó algo.
    if ((res.processedThisCall ?? 0) === 0) {
      return { action: "stop", reason: "no-progress" };
    }
    return {
      action: "continue",
      nextCursor: typeof res.nextOrgCursor === "number" ? res.nextOrgCursor : 0,
    };
  }

  const next = res.nextOrgCursor;
  if (next === null || next === undefined || next === currentCursor) {
    return { action: "stop", reason: "cursor-stuck" };
  }
  return { action: "continue", nextCursor: next };
}
