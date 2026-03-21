// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, LineChart, Line,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import { KpiCard, DateRangeFilter } from "@/components/dashboard";
import {
  DollarSign, Eye, MousePointer, ShoppingCart, TrendingUp,
  TrendingDown, ArrowUp, ArrowDown, Download, Target, Zap,
  BarChart3, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

/* ── Constants ─────────────────────────────────────── */

const QUICK_RANGES = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

type PlatformFilter = "ALL" | "GOOGLE" | "META";

const PLATFORM_COLORS: Record<string, string> = {
  META: "#8b5cf6",
  GOOGLE: "#3b82f6",
  TIKTOK: "#06b6d4",
};

const PLATFORM_LABELS: Record<string, string> = {
  META: "Meta Ads",
  GOOGLE: "Google Ads",
  TIKTOK: "TikTok Ads",
};

function toDateInputValue(d: Date) { return d.toISOString().split("T")[0]; }

/* ── Small Components ──────────────────────────────── */

function PlatformBadge({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    GOOGLE: "bg-blue-100 text-blue-700",
    META: "bg-purple-100 text-purple-700",
    TIKTOK: "bg-cyan-100 text-cyan-700",
  };
  const labels: Record<string, string> = { GOOGLE: "Google", META: "Meta", TIKTOK: "TikTok" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[platform] || "bg-gray-100 text-gray-700"}`}>
      {labels[platform] || platform}
    </span>
  );
}

function RoasBadge({ value }: { value: number }) {
  const color = value >= 3 ? "text-green-600 bg-green-50" : value >= 1.5 ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";
  return <span className={`px-2 py-1 rounded-md text-xs font-bold ${color}`}>{value}x</span>;
}

function ChangeBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-xs text-gray-400">--</span>;
  const pos = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${pos ? "text-emerald-600" : "text-red-500"}`}>
      {pos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

/* ── Funnel Bar ────────────────────────────────────── */

function ConversionFunnel({ impressions, clicks, conversions }: { impressions: number; clicks: number; conversions: number }) {
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const convRate = clicks > 0 ? (conversions / clicks) * 100 : 0;
  const steps = [
    { label: "Impresiones", value: impressions, pct: 100 },
    { label: "Clicks", value: clicks, pct: ctr },
    { label: "Conversiones", value: conversions, pct: convRate },
  ];
  const maxVal = Math.max(impressions, 1);
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={s.label}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600 font-medium">{s.label}</span>
            <span className="text-gray-900 font-bold">{formatCompact(s.value)}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className="h-3 rounded-full transition-all"
              style={{
                width: `${Math.max((s.value / maxVal) * 100, 2)}%`,
                backgroundColor: i === 0 ? "#6366f1" : i === 1 ? "#8b5cf6" : "#10b981",
              }}
            />
          </div>
          {i < steps.length - 1 && (
            <div className="text-[10px] text-gray-400 mt-0.5 text-right">
              {i === 0 ? `CTR: ${ctr.toFixed(2)}%` : `Conv Rate: ${convRate.toFixed(2)}%`}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Main Component ────────────────────────────────── */

export default function CampaignsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("ALL");
  const [sortField, setSortField] = useState("spend");
  const [sortAsc, setSortAsc] = useState(false);
  const [chartMode, setChartMode] = useState<"spend" | "roas">("spend");

  // Date range
  const [dateFrom, setDateFrom] = useState(toDateInputValue(new Date(Date.now() - 30 * 86400000)));
  const [dateTo, setDateTo] = useState(toDateInputValue(new Date()));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(30);

  /* ── Fetch ─────────────────────────────────────── */
  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics/campaigns?from=${dateFrom}&to=${dateTo}`)
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
  const campaigns = data?.campaigns || [];
  const totals = data?.totals || {};
  const changes = data?.changes || {};
  const dailyTrend = data?.dailyTrend || [];
  const platformSummary = data?.platformSummary || [];

  const filtered = useMemo(() => {
    if (platformFilter === "ALL") return campaigns;
    return campaigns.filter((c: any) => c.platform === platformFilter);
  }, [campaigns, platformFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a: any, b: any) => {
      const aV = a[sortField] || 0;
      const bV = b[sortField] || 0;
      return sortAsc ? aV - bV : bV - aV;
    });
  }, [filtered, sortField, sortAsc]);

  const globalRoas = totals.spend > 0 ? (totals.conversionValue / totals.spend).toFixed(2) : "0";
  const globalCtr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : "0";
  const globalCpc = totals.clicks > 0 ? (totals.spend / totals.clicks).toFixed(0) : "0";
  const globalConvRate = totals.clicks > 0 ? ((totals.conversions / totals.clicks) * 100).toFixed(2) : "0";

  const googleCount = campaigns.filter((c: any) => c.platform === "GOOGLE").length;
  const metaCount = campaigns.filter((c: any) => c.platform === "META").length;

  /* ── Sort helpers ──────────────────────────────── */
  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };
  const sortIcon = (field: string) => {
    if (sortField !== field) return null;
    return sortAsc ? <ArrowUp className="w-3 h-3 inline ml-0.5" /> : <ArrowDown className="w-3 h-3 inline ml-0.5" />;
  };

  /* ── CSV Export ─────────────────────────────────── */
  const exportCSV = () => {
    const headers = ["Campana", "Plataforma", "Estado", "Gasto", "Impresiones", "Clicks", "CTR%", "CPC", "Conversiones", "Revenue", "ROAS"];
    const rows = filtered.map((c: any) => [
      `"${c.name.replace(/"/g, '""')}"`, c.platform, c.status,
      c.spend.toFixed(2), c.impressions, c.clicks, c.ctr, c.cpc.toFixed(2),
      c.conversions, c.conversionValue.toFixed(2), c.roas,
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `campanas_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  /* ── Loading ───────────────────────────────────── */
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mr-3" />
        <span className="text-gray-500">Cargando campanas...</span>
      </div>
    );
  }

  /* ── Render ────────────────────────────────────── */
  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header + Date Range */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Campanas</h1>
          <p className="text-sm text-gray-500 mt-1">
            Performance de Meta Ads y Google Ads &middot; {dateFrom} a {dateTo}
          </p>
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

      {/* Platform Filter Chips */}
      <div className="flex items-center gap-2">
        {([
          { key: "ALL" as PlatformFilter, label: "Todas", count: campaigns.length, color: "indigo" },
          { key: "GOOGLE" as PlatformFilter, label: "Google Ads", count: googleCount, color: "blue" },
          { key: "META" as PlatformFilter, label: "Meta Ads", count: metaCount, color: "purple" },
        ]).map((opt) => {
          const isActive = platformFilter === opt.key;
          const activeClass: Record<string, string> = {
            indigo: "bg-indigo-600 text-white border-indigo-600",
            blue: "bg-blue-600 text-white border-blue-600",
            purple: "bg-purple-600 text-white border-purple-600",
          };
          const inactiveClass: Record<string, string> = {
            indigo: "bg-white text-gray-700 border-gray-200",
            blue: "bg-blue-50 text-blue-700 border-blue-200",
            purple: "bg-purple-50 text-purple-700 border-purple-200",
          };
          return (
            <button key={opt.key} onClick={() => setPlatformFilter(opt.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all ${isActive ? activeClass[opt.color] : inactiveClass[opt.color]}`}>
              {opt.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isActive ? "bg-white/20" : "bg-black/5"}`}>
                {opt.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard icon={<DollarSign size={16} className="text-red-600" />} iconBg="bg-red-50" label="Inversion Total" value={formatARS(totals.spend || 0)} change={changes.spend} />
        <KpiCard icon={<Eye size={16} className="text-indigo-600" />} iconBg="bg-indigo-50" label="Impresiones" value={formatCompact(totals.impressions || 0)} change={changes.impressions} />
        <KpiCard icon={<MousePointer size={16} className="text-blue-600" />} iconBg="bg-blue-50" label="Clicks" value={formatCompact(totals.clicks || 0)} change={changes.clicks} />
        <KpiCard icon={<ShoppingCart size={16} className="text-green-600" />} iconBg="bg-green-50" label="Conversiones" value={String(totals.conversions || 0)} change={changes.conversions} />
        <KpiCard icon={<Target size={16} className="text-purple-600" />} iconBg="bg-purple-50" label="ROAS Global" value={`${globalRoas}x`} change={changes.roas} />
        <KpiCard icon={<Zap size={16} className="text-amber-600" />} iconBg="bg-amber-50" label="CTR Promedio" value={`${globalCtr}%`} subtitle={`CPC: ${formatARS(Number(globalCpc))}`} />
      </div>

      {/* Platform Comparison */}
      {platformFilter === "ALL" && platformSummary.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {platformSummary.map((p: any) => {
            const color = PLATFORM_COLORS[p.platform] || "#6b7280";
            const label = PLATFORM_LABELS[p.platform] || p.platform;
            return (
              <div key={p.platform} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <h3 className="font-semibold text-gray-900">{label}</h3>
                  <span className="text-xs text-gray-400 ml-auto">{p.campaigns} campanas</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Inversion</p>
                    <p className="text-lg font-bold text-gray-900">{formatCompact(p.spend)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">ROAS</p>
                    <p className={`text-lg font-bold ${p.roas >= 2 ? "text-green-600" : p.roas >= 1 ? "text-amber-600" : "text-red-600"}`}>{p.roas}x</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Conversiones</p>
                    <p className="text-lg font-bold text-gray-900">{p.conversions}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-100 text-center">
                  <div>
                    <p className="text-[10px] text-gray-400">CTR</p>
                    <p className="text-sm font-medium">{p.ctr}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">CPC</p>
                    <p className="text-sm font-medium">{formatARS(p.cpc)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">Conv Rate</p>
                    <p className="text-sm font-medium">{p.convRate}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">Revenue</p>
                    <p className="text-sm font-medium">{formatCompact(p.conversionValue)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spend/ROAS Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              {chartMode === "spend" ? "Inversion Diaria por Plataforma" : "ROAS Diario"}
            </h3>
            <div className="bg-gray-100 p-1 rounded-lg inline-flex gap-1">
              <button onClick={() => setChartMode("spend")}
                className={`px-3 py-1 rounded-md text-xs font-medium ${chartMode === "spend" ? "bg-white shadow-sm text-indigo-600" : "text-gray-600"}`}>
                Inversion
              </button>
              <button onClick={() => setChartMode("roas")}
                className={`px-3 py-1 rounded-md text-xs font-medium ${chartMode === "roas" ? "bg-white shadow-sm text-indigo-600" : "text-gray-600"}`}>
                ROAS
              </button>
            </div>
          </div>
          {dailyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              {chartMode === "spend" ? (
                <AreaChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
                  <Tooltip formatter={(v: number, name: string) => [formatARS(v), PLATFORM_LABELS[name] || name]} labelFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`; }} />
                  <Area type="monotone" dataKey="META" stackId="1" fill={PLATFORM_COLORS.META} stroke={PLATFORM_COLORS.META} fillOpacity={0.6} />
                  <Area type="monotone" dataKey="GOOGLE" stackId="1" fill={PLATFORM_COLORS.GOOGLE} stroke={PLATFORM_COLORS.GOOGLE} fillOpacity={0.6} />
                </AreaChart>
              ) : (
                <LineChart data={dailyTrend.map((d: any) => {
                  const totalSpend = d.META + d.GOOGLE + (d.TIKTOK || 0);
                  return { date: d.date, roas: totalSpend > 0 ? Math.round((d.conversionValue / totalSpend) * 100) / 100 : 0 };
                })}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}x`} />
                  <Tooltip formatter={(v: number) => [`${v}x`, "ROAS"]} />
                  <Line type="monotone" dataKey="roas" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-400">Sin datos de tendencia</div>
          )}
        </div>

        {/* Conversion Funnel */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-4">Embudo de Conversion</h3>
          <ConversionFunnel
            impressions={totals.impressions || 0}
            clicks={totals.clicks || 0}
            conversions={totals.conversions || 0}
          />
          <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Revenue generado</span>
              <span className="font-bold text-gray-900">{formatARS(totals.conversionValue || 0)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Costo por conversion</span>
              <span className="font-bold text-gray-900">{totals.conversions > 0 ? formatARS(totals.spend / totals.conversions) : "--"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Conv. Rate</span>
              <span className="font-bold text-gray-900">{globalConvRate}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">
            Campanas ({filtered.length})
          </h3>
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        </div>
        {sorted.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            {platformFilter === "ALL" ? "No hay campanas con datos en este periodo." : `No hay campanas de ${platformFilter === "GOOGLE" ? "Google" : "Meta"} con datos.`}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">Campana</th>
                  {platformFilter === "ALL" && <th className="px-4 py-3 text-center font-semibold text-gray-700">Plataforma</th>}
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("spend")}>
                    Gasto{sortIcon("spend")}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("impressions")}>
                    Impr.{sortIcon("impressions")}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("clicks")}>
                    Clicks{sortIcon("clicks")}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("ctr")}>
                    CTR{sortIcon("ctr")}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("cpc")}>
                    CPC{sortIcon("cpc")}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("conversions")}>
                    Conv.{sortIcon("conversions")}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("conversionValue")}>
                    Revenue{sortIcon("conversionValue")}
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort("roas")}>
                    ROAS{sortIcon("roas")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="font-medium text-gray-900 truncate max-w-[250px]" title={c.name}>{c.name}</div>
                      {c.objective && <div className="text-[10px] text-gray-400 mt-0.5">{c.objective}</div>}
                    </td>
                    {platformFilter === "ALL" && <td className="px-4 py-3 text-center"><PlatformBadge platform={c.platform} /></td>}
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">{formatARS(c.spend)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCompact(c.impressions)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCompact(c.clicks)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{c.ctr}%</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatARS(c.cpc)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{c.conversions}</td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">{formatARS(c.conversionValue)}</td>
                    <td className="px-4 py-3 text-center"><RoasBadge value={c.roas} /></td>
                  </tr>
                ))}
              </tbody>
              {/* Totals row */}
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr className="font-bold">
                  <td className="px-6 py-3 text-gray-900">TOTAL</td>
                  {platformFilter === "ALL" && <td />}
                  <td className="px-4 py-3 text-right text-gray-900">{formatARS(filtered.reduce((s: number, c: any) => s + c.spend, 0))}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{formatCompact(filtered.reduce((s: number, c: any) => s + c.impressions, 0))}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{formatCompact(filtered.reduce((s: number, c: any) => s + c.clicks, 0))}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{globalCtr}%</td>
                  <td className="px-4 py-3 text-right text-gray-900">{formatARS(Number(globalCpc))}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{filtered.reduce((s: number, c: any) => s + c.conversions, 0)}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{formatARS(filtered.reduce((s: number, c: any) => s + c.conversionValue, 0))}</td>
                  <td className="px-4 py-3 text-center"><RoasBadge value={Number(globalRoas)} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
