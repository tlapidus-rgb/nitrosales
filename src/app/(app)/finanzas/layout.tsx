// @ts-nocheck
"use client";

/**
 * Layout compartido de /finanzas — renderiza las 5 pestañas
 * premium arriba (Pulso · Estado · Costos · Escenarios · Fiscal)
 * y el contenido de cada ruta hija debajo.
 *
 * Fase 0 del rediseño (ver PROPUESTA_PNL_REORG.md).
 * Vocabulario y orden decidido en sesión 41 con Tomy.
 *
 * Decisiones visuales (UI_VISION_NITROSALES.md):
 *   - Tab activo: gradient dorado + dot pulsante + tracking-tight
 *   - Tab inactivo: slate-500, hover sutil con blur background
 *   - Easing: cubic-bezier(0.16, 1, 0.3, 1) — signature curve del producto
 *   - Fondo: blanco puro con aurora radial dorada abajo izquierda
 *   - Prism delimiter debajo de los tabs (cyan → violet → orange)
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  href: string;
  label: string;
  description: string;
};

const TABS: Tab[] = [
  {
    href: "/finanzas/pulso",
    label: "Pulso",
    description: "Cómo estoy hoy · 10 segundos",
  },
  {
    href: "/finanzas/estado",
    label: "Estado",
    description: "Estado de Resultados · 2 minutos",
  },
  {
    href: "/finanzas/costos",
    label: "Costos",
    description: "Configuración · 1 min por categoría",
  },
  {
    href: "/finanzas/escenarios",
    label: "Escenarios",
    description: "Forecast + what-if · 3 minutos",
  },
  {
    href: "/finanzas/fiscal",
    label: "Fiscal",
    description: "AFIP · IVA · obligaciones · 30 segundos",
  },
];

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

export default function FinanzasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";

  const isActive = (href: string) => {
    // Match exacto o prefijo (ej: /finanzas/estado/detallado matchea Estado)
    if (pathname === href) return true;
    if (pathname.startsWith(href + "/")) return true;
    return false;
  };

  return (
    <div className="relative min-h-screen">
      {/* Aurora dorada sutil — signature de Finanzas */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle at 10% 95%, rgba(251,191,36,0.08) 0%, transparent 55%), radial-gradient(circle at 95% 5%, rgba(139,92,246,0.06) 0%, transparent 50%)",
        }}
      />

      <div className="relative z-10">
        {/* ═══════ HEADER ═══════ */}
        <header
          className="sticky top-0 z-40 backdrop-blur-md"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 100%)",
            borderBottom: "1px solid rgba(226,232,240,0.8)",
          }}
        >
          <div className="mx-auto max-w-7xl px-6 pt-6 pb-0">
            {/* Breadcrumb + título */}
            <div className="flex items-center gap-3 mb-1">
              <span
                className="text-[10px] font-semibold tracking-[0.18em] uppercase"
                style={{
                  background: "linear-gradient(90deg, #fbbf24 0%, #d97706 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                FINANZAS
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500 tracking-tight">
                Control financiero tri-moneda
              </span>
            </div>

            {/* Tabs */}
            <nav className="flex items-end gap-1 -mb-px overflow-x-auto pt-2">
              {TABS.map((tab) => {
                const active = isActive(tab.href);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className="group relative flex flex-col items-start px-4 py-3 rounded-t-lg"
                    style={{
                      transition: `background 240ms ${ES}, transform 240ms ${ES}`,
                    }}
                  >
                    {/* Dot indicator — pulsante cuando activo */}
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block rounded-full"
                        style={{
                          width: 6,
                          height: 6,
                          background: active
                            ? "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)"
                            : "rgba(148,163,184,0.35)",
                          boxShadow: active
                            ? "0 0 10px rgba(251,191,36,0.6)"
                            : "none",
                          animation: active
                            ? "finanzasDotPulse 2.4s ease-in-out infinite"
                            : "none",
                          transition: `background 240ms ${ES}, box-shadow 240ms ${ES}`,
                        }}
                      />
                      <span
                        className={`text-sm font-semibold tracking-tight ${
                          active ? "text-slate-900" : "text-slate-500"
                        }`}
                        style={{
                          transition: `color 200ms ${ES}`,
                        }}
                      >
                        {tab.label}
                      </span>
                    </div>

                    {/* Descripción sutil */}
                    <span
                      className={`mt-0.5 ml-4 text-[11px] tracking-tight ${
                        active ? "text-slate-500" : "text-slate-400"
                      }`}
                      style={{ transition: `color 200ms ${ES}` }}
                    >
                      {tab.description}
                    </span>

                    {/* Barra activa inferior con gradient dorado */}
                    <span
                      aria-hidden
                      className="absolute left-3 right-3 bottom-0 h-[2px] rounded-full"
                      style={{
                        background:
                          "linear-gradient(90deg, #fbbf24 0%, #d97706 100%)",
                        opacity: active ? 1 : 0,
                        transform: active ? "scaleX(1)" : "scaleX(0.4)",
                        transformOrigin: "center",
                        transition: `opacity 280ms ${ES}, transform 280ms ${ES}`,
                      }}
                    />
                  </Link>
                );
              })}
            </nav>

            {/* Prism delimiter — línea horizontal multi-color fina */}
            <div
              aria-hidden
              className="h-px w-full"
              style={{
                background:
                  "linear-gradient(90deg, rgba(6,182,212,0) 0%, rgba(6,182,212,0.45) 20%, rgba(139,92,246,0.55) 50%, rgba(249,115,22,0.45) 80%, rgba(249,115,22,0) 100%)",
              }}
            />
          </div>
        </header>

        {/* ═══════ CONTENIDO ═══════ */}
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </div>

      <style jsx global>{`
        @keyframes finanzasDotPulse {
          0%,
          100% {
            transform: scale(1);
            filter: brightness(1);
          }
          50% {
            transform: scale(1.25);
            filter: brightness(1.18);
          }
        }
      `}</style>
    </div>
  );
}
