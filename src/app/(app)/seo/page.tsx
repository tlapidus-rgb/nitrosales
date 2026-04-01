// @ts-nocheck
"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie,
} from "recharts";

// ══════════════════════════════════════════════════════════════
// SEO Dashboard v2 — Google Search Console Intelligence
// Tabs: Overview | Keywords | Pages | Oportunidades | Movimientos
// ══════════════════════════════════════════════════════════════

const fmt = (n: number) => n?.toLocaleString("es-AR") ?? "0";
const fmtPct = (n: number) => (n ?? 0).toFixed(2) + "%";
const fmtPos = (n: number) => (n ?? 0).toFixed(1);

const POSITION_COLORS: Record<string, string> = {
  pos1_3: "#22c55e", pos4_10: "#6366F1", pos11_20: "#eab308", pos20plus: "#ef4444",
};
const POSITION_LABELS: Record<string, string> = {
  pos1_3: "Top 3", pos4_10: "4-10", pos11_20: "11-20", pos20plus: "20+",
};
const COUNTRY_NAMES: Record<string, string> = {
  ARG: "Argentina", BRA: "Brasil", CHL: "Chile", URY: "Uruguay", MEX: "Mexico",
  USA: "Estados Unidos", COL: "Colombia", PER: "Peru", ESP: "Espana", BOL: "Bolivia",
  PRY: "Paraguay", ECU: "Ecuador", DOM: "Rep. Dominicana", VEN: "Venezuela",
  CRI: "Costa Rica", PAN: "Panama", GTM: "Guatemala",
};

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "keywords", label: "Keywords" },
  { id: "pages", label: "Pages" },
  { id: "oportunidades", label: "Oportunidades" },
  { id: "movimientos", label: "Movimientos" },
] as const;
type TabId = typeof TABS[number]["id"];

// ── Reusable components ──

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
    rose: "from-rose-50 to-rose-100/50 border-rose-200",
    sky: "from-sky-50 to-sky-100/50 border-sky-200",
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

function SectionCard({ title, children, badge, maxH, className }: {
  title: string; children: React.ReactNode; badge?: string; maxH?: string; className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-white border border-gray-200 p-4 ${className || ""}`}>
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

function ChangeArrow({ change, invert }: { change: number | null; invert?: boolean }) {
  if (change === null || change === undefined || change === 0) return <span className="text-gray-300 text-xs">--</span>;
  const isGood = invert ? change < 0 : change > 0;
  return (
    <span className={`text-[11px] font-medium flex items-center gap-0.5 ${isGood ? "text-emerald-600" : "text-red-500"}`}>
      {change > 0 ? "+" : ""}{typeof change === "number" && !Number.isInteger(change) ? change.toFixed(1) : change}
    </span>
  );
}

function MiniTable({ headers, rows, emptyMsg }: {
  headers: string[]; rows: React.ReactNode[][]; emptyMsg?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100">
            {headers.map((h, i) => (
              <th key={i} className={`py-2 px-2 text-gray-500 font-medium ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-gray-50/50" : ""}`}>
              {cells.map((cell, j) => (
                <td key={j} className={`py-2 px-2 ${j === 0 ? "text-left text-gray-800 font-medium max-w-[280px] truncate" : "text-right text-gray-600"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={headers.length} className="py-8 text-center text-gray-400">{emptyMsg || "Sin datos"}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Date helper ──
function getDefaultDates() {
  const to = new Date();
  to.setDate(to.getDate() - 3);
  const from = new Date(to.getTime() - 30 * 86400000);
  return { from: from.toISOString().split("T")[0], to: to.toISOString().split("T")[0] };
}

// ══════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════

export default function SeoPage() {
  const defaults = getDefaultDates();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [kwSearch, setKwSearch] = useState("");
  const [kwPage, setKwPage] = useState(1);
  const [pageSearch, setPageSearch] = useState("");
  const [pagePage, setPagePage] = useState(1);
  const [trendMetric, setTrendMetric] = useState<"clicks" | "impressions" | "ctr" | "position">("clicks");
  const [moverTab, setMoverTab] = useState<"up" | "down" | "new" | "lost">("up");

  const PAGE_SIZE = 20;

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/metrics/seo?from=${dateFrom}&to=${dateTo}`)
      .then(r => r.json())
      .then(d => { if (d.error) { setError(d.error); setData(null); } else setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  // Filtered keywords
  const filteredKw = useMemo(() => {
    if (!data?.topKeywords) return [];
    if (!kwSearch) return data.topKeywords;
    const q = kwSearch.toLowerCase();
    return data.topKeywords.filter((k: any) => k.keyword.toLowerCase().includes(q));
  }, [data, kwSearch]);

  const kwTotalPages = Math.ceil(filteredKw.length / PAGE_SIZE);
  const pagedKw = filteredKw.slice((kwPage - 1) * PAGE_SIZE, kwPage * PAGE_SIZE);

  // Filtered pages
  const filteredPages = useMemo(() => {
    if (!data?.topPages) return [];
    if (!pageSearch) return data.topPages;
    const q = pageSearch.toLowerCase();
    return data.topPages.filter((p: any) => p.url.toLowerCase().includes(q));
  }, [data, pageSearch]);

  const pageTotalPages = Math.ceil(filteredPages.length / PAGE_SIZE);
  const pagedPages = filteredPages.slice((pagePage - 1) * PAGE_SIZE, pagePage * PAGE_SIZE);

  // Position distribution
  const distData = data ? Object.entries(data.positionDistribution || {}).map(([band, count]) => ({
    band, label: POSITION_LABELS[band] || band, count: count as number, fill: POSITION_COLORS[band] || "#999",
  })) : [];

  // ── Loading / Error ──
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
        </p>
      </div>
    );
  }

  if (!data) return null;
  const { kpis } = data;

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">
      {/* Header + Date picker + Tabs */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">SEO Intelligence</h1>
            <p className="text-gray-500 text-sm">Google Search Console -- elmundodeljuguete.com.ar</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setKwPage(1); setPagePage(1); }}
              className="text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-700" />
            <span className="text-gray-400 text-xs">a</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setKwPage(1); setPagePage(1); }}
              className="text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-700" />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
                activeTab === tab.id
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════ TAB: OVERVIEW ══════════ */}
      {activeTab === "overview" && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <KpiCard label="Clics Organicos" value={fmt(kpis.totalClicks)} change={kpis.changes.clicks} color="indigo" />
            <KpiCard label="Impresiones" value={fmt(kpis.totalImpressions)} change={kpis.changes.impressions} color="cyan" />
            <KpiCard label="CTR Promedio" value={fmtPct(kpis.avgCtr)} change={kpis.changes.ctr} color="purple" />
            <KpiCard label="Posicion Promedio" value={fmtPos(kpis.avgPosition)} change={kpis.changes.position} color="orange" invertChange />
            <KpiCard label="Keywords Top 3" value={fmt(kpis.kwTop3)} color="emerald" />
            <KpiCard label="Keywords Top 10" value={fmt(kpis.kwTop10)} color="amber" />
            <KpiCard label="Total Keywords" value={fmt(kpis.totalKeywords)} color="sky" />
            <KpiCard label="Oportunidades" value={fmt(data.opportunities?.length || 0)} color="rose" sub="Quick wins detectados" />
          </div>

          {/* Daily Trend */}
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
                <XAxis dataKey="day" tickFormatter={(v: string) => v.substring(5)} tick={{ fontSize: 10, fill: "#999" }} />
                <YAxis tick={{ fontSize: 10, fill: "#999" }} reversed={trendMetric === "position"}
                  tickFormatter={(v: number) => trendMetric === "ctr" ? v + "%" : trendMetric === "position" ? v.toFixed(1) : fmt(v)} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                  formatter={(v: number) => [
                    trendMetric === "ctr" ? fmtPct(v) : trendMetric === "position" ? fmtPos(v) : fmt(v),
                    trendMetric === "clicks" ? "Clics" : trendMetric === "impressions" ? "Impresiones" : trendMetric === "ctr" ? "CTR" : "Posicion"
                  ]} />
                <Area type="monotone" dataKey={trendMetric} stroke="#6366F1" fill="url(#seoGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </SectionCard>

          {/* Position Distribution + Device + Country */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <SectionCard title="Distribucion de Posiciones" badge="Keywords">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={distData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#666" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#999" }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                    formatter={(v: number) => [fmt(v), "Keywords"]} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {distData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>

            <SectionCard title="Por Dispositivo" badge="Breakdown">
              <div className="space-y-3">
                {(data.deviceSplit || []).map((d: any) => {
                  const label = d.device === "DESKTOP" ? "Desktop" : d.device === "MOBILE" ? "Mobile" : d.device === "TABLET" ? "Tablet" : d.device;
                  const totalClicks = data.deviceSplit.reduce((s: number, x: any) => s + x.clicks, 0);
                  const pct = totalClicks > 0 ? (d.clicks / totalClicks * 100) : 0;
                  return (
                    <div key={d.device} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-700 font-medium">{label}</span>
                        <span className="text-gray-500">{fmt(d.clicks)} clics ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400">
                        <span>CTR {fmtPct(d.ctr)}</span>
                        <span>Pos {fmtPos(d.avgPosition)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="Por Pais" badge="Top paises">
              <div className="space-y-2" style={{ maxHeight: 240, overflowY: "auto" }}>
                {(data.countrySplit || []).map((c: any, i: number) => (
                  <div key={c.country} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 w-4 text-right">{i + 1}</span>
                      <span className="text-gray-800 font-medium">{COUNTRY_NAMES[c.country] || c.country}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-gray-600">{fmt(c.clicks)} clics</span>
                      <span className="text-gray-400">{fmtPct(c.ctr)}</span>
                      <PositionBadge position={c.avgPosition} />
                    </div>
                  </div>
                ))}
                {(!data.countrySplit || data.countrySplit.length === 0) && (
                  <p className="text-gray-400 text-xs text-center py-4">Sin datos de pais</p>
                )}
              </div>
            </SectionCard>
          </div>

          {/* Quick preview: Top 5 opportunities */}
          {data.opportunities?.length > 0 && (
            <SectionCard title="Quick Wins Detectados" badge={`${data.opportunities.length} oportunidades`}>
              <p className="text-xs text-gray-500 mb-3">Keywords con CTR por debajo del promedio para su posicion. Optimizar titles y descriptions podria capturar estos clics adicionales.</p>
              <MiniTable
                headers={["Keyword", "Pos", "CTR Actual", "Impresiones", "Clics Potenciales"]}
                rows={data.opportunities.slice(0, 5).map((o: any) => [
                  o.keyword,
                  <PositionBadge key="p" position={o.position} />,
                  fmtPct(o.ctr),
                  fmt(o.impressions),
                  <span key="pc" className="text-emerald-600 font-medium">+{fmt(o.potentialClicks)}</span>,
                ])}
              />
              {data.opportunities.length > 5 && (
                <button onClick={() => setActiveTab("oportunidades")}
                  className="text-xs text-indigo-600 hover:text-indigo-800 mt-2 font-medium">
                  Ver las {data.opportunities.length} oportunidades →
                </button>
              )}
            </SectionCard>
          )}
        </>
      )}

      {/* ══════════ TAB: KEYWORDS ══════════ */}
      {activeTab === "keywords" && (
        <>
          <SectionCard title="Todas las Keywords" badge={`${filteredKw.length} keywords`}>
            <div className="mb-3">
              <input type="text" placeholder="Buscar keyword..." value={kwSearch}
                onChange={e => { setKwSearch(e.target.value); setKwPage(1); }}
                className="text-xs border border-gray-300 rounded-lg px-3 py-2 w-full sm:w-64 bg-white text-gray-700" />
            </div>
            <MiniTable
              headers={["Keyword", "Posicion", "Cambio Pos", "Impresiones", "Clics", "Cambio Clics", "CTR"]}
              rows={pagedKw.map((k: any) => [
                k.keyword,
                <PositionBadge key="p" position={k.position} />,
                <ChangeArrow key="c" change={k.positionChange} />,
                fmt(k.impressions),
                <span key="cl" className="font-medium text-gray-800">{fmt(k.clicks)}</span>,
                <ChangeArrow key="cc" change={k.clicksChange} />,
                fmtPct(k.ctr),
              ])}
              emptyMsg="No se encontraron keywords"
            />
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

          {/* Cannibalization */}
          {data.cannibalization?.length > 0 && (
            <SectionCard title="Canibalizacion de Keywords" badge={`${data.cannibalization.length} keywords afectadas`}>
              <p className="text-xs text-gray-500 mb-3">Keywords que rankean en 3 o mas URLs distintas. Google puede confundirse sobre cual pagina mostrar, diluyendo tu posicion.</p>
              <div className="space-y-3">
                {data.cannibalization.map((c: any, i: number) => (
                  <div key={i} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-800">{c.keyword}</span>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{c.pageCount} paginas</span>
                        <span>{fmt(c.impressions)} imp</span>
                        <span>{fmt(c.clicks)} clics</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {c.pages.slice(0, 5).map((url: string, j: number) => {
                        let path = url;
                        try { path = new URL(url).pathname; } catch {}
                        return (
                          <p key={j} className="text-[11px] text-gray-500 truncate pl-3 border-l-2 border-amber-300">
                            {path}
                          </p>
                        );
                      })}
                      {c.pages.length > 5 && (
                        <p className="text-[10px] text-gray-400 pl-3">...y {c.pages.length - 5} mas</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </>
      )}

      {/* ══════════ TAB: PAGES ══════════ */}
      {activeTab === "pages" && (
        <SectionCard title="Landing Pages" badge={`${filteredPages.length} paginas`}>
          <div className="mb-3">
            <input type="text" placeholder="Buscar URL..." value={pageSearch}
              onChange={e => { setPageSearch(e.target.value); setPagePage(1); }}
              className="text-xs border border-gray-300 rounded-lg px-3 py-2 w-full sm:w-64 bg-white text-gray-700" />
          </div>
          <MiniTable
            headers={["URL", "Clics", "Impresiones", "CTR", "Posicion", "Keywords"]}
            rows={pagedPages.map((p: any) => {
              let path = p.url;
              try { path = new URL(p.url).pathname; } catch {}
              return [
                <span key="u" title={p.url}>{path}</span>,
                <span key="c" className="font-medium text-gray-800">{fmt(p.clicks)}</span>,
                fmt(p.impressions),
                fmtPct(p.ctr),
                <PositionBadge key="pos" position={p.avgPosition} />,
                <span key="kw" className="text-gray-400">{fmt(p.keywordCount)}</span>,
              ];
            })}
            emptyMsg="Sin datos de paginas"
          />
          {pageTotalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <span className="text-[10px] text-gray-400">Pagina {pagePage} de {pageTotalPages}</span>
              <div className="flex gap-1">
                <button onClick={() => setPagePage(p => Math.max(1, p - 1))} disabled={pagePage === 1}
                  className="text-xs px-3 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30">Ant</button>
                <button onClick={() => setPagePage(p => Math.min(pageTotalPages, p + 1))} disabled={pagePage === pageTotalPages}
                  className="text-xs px-3 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30">Sig</button>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* ══════════ TAB: OPORTUNIDADES ══════════ */}
      {activeTab === "oportunidades" && (
        <>
          <SectionCard title="Oportunidades de CTR" badge="Quick Wins">
            <p className="text-xs text-gray-500 mb-3">
              Keywords donde tu CTR esta por debajo del promedio esperado para tu posicion.
              Optimizando titles, meta descriptions y rich snippets podes capturar estos clics sin mejorar posicion.
            </p>
            <MiniTable
              headers={["Keyword", "Posicion", "CTR Actual", "Impresiones", "Clics Actuales", "Clics Potenciales"]}
              rows={(data.opportunities || []).map((o: any) => [
                o.keyword,
                <PositionBadge key="p" position={o.position} />,
                <span key="ctr" className={o.ctr < 2 ? "text-red-500 font-medium" : ""}>{fmtPct(o.ctr)}</span>,
                fmt(o.impressions),
                fmt(o.clicks),
                <span key="pot" className="text-emerald-600 font-bold">+{fmt(o.potentialClicks)}</span>,
              ])}
              emptyMsg="No hay oportunidades detectadas en este periodo"
            />
          </SectionCard>

          {/* Summary card */}
          {data.opportunities?.length > 0 && (
            <div className="rounded-2xl bg-gradient-to-r from-emerald-50 to-emerald-100/50 border border-emerald-200 p-5">
              <h3 className="text-sm font-semibold text-emerald-800 mb-2">Resumen de Oportunidades</h3>
              <p className="text-xs text-emerald-700">
                Se detectaron <strong>{data.opportunities.length}</strong> keywords con CTR mejorable.
                Si optimizas titles y descriptions, podes ganar hasta{" "}
                <strong className="text-lg">{fmt(data.opportunities.reduce((s: number, o: any) => s + o.potentialClicks, 0))}</strong>{" "}
                clics adicionales en este periodo sin cambiar posiciones.
              </p>
            </div>
          )}
        </>
      )}

      {/* ══════════ TAB: MOVIMIENTOS ══════════ */}
      {activeTab === "movimientos" && (
        <>
          {/* Sub-tabs */}
          <div className="flex gap-2">
            {([
              { id: "up", label: "Subiendo", color: "emerald" },
              { id: "down", label: "Bajando", color: "red" },
              { id: "new", label: "Nuevas", color: "indigo" },
              { id: "lost", label: "Perdidas", color: "orange" },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setMoverTab(t.id)}
                className={`text-xs px-4 py-2 rounded-lg font-medium transition-all ${
                  moverTab === t.id
                    ? `bg-${t.color}-100 text-${t.color}-700`
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}>
                {t.label} ({(data.movers?.[t.id] || []).length})
              </button>
            ))}
          </div>

          {moverTab === "up" && (
            <SectionCard title="Keywords Subiendo" badge={`${(data.movers?.up || []).length} keywords`}>
              <p className="text-xs text-gray-500 mb-3">Keywords que mejoraron 2+ posiciones vs el periodo anterior. Buen momentum -- reforzar contenido.</p>
              <MiniTable
                headers={["Keyword", "Posicion Actual", "Posicion Anterior", "Mejora", "Clics", "Impresiones"]}
                rows={(data.movers?.up || []).map((m: any) => [
                  m.keyword,
                  <PositionBadge key="p" position={m.position} />,
                  <span key="pp" className="text-gray-400">{fmtPos(m.prevPosition)}</span>,
                  <span key="c" className="text-emerald-600 font-bold">+{m.change.toFixed(1)}</span>,
                  fmt(m.clicks),
                  fmt(m.impressions),
                ])}
                emptyMsg="No hay keywords subiendo en este periodo"
              />
            </SectionCard>
          )}

          {moverTab === "down" && (
            <SectionCard title="Keywords Bajando" badge={`${(data.movers?.down || []).length} keywords`}>
              <p className="text-xs text-gray-500 mb-3">Keywords que perdieron 2+ posiciones. Requieren atencion -- posible competencia o contenido desactualizado.</p>
              <MiniTable
                headers={["Keyword", "Posicion Actual", "Posicion Anterior", "Caida", "Clics", "Impresiones"]}
                rows={(data.movers?.down || []).map((m: any) => [
                  m.keyword,
                  <PositionBadge key="p" position={m.position} />,
                  <span key="pp" className="text-gray-400">{fmtPos(m.prevPosition)}</span>,
                  <span key="c" className="text-red-500 font-bold">{m.change.toFixed(1)}</span>,
                  fmt(m.clicks),
                  fmt(m.impressions),
                ])}
                emptyMsg="No hay keywords bajando en este periodo"
              />
            </SectionCard>
          )}

          {moverTab === "new" && (
            <SectionCard title="Keywords Nuevas" badge={`${(data.movers?.new || []).length} keywords`}>
              <p className="text-xs text-gray-500 mb-3">Keywords que aparecieron en este periodo pero no existian en el anterior. Nuevas oportunidades de indexacion.</p>
              <MiniTable
                headers={["Keyword", "Posicion", "Clics", "Impresiones"]}
                rows={(data.movers?.new || []).map((k: any) => [
                  k.keyword,
                  <PositionBadge key="p" position={k.position} />,
                  fmt(k.clicks),
                  fmt(k.impressions),
                ])}
                emptyMsg="No se detectaron keywords nuevas en este periodo"
              />
            </SectionCard>
          )}

          {moverTab === "lost" && (
            <SectionCard title="Keywords Perdidas" badge={`${(data.movers?.lost || []).length} keywords`}>
              <p className="text-xs text-gray-500 mb-3">Keywords que existian en el periodo anterior pero desaparecieron. Posible desindexacion o perdida de relevancia.</p>
              <MiniTable
                headers={["Keyword", "Posicion (anterior)", "Clics (anterior)", "Impresiones (anterior)"]}
                rows={(data.movers?.lost || []).map((k: any) => [
                  k.keyword,
                  <PositionBadge key="p" position={k.position} />,
                  fmt(k.clicks),
                  fmt(k.impressions),
                ])}
                emptyMsg="No se detectaron keywords perdidas en este periodo"
              />
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
