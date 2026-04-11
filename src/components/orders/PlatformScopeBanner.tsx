"use client";

// ══════════════════════════════════════════════════════════════
// PlatformScopeBanner — Explica en pocas palabras por qué una
// tarjeta solo muestra datos de VTEX. Es intencionalmente muy
// corto y fácil de entender: el usuario debe poder leerlo de un
// vistazo y entender que ML no abre esos datos.
// ══════════════════════════════════════════════════════════════

import { Info } from "lucide-react";

type Source = "VTEX" | "MELI" | "ALL" | string | undefined;

interface PlatformScopeBannerProps {
  /** Current source filter selected by the user. */
  source?: Source;
  /** VTEX / MELI counts in the current period (ignores filter). */
  sourceCounts?: { vtex: number; meli: number; total: number };
  /** Short copy explaining why this data is VTEX-only. MANTENER CORTO. */
  reason: string;
}

/**
 * Muestra un chip pequeño debajo del header de la card con una
 * explicación corta. Si el usuario filtró por MELI, muestra un
 * empty state más visible porque la card va a estar vacía.
 */
export default function PlatformScopeBanner({
  source,
  sourceCounts,
  reason,
}: PlatformScopeBannerProps) {
  const isMeli = source === "MELI";
  const meliCount = sourceCounts?.meli ?? 0;

  if (isMeli) {
    return (
      <div className="mt-1 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[11px] font-semibold text-amber-800">
            ML no abre estos datos
          </p>
          <p className="text-[11px] text-amber-700 leading-snug">{reason}</p>
        </div>
      </div>
    );
  }

  // ALL o VTEX: solo un chip pequeño informativo
  return (
    <div className="inline-flex items-center gap-1 mb-3 rounded-md bg-slate-50 border border-slate-100 px-2 py-0.5">
      <Info className="w-3 h-3 text-slate-400" />
      <span className="text-[10px] text-slate-500">
        Solo pedidos de VTEX
        {meliCount > 0 && source !== "VTEX"
          ? ` · ${meliCount.toLocaleString("es-AR")} de ML no incluidos`
          : ""}
      </span>
    </div>
  );
}
