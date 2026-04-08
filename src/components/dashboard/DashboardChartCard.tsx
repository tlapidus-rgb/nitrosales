"use client";

import React from "react";
import { X, GripVertical } from "lucide-react";

interface DashboardChartCardProps {
  category: string;
  categoryColor: string; // hex
  title: string;
  subtitle?: string;
  editMode?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onRemove?: () => void;
  dragProps?: Record<string, any>;
  // Optional slots for per-card filter UI (popover trigger + chips row).
  // Rendered without changing the card's visual rhythm.
  headerRight?: React.ReactNode;
  filterChips?: React.ReactNode;
  children: React.ReactNode;
}

export default function DashboardChartCard({
  category,
  categoryColor,
  title,
  subtitle,
  editMode,
  isDragging,
  isDragOver,
  onRemove,
  dragProps,
  headerRight,
  filterChips,
  children,
}: DashboardChartCardProps) {
  const draggingClass = isDragging ? "opacity-40 scale-[0.98]" : "";
  const dragOverClass = isDragOver
    ? "ring-2 ring-slate-900/15 border-slate-300"
    : "";
  const editClass = editMode ? "cursor-grab active:cursor-grabbing" : "";

  return (
    <div
      className={`dash-card dash-chart-card relative p-6 ${draggingClass} ${dragOverClass} ${editClass}`}
      {...(editMode ? dragProps : {})}
    >
      {editMode && (
        <>
          <button
            onClick={onRemove}
            aria-label="Quitar widget"
            className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 flex items-center justify-center z-10 shadow-sm"
            style={{
              transitionProperty: "color, background-color, border-color",
              transitionDuration: "200ms",
              transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="absolute top-3 left-3 text-slate-300">
            <GripVertical className="w-4 h-4" />
          </div>
        </>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: categoryColor, boxShadow: `0 0 0 3px ${categoryColor}22` }}
            />
            <span
              className="text-[10px] font-semibold tracking-[0.18em] uppercase"
              style={{ color: categoryColor }}
            >
              {category}
            </span>
          </div>
          <h3 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h3>
          {subtitle && (
            <p className="text-[12px] text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {headerRight && (
          <div className="shrink-0 flex items-center gap-1.5">{headerRight}</div>
        )}
      </div>

      {/* Active filter chips (sólo si hay filtros aplicados) */}
      {filterChips && <div className="mb-2">{filterChips}</div>}

      {/* Chart body */}
      <div className="dash-chart-body">{children}</div>
    </div>
  );
}
