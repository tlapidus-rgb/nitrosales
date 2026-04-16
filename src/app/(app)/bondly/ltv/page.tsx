// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import {
  TrendingUp, Users, RefreshCw, DollarSign, Clock,
  Target, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronRight,
  Brain, Lock, Send, Loader2, ShieldCheck,
} from "lucide-react";
import { KpiCard, ChangeBadge } from "@/components/dashboard";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

// LTV analysis only uses VTEX (tienda propia) — los marketplaces
// no comparten identidad de cliente necesaria para LTV / cohort / churn.
const CHANNEL_COLORS: Record<string, string> = {
  "Google Ads": "#4285F4",
  "Meta Ads": "#1877F2",
  "Google Organic": "#34A853",
  "Directo": "#6B7280",
  "TikTok": "#000000",
  "Paid Otro": "#8B5CF6",
  "Sin datos": "#D1D5DB",
};

const RETENTION_COLORS = [
  { threshold: 20, bg: "bg-emerald-600", text: "text-white" },
  { threshold: 15, bg: "bg-emerald-500", text: "text-white" },
  { threshold: 10, bg: "bg-emerald-400", text: "text-white" },
  { threshold: 5, bg: "bg-emerald-200", text: "text-emerald-800" },
  { threshold: 2, bg: "bg-yellow-100", text: "text-yellow-800" },
  { threshold: 0.1, bg: "bg-red-100", text: "text-red-700" },
  { threshold: 0, bg: "bg-gray-50", text: "text-gray-400" },
];

function getRetentionStyle(pct: number): string {
  for (const level of RETENTION_COLORS) {
    if (pct >= level.threshold) return `${level.bg} ${level.text}`;
  }
  return "bg-gray-50 text-gray-400";
}

const QUICK_RANGES = [
  { label: "6 meses", days: 180 },
  { label: "12 meses", days: 365 },
  { label: "Todo", days: 730 },
];

function toDateInputValue(date: Date): string {
  return date.toISOString().split("T")[0];
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex ml-1 cursor-help">
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold leading-none hover:bg-gray-300 transition-colors">?</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-3 py-2 text-xs text-white bg-gray-800 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none leading-relaxed">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
      </span>
    </span>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

export default function LtvPage() {
  const defaultTo = new Date();
  const defaultFrom = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const [dateFrom, setDateFrom] = useState(toDateInputValue(defaultFrom));
  const [dateTo, setDateTo] = useState(toDateInputValue(defaultTo));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(365);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prediction state
  const [predData, setPredData] = useState<any>(null);
  const [predLoading, setPredLoading] = useState(false);
  const [predRunning, setPredRunning] = useState(false);

  // Threshold settings state
  const [thresholdConfig, setThresholdConfig] = useState<any>(null);
  const [showThresholdEdit, setShowThresholdEdit] = useState(false);
  const [editLow, setEditLow] = useState("");
  const [editMed, setEditMed] = useState("");
  const [savingThresholds, setSavingThresholds] = useState(false);

  // Customer detail expansion state
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ from: dateFrom, to: dateTo });
        const res = await fetch(`/api/metrics/ltv?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateFrom, dateTo]);

  // Fetch existing predictions + threshold settings
  useEffect(() => {
    const fetchPredictions = async () => {
      try {
        const res = await fetch("/api/ltv/predict");
        if (res.ok) {
          const d = await res.json();
          if (d.summary?.total > 0) setPredData(d);
        }
      } catch {}
    };
    const fetchThresholds = async () => {
      try {
        const res = await fetch("/api/settings/ltv");
        if (res.ok) {
          const d = await res.json();
          setThresholdConfig(d);
          setEditLow(String(d.current.low));
          setEditMed(String(d.current.medium));
        }
      } catch {}
    };
    fetchPredictions();
    fetchThresholds();
  }, []);

  const handleRunPrediction = async () => {
    setPredRunning(true);
    try {
      const res = await fetch("/api/ltv/predict", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      // Refresh predictions data
      const res2 = await fetch("/api/ltv/predict");
      if (res2.ok) {
        const d = await res2.json();
        if (d.summary?.total > 0) setPredData(d);
      }
    } catch (e: any) {
      console.error("Prediction error:", e);
    } finally {
      setPredRunning(false);
    }
  };

  const handleSaveThresholds = async () => {
    const low = Number(editLow);
    const med = Number(editMed);
    if (!low || !med || low <= 0 || med <= low) return;
    setSavingThresholds(true);
    try {
      const res = await fetch("/api/settings/ltv", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ low, medium: med }),
      });
      if (res.ok) {
        const d = await res.json();
        setThresholdConfig((prev: any) => ({ ...prev, current: d.thresholds }));
        setShowThresholdEdit(false);
        // Recalculate predictions with new thresholds
        await handleRunPrediction();
      }
    } catch (e) {
      console.error("Error saving thresholds:", e);
    } finally {
      setSavingThresholds(false);
    }
  };

  const handleExpandCustomer = async (customerId: string) => {
    if (expandedCustomer === customerId) {
      setExpandedCustomer(null);
      setCustomerDetail(null);
      return;
    }
    setExpandedCustomer(customerId);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/ltv/customer-detail?id=${customerId}`);
      if (res.ok) setCustomerDetail(await res.json());
    } catch (e) {
      console.error("Error fetching customer detail:", e);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApplySuggested = () => {
    if (!thresholdConfig?.suggested) return;
    setEditLow(String(thresholdConfig.suggested.low));
    setEditMed(String(thresholdConfig.suggested.medium));
    setShowThresholdEdit(true);
  };

  const handleQuickRange = (days: number) => {
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    setDateTo(toDateInputValue(to));
    setDateFrom(toDateInputValue(from));
    setActiveQuickRange(days);
  };

  // Repurchase insight
  const repurchaseInsight = useMemo(() => {
    if (!data?.repurchasePattern) return null;
    const patterns = data.repurchasePattern.filter((r: any) => r.bucket !== "Nunca recompro");
    const neverBucket = data.repurchasePattern.find((r: any) => r.bucket === "Nunca recompro");
    if (patterns.length === 0) return null;
    let cumPct = 0;
    let within30 = 0;
    for (const p of patterns) {
      cumPct += p.pct;
      if (["0-7 dias", "8-15 dias", "16-30 dias"].includes(p.bucket)) {
        within30 += p.pct;
      }
    }
    return {
      within30: Math.round(within30 * 10) / 10,
      neverPct: neverBucket ? Math.round(neverBucket.pct * 10) / 10 : 0,
    };
  }, [data]);

  // LTV:CAC health indicator
  function ltvCacHealth(ratio: number): { label: string; color: string; bg: string } {
    if (ratio >= 3) return { label: "Saludable", color: "text-emerald-700", bg: "bg-emerald-100" };
    if (ratio >= 1) return { label: "Ajustado", color: "text-yellow-700", bg: "bg-yellow-100" };
    if (ratio > 0) return { label: "Bajo", color: "text-red-700", bg: "bg-red-100" };
    return { label: "Sin datos", color: "text-gray-500", bg: "bg-gray-100" };
  }

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <p className="text-gray-500 font-mono text-sm tracking-wider uppercase">Calculando Lifetime Value...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 font-medium">Error cargando datos de LTV</p>
          <p className="text-red-500 text-sm mt-1">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 transition-colors">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, byChannel, cohorts, repurchasePattern, topCustomers } = data;
  const health = ltvCacHealth(summary.globalLtvCac);

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Lifetime Value
            <InfoTip text="El Lifetime Value (LTV) mide cuanto gasta un cliente en total a lo largo de su relacion con tu tienda. Es la metrica clave para saber que canales te traen clientes valiosos a largo plazo, no solo compradores de una vez." />
          </h1>
          <p className="text-sm text-gray-500 mt-1">Analiza el valor de tus clientes de tienda propia por canal de adquisicion y cohorte</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {QUICK_RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => handleQuickRange(r.days)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeQuickRange === r.days
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {r.label}
            </button>
          ))}
          <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-600">
            Solo Tienda Propia (VTEX)
          </span>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <KpiCard
          icon={<DollarSign size={18} className="text-indigo-600" />}
          iconBg="bg-indigo-50"
          label="LTV Promedio"
          value={formatARS(summary.avgLtv)}
          change={summary.changes.avgLtv}
        />
        <KpiCard
          icon={<RefreshCw size={18} className="text-emerald-600" />}
          iconBg="bg-emerald-50"
          label="Tasa de Recompra"
          value={`${summary.repeatRate}%`}
          change={summary.changes.repeatRate}
          changeLabel="pp vs anterior"
        />
        <KpiCard
          icon={<Clock size={18} className="text-amber-600" />}
          iconBg="bg-amber-50"
          label="Dias p/ Recompra"
          value={summary.avgDaysToRepurchase > 0 ? `${summary.avgDaysToRepurchase} dias` : "N/A"}
          subtitle={`${summary.avgOrders} compras promedio`}
        />
        <div className="bg-white rounded-xl border border-gray-100 p-4 lg:p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-purple-50">
              <Target size={18} className="text-purple-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">
              LTV:CAC
              <InfoTip text="Cuantos pesos de valor de cliente generas por cada peso invertido en adquirirlo. Arriba de 3x es saludable. Debajo de 1x estas perdiendo plata." />
            </span>
          </div>
          <p className="text-xl lg:text-2xl font-bold text-gray-900">
            {summary.globalLtvCac > 0 ? `${summary.globalLtvCac}x` : "N/A"}
          </p>
          <div className="mt-1">
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${health.bg} ${health.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${health.color === "text-emerald-700" ? "bg-emerald-500" : health.color === "text-yellow-700" ? "bg-yellow-500" : "bg-red-500"}`} />
              {health.label}
            </span>
            {summary.globalCac > 0 && (
              <span className="text-[10px] text-gray-400 ml-2">
                CAC: {formatARS(summary.globalCac)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Predicciones de LTV ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Hero banner */}
        <div className="bg-gradient-to-r from-violet-600 via-violet-500 to-indigo-500 px-4 lg:px-5 py-4 lg:py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm mt-0.5">
                <Brain size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-base lg:text-lg font-bold text-white">
                  Predicted Lifetime Value (pLTV)
                </h2>
                <p className="text-violet-100 text-xs mt-1 max-w-xl">
                  Motor predictivo basado en modelos de cohortes BG/NBD. Analiza frecuencia de compra, recencia y valor monetario para predecir el gasto futuro de cada cliente.
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full bg-white/15 text-white backdrop-blur-sm">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.177 14.823l-3.896-3.896 1.414-1.414 2.482 2.482 5.656-5.656 1.414 1.414-7.07 7.07z"/></svg>
                    Validado por Meta CAPI
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full bg-white/15 text-white backdrop-blur-sm">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.177 14.823l-3.896-3.896 1.414-1.414 2.482 2.482 5.656-5.656 1.414 1.414-7.07 7.07z"/></svg>
                    Validado por Google Ads
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full bg-white/15 text-white backdrop-blur-sm">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    Alimenta al NitroPixel
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRunPrediction}
              disabled={predRunning}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {predRunning ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Calculando...
                </>
              ) : (
                <>
                  <RefreshCw size={12} />
                  Recalcular predicciones
                </>
              )}
            </button>
          </div>
          </div>
        </div>
        {/* NitroPixel pipeline indicator */}
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 px-4 lg:px-5 py-2 border-b border-violet-100 flex items-center gap-4 text-[10px]">
          <div className="flex items-center gap-6 text-violet-600 font-medium">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              Datos de compra
            </span>
            <svg width="16" height="8" viewBox="0 0 16 8" className="text-violet-300"><path d="M0 4h12M10 1l3 3-3 3" stroke="currentColor" fill="none" strokeWidth="1.5"/></svg>
            <span className="flex items-center gap-1">
              <Brain size={10} />
              Motor pLTV
            </span>
            <svg width="16" height="8" viewBox="0 0 16 8" className="text-violet-300"><path d="M0 4h12M10 1l3 3-3 3" stroke="currentColor" fill="none" strokeWidth="1.5"/></svg>
            <span className="flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-violet-500"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              NitroPixel
            </span>
            <svg width="16" height="8" viewBox="0 0 16 8" className="text-violet-300"><path d="M0 4h12M10 1l3 3-3 3" stroke="currentColor" fill="none" strokeWidth="1.5"/></svg>
            <span className="flex items-center gap-1">
              <span className="w-4 h-2.5 rounded-sm bg-blue-500" />
              Meta
            </span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-2.5 rounded-sm bg-red-500" />
              Google
            </span>
          </div>
        </div>

        {predData ? (
          <>
            {/* Prediction KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-4 lg:p-5">
              <div className="bg-violet-50 rounded-lg p-3">
                <p className="text-[10px] font-medium text-violet-500 uppercase tracking-wider">Clientes Predichos</p>
                <p className="text-lg font-bold text-violet-900 mt-1">{predData.summary.total.toLocaleString("es-AR")}</p>
              </div>
              <div className="bg-violet-50 rounded-lg p-3">
                <p className="text-[10px] font-medium text-violet-500 uppercase tracking-wider">pLTV 90d Promedio</p>
                <p className="text-lg font-bold text-violet-900 mt-1">{formatARS(predData.summary.avgLtv90d)}</p>
              </div>
              <div className="bg-violet-50 rounded-lg p-3">
                <p className="text-[10px] font-medium text-violet-500 uppercase tracking-wider">pLTV 365d Promedio</p>
                <p className="text-lg font-bold text-violet-900 mt-1">{formatARS(predData.summary.avgLtv365d)}</p>
              </div>
              <div className="bg-violet-50 rounded-lg p-3">
                <p className="text-[10px] font-medium text-violet-500 uppercase tracking-wider">Confianza Prom.</p>
                <p className="text-lg font-bold text-violet-900 mt-1">{Math.round(predData.summary.avgConfidence * 100)}%</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Enviados</p>
                <p className="text-lg font-bold text-gray-400 mt-1">0 / {predData.summary.total}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Meta: 0 · Google: 0</p>
              </div>
            </div>

            {/* Prediction by channel */}
            {predData.byChannel?.length > 0 && (
              <div className="px-4 lg:px-5 pb-2">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">pLTV por Canal de Adquisicion</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs">
                        <th className="text-left px-3 py-2 font-medium">Canal</th>
                        <th className="text-right px-3 py-2 font-medium">Clientes</th>
                        <th className="text-right px-3 py-2 font-medium">pLTV 90d</th>
                        <th className="text-right px-3 py-2 font-medium">pLTV 365d</th>
                      </tr>
                    </thead>
                    <tbody>
                      {predData.byChannel.map((ch: any, i: number) => (
                        <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                          <td className="px-3 py-2 font-medium text-gray-800 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[ch.channel] || "#6366f1" }} />
                            {ch.channel}
                          </td>
                          <td className="text-right px-3 py-2 text-gray-600">{ch.customers.toLocaleString("es-AR")}</td>
                          <td className="text-right px-3 py-2 text-gray-600">{formatARS(ch.avgLtv90d)}</td>
                          <td className="text-right px-3 py-2 font-medium text-violet-700">{formatARS(ch.avgLtv365d)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">Los clientes con canal &quot;Sin datos&quot; son anteriores a la instalacion del NitroPixel.</p>
              </div>
            )}

            {/* Top predicted customers */}
            {predData.topCustomers?.length > 0 && (
              <div className="px-4 lg:px-5 pb-4">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 mt-3">Top Clientes por pLTV Predicho</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs">
                        <th className="text-left px-3 py-2 font-medium">#</th>
                        <th className="text-left px-3 py-2 font-medium">Cliente</th>
                        <th className="text-left px-3 py-2 font-medium">Canal</th>
                        <th className="text-left px-3 py-2 font-medium">Segmento</th>
                        <th className="text-right px-3 py-2 font-medium">pLTV 90d</th>
                        <th className="text-right px-3 py-2 font-medium">pLTV 365d</th>
                        <th className="text-right px-3 py-2 font-medium">Confianza</th>
                        <th className="text-center px-3 py-2 font-medium">Meta</th>
                        <th className="text-center px-3 py-2 font-medium">Google</th>
                      </tr>
                    </thead>
                    <tbody>
                      {predData.topCustomers.slice(0, 10).map((c: any, i: number) => (
                        <React.Fragment key={c.id}>
                          <tr
                            className="border-t border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                            onClick={() => handleExpandCustomer(c.id)}
                          >
                            <td className="px-3 py-2 text-gray-400 text-xs">
                              <span className={`inline-block transition-transform ${expandedCustomer === c.id ? "rotate-90" : ""}`}>
                                <ChevronRight size={12} />
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-800 text-sm">{c.name}</div>
                              {c.email && <div className="text-[10px] text-gray-400">{c.email}</div>}
                            </td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1 text-xs">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[c.channel] || "#6366f1" }} />
                                {c.channel}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                c.segment === "high_value" ? "bg-emerald-100 text-emerald-700" :
                                c.segment === "medium_value" ? "bg-amber-100 text-amber-700" :
                                "bg-gray-100 text-gray-600"
                              }`}>
                                {c.segment === "high_value" ? "Alto" : c.segment === "medium_value" ? "Medio" : "Bajo"}
                              </span>
                            </td>
                            <td className="text-right px-3 py-2 text-gray-600">{formatARS(c.predictedLtv90d)}</td>
                            <td className="text-right px-3 py-2 font-medium text-violet-700">{formatARS(c.predictedLtv365d)}</td>
                            <td className="text-right px-3 py-2">
                              <span className={`text-xs font-medium ${c.confidence >= 0.7 ? "text-emerald-600" : c.confidence >= 0.5 ? "text-amber-600" : "text-red-500"}`}>
                                {Math.round(c.confidence * 100)}%
                              </span>
                            </td>
                            <td className="text-center px-3 py-2">
                              {c.sentToMeta ? (
                                <span className="text-emerald-500"><ShieldCheck size={14} /></span>
                              ) : (
                                <span className="text-gray-300"><Lock size={12} /></span>
                              )}
                            </td>
                            <td className="text-center px-3 py-2">
                              {c.sentToGoogle ? (
                                <span className="text-emerald-500"><ShieldCheck size={14} /></span>
                              ) : (
                                <span className="text-gray-300"><Lock size={12} /></span>
                              )}
                            </td>
                          </tr>
                          {/* Expanded detail row */}
                          {expandedCustomer === c.id && (
                            <tr className="bg-violet-50/30">
                              <td colSpan={9} className="px-4 py-3">
                                {detailLoading ? (
                                  <div className="flex items-center gap-2 text-xs text-gray-400">
                                    <Loader2 size={12} className="animate-spin" /> Cargando historial...
                                  </div>
                                ) : customerDetail ? (
                                  <div className="space-y-3">
                                    {/* Prediction reasoning */}
                                    {customerDetail.prediction?.features && (
                                      <div className="flex flex-wrap gap-3 text-[11px]">
                                        <div className="bg-white rounded px-2 py-1 border border-gray-100">
                                          <span className="text-gray-400">Compras:</span>{" "}
                                          <span className="font-medium text-gray-700">{customerDetail.prediction.features.orderCount || customerDetail.orders?.length || "?"}</span>
                                        </div>
                                        <div className="bg-white rounded px-2 py-1 border border-gray-100">
                                          <span className="text-gray-400">Gasto total:</span>{" "}
                                          <span className="font-medium text-gray-700">{formatARS(customerDetail.prediction.features.totalSpent || 0)}</span>
                                        </div>
                                        <div className="bg-white rounded px-2 py-1 border border-gray-100">
                                          <span className="text-gray-400">Ticket prom:</span>{" "}
                                          <span className="font-medium text-gray-700">{formatARS(customerDetail.prediction.features.avgTicket || 0)}</span>
                                        </div>
                                        <div className="bg-white rounded px-2 py-1 border border-gray-100">
                                          <span className="text-gray-400">Dias como cliente:</span>{" "}
                                          <span className="font-medium text-gray-700">{customerDetail.prediction.features.daysSinceFirst || 0}d</span>
                                        </div>
                                        <div className="bg-white rounded px-2 py-1 border border-gray-100">
                                          <span className="text-gray-400">Ultima compra hace:</span>{" "}
                                          <span className="font-medium text-gray-700">{customerDetail.prediction.features.daysSinceLastOrder || 0}d</span>
                                        </div>
                                        <div className="bg-white rounded px-2 py-1 border border-gray-100">
                                          <span className="text-gray-400">Recompra segmento:</span>{" "}
                                          <span className="font-medium text-gray-700">{Math.round((customerDetail.prediction.features.segmentRepeatRate || 0) * 100)}%</span>
                                        </div>
                                        <div className="bg-white rounded px-2 py-1 border border-gray-100">
                                          <span className="text-gray-400">Metodo:</span>{" "}
                                          <span className="font-medium text-gray-700">{customerDetail.prediction.features.method === "cohort_lookup" ? "Cohorte" : "Historial personal"}</span>
                                        </div>
                                      </div>
                                    )}
                                    {/* Order history */}
                                    {customerDetail.orders?.length > 0 && (
                                      <div>
                                        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">Historial de compras</p>
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="text-gray-400 text-[10px]">
                                              <th className="text-left py-1 pr-3">#</th>
                                              <th className="text-left py-1 pr-3">Fecha</th>
                                              <th className="text-right py-1 pr-3">Monto</th>
                                              <th className="text-left py-1 pr-3">Estado</th>
                                              <th className="text-left py-1">Productos</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {customerDetail.orders.map((o: any, idx: number) => (
                                              <tr key={o.orderId} className="border-t border-gray-100/50">
                                                <td className="py-1.5 pr-3 text-gray-400">{idx + 1}</td>
                                                <td className="py-1.5 pr-3 text-gray-600">
                                                  {new Date(o.date).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
                                                </td>
                                                <td className="py-1.5 pr-3 text-right font-medium text-gray-700">{formatARS(o.total)}</td>
                                                <td className="py-1.5 pr-3">
                                                  <span className={`text-[10px] ${o.status === "INVOICED" || o.status === "COMPLETED" ? "text-emerald-600" : o.status === "CANCELLED" ? "text-red-500" : "text-gray-500"}`}>
                                                    {o.status}
                                                  </span>
                                                </td>
                                                <td className="py-1.5 text-gray-500 truncate max-w-[300px]">{o.products || "-"}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                    {customerDetail.orders?.length === 0 && (
                                      <p className="text-xs text-gray-400">Sin ordenes encontradas</p>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-400">Error cargando datos</p>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Distribution bars */}
            <div className="px-4 lg:px-5 pb-4">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 mt-2">Distribucion de Segmentos</h3>
              <div className="flex gap-1 h-6 rounded-full overflow-hidden">
                {predData.summary.distribution.highValue > 0 && (
                  <div
                    className="bg-emerald-500 flex items-center justify-center text-white text-[10px] font-medium"
                    style={{ width: `${(predData.summary.distribution.highValue / predData.summary.total) * 100}%` }}
                  >
                    {predData.summary.distribution.highValue > 0 ? `Alto: ${predData.summary.distribution.highValue}` : ""}
                  </div>
                )}
                {predData.summary.distribution.mediumValue > 0 && (
                  <div
                    className="bg-amber-400 flex items-center justify-center text-amber-900 text-[10px] font-medium"
                    style={{ width: `${(predData.summary.distribution.mediumValue / predData.summary.total) * 100}%` }}
                  >
                    {predData.summary.distribution.mediumValue > 0 ? `Medio: ${predData.summary.distribution.mediumValue}` : ""}
                  </div>
                )}
                {predData.summary.distribution.lowValue > 0 && (
                  <div
                    className="bg-gray-300 flex items-center justify-center text-gray-700 text-[10px] font-medium"
                    style={{ width: `${(predData.summary.distribution.lowValue / predData.summary.total) * 100}%` }}
                  >
                    {predData.summary.distribution.lowValue > 0 ? `Bajo: ${predData.summary.distribution.lowValue}` : ""}
                  </div>
                )}
              </div>
              {thresholdConfig && (
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Umbrales: Bajo &lt; {formatARS(thresholdConfig.current.low)} · Medio {formatARS(thresholdConfig.current.low)} - {formatARS(thresholdConfig.current.medium)} · Alto &gt; {formatARS(thresholdConfig.current.medium)}
                </p>
              )}
            </div>

            {/* Threshold configuration */}
            {thresholdConfig && (
              <div className="px-4 lg:px-5 pb-4">
                <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-600">Configuracion de umbrales</p>
                      {thresholdConfig.suggested && !showThresholdEdit && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          Sugerido por tus datos: Bajo &lt; {formatARS(thresholdConfig.suggested.low)} · Alto &gt; {formatARS(thresholdConfig.suggested.medium)}
                          <span className="text-gray-300 ml-1">(basado en percentiles p50/p90 de {thresholdConfig.suggested.data.totalCustomers.toLocaleString("es-AR")} clientes)</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {thresholdConfig.suggested && !showThresholdEdit && (
                        <button
                          onClick={handleApplySuggested}
                          className="text-[10px] px-2 py-1 rounded bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
                        >
                          Usar sugerido
                        </button>
                      )}
                      <button
                        onClick={() => setShowThresholdEdit(!showThresholdEdit)}
                        className="text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        {showThresholdEdit ? "Cancelar" : "Editar"}
                      </button>
                    </div>
                  </div>
                  {showThresholdEdit && (
                    <div className="mt-3 flex items-end gap-3">
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">Umbral Bajo (hasta)</label>
                        <input
                          type="number"
                          value={editLow}
                          onChange={(e) => setEditLow(e.target.value)}
                          className="w-28 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-violet-300 focus:border-violet-300"
                          placeholder="25000"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">Umbral Alto (desde)</label>
                        <input
                          type="number"
                          value={editMed}
                          onChange={(e) => setEditMed(e.target.value)}
                          className="w-28 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-violet-300 focus:border-violet-300"
                          placeholder="100000"
                        />
                      </div>
                      <button
                        onClick={handleSaveThresholds}
                        disabled={savingThresholds || !editLow || !editMed || Number(editMed) <= Number(editLow)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                      >
                        {savingThresholds ? "Guardando..." : "Guardar y recalcular"}
                      </button>
                      {thresholdConfig.suggested && (
                        <div className="text-[10px] text-gray-400 pb-1">
                          <div>p50: {formatARS(thresholdConfig.suggested.data.p50)} · p75: {formatARS(thresholdConfig.suggested.data.p75)}</div>
                          <div>p90: {formatARS(thresholdConfig.suggested.data.p90)} · p95: {formatARS(thresholdConfig.suggested.data.p95)}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {predData.lastUpdated && (
              <div className="px-4 lg:px-5 pb-4 text-[10px] text-gray-400">
                Ultima actualizacion: {new Date(predData.lastUpdated).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
              </div>
            )}
          </>
        ) : (
          <div className="p-8 text-center">
            <Brain size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm font-medium">Sin predicciones aun</p>
            <p className="text-gray-400 text-xs mt-1 max-w-md mx-auto">
              Hace click en "Recalcular predicciones" para que el motor analice tus clientes y prediga su valor futuro basandose en el comportamiento historico.
            </p>
            <button
              onClick={handleRunPrediction}
              disabled={predRunning}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {predRunning ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Calculando predicciones...
                </>
              ) : (
                <>
                  <Brain size={14} />
                  Calcular predicciones
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── LTV por Canal de Adquisicion ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 lg:p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            LTV por Canal de Adquisicion
            <InfoTip text="Muestra el valor promedio de un cliente segun el canal por el que llego a tu tienda la primera vez. Te dice donde invertir para atraer clientes que compren mas a largo plazo." />
          </h2>
        </div>
        {byChannel.length > 0 ? (
          <>
            <div className="p-4 lg:p-5" style={{ height: Math.max(200, byChannel.length * 50 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byChannel} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => formatCompact(v)} fontSize={11} />
                  <YAxis type="category" dataKey="channel" width={120} fontSize={11} tick={{ fill: "#4B5563" }} />
                  <Tooltip
                    formatter={(value: number) => [formatARS(value), "LTV Promedio"]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }}
                  />
                  <Bar dataKey="avgLtv" radius={[0, 4, 4, 0]} maxBarSize={30}>
                    {byChannel.map((entry: any, i: number) => (
                      <Cell key={i} fill={CHANNEL_COLORS[entry.channel] || "#6366f1"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs">
                    <th className="text-left px-4 py-2 font-medium">Canal</th>
                    <th className="text-right px-4 py-2 font-medium">Clientes</th>
                    <th className="text-right px-4 py-2 font-medium">LTV Prom.</th>
                    <th className="text-right px-4 py-2 font-medium">Recompra %</th>
                    <th className="text-right px-4 py-2 font-medium">Ord. Prom.</th>
                    <th className="text-right px-4 py-2 font-medium">Revenue Total</th>
                    <th className="text-right px-4 py-2 font-medium">
                      CAC
                      <InfoTip text="Costo de Adquisicion de Cliente. Cuanto gastaste en ads dividido la cantidad de clientes nuevos de ese canal." />
                    </th>
                    <th className="text-right px-4 py-2 font-medium">LTV:CAC</th>
                  </tr>
                </thead>
                <tbody>
                  {byChannel.map((ch: any, i: number) => {
                    const h = ltvCacHealth(ch.ltvCac);
                    return (
                      <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 font-medium text-gray-800 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[ch.channel] || "#6366f1" }} />
                          {ch.channel}
                        </td>
                        <td className="text-right px-4 py-2.5 text-gray-600">{ch.customers.toLocaleString("es-AR")}</td>
                        <td className="text-right px-4 py-2.5 font-medium text-gray-800">{formatARS(ch.avgLtv)}</td>
                        <td className="text-right px-4 py-2.5 text-gray-600">{ch.repeatRate}%</td>
                        <td className="text-right px-4 py-2.5 text-gray-600">{ch.avgOrders}</td>
                        <td className="text-right px-4 py-2.5 text-gray-600">{formatARS(ch.totalRevenue)}</td>
                        <td className="text-right px-4 py-2.5 text-gray-600">{ch.cac > 0 ? formatARS(ch.cac) : "—"}</td>
                        <td className="text-right px-4 py-2.5">
                          {ch.ltvCac > 0 ? (
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${h.bg} ${h.color}`}>
                              {ch.ltvCac}x
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-gray-400 text-sm">
            No hay datos de canales para el periodo seleccionado
          </div>
        )}
      </div>

      {/* ── Retencion por Cohorte ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 lg:p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            Retencion por Cohorte
            <InfoTip text="Cada fila es un grupo de clientes que hicieron su primera compra en el mismo mes. Los porcentajes muestran cuantos volvieron a comprar en los meses siguientes. Verde oscuro = mas clientes volvieron." />
          </h2>
        </div>
        {cohorts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="text-left px-3 py-2 font-medium sticky left-0 bg-gray-50 z-10">Cohorte</th>
                  <th className="text-right px-3 py-2 font-medium">Clientes</th>
                  <th className="text-right px-3 py-2 font-medium">Rev. Inicial</th>
                  {Array.from({ length: 12 }, (_, i) => (
                    <th key={i} className="text-center px-2 py-2 font-medium min-w-[52px]">M{i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((cohort: any, ci: number) => {
                  // Determine how many months have passed since this cohort
                  const cohortDate = new Date(cohort.month + "-01");
                  const now = new Date();
                  const monthsPassed = (now.getFullYear() - cohortDate.getFullYear()) * 12 + (now.getMonth() - cohortDate.getMonth());
                  return (
                    <tr key={ci} className="border-t border-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-white z-10 whitespace-nowrap">
                        {cohort.month}
                      </td>
                      <td className="text-right px-3 py-2 text-gray-600">{cohort.size.toLocaleString("es-AR")}</td>
                      <td className="text-right px-3 py-2 text-gray-600">{formatCompact(cohort.revenue)}</td>
                      {cohort.retention.map((pct: number, mi: number) => (
                        <td key={mi} className="text-center px-1 py-1.5">
                          {mi < monthsPassed ? (
                            <span className={`inline-block w-full px-1 py-1 rounded text-[11px] font-medium ${getRetentionStyle(pct)}`}>
                              {pct > 0 ? `${pct}%` : "0%"}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400 text-sm">
            No hay suficientes datos de cohortes para el periodo seleccionado
          </div>
        )}
      </div>

      {/* ── Patron de Recompra ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 lg:p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            Patron de Recompra
            <InfoTip text="Cuantos dias pasan entre la primera compra y la segunda. Te ayuda a saber cuando es el momento ideal para enviar una campana de retencion." />
          </h2>
          {repurchaseInsight && (
            <p className="text-sm text-gray-500 mt-1">
              El {repurchaseInsight.within30}% de las recompras ocurren dentro de los primeros 30 dias.
              {repurchaseInsight.neverPct > 0 && ` El ${repurchaseInsight.neverPct}% nunca vuelve a comprar.`}
            </p>
          )}
        </div>
        {repurchasePattern.length > 0 ? (
          <div className="p-4 lg:p-5" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={repurchasePattern} margin={{ left: 0, right: 20, top: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bucket" fontSize={11} tick={{ fill: "#6B7280" }} />
                <YAxis tickFormatter={(v) => `${v}%`} fontSize={11} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === "pct") return [`${value}%`, "Porcentaje"];
                    return [value, "Clientes"];
                  }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }}
                />
                <Bar dataKey="pct" radius={[4, 4, 0, 0]} maxBarSize={50}>
                  {repurchasePattern.map((entry: any, i: number) => (
                    <Cell
                      key={i}
                      fill={entry.bucket === "Nunca recompro" ? "#EF4444" : "#6366f1"}
                      opacity={entry.bucket === "Nunca recompro" ? 0.7 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400 text-sm">
            No hay datos de recompra para el periodo seleccionado
          </div>
        )}
      </div>

      {/* ── Top Clientes por LTV ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 lg:p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            Top 20 Clientes por Valor de Vida
            <InfoTip text="Los 20 clientes que mas gastaron en total desde su primera compra. Muestra el canal por el que llegaron, para entender de donde vienen tus mejores clientes." />
          </h2>
        </div>
        {topCustomers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="text-left px-4 py-2 font-medium">#</th>
                  <th className="text-left px-4 py-2 font-medium">Cliente</th>
                  <th className="text-left px-4 py-2 font-medium">Canal</th>
                  <th className="text-right px-4 py-2 font-medium">Compras</th>
                  <th className="text-right px-4 py-2 font-medium">Total Gastado</th>
                  <th className="text-right px-4 py-2 font-medium">Primera Compra</th>
                  <th className="text-right px-4 py-2 font-medium">Ultima Compra</th>
                  <th className="text-right px-4 py-2 font-medium">Dias</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((c: any, i: number) => (
                  <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-800 text-sm">{c.name}</div>
                      {c.email && <div className="text-[11px] text-gray-400">{c.email}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[c.channel] || "#6366f1" }} />
                        {c.channel}
                      </span>
                    </td>
                    <td className="text-right px-4 py-2.5 text-gray-600">{c.orders}</td>
                    <td className="text-right px-4 py-2.5 font-medium text-gray-800">{formatARS(c.totalSpent)}</td>
                    <td className="text-right px-4 py-2.5 text-gray-500 text-xs">{c.firstOrder}</td>
                    <td className="text-right px-4 py-2.5 text-gray-500 text-xs">{c.lastOrder}</td>
                    <td className="text-right px-4 py-2.5 text-gray-500 text-xs">{c.daysAsCustomer}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400 text-sm">
            No hay datos de clientes para el periodo seleccionado
          </div>
        )}
      </div>

      {/* ── Footer stats ── */}
      <div className="text-center text-xs text-gray-400 py-2">
        {summary.totalCustomers.toLocaleString("es-AR")} clientes analizados · Revenue total: {formatARS(summary.totalRevenue)} · Mediana LTV: {formatARS(summary.medianLtv)}
      </div>
    </div>
  );
}
