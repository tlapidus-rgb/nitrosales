"use client";

// Error boundary del Analytics del pixel. La página tiene fondo CLARO, así que
// los colores son oscuros (antes era texto blanco → invisible). Además muestra
// el mensaje del error para poder diagnosticar el crash intermitente.

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Analytics page error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="text-center max-w-lg mx-auto">
        <AlertTriangle size={44} className="text-amber-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          Algo salió mal al cargar Analytics
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Puede ser una conexión lenta o un error temporal al cambiar el rango de
          fechas. Probá recargando la sección.
        </p>

        {/* Detalle técnico del error (para diagnóstico). */}
        <details className="text-left mb-5">
          <summary className="text-xs text-slate-400 cursor-pointer select-none hover:text-slate-600">
            Ver detalle técnico
          </summary>
          <pre className="mt-2 p-3 rounded-lg bg-slate-100 border border-slate-200 text-[11px] text-slate-700 overflow-auto max-h-48 whitespace-pre-wrap break-words">
            {error?.message || "Sin mensaje"}
            {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
            {error?.stack ? `\n\n${error.stack}` : ""}
          </pre>
        </details>

        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                     bg-slate-900 hover:bg-slate-800 text-white text-sm
                     font-medium transition-colors"
        >
          <RefreshCw size={16} />
          Recargar sección
        </button>
      </div>
    </div>
  );
}
