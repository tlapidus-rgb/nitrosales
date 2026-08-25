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
 * Decisiones visuales (design system enterprise-sobrio):
 *   - Tab activo: ink + dot estático + tracking-tight
 *   - Tab inactivo: ink-60, hover sutil
 *   - Easing: cubic-bezier(0.16, 1, 0.3, 1)
 *   - Fondo: canvas plano (sin aurora)
 *   - Delimitador hairline debajo de los tabs
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
    <div className="relative min-h-screen bg-canvas">
      <div className="relative z-10">
        {/* ═══════ HEADER ═══════ */}
        <header className="sticky top-0 z-40 bg-canvas border-b border-hairline">
          <div className="mx-auto max-w-7xl px-6 pt-6 pb-0">
            {/* Breadcrumb + título */}
            <div className="flex items-center gap-3 mb-1">
              <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink">
                FINANZAS
              </span>
              <span className="text-xs text-ink-40">·</span>
              <span className="text-xs text-ink-60 tracking-tight">
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
                            ? "rgb(var(--ent-ink))"
                            : "rgb(var(--ent-ink-40))",
                          transition: `background 240ms ${ES}`,
                        }}
                      />
                      <span
                        className={`text-sm font-semibold tracking-tight ${
                          active ? "text-ink" : "text-ink-60"
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
                        active ? "text-ink-60" : "text-ink-40"
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
                          "rgb(var(--ent-ink))",
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

            {/* Delimitador — línea fina sobria */}
            <div aria-hidden className="h-px w-full bg-hairline" />
          </div>
        </header>

        {/* ═══════ CONTENIDO ═══════ */}
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
