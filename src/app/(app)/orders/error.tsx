"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function OrdersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Orders page error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md mx-auto px-6">
        <AlertTriangle size={48} className="text-amber-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">
          Algo salió mal al cargar Pedidos
        </h2>
        <p className="text-sm text-white/60 mb-6">
          Puede ser una conexión lenta o un error temporal.
          Probá recargando la sección.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                     bg-indigo-600 hover:bg-indigo-500 text-white text-sm
                     font-medium transition-colors"
        >
          <RefreshCw size={16} />
          Recargar sección
        </button>
      </div>
    </div>
  );
}
