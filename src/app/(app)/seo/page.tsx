// @ts-nocheck
"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";

// ══════════════════════════════════════════════════════════════
// SEO Dashboard — Google Search Console Intelligence
// ══════════════════════════════════════════════════════════════

const MS_PER_DAY = 86400000;
const fmt = (n: number) => n.toLocaleString("es-AR");
const fmtPct = (n: number) => n.toFixed(2) + "%";
const fmtPos = (n: number) => n.toFixed(1);

const POSITION_COLORS: Record<string, string> = {
  pos1_3: "#22c55e",
  pos4_10: "#6366F1",
  pos11_20: "#eab308",
  pos20plus: "#ef4444",
};
const POSITION_LABELS: Record<string, string> = {
  pos1_3: "Top 3",
  pos4_10: "4-10",
  pos11_20: "11-20",
  pos20plus: "20+",
};

type SeoData = {
  kpis: {
    totalClicks: number; totalImpressions: number; avgCtr: number; avgPosition: number;
    kwTop3: number; kwTop10: number;
    changes: { clicks: number; impressions: number; ctr: number; position: number };
  };
  dailyTrend: Array<{ day: string; clicks: number; impressions: number; ctr: number; position: number }>;
  topKeywords: Array<{ keyword: string; clicks: number; impressions: number; ctr: number; position: number; positionChange: number | null }>;
  topPages: Array<{ url: string; clicks: number; impressions: number; ctr: number; avgPosition: number }>;
  positionDistribution: { pos1_3: number; pos4_10: number; pos11_20: number; pos20plus: number };
  deviceSplit: Array<{ device: string; clicks: number; impressions: number; ctr: number; avgPosition: number }>;
};

// ── Reusable components (same pattern as analytics) ──

function KpiCard({ label, value, sub, change, color, invertChange }: {
  label: string; value: string; sub?: string; change?: number; color: string; invertChange?: boolean;
}) {
  const cm: Record<string, string> = {
    indigo: "from-indigo-50 to-indigo-100/50 border-indigo-200",
    cyan: "from-cyan-50 to-cyan-100/50 border-cyan-200",
    purple: "from-purple-50 to-purple-100/50 border-purple-200",
    orange: "from-orange-50 to-orange-100/50 border-orange-200",
    emerald: "from-emerald-50 to-emerald-100/50 border-emerald-200",
    amber: "from-amber-50 to-amber-100/50 border-amber-200",
  };
  const isPositive = invertChange ? (change || 0) < 0 : (change || 0) > 0;
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${cm[color] || cm.indigo} p-3`}>
      <p className="text-[11px] text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-800">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      {change !== undefined && change !== 0 && (
        <span className={`text-[10px] font-medium ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
          {change > 0 ? "+" : ""}{change}% vs anterior
        </span>
      )}
    </div>
  );
}

function SectionCard({ title, children, badge, maxH }: { title: string; children: React.ReactNode; badge?: string; maxH?: string }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {badge && <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{badge}</span>}
      </div>
      {maxH ? <div className="overflow-y-auto" style={{ maxHeight: maxH }}>{children}</div> : children}
    </div>
  );
}

function PositionBadge({ position }: { position: number }) {
  const color = position <= 3 ? "bg-emerald-100 text-emerald-700"
    : position <= 10 ? "bg-indigo-100 text-indigo-700"
    : position <= 20 ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-600";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${color}`}>{fmtPos(position)}</span>;
}

function ChangeArrow({ change }: { change: number | null }) {
  if (change === null || change === 0) return <span className="text-gray-300 text-xs">—</span>;
  const isGood = change > 0; // positive = position improved (went up in rankings)
  return (
    <span className={`text-[11px] font-medium flex items-center gap-0.5 ${isGood ? "text-emerald-600" : "text-red-500"}`}>
      {isGood ? "▲" : "▼"} {Math.abs(change).toFixed(1)}
    </span>
  );
}

// ── Date range helper ──
function getDefaultDates() {
  const to = new Date();
  to.setDate(to.getDate() - 3); // GSC has 3-day delay
  const from = new Date(to.getTime() - 30 * MS_PER_DAY);
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

// ══════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════

export default function SeoPage() {
  const defaults = getDefaultDates();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [data, setData] = useState<SeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kwSearch, setKwSearch] = useState("");
  const [kwPage, setKwPage] = useState(1);
  const [trendMetric, setTrendMetric] = useState<"clicks" | "impressions" | "ctr" | "position">("clicks");

  const KW_PAGE_SIZE = 15;

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/metrics/seo?from=${dateFrom}&to=${dateTo}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setData(null); }
        else setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  // Filtered keywords
  const filteredKw = useMemo(() => {
    if (!data) return [];
    if (!kwSearch) return data.topKeywords;
    const q = kwSearch.toLowerCase();
    return data.topKeywords.filter(k => k.keyword.toLowerCase().includes(q));
  }, [data, kwSearch]);

  const kwTotalPages = Math.ceil(filteredKw.length / KW_PAGE_SIZE);
  const pagedKw = filteredKw.slice((kwPage - 1) * KW_PAGE_SIZE, kwPage * KW_PAGE_SIZE);

  // Position distribution for bar chart
  const distData = data ? Object.entries(data.positionDistribution).map(([band, count]) => ({
    band,
    label: POSITION_LABELS[band] || band,
    count,
    fill: POSITION_COLORS[band] || "#999",
  })) : [];

  // ── Render ──
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <p className="text-gray-400 text-sm">Cargando datos de Search Console...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <p className="text-red-500 text-sm">Error: {error}</p>
        <p className="text-gray-400 text-xs max-w-md text-center">
          Asegurate de que Google Search Console este conectado y sincronizado.
          Podes ejecutar la sincronizacion desde Configuracion.
        </p>
      </div>
    );
  }

  if (!data) return null;

  const { kpis } = data;

  return (
    <div className="space-y-5">
      {/* Header + Date picker */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">SEO</h1>
          <p className="text-gray-500 text-sm">Google Search Console — Rendimiento organico</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setKwPage(1); }}
            className="text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-700" />
          <span className="text-gray-400 text-xs">a</span>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setKwPage(1); }}
            className="text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-700" />
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Clics Organicos" value={fmt(kpis.totalClicks)} change={kpis.changes.clicks} color="indigo" />
        <KpiCard label="Impresiones" value={fmt(kpis.totalImpressions)} change={kpis.changes.impressions} color="cyan" />
        <KpiCard label="CTR Promedio" value={fmtPct(kpis.avgCtr)} change={kpis.changes.ctr} color="purple" />
        <KpiCard label="Posicion Promedio" value={fmtPos(kpis.avgPosition)} change={kpis.changes.position} color="orange" invertChange />
        <KpiCard label="Keywords Top 3" value={fmt(kpis.kwTop3)} color="emerald" />
        <KpiCard label="Keywords Top 10" value={fmt(kpis.kwTop10)} color="amber" />
      </div>

      {/* Row 2: Daily trend */}
      <SectionCard title="Tendencia Diaria" badge="Google Search Console">
        <div className="flex gap-2 mb-3">
          {(["clicks", "impressions", "ctr", "position"] as const).map(m => (
            <button key={m} onClick={() => setTrendMetric(m)}
              className={`text-[11px] px-3 py-1 rounded-full font-medium transition-all ${
                trendMetric === m ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}>
              {m === "clicks" ? "Clics" : m === "impressions" ? "Impresiones" : m === "ctr" ? "CTR" : "Posicion"}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data.dailyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="seoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366F1" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="day" tickFormatter={v => v.substring(5)} tick={{ fontSize: 10, fill: "#999" }} />
            <YAxis
              tick={{ fontSize: 10, fill: "#999" }}
              reversed={trendMetric === "position"}
              tickFormatter={v => trendMetric === "ctr" ? v + "%" : trendMetric === "position" ? v.toFixed(1) : fmt(v)}
            />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
              formatter={(v: number) => [
                trendMetric === "ctr" ? fmtPct(v) : trendMetric === "position" ? fmtPos(v) : fmt(v),
                trendMetric === "clicks" ? "Clics" : trendMetric === "impressions" ? "Impresiones" : trendMetric === "ctr" ? "CTR" : "Posicion"
              ]}
            />
            <Area type="monotone" dataKey={trendMetric} stroke="#6366F1" fill="url(#seoGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </SectionCard>

      {/* Row 3: Top Keywords */}
      <SectionCard title="Top Keywords" badge={`${filteredKw.length} keywords`}>
        <div className="mb-3">
          <input
            type="text" placeholder="Buscar keyword..." value={kwSearch}
            onChange={e => { setKwSearch(e.target.value); setKwPage(1); }}
            className="text-xs border border-gray-300 rounded-lg px-3 py-2 w-full sm:w-64 bg-white text-gray-700"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Keyword</th>
                <th className="text-center py-2 px-2 text-gray-500 font-medium">Posicion</th>
                <th className="text-center py-2 px-2 text-gray-500 font-medium">Cambio</th>
                <th className="text-right py-2 px-2 text-gray-500 font-medium">Impresiones</th>
                <th className="text-right py-2 px-2 text-gray-500 font-medium">Clics</th>
                <th className="text-right py-2 px-2 text-gray-500 font-medium">CTR</th>
              </tr>
            </thead>
            <tbody>
              {pagedKw.map((k, i) => (
                <tr key={k.keyword} className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-gray-50/50" : ""}`}>
                  <td className="py-2 px-2 text-gray-800 font-medium max-w-[250px] truncate">{k.keyword}</td>
                  <td className="py-2 px-2 text-center"><PositionBadge position={k.position} /></td>
                  <td className="py-2 px-2 text-center"><ChangeArrow change={k.positionChange} /></td>
                  <td className="py-2 px-2 text-right text-gray-600">{fmt(k.impressions)}</td>
                  <td className="py-2 px-2 text-right text-gray-800 font-medium">{fmt(k.clicks)}</td>
                  <td className="py-2 px-2 text-right text-gray-600">{fmtPct(k.ctr)}</td>
                </tr>
              ))}
              {pagedKw.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-gray-400">No se encontraron keywords</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {kwTotalPages > 1 && (
          <div className="flex items-center justify-between mt-3">
            <span className="text-[10px] text-gray-400">Pagina {kwPage} de {kwTotalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setKwPage(p => Math.max(1, p - 1))} disabled={kwPage === 1}
                className="text-xs px-3 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30">Ant</button>
              <button onClick={() => setKwPage(p => Math.min(kwTotalPages, p + 1))} disabled={kwPage === kwTotalPages}
                className="text-xs px-3 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30">Sig</button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Row 4: Top Landing Pages + Position Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Top Pages */}
        <div className="lg:col-span-2">
          <SectionCard title="Top Landing Pages" badge="Top 30" maxH="380px">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">URL</th>
                  <th className="text-right py-2 px-2 text-gray-500 font-medium">Clics</th>
                  <th className="text-right py-2 px-2 text-gray-500 font-medium">Impresiones</th>
                  <th className="text-right py-2 px-2 text-gray-500 font-medium">CTR</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-medium">Posicion</th>
                </tr>
              </thead>
              <tbody>
                {data.topPages.map((p, i) => {
                  // Show only path, not full URL
                  let path = p.url;
                  try { path = new URL(p.url).pathname; } catch {}
                  return (
                    <tr key={p.url} className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-gray-50/50" : ""}`}>
                      <td className="py-2 px-2 text-gray-700 max-w-[280px] truncate" title={p.url}>{path}</td>
                      <td className="py-2 px-2 text-right text-gray-800 font-medium">{fmt(p.clicks)}</td>
                      <td className="py-2 px-2 text-right text-gray-600">{fmt(p.impressions)}</td>
                      <td className="py-2 px-2 text-right text-gray-600">{fmtPct(p.ctr)}</td>
                      <td className="py-2 px-2 text-center"><PositionBadge position={p.avgPosition} /></td>
                    </tr>
                  );
                })}
                {data.topPages.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-400">Sin datos de paginas</td></tr>
                )}
              </tbody>
            </table>
          </SectionCard>
        </div>

        {/* Position Distribution */}
        <SectionCard title="Distribucion de Posiciones" badge="Keywords">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={distData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#666" }} />
              <YAxis tick={{ fontSize: 10, fill: "#999" }} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                formatter={(v: number) => [fmt(v), "Keywords"]}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {distData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      {/* Row 5: Device Split */}
      <SectionCard title="Rendimiento por Dispositivo" badge="Search Console">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.deviceSplit.map(d => {
            const deviceLabel = d.device === "DESKTOP" ? "Desktop" : d.device === "MOBILE" ? "Mobile" : d.device === "TABLET" ? "Tablet" : d.device;
            const deviceIcon = d.device === "DESKTOP" ? "💻" : d.device === "MOBILE" ? "📱" : d.device === "TABLET" ? "📋" : "🌐";
            return (
              <div key={d.device} className="rounded-xl border border-gray-200 p-4 bg-gray-50/50">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{deviceIcon}</span>
                  <span className="text-sm font-semibold text-gray-800">{deviceLabel}</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Clics</span>
                    <span className="font-medium text-gray-800">{fmt(d.clicks)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Impresiones</span>
                    <span className="font-medium text-gray-600">{fmt(d.impressions)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">CTR</span>
                    <span className="font-medium text-gray-600">{fmtPct(d.ctr)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Posicion</span>
                    <PositionBadge position={d.avgPosition} />
                  </div>
                </div>
              </div>
            );
          })}
          {data.deviceSplit.length === 0 && (
            <p className="text-gray-400 text-xs col-span-4 text-center py-8">Sin datos de dispositivo</p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
