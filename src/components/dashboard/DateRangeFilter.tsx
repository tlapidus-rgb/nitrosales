"use client";

import React, { useState } from "react";
import { Calendar } from "lucide-react";

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
      // Hoy
      const today = new Date().toISOString().split("T")[0];
      onDateChange("from", today);
      onDateChange("to", today);
    } else if (days === 1) {
      // Ayer
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

  const isCustomActive = activeQuickRange === null && !BUILTIN_PRESETS.some(p => p.days === activeQuickRange);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Built-in presets: Hoy, Ayer */}
      {BUILTIN_PRESETS.map((p) => {
        let isActive = false;
        if (p.days === 0) {
          const today = new Date().toISOString().split("T")[0];
          isActive = dateFrom === today && dateTo === today;
        } else if (p.days === 1) {
          const y = new Date(Date.now() - 86400000).toISOString().split("T")[0];
          isActive = dateFrom === y && dateTo === y;
        }
        return (
          <button
            key={p.days}
            onClick={() => handlePreset(p.days)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isActive
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
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
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeQuickRange === r.days
              ? "bg-gray-900 text-white"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          {r.label}
        </button>
      ))}

      {/* Custom date toggle */}
      <button
        onClick={() => setShowCustom(!showCustom)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
          showCustom || isCustomActive
            ? "bg-gray-900 text-white"
            : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
        }`}
      >
        <Calendar size={12} />
        Personalizado
      </button>

      {/* Custom date picker with Aplicar */}
      {showCustom && (
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white focus:outline-none focus:border-indigo-400"
          />
          <span className="text-xs text-gray-400">a</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white focus:outline-none focus:border-indigo-400"
          />
          <button
            onClick={handleApplyCustom}
            disabled={!customFrom || !customTo}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #FF5E1A, #FF8A50)" }}
          >
            Aplicar
          </button>
        </div>
      )}

      {loading && (
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600" />
      )}
    </div>
  );
}
