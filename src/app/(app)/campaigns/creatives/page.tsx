// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie,
  RadialBarChart, RadialBar, Legend,
} from "recharts";
import { formatARS, formatCompact, formatDateShort } from "@/lib/utils/format";
import { KpiCard, DateRangeFilter } from "@/components/dashboard";
import {
  Play, Eye, MousePointer, Target, Zap, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, Film, Image, AlertTriangle,
  CheckCircle, XCircle, BarChart3, Filter, ChevronDown, ChevronUp,
  Activity, Percent, Video, Sparkles,
} from "lucide-react";

/* ── Constants ─────────────────────────────────────── */

const QUICK_RANGES = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

function toDateInputValue(d: Date) {
  return d.toISOString().split("T")[0];
}

/* ── Color & Label Helpers ─────────────────────────── */

const DIAGNOSIS_CONFIG: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  WEAK_HOOK: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: XCircle, label: "Hook debil" },
  WEAK_CONTENT: { color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", icon: AlertTriangle, label: "Contenido debil" },
  WEAK_CTA: { color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", icon: MousePointer, label: "Falta CTA" },
  STRONG_PERFORMER: { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle, label: "Top performer" },
};

function getScoreColor(score: number) {
  if (score >= 70) return "#10b981"; // green
  if (score >= 40) return "#f59e0b"; // amber
  if (score >= 20) return "#f97316"; // orange
  return "#ef4444"; // red
}

function getScoreLabel(score: number) {
  if (score >= 70) return "Excelente";
  if (score >= 40) return "Bueno";
  if (score >= 20) return "Regular";
  return "Bajo";
}

/* ── Small Components ──────────────────────────────── */

function ChangeBadge({ value }: { value: number }) {
  if (!value || value === 0) return <span className="text-xs text-gray-500">--</span>;
  const pos = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${pos ? "text-emerald-400" : "text-red-400"}`}>
      {pos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function ScoreGauge({ score, size = 120 }: { score: number; size?: number }) {
  const color = getScoreColor(score);
  const data = [{ value: score, fill: color }];
  return (
    <div className="relative" style={{ width: size, height: size / 2 + 10 }}>
      <RadialBarChart
        width={size}
        height={size / 2 + 10}
        cx={size / 2}
        cy={size / 2}
        innerRadius={size / 2 - 20}
        outerRadius={size / 2 - 5}
        startAngle={180}
        endAngle={0}
        data={data}
        barSize={12}
      >
        <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "rgba(255,255,255,0.05)" }} />
      </RadialBarChart>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-0">
        <span className="text-2xl font-bold" style={{ color }}>{score.toFixed(1)}</span>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{getScoreLabel(score)}</span>
      </div>
    </div>
  );
}

function RetentionFunnel({ dropOff }: { dropOff: any }) {
  if (!dropOff) return null;
  const steps = [
    { label: "3s Play", pct: 100, color: "#8b5cf6" },
    { label: "25%", pct: dropOff.retention25, color: "#6366f1" },
    { label: "50%", pct: dropOff.retention50, color: "#3b82f6" },
    { label: "75%", pct: dropOff.retention75, color: "#06b6d4" },
    { label: "100%", pct: dropOff.retention100, color: "#10b981" },
  ].filter((s) => s.pct !== null);

  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 w-10 text-right shrink-0">{s.label}</span>
          <div className="flex-1 bg-white/5 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.max(s.pct, 2)}%`, backgroundColor: s.color }}
            />
          </div>
          <span className="text-[11px] font-mono text-gray-400 w-10 shrink-0">{s.pct}%</span>
        </div>
      ))}
    </div>
  );
}

function DiagnosisBadge({ diagnosis }: { diagnosis: string | null }) {
  if (!diagnosis) return null;
  const config = DIAGNOSIS_CONFIG[diagnosis];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${config.bg} ${config.color}`}>
      <Icon size={13} />
      {config.label}
    </div>
  );
}

function MetricPill({ label, value, suffix = "%" }: { label: string; value: number | null; suffix?: string }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-white/5">
      <span className="text-lg font-bold text-white">{value.toFixed(1)}{suffix}</span>
      <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

/* ── Video Card (the star component) ────────────────── */

function VideoCreativeCard({ creative, rank }: { creative: any; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const vm = creative.videoMetrics;
  const score = vm?.videoEfficiencyScore;
  const dropOff = vm?.dropOffAnalysis;

  return (
    <div className="bg-[var(--nitro-bg2)] border border-[var(--nitro-border)] rounded-xl overflow-hidden hover:border-[var(--nitro-orange)]/30 transition-all">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Rank */}
          <div className="flex flex-col items-center shrink-0">
            <span className="text-xs text-gray-500">#{rank}</span>
            {score !== null && score !== undefined && (
              <div className="mt-1 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ backgroundColor: getScoreColor(score) + "20", color: getScoreColor(score) }}>
                {Math.round(score)}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Video size={14} className="text-purple-400 shrink-0" />
              <h3 className="text-sm font-semibold text-white truncate">{creative.name}</h3>
            </div>
            <p className="text-xs text-gray-500 truncate mb-2">
              {creative.campaignName || "Sin campana"}
            </p>

            {/* Diagnosis */}
            <DiagnosisBadge diagnosis={dropOff?.diagnosis} />
          </div>

          {/* Score gauge */}
          {score !== null && score !== undefined && (
            <div className="shrink-0 hidden sm:block">
              <ScoreGauge score={score} size={100} />
            </div>
          )}
        </div>

        {/* Key metrics row */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          <MetricPill label="Hook Rate" value={vm?.hookRate} />
          <MetricPill label="Action Rate" value={vm?.actionRate} />
          <MetricPill label="Hold Rate" value={vm?.holdRate} />
          <MetricPill label="Completion" value={vm?.completionRate} />
        </div>

        {/* Performance metrics */}
        <div className="grid grid-cols-5 gap-3 mt-3 pt-3 border-t border-white/5">
          <div className="text-center">
            <span className="text-xs text-gray-500 block">Spend</span>
            <span className="text-sm font-semibold text-white">{formatARS(creative.spend)}</span>
          </div>
          <div className="text-center">
            <span className="text-xs text-gray-500 block">ROAS</span>
            <span className={`text-sm font-bold ${creative.roas >= 3 ? "text-emerald-400" : creative.roas >= 1.5 ? "text-amber-400" : "text-red-400"}`}>
              {creative.roas}x
            </span>
          </div>
          <div className="text-center">
            <span className="text-xs text-gray-500 block">Clicks</span>
            <span className="text-sm font-semibold text-white">{formatCompact(creative.clicks)}</span>
          </div>
          <div className="text-center">
            <span className="text-xs text-gray-500 block">Conv</span>
            <span className="text-sm font-semibold text-white">{creative.conversions}</span>
          </div>
          <div className="text-center">
            <span className="text-xs text-gray-500 block">Plays</span>
            <span className="text-sm font-semibold text-white">{formatCompact(vm?.videoPlays || 0)}</span>
          </div>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-gray-300 bg-white/[0.02] hover:bg-white/[0.04] transition-colors border-t border-white/5"
      >
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {expanded ? "Menos detalle" : "Ver retencion y detalle"}
      </button>

      {/* Expanded section */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/5">
          {/* Retention funnel */}
          <div className="pt-3">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Curva de retencion
            </h4>
            <RetentionFunnel dropOff={dropOff} />
          </div>

          {/* Raw video numbers */}
          <div className="grid grid-cols-5 gap-2 text-center">
            {[
              { label: "Plays", val: vm?.videoPlays },
              { label: "25%", val: vm?.videoP25Watched },
              { label: "50%", val: vm?.videoP50Watched },
              { label: "75%", val: vm?.videoP75Watched },
              { label: "100%", val: vm?.videoP100Watched },
            ].map((m) => (
              <div key={m.label} className="bg-white/5 rounded-lg px-2 py-2">
                <span className="text-[10px] text-gray-500 block">{m.label}</span>
                <span className="text-xs font-mono text-gray-300">{m.val != null ? formatCompact(m.val) : "-"}</span>
              </div>
            ))}
          </div>

          {/* Diagnosis explanation */}
          {dropOff?.diagnosisLabel && (
            <div className="bg-white/5 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Sparkles size={14} className="text-[var(--nitro-orange)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-gray-300">Diagnostico AI</p>
                  <p className="text-xs text-gray-500 mt-0.5">{dropOff.diagnosisLabel}</p>
                </div>
              </div>
            </div>
          )}

          {/* Creative thumbnail */}
          {creative.mediaUrls && creative.mediaUrls.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Thumbnail</h4>
              <img
                src={creative.mediaUrls[0]}
                alt={creative.name}
                className="rounded-lg max-h-40 object-contain bg-white/5"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Comparison Chart ──────────────────────────────── */

function EfficiencyComparisonChart({ creatives }: { creatives: any[] }) {
  const chartData = creatives
    .filter((c) => c.isVideo && c.videoMetrics?.videoEfficiencyScore != null)
    .sort((a, b) => (b.videoMetrics?.videoEfficiencyScore || 0) - (a.videoMetrics?.videoEfficiencyScore || 0))
    .slice(0, 10)
    .map((c) => ({
      name: c.name.length > 25 ? c.name.slice(0, 25) + "..." : c.name,
      score: c.videoMetrics.videoEfficiencyScore,
      hookRate: c.videoMetrics.hookRate || 0,
      actionRate: c.videoMetrics.actionRate || 0,
      fill: getScoreColor(c.videoMetrics.videoEfficiencyScore),
    }));

  if (chartData.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 120, right: 20, top: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis type="number" domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 11 }} />
        <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} width={110} />
        <Tooltip
          contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
          labelStyle={{ color: "#e5e7eb" }}
          formatter={(value: number, name: string) => [
            `${value.toFixed(1)}${name === "score" ? "" : "%"}`,
            name === "score" ? "Efficiency Score" : name === "hookRate" ? "Hook Rate" : "Action Rate",
          ]}
        />
        <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={20}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} fillOpacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Diagnosis Distribution ────────────────────────── */

function DiagnosisDistribution({ creatives }: { creatives: any[] }) {
  const counts: Record<string, number> = {};
  creatives.forEach((c) => {
    if (c.isVideo && c.videoMetrics?.dropOffAnalysis?.diagnosis) {
      const d = c.videoMetrics.dropOffAnalysis.diagnosis;
      counts[d] = (counts[d] || 0) + 1;
    }
  });

  const total = Object.values(counts).reduce((s, c) => s + c, 0);
  if (total === 0) return null;

  const data = Object.entries(counts).map(([key, count]) => ({
    name: DIAGNOSIS_CONFIG[key]?.label || key,
    value: count,
    color: key === "STRONG_PERFORMER" ? "#10b981" : key === "WEAK_HOOK" ? "#ef4444" : key === "WEAK_CONTENT" ? "#f59e0b" : "#f97316",
  }));

  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.name} className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
          <span className="text-xs text-gray-400 flex-1">{d.name}</span>
          <span className="text-sm font-bold text-white">{d.value}</span>
          <div className="w-24 bg-white/5 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.value / total) * 100}%`, backgroundColor: d.color }}
            />
          </div>
          <span className="text-[10px] text-gray-500 w-8 text-right">{Math.round((d.value / total) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════ */

export default function CreativesVideoPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<string>("score");
  const [sortAsc, setSortAsc] = useState(false);
  const [filterType, setFilterType] = useState<"ALL" | "VIDEO" | "IMAGE">("VIDEO");

  // Date range
  const [dateFrom, setDateFrom] = useState(toDateInputValue(new Date(Date.now() - 30 * 86400000)));
  const [dateTo, setDateTo] = useState(toDateInputValue(new Date()));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(30);

  /* ── Fetch ─────────────────────────────────────── */
  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics/ads?from=${dateFrom}&to=${dateTo}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  /* ── Date handlers ─────────────────────────────── */
  const handleQuickRange = (days: number) => {
    setDateTo(toDateInputValue(new Date()));
    setDateFrom(toDateInputValue(new Date(Date.now() - days * 86400000)));
    setActiveQuickRange(days);
  };
  const handleDateChange = (type: "from" | "to", v: string) => {
    type === "from" ? setDateFrom(v) : setDateTo(v);
    setActiveQuickRange(null);
  };

  /* ── Derived data ──────────────────────────────── */
  const allCreatives = data?.creatives || [];

  const videoCreatives = useMemo(() =>
    allCreatives.filter((c: any) => c.isVideo && c.videoMetrics),
    [allCreatives]
  );

  const imageCreatives = useMemo(() =>
    allCreatives.filter((c: any) => !c.isVideo),
    [allCreatives]
  );

  const filteredCreatives = useMemo(() => {
    let list = filterType === "VIDEO" ? videoCreatives
      : filterType === "IMAGE" ? imageCreatives
      : allCreatives;

    return [...list].sort((a, b) => {
      let aVal, bVal;
      switch (sortField) {
        case "score":
          aVal = a.videoMetrics?.videoEfficiencyScore ?? -1;
          bVal = b.videoMetrics?.videoEfficiencyScore ?? -1;
          break;
        case "hookRate":
          aVal = a.videoMetrics?.hookRate ?? -1;
          bVal = b.videoMetrics?.hookRate ?? -1;
          break;
        case "actionRate":
          aVal = a.videoMetrics?.actionRate ?? -1;
          bVal = b.videoMetrics?.actionRate ?? -1;
          break;
        case "spend":
          aVal = a.spend; bVal = b.spend; break;
        case "roas":
          aVal = a.roas; bVal = b.roas; break;
        default:
          aVal = a.spend; bVal = b.spend;
      }
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
  }, [allCreatives, videoCreatives, imageCreatives, filterType, sortField, sortAsc]);

  /* ── Aggregated video KPIs ─────────────────────── */
  const videoKpis = useMemo(() => {
    if (videoCreatives.length === 0) return null;
    const totalPlays = videoCreatives.reduce((s: number, c: any) => s + (c.videoMetrics?.videoPlays || 0), 0);
    const totalImpressions = videoCreatives.reduce((s: number, c: any) => s + c.impressions, 0);
    const totalClicks = videoCreatives.reduce((s: number, c: any) => s + c.clicks, 0);
    const totalSpend = videoCreatives.reduce((s: number, c: any) => s + c.spend, 0);
    const totalConvValue = videoCreatives.reduce((s: number, c: any) => s + c.conversionValue, 0);
    const totalP100 = videoCreatives.reduce((s: number, c: any) => s + (c.videoMetrics?.videoP100Watched || 0), 0);

    const scores = videoCreatives
      .map((c: any) => c.videoMetrics?.videoEfficiencyScore)
      .filter((s: any) => s != null && s > 0);
    const avgScore = scores.length > 0 ? scores.reduce((s: number, v: number) => s + v, 0) / scores.length : 0;

    return {
      totalVideos: videoCreatives.length,
      totalPlays,
      avgHookRate: totalImpressions > 0 ? (totalPlays / totalImpressions) * 100 : 0,
      avgActionRate: totalPlays > 0 ? (totalClicks / totalPlays) * 100 : 0,
      avgCompletionRate: totalPlays > 0 ? (totalP100 / totalPlays) * 100 : 0,
      avgScore,
      totalSpend,
      videoRoas: totalSpend > 0 ? totalConvValue / totalSpend : 0,
    };
  }, [videoCreatives]);

  /* ── Loading State ─────────────────────────────── */
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[var(--nitro-orange)] animate-pulse" />
          <p className="text-[var(--nitro-text2)] font-mono text-sm tracking-wider uppercase">
            Cargando creativos...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-6">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Film size={22} className="text-purple-400" />
            Video Efficiency Score
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Analisis de rendimiento de video ads - Hook, retencion y accion
          </p>
        </div>
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          activeQuickRange={activeQuickRange}
          quickRanges={QUICK_RANGES}
          onQuickRange={handleQuickRange}
          onDateChange={handleDateChange}
          loading={loading}
        />
      </div>

      {/* ── KPI Cards ──────────────────────────────── */}
      {videoKpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="bg-[var(--nitro-bg2)] border border-[var(--nitro-border)] rounded-xl p-3 text-center">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Videos</span>
            <span className="text-xl font-bold text-white">{videoKpis.totalVideos}</span>
          </div>
          <div className="bg-[var(--nitro-bg2)] border border-[var(--nitro-border)] rounded-xl p-3 text-center">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Plays</span>
            <span className="text-xl font-bold text-white">{formatCompact(videoKpis.totalPlays)}</span>
          </div>
          <div className="bg-[var(--nitro-bg2)] border border-[var(--nitro-border)] rounded-xl p-3 text-center">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Avg Score</span>
            <span className="text-xl font-bold" style={{ color: getScoreColor(videoKpis.avgScore) }}>
              {videoKpis.avgScore.toFixed(1)}
            </span>
          </div>
          <div className="bg-[var(--nitro-bg2)] border border-[var(--nitro-border)] rounded-xl p-3 text-center">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Hook Rate</span>
            <span className="text-xl font-bold text-purple-400">{videoKpis.avgHookRate.toFixed(1)}%</span>
          </div>
          <div className="bg-[var(--nitro-bg2)] border border-[var(--nitro-border)] rounded-xl p-3 text-center">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Action Rate</span>
            <span className="text-xl font-bold text-blue-400">{videoKpis.avgActionRate.toFixed(1)}%</span>
          </div>
          <div className="bg-[var(--nitro-bg2)] border border-[var(--nitro-border)] rounded-xl p-3 text-center">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Completion</span>
            <span className="text-xl font-bold text-cyan-400">{videoKpis.avgCompletionRate.toFixed(1)}%</span>
          </div>
          <div className="bg-[var(--nitro-bg2)] border border-[var(--nitro-border)] rounded-xl p-3 text-center">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Spend</span>
            <span className="text-xl font-bold text-white">{formatARS(videoKpis.totalSpend)}</span>
          </div>
          <div className="bg-[var(--nitro-bg2)] border border-[var(--nitro-border)] rounded-xl p-3 text-center">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Video ROAS</span>
            <span className={`text-xl font-bold ${videoKpis.videoRoas >= 3 ? "text-emerald-400" : videoKpis.videoRoas >= 1.5 ? "text-amber-400" : "text-red-400"}`}>
              {videoKpis.videoRoas.toFixed(1)}x
            </span>
          </div>
        </div>
      )}

      {/* ── Charts Row ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Score ranking chart */}
        <div className="bg-[var(--nitro-bg2)] border border-[var(--nitro-border)] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <BarChart3 size={16} className="text-purple-400" />
            Ranking — Video Efficiency Score
          </h3>
          <EfficiencyComparisonChart creatives={allCreatives} />
          {videoCreatives.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No hay video ads con datos suficientes</p>
          )}
        </div>

        {/* Diagnosis distribution */}
        <div className="bg-[var(--nitro-bg2)] border border-[var(--nitro-border)] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Activity size={16} className="text-amber-400" />
            Diagnostico de Videos
          </h3>
          <DiagnosisDistribution creatives={allCreatives} />
          {videoCreatives.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No hay diagnosticos disponibles</p>
          )}

          {/* Legend / explanation */}
          <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Como se calcula el score</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white/5 rounded-lg p-2">
                <span className="text-lg font-bold text-purple-400">25%</span>
                <span className="text-[10px] text-gray-500 block">Hook Rate</span>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <span className="text-lg font-bold text-blue-400">50%</span>
                <span className="text-[10px] text-gray-500 block">Action Rate</span>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <span className="text-lg font-bold text-emerald-400">25%</span>
                <span className="text-[10px] text-gray-500 block">Conv Rate</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-600 leading-relaxed">
              El Action Rate pesa 50% porque un click antes de ver el 100% es la mejor senal: el hook funciono y la persona actuo.
            </p>
          </div>
        </div>
      </div>

      {/* ── Filters & Sort ─────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-1 bg-[var(--nitro-bg2)] border border-[var(--nitro-border)] rounded-lg p-0.5">
          {(["VIDEO", "IMAGE", "ALL"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterType === t
                  ? "bg-[var(--nitro-orange)] text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "VIDEO" ? "Video" : t === "IMAGE" ? "Imagen" : "Todos"}
              <span className="ml-1 opacity-60">
                ({t === "VIDEO" ? videoCreatives.length : t === "IMAGE" ? imageCreatives.length : allCreatives.length})
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span>Ordenar:</span>
          {[
            { key: "score", label: "Score" },
            { key: "spend", label: "Spend" },
            { key: "roas", label: "ROAS" },
            { key: "hookRate", label: "Hook" },
            { key: "actionRate", label: "Action" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => {
                if (sortField === s.key) setSortAsc(!sortAsc);
                else { setSortField(s.key); setSortAsc(false); }
              }}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                sortField === s.key
                  ? "bg-white/10 text-white font-medium"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {s.label}
              {sortField === s.key && (sortAsc ? " ↑" : " ↓")}
            </button>
          ))}
        </div>
      </div>

      {/* ── Creative Cards ─────────────────────────── */}
      {filterType === "VIDEO" || filterType === "ALL" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredCreatives
            .filter((c: any) => filterType === "ALL" ? c.isVideo : true)
            .map((c: any, i: number) => (
              <VideoCreativeCard key={c.id} creative={c} rank={i + 1} />
            ))}
        </div>
      ) : null}

      {/* Image ads table (simpler) */}
      {(filterType === "IMAGE" || filterType === "ALL") && (
        <div className="bg-[var(--nitro-bg2)] border border-[var(--nitro-border)] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Image size={16} className="text-blue-400" />
              Creativos de Imagen
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase border-b border-white/5">
                  <th className="text-left px-4 py-2">#</th>
                  <th className="text-left px-4 py-2">Nombre</th>
                  <th className="text-right px-4 py-2">Spend</th>
                  <th className="text-right px-4 py-2">Impr</th>
                  <th className="text-right px-4 py-2">Clicks</th>
                  <th className="text-right px-4 py-2">CTR</th>
                  <th className="text-right px-4 py-2">Conv</th>
                  <th className="text-right px-4 py-2">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {filteredCreatives
                  .filter((c: any) => filterType === "ALL" ? !c.isVideo : true)
                  .map((c: any, i: number) => (
                    <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                      <td className="px-4 py-2 text-white font-medium truncate max-w-[250px]">{c.name}</td>
                      <td className="px-4 py-2 text-right text-gray-300">{formatARS(c.spend)}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{formatCompact(c.impressions)}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{formatCompact(c.clicks)}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{c.ctr}%</td>
                      <td className="px-4 py-2 text-right text-gray-300">{c.conversions}</td>
                      <td className="px-4 py-2 text-right">
                        <span className={`font-bold ${c.roas >= 3 ? "text-emerald-400" : c.roas >= 1.5 ? "text-amber-400" : "text-red-400"}`}>
                          {c.roas}x
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {allCreatives.length === 0 && !loading && (
        <div className="text-center py-16">
          <Film size={48} className="mx-auto text-gray-700 mb-3" />
          <p className="text-gray-500 text-sm">No se encontraron creativos en el periodo seleccionado</p>
          <p className="text-gray-600 text-xs mt-1">Probad sincronizar Meta Ads primero</p>
        </div>
      )}
    </div>
  );
}

