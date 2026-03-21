"use client";

import React from "react";
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

export default function DateRangeFilter({
  dateFrom,
  dateTo,
  activeQuickRange,
  quickRanges,
  onQuickRange,
  onDateChange,
  loading,
}: DateRangeFilterProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5">
        {quickRanges.map((r) => (
          <button
            key={r.days}
            onClick={() => onQuickRange(r.days)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeQuickRange === r.days
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="w-px h-6 bg-gray-200" />

      <div className="flex items-center gap-2">
        <Calendar size={14} className="text-gray-400" />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateChange("from", e.target.value)}
          className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white"
        />
        <span className="text-xs text-gray-400">a</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onDateChange("to", e.target.value)}
          className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white"
        />
      </div>

      {loading && (
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600" />
      )}
    </div>
  );
}
