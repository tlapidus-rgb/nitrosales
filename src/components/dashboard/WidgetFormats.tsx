"use client";

// ══════════════════════════════════════════════════════════════
// WidgetFormats — renderers for each FormatId
// ══════════════════════════════════════════════════════════════
// Cada formato es un componente puro que recibe datos ya
// resueltos por el dashboard y los pinta según las reglas
// visuales de la biblia (cubic-bezier, multi-shadow, dash-card,
// tabular-nums, lucide icons).
// ══════════════════════════════════════════════════════════════

import React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  X,
  GripVertical,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import DashboardSparkline from "./DashboardSparkline";
import { useAnimatedValue } from "@/lib/hooks/useAnimatedValue";
import { formatARS, formatCompact, formatDateShort } from "@/lib/utils/format";

// ── Common KPI data shape ────────────────────────────────────
export interface KpiData {
  value: string;
  sub: string;
  change?: number;
  inverse?: boolean;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface DistributionItem {
  key: string;
  label: string;
  value: number;
  color?: string;
}

export interface ListItem {
  key: string;
  label: string;
  value: number;
  secondary?: number;
}

// ── Shared chrome (category pill, title, edit overlay) ──────
interface ChromeProps {
  category: string;
  categoryColor: string;
  title: string;
  subtitle?: string;
  editMode?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onRemove?: () => void;
  dragHandlers?: React.HTMLAttributes<HTMLDivElement>;
  draggable?: boolean;
  className?: string;
  headerRight?: React.ReactNode;
  filterChips?: React.ReactNode;
  children: React.ReactNode;
}

function FormatChrome({
  category,
  categoryColor,
  title,
  subtitle,
  editMode,
  isDragging,
  isDragOver,
  onRemove,
  dragHandlers,
  draggable,
  className = "",
  headerRight,
  filterChips,
  children,
}: ChromeProps) {
  const draggingClass = isDragging ? "opacity-40 scale-[0.98]" : "";
  const dragOverClass = isDragOver
    ? "ring-2 ring-slate-900/15 border-slate-300"
    : "";
  const editClass = editMode ? "cursor-grab active:cursor-grabbing" : "";

  return (
    <div
      {...(editMode && dragHandlers ? dragHandlers : {})}
      draggable={!!editMode && !!draggable}
      className={`dash-card relative p-5 ${className} ${draggingClass} ${dragOverClass} ${editClass}`}
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
          <div className="absolute top-3 left-3 text-slate-300 pointer-events-none">
            <GripVertical className="w-4 h-4" />
          </div>
        </>
      )}

      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: categoryColor,
                boxShadow: `0 0 0 3px ${categoryColor}22`,
              }}
            />
            <span
              className="text-[10px] font-semibold tracking-[0.18em] uppercase truncate"
              style={{ color: categoryColor }}
            >
              {category}
            </span>
          </div>
          <h3 className="text-[13px] font-semibold tracking-tight text-slate-900 truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {headerRight && (
          <div className="shrink-0 flex items-center gap-1.5">{headerRight}</div>
        )}
      </div>

      {filterChips && <div className="mb-2">{filterChips}</div>}

      {children}
    </div>
  );
}

// ── Delta indicator (reused) ────────────────────────────────
function Delta({ change, inverse }: { change?: number; inverse?: boolean }) {
  if (change === undefined || change === null) return null;
  const raw = change ?? 0;
  const isNeutral = raw === 0;
  const isGood = inverse ? raw < 0 : raw > 0;
  const color = isNeutral
    ? "text-slate-400"
    : isGood
      ? "text-cyan-600"
      : "text-rose-500";
  const Icon = raw > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${color}`}
    >
      <Icon className="w-3 h-3" />
      {Math.abs(raw).toFixed(1)}%
    </span>
  );
}

// ══════════════════════════════════════════════════════════════
// Format: KPI (1×1) — número grande clásico con sparkline
// ══════════════════════════════════════════════════════════════
export interface FormatKpiProps extends Omit<ChromeProps, "children"> {
  data: KpiData | null;
  sparkline?: number[];
}
export function FormatKpi({ data, sparkline = [], ...chrome }: FormatKpiProps) {
  const animatedValue = useAnimatedValue(data?.value ?? "", 1000);
  const hasDelta = data?.change !== undefined && data?.change !== null;
  const isGood = data?.inverse ? (data?.change ?? 0) < 0 : (data?.change ?? 0) > 0;
  const isNeutral = (data?.change ?? 0) === 0;
  const sparkColor =
    isNeutral || !hasDelta ? "#64748b" : isGood ? "#06b6d4" : "#f43f5e";

  return (
    <FormatChrome {...chrome}>
      {/* Override header to add Delta inline (compatible with chrome's headerRight slot) */}
      {data ? (
        <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">
          {animatedValue}
        </p>
      ) : (
        <div className="h-7 w-24 dash-skeleton" />
      )}
      {hasDelta && (
        <div className="mt-1">
          <Delta change={data?.change} inverse={data?.inverse} />
        </div>
      )}
      {sparkline.length > 1 && (
        <div className="mt-2 -mx-1">
          <DashboardSparkline data={sparkline} color={sparkColor} height={28} />
        </div>
      )}
      {data?.sub && (
        <p className="text-[11px] text-slate-400 mt-1.5 leading-tight">{data.sub}</p>
      )}
    </FormatChrome>
  );
}

// ══════════════════════════════════════════════════════════════
// Format: Big Number (2×1) — número XXL hero
// ══════════════════════════════════════════════════════════════
export function FormatBigNumber({
  data,
  sparkline = [],
  ...chrome
}: FormatKpiProps) {
  const animatedValue = useAnimatedValue(data?.value ?? "", 1100);
  const hasDelta = data?.change !== undefined && data?.change !== null;
  const isGood = data?.inverse ? (data?.change ?? 0) < 0 : (data?.change ?? 0) > 0;
  const isNeutral = (data?.change ?? 0) === 0;
  const sparkColor =
    isNeutral || !hasDelta ? "#64748b" : isGood ? "#06b6d4" : "#f43f5e";

  return (
    <FormatChrome {...chrome} className="min-h-[170px]">
      <div className="flex items-end justify-between gap-4 mt-1">
        <div className="flex-1 min-w-0">
          {data ? (
            <p className="text-[44px] leading-none font-bold tabular-nums tracking-tight text-slate-900 truncate">
              {animatedValue}
            </p>
          ) : (
            <div className="h-12 w-40 dash-skeleton" />
          )}
          <div className="flex items-center gap-2 mt-2">
            <Delta change={data?.change} inverse={data?.inverse} />
            {data?.sub && (
              <span className="text-[11px] text-slate-400 truncate">{data.sub}</span>
            )}
          </div>
        </div>
        {sparkline.length > 1 && (
          <div className="w-[140px] shrink-0">
            <DashboardSparkline data={sparkline} color={sparkColor} height={56} />
          </div>
        )}
      </div>
    </FormatChrome>
  );
}

// ══════════════════════════════════════════════════════════════
// Format: Sparkline only (1×1)
// ══════════════════════════════════════════════════════════════
export function FormatSparkline({
  data,
  sparkline = [],
  ...chrome
}: FormatKpiProps) {
  const isGood = data?.inverse ? (data?.change ?? 0) < 0 : (data?.change ?? 0) > 0;
  const isNeutral = (data?.change ?? 0) === 0;
  const color = isNeutral ? "#64748b" : isGood ? "#06b6d4" : "#f43f5e";
  return (
    <FormatChrome {...chrome}>
      <div className="mt-2">
        {sparkline.length > 1 ? (
          <DashboardSparkline data={sparkline} color={color} height={56} />
        ) : (
          <div className="h-14 w-full dash-skeleton" />
        )}
      </div>
      {data?.sub && (
        <p className="text-[11px] text-slate-400 mt-2 leading-tight truncate">
          {data.sub}
        </p>
      )}
    </FormatChrome>
  );
}

// ══════════════════════════════════════════════════════════════
// Format: Mini Line (2×1) — recharts line con eje sutil
// ══════════════════════════════════════════════════════════════
export interface FormatChartProps extends Omit<ChromeProps, "children"> {
  series: SeriesPoint[];
  color?: string;
  valueFormatter?: (v: number) => string;
}
export function FormatMiniLine({
  series,
  color = "#06b6d4",
  valueFormatter = (v) => String(v),
  ...chrome
}: FormatChartProps) {
  return (
    <FormatChrome {...chrome} className="min-h-[170px]">
      <div className="mt-2" style={{ height: 110 }}>
        {series.length === 0 ? (
          <div className="h-full w-full dash-skeleton" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={series}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateShort}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
              />
              <YAxis
                tickFormatter={(v) => formatCompact(v)}
                tickLine={false}
                axisLine={false}
                width={36}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid rgba(15,23,42,0.08)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number) => [valueFormatter(value), ""]}
                labelFormatter={formatDateShort}
                cursor={{
                  stroke: "rgba(15,23,42,0.12)",
                  strokeWidth: 1,
                  strokeDasharray: "4 4",
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: color }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </FormatChrome>
  );
}

// ══════════════════════════════════════════════════════════════
// Format: Mini Bar (2×1)
// ══════════════════════════════════════════════════════════════
export function FormatMiniBar({
  series,
  color = "#8b5cf6",
  valueFormatter = (v) => String(v),
  ...chrome
}: FormatChartProps) {
  return (
    <FormatChrome {...chrome} className="min-h-[170px]">
      <div className="mt-2" style={{ height: 110 }}>
        {series.length === 0 ? (
          <div className="h-full w-full dash-skeleton" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={series}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateShort}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
              />
              <YAxis
                tickFormatter={(v) => formatCompact(v)}
                tickLine={false}
                axisLine={false}
                width={36}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid rgba(15,23,42,0.08)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number) => [valueFormatter(value), ""]}
                labelFormatter={formatDateShort}
                cursor={{ fill: "rgba(15,23,42,0.04)" }}
              />
              <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </FormatChrome>
  );
}

// ══════════════════════════════════════════════════════════════
// Format: Donut (2×2) — distribución porcentual
// ══════════════════════════════════════════════════════════════
export interface FormatDonutProps extends Omit<ChromeProps, "children"> {
  items: DistributionItem[];
  valueFormatter?: (v: number) => string;
}
export function FormatDonut({
  items,
  valueFormatter = (v) => formatARS(v),
  ...chrome
}: FormatDonutProps) {
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <FormatChrome {...chrome} className="min-h-[340px]">
      {items.length === 0 ? (
        <div className="h-[260px] w-full dash-skeleton" />
      ) : (
        <div className="flex items-center gap-4 mt-3">
          <div className="w-[180px] h-[180px] shrink-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={items}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={52}
                  outerRadius={84}
                  paddingAngle={2}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {items.map((it, i) => (
                    <Cell key={it.key} fill={it.color || "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid rgba(15,23,42,0.08)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number) => valueFormatter(value)}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-400">
                Total
              </span>
              <span className="text-base font-bold tabular-nums tracking-tight text-slate-900">
                {valueFormatter(total)}
              </span>
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            {items.slice(0, 6).map((it) => {
              const pct = total > 0 ? (it.value / total) * 100 : 0;
              return (
                <div key={it.key} className="flex items-center gap-2 text-[12px]">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: it.color || "#94a3b8" }}
                  />
                  <span className="text-slate-600 truncate flex-1">{it.label}</span>
                  <span className="text-slate-900 font-semibold tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </FormatChrome>
  );
}

// ══════════════════════════════════════════════════════════════
// Format: List (2×2) — top-N con barras horizontales
// ══════════════════════════════════════════════════════════════
export interface FormatListProps extends Omit<ChromeProps, "children"> {
  items: ListItem[];
  valueFormatter?: (v: number) => string;
  secondaryFormatter?: (v: number) => string;
  accent?: string;
}
export function FormatList({
  items,
  valueFormatter = (v) => formatARS(v),
  secondaryFormatter,
  accent = "#06b6d4",
  ...chrome
}: FormatListProps) {
  const max = items.reduce((m, i) => Math.max(m, i.value), 0);
  return (
    <FormatChrome {...chrome} className="min-h-[340px]">
      {items.length === 0 ? (
        <div className="h-[260px] w-full dash-skeleton" />
      ) : (
        <div className="mt-2 space-y-2">
          {items.slice(0, 8).map((it, idx) => {
            const pct = max > 0 ? (it.value / max) * 100 : 0;
            return (
              <div key={it.key} className="group">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[10px] font-bold tabular-nums text-slate-400 w-4">
                      {idx + 1}
                    </span>
                    <span className="text-[12px] text-slate-700 font-medium truncate">
                      {it.label}
                    </span>
                  </div>
                  <span className="text-[12px] font-semibold tabular-nums text-slate-900 shrink-0">
                    {valueFormatter(it.value)}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-slate-100 overflow-hidden ml-6">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: accent,
                      transition: "width 480ms cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  />
                </div>
                {it.secondary !== undefined && secondaryFormatter && (
                  <p className="text-[10px] text-slate-400 mt-0.5 ml-6 tabular-nums">
                    {secondaryFormatter(it.secondary)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </FormatChrome>
  );
}
