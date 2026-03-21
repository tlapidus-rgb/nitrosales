"use client";

import React from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface KpiCardProps {
  icon: React.ReactNode;
  iconBg: string; // e.g. "bg-emerald-50"
  label: string;
  value: string;
  change?: number | null; // % change vs previous period
  changeLabel?: string;
  subtitle?: string;
}

export function ChangeBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-xs text-gray-400">--</span>;
  const isPositive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isPositive ? "text-emerald-600" : "text-red-500"
      }`}
    >
      {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export default function KpiCard({
  icon,
  iconBg,
  label,
  value,
  change,
  changeLabel,
  subtitle,
}: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 lg:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-2 rounded-lg ${iconBg}`}>{icon}</div>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className="text-xl lg:text-2xl font-bold text-gray-900">{value}</p>
      <div className="mt-1">
        {change !== undefined && change !== null ? (
          <>
            <ChangeBadge value={change} />
            <span className="text-[10px] text-gray-400 ml-1">
              {changeLabel || "vs periodo anterior"}
            </span>
          </>
        ) : subtitle ? (
          <span className="text-[10px] text-gray-400">{subtitle}</span>
        ) : null}
      </div>
    </div>
  );
}
