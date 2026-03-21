// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import { KpiCard, DateRangeFilter } from "@/components/dashboard";
import {
  DollarSign, Eye, MousePointer, ShoppingCart, Target, Zap,
  Users, Radio, ArrowUp, ArrowDown, Download, TrendingUp,
  ArrowUpRight, ArrowDownRight, GripVertical, AlertTriangle,
  BarChart3, Layers, ChevronRight, RefreshCw, Image, Film,
  Tag, Palette, Sparkles,
} from "lucide-react";

/* ── Constants ─────────────────────────────────────── */

const QUICK_RANGES = [
  { label: "7 dias", days: 7 },
  { label: "14 dias", days: 14 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

function toDateInputValue(d: Date) { return d.toISOString().split("T")[0]; }

const FUNNEL_STAGES = [
  { key: "TOF", label: "Top of Funnel", sublabel: "Awareness & Reach", color: "#8b5cf6", bgColor: "bg-purple-50", borderColor: "border-purple-200", textColor: "text-purple-700" },
  { key: "MOF", label: "Mid Funnel", sublabel: "Consideration & Traffic", color: "#3b82f6", bgColor: "bg-blue-50", borderColor: "border-blue-200", textColor: "text-blue-700" },
  { key: "BOF", label: "Bottom of Funnel", sublabel: "Conversions & Sales", color: "#10b981", bgColor: "bg-green-50", borderColor: "border-green-200", textColor: "text-green-700" },
];

const ROAS_TARGETS: Record<string, { min: number; good: number }> = {
  TOF: { min: 0.5, good: 1.0 },
  MOF: { min: 1.0, good: 1.5 },
  BOF: { min: 2.0, good: 3.0 },
};

/* ── Small Components ──────────────────────────────── */

function RoasBadge({ value, stage }: { value: number; stage?: string }) {
  const targets = stage ? ROAS_TARGETS[stage] : { min: 1.5, good: 3 };
  const color = value >= (targets?.good || 3) ? "text-green-600 bg-green-50" :
    value >= (targets?.min || 1.5) ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";
  return <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${color}`}>{value}x</span>;
}

function ChangeBadge({ value }: { value: number }) {
  if (!value || value === 0) return <span className="text-xs text-gray-400">--</span>;
  const pos = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${pos ? "text-emerald-600" : "text-red-500"}`}>
      {pos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function FrequencyGauge({ value }: { value: number }) {
  const pct = Math.min((value / 7) * 100, 100);
  const color = value <= 3 ? "#10b981" : value <= 5 ? "#f59e0b" : "#ef4444";
  const label = value <= 3 ? "Saludable" : value <= 5 ? "Monitorear" : "Fatiga";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">Frecuencia Promedio</span>
        <span className="font-bold" style={{ color }}>{value.toFixed(1)}x/semana</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="text-[10px] mt-0.5 text-right" style={{ color }}>{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    PAUSED: "bg-amber-100 text-amber-700",
    ARCHIVED: "bg-gray-100 text-gray-500",
    DELETED: "bg-red-100 text-red-600",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${colors[status] || "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

function FunnelStageBadge({ stage }: { stage: string }) {
  const cfg = FUNNEL_STAGES.find((f) => f.key === stage);
  if (!cfg) return <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Sin asignar</span>;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.bgColor} ${cfg.textColor}`}>
      {cfg.key}
    </span>
  );
}

/* ── Funnel Drop Zone Component ────────────────────── */

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

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  };

  const handleDrop = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    if (draggedId) {
      onAssign(draggedId, stage);
    }
    setDraggedId(null);
    setDragOverStage(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverStage(null);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Layers size={18} className="text-purple-600" />
            Funnel de Campanas
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">Arrastra campanas entre etapas del funnel para clasificarlas</p>
        </div>
      </div>

      {/* Funnel Stages */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {FUNNEL_STAGES.map((stage) => {
          const summary = funnelSummary.find((f: any) => f.stage === stage.key);
          const stageCampaigns = grouped[stage.key] || [];
          const isDragOver = dragOverStage === stage.key;
          return (
            <div
              key={stage.key}
              onDragOver={(e) => handleDragOver(e, stage.key)}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => handleDrop(e, stage.key)}
              className={`rounded-xl border-2 transition-all duration-200 ${
                isDragOver ? `${stage.borderColor} bg-opacity-50 shadow-lg scale-[1.01]` : "border-gray-100"
              } ${stage.bgColor} bg-opacity-30`}
            >
              {/* Stage Header */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className={`font-semibold text-sm ${stage.textColor}`}>{stage.label}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{stageCampaigns.length} campanas</span>
                </div>
                <p className="text-[10px] text-gray-500">{stage.sublabel}</p>
                {/* Stage KPIs */}
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
              {/* Campaign Cards */}
              <div className="p-3 space-y-2 max-h-[280px] overflow-y-auto">
                {stageCampaigns.length === 0 && (
                  <div className={`border-2 border-dashed rounded-lg p-4 text-center ${stage.borderColor}`}>
                    <p className="text-xs text-gray-400">Arrastra campanas aqui</p>
                  </div>
                )}
                {stageCampaigns.map((c: any) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, c.id)}
                    onDragEnd={handleDragEnd}
                    className={`bg-white rounded-lg border border-gray-200 p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all group ${
                      draggedId === c.id ? "opacity-40 scale-95" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical size={14} className="text-gray-300 mt-0.5 flex-shrink-0 group-hover:text-gray-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-900 truncate" title={c.name}>{c.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-500">{formatARS(c.spend)}</span>
                          <span className="text-[10px] text-gray-300">|</span>
                          <RoasBadge value={c.roas} stage={stage.key} />
                          <span className="text-[10px] text-gray-300">|</span>
                          <StatusBadge status={c.status} />
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

      {/* Unassigned campaigns */}
      {(grouped.UNKNOWN || []).length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            <AlertTriangle size={12} className="text-amber-500" />
            {grouped.UNKNOWN.length} campana(s) sin clasificar - arrastralas a una etapa
          </p>
          <div className="flex flex-wrap gap-2">
            {grouped.UNKNOWN.map((c: any) => (
              <div
                key={c.id}
                draggable
                onDragStart={(e) => handleDragStart(e, c.id)}
                onDragEnd={handleDragEnd}
                className={`bg-gray-50 rounded-lg border border-gray-200 px-3 py-2 cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${
                  draggedId === c.id ? "opacity-40 scale-95" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <GripVertical size={12} className="text-gray-300" />
                  <span className="text-xs font-medium text-gray-700 truncate max-w-[200px]">{c.name}</span>
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

/* ── Funnel Flow Visualization ────────────────────── */

function FunnelFlowChart({ funnelSummary, totals }: { funnelSummary: any[]; totals: any }) {
  const stages = ["TOF", "MOF", "BOF"];
  const orderedData = stages.map((s) => funnelSummary.find((f: any) => f.stage === s)).filter(Boolean);

  if (orderedData.length === 0) return null;

  const totalSpend = totals.spend || 1;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <BarChart3 size={18} className="text-indigo-600" />
        Budget Allocation por Funnel
      </h3>
      <div className="space-y-4">
        {orderedData.map((data: any, i: number) => {
          const cfg = FUNNEL_STAGES.find((f) => f.key === data.stage)!;
          const pct = ((data.spend / totalSpend) * 100).toFixed(1);
          const idealPct = data.stage === "TOF" ? 60 : data.stage === "MOF" ? 25 : 15;
          const deviation = Number(pct) - idealPct;
          return (
            <div key={data.stage}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                  <span className="text-sm font-medium text-gray-900">{cfg.label}</span>
                  <span className="text-[10px] text-gray-400">{data.campaigns} campanas</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-900">{pct}%</span>
                  <span className="text-[10px] text-gray-400">(ideal: {idealPct}%)</span>
                  {Math.abs(deviation) > 10 && (
                    <AlertTriangle size={12} className="text-amber-500" />
                  )}
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-4 relative">
                <div
                  className="h-4 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(Number(pct), 2)}%`, backgroundColor: cfg.color, opacity: 0.8 }}
                />
                {/* Ideal marker */}
                <div
                  className="absolute top-0 h-4 w-0.5 bg-gray-400"
                  style={{ left: `${idealPct}%` }}
                  title={`Ideal: ${idealPct}%`}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-[10px]">
                <span className="text-gray-400">Gasto: {formatARS(data.spend)}</span>
                <span className="text-gray-400">ROAS: {data.roas}x</span>
                <span className="text-gray-400">CPA: {formatARS(data.costPerConversion || 0)}</span>
                <span className="text-gray-400">CTR: {data.ctr}%</span>
              </div>
            </div>
          );
        })}
      </div>
      {/* Recommendation */}
      {orderedData.length >= 2 && (() => {
        const tofPct = orderedData.find((d: any) => d.stage === "TOF")
          ? (orderedData.find((d: any) => d.stage === "TOF").spend / totalSpend) * 100 : 0;
        const bofPct = orderedData.find((d: any) => d.stage === "BOF")
          ? (orderedData.find((d: any) => d.stage === "BOF").spend / totalSpend) * 100 : 0;
        if (tofPct < 40) {
          return (
            <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-xs text-purple-700">
                <strong>Recomendacion:</strong> Tu inversion en TOF ({tofPct.toFixed(0)}%) esta por debajo del ideal (60%).
                Considera aumentar el presupuesto en awareness para alimentar el funnel.
              </p>
            </div>
          );
        }
        if (bofPct > 40) {
          return (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">
                <strong>Atencion:</strong> Tu inversion en BOF ({bofPct.toFixed(0)}%) es alta. Si el ROAS baja,
                probablemente tu audiencia de retargeting se esta agotando.
              </p>
            </div>
          );
        }
        return null;
      })()}
    </div>
  );
}

/* ── Main Component ────────────────────────────────── */

export default function MetaAdsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(toDateInputValue(new Date(Date.now() - 30 * 86400000)));
  const [dateTo, setDateTo] = useState(toDateInputValue(new Date()));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(30);
  const [sortField, setSortField] = useState("spend");
  const [sortAsc, setSortAsc] = useState(false);
  const [chartMode, setChartMode] = useState<"spend" | "roas" | "reach">("spend");
  const [activeTab, setActiveTab] = useState<"funnel" | "campaigns" | "performance" | "creatives">("funnel");
  const [adsData, setAdsData] = useState<any>(null);
  const [adsLoading, setAdsLoading] = useState(false);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [draggedAdId, setDraggedAdId] = useState<string | null>(null);
  const [dragOverType, setDragOverType] = useState<string | null>(null);

  /* ── Fetch ─────────────────────────────────────── */
  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/metrics/campaigns?platform=META&from=${dateFrom}&to=${dateTo}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch ads when switching to creatives tab
  const fetchAds = useCallback(() => {
    setAdsLoading(true);
    const classParam = classFilter ? `&classification=${classFilter}` : "";
    fetch(`/api/metrics/ads?platform=META&from=${dateFrom}&to=${dateTo}${classParam}`)
      .then((r) => r.json())
      .then((d) => setAdsData(d))
      .catch(() => {})
      .finally(() => setAdsLoading(false));
  }, [dateFrom, dateTo, classFilter]);

  useEffect(() => {
    if (activeTab === "creatives") fetchAds();
  }, [activeTab, fetchAds]);

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

  /* ── Funnel assign handler ─────────────────────── */
  const handleFunnelAssign = useCallback(async (campaignId: string, stage: string) => {
    try {
      await fetch("/api/metrics/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, funnelStage: stage }),
      });
      fetchData(); // Refresh
    } catch (e) {
      console.error("Failed to assign funnel stage:", e);
    }
  }, [fetchData]);

  /* ── Classification drag handler ──────────────── */
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
  const globalCpm = totals.impressions > 0 ? (totals.spend / totals.impressions * 1000).toFixed(0) : "0";
  const globalFrequency = totals.reach > 0 ? (totals.impressions / totals.reach).toFixed(1) : "0";
  const globalCostPerConv = totals.conversions > 0 ? (totals.spend / totals.conversions).toFixed(0) : "0";

  // Active vs paused count
  const activeCount = campaigns.filter((c: any) => c.status === "ACTIVE").length;
  const pausedCount = campaigns.filter((c: any) => c.status === "PAUSED").length;

  // Frequency fatigue detection
  const highFreqCampaigns = campaigns.filter((c: any) => c.frequency > 5);

  /* ── Sort helpers ──────────────────────────────── */
  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };
  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortAsc ? <ArrowUp className="w-3 h-3 inline ml-0.5" /> : <ArrowDown className="w-3 h-3 inline ml-0.5" />;
  };

  /* ── CSV Export ─────────────────────────────────── */
  const exportCSV = () => {
    const headers = ["Campana", "Estado", "Funnel", "Objetivo", "Gasto", "Impresiones", "Clicks", "CTR%", "CPC", "CPM", "Conversiones", "Revenue", "ROAS", "Reach", "Frecuencia"];
    const rows = campaigns.map((c: any) => [
      `"${c.name.replace(/"/g, '""')}"`, c.status, c.funnelStage, c.objective || "",
      c.spend.toFixed(2), c.impressions, c.clicks, c.ctr, c.cpc.toFixed(2), c.cpm.toFixed(2),
      c.conversions, c.conversionValue.toFixed(2), c.roas, c.reach, c.frequency,
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `meta_ads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  /* ── Loading ───────────────────────────────────── */
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mr-3" />
        <span className="text-gray-500">Cargando Meta Ads...</span>
      </div>
    );
  }

  /* ── Render ────────────────────────────────────── */
  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 008.44-9.9c0-5.53-4.5-10.02-10-10.02z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Meta Ads</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Facebook & Instagram Ads &middot; {dateFrom} a {dateTo}
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
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          {pausedCount} pausadas
        </span>
        <span className="flex items-center gap-1.5">
          {campaigns.length} campanas total
        </span>
        {highFreqCampaigns.length > 0 && (
          <span className="flex items-center gap-1.5 text-red-500 font-medium">
            <AlertTriangle size={12} />
            {highFreqCampaigns.length} con fatiga de frecuencia
          </span>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiCard icon={<DollarSign size={14} className="text-red-600" />} iconBg="bg-red-50" label="Inversion" value={formatARS(totals.spend || 0)} change={changes.spend} />
        <KpiCard icon={<Eye size={14} className="text-purple-600" />} iconBg="bg-purple-50" label="Impresiones" value={formatCompact(totals.impressions || 0)} change={changes.impressions} />
        <KpiCard icon={<Users size={14} className="text-blue-600" />} iconBg="bg-blue-50" label="Alcance" value={formatCompact(totals.reach || 0)} change={changes.reach} />
        <KpiCard icon={<MousePointer size={14} className="text-indigo-600" />} iconBg="bg-indigo-50" label="Clicks" value={formatCompact(totals.clicks || 0)} change={changes.clicks} />
        <KpiCard icon={<ShoppingCart size={14} className="text-green-600" />} iconBg="bg-green-50" label="Conversiones" value={String(totals.conversions || 0)} change={changes.conversions} />
        <KpiCard icon={<Target size={14} className="text-purple-600" />} iconBg="bg-purple-50" label="ROAS" value={`${globalRoas}x`} change={changes.roas} />
        <KpiCard icon={<Zap size={14} className="text-amber-600" />} iconBg="bg-amber-50" label="CTR" value={`${globalCtr}%`} subtitle={`CPM: ${formatARS(Number(globalCpm))}`} />
        <KpiCard icon={<Radio size={14} className="text-cyan-600" />} iconBg="bg-cyan-50" label="Frecuencia" value={`${globalFrequency}x`} subtitle={`CPA: ${formatARS(Number(globalCostPerConv))}`} />
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex">
            {([
              { key: "funnel" as const, label: "Funnel & Budget", icon: <Layers size={14} /> },
              { key: "performance" as const, label: "Performance", icon: <TrendingUp size={14} /> },
              { key: "creatives" as const, label: "Creativos", icon: <Palette size={14} /> },
              { key: "campaigns" as const, label: "Campanas", icon: <BarChart3 size={14} /> },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium border-b-2 transition-all ${
                  activeTab === tab.key
                    ? "border-purple-600 text-purple-600 bg-purple-50/50"
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
          {/* ── TAB: Funnel & Budget ──────────────────── */}
          {activeTab === "funnel" && (
            <div className="p-6 space-y-6">
              {/* Funnel Board with drag-and-drop */}
              <FunnelBoard
                campaigns={campaigns}
                funnelSummary={funnelSummary}
                onAssign={handleFunnelAssign}
              />

              {/* Funnel Budget Allocation */}
              <FunnelFlowChart funnelSummary={funnelSummary} totals={totals} />
            </div>
          )}

          {/* ── TAB: Performance ─────────────────────── */}
          {activeTab === "performance" && (
            <div className="p-6 space-y-6">
              {/* Chart Modes */}
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Tendencia Diaria</h3>
                <div className="bg-gray-100 p-1 rounded-lg inline-flex gap-1">
                  {([
                    { key: "spend" as const, label: "Gasto" },
                    { key: "roas" as const, label: "ROAS" },
                    { key: "reach" as const, label: "Alcance" },
                  ]).map((m) => (
                    <button key={m.key} onClick={() => setChartMode(m.key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                        chartMode === m.key ? "bg-white shadow-sm text-purple-600" : "text-gray-500 hover:text-gray-700"
                      }`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {dailyTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  {chartMode === "spend" ? (
                    <AreaChart data={dailyTrend}>
                      <defs>
                        <linearGradient id="metaSpendGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
                      <Tooltip formatter={(v: number) => [formatARS(v), "Gasto Meta"]} labelFormatter={(d) => new Date(d).toLocaleDateString("es-AR")} />
                      <Area type="monotone" dataKey="META" fill="url(#metaSpendGrad)" stroke="#8b5cf6" strokeWidth={2} />
                    </AreaChart>
                  ) : chartMode === "roas" ? (
                    <LineChart data={dailyTrend.map((d: any) => ({
                      date: d.date,
                      roas: d.META > 0 ? Math.round((d.conversionValue / d.META) * 100) / 100 : 0,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}x`} />
                      <Tooltip formatter={(v: number) => [`${v}x`, "ROAS"]} />
                      <Line type="monotone" dataKey="roas" stroke="#10b981" strokeWidth={2} dot={false} />
                    </LineChart>
                  ) : (
                    <AreaChart data={dailyTrend}>
                      <defs>
                        <linearGradient id="reachGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
                      <Tooltip formatter={(v: number) => [formatCompact(v), "Alcance"]} />
                      <Area type="monotone" dataKey="reach" fill="url(#reachGrad)" stroke="#3b82f6" strokeWidth={2} />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <div className="h-[350px] flex items-center justify-center text-gray-400">Sin datos de tendencia</div>
              )}

              {/* Frequency Gauge + Creative Fatigue Alerts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4">Salud de Audiencia</h4>
                  <FrequencyGauge value={Number(globalFrequency)} />
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Alcance Total</span>
                      <span className="font-bold">{formatCompact(totals.reach || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Impresiones / Persona</span>
                      <span className="font-bold">{globalFrequency}x</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">CPM Promedio</span>
                      <span className="font-bold">{formatARS(Number(globalCpm))}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-500" />
                    Alertas de Fatiga Creativa
                  </h4>
                  {highFreqCampaigns.length === 0 ? (
                    <div className="flex items-center gap-2 text-green-600 text-xs p-3 bg-green-50 rounded-lg">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Ninguna campana muestra signos de fatiga. Todo bien.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[160px] overflow-y-auto">
                      {highFreqCampaigns.map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between p-2 bg-red-50 rounded-lg border border-red-100">
                          <span className="text-xs text-red-700 truncate max-w-[200px]" title={c.name}>{c.name}</span>
                          <span className="text-xs font-bold text-red-600">{c.frequency}x freq</span>
                        </div>
                      ))}
                      <p className="text-[10px] text-gray-400 pt-1">
                        Campanas con frecuencia mayor a 5x por semana. Considera refrescar los creativos o pausar.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: Creativos ──────────────────────── */}
          {activeTab === "creatives" && (
            <div className="p-6 space-y-6">
              {adsLoading && !adsData ? (
                <div className="flex items-center justify-center h-48">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mr-3" />
                  <span className="text-gray-500">Cargando creativos...</span>
                </div>
              ) : !adsData?.creatives?.length ? (
                <div className="text-center py-16">
                  <Palette className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-1">No hay creativos sincronizados aun</p>
                  <p className="text-xs text-gray-400">Los creativos se sincronizan con el proximo sync de datos</p>
                </div>
              ) : (
                <>
                  {/* Classification Breakdown Chart */}
                  {adsData.classificationBreakdown?.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Sparkles size={16} className="text-purple-600" />
                        Performance por Tipo de Creativo
                      </h3>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* ROAS by Type */}
                        <div>
                          <p className="text-xs text-gray-500 mb-3 font-medium">ROAS por Tipo</p>
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={adsData.classificationBreakdown} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}x`} />
                              <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={80} />
                              <Tooltip formatter={(v: number) => [`${v}x`, "ROAS"]} />
                              <Bar dataKey="roas" radius={[0, 4, 4, 0]}>
                                {adsData.classificationBreakdown.map((entry: any, i: number) => (
                                  <Cell key={i} fill={entry.color} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        {/* Spend by Type */}
                        <div>
                          <p className="text-xs text-gray-500 mb-3 font-medium">Inversion por Tipo</p>
                          <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                              <Pie
                                data={adsData.classificationBreakdown}
                                cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                                dataKey="spend" nameKey="label"
                                paddingAngle={2}
                              >
                                {adsData.classificationBreakdown.map((entry: any, i: number) => (
                                  <Cell key={i} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(v: number) => [formatARS(v), "Gasto"]} />
                              <Legend
                                verticalAlign="bottom"
                                iconType="circle"
                                iconSize={8}
                                formatter={(value: string) => <span className="text-xs text-gray-600">{value}</span>}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Classification Summary Cards */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-5">
                        {adsData.classificationBreakdown.map((cls: any) => (
                          <button
                            key={cls.type}
                            onClick={() => setClassFilter(classFilter === cls.type ? null : cls.type)}
                            className={`p-3 rounded-lg border transition-all text-left ${
                              classFilter === cls.type
                                ? "border-purple-400 bg-purple-50 shadow-sm"
                                : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cls.color }} />
                              <span className="text-xs font-semibold text-gray-700">{cls.label}</span>
                              <span className="text-[10px] text-gray-400 ml-auto">{cls.count}</span>
                            </div>
                            <div className="text-sm font-bold text-gray-900">{formatARS(cls.spend)}</div>
                            <div className="flex gap-3 mt-1">
                              <span className="text-[10px] text-gray-500">ROAS: <b>{cls.roas}x</b></span>
                              <span className="text-[10px] text-gray-500">CTR: <b>{cls.ctr}%</b></span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Classification Drag & Drop Board */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                          <Tag size={16} className="text-purple-600" />
                          Clasificacion de Creativos
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Arrastra anuncios entre categorias para reclasificar. La IA clasifica automaticamente y vos podes corregir.
                        </p>
                      </div>
                      {classFilter && (
                        <button onClick={() => setClassFilter(null)} className="text-xs text-purple-600 hover:underline">
                          Ver todos
                        </button>
                      )}
                    </div>

                    {/* Classification Columns */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                      {(adsData.classificationTypes || []).slice(0, 10).map((ct: any) => {
                        const typeCreatives = adsData.creatives.filter((c: any) => c.classification === ct.value);
                        const isDragOver = dragOverType === ct.value;
                        if (classFilter && classFilter !== ct.value && typeCreatives.length === 0) return null;

                        return (
                          <div
                            key={ct.value}
                            onDragOver={(e) => { e.preventDefault(); setDragOverType(ct.value); }}
                            onDragLeave={() => setDragOverType(null)}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggedAdId) handleClassificationChange(draggedAdId, ct.value);
                              setDraggedAdId(null);
                              setDragOverType(null);
                            }}
                            className={`rounded-xl border-2 transition-all ${
                              isDragOver ? "border-purple-400 bg-purple-50 shadow-lg scale-[1.01]" : "border-gray-100"
                            }`}
                          >
                            <div className="p-3 border-b border-gray-100">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ct.color }} />
                                <span className="text-xs font-semibold text-gray-700">{ct.label}</span>
                                <span className="text-[10px] text-gray-400 ml-auto">{typeCreatives.length}</span>
                              </div>
                            </div>
                            <div className="p-2 space-y-1.5 max-h-[300px] overflow-y-auto">
                              {typeCreatives.length === 0 && (
                                <div className="border-2 border-dashed border-gray-200 rounded-lg p-3 text-center">
                                  <p className="text-[10px] text-gray-400">Arrastra aqui</p>
                                </div>
                              )}
                              {typeCreatives.slice(0, 8).map((ad: any) => (
                                <div
                                  key={ad.id}
                                  draggable
                                  onDragStart={() => setDraggedAdId(ad.id)}
                                  onDragEnd={() => { setDraggedAdId(null); setDragOverType(null); }}
                                  className={`bg-white rounded-lg border border-gray-200 p-2 cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${
                                    draggedAdId === ad.id ? "opacity-40 scale-95" : ""
                                  }`}
                                >
                                  <div className="flex items-start gap-1.5">
                                    <GripVertical size={10} className="text-gray-300 mt-0.5 flex-shrink-0" />
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[10px] font-medium text-gray-900 truncate" title={ad.name}>{ad.name}</p>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[9px] text-gray-400">{formatARS(ad.spend)}</span>
                                        <span className="text-[9px] text-gray-300">|</span>
                                        <span className="text-[9px] font-medium" style={{ color: ad.roas >= 3 ? "#10b981" : ad.roas >= 1 ? "#f59e0b" : "#ef4444" }}>{ad.roas}x</span>
                                      </div>
                                      {ad.classificationManual && (
                                        <span className="text-[8px] text-purple-500 mt-0.5 inline-block">manual</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {typeCreatives.length > 8 && (
                                <p className="text-[9px] text-gray-400 text-center py-1">+{typeCreatives.length - 8} mas</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Creatives Table */}
                  <div className="bg-white rounded-xl border border-gray-200">
                    <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Film size={16} className="text-purple-600" />
                        Todos los Creativos ({adsData.creatives.length})
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Anuncio</th>
                            <th className="px-3 py-3 text-center font-semibold text-gray-700">Tipo</th>
                            <th className="px-3 py-3 text-center font-semibold text-gray-700">Clasificacion</th>
                            <th className="px-3 py-3 text-right font-semibold text-gray-700">Gasto</th>
                            <th className="px-3 py-3 text-right font-semibold text-gray-700">Impr.</th>
                            <th className="px-3 py-3 text-right font-semibold text-gray-700">Clicks</th>
                            <th className="px-3 py-3 text-right font-semibold text-gray-700">CTR</th>
                            <th className="px-3 py-3 text-right font-semibold text-gray-700">Conv.</th>
                            <th className="px-3 py-3 text-right font-semibold text-gray-700">Revenue</th>
                            <th className="px-3 py-3 text-center font-semibold text-gray-700">ROAS</th>
                            <th className="px-3 py-3 text-right font-semibold text-gray-700">CPA</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {adsData.creatives.map((ad: any) => {
                            const clsInfo = adsData.classificationTypes?.find((ct: any) => ct.value === ad.classification);
                            return (
                              <tr key={ad.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900 truncate max-w-[220px]" title={ad.name}>{ad.name}</div>
                                  <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[220px]" title={ad.campaignName}>{ad.campaignName}</div>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{ad.type}</span>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <span
                                    className="text-[10px] px-2 py-0.5 rounded-full font-medium text-white"
                                    style={{ backgroundColor: clsInfo?.color || "#6B7280" }}
                                  >
                                    {clsInfo?.label || ad.classification}
                                  </span>
                                  {ad.classificationManual && (
                                    <span className="ml-1 text-[8px] text-purple-500">manual</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-right text-gray-700 font-medium">{formatARS(ad.spend)}</td>
                                <td className="px-3 py-3 text-right text-gray-700">{formatCompact(ad.impressions)}</td>
                                <td className="px-3 py-3 text-right text-gray-700">{formatCompact(ad.clicks)}</td>
                                <td className="px-3 py-3 text-right text-gray-700">{ad.ctr}%</td>
                                <td className="px-3 py-3 text-right text-gray-700">{ad.conversions}</td>
                                <td className="px-3 py-3 text-right text-gray-700 font-medium">{formatARS(ad.conversionValue)}</td>
                                <td className="px-3 py-3 text-center"><RoasBadge value={ad.roas} /></td>
                                <td className="px-3 py-3 text-right text-gray-700">{formatARS(ad.costPerConversion)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── TAB: Campaigns Table ─────────────────── */}
          {activeTab === "campaigns" && (
            <div>
              <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  Campanas Meta ({campaigns.length})
                </h3>
                <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors">
                  <Download className="w-4 h-4" /> Exportar CSV
                </button>
              </div>
              {sorted.length === 0 ? (
                <div className="p-12 text-center text-gray-400">No hay campanas Meta con datos en este periodo.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Campana</th>
                        <th className="px-3 py-3 text-center font-semibold text-gray-700">Funnel</th>
                        <th className="px-3 py-3 text-center font-semibold text-gray-700">Estado</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("spend")}>Gasto<SortIcon field="spend" /></th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("impressions")}>Impr.<SortIcon field="impressions" /></th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("reach")}>Alcance<SortIcon field="reach" /></th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("clicks")}>Clicks<SortIcon field="clicks" /></th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("ctr")}>CTR<SortIcon field="ctr" /></th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("cpm")}>CPM<SortIcon field="cpm" /></th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("conversions")}>Conv.<SortIcon field="conversions" /></th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("conversionValue")}>Revenue<SortIcon field="conversionValue" /></th>
                        <th className="px-3 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("roas")}>ROAS<SortIcon field="roas" /></th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("frequency")}>Freq.<SortIcon field="frequency" /></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sorted.map((c: any) => (
                        <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900 truncate max-w-[220px]" title={c.name}>{c.name}</div>
                            {c.objective && <div className="text-[10px] text-gray-400 mt-0.5">{c.objective.replace(/^FUNNEL:(TOF|MOF|BOF)\|/, "")}</div>}
                          </td>
                          <td className="px-3 py-3 text-center"><FunnelStageBadge stage={c.funnelStage} /></td>
                          <td className="px-3 py-3 text-center"><StatusBadge status={c.status} /></td>
                          <td className="px-3 py-3 text-right text-gray-700 font-medium">{formatARS(c.spend)}</td>
                          <td className="px-3 py-3 text-right text-gray-700">{formatCompact(c.impressions)}</td>
                          <td className="px-3 py-3 text-right text-gray-700">{formatCompact(c.reach)}</td>
                          <td className="px-3 py-3 text-right text-gray-700">{formatCompact(c.clicks)}</td>
                          <td className="px-3 py-3 text-right text-gray-700">{c.ctr}%</td>
                          <td className="px-3 py-3 text-right text-gray-700">{formatARS(c.cpm)}</td>
                          <td className="px-3 py-3 text-right text-gray-700">{c.conversions}</td>
                          <td className="px-3 py-3 text-right text-gray-700 font-medium">{formatARS(c.conversionValue)}</td>
                          <td className="px-3 py-3 text-center"><RoasBadge value={c.roas} stage={c.funnelStage} /></td>
                          <td className={`px-3 py-3 text-right font-medium ${c.frequency > 5 ? "text-red-600" : c.frequency > 3 ? "text-amber-600" : "text-gray-700"}`}>
                            {c.frequency}x
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                      <tr className="font-bold">
                        <td className="px-4 py-3 text-gray-900">TOTAL</td>
                        <td /><td />
                        <td className="px-3 py-3 text-right text-gray-900">{formatARS(totals.spend || 0)}</td>
                        <td className="px-3 py-3 text-right text-gray-900">{formatCompact(totals.impressions || 0)}</td>
                        <td className="px-3 py-3 text-right text-gray-900">{formatCompact(totals.reach || 0)}</td>
                        <td className="px-3 py-3 text-right text-gray-900">{formatCompact(totals.clicks || 0)}</td>
                        <td className="px-3 py-3 text-right text-gray-900">{globalCtr}%</td>
                        <td className="px-3 py-3 text-right text-gray-900">{formatARS(Number(globalCpm))}</td>
                        <td className="px-3 py-3 text-right text-gray-900">{totals.conversions || 0}</td>
                        <td className="px-3 py-3 text-right text-gray-900">{formatARS(totals.conversionValue || 0)}</td>
                        <td className="px-3 py-3 text-center"><RoasBadge value={Number(globalRoas)} /></td>
                        <td className="px-3 py-3 text-right text-gray-900">{globalFrequency}x</td>
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
