"use client";

import React, { useState } from "react";
import { Calendar, Check } from "lucide-react";
import { LivePulse } from "@/components/enterprise/ui";

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

// Fecha YYYY-MM-DD en la zona horaria LOCAL del navegador (no UTC). Bug fix:
// `new Date().toISOString()` da UTC → en AR (UTC-3) después de las 21:00 el día
// ya avanzó, así que "Hoy" apuntaba a mañana y mostraba 0 datos ("todo corrido
// un día"). getFullYear/getMonth/getDate usan la hora local → el día correcto.
function localYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const handlePreset = (days: number) => {
    setShowCustom(false);
    if (days === 0) {
      const today = localYMD(new Date());
      onDateChange("from", today);
      onDateChange("to", today);
    } else if (days === 1) {
      const y = localYMD(new Date(Date.now() - 86400000));
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
  const today = localYMD(new Date());
  const yesterday = localYMD(new Date(Date.now() - 86400000));
  const isToday = dateFrom === today && dateTo === today;
  const isYesterday = dateFrom === yesterday && dateTo === yesterday;
  const isQuickActive = activeQuickRange !== null && activeQuickRange > 1;
  const isCustomActive = !isToday && !isYesterday && !isQuickActive;

  // Helper para clases del segmented item
  const segItemClass = (active: boolean) =>
    `relative px-3.5 py-1.5 rounded-[7px] text-xs font-medium tabular-nums tracking-tight ${
      active
        ? "bg-elevated text-ink shadow-[0_1px_2px_rgba(28,27,24,0.08),0_2px_8px_-2px_rgba(28,27,24,0.12)]"
        : "text-ink-60 hover:text-ink"
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
        className="inline-flex items-center gap-0.5 p-1 rounded-[10px] border border-hairline bg-surface"
        style={{
          boxShadow:
            "inset 0 1px 2px rgba(28,27,24,0.04), 0 1px 0 rgba(255,255,255,0.6)",
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
          className="dash-popover flex items-center gap-2 bg-elevated border border-hairline rounded-xl px-3 py-2"
          style={{
            boxShadow:
              "0 1px 0 rgba(28,27,24,0.06), 0 8px 24px -12px rgba(28,27,24,0.18), 0 22px 40px -28px rgba(28,27,24,0.16)",
          }}
        >
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="px-2.5 py-1.5 border border-hairline rounded-lg text-xs text-ink-60 bg-elevated focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition"
          />
          <span className="text-xs text-ink-40">a</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="px-2.5 py-1.5 border border-hairline rounded-lg text-xs text-ink-60 bg-elevated focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition"
          />
          <button
            onClick={handleApplyCustom}
            disabled={!customFrom || !customTo}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-ink hover:bg-ink/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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

      {loading && <LivePulse status="LIVE" label="Actualizando" />}
    </div>
  );
}
