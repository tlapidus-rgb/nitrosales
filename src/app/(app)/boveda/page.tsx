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
    <div
      className="min-h-screen -m-4 lg:-m-6 p-4 lg:p-8 relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 30% 10%, rgba(251,191,36,0.06) 0%, transparent 50%), radial-gradient(ellipse at 70% 90%, rgba(245,158,11,0.04) 0%, transparent 50%), linear-gradient(180deg, #0a0a0f 0%, #050508 100%)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background:
            "radial-gradient(2px 2px at 12% 30%, rgba(251,191,36,0.4), transparent), radial-gradient(1px 1px at 80% 20%, rgba(253,224,71,0.3), transparent), radial-gradient(1px 1px at 40% 70%, rgba(251,191,36,0.25), transparent), radial-gradient(2px 2px at 90% 60%, rgba(245,158,11,0.3), transparent)",
        }}
      />

      <header className="relative z-10 max-w-[1400px] mx-auto mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="px-2.5 py-1 rounded-md text-[9px] font-bold font-mono uppercase tracking-[0.25em]"
            style={{
              background: "rgba(251,191,36,0.12)",
              color: "#fbbf24",
              border: "1px solid rgba(251,191,36,0.3)",
              textShadow: "0 0 10px rgba(251,191,36,0.5)",
            }}
          >
            Aurum · Artefactos
          </div>
        </div>
        <h1
          className="text-4xl lg:text-5xl font-bold tracking-tight"
          style={{
            background:
              "linear-gradient(135deg, #fef3c7 0%, #fbbf24 40%, #f59e0b 70%, #d97706 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.02em",
          }}
        >
          Bóveda
        </h1>
        <p className="text-[#fde68a]/60 text-sm mt-2 max-w-xl leading-relaxed">
          Todo lo que Aurum genera para vos — reportes, análisis y visualizaciones — queda
          guardado acá. Tu archivo de inteligencia, siempre disponible.
        </p>
      </header>

      <div className="relative z-10 max-w-[1400px] mx-auto">
        <div
          className="rounded-2xl p-12 flex flex-col items-center justify-center text-center"
          style={{
            background:
              "linear-gradient(135deg, rgba(251,191,36,0.04), rgba(10,10,15,0.6))",
            border: "1px solid rgba(251,191,36,0.18)",
            backdropFilter: "blur(8px)",
            minHeight: 480,
          }}
        >
          <div className="relative w-28 h-28 mb-6">
            <div
              className="absolute inset-0 rounded-2xl"
              style={{
                background:
                  "linear-gradient(135deg, rgba(251,191,36,0.3), rgba(245,158,11,0.1))",
                border: "1px solid rgba(251,191,36,0.5)",
                boxShadow:
                  "0 0 50px rgba(251,191,36,0.3), inset 0 1px 0 rgba(253,224,71,0.3)",
                animation: "aurumBreath 3s ease-in-out infinite",
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                className="w-12 h-12"
                style={{ color: "#fef3c7", filter: "drop-shadow(0 0 8px rgba(251,191,36,0.6))" }}
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
          <h2
            className="text-2xl font-bold mb-3"
            style={{
              background: "linear-gradient(135deg, #fef3c7, #fbbf24 50%, #d97706)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            La Bóveda está por abrirse
          </h2>
          <p className="text-[#fde68a]/60 text-sm max-w-lg leading-relaxed mb-6">
            Cuando Aurum empiece a generar reportes en Excel, gráficos en vivo y análisis
            exportables, los vas a encontrar todos acá.{" "}
            <span className="text-[#fbbf24]/80">Tu activo digital, resguardado.</span>
          </p>
          <div
            className="px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-[0.3em]"
            style={{
              background: "rgba(251,191,36,0.08)",
              border: "1px solid rgba(251,191,36,0.25)",
              color: "#fbbf24",
            }}
          >
            Próximamente
          </div>
        </div>
      </div>
    </div>
  );
}
