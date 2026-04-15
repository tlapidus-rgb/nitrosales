// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import { KpiCard, DateRangeFilter } from "@/components/dashboard";
import { useSyncStatus } from "@/lib/hooks/useSyncStatus";
import { useBreakeven } from "@/lib/hooks/useBreakeven";
import { BreakevenChip } from "@/components/campaigns/BreakevenChip";
import {
  DollarSign, Eye, MousePointer, ShoppingCart, Target, Zap,
  ArrowUp, ArrowDown, Download, TrendingUp, BarChart3,
  ArrowUpRight, ArrowDownRight, AlertTriangle, Search,
  ShoppingBag, Tv, Star, GripVertical, Layers, Activity,
  Palette, Tag, Film, Sparkles, ChevronRight, ChevronDown,
  Megaphone, LayoutGrid, Image, RefreshCw,
} from "lucide-react";

/* ── Constants ─────────────────────────────────────── */

const QUICK_RANGES = [
  { label: "7 dias", days: 7 },
  { label: "14 dias", days: 14 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

function toDateInputValue(d: Date) { return d.toISOString().split("T")[0]; }

const CAMPAIGN_TYPE_ICONS: Record<string, { icon: any; color: string; label: string }> = {
  SEARCH: { icon: Search, color: "#3b82f6", label: "Search" },
  SHOPPING: { icon: ShoppingBag, color: "#10b981", label: "Shopping" },
  PERFORMANCE_MAX: { icon: Zap, color: "#f59e0b", label: "PMax" },
  DISPLAY: { icon: Tv, color: "#8b5cf6", label: "Display" },
  VIDEO: { icon: Tv, color: "#ef4444", label: "YouTube" },
};

const FUNNEL_STAGES = [
  { key: "TOF", label: "Top of Funnel", sublabel: "Awareness & Reach", color: "#8b5cf6", bgColor: "bg-purple-50", borderColor: "border-purple-200", textColor: "text-purple-700" },
  { key: "MOF", label: "Mid Funnel", sublabel: "Consideration & Traffic", color: "#3b82f6", bgColor: "bg-blue-50", borderColor: "border-blue-200", textColor: "text-blue-700" },
  { key: "BOF", label: "Bottom of Funnel", sublabel: "Conversions & Sales", color: "#10b981", bgColor: "bg-green-50", borderColor: "border-green-200", textColor: "text-green-700" },
];

/* ── Small Components ──────────────────────────────── */

function RoasBadge({ value }: { value: number }) {
  const color = value >= 3 ? "text-green-600 bg-green-50" : value >= 1.5 ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";
  return <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${color}`}>{value}x</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    PAUSED: "bg-amber-100 text-amber-700",
    REMOVED: "bg-red-100 text-red-600",
    ENABLED: "bg-green-100 text-green-700",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${colors[status] || "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

function QualityScoreBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-400">--</span>;
  const pct = (score / 10) * 100;
  const color = score >= 7 ? "#10b981" : score >= 5 ? "#f59e0b" : "#ef4444";
  const label = score >= 7 ? "Bueno" : score >= 5 ? "Regular" : "Bajo";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-gray-100 rounded-full h-1.5">
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold" style={{ color }}>{score.toFixed(1)}</span>
    </div>
  );
}

function ImpressionShareBar({ share }: { share: number | null }) {
  if (share === null) return <span className="text-xs text-gray-400">--</span>;
  const pct = Math.min(share * 100, 100);
  const color = pct >= 50 ? "#10b981" : pct >= 25 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-gray-100 rounded-full h-1.5">
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold" style={{ color }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

function FunnelStageBadge({ stage }: { stage: string }) {
  const cfg = FUNNEL_STAGES.find((f) => f.key === stage);
  if (!cfg) return <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">--</span>;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.bgColor} ${cfg.textColor}`}>
      {cfg.key}
    </span>
  );
}

function CampaignTypeBadge({ objective }: { objective: string | null }) {
  const type = detectCampaignType(objective);
  const cfg = CAMPAIGN_TYPE_ICONS[type] || CAMPAIGN_TYPE_ICONS.SEARCH;
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">
      <Icon size={10} style={{ color: cfg.color }} />
      {cfg.label}
    </span>
  );
}

function detectCampaignType(objective: string | null): string {
  const obj = (objective || "").toUpperCase();
  if (/SHOPPING|CATALOG|PRODUCT/.test(obj)) return "SHOPPING";
  if (/PERFORMANCE.MAX|PMAX/.test(obj)) return "PERFORMANCE_MAX";
  if (/DISPLAY|BANNER/.test(obj)) return "DISPLAY";
  if (/VIDEO|YOUTUBE/.test(obj)) return "VIDEO";
  return "SEARCH";
}

/* ── Funnel Drop Zone (same as Meta but for Google) ── */

function FunnelBoard({ campaigns, funnelSummary, onAssign }: {
  campaigns: any[];
  funnelSummary: any[];
  onAssign: (campaignId: string, stage: string) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = { TOF: [], MOF: [], BOF: [], UNKNOWN: [] };
    campaigns.forEach((c) => {
      const stage = c.funnelStage || "UNKNOWN";
      if (!map[stage]) map[stage] = [];
      map[stage].push(c);
    });
    return map;
  }, [campaigns]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Layers size={18} className="text-blue-600" />
            Funnel de Campanas Google
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">Arrastra campanas entre etapas del funnel para clasificarlas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {FUNNEL_STAGES.map((stage) => {
          const summary = funnelSummary.find((f: any) => f.stage === stage.key);
          const stageCampaigns = grouped[stage.key] || [];
          const isDragOver = dragOverStage === stage.key;
          return (
            <div
              key={stage.key}
              onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.key); }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => { e.preventDefault(); if (draggedId) onAssign(draggedId, stage.key); setDraggedId(null); setDragOverStage(null); }}
              className={`rounded-xl border-2 transition-all duration-200 ${
                isDragOver ? `${stage.borderColor} shadow-lg scale-[1.01]` : "border-gray-100"
              } ${stage.bgColor} bg-opacity-30`}
            >
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className={`font-semibold text-sm ${stage.textColor}`}>{stage.label}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{stageCampaigns.length}</span>
                </div>
                <p className="text-[10px] text-gray-500">{stage.sublabel}</p>
                {summary && (
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-2 border-t border-gray-100">
                    <div className="text-center">
                      <p className="text-[9px] text-gray-400 uppercase">Gasto</p>
                      <p className="text-xs font-bold text-gray-800">{formatCompact(summary.spend)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-gray-400 uppercase">ROAS</p>
                      <p className="text-xs font-bold" style={{ color: stage.color }}>{summary.roas}x</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-gray-400 uppercase">Conv.</p>
                      <p className="text-xs font-bold text-gray-800">{summary.conversions}</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-3 space-y-2 max-h-[250px] overflow-y-auto">
                {stageCampaigns.length === 0 && (
                  <div className={`border-2 border-dashed rounded-lg p-4 text-center ${stage.borderColor}`}>
                    <p className="text-xs text-gray-400">Arrastra campanas aqui</p>
                  </div>
                )}
                {stageCampaigns.map((c: any) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => { setDraggedId(c.id); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { setDraggedId(null); setDragOverStage(null); }}
                    className={`bg-white rounded-lg border border-gray-200 p-2.5 cursor-grab active:cursor-grabbing hover:shadow-md transition-all group ${
                      draggedId === c.id ? "opacity-40 scale-95" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical size={14} className="text-gray-300 mt-0.5 flex-shrink-0 group-hover:text-gray-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-900 truncate" title={c.name}>{c.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-500">{formatARS(c.spend)}</span>
                          <RoasBadge value={c.roas} />
                          <CampaignTypeBadge objective={c.objective} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unassigned */}
      {(grouped.UNKNOWN || []).length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            <AlertTriangle size={12} className="text-amber-500" />
            {grouped.UNKNOWN.length} sin clasificar
          </p>
          <div className="flex flex-wrap gap-2">
            {grouped.UNKNOWN.map((c: any) => (
              <div
                key={c.id}
                draggable
                onDragStart={(e) => { setDraggedId(c.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={() => { setDraggedId(null); setDragOverStage(null); }}
                className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2 cursor-grab active:cursor-grabbing hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-2">
                  <GripVertical size={12} className="text-gray-300" />
                  <span className="text-xs font-medium text-gray-700 truncate max-w-[180px]">{c.name}</span>
                  <span className="text-[10px] text-gray-400">{formatARS(c.spend)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Campaign Type Breakdown ─────────────────────── */

function CampaignTypeBreakdown({ campaigns }: { campaigns: any[] }) {
  const grouped = useMemo(() => {
    const map: Record<string, { spend: number; impressions: number; clicks: number; conversions: number; conversionValue: number; count: number }> = {};
    campaigns.forEach((c) => {
      const type = detectCampaignType(c.objective);
      if (!map[type]) map[type] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0, count: 0 };
      map[type].spend += c.spend;
      map[type].impressions += c.impressions;
      map[type].clicks += c.clicks;
      map[type].conversions += c.conversions;
      map[type].conversionValue += c.conversionValue;
      map[type].count++;
    });
    return Object.entries(map)
      .map(([type, v]) => ({
        type,
        ...v,
        roas: v.spend > 0 ? Math.round((v.conversionValue / v.spend) * 100) / 100 : 0,
        ctr: v.impressions > 0 ? Math.round((v.clicks / v.impressions) * 10000) / 100 : 0,
        cpc: v.clicks > 0 ? Math.round((v.spend / v.clicks) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [campaigns]);

  if (grouped.length === 0) return null;

  const totalSpend = grouped.reduce((s, g) => s + g.spend, 0);
  const pieData = grouped.map((g) => ({
    name: (CAMPAIGN_TYPE_ICONS[g.type] || CAMPAIGN_TYPE_ICONS.SEARCH).label,
    value: g.spend,
    color: (CAMPAIGN_TYPE_ICONS[g.type] || CAMPAIGN_TYPE_ICONS.SEARCH).color,
  }));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <BarChart3 size={18} className="text-blue-600" />
        Desglose por Tipo de Campana
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pie chart */}
        <div className="flex items-center justify-center">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData} dataKey="value" nameKey="name"
                cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                paddingAngle={2}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatARS(v)} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Type cards */}
        <div className="lg:col-span-2 space-y-3">
          {grouped.map((g) => {
            const cfg = CAMPAIGN_TYPE_ICONS[g.type] || CAMPAIGN_TYPE_ICONS.SEARCH;
            const Icon = cfg.icon;
            const pct = totalSpend > 0 ? ((g.spend / totalSpend) * 100).toFixed(1) : "0";
            return (
              <div key={g.type} className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={16} style={{ color: cfg.color }} />
                  <span className="text-sm font-semibold text-gray-900">{cfg.label}</span>
                  <span className="text-[10px] text-gray-400">{g.count} campanas</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{pct}% del gasto</span>
                </div>
                <div className="grid grid-cols-5 gap-3 text-center">
                  <div>
                    <p className="text-[9px] text-gray-400 uppercase">Gasto</p>
                    <p className="text-xs font-bold text-gray-800">{formatCompact(g.spend)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-400 uppercase">ROAS</p>
                    <p className={`text-xs font-bold ${g.roas >= 2 ? "text-green-600" : g.roas >= 1 ? "text-amber-600" : "text-red-600"}`}>{g.roas}x</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-400 uppercase">Conv.</p>
                    <p className="text-xs font-bold text-gray-800">{g.conversions}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-400 uppercase">CTR</p>
                    <p className="text-xs font-bold text-gray-800">{g.ctr}%</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-400 uppercase">CPC</p>
                    <p className="text-xs font-bold text-gray-800">{formatARS(g.cpc)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Quality Score Summary ──────────────────────── */

function QualityScoreSummary({ campaigns }: { campaigns: any[] }) {
  const withQS = campaigns.filter((c) => c.qualityScore !== null);
  if (withQS.length === 0) return null;

  const avgQS = withQS.reduce((s, c) => s + c.qualityScore, 0) / withQS.length;
  const highQS = withQS.filter((c) => c.qualityScore >= 7).length;
  const midQS = withQS.filter((c) => c.qualityScore >= 5 && c.qualityScore < 7).length;
  const lowQS = withQS.filter((c) => c.qualityScore < 5).length;

  const barData = [
    { name: "Alto (7-10)", value: highQS, color: "#10b981" },
    { name: "Medio (5-6)", value: midQS, color: "#f59e0b" },
    { name: "Bajo (1-4)", value: lowQS, color: "#ef4444" },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Star size={18} className="text-amber-500" />
        Quality Score
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="text-center mb-4">
            <p className="text-4xl font-bold" style={{ color: avgQS >= 7 ? "#10b981" : avgQS >= 5 ? "#f59e0b" : "#ef4444" }}>
              {avgQS.toFixed(1)}
            </p>
            <p className="text-xs text-gray-400">Promedio ({withQS.length} campanas)</p>
          </div>
          <div className="space-y-2">
            {barData.map((d) => (
              <div key={d.name} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-xs text-gray-600 flex-1">{d.name}</span>
                <span className="text-xs font-bold text-gray-900">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={barData}>
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {barData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-400 mt-2">
            Quality Score alto (7+) reduce tu CPC en 30-50%. Campanas con score bajo necesitan mejoras en landing page, relevancia de anuncio o CTR esperado.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Google Creatives — components specific to Google ad types ── */

const PREMIUM_SHADOW = "0 1px 0 rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.12), 0 22px 40px -28px rgba(15,23,42,0.10)";

function CreativeKpiCard({ label, value, sublabel, icon, color }: {
  label: string; value: string; sublabel?: string; icon: any; color: string;
}) {
  const Icon = icon;
  return (
    <div
      className="bg-white rounded-2xl p-5 transition-all duration-200 hover:translate-y-[-2px]"
      style={{
        border: "1px solid rgba(15,23,42,0.06)",
        boxShadow: PREMIUM_SHADOW,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500">{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}14` }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">{value}</p>
      {sublabel && <p className="text-xs text-slate-500 mt-1 tabular-nums">{sublabel}</p>}
    </div>
  );
}

function GoogleTypeChip({ type, label, count, color, active, onClick, icon }: {
  type: string; label: string; count: number; color: string; active: boolean; onClick: () => void; icon: any;
}) {
  const Icon = icon;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium border transition-all duration-200"
      style={{
        backgroundColor: active ? color : "#ffffff",
        borderColor: active ? color : "rgba(15,23,42,0.08)",
        color: active ? "#ffffff" : "#334155",
        boxShadow: active
          ? `0 4px 14px -4px ${color}40`
          : "0 1px 0 rgba(15,23,42,0.04)",
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <Icon size={13} style={{ color: active ? "#ffffff" : color }} />
      <span className="tracking-tight">{label}</span>
      <span
        className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md"
        style={{
          backgroundColor: active ? "rgba(255,255,255,0.22)" : "rgba(15,23,42,0.06)",
          color: active ? "#ffffff" : "#475569",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function MetricChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-start min-w-0">
      <span className="text-[9px] font-semibold tracking-[0.16em] uppercase text-slate-400">{label}</span>
      <span className="text-xs font-bold tabular-nums truncate" style={{ color: color || "#0f172a" }}>{value}</span>
    </div>
  );
}

/* ── Search Ad Card — looks like a Google SERP result ── */
function SearchAdCard({ ad }: { ad: any }) {
  const headline = ad.headline || ad.name || "Sin titulo";
  const description = ad.description || "Sin descripcion";
  const displayUrl = (ad.campaignName || "").toLowerCase().includes("brand") ? "elmundodeljuguete.com.ar" : "tu-sitio.com.ar";
  const roasColor = ad.roas >= 3 ? "#10b981" : ad.roas >= 1.5 ? "#f59e0b" : "#ef4444";

  return (
    <div
      className="bg-white rounded-2xl p-5 transition-all duration-200 hover:translate-y-[-1px]"
      style={{
        border: "1px solid rgba(15,23,42,0.06)",
        boxShadow: PREMIUM_SHADOW,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* SERP preview */}
      <div className="pb-4 mb-4 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-bold tracking-wider text-slate-500">PATROCINADO</span>
          <span className="text-[11px] text-slate-400">·</span>
          <span className="text-[12px] text-slate-600">{displayUrl}</span>
          <StatusBadge status={ad.status} />
        </div>
        <p
          className="text-[18px] font-medium leading-snug tracking-tight cursor-pointer hover:underline"
          style={{ color: "#1a0dab", fontFamily: "Inter, -apple-system, sans-serif" }}
          title={headline}
        >
          {headline}
        </p>
        <p className="text-[13px] text-slate-700 leading-relaxed mt-1.5 line-clamp-2">{description}</p>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <MetricChip label="Inversion" value={formatCompact(ad.spend)} />
        <MetricChip label="Impr." value={formatCompact(ad.impressions)} />
        <MetricChip label="Clicks" value={formatCompact(ad.clicks)} />
        <MetricChip label="CTR" value={`${ad.ctr}%`} />
        <MetricChip label="Conv." value={String(ad.conversions)} />
        <MetricChip label="ROAS" value={`${ad.roas}x`} color={roasColor} />
      </div>

      {/* Campaign + AdGroup context */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-[10px]">
        <Search size={10} className="text-slate-400" />
        <span className="text-slate-500 truncate flex-1" title={ad.campaignName}>{ad.campaignName}</span>
        {ad.adSetName && (
          <>
            <ChevronRight size={10} className="text-slate-300" />
            <span className="text-slate-500 truncate" title={ad.adSetName}>{ad.adSetName}</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── PMax Campaign Card — asset-group oriented since PMax has no individual ads ── */
function PMaxCampaignCard({ campaign, ads }: { campaign: any; ads: any[] }) {
  const totalSpend = campaign.spend || 0;
  const totalConv = campaign.conversions || 0;
  const roas = campaign.roas || 0;
  const ctr = campaign.ctr || 0;
  const conv = campaign.convRate || (campaign.clicks > 0 ? Math.round((totalConv / campaign.clicks) * 10000) / 100 : 0);
  const roasColor = roas >= 3 ? "#10b981" : roas >= 1.5 ? "#f59e0b" : "#ef4444";

  return (
    <div
      className="bg-white rounded-2xl p-5 transition-all duration-200 hover:translate-y-[-1px]"
      style={{
        border: "1px solid rgba(15,23,42,0.06)",
        boxShadow: PREMIUM_SHADOW,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div className="flex items-start gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)" }}
        >
          <Zap size={18} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-amber-600">Performance Max</span>
            <StatusBadge status={campaign.status || "ENABLED"} />
          </div>
          <p className="font-semibold text-slate-900 text-sm tracking-tight truncate" title={campaign.name}>
            {campaign.name}
          </p>
        </div>
      </div>

      {/* PMax KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-[9px] font-semibold tracking-[0.16em] uppercase text-slate-500 mb-1">Inversion</p>
          <p className="text-base font-bold tabular-nums tracking-tight text-slate-900">{formatARS(totalSpend)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-[9px] font-semibold tracking-[0.16em] uppercase text-slate-500 mb-1">Conversiones</p>
          <p className="text-base font-bold tabular-nums tracking-tight text-slate-900">{totalConv}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-[9px] font-semibold tracking-[0.16em] uppercase text-slate-500 mb-1">ROAS</p>
          <p className="text-base font-bold tabular-nums tracking-tight" style={{ color: roasColor }}>{roas}x</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-[9px] font-semibold tracking-[0.16em] uppercase text-slate-500 mb-1">CTR</p>
          <p className="text-base font-bold tabular-nums tracking-tight text-slate-900">{ctr}%</p>
        </div>
      </div>

      {/* Asset insight bar */}
      <div className="rounded-xl p-3" style={{ background: "linear-gradient(90deg, #fef3c7 0%, #ffedd5 100%)" }}>
        <div className="flex items-start gap-2.5">
          <Sparkles size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-amber-900 mb-0.5">Asset-based: sin anuncios individuales</p>
            <p className="text-[10px] text-amber-800/80 leading-relaxed">
              Performance Max optimiza assets (texto, imagen, video) en todas las superficies de Google.
              Para mejorar performance, sumá <b>5 headlines + 5 descriptions + 4 imagenes + 1 logo + signals de audiencia</b> en Google Ads.
            </p>
          </div>
        </div>
      </div>

      {ads.length > 0 && (
        <div className="mt-3 text-[10px] text-slate-400 text-center">
          {ads.length} asset{ads.length === 1 ? "" : "s"} sincronizado{ads.length === 1 ? "" : "s"} · {formatCompact(campaign.impressions)} impresiones
        </div>
      )}
    </div>
  );
}

/* ── Display Ad Card — visual grid (image + text) ── */
function DisplayAdCard({ ad }: { ad: any }) {
  const headline = ad.headline || ad.name || "Sin titulo";
  const description = ad.description || "";
  const imageUrl = Array.isArray(ad.mediaUrls) && ad.mediaUrls.length > 0 ? ad.mediaUrls[0] : null;
  const roasColor = ad.roas >= 3 ? "#10b981" : ad.roas >= 1.5 ? "#f59e0b" : "#ef4444";

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden transition-all duration-200 hover:translate-y-[-1px]"
      style={{
        border: "1px solid rgba(15,23,42,0.06)",
        boxShadow: PREMIUM_SHADOW,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Image area */}
      <div className="relative aspect-[4/3] bg-gradient-to-br from-violet-100 via-purple-50 to-indigo-100 flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={headline} className="w-full h-full object-cover" />
        ) : (
          <div className="text-center px-5">
            <Tv size={28} className="text-violet-400 mx-auto mb-2" />
            <p className="text-[10px] font-medium text-violet-700/70 leading-snug line-clamp-3">{headline}</p>
          </div>
        )}
        <div className="absolute top-2 left-2">
          <span className="text-[9px] font-bold tracking-wider uppercase px-2 py-1 rounded-md bg-violet-600 text-white">Display</span>
        </div>
        <div className="absolute top-2 right-2">
          <StatusBadge status={ad.status} />
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <p className="text-sm font-semibold text-slate-900 tracking-tight line-clamp-2 mb-1" title={headline}>{headline}</p>
        {description && <p className="text-[11px] text-slate-500 line-clamp-2 mb-3">{description}</p>}

        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
          <MetricChip label="Inversion" value={formatCompact(ad.spend)} />
          <MetricChip label="CTR" value={`${ad.ctr}%`} />
          <MetricChip label="ROAS" value={`${ad.roas}x`} color={roasColor} />
        </div>

        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px] text-slate-500">
          <Tv size={10} className="text-violet-400" />
          <span className="truncate" title={ad.campaignName}>{ad.campaignName}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Shopping Card — product feed style ── */
function ShoppingAdCard({ ad }: { ad: any }) {
  const roasColor = ad.roas >= 3 ? "#10b981" : ad.roas >= 1.5 ? "#f59e0b" : "#ef4444";
  return (
    <div
      className="bg-white rounded-2xl p-4 transition-all duration-200 hover:translate-y-[-1px]"
      style={{
        border: "1px solid rgba(15,23,42,0.06)",
        boxShadow: PREMIUM_SHADOW,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
          <ShoppingBag size={16} className="text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-emerald-700">Shopping</span>
            <StatusBadge status={ad.status} />
          </div>
          <p className="text-sm font-semibold text-slate-900 tracking-tight truncate mt-0.5">{ad.name || "Listing Group"}</p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <MetricChip label="Inv." value={formatCompact(ad.spend)} />
        <MetricChip label="Clicks" value={formatCompact(ad.clicks)} />
        <MetricChip label="Conv." value={String(ad.conversions)} />
        <MetricChip label="ROAS" value={`${ad.roas}x`} color={roasColor} />
      </div>
    </div>
  );
}

/* ── Master Table — Google-specific columns ── */
function GoogleCreativeMasterTable({ creatives }: { creatives: any[] }) {
  if (creatives.length === 0) return null;
  return (
    <div
      className="bg-white rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(15,23,42,0.06)", boxShadow: PREMIUM_SHADOW }}
    >
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            <Film size={14} className="text-slate-500" />
            Tabla completa
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{creatives.length} anuncio{creatives.length === 1 ? "" : "s"} con datos en el periodo</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100" style={{ backgroundColor: "#fbfbfd" }}>
              <th className="px-4 py-3 text-left text-[10px] font-semibold tracking-[0.16em] uppercase text-slate-500">Anuncio</th>
              <th className="px-3 py-3 text-center text-[10px] font-semibold tracking-[0.16em] uppercase text-slate-500">Tipo</th>
              <th className="px-3 py-3 text-right text-[10px] font-semibold tracking-[0.16em] uppercase text-slate-500">Inv.</th>
              <th className="px-3 py-3 text-right text-[10px] font-semibold tracking-[0.16em] uppercase text-slate-500">Impr.</th>
              <th className="px-3 py-3 text-right text-[10px] font-semibold tracking-[0.16em] uppercase text-slate-500">Clicks</th>
              <th className="px-3 py-3 text-right text-[10px] font-semibold tracking-[0.16em] uppercase text-slate-500">CTR</th>
              <th className="px-3 py-3 text-right text-[10px] font-semibold tracking-[0.16em] uppercase text-slate-500">CPC</th>
              <th className="px-3 py-3 text-right text-[10px] font-semibold tracking-[0.16em] uppercase text-slate-500">Conv.</th>
              <th className="px-3 py-3 text-right text-[10px] font-semibold tracking-[0.16em] uppercase text-slate-500">CPA</th>
              <th className="px-3 py-3 text-center text-[10px] font-semibold tracking-[0.16em] uppercase text-slate-500">ROAS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {creatives.map((ad: any) => {
              const ctype = detectCampaignType(ad.campaignObjective);
              const cfg = CAMPAIGN_TYPE_ICONS[ctype] || CAMPAIGN_TYPE_ICONS.SEARCH;
              const Icon = cfg.icon;
              return (
                <tr key={ad.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 tracking-tight truncate max-w-[260px]" title={ad.headline || ad.name}>
                      {ad.headline || ad.name || "Sin titulo"}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[260px]" title={ad.campaignName}>{ad.campaignName}</div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md" style={{ backgroundColor: `${cfg.color}14`, color: cfg.color }}>
                      <Icon size={10} />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-slate-700 tabular-nums font-medium">{formatARS(ad.spend)}</td>
                  <td className="px-3 py-3 text-right text-slate-600 tabular-nums">{formatCompact(ad.impressions)}</td>
                  <td className="px-3 py-3 text-right text-slate-600 tabular-nums">{formatCompact(ad.clicks)}</td>
                  <td className="px-3 py-3 text-right text-slate-600 tabular-nums">{ad.ctr}%</td>
                  <td className="px-3 py-3 text-right text-slate-600 tabular-nums">{formatARS(ad.cpc)}</td>
                  <td className="px-3 py-3 text-right text-slate-600 tabular-nums">{ad.conversions}</td>
                  <td className="px-3 py-3 text-right text-slate-600 tabular-nums">{formatARS(ad.costPerConversion)}</td>
                  <td className="px-3 py-3 text-center"><RoasBadge value={ad.roas} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Google Creatives View — main creative tab content ── */
function GoogleCreativesView({ adsData, campaigns }: { adsData: any; campaigns: any[] }) {
  const [selectedType, setSelectedType] = useState<string>("ALL");

  // Group creatives by campaign type
  const byType = useMemo(() => {
    const map: Record<string, any[]> = { SEARCH: [], PERFORMANCE_MAX: [], DISPLAY: [], SHOPPING: [], VIDEO: [] };
    (adsData?.creatives || []).forEach((c: any) => {
      const t = detectCampaignType(c.campaignObjective);
      if (!map[t]) map[t] = [];
      map[t].push(c);
    });
    return map;
  }, [adsData]);

  // Group campaigns by type (for PMax view which is campaign-level)
  const campaignsByType = useMemo(() => {
    const map: Record<string, any[]> = { SEARCH: [], PERFORMANCE_MAX: [], DISPLAY: [], SHOPPING: [], VIDEO: [] };
    (campaigns || []).forEach((c: any) => {
      const t = detectCampaignType(c.objective);
      if (!map[t]) map[t] = [];
      map[t].push(c);
    });
    return map;
  }, [campaigns]);

  const allCreatives = adsData?.creatives || [];
  const totalSpend = allCreatives.reduce((s: number, c: any) => s + (c.spend || 0), 0);
  const totalImpr = allCreatives.reduce((s: number, c: any) => s + (c.impressions || 0), 0);
  const totalClicks = allCreatives.reduce((s: number, c: any) => s + (c.clicks || 0), 0);
  const avgCtr = totalImpr > 0 ? Math.round((totalClicks / totalImpr) * 10000) / 100 : 0;
  const bestRoas = allCreatives.reduce((m: number, c: any) => Math.max(m, c.roas || 0), 0);
  const activeCount = allCreatives.filter((c: any) => c.status === "ENABLED" || c.status === "ACTIVE").length;

  // Visible types (only those with ads OR campaigns)
  const typeOrder = ["SEARCH", "PERFORMANCE_MAX", "DISPLAY", "SHOPPING", "VIDEO"];
  const visibleTypes = typeOrder.filter((t) => (byType[t]?.length || 0) > 0 || (campaignsByType[t]?.length || 0) > 0);

  const filteredCreatives = selectedType === "ALL"
    ? allCreatives
    : (byType[selectedType] || []);

  return (
    <div className="space-y-6">
      {/* ── 1. KPI strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <CreativeKpiCard
          label="Anuncios activos"
          value={String(activeCount)}
          sublabel={`${allCreatives.length} total con datos`}
          icon={Activity}
          color="#06b6d4"
        />
        <CreativeKpiCard
          label="Inversion total"
          value={formatARS(totalSpend)}
          sublabel={`${formatCompact(totalImpr)} impresiones`}
          icon={DollarSign}
          color="#6366f1"
        />
        <CreativeKpiCard
          label="Mejor ROAS"
          value={`${bestRoas.toFixed(2)}x`}
          sublabel={bestRoas >= 3 ? "Performance excelente" : bestRoas >= 1.5 ? "Performance positiva" : "Optimizar"}
          icon={Target}
          color={bestRoas >= 3 ? "#10b981" : bestRoas >= 1.5 ? "#f59e0b" : "#ef4444"}
        />
        <CreativeKpiCard
          label="CTR promedio"
          value={`${avgCtr}%`}
          sublabel={`${formatCompact(totalClicks)} clicks`}
          icon={MousePointer}
          color="#f97316"
        />
      </div>

      {/* ── 2. Type selector ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setSelectedType("ALL")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium border transition-all duration-200"
          style={{
            backgroundColor: selectedType === "ALL" ? "#0f172a" : "#ffffff",
            borderColor: selectedType === "ALL" ? "#0f172a" : "rgba(15,23,42,0.08)",
            color: selectedType === "ALL" ? "#ffffff" : "#334155",
            boxShadow: selectedType === "ALL" ? "0 4px 14px -4px rgba(15,23,42,0.4)" : "0 1px 0 rgba(15,23,42,0.04)",
            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <LayoutGrid size={13} />
          <span className="tracking-tight">Todos</span>
          <span
            className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md"
            style={{
              backgroundColor: selectedType === "ALL" ? "rgba(255,255,255,0.22)" : "rgba(15,23,42,0.06)",
              color: selectedType === "ALL" ? "#ffffff" : "#475569",
            }}
          >
            {allCreatives.length}
          </span>
        </button>
        {visibleTypes.map((t) => {
          const cfg = CAMPAIGN_TYPE_ICONS[t] || CAMPAIGN_TYPE_ICONS.SEARCH;
          // For PMax show campaign count (since it has no ads); others show ad count
          const count = t === "PERFORMANCE_MAX" ? (campaignsByType[t]?.length || 0) : (byType[t]?.length || 0);
          return (
            <GoogleTypeChip
              key={t}
              type={t}
              label={cfg.label}
              count={count}
              color={cfg.color}
              active={selectedType === t}
              onClick={() => setSelectedType(t)}
              icon={cfg.icon}
            />
          );
        })}
      </div>

      {/* ── 3. Conditional render per type ── */}
      {selectedType === "ALL" && (
        <div className="space-y-6">
          {/* Search */}
          {(byType.SEARCH || []).length > 0 && (
            <section>
              <SectionHeader title="Search" subtitle="Anuncios de busqueda — texto puro" icon={Search} color="#3b82f6" count={byType.SEARCH.length} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {byType.SEARCH.slice(0, 6).map((ad: any) => <SearchAdCard key={ad.id} ad={ad} />)}
              </div>
              {byType.SEARCH.length > 6 && (
                <p className="text-xs text-slate-400 mt-3 text-center">
                  +{byType.SEARCH.length - 6} mas — usá el chip <b>Search</b> arriba para verlos todos
                </p>
              )}
            </section>
          )}

          {/* PMax */}
          {(campaignsByType.PERFORMANCE_MAX || []).length > 0 && (
            <section>
              <SectionHeader title="Performance Max" subtitle="Asset-based — sin anuncios individuales" icon={Zap} color="#f59e0b" count={campaignsByType.PERFORMANCE_MAX.length} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {campaignsByType.PERFORMANCE_MAX.slice(0, 4).map((c: any) => (
                  <PMaxCampaignCard key={c.id} campaign={c} ads={byType.PERFORMANCE_MAX?.filter((a: any) => a.campaignId === c.id) || []} />
                ))}
              </div>
            </section>
          )}

          {/* Display */}
          {(byType.DISPLAY || []).length > 0 && (
            <section>
              <SectionHeader title="Display" subtitle="Banners visuales en la red de Google" icon={Tv} color="#8b5cf6" count={byType.DISPLAY.length} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {byType.DISPLAY.slice(0, 8).map((ad: any) => <DisplayAdCard key={ad.id} ad={ad} />)}
              </div>
            </section>
          )}

          {/* Shopping */}
          {(byType.SHOPPING || []).length > 0 && (
            <section>
              <SectionHeader title="Shopping" subtitle="Listings de productos del feed" icon={ShoppingBag} color="#10b981" count={byType.SHOPPING.length} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {byType.SHOPPING.slice(0, 9).map((ad: any) => <ShoppingAdCard key={ad.id} ad={ad} />)}
              </div>
            </section>
          )}

          {/* Master table */}
          <GoogleCreativeMasterTable creatives={allCreatives} />
        </div>
      )}

      {/* Filtered single-type views */}
      {selectedType === "SEARCH" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredCreatives.length === 0
            ? <EmptyTypeMessage type="Search" />
            : filteredCreatives.map((ad: any) => <SearchAdCard key={ad.id} ad={ad} />)}
        </div>
      )}

      {selectedType === "PERFORMANCE_MAX" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(campaignsByType.PERFORMANCE_MAX || []).length === 0
            ? <EmptyTypeMessage type="Performance Max" />
            : campaignsByType.PERFORMANCE_MAX.map((c: any) => (
                <PMaxCampaignCard key={c.id} campaign={c} ads={byType.PERFORMANCE_MAX?.filter((a: any) => a.campaignId === c.id) || []} />
              ))}
        </div>
      )}

      {selectedType === "DISPLAY" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCreatives.length === 0
            ? <EmptyTypeMessage type="Display" />
            : filteredCreatives.map((ad: any) => <DisplayAdCard key={ad.id} ad={ad} />)}
        </div>
      )}

      {selectedType === "SHOPPING" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCreatives.length === 0
            ? <EmptyTypeMessage type="Shopping" />
            : filteredCreatives.map((ad: any) => <ShoppingAdCard key={ad.id} ad={ad} />)}
        </div>
      )}

      {selectedType === "VIDEO" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCreatives.length === 0
            ? <EmptyTypeMessage type="YouTube / Video" />
            : filteredCreatives.map((ad: any) => <DisplayAdCard key={ad.id} ad={ad} />)}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, subtitle, icon, color, count }: {
  title: string; subtitle: string; icon: any; color: string; count: number;
}) {
  const Icon = icon;
  return (
    <div className="flex items-end justify-between mb-3 pb-2" style={{ borderBottom: `2px solid ${color}22` }}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}14` }}>
          <Icon size={15} style={{ color }} />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900 tracking-tight leading-tight">{title}</h3>
          <p className="text-[11px] text-slate-500 leading-tight">{subtitle}</p>
        </div>
      </div>
      <span className="text-[10px] font-bold tracking-[0.18em] uppercase tabular-nums px-2 py-1 rounded-md" style={{ backgroundColor: `${color}14`, color }}>
        {count}
      </span>
    </div>
  );
}

function EmptyTypeMessage({ type }: { type: string }) {
  return (
    <div className="col-span-full text-center py-16 bg-white rounded-2xl" style={{ border: "1px dashed rgba(15,23,42,0.12)" }}>
      <Palette className="w-10 h-10 text-slate-300 mx-auto mb-2" />
      <p className="text-sm font-medium text-slate-600">No hay anuncios {type} en este periodo</p>
      <p className="text-xs text-slate-400 mt-1">Cambiá el rango de fechas o seleccioná otro tipo</p>
    </div>
  );
}

/* ── Main Component ────────────────────────────────── */

export default function GoogleAdsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(toDateInputValue(new Date(Date.now() - 30 * 86400000)));
  const [dateTo, setDateTo] = useState(toDateInputValue(new Date()));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(30);
  const [sortField, setSortField] = useState("spend");
  const [sortAsc, setSortAsc] = useState(false);
  const [chartMode, setChartMode] = useState<"spend" | "roas" | "cpc">("spend");
  const [activeTab, setActiveTab] = useState<"funnel" | "types" | "creatives" | "campaigns">("funnel");
  const [adsData, setAdsData] = useState<any>(null);
  const [adsLoading, setAdsLoading] = useState(false);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [draggedAdId, setDraggedAdId] = useState<string | null>(null);
  const [dragOverType, setDragOverType] = useState<string | null>(null);
  const { lastSyncAt, isSyncing, syncError, triggerSync: triggerGoogleSync, onSyncComplete } = useSyncStatus("GOOGLE_ADS");
  const { breakevenRoas, contributionMargin } = useBreakeven(dateFrom, dateTo);
  // Drill-down state
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set());
  const [adSetsCache, setAdSetsCache] = useState<Record<string, any>>({});
  const [adsCache, setAdsCache] = useState<Record<string, any[]>>({});
  const [drillLoading, setDrillLoading] = useState<Record<string, boolean>>({});

  /* ── On-demand sync: auto-refresh data when sync completes ── */
  useEffect(() => {
    onSyncComplete(() => fetchData());
  }, [onSyncComplete, fetchData]);

  /* ── Fetch ─────────────────────────────────────── */
  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/metrics/campaigns?platform=GOOGLE&from=${dateFrom}&to=${dateTo}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchAds = useCallback(() => {
    setAdsLoading(true);
    const classParam = classFilter ? `&classification=${classFilter}` : "";
    fetch(`/api/metrics/ads?platform=GOOGLE&from=${dateFrom}&to=${dateTo}${classParam}`)
      .then((r) => r.json())
      .then((d) => setAdsData(d))
      .catch(() => {})
      .finally(() => setAdsLoading(false));
  }, [dateFrom, dateTo, classFilter]);

  useEffect(() => {
    if (activeTab === "creatives") fetchAds();
  }, [activeTab, fetchAds]);

  const handleClassificationChange = useCallback(async (creativeId: string, newType: string) => {
    try {
      await fetch("/api/metrics/ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creativeId, classification: newType }),
      });
      fetchAds();
    } catch (e) {
      console.error("Failed to update classification:", e);
    }
  }, [fetchAds]);

  /* ── Drill-down handlers ─────────────────────── */
  const toggleCampaignExpand = useCallback(async (campaignId: string) => {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(campaignId)) {
        next.delete(campaignId);
      } else {
        next.add(campaignId);
        if (!adSetsCache[campaignId]) {
          setDrillLoading((l) => ({ ...l, [campaignId]: true }));
          fetch(`/api/metrics/campaigns/drilldown?platform=GOOGLE&campaignId=${campaignId}&from=${dateFrom}&to=${dateTo}`)
            .then((r) => r.json())
            .then((d) => {
              setAdSetsCache((c) => ({ ...c, [campaignId]: d.adSets || [] }));
            })
            .catch(() => {})
            .finally(() => setDrillLoading((l) => ({ ...l, [campaignId]: false })));
        }
      }
      return next;
    });
  }, [adSetsCache, dateFrom, dateTo]);

  const toggleAdSetExpand = useCallback(async (adSetId: string) => {
    setExpandedAdSets((prev) => {
      const next = new Set(prev);
      if (next.has(adSetId)) {
        next.delete(adSetId);
      } else {
        next.add(adSetId);
        if (!adsCache[adSetId]) {
          setDrillLoading((l) => ({ ...l, [adSetId]: true }));
          fetch(`/api/metrics/campaigns/drilldown?platform=GOOGLE&adSetId=${adSetId}&from=${dateFrom}&to=${dateTo}`)
            .then((r) => r.json())
            .then((d) => {
              setAdsCache((c) => ({ ...c, [adSetId]: d.ads || [] }));
            })
            .catch(() => {})
            .finally(() => setDrillLoading((l) => ({ ...l, [adSetId]: false })));
        }
      }
      return next;
    });
  }, [adsCache, dateFrom, dateTo]);

  // Clear drill-down cache when dates change
  useEffect(() => {
    setAdSetsCache({});
    setAdsCache({});
    setExpandedCampaigns(new Set());
    setExpandedAdSets(new Set());
  }, [dateFrom, dateTo]);

  const handleQuickRange = (days: number) => {
    setDateTo(toDateInputValue(new Date()));
    setDateFrom(toDateInputValue(new Date(Date.now() - days * 86400000)));
    setActiveQuickRange(days);
  };
  const handleDateChange = (type: "from" | "to", v: string) => {
    type === "from" ? setDateFrom(v) : setDateTo(v);
    setActiveQuickRange(null);
  };

  const handleFunnelAssign = useCallback(async (campaignId: string, stage: string) => {
    try {
      await fetch("/api/metrics/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, funnelStage: stage }),
      });
      fetchData();
    } catch (e) { console.error(e); }
  }, [fetchData]);

  /* ── Derived data ──────────────────────────────── */
  const campaigns = data?.campaigns || [];
  const totals = data?.totals || {};
  const changes = data?.changes || {};
  const dailyTrend = data?.dailyTrend || [];
  const funnelSummary = data?.funnelSummary || [];

  const sorted = useMemo(() => {
    return [...campaigns].sort((a: any, b: any) => {
      const aV = a[sortField] || 0;
      const bV = b[sortField] || 0;
      return sortAsc ? aV - bV : bV - aV;
    });
  }, [campaigns, sortField, sortAsc]);

  const globalRoas = totals.spend > 0 ? (totals.conversionValue / totals.spend).toFixed(2) : "0";
  const globalCtr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : "0";
  const globalCpc = totals.clicks > 0 ? (totals.spend / totals.clicks).toFixed(0) : "0";
  const globalCostPerConv = totals.conversions > 0 ? (totals.spend / totals.conversions).toFixed(0) : "0";
  const globalConvRate = totals.clicks > 0 ? ((totals.conversions / totals.clicks) * 100).toFixed(2) : "0";

  // Average QS and IS
  const withQS = campaigns.filter((c: any) => c.qualityScore !== null);
  const avgQS = withQS.length > 0 ? (withQS.reduce((s: number, c: any) => s + c.qualityScore, 0) / withQS.length).toFixed(1) : "--";
  const withIS = campaigns.filter((c: any) => c.impressionShare !== null);
  const avgIS = withIS.length > 0 ? ((withIS.reduce((s: number, c: any) => s + c.impressionShare, 0) / withIS.length) * 100).toFixed(0) : "--";

  const activeCount = campaigns.filter((c: any) => c.status === "ACTIVE" || c.status === "ENABLED").length;

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };
  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortAsc ? <ArrowUp className="w-3 h-3 inline ml-0.5" /> : <ArrowDown className="w-3 h-3 inline ml-0.5" />;
  };

  const exportCSV = () => {
    const headers = ["Campana", "Estado", "Funnel", "Tipo", "Gasto", "Impresiones", "Clicks", "CTR%", "CPC", "Conversiones", "Revenue", "ROAS", "QualityScore", "ImprShare%"];
    const rows = campaigns.map((c: any) => [
      `"${c.name.replace(/"/g, '""')}"`, c.status, c.funnelStage, detectCampaignType(c.objective),
      c.spend.toFixed(2), c.impressions, c.clicks, c.ctr, c.cpc.toFixed(2),
      c.conversions, c.conversionValue.toFixed(2), c.roas, c.qualityScore || "", c.impressionShare ? (c.impressionShare * 100).toFixed(1) : "",
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `google_ads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3" />
        <span className="text-gray-500">Cargando Google Ads...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-green-400 flex items-center justify-center shadow-lg">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Google Ads</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Search, Shopping & Performance Max &middot; {dateFrom} a {dateTo}
                {isSyncing ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                    <RefreshCw size={11} className="animate-spin" />
                    Actualizando datos...
                  </span>
                ) : lastSyncAt ? (
                  <button
                    onClick={() => triggerGoogleSync()}
                    className="ml-2 inline-flex items-center gap-1 text-green-600 hover:text-green-700 transition-colors"
                    title="Click para actualizar"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Sync: {new Date(lastSyncAt).toLocaleString("es-AR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                  </button>
                ) : null}
              </p>
            </div>
          </div>
        </div>
        <DateRangeFilter
          dateFrom={dateFrom} dateTo={dateTo}
          activeQuickRange={activeQuickRange}
          quickRanges={QUICK_RANGES}
          onQuickRange={handleQuickRange}
          onDateChange={handleDateChange}
          loading={loading}
        />
      </div>

      {/* Status strip */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          {activeCount} activas
        </span>
        <span>{campaigns.length} campanas total</span>
        {avgQS !== "--" && (
          <span className="flex items-center gap-1.5">
            <Star size={12} className="text-amber-500" />
            QS Promedio: {avgQS}/10
          </span>
        )}
        {avgIS !== "--" && (
          <span className="flex items-center gap-1.5">
            <Activity size={12} className="text-blue-500" />
            Impr. Share: {avgIS}%
          </span>
        )}
      </div>

      {/* Break-even health chip */}
      <BreakevenChip
        currentRoas={Number(globalRoas) || 0}
        breakevenRoas={breakevenRoas}
        contributionMargin={contributionMargin}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiCard icon={<DollarSign size={14} className="text-red-600" />} iconBg="bg-red-50" label="Inversion" value={formatARS(totals.spend || 0)} change={changes.spend} />
        <KpiCard icon={<Eye size={14} className="text-blue-600" />} iconBg="bg-blue-50" label="Impresiones" value={formatCompact(totals.impressions || 0)} change={changes.impressions} />
        <KpiCard icon={<MousePointer size={14} className="text-indigo-600" />} iconBg="bg-indigo-50" label="Clicks" value={formatCompact(totals.clicks || 0)} change={changes.clicks} />
        <KpiCard icon={<Target size={14} className="text-green-600" />} iconBg="bg-green-50" label="ROAS" value={`${globalRoas}x`} subtitle={breakevenRoas > 0 ? `BE ${breakevenRoas.toFixed(2)}x · CM ${(contributionMargin * 100).toFixed(0)}%` : undefined} change={breakevenRoas > 0 ? undefined : changes.roas} />
        <KpiCard icon={<ShoppingCart size={14} className="text-purple-600" />} iconBg="bg-purple-50" label="Conversiones" value={String(totals.conversions || 0)} change={changes.conversions} />
        <KpiCard icon={<Zap size={14} className="text-amber-600" />} iconBg="bg-amber-50" label="CTR" value={`${globalCtr}%`} subtitle={`CPC: ${formatARS(Number(globalCpc))}`} />
        <KpiCard icon={<DollarSign size={14} className="text-cyan-600" />} iconBg="bg-cyan-50" label="CPA" value={formatARS(Number(globalCostPerConv))} subtitle={`Conv Rate: ${globalConvRate}%`} />
        <KpiCard icon={<Star size={14} className="text-amber-500" />} iconBg="bg-amber-50" label="Quality Score" value={avgQS !== "--" ? `${avgQS}/10` : "--"} subtitle={avgIS !== "--" ? `IS: ${avgIS}%` : ""} />
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex">
            {([
              { key: "funnel" as const, label: "Funnel & Budget", icon: <Layers size={14} /> },
              { key: "types" as const, label: "Tipos de Campana", icon: <BarChart3 size={14} /> },
              { key: "creatives" as const, label: "Creativos", icon: <Palette size={14} /> },
              { key: "campaigns" as const, label: "Campanas", icon: <TrendingUp size={14} /> },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium border-b-2 transition-all ${
                  activeTab === tab.key
                    ? "border-blue-600 text-blue-600 bg-blue-50/50"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-0">
          {/* ── TAB: Funnel ───────────────────────────── */}
          {activeTab === "funnel" && (
            <div className="p-6 space-y-6">
              <FunnelBoard campaigns={campaigns} funnelSummary={funnelSummary} onAssign={handleFunnelAssign} />

              {/* Chart */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">Tendencia Diaria</h3>
                  <div className="bg-gray-100 p-1 rounded-lg inline-flex gap-1">
                    {([
                      { key: "spend" as const, label: "Gasto" },
                      { key: "roas" as const, label: "ROAS" },
                      { key: "cpc" as const, label: "CPC" },
                    ]).map((m) => (
                      <button key={m.key} onClick={() => setChartMode(m.key)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                          chartMode === m.key ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"
                        }`}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                {dailyTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    {chartMode === "spend" ? (
                      <AreaChart data={dailyTrend}>
                        <defs>
                          <linearGradient id="googleSpendGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
                        <Tooltip formatter={(v: number) => [formatARS(v), "Gasto Google"]} />
                        <Area type="monotone" dataKey="GOOGLE" fill="url(#googleSpendGrad)" stroke="#3b82f6" strokeWidth={2} />
                      </AreaChart>
                    ) : chartMode === "roas" ? (
                      <LineChart data={dailyTrend.map((d: any) => ({
                        date: d.date,
                        roas: d.GOOGLE > 0 ? Math.round((d.conversionValue / d.GOOGLE) * 100) / 100 : 0,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}x`} />
                        <Tooltip formatter={(v: number) => [`${v}x`, "ROAS"]} />
                        <Line type="monotone" dataKey="roas" stroke="#10b981" strokeWidth={2} dot={false} />
                      </LineChart>
                    ) : (
                      <LineChart data={dailyTrend.map((d: any) => ({
                        date: d.date,
                        cpc: d.clicks > 0 ? Math.round((d.GOOGLE / d.clicks) * 100) / 100 : 0,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatARS(v)} />
                        <Tooltip formatter={(v: number) => [formatARS(v), "CPC"]} />
                        <Line type="monotone" dataKey="cpc" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-400">Sin datos de tendencia</div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB: Campaign Types ──────────────────── */}
          {activeTab === "types" && (
            <div className="p-6 space-y-6">
              <CampaignTypeBreakdown campaigns={campaigns} />
              <QualityScoreSummary campaigns={campaigns} />
            </div>
          )}

          {/* ── TAB: Creativos ──────────────────────── */}
          {activeTab === "creatives" && (
            <div className="p-6 space-y-6">
              {adsLoading && !adsData ? (
                <div className="flex items-center justify-center h-48">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3" />
                  <span className="text-gray-500">Cargando creativos...</span>
                </div>
              ) : !adsData?.creatives?.length && !campaigns.some((c: any) => detectCampaignType(c.objective) === "PERFORMANCE_MAX") ? (
                <div className="text-center py-16">
                  <Palette className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-1">No hay creativos sincronizados aun</p>
                  <p className="text-xs text-gray-400">Los creativos se sincronizan con el proximo sync de datos</p>
                </div>
              ) : (
                <GoogleCreativesView adsData={adsData} campaigns={campaigns} />
              )}
            </div>
          )}

          {/* ── TAB: Campaigns Drill-down Table ─────── */}
          {activeTab === "campaigns" && (
            <div>
              <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">Campanas Google ({campaigns.length})</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Hace clic en una campana para ver sus grupos de anuncios y anuncios</p>
                </div>
                <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  <Download className="w-4 h-4" /> Exportar CSV
                </button>
              </div>
              {sorted.length === 0 ? (
                <div className="p-12 text-center text-gray-400">No hay campanas Google con datos en este periodo.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 w-[280px]">Nombre</th>
                        <th className="px-3 py-3 text-center font-semibold text-gray-700">Estado</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("spend")}>Gasto<SortIcon field="spend" /></th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("impressions")}>Impr.<SortIcon field="impressions" /></th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("clicks")}>Clicks<SortIcon field="clicks" /></th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("ctr")}>CTR<SortIcon field="ctr" /></th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("cpc")}>CPC<SortIcon field="cpc" /></th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("conversions")}>Conv.<SortIcon field="conversions" /></th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("conversionValue")}>Revenue<SortIcon field="conversionValue" /></th>
                        <th className="px-3 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("roas")}>ROAS<SortIcon field="roas" /></th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">CPA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((c: any) => {
                        const isExpanded = expandedCampaigns.has(c.id);
                        const campaignAdSets = adSetsCache[c.id] || [];
                        const isLoadingAdSets = drillLoading[c.id];
                        return (
                          <React.Fragment key={c.id}>
                            {/* ── Campaign Row ── */}
                            <tr
                              className="hover:bg-blue-50/30 transition-colors cursor-pointer border-b border-gray-100 group"
                              onClick={() => toggleCampaignExpand(c.id)}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
                                    <ChevronRight size={14} className="text-blue-500" />
                                  </span>
                                  <Megaphone size={14} className="text-blue-400 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="font-medium text-gray-900 truncate max-w-[220px]" title={c.name}>{c.name}</div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <CampaignTypeBadge objective={c.objective} />
                                      <FunnelStageBadge stage={c.funnelStage} />
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-center"><StatusBadge status={c.status} /></td>
                              <td className="px-3 py-3 text-right text-gray-900 font-semibold">{formatARS(c.spend)}</td>
                              <td className="px-3 py-3 text-right text-gray-700">{formatCompact(c.impressions)}</td>
                              <td className="px-3 py-3 text-right text-gray-700">{formatCompact(c.clicks)}</td>
                              <td className="px-3 py-3 text-right text-gray-700">{c.ctr}%</td>
                              <td className="px-3 py-3 text-right text-gray-700">{formatARS(c.cpc)}</td>
                              <td className="px-3 py-3 text-right text-gray-700">{c.conversions}</td>
                              <td className="px-3 py-3 text-right text-gray-700 font-medium">{formatARS(c.conversionValue)}</td>
                              <td className="px-3 py-3 text-center"><RoasBadge value={c.roas} stage={c.funnelStage} /></td>
                              <td className="px-3 py-3 text-right text-gray-700">{formatARS(c.costPerConversion)}</td>
                            </tr>

                            {/* ── Ad Groups (expanded) ── */}
                            {isExpanded && (
                              <>
                                {isLoadingAdSets ? (
                                  <tr><td colSpan={11} className="bg-blue-50/20">
                                    <div className="flex items-center gap-2 px-8 py-3 text-xs text-gray-500">
                                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500" />
                                      Cargando grupos de anuncios...
                                    </div>
                                  </td></tr>
                                ) : campaignAdSets.length === 0 ? (
                                  <tr><td colSpan={11} className="bg-blue-50/20 px-8 py-3 text-xs text-gray-400">
                                    Sin grupos de anuncios sincronizados para esta campana
                                  </td></tr>
                                ) : (
                                  campaignAdSets.map((ag: any) => {
                                    const isAgExpanded = expandedAdSets.has(ag.id);
                                    const adGroupAds = adsCache[ag.id] || [];
                                    const isLoadingAds = drillLoading[ag.id];
                                    return (
                                      <React.Fragment key={ag.id}>
                                        {/* ── Ad Group Row ── */}
                                        <tr
                                          className="hover:bg-indigo-50/30 transition-colors cursor-pointer bg-gray-50/50 border-b border-gray-100"
                                          onClick={(e) => { e.stopPropagation(); toggleAdSetExpand(ag.id); }}
                                        >
                                          <td className="pl-10 pr-4 py-2.5">
                                            <div className="flex items-center gap-2">
                                              <span className={`transition-transform duration-200 ${isAgExpanded ? "rotate-90" : ""}`}>
                                                <ChevronRight size={12} className="text-indigo-500" />
                                              </span>
                                              <LayoutGrid size={13} className="text-indigo-400 flex-shrink-0" />
                                              <div className="min-w-0">
                                                <div className="font-medium text-gray-800 text-xs truncate max-w-[200px]" title={ag.name}>{ag.name}</div>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                  {ag.bidStrategy && <span className="text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">{ag.bidStrategy}</span>}
                                                  {ag.adsCount > 0 && <span className="text-[9px] text-gray-400">{ag.adsCount} anuncios</span>}
                                                </div>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="px-3 py-2.5 text-center"><StatusBadge status={ag.status} /></td>
                                          <td className="px-3 py-2.5 text-right text-gray-700 font-medium text-xs">{formatARS(ag.spend)}</td>
                                          <td className="px-3 py-2.5 text-right text-gray-600 text-xs">{formatCompact(ag.impressions)}</td>
                                          <td className="px-3 py-2.5 text-right text-gray-600 text-xs">{formatCompact(ag.clicks)}</td>
                                          <td className="px-3 py-2.5 text-right text-gray-600 text-xs">{ag.ctr}%</td>
                                          <td className="px-3 py-2.5 text-right text-gray-600 text-xs">{formatARS(ag.cpc)}</td>
                                          <td className="px-3 py-2.5 text-right text-gray-600 text-xs">{ag.conversions}</td>
                                          <td className="px-3 py-2.5 text-right text-gray-700 font-medium text-xs">{formatARS(ag.conversionValue)}</td>
                                          <td className="px-3 py-2.5 text-center"><RoasBadge value={ag.roas} /></td>
                                          <td className="px-3 py-2.5 text-right text-gray-600 text-xs">{formatARS(ag.costPerConversion)}</td>
                                        </tr>

                                        {/* ── Ads (expanded from ad group) ── */}
                                        {isAgExpanded && (
                                          <>
                                            {isLoadingAds ? (
                                              <tr><td colSpan={11} className="bg-indigo-50/20">
                                                <div className="flex items-center gap-2 px-14 py-2 text-xs text-gray-500">
                                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-indigo-400" />
                                                  Cargando anuncios...
                                                </div>
                                              </td></tr>
                                            ) : adGroupAds.length === 0 ? (
                                              <tr><td colSpan={11} className="bg-indigo-50/20 px-14 py-2 text-xs text-gray-400">
                                                Sin anuncios sincronizados para este grupo
                                              </td></tr>
                                            ) : (
                                              adGroupAds.map((ad: any) => (
                                                <tr key={ad.id} className="bg-indigo-50/10 hover:bg-indigo-50/30 border-b border-gray-50 transition-colors">
                                                  <td className="pl-16 pr-4 py-2">
                                                    <div className="flex items-center gap-2">
                                                      {ad.type === "VIDEO" ? <Film size={12} className="text-pink-400" /> : <Image size={12} className="text-emerald-400" />}
                                                      <div className="min-w-0">
                                                        <div className="text-xs text-gray-700 truncate max-w-[180px]" title={ad.name}>{ad.name}</div>
                                                        {ad.classification && ad.classification !== "OTHER" && (
                                                          <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded mt-0.5 inline-block">{ad.classification}</span>
                                                        )}
                                                      </div>
                                                    </div>
                                                  </td>
                                                  <td className="px-3 py-2 text-center"><StatusBadge status={ad.status} /></td>
                                                  <td className="px-3 py-2 text-right text-gray-600 text-[11px]">{formatARS(ad.spend)}</td>
                                                  <td className="px-3 py-2 text-right text-gray-500 text-[11px]">{formatCompact(ad.impressions)}</td>
                                                  <td className="px-3 py-2 text-right text-gray-500 text-[11px]">{formatCompact(ad.clicks)}</td>
                                                  <td className="px-3 py-2 text-right text-gray-500 text-[11px]">{ad.ctr}%</td>
                                                  <td className="px-3 py-2 text-right text-gray-500 text-[11px]">{formatARS(ad.cpc)}</td>
                                                  <td className="px-3 py-2 text-right text-gray-500 text-[11px]">{ad.conversions}</td>
                                                  <td className="px-3 py-2 text-right text-gray-600 text-[11px]">{formatARS(ad.conversionValue)}</td>
                                                  <td className="px-3 py-2 text-center"><RoasBadge value={ad.roas} /></td>
                                                  <td className="px-3 py-2 text-right text-gray-500 text-[11px]">{formatARS(ad.costPerConversion)}</td>
                                                </tr>
                                              ))
                                            )}
                                          </>
                                        )}
                                      </React.Fragment>
                                    );
                                  })
                                )}
                              </>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                      <tr className="font-bold">
                        <td className="px-4 py-3 text-gray-900">TOTAL</td>
                        <td />
                        <td className="px-3 py-3 text-right text-gray-900">{formatARS(totals.spend || 0)}</td>
                        <td className="px-3 py-3 text-right text-gray-900">{formatCompact(totals.impressions || 0)}</td>
                        <td className="px-3 py-3 text-right text-gray-900">{formatCompact(totals.clicks || 0)}</td>
                        <td className="px-3 py-3 text-right text-gray-900">{globalCtr}%</td>
                        <td className="px-3 py-3 text-right text-gray-900">{formatARS(Number(globalCpc))}</td>
                        <td className="px-3 py-3 text-right text-gray-900">{totals.conversions || 0}</td>
                        <td className="px-3 py-3 text-right text-gray-900">{formatARS(totals.conversionValue || 0)}</td>
                        <td className="px-3 py-3 text-center"><RoasBadge value={Number(globalRoas)} /></td>
                        <td className="px-3 py-3 text-right text-gray-900">{formatARS(Number(globalCostPerConv))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
