"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function BovedaPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  return (
    <div className="min-h-screen -m-4 lg:-m-6 p-4 lg:p-8 relative overflow-hidden bg-canvas">
      <header className="relative z-10 max-w-[1400px] mx-auto mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="px-2.5 py-1 rounded-md text-[9px] font-bold font-mono uppercase tracking-[0.25em] text-ink-60 bg-surface border border-hairline">
            Aurum · Artefactos
          </div>
        </div>
        <h1 className="text-4xl lg:text-5xl font-medium tracking-tight text-ink" style={{ letterSpacing: "-0.02em" }}>
          Bóveda
        </h1>
        <p className="text-ink-60 text-sm mt-2 max-w-xl leading-relaxed">
          Todo lo que Aurum genera para vos — reportes, análisis y visualizaciones — queda
          guardado acá. Tu archivo de inteligencia, siempre disponible.
        </p>
      </header>

      <div className="relative z-10 max-w-[1400px] mx-auto">
        <div
          className="rounded-2xl p-12 flex flex-col items-center justify-center text-center bg-elevated border border-hairline shadow-ent-xs"
          style={{ minHeight: 480 }}
        >
          <div className="relative w-28 h-28 mb-6">
            <div className="absolute inset-0 rounded-2xl bg-surface-2 border border-hairline" />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                className="w-12 h-12 text-ink-60"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-medium mb-3 text-ink">
            La Bóveda está por abrirse
          </h2>
          <p className="text-ink-60 text-sm max-w-lg leading-relaxed mb-6">
            Cuando Aurum empiece a generar reportes en Excel, gráficos en vivo y análisis
            exportables, los vas a encontrar todos acá.{" "}
            <span className="text-ink font-medium">Tu activo digital, resguardado.</span>
          </p>
          <div className="px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-[0.3em] text-ink-60 bg-surface border border-hairline">
            Próximamente
          </div>
        </div>
      </div>
    </div>
  );
}
