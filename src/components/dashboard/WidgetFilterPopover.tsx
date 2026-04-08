"use client";

// ══════════════════════════════════════════════════════════════
// WidgetFilterPopover — premium per-card filter UI
// ──────────────────────────────────────────────────────────────
// Self-contained: renders the ⚙ trigger button + the popover (or
// bottom sheet on mobile). Inherits the filter pool from the
// widget's section via filter-config.ts.
//
// Bible-compliant:
//  - lucide icons only
//  - cubic-bezier(0.16, 1, 0.3, 1) easing
//  - multi-layer shadow boundary
//  - backdrop saturate + blur
//  - slate-900 + slate-500, no orange gradients
//  - rounded-2xl popover, rounded-xl segmented control
//  - tabular-nums where applicable
// ══════════════════════════════════════════════════════════════

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, X, Check, ChevronDown } from "lucide-react";
import {
  FilterDef,
  SectionKey,
  countActiveFilters,
  getApplicableFilters,
} from "@/lib/dashboard/filter-config";

interface WidgetFilterPopoverProps {
  widgetId: string;
  section?: SectionKey;
  excludeFilters?: string[];
  values: Record<string, string>;
  onChange: (filterId: string, value: string) => void;
  onClear: () => void;
  // Optional: dynamic options injected at runtime (e.g. categorías reales del catálogo)
  dynamicOptions?: Record<string, FilterDef["options"]>;
}

export default function WidgetFilterPopover({
  widgetId,
  section,
  excludeFilters,
  values,
  onChange,
  onClear,
  dynamicOptions,
}: WidgetFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const filters = getApplicableFilters(section, excludeFilters);
  const activeCount = countActiveFilters(values);

  // Needed for createPortal (SSR-safe)
  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Compute popover position from trigger bounding rect ──
  // Anchored to bottom-right of trigger, auto-flips up if overflows.
  const updateCoords = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const POPOVER_W = 304;
    const POPOVER_ESTIMATED_H = 420; // estimación conservadora
    const MARGIN = 8;
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;

    // Right-aligned a la esquina derecha del trigger
    let left = rect.right - POPOVER_W;
    if (left < MARGIN) left = MARGIN;
    if (left + POPOVER_W > viewportW - MARGIN) left = viewportW - POPOVER_W - MARGIN;

    // Debajo del trigger por default; si no entra, lo flipeo arriba
    let top = rect.bottom + 6;
    if (top + POPOVER_ESTIMATED_H > viewportH - MARGIN) {
      const flipTop = rect.top - POPOVER_ESTIMATED_H - 6;
      if (flipTop >= MARGIN) {
        top = flipTop;
      } else {
        // Ni arriba ni abajo — lo pego al borde visible inferior
        top = Math.max(MARGIN, viewportH - POPOVER_ESTIMATED_H - MARGIN);
      }
    }
    setCoords({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateCoords();
  }, [open]);

  // ── Close on outside click / Esc + reposition on scroll/resize ──
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(t) &&
        triggerRef.current &&
        !triggerRef.current.contains(t)
      ) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const handleReflow = () => updateCoords();
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    window.addEventListener("scroll", handleReflow, true);
    window.addEventListener("resize", handleReflow);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
      window.removeEventListener("scroll", handleReflow, true);
      window.removeEventListener("resize", handleReflow);
    };
  }, [open]);

  if (!section || filters.length === 0) return null;

  const handleClear = () => {
    onClear();
  };

  return (
    <>
      {/* ── Trigger button (esquina superior derecha de la card) ── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Filtros de la card"
        className={`relative inline-flex items-center justify-center w-7 h-7 rounded-md transition-all ${
          open
            ? "bg-slate-100 text-slate-900"
            : activeCount > 0
              ? "text-slate-700 hover:bg-slate-100"
              : "text-slate-300 hover:text-slate-700 hover:bg-slate-100"
        }`}
        style={{
          transitionDuration: "180ms",
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={2.25} />
        {activeCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
            style={{
              background: "#06b6d4",
              boxShadow: "0 0 0 2px #ffffff",
            }}
            aria-hidden
          />
        )}
      </button>

      {/* ── Popover (portal + fixed positioning) + bottom sheet en mobile ── */}
      {open && mounted && createPortal(
        <>
          {/* Mobile backdrop */}
          <div
            className="dash-filter-backdrop sm:hidden"
            onClick={() => setOpen(false)}
          />

          <div
            ref={popoverRef}
            className="dash-filter-popover dash-filter-popover--portal"
            role="dialog"
            aria-label="Filtros de la card"
            onClick={(e) => e.stopPropagation()}
            style={
              coords
                ? { top: `${coords.top}px`, left: `${coords.left}px` }
                : undefined
            }
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500">
                Filtros
              </span>
              <div className="flex items-center gap-1">
                {activeCount > 0 && (
                  <button
                    onClick={handleClear}
                    type="button"
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-900 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
                    style={{
                      transitionDuration: "180ms",
                      transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  >
                    Limpiar
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  type="button"
                  aria-label="Cerrar"
                  className="sm:hidden w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter blocks */}
            <div className="space-y-4">
              {filters.map((f) => {
                const value = values[f.id] || "all";
                const options =
                  dynamicOptions?.[f.id] && dynamicOptions[f.id].length > 0
                    ? [
                        { value: "all", label: f.options[0]?.label ?? "Todos" },
                        ...dynamicOptions[f.id],
                      ]
                    : f.options;

                return (
                  <div key={f.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500">
                        {f.label}
                      </span>
                      {f.wired === false && (
                        <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200/70">
                          Beta
                        </span>
                      )}
                    </div>

                    {f.ui === "segmented" ? (
                      <SegmentedControl
                        options={options}
                        value={value}
                        onChange={(v) => onChange(f.id, v)}
                      />
                    ) : (
                      <DropdownSelect
                        options={options}
                        value={value}
                        onChange={(v) => onChange(f.id, v)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer hint */}
            <p className="mt-4 text-[10px] text-slate-400 leading-relaxed">
              Los filtros refinan sólo esta card. El filtro de fecha global sigue activo.
            </p>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// SegmentedControl — pills agrupadas, activa = slate-900
// ══════════════════════════════════════════════════════════════

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: FilterDef["options"];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="dash-filter-segmented">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`dash-filter-pill ${active ? "is-active" : ""}`}
            aria-pressed={active}
          >
            {active && <Check className="w-3 h-3 mr-1" strokeWidth={2.5} />}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// DropdownSelect — para listas de 5+ opciones
// ══════════════════════════════════════════════════════════════

function DropdownSelect({
  options,
  value,
  onChange,
}: {
  options: FilterDef["options"];
  value: string;
  onChange: (v: string) => void;
}) {
  const current = options.find((o) => o.value === value) || options[0];
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="dash-filter-select"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="dash-filter-select-chevron" />
    </div>
  );
}
