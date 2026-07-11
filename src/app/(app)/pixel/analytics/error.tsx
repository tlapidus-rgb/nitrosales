"use client";

// Error boundary del Analytics del pixel. Fondo CLARO → colores oscuros.
// El detalle técnico NO se muestra al cliente (solo se loguea a la consola
// para diagnóstico interno del equipo).

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
    // Diagnóstico interno (no visible para el cliente).
    console.error("Analytics page error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="text-center max-w-md mx-auto">
        <AlertTriangle size={44} className="text-amber-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          Algo salió mal al cargar Analytics
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Puede ser una conexión lenta o un error temporal. Probá recargando la
          sección.
        </p>
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
