"use client";

import { useState, useMemo, useCallback } from "react";

// ── Types ──
export type PeriodPreset = "today" | "yesterday" | "7d" | "30d" | "90d" | "custom";

export type PeriodDates = { from: string; to: string };

// ── Helpers (exported for reuse) ──
function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export function getPresetDates(preset: PeriodPreset): PeriodDates {
  const today = new Date();
  switch (preset) {
    case "today": return { from: fmtDate(today), to: fmtDate(today) };
    case "yesterday": { const y = daysAgo(1); return { from: fmtDate(y), to: fmtDate(y) }; }
    case "7d": return { from: fmtDate(daysAgo(6)), to: fmtDate(today) };
    case "30d": return { from: fmtDate(daysAgo(29)), to: fmtDate(today) };
    case "90d": return { from: fmtDate(daysAgo(89)), to: fmtDate(today) };
    default: return { from: fmtDate(daysAgo(29)), to: fmtDate(today) };
  }
}

const PRESET_LABELS: Record<string, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
  custom: "Personalizado",
};

export function formatPeriodLabel(preset: PeriodPreset, from: string, to: string): string {
  if (preset !== "custom") return PRESET_LABELS[preset];
  return `${from.split("-").reverse().join("/")} — ${to.split("-").reverse().join("/")}`;
}

// ── Hook: usePeriod ──
export function usePeriod(defaultPreset: PeriodPreset = "30d") {
  const [activePreset, setActivePreset] = useState<PeriodPreset>(defaultPreset);
  const [periodDates, setPeriodDates] = useState<PeriodDates>(getPresetDates(defaultPreset));

  const selectPreset = useCallback((p: PeriodPreset) => {
    if (p === "custom") return; // custom is handled by applyCustomRange
    setActivePreset(p);
    setPeriodDates(getPresetDates(p));
  }, []);

  const applyCustomRange = useCallback((from: string, to: string) => {
    if (!from || !to || from > to) return;
    setActivePreset("custom");
    setPeriodDates({ from, to });
  }, []);

  const periodQuery = useMemo(
    () => `from=${periodDates.from}&to=${periodDates.to}`,
    [periodDates]
  );

  const label = useMemo(
    () => formatPeriodLabel(activePreset, periodDates.from, periodDates.to),
    [activePreset, periodDates]
  );

  return { activePreset, periodDates, periodQuery, label, selectPreset, applyCustomRange };
}

// ── Component: PeriodSelector ──
type PeriodSelectorProps = {
  activePreset: PeriodPreset;
  onSelectPreset: (p: PeriodPreset) => void;
  onApplyCustom: (from: string, to: string) => void;
};

export default function PeriodSelector({ activePreset, onSelectPreset, onApplyCustom }: PeriodSelectorProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const handlePreset = (p: PeriodPreset) => {
    if (p === "custom") {
      setShowCustom(!showCustom);
      return;
    }
    setShowCustom(false);
    onSelectPreset(p);
  };

  const handleApply = () => {
    if (!customFrom || !customTo || customFrom > customTo) return;
    onApplyCustom(customFrom, customTo);
    setShowCustom(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      {(["today", "yesterday", "7d", "30d", "90d"] as PeriodPreset[]).map(p => (
        <button
          key={p}
          onClick={() => handlePreset(p)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activePreset === p
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-white text-gray-600 border border-gray-200 hover:border-indigo-300"
          }`}
        >
          {PRESET_LABELS[p]}
        </button>
      ))}
      <button
        onClick={() => handlePreset("custom")}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
          activePreset === "custom"
            ? "bg-indigo-600 text-white shadow-sm"
            : "bg-white text-gray-600 border border-gray-200 hover:border-indigo-300"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline mr-1 -mt-0.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        Personalizado
      </button>

      {showCustom && (
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1 text-gray-700 focus:outline-none focus:border-indigo-400"
          />
          <span className="text-gray-400 text-sm">a</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1 text-gray-700 focus:outline-none focus:border-indigo-400"
          />
          <button
            onClick={handleApply}
            disabled={!customFrom || !customTo}
            className="px-3 py-1 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #FF5E1A, #FF8A50)" }}
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
