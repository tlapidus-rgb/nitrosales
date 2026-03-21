"use client";

import React from "react";

interface StatusItem {
  status: string;
  count: number;
}

interface StatusFilterProps {
  statuses: StatusItem[];
  activeStatus: string | null;
  onStatusChange: (status: string | null) => void;
  statusLabels: Record<string, string>;
  statusColors: Record<string, string>;
}

export default function StatusFilter({
  statuses,
  activeStatus,
  onStatusChange,
  statusLabels,
  statusColors,
}: StatusFilterProps) {
  const total = statuses.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => onStatusChange(null)}
        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
          activeStatus === null
            ? "bg-gray-900 text-white"
            : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
        }`}
      >
        Todos ({total})
      </button>
      {statuses.map((s) => (
        <button
          key={s.status}
          onClick={() =>
            onStatusChange(activeStatus === s.status ? null : s.status)
          }
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all inline-flex items-center gap-1.5 ${
            activeStatus === s.status
              ? "bg-gray-900 text-white"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              backgroundColor:
                activeStatus === s.status
                  ? "#fff"
                  : statusColors[s.status] || "#94a3b8",
            }}
          />
          {statusLabels[s.status] || s.status} ({s.count})
        </button>
      ))}
    </div>
  );
}
