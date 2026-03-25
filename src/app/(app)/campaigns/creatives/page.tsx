// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import { DateRangeFilter } from "@/components/dashboard";
import {
  Play, Eye, MousePointer, Target, Zap, TrendingUp,
  Film, Image, AlertTriangle, CheckCircle, XCircle,
  BarChart3, Filter, ChevronDown, ChevronUp,
  Activity, Video, Sparkles, X, ShoppingCart,
  Crosshair, Users, ArrowRight, Layers, Package,
} from "lucide-react";

/* ── Constants ─────────────────────────────────────── */

const QUICK_RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function toDateInputValue(d: Date) {
  return d.toISOString().split("T")[0];
}

/* ── Color & Label Helpers ─────────────────────────── */

const FUNNEL_CONFIG: Record<string, { color: string; lightColor: string; bg: string; lightBg: string; icon: any; label: string; shortLabel: string }> = {
  TOF: { color: "text-purple-400", lightColor: "text-purple-700", bg: "bg-purple-500/10 border-purple-500/20", lightBg: "bg-purple-50 border-purple-200", icon: Eye, label: "Top of Funnel", shortLabel: "TOF" },
  MOF: { color: "text-blue-400", lightColor: "text-blue-700", bg: "bg-blue-500/10 border-blue-500/20", lightBg: "bg-blue-50 border-blue-200", icon: MousePointer, label: "Middle of Funnel", shortLabel: "MOF" },
  BOF: { color: "text-emerald-400", lightColor: "text-emerald-700", bg: "bg-emerald-500/10 border-emerald-500/20", lightBg: "bg-emerald-50 border-emerald-200", icon: ShoppingCart, label: "Bottom of Funnel", shortLabel: "BOF" },
  UNKNOWN: { color: "text-gray-400", lightColor: "text-gray-600", bg: "bg-gray-500/10 border-gray-500/20", lightBg: "bg-gray-50 border-gray-200", icon: Layers, label: "Sin clasificar", shortLabel: "?" },
};

const DIAGNOSIS_CONFIG: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  WEAK_HOOK: { color: "text-red-600", bg: "bg-red-50", icon: XCircle, label: "Hook debil" },
  WEAK_CONTENT: { color: "text-amber-600", bg: "bg-amber-50", icon: AlertTriangle, label: "Contenido debil" },
  WEAK_CTA: { color: "text-orange-600", bg: "bg-orange-50", icon: MousePointer, label: "Falta CTA" },
  WEAK_CONVERSION: { color: "text-red-600", bg: "bg-red-50", icon: ShoppingCart, label: "No convierte" },
  LOW_ROI: { color: "text-red-700", bg: "bg-red-50", icon: TrendingUp, label: "ROI bajo" },
  STRONG_PERFORMER: { color: "text-emerald-600", bg: "bg-emerald-50", icon: CheckCircle, label: "Performer" },
  STRONG_ENGAGER: { color: "text-blue-600", bg: "bg-blue-50", icon: Zap, label: "Engager" },
  STRONG_CONVERTER: { color: "text-emerald-600", bg: "bg-emerald-50", icon: Target, label: "Conversor" },
};

function getScoreColor(score: number) {
  if (score >= 60) return "#10b981";
  if (score >= 35) return "#f59e0b";
  if (score >= 15) return "#f97316";
  return "#ef4444";
}

function getScoreLabel(score: number) {
  if (score >= 60) return "Excelente";
  if (score >= 35) return "Bueno";
  if (score >= 15) return "Regular";
  return "Bajo";
}

function getRoasColor(roas: number) {
  if (roas >= 3) return "text-green-600";
  if (roas >= 1.5) return "text-amber-600";
  return "text-red-600";
}

/* ── Thumbnail Modal ──────────────────────────────── */

function ThumbnailModal({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-full flex items-center justify-center text-white transition-colors"
        >
          <X size={16} />
        </button>
        <img
          src={url}
          alt={name}
          className="rounded-xl max-w-[90vw] max-h-[85vh] object-contain shadow-2xl"
        />
        <p className="text-center text-sm text-gray-500 mt-2 truncate max-w-[500px] mx-auto">{name}</p>
      </div>
    </div>
  );
}

/* ── Small Clickable Thumbnail ────────────────────── */

function Thumbnail({ url, name, onClickZoom }: { url: string; name: string; onClickZoom: () => void }) {
  const [error, setError] = useState(false);
  if (error || !url) {
    return <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center"><Film size={16} className="text-gray-400" /></div>;
  }
  return (
    <img
      src={url}
      alt={name}
      onClick={(e) => { e.stopPropagation(); onClickZoom(); }}
      className="w-12 h-12 rounded-lg object-cover bg-gray-100 cursor-pointer hover:ring-2 hover:ring-indigo-400/50 transition-all"
      onError={() => setError(true)}
    />
  );
}

/* ── Funnel Badge ─────────────────────────────────── */

function FunnelBadge({ stage }: { stage: string }) {
  const config = FUNNEL_CONFIG[stage] || FUNNEL_CONFIG.UNKNOWN;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${config.lightBg} ${config.lightColor}`}>
      {config.shortLabel}
    </span>
  );
}

/* ── Diagnosis Badge ──────────────────────────────── */

function DiagnosisBadge({ diagnosis }: { diagnosis: string | null }) {
  if (!diagnosis) return <span className="text-xs text-gray-400">-</span>;
  const config = DIAGNOSIS_CONFIG[diagnosis];
  if (!config) return <span className="text-xs text-gray-500">{diagnosis}</span>;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${config.bg} ${config.color}`}>
      <Icon size={11} />
      {config.label}
    </span>
  );
}

/* ── Score Pill ────────────────────────────────────── */

function ScorePill({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <span className="text-xs text-gray-400">-</span>;
  const color = getScoreColor(score);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
        style={{ backgroundColor: color + "20", color }}>
        {Math.round(score)}
      </div>
      <span className="text-[10px] text-gray-500 hidden xl:block">{getScoreLabel(score)}</span>
    </div>
  );
}

/* ── Retention Mini Bar ───────────────────────────── */

function RetentionMiniBar({ dropOff }: { dropOff: any }) {
  if (!dropOff) return <span className="text-xs text-gray-400">-</span>;
  const points = [
    { label: "25%", val: dropOff.retention25 },
    { label: "50%", val: dropOff.retention50 },
    { label: "75%", val: dropOff.retention75 },
    { label: "100%", val: dropOff.retention100 },
  ];
  return (
    <div className="flex items-end gap-0.5 h-6">
      {points.map((p) => (
        <div key={p.label} className="flex flex-col items-center" title={`${p.label}: ${p.val ?? "-"}%`}>
          <div
            className="w-3 rounded-sm bg-purple-400"
            style={{ height: `${Math.max((p.val || 0) / 100 * 24, 2)}px` }}
          />
        </div>
      ))}
    </div>
  );
}

/* ── Score Breakdown (expanded) ───────────────────── */

function ScoreBreakdown({ weights, breakdown }: { weights: any; breakdown: any }) {
  if (!weights || !breakdown) return null;
  const items = [
    { key: "hook", label: "Hook Rate", color: "#8b5cf6" },
    { key: "hold", label: "Hold Rate", color: "#6366f1" },
    { key: "completion", label: "Completion", color: "#06b6d4" },
    { key: "action", label: "Action Rate", color: "#3b82f6" },
    { key: "conv", label: "Conv Rate", color: "#10b981" },
    { key: "roas", label: "ROAS", color: "#f59e0b" },
  ].filter((i) => (weights[i.key] || 0) > 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.key} className="bg-gray-50 rounded-lg p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-500">{item.label}</span>
            <span className="text-[10px] text-gray-400">peso {Math.round((weights[item.key] || 0) * 100)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full" style={{
                width: `${Math.min((breakdown[item.key] || 0) / (weights[item.key] || 0.01) * 100, 100)}%`,
                backgroundColor: item.color
              }} />
            </div>
            <span className="text-xs font-mono" style={{ color: item.color }}>{(breakdown[item.key] || 0).toFixed(1)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Retention Full Bar ───────────────────────────── */

function RetentionFull({ dropOff }: { dropOff: any }) {
  if (!dropOff) return null;
  const steps = [
    { label: "3s Play", pct: 100, color: "#8b5cf6" },
    { label: "25%", pct: dropOff.retention25, color: "#6366f1" },
    { label: "50%", pct: dropOff.retention50, color: "#3b82f6" },
    { label: "75%", pct: dropOff.retention75, color: "#06b6d4" },
    { label: "100%", pct: dropOff.retention100, color: "#10b981" },
  ].filter((s) => s.pct !== null);

  return (
    <div className="space-y-1">
      {steps.map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 w-12 text-right shrink-0">{s.label}</span>
          <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max(s.pct, 2)}%`, backgroundColor: s.color }} />
          </div>
          <span className="text-[11px] font-mono text-gray-600 w-8 shrink-0">{s.pct}%</span>
        </div>
      ))}
    </div>
  );
}

/* ── Expanded Row Detail ──────────────────────────── */

function ExpandedDetail({ creative }: { creative: any }) {
  const vm = creative.videoMetrics;
  const [modalUrl, setModalUrl] = useState<string | null>(null);

  return (
    <div className="px-4 py-4 bg-gray-50 border-t border-gray-100">
      {modalUrl && <ThumbnailModal url={modalUrl} name={creative.name} onClose={() => setModalUrl(null)} />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Col 1: Thumbnail + info */}
        <div className="space-y-3">
          {creative.mediaUrls?.[0] && (
            <img
              src={creative.mediaUrls[0]}
              alt={creative.name}
              className="rounded-lg max-h-48 w-full object-contain bg-gray-100 cursor-pointer hover:ring-2 hover:ring-indigo-400/50 transition-all"
              onClick={() => setModalUrl(creative.mediaUrls[0])}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div className="space-y-1">
            <p className="text-xs text-gray-500">Campana: <span className="text-gray-900 font-medium">{creative.campaignName || "-"}</span></p>
            <p className="text-xs text-gray-500">Objetivo: <span className="text-gray-900 font-medium">{creative.campaignObjective || "-"}</span></p>
            <p className="text-xs text-gray-500">Dias con datos: <span className="text-gray-900 font-medium">{creative.daysWithData}</span></p>
            <div className="pt-1"><DiagnosisBadge diagnosis={vm?.dropOffAnalysis?.diagnosis} /></div>
          </div>
        </div>

        {/* Col 2: Retention + metrics */}
        {vm && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Curva de retencion</h4>
            <RetentionFull dropOff={vm.dropOffAnalysis} />

            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: "Hook", val: vm.hookRate, suffix: "%" },
                { label: "Action", val: vm.actionRate, suffix: "%" },
                { label: "Hold", val: vm.holdRate, suffix: "%" },
                { label: "Compl", val: vm.completionRate, suffix: "%" },
              ].map((m) => (
                <div key={m.label} className="bg-white rounded-lg px-2 py-1.5 border border-gray-100">
                  <span className="text-[10px] text-gray-500 block">{m.label}</span>
                  <span className="text-sm font-bold text-gray-900">{m.val != null ? m.val.toFixed(1) + m.suffix : "-"}</span>
                </div>
              ))}
            </div>

            {vm.dropOffAnalysis?.diagnosisLabel && (
              <div className="bg-white rounded-lg p-2.5 flex items-start gap-2 border border-gray-100">
                <Sparkles size={13} className="text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-600">{vm.dropOffAnalysis.diagnosisLabel}</p>
              </div>
            )}
          </div>
        )}

        {/* Col 3: Score breakdown */}
        {vm && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Composicion del Score ({FUNNEL_CONFIG[creative.funnelStage]?.shortLabel || "?"})
            </h4>
            <ScoreBreakdown weights={vm.scoreWeights} breakdown={vm.scoreBreakdown} />

            <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-gray-200">
              <div>
                <span className="text-[10px] text-gray-500 block">Plays</span>
                <span className="text-xs font-mono text-gray-700">{formatCompact(vm.videoPlays || 0)}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-500 block">Conv Value</span>
                <span className="text-xs font-mono text-gray-700">{formatARS(creative.conversionValue)}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-500 block">CPA</span>
                <span className="text-xs font-mono text-gray-700">{creative.costPerConversion > 0 ? formatARS(creative.costPerConversion) : "-"}</span>
              </div>
            </div>
          </div>
        )}

        {/* Non-video expanded */}
        {!vm && (
          <div className="md:col-span-2 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Impressions", val: formatCompact(creative.impressions) },
              { label: "Clicks", val: formatCompact(creative.clicks) },
              { label: "CTR", val: creative.ctr + "%" },
              { label: "Conversions", val: creative.conversions },
              { label: "Conv Value", val: formatARS(creative.conversionValue) },
              { label: "CPA", val: creative.costPerConversion > 0 ? formatARS(creative.costPerConversion) : "-" },
            ].map((m) => (
              <div key={m.label} className="bg-white rounded-lg px-2 py-2 border border-gray-100">
                <span className="text-[10px] text-gray-500 block">{m.label}</span>
                <span className="text-sm font-bold text-gray-900">{m.val}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── SOURCE_ICONS for Ventas por Anuncio ─────────── */

const SOURCE_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  meta: { icon: "M", color: "#1877F2", label: "Meta" },
  google: { icon: "G", color: "#4285F4", label: "Google" },
  direct: { icon: "D", color: "#6b7280", label: "Directo" },
  "gocuotas.com": { icon: "$", color: "#10b981", label: "GoCuotas" },
  icommarketing: { icon: "E", color: "#f59e0b", label: "Email" },
  duckduckgo: { icon: "D", color: "#de5833", label: "DuckDuckGo" },
  email: { icon: "E", color: "#f59e0b", label: "Email" },
  referral: { icon: "R", color: "#8b5cf6", label: "Referral" },
};

/* ══════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════ */

export default function CreativesVideoPage() {
  const [activeTab, setActiveTab] = useState<"performance" | "sales">("performance");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalUrl, setModalUrl] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<"ALL" | "VIDEO" | "IMAGE">("ALL");
  const [filterFunnel, setFilterFunnel] = useState<string>("ALL");
  const [filterCampaign, setFilterCampaign] = useState<string>("ALL");
  const [sortField, setSortField] = useState<string>("spend");
  const [sortAsc, setSortAsc] = useState(false);

  // Score explanation collapsible
  const [scoreOpen, setScoreOpen] = useState(false);

  // Date range
  const [dateFrom, setDateFrom] = useState(toDateInputValue(new Date(Date.now() - 30 * 86400000)));
  const [dateTo, setDateTo] = useState(toDateInputValue(new Date()));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(30);

  // Ventas por Anuncio state
  const [salesData, setSalesData] = useState<any[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [selectedAd, setSelectedAd] = useState<string | null>(null);
  const [salesSourceFilter, setSalesSourceFilter] = useState<string>("ALL");

  /* ── Fetch creatives ────────────────────────────── */
  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics/ads?from=${dateFrom}&to=${dateTo}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  /* ── Fetch sales by ad ──────────────────────────── */
  useEffect(() => {
    if (activeTab !== "sales") return;
    setSalesLoading(true);
    setSalesSourceFilter("ALL");
    fetch(`/api/metrics/pixel/sales-by-ad?from=${dateFrom}&to=${dateTo}`)
      .then((r) => r.json())
      .then((d) => {
        setSalesData(d.ads || []);
        if (d.ads?.length > 0) setSelectedAd(d.ads[0].adKey);
      })
      .catch(() => {})
      .finally(() => setSalesLoading(false));
  }, [activeTab, dateFrom, dateTo]);

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
  const campaigns = data?.campaigns || [];
  const funnelBreakdown = data?.funnelBreakdown || [];

  const filtered = useMemo(() => {
    let list = allCreatives;

    // Type filter
    if (filterType === "VIDEO") list = list.filter((c: any) => c.isVideo);
    else if (filterType === "IMAGE") list = list.filter((c: any) => !c.isVideo);

    // Funnel filter
    if (filterFunnel !== "ALL") list = list.filter((c: any) => c.funnelStage === filterFunnel);

    // Campaign filter
    if (filterCampaign !== "ALL") list = list.filter((c: any) => c.campaignId === filterCampaign);

    // Sort
    return [...list].sort((a: any, b: any) => {
      let aVal: number, bVal: number;
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
        case "roas": aVal = a.roas; bVal = b.roas; break;
        case "conv": aVal = a.conversions; bVal = b.conversions; break;
        case "spend":
        default:
          aVal = a.spend; bVal = b.spend;
      }
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
  }, [allCreatives, filterType, filterFunnel, filterCampaign, sortField, sortAsc]);

  /* ── Summary KPIs ──────────────────────────────── */
  const kpis = useMemo(() => {
    if (filtered.length === 0) return null;
    const totalSpend = filtered.reduce((s: number, c: any) => s + c.spend, 0);
    const totalConvValue = filtered.reduce((s: number, c: any) => s + c.conversionValue, 0);
    const totalConv = filtered.reduce((s: number, c: any) => s + c.conversions, 0);
    const totalClicks = filtered.reduce((s: number, c: any) => s + c.clicks, 0);
    const totalImpr = filtered.reduce((s: number, c: any) => s + c.impressions, 0);
    const videos = filtered.filter((c: any) => c.isVideo);
    const scores = videos.map((c: any) => c.videoMetrics?.videoEfficiencyScore).filter((s: any) => s != null);
    const avgScore = scores.length > 0 ? scores.reduce((s: number, v: number) => s + v, 0) / scores.length : null;

    return {
      creatives: filtered.length,
      videos: videos.length,
      spend: totalSpend,
      roas: totalSpend > 0 ? totalConvValue / totalSpend : 0,
      conversions: totalConv,
      convValue: totalConvValue,
      ctr: totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0,
      avgScore,
    };
  }, [filtered]);

  /* ── Toggle sort ────────────────────────────────── */
  const handleSort = useCallback((field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  }, [sortField, sortAsc]);

  /* ── Filtered sales data by source ──────────────── */
  const filteredSalesData = useMemo(() => {
    if (salesSourceFilter === "ALL") return salesData;
    return salesData.filter((a: any) => a.source === salesSourceFilter);
  }, [salesData, salesSourceFilter]);

  /* ── Available sources for filter chips ─────────── */
  const salesSources = useMemo(() => {
    const sources = new Set(salesData.map((a: any) => a.source));
    return Array.from(sources).sort();
  }, [salesData]);

  /* ── Auto-select first ad when filter changes ──── */
  useEffect(() => {
    if (filteredSalesData.length > 0) {
      // Only auto-select if current selection is not in filtered data
      const current = filteredSalesData.find((a: any) => a.adKey === selectedAd);
      if (!current) setSelectedAd(filteredSalesData[0].adKey);
    }
  }, [filteredSalesData]);

  /* ── Selected ad data for Ventas por Anuncio ──── */
  const selectedAdData = useMemo(() => {
    if (!selectedAd) return null;
    return salesData.find((a: any) => a.adKey === selectedAd) || null;
  }, [salesData, selectedAd]);

  /* ── Loading State ─────────────────────────────── */
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mr-3" />
        <span className="text-gray-500">Cargando creativos...</span>
      </div>
    );
  }

  const SortBtn = ({ field, label }: { field: string; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className={`text-[11px] px-1 transition-colors ${sortField === field ? "text-gray-900 font-semibold" : "text-gray-500 hover:text-gray-700"}`}
    >
      {label}{sortField === field && (sortAsc ? " \u2191" : " \u2193")}
    </button>
  );

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {modalUrl && <ThumbnailModal url={modalUrl} name="" onClose={() => setModalUrl(null)} />}

      {/* ── Header ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Creativos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rendimiento por funnel &middot; Score adaptado al objetivo de cada campana
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

      {/* ── Tab Bar ────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab("performance")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "performance" ? "bg-white shadow-sm text-indigo-600" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Film size={14} className="inline mr-1.5 -mt-0.5" />
          Performance
        </button>
        <button
          onClick={() => setActiveTab("sales")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "sales" ? "bg-white shadow-sm text-indigo-600" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <ShoppingCart size={14} className="inline mr-1.5 -mt-0.5" />
          Ventas por Anuncio
        </button>
      </div>

      {/* ══════════════════════════════════════════════
          TAB: PERFORMANCE
         ══════════════════════════════════════════════ */}
      {activeTab === "performance" && (
        <>
          {/* ── Funnel Summary Cards ──────────────────── */}
          {funnelBreakdown.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {funnelBreakdown.map((f: any) => {
                const config = FUNNEL_CONFIG[f.stage] || FUNNEL_CONFIG.UNKNOWN;
                const Icon = config.icon;
                const isActive = filterFunnel === f.stage;
                return (
                  <button
                    key={f.stage}
                    onClick={() => setFilterFunnel(isActive ? "ALL" : f.stage)}
                    className={`bg-white border rounded-xl p-3 text-left transition-all shadow-sm hover:shadow-md ${
                      isActive ? "border-indigo-400 ring-1 ring-indigo-200" : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon size={14} className={config.lightColor} />
                      <span className={`text-xs font-semibold ${config.lightColor}`}>{f.label}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-lg font-bold text-gray-900">{f.count}</span>
                        <span className="text-[10px] text-gray-500 ml-1">creativos</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-bold ${getRoasColor(f.roas)}`}>{f.roas.toFixed(1)}x</span>
                        <span className="text-[10px] text-gray-500 block">ROAS</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500">
                      <span>{formatARS(f.spend)}</span>
                      <span>{f.conversions} conv</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── KPI Summary Row ──────────────────────── */}
          {kpis && (
            <div className="flex flex-wrap items-center gap-3 px-1">
              {[
                { label: "Creativos", val: String(kpis.creatives), sub: `${kpis.videos} videos` },
                { label: "Spend", val: formatARS(kpis.spend) },
                { label: "ROAS", val: kpis.roas.toFixed(1) + "x", color: getRoasColor(kpis.roas) },
                { label: "Conv", val: String(kpis.conversions), sub: formatARS(kpis.convValue) },
                { label: "CTR", val: kpis.ctr.toFixed(2) + "%" },
                ...(kpis.avgScore !== null ? [{ label: "Avg Score", val: kpis.avgScore.toFixed(1), color: "text-gray-900" }] : []),
              ].map((k) => (
                <div key={k.label} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 uppercase">{k.label}:</span>
                  <span className={`text-sm font-bold ${k.color || "text-gray-900"}`}>{k.val}</span>
                  {k.sub && <span className="text-[10px] text-gray-400">({k.sub})</span>}
                </div>
              ))}
            </div>
          )}

          {/* ── Filters Bar ──────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Type filter */}
            <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm">
              {(["ALL", "VIDEO", "IMAGE"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    filterType === t ? "bg-indigo-600 text-white" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {t === "ALL" ? "Todos" : t === "VIDEO" ? "Video" : "Imagen"}
                </button>
              ))}
            </div>

            {/* Campaign filter */}
            {campaigns.length > 0 && (
              <select
                value={filterCampaign}
                onChange={(e) => setFilterCampaign(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 max-w-[200px] shadow-sm"
              >
                <option value="ALL">Todas las campanas</option>
                {campaigns.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    [{FUNNEL_CONFIG[c.funnelStage]?.shortLabel || "?"}] {c.name}
                  </option>
                ))}
              </select>
            )}

            {/* Active filter indicator */}
            {(filterFunnel !== "ALL" || filterCampaign !== "ALL") && (
              <button
                onClick={() => { setFilterFunnel("ALL"); setFilterCampaign("ALL"); }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 text-red-600 text-xs hover:bg-red-100 transition-colors"
              >
                <X size={12} /> Limpiar filtros
              </button>
            )}

            <span className="text-[10px] text-gray-400 ml-auto">{filtered.length} resultados</span>
          </div>

          {/* ── Creative Table (simplified) ──────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-[11px] text-gray-600 uppercase">
                    <th className="text-left px-3 py-2.5 w-8">#</th>
                    <th className="text-left px-2 py-2.5 w-12"></th>
                    <th className="text-left px-2 py-2.5"><SortBtn field="name" label="Creativo" /></th>
                    <th className="text-center px-2 py-2.5 w-10">Funnel</th>
                    <th className="text-center px-2 py-2.5 w-14"><SortBtn field="score" label="Score" /></th>
                    <th className="text-right px-2 py-2.5 w-20"><SortBtn field="spend" label="Spend" /></th>
                    <th className="text-right px-2 py-2.5 w-14"><SortBtn field="roas" label="ROAS" /></th>
                    <th className="text-right px-2 py-2.5 w-12"><SortBtn field="conv" label="Conv" /></th>
                    <th className="text-center px-2 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((c: any, i: number) => {
                    const isExpanded = expandedId === c.id;
                    const vm = c.videoMetrics;
                    return (
                      <React.Fragment key={c.id}>
                        <tr
                          className={`hover:bg-gray-50 cursor-pointer transition-colors ${
                            isExpanded ? "bg-gray-50" : ""
                          }`}
                          onClick={() => setExpandedId(isExpanded ? null : c.id)}
                        >
                          <td className="px-3 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-2 py-2.5">
                            <Thumbnail
                              url={c.mediaUrls?.[0]}
                              name={c.name}
                              onClickZoom={() => { setModalUrl(c.mediaUrls?.[0]); }}
                            />
                          </td>
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {c.isVideo ? <Video size={12} className="text-purple-500 shrink-0" /> : <Image size={12} className="text-blue-500 shrink-0" />}
                              <span className="text-gray-900 font-medium truncate max-w-[220px] text-xs">{c.name}</span>
                            </div>
                            <p className="text-[10px] text-gray-400 truncate max-w-[220px]">{c.campaignName || "-"}</p>
                          </td>
                          <td className="px-2 py-2.5 text-center"><FunnelBadge stage={c.funnelStage} /></td>
                          <td className="px-2 py-2.5 text-center"><ScorePill score={vm?.videoEfficiencyScore} /></td>
                          <td className="px-2 py-2.5 text-right text-gray-700 text-xs font-medium">{formatARS(c.spend)}</td>
                          <td className="px-2 py-2.5 text-right">
                            <span className={`text-xs font-bold ${getRoasColor(c.roas)}`}>{c.roas.toFixed(1)}x</span>
                          </td>
                          <td className="px-2 py-2.5 text-right text-gray-700 text-xs">{c.conversions}</td>
                          <td className="px-2 py-2.5 text-center">
                            {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={9}>
                              <ExpandedDetail creative={c} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-12">
                <Film size={40} className="mx-auto text-gray-300 mb-2" />
                <p className="text-gray-500 text-sm">No se encontraron creativos con estos filtros</p>
              </div>
            )}
          </div>

          {/* ── Score Explanation (collapsible) ────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <button
              onClick={() => setScoreOpen(!scoreOpen)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <Sparkles size={14} className="text-indigo-500" />
                Como funciona el Efficiency Score
              </h3>
              {scoreOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>
            {scoreOpen && (
              <div className="px-4 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-purple-50 border border-purple-100 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Eye size={14} className="text-purple-600" />
                      <span className="text-xs font-semibold text-purple-700">TOF - Awareness</span>
                    </div>
                    <p className="text-[11px] text-gray-600 leading-relaxed">
                      Prioriza hook rate y completion. Mide cuantos paran a mirar y cuanto ven del video.
                    </p>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {[{l:"Hook",w:35},{l:"Hold",w:25},{l:"Compl",w:20},{l:"Action",w:15},{l:"Conv",w:5}].map(x=>(
                        <span key={x.l} className="text-[9px] text-purple-600 bg-purple-100 px-1 py-0.5 rounded">{x.l} {x.w}%</span>
                      ))}
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <MousePointer size={14} className="text-blue-600" />
                      <span className="text-xs font-semibold text-blue-700">MOF - Consideracion</span>
                    </div>
                    <p className="text-[11px] text-gray-600 leading-relaxed">
                      Prioriza action rate y clicks. Mide cuantos interactuan y consideran tu producto.
                    </p>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {[{l:"Action",w:40},{l:"Hook",w:20},{l:"Hold",w:15},{l:"Conv",w:15},{l:"Compl",w:10}].map(x=>(
                        <span key={x.l} className="text-[9px] text-blue-600 bg-blue-100 px-1 py-0.5 rounded">{x.l} {x.w}%</span>
                      ))}
                    </div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <ShoppingCart size={14} className="text-emerald-600" />
                      <span className="text-xs font-semibold text-emerald-700">BOF - Conversion</span>
                    </div>
                    <p className="text-[11px] text-gray-600 leading-relaxed">
                      Prioriza conversiones y ROAS. Mide cuantos terminan comprando despues de ver el video.
                    </p>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {[{l:"Conv",w:30},{l:"ROAS",w:25},{l:"Action",w:25},{l:"Hook",w:10},{l:"Hold",w:5}].map(x=>(
                        <span key={x.l} className="text-[9px] text-emerald-600 bg-emerald-100 px-1 py-0.5 rounded">{x.l} {x.w}%</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════
          TAB: VENTAS POR ANUNCIO
         ══════════════════════════════════════════════ */}
      {activeTab === "sales" && (
        <>
          {salesLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mr-3" />
              <span className="text-gray-500">Cargando ventas por anuncio...</span>
            </div>
          ) : salesData.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <ShoppingCart size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">No se encontraron ventas atribuidas a anuncios en este periodo</p>
              <p className="text-gray-400 text-xs mt-1">Las ventas se atribuyen a anuncios a traves del parametro utm_content del pixel</p>
            </div>
          ) : (
            <>
            {/* Source Filter Chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 font-medium">Filtrar:</span>
              <button
                onClick={() => { setSalesSourceFilter("ALL"); setSelectedAd(null); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  salesSourceFilter === "ALL"
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                Todos ({salesData.length})
              </button>
              {salesSources.map((src) => {
                const info = SOURCE_ICONS[src] || SOURCE_ICONS.direct;
                const count = salesData.filter((a: any) => a.source === src).length;
                return (
                  <button
                    key={src}
                    onClick={() => { setSalesSourceFilter(src); setSelectedAd(null); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                      salesSourceFilter === src
                        ? "text-white"
                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                    }`}
                    style={salesSourceFilter === src ? { backgroundColor: info.color } : {}}
                  >
                    <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: salesSourceFilter === src ? "rgba(255,255,255,0.3)" : info.color }}>
                      {info.icon}
                    </span>
                    {info.label} ({count})
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Panel: Ad List */}
              <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900 text-sm">Anuncios con ventas</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{filteredSalesData.length} anuncios</p>
                </div>
                <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                  {filteredSalesData.map((ad: any) => {
                    const isSelected = selectedAd === ad.adKey;
                    const sourceInfo = SOURCE_ICONS[ad.source] || SOURCE_ICONS.direct;
                    return (
                      <button
                        key={ad.adKey}
                        onClick={() => setSelectedAd(ad.adKey)}
                        className={`w-full p-3 text-left transition-all hover:bg-gray-50 ${
                          isSelected ? "bg-indigo-50 border-l-2 border-indigo-500" : "border-l-2 border-transparent"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {ad.thumbnailUrl ? (
                            <img src={ad.thumbnailUrl} alt="" className="w-10 h-10 rounded-md object-cover bg-gray-100 shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          ) : (
                            <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 text-white text-xs font-bold" style={{ backgroundColor: sourceInfo.color }}>
                              {sourceInfo.icon}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-900 truncate">{ad.adName}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="w-3 h-3 rounded-full flex items-center justify-center text-[7px] font-bold text-white" style={{ backgroundColor: sourceInfo.color }}>
                                {sourceInfo.icon}
                              </span>
                              <p className="text-[10px] text-gray-400 truncate">{ad.campaign || ad.medium || sourceInfo.label}</p>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs font-bold text-gray-900">{formatARS(ad.revenue)}</span>
                              <span className="text-[10px] text-gray-400">{ad.orders} ord</span>
                              <span className="text-[10px] text-gray-400">{ad.units} uds</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Panel: Detail */}
              <div className="lg:col-span-2 space-y-4">
                {selectedAdData ? (
                  <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "Revenue", value: formatARS(selectedAdData.revenue), icon: <ShoppingCart size={16} className="text-green-600" />, bg: "bg-green-50" },
                        { label: "Ordenes", value: String(selectedAdData.orders), icon: <Package size={16} className="text-indigo-600" />, bg: "bg-indigo-50" },
                        { label: "Unidades", value: String(selectedAdData.units), icon: <BarChart3 size={16} className="text-blue-600" />, bg: "bg-blue-50" },
                        { label: "Ticket Prom.", value: selectedAdData.orders > 0 ? formatARS(selectedAdData.revenue / selectedAdData.orders) : "-", icon: <Target size={16} className="text-amber-600" />, bg: "bg-amber-50" },
                      ].map((kpi) => (
                        <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center`}>{kpi.icon}</div>
                          </div>
                          <p className="text-lg font-bold text-gray-900">{kpi.value}</p>
                          <p className="text-[10px] text-gray-500 uppercase">{kpi.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Product Cards */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                      <div className="p-4 border-b border-gray-200">
                        <h3 className="font-semibold text-gray-900 text-sm">Productos vendidos</h3>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {(selectedAdData.products || []).map((product: any, idx: number) => (
                          <div key={idx} className="p-3 flex items-center gap-3 hover:bg-gray-50">
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover bg-gray-100 shrink-0" />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                                <Package size={16} className="text-gray-400" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900 truncate">{product.name || "Producto"}</p>
                              {product.sku && <p className="text-[10px] text-gray-400">SKU: {product.sku}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-bold text-gray-900">{formatARS(product.revenue)}</p>
                              <p className="text-[10px] text-gray-400">{product.units} uds</p>
                            </div>
                          </div>
                        ))}
                        {(!selectedAdData.products || selectedAdData.products.length === 0) && (
                          <div className="p-8 text-center text-gray-400 text-sm">Sin detalle de productos</div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                    <ArrowRight size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-500 text-sm">Selecciona un anuncio para ver el detalle</p>
                  </div>
                )}
              </div>
            </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
