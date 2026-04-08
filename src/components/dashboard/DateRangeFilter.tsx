"use client";

import React, { useState } from "react";
import { Calendar, Check } from "lucide-react";

interface QuickRange {
  label: string;
  days: number;
}

interface DateRangeFilterProps {
  dateFrom: string;
  dateTo: string;
  activeQuickRange: number | null;
  quickRanges: QuickRange[];
  onQuickRange: (days: number) => void;
  onDateChange: (type: "from" | "to", value: string) => void;
  loading?: boolean;
}

// Built-in presets (always shown before the page's custom quickRanges)
const BUILTIN_PRESETS = [
  { label: "Hoy", days: 0 },
  { label: "Ayer", days: 1 },
];

const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

export default function DateRangeFilter({
  dateFrom,
  dateTo,
  activeQuickRange,
  quickRanges,
  onQuickRange,
  onDateChange,
  loading,
}: DateRangeFilterProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const handlePreset = (days: number) => {
    setShowCustom(false);
    if (days === 0) {
      const today = new Date().toISOString().split("T")[0];
      onDateChange("from", today);
      onDateChange("to", today);
    } else if (days === 1) {
      const y = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      onDateChange("from", y);
      onDateChange("to", y);
    } else {
      onQuickRange(days);
    }
  };

  const handleApplyCustom = () => {
    if (!customFrom || !customTo || customFrom > customTo) return;
    onDateChange("from", customFrom);
    onDateChange("to", customTo);
    setShowCustom(false);
  };

  // Determinar si "Personalizado" está activo (ningún preset matchea)
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const isToday = dateFrom === today && dateTo === today;
  const isYesterday = dateFrom === yesterday && dateTo === yesterday;
  const isQuickActive = activeQuickRange !== null && activeQuickRange > 1;
  const isCustomActive = !isToday && !isYesterday && !isQuickActive;

  // Helper para clases del segmented item
  const segItemClass = (active: boolean) =>
    `relative px-3.5 py-1.5 rounded-[7px] text-xs font-medium tabular-nums tracking-tight ${
      active
        ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08),0_2px_8px_-2px_rgba(15,23,42,0.12)]"
        : "text-slate-600 hover:text-slate-900"
    }`;

  const segStyle: React.CSSProperties = {
    transitionProperty: "color, background-color, box-shadow",
    transitionDuration: "220ms",
    transitionTimingFunction: EASING,
  };

  return (
    <div className="flex items-center gap-3 flex-wrap mb-5">
      {/* Segmented control container */}
      <div
        className="inline-flex items-center gap-0.5 p-1 rounded-[10px] border border-slate-200/80 bg-slate-50/60"
        style={{
          boxShadow:
            "inset 0 1px 2px rgba(15,23,42,0.04), 0 1px 0 rgba(255,255,255,0.6)",
        }}
      >
        {/* Built-in presets: Hoy, Ayer */}
        {BUILTIN_PRESETS.map((p) => {
          const isActive =
            (p.days === 0 && isToday) || (p.days === 1 && isYesterday);
          return (
            <button
              key={p.days}
              onClick={() => handlePreset(p.days)}
              className={segItemClass(isActive)}
              style={segStyle}
            >
              {p.label}
            </button>
          );
        })}

        {/* Page's quick ranges: 7d, 30d, 90d, etc */}
        {quickRanges.map((r) => (
          <button
            key={r.days}
            onClick={() => handlePreset(r.days)}
            className={segItemClass(activeQuickRange === r.days)}
            style={segStyle}
          >
            {r.label}
          </button>
        ))}

        {/* Custom date toggle */}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className={`${segItemClass(showCustom || isCustomActive)} flex items-center gap-1.5`}
          style={segStyle}
        >
          <Calendar className="w-3.5 h-3.5" />
          Personalizado
        </button>
      </div>

      {/* Custom date picker */}
      {showCustom && (
        <div
          className="dash-popover flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2"
          style={{
            boxShadow:
              "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.18), 0 22px 40px -28px rgba(15,23,42,0.16)",
          }}
        >
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition"
          />
          <span className="text-xs text-slate-400">a</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition"
          />
          <button
            onClick={handleApplyCustom}
            disabled={!customFrom || !customTo}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{
              transitionDuration: "220ms",
              transitionTimingFunction: EASING,
            }}
          >
            <Check className="w-3 h-3" />
            Aplicar
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
          <span className="relative flex w-2 h-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
          </span>
          Actualizando
        </div>
      )}
    </div>
  );
}
