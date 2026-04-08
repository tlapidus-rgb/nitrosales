"use client";

// ══════════════════════════════════════════════════════════════
// WidgetFilterChips — hilera de filtros activos debajo del título
// ──────────────────────────────────────────────────────────────
// Si no hay filtros activos, no renderiza nada (la card queda
// limpia). Cada chip es clickeable para quitar ese filtro.
// ══════════════════════════════════════════════════════════════

import { X } from "lucide-react";
import {
  SectionKey,
  getApplicableFilters,
  FilterDef,
} from "@/lib/dashboard/filter-config";

interface WidgetFilterChipsProps {
  section?: SectionKey;
  excludeFilters?: string[];
  values: Record<string, string>;
  onRemove: (filterId: string) => void;
  dynamicOptions?: Record<string, FilterDef["options"]>;
}

export default function WidgetFilterChips({
  section,
  excludeFilters,
  values,
  onRemove,
  dynamicOptions,
}: WidgetFilterChipsProps) {
  if (!section || !values) return null;

  const filters = getApplicableFilters(section, excludeFilters);
  const active = filters
    .map((f) => {
      const v = values[f.id];
      if (!v || v === "all") return null;

      const options =
        dynamicOptions?.[f.id] && dynamicOptions[f.id].length > 0
          ? dynamicOptions[f.id]
          : f.options;

      const opt = options.find((o) => o.value === v);
      return opt ? { id: f.id, label: opt.label } : null;
    })
    .filter(Boolean) as Array<{ id: string; label: string }>;

  if (active.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 mb-2">
      {active.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(chip.id);
          }}
          className="dash-filter-chip"
          aria-label={`Quitar filtro ${chip.label}`}
        >
          <span className="truncate max-w-[120px]">{chip.label}</span>
          <X className="w-2.5 h-2.5 shrink-0" strokeWidth={2.5} />
        </button>
      ))}
    </div>
  );
}
