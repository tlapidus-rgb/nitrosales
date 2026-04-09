// ══════════════════════════════════════════════════════════════
// Orders — SourceTabs (Tanda 8.1)
// ══════════════════════════════════════════════════════════════
// Segmented control animado de 3 pestañas (Todos / VTEX / MELI).
// Reemplaza al antiguo SourceFilter en /orders. Soporta URL state.
// Diseño inspirado en Linear / Vercel: indicador blanco con
// shadow sutil, animación cubic-bezier, iconos de marca.
// ══════════════════════════════════════════════════════════════

"use client";

import React, { useRef, useLayoutEffect, useState } from "react";

type SourceValue = "ALL" | "VTEX" | "MELI";

interface SourceTabsProps {
  source: SourceValue;
  onSourceChange: (source: SourceValue) => void;
  sourceCounts?: { vtex: number; meli: number; total: number } | null;
}

const TABS: Array<{
  value: SourceValue;
  label: string;
  accent: string;
  dotColor: string;
}> = [
  { value: "ALL", label: "Todos", accent: "text-slate-900", dotColor: "bg-slate-400" },
  { value: "VTEX", label: "VTEX", accent: "text-indigo-700", dotColor: "bg-indigo-500" },
  { value: "MELI", label: "Mercado Libre", accent: "text-amber-700", dotColor: "bg-amber-500" },
];

export default function SourceTabs({ source, onSourceChange, sourceCounts }: SourceTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<SourceValue, HTMLButtonElement | null>>({
    ALL: null,
    VTEX: null,
    MELI: null,
  });
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  });

  useLayoutEffect(() => {
    const activeTab = tabRefs.current[source];
    const container = containerRef.current;
    if (!activeTab || !container) return;
    const containerRect = container.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    setIndicatorStyle({
      left: tabRect.left - containerRect.left,
      width: tabRect.width,
    });
  }, [source, sourceCounts]);

  const countFor = (v: SourceValue): number | null => {
    if (!sourceCounts) return null;
    if (v === "ALL") return sourceCounts.total;
    if (v === "VTEX") return sourceCounts.vtex;
    if (v === "MELI") return sourceCounts.meli;
    return null;
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center gap-0.5 p-1 rounded-[12px] border border-slate-200 bg-slate-50/60 backdrop-blur-sm"
      role="tablist"
      aria-label="Filtro por plataforma"
    >
      {/* Indicador deslizante */}
      <div
        className="absolute top-1 bottom-1 rounded-[9px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] border border-slate-200/60"
        style={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
          transition: "left 280ms cubic-bezier(0.16, 1, 0.3, 1), width 280ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        aria-hidden="true"
      />

      {TABS.map((tab) => {
        const isActive = source === tab.value;
        const count = countFor(tab.value);
        return (
          <button
            key={tab.value}
            ref={(el) => {
              tabRefs.current[tab.value] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSourceChange(tab.value)}
            className={`relative z-10 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-[9px] text-xs font-semibold transition-colors duration-200 ${
              isActive ? tab.accent : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full transition-opacity duration-200 ${tab.dotColor} ${
                isActive ? "opacity-100" : "opacity-60"
              }`}
              aria-hidden="true"
            />
            <span className="whitespace-nowrap" style={{ fontVariantNumeric: "tabular-nums" }}>
              {tab.label}
            </span>
            {count !== null && (
              <span
                className={`text-[10px] font-medium tabular-nums transition-colors duration-200 ${
                  isActive ? "text-slate-500" : "text-slate-400"
                }`}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {count.toLocaleString("es-AR")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
