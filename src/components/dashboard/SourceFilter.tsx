"use client";

import React from "react";

interface SourceFilterProps {
  source: string;
  onSourceChange: (source: string) => void;
  sources?: string[];
}

export default function SourceFilter({
  source,
  onSourceChange,
  sources = ["ALL", "VTEX", "MELI"],
}: SourceFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-ink-60 font-medium">Canal:</span>
      {sources.map((s) => (
        <button
          key={s}
          onClick={() => onSourceChange(s)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            source === s
              ? "bg-ink text-white"
              : "bg-elevated text-ink-60 border border-hairline hover:bg-surface"
          }`}
        >
          {s === "ALL" ? "Todos" : s}
        </button>
      ))}
    </div>
  );
}
