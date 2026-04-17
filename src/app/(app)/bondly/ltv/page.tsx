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
  Brain, Lock, Send, Loader2, ShieldCheck, Sparkles, Activity,
  TrendingDown, Zap, CircleDollarSign, PiggyBank, Users2, Gauge,
} from "lucide-react";
import { KpiCard, ChangeBadge } from "@/components/dashboard";
import {
  BondlyKeyframes,
  BondlyAuroras,
  KpiTile,
  InfoTip as BondlyInfoTip,
  BondlyTrustStrip,
} from "@/components/bondly/primitives";
import { ES, BONDLY_GRAD } from "@/components/bondly/constants";

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
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "180d", days: 180 },
  { label: "365d", days: 365 },
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

  // Commit 6 additions: insights, behavioral explorer, customer journey
  const [insights, setInsights] = useState<any[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [behavioral, setBehavioral] = useState<any | null>(null);
  const [behavioralLoading, setBehavioralLoading] = useState(true);
  const [behavioralFilter, setBehavioralFilter] = useState<
    "all" | "anonymous_high" | "identified_no_purchase" | "customer_low_score"
  >("anonymous_high");
  const [journeyCustomerId, setJourneyCustomerId] = useState<string | null>(
    null
  );
  const [journeyData, setJourneyData] = useState<any | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);

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

  // Insights engine
  useEffect(() => {
    const fetchInsights = async () => {
      setInsightsLoading(true);
      try {
        const res = await fetch("/api/bondly/ltv-insights");
        if (res.ok) {
          const d = await res.json();
          setInsights(Array.isArray(d.insights) ? d.insights : []);
        }
      } catch {
        setInsights([]);
      } finally {
        setInsightsLoading(false);
      }
    };
    fetchInsights();
  }, []);

  // Behavioral LTV Explorer (re-fetch al cambiar filtro)
  useEffect(() => {
    const fetchBehavioral = async () => {
      setBehavioralLoading(true);
      try {
        const params = new URLSearchParams({
          filter: behavioralFilter,
          limit: "50",
        });
        const res = await fetch(`/api/bondly/behavioral-ltv?${params}`);
        if (res.ok) {
          const d = await res.json();
          setBehavioral(d);
        }
      } catch {
        setBehavioral(null);
      } finally {
        setBehavioralLoading(false);
      }
    };
    fetchBehavioral();
  }, [behavioralFilter]);

  // Customer Journey timeline
  const handleOpenJourney = async (customerId: string) => {
    if (journeyCustomerId === customerId) {
      setJourneyCustomerId(null);
      setJourneyData(null);
      return;
    }
    setJourneyCustomerId(customerId);
    setJourneyData(null);
    setJourneyLoading(true);
    try {
      const res = await fetch(
        `/api/bondly/customer-journey/${customerId}?eventsLimit=200`
      );
      if (res.ok) {
        setJourneyData(await res.json());
      }
    } catch {
      setJourneyData(null);
    } finally {
      setJourneyLoading(false);
    }
  };

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

  // Derivados para los KpiTiles secundarios.
  const historicLtv = Math.round(Number(summary.avgLtv) || 0);
  const medianLtv = Math.round(Number(summary.medianLtv) || 0);
  const repeatRatePct = Math.round(Number(summary.repeatRate) || 0);
  const ltvCacX = Number(summary.globalLtvCac) || 0;
  const predictedLtv365 = Math.round(Number(predData?.summary?.avgLtv365d) || 0);

  // Paretto: top decil (si el backend ya lo trajo en commit 2, lo usamos; sino calculamos fallback).
  const paretoPct = (() => {
    const d = Array.isArray(data.ltvDeciles) ? data.ltvDeciles : null;
    if (d && d.length > 0) {
      const top = d.find((x: any) => x.decile === 10) || d[d.length - 1];
      return Math.round(Number(top?.revenueShare) * 100) || 0;
    }
    return 0;
  })();

  // Behavioral score: lo traemos on-demand si la API está viva; fallback a 0 si no.
  const behavioralCount = Number(data.summary?.behavioralHighCount) || 0;

  return (
    <>
      <BondlyKeyframes />
      <div className="p-4 lg:p-6 max-w-[1400px] mx-auto space-y-6">
        {/* ══ HERO premium Bondly ════════════════════════════════════ */}
        <div
          className="relative overflow-hidden rounded-2xl"
          style={{
            background:
              "linear-gradient(135deg, #0b1020 0%, #0a0f1c 60%, #0b1020 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 50px -30px rgba(16,185,129,0.35)",
          }}
        >
          <BondlyAuroras variant="bondly" />
          <div className="relative z-10 px-5 lg:px-7 py-6 lg:py-8">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-[0.22em] uppercase text-cyan-300/80">
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                      style={{ animation: `bondlyLivePulse 2.4s ${ES} infinite` }}
                    />
                    LIFETIME VALUE · LIVE
                  </span>
                </div>
                <h1
                  className="text-[36px] lg:text-[44px] font-bold leading-tight tracking-tight"
                  style={{
                    backgroundImage: BONDLY_GRAD,
                    backgroundClip: "text",
                    WebkitBackgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  Lifetime Value
                </h1>
                <p className="text-slate-300/80 text-sm mt-2 max-w-2xl leading-relaxed">
                  Tres capas de LTV conviviendo en la misma pantalla: lo que ya gastaron tus clientes, lo que van a gastar (predictivo post-compra) y el potencial de visitantes que todavía no compraron (behavioral pre-compra). Nadie más puede mostrarte las tres juntas.
                </p>
                <div className="mt-3">
                  <BondlyInfoTip
                    label="Cómo se calcula"
                    align="left"
                    content={
                      <div className="space-y-2">
                        <p>
                          <span className="text-cyan-300 font-semibold">Capa 1 · Histórico:</span>{" "}
                          revenue real acumulado por cliente (orders completadas menos devoluciones).
                        </p>
                        <p>
                          <span className="text-cyan-300 font-semibold">Capa 2 · Predicho post-compra:</span>{" "}
                          modelos probabilísticos validados por literatura académica (Fader & Hardie, Wharton School of Business, 2005-2013), entrenados con tu propia historia de compras.
                        </p>
                        <p>
                          <span className="text-cyan-300 font-semibold">Capa 3 · Behavioral pre-compra:</span>{" "}
                          score 0-100 aplicado a tu funnel NitroPixel, basado en investigación de marketing digital (McKinsey, HBR, Google Research) sobre señales tempranas de intención. Recalibración semanal.
                        </p>
                        <p className="text-zinc-400 text-[11px] pt-1 border-t border-zinc-800">
                          Una estimación probabilística, no una garantía.
                        </p>
                      </div>
                    }
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {QUICK_RANGES.map((r) => (
                  <button
                    key={r.days}
                    onClick={() => handleQuickRange(r.days)}
                    className="px-3 py-1.5 text-[11px] font-mono tracking-wider uppercase rounded-lg transition-all"
                    style={{
                      background:
                        activeQuickRange === r.days
                          ? "rgba(6,182,212,0.18)"
                          : "rgba(255,255,255,0.04)",
                      color:
                        activeQuickRange === r.days ? "#67e8f9" : "#94a3b8",
                      border:
                        activeQuickRange === r.days
                          ? "1px solid rgba(6,182,212,0.4)"
                          : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {r.label}
                  </button>
                ))}
                <span
                  className="px-3 py-1.5 text-[11px] font-mono tracking-wider uppercase rounded-lg"
                  style={{
                    background: "rgba(16,185,129,0.10)",
                    color: "#6ee7b7",
                    border: "1px solid rgba(16,185,129,0.20)",
                  }}
                >
                  Solo VTEX
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ══ COMMAND BAR — fila 1: 3 KpiTile mayores (las 3 capas) ══ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-4">
          <KpiTile
            icon={CircleDollarSign}
            iconBg="rgba(16,185,129,0.10)"
            iconColor="#10b981"
            label="LTV HISTÓRICO"
            value={historicLtv}
            loading={loading}
            live
          />
          <KpiTile
            icon={Brain}
            iconBg="rgba(99,102,241,0.10)"
            iconColor="#6366f1"
            label="LTV PREDICHO · 365D"
            value={predictedLtv365}
            loading={loading}
          />
          <KpiTile
            icon={Sparkles}
            iconBg="rgba(168,85,247,0.10)"
            iconColor="#a855f7"
            label="VISITANTES HIGH-SCORE"
            value={behavioralCount}
            loading={loading}
          />
        </div>

        {/* ══ COMMAND BAR — fila 2: 4 KpiTile secundarios ══════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <KpiTile
            icon={Gauge}
            iconBg="rgba(6,182,212,0.10)"
            iconColor="#0891b2"
            label="LTV:CAC GLOBAL"
            value={Math.round(ltvCacX * 100) / 100}
            loading={loading}
          />
          <KpiTile
            icon={RefreshCw}
            iconBg="rgba(245,158,11,0.10)"
            iconColor="#d97706"
            label="RECOMPRA 30D %"
            value={repeatRatePct}
            loading={loading}
          />
          <KpiTile
            icon={PiggyBank}
            iconBg="rgba(236,72,153,0.10)"
            iconColor="#db2777"
            label="MEDIANA LTV"
            value={medianLtv}
            loading={loading}
          />
          <KpiTile
            icon={Users2}
            iconBg="rgba(99,102,241,0.10)"
            iconColor="#6366f1"
            label="PARETO TOP 10%"
            value={paretoPct}
            loading={loading}
          />
        </div>

        {/* Alerta Pareto — muestra si la concentración pasa 60% */}
        {paretoPct > 60 && (
          <div
            className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm"
            style={{
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.25)",
              color: "#92400e",
            }}
          >
            <Zap size={16} className="text-amber-600 shrink-0" />
            <div>
              <span className="font-semibold">Alta concentración:</span> el top 10% de tus clientes genera{" "}
              <span className="font-semibold">{paretoPct}%</span> del revenue. Si perdés uno de esos clientes, dolería.
            </div>
          </div>
        )}

      {/* Spacer — las siguientes secciones usan el wrapper existente que se cierra abajo */}
      <div>{/* sentinel */}</div>

      {/* ── Predicciones de LTV (pLTV engine con Trust Strip) ── */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          background:
            "linear-gradient(135deg, #0b1020 0%, #0a0f1c 60%, #0b1020 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 50px -30px rgba(99,102,241,0.35)",
        }}
      >
        <BondlyAuroras variant="bondly" />
        <div className="relative z-10 px-5 lg:px-7 py-6 lg:py-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="p-2 rounded-xl"
                  style={{
                    background: "rgba(99,102,241,0.14)",
                    border: "1px solid rgba(99,102,241,0.25)",
                  }}
                >
                  <Brain size={18} style={{ color: "#a5b4fc" }} strokeWidth={2.2} />
                </div>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono tracking-[0.18em] uppercase"
                  style={{
                    background: "rgba(168,85,247,0.12)",
                    color: "#d8b4fe",
                    border: "1px solid rgba(168,85,247,0.25)",
                  }}
                >
                  <Sparkles size={9} />
                  Predictivo
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono tracking-[0.18em] uppercase"
                  style={{
                    background: "rgba(6,182,212,0.10)",
                    color: "#67e8f9",
                    border: "1px solid rgba(6,182,212,0.25)",
                  }}
                >
                  Modelo estadístico
                </span>
              </div>
              <h2
                className="text-[24px] lg:text-[28px] font-bold leading-tight tracking-tight"
                style={{
                  backgroundImage: BONDLY_GRAD,
                  backgroundClip: "text",
                  WebkitBackgroundClip: "text",
                  color: "transparent",
                }}
              >
                Predicted Lifetime Value
              </h2>
              <p className="text-slate-300/75 text-xs lg:text-sm mt-2 max-w-2xl leading-relaxed">
                Motor predictivo que combina BG/NBD (cuántas compras va a hacer) y Gamma-Gamma (cuánto va a gastar en cada una). Entrenado con tu propia historia de compras, reentrenado diariamente con data fresca.
              </p>
              <div className="mt-3">
                <BondlyInfoTip
                  label="Cómo se calcula"
                  align="left"
                  content={
                    <div className="space-y-2">
                      <p>
                        Basado en modelos probabilísticos validados por literatura académica{" "}
                        <span className="text-cyan-300 font-semibold">(Fader &amp; Hardie, Wharton School of Business, 2005-2013)</span>,
                        entrenados con tu propia historia de compras.
                      </p>
                      <p>
                        Los modelos estiman de forma independiente la probabilidad de recompra y el valor esperado por cliente, y se combinan para producir la predicción. Cada cliente tiene un intervalo de confianza P10-P50-P90.
                      </p>
                      <p className="text-zinc-400 text-[11px] pt-1 border-t border-zinc-800">
                        El modelo es una estimación probabilística, no una garantía.
                      </p>
                    </div>
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleRunPrediction}
                disabled={predRunning}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
                style={{
                  background: "rgba(99,102,241,0.14)",
                  color: "#c7d2fe",
                  border: "1px solid rgba(99,102,241,0.30)",
                  opacity: predRunning ? 0.5 : 1,
                  cursor: predRunning ? "not-allowed" : "pointer",
                }}
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
          <div className="mt-6 px-0">
            <BondlyTrustStrip variant="predictive-post" />
          </div>
        </div>
      </div>

      {/* Panel interior del pLTV engine con las métricas */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

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

      {/* ══ INSIGHTS ENGINE — cards accionables ══════════════════════════ */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          background:
            "linear-gradient(135deg, #0b1020 0%, #0a0f1c 60%, #0b1020 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 50px -30px rgba(139,92,246,0.35)",
        }}
      >
        <BondlyAuroras variant="bondly" />
        <div className="relative z-10 px-5 lg:px-7 py-5 lg:py-6">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, rgba(139,92,246,0.22), rgba(236,72,153,0.18))",
                border: "1px solid rgba(139,92,246,0.35)",
              }}
            >
              <Sparkles className="w-4 h-4 text-fuchsia-300" />
            </div>
            <div>
              <p className="text-[10px] font-mono tracking-[0.22em] uppercase text-fuchsia-300/80">
                INSIGHTS ENGINE
              </p>
              <h2
                className="text-xl lg:text-2xl font-semibold tracking-tight"
                style={{
                  backgroundImage: BONDLY_GRAD,
                  backgroundClip: "text",
                  WebkitBackgroundClip: "text",
                  color: "transparent",
                }}
              >
                Patrones accionables
              </h2>
            </div>
          </div>

          {insightsLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-32 rounded-xl bg-white/5 border border-white/5"
                />
              ))}
            </div>
          ) : insights.length === 0 ? (
            <div className="px-4 py-6 rounded-xl bg-white/5 border border-white/10 text-center">
              <div className="text-2xl mb-2">💡</div>
              <p className="text-sm text-zinc-300">
                Sin patrones fuertes en este período
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Probá ampliar el rango para dejar que el motor encuentre señales.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {insights.map((card: any) => {
                const toneColor =
                  card.tone === "critical"
                    ? "rgba(239,68,68,0.5)"
                    : card.tone === "opportunity"
                    ? "rgba(16,185,129,0.5)"
                    : card.tone === "whale"
                    ? "rgba(59,130,246,0.5)"
                    : card.tone === "behavioral"
                    ? "rgba(168,85,247,0.5)"
                    : "rgba(234,179,8,0.5)";
                return (
                  <div
                    key={card.id}
                    className="rounded-xl p-4 bg-white/[0.04] hover:bg-white/[0.06] transition-colors"
                    style={{
                      border: `1px solid ${toneColor}`,
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-xl leading-none">{card.icon}</span>
                      <h3 className="text-sm font-semibold text-white leading-snug">
                        {card.title}
                      </h3>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                      {card.body}
                    </p>
                    {card.cta?.href ? (
                      <a
                        href={card.cta.href}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 transition-colors"
                      >
                        {card.cta.label}
                        <ArrowUpRight className="w-3 h-3" />
                      </a>
                    ) : (
                      <button
                        disabled
                        title="Próximamente"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 cursor-not-allowed"
                      >
                        {card.cta?.label ?? "Ver más"}
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-400">
                          Próximamente
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══ BEHAVIORAL LTV EXPLORER ══════════════════════════════════════ */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          background:
            "linear-gradient(135deg, #0b1020 0%, #0a0f1c 60%, #0b1020 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 50px -30px rgba(16,185,129,0.25)",
        }}
      >
        <BondlyAuroras variant="bondly" />
        <div className="relative z-10 px-5 lg:px-7 py-6">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-[0.22em] uppercase text-emerald-300/80">
                  <Activity className="w-3 h-3" />
                  BEHAVIORAL LTV · PRE-COMPRA
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider bg-violet-500/15 text-violet-300 border border-violet-400/30">
                  Modelo estadístico
                </span>
              </div>
              <h2
                className="text-xl lg:text-2xl font-semibold tracking-tight"
                style={{
                  backgroundImage: BONDLY_GRAD,
                  backgroundClip: "text",
                  WebkitBackgroundClip: "text",
                  color: "transparent",
                }}
              >
                Visitantes con perfil de futuro VIP
              </h2>
              <p className="text-xs text-zinc-400 mt-1.5 max-w-2xl leading-relaxed">
                Score 0-100 calculado server-side sobre señales pixel (sesiones,
                navegación, intención, origen, consistencia). Recalibración
                semanal contra conversiones reales.
                <BondlyInfoTip
                  text="Basado en investigación de marketing digital sobre señales tempranas de intención de compra (McKinsey, HBR, Google Research) aplicada a tu propio funnel con NitroPixel. El score es una estimación probabilística, no una garantía."
                  title="Cómo se calcula"
                />
              </p>
            </div>

            {/* Stats rápidas */}
            {behavioral?.stats && (
              <div className="flex flex-wrap gap-2">
                <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-[9px] font-mono tracking-widest uppercase text-zinc-500">
                    Anónimos high
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {(behavioral.stats.anonymousHighScore || 0).toLocaleString(
                      "es-AR"
                    )}
                  </div>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-[9px] font-mono tracking-widest uppercase text-zinc-500">
                    Identif. sin compra
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {(
                      behavioral.stats.identifiedNoPurchase || 0
                    ).toLocaleString("es-AR")}
                  </div>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-[9px] font-mono tracking-widest uppercase text-zinc-500">
                    Total analizado
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {(behavioral.stats.total || 0).toLocaleString("es-AR")}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              { key: "anonymous_high", label: "Anónimos high-score" },
              {
                key: "identified_no_purchase",
                label: "Identificados sin compra",
              },
              { key: "customer_low_score", label: "Clientes behavioral bajo" },
              { key: "all", label: "Todos" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setBehavioralFilter(f.key as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  behavioralFilter === f.key
                    ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/40"
                    : "bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10 hover:text-zinc-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Tabla */}
          <div className="rounded-xl bg-black/20 border border-white/5 overflow-hidden">
            {behavioralLoading ? (
              <div className="p-6 space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-8 rounded bg-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : behavioral?.visitors?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.03] border-b border-white/5">
                    <tr className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                      <th className="text-left px-4 py-2.5 font-medium">
                        Visitor
                      </th>
                      <th className="text-left px-4 py-2.5 font-medium">
                        Status
                      </th>
                      <th className="text-left px-4 py-2.5 font-medium">
                        Score
                      </th>
                      <th className="text-left px-4 py-2.5 font-medium">
                        Drivers
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium">
                        Última visita
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {behavioral.visitors
                      .slice(0, 20)
                      .map((v: any) => (
                        <tr
                          key={v.visitorId}
                          className="border-t border-white/5 hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            <div className="text-xs font-medium text-zinc-200 truncate max-w-[240px]">
                              {v.displayId}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                v.status === "customer"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : v.status === "identified_no_purchase"
                                  ? "bg-amber-500/15 text-amber-300"
                                  : "bg-zinc-500/15 text-zinc-300"
                              }`}
                            >
                              {v.status === "customer"
                                ? "Cliente"
                                : v.status === "identified_no_purchase"
                                ? "Identificado"
                                : "Anónimo"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 rounded-full bg-white/5 overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${v.score}%`,
                                    background: BONDLY_GRAD,
                                  }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-white tabular-nums">
                                {v.score}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {(v.drivers || [])
                                .slice(0, 2)
                                .map((d: string, i: number) => (
                                  <span
                                    key={i}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-300 border border-white/10"
                                  >
                                    {d}
                                  </span>
                                ))}
                            </div>
                          </td>
                          <td className="text-right px-4 py-2.5 text-xs text-zinc-400 tabular-nums">
                            {v.daysSinceLastSeen}d
                          </td>
                          <td className="text-right px-4 py-2.5">
                            {v.customerId ? (
                              <button
                                onClick={() =>
                                  handleOpenJourney(v.customerId!)
                                }
                                className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200 transition-colors"
                              >
                                Ver journey
                              </button>
                            ) : (
                              <button
                                disabled
                                title="Próximamente"
                                className="text-[11px] font-medium text-zinc-600 cursor-not-allowed"
                              >
                                Retargeting
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-zinc-500">
                No hay visitantes para este filtro.
              </div>
            )}
          </div>

          {/* Trust Strip */}
          <div className="mt-5">
            <BondlyTrustStrip variant="predictive-pre" />
          </div>
        </div>
      </div>

      {/* ══ JOURNEY DRAWER — conditional ════════════════════════════════ */}
      {journeyCustomerId && (
        <div
          className="relative overflow-hidden rounded-2xl"
          style={{
            background:
              "linear-gradient(135deg, #0b1020 0%, #0a0f1c 60%, #0b1020 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 50px -30px rgba(59,130,246,0.25)",
          }}
        >
          <BondlyAuroras variant="bondly" />
          <div className="relative z-10 px-5 lg:px-7 py-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-[10px] font-mono tracking-[0.22em] uppercase text-cyan-300/80 mb-1">
                  CUSTOMER JOURNEY
                </p>
                <h2
                  className="text-xl font-semibold tracking-tight"
                  style={{
                    backgroundImage: BONDLY_GRAD,
                    backgroundClip: "text",
                    WebkitBackgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  {journeyData?.customer?.firstName ||
                    journeyData?.customer?.email ||
                    "Cargando..."}
                </h2>
              </div>
              <button
                onClick={() => {
                  setJourneyCustomerId(null);
                  setJourneyData(null);
                }}
                className="text-xs text-zinc-400 hover:text-white transition-colors"
              >
                Cerrar ✕
              </button>
            </div>

            {journeyLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-10 rounded bg-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : journeyData?.timeline?.length > 0 ? (
              <>
                {/* Summary chips */}
                <div className="flex flex-wrap gap-2 mb-4 text-xs">
                  <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-zinc-300">
                    {journeyData.summary.totalSessions} sesiones
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-zinc-300">
                    {journeyData.summary.totalPageViews} pageviews
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-zinc-300">
                    {journeyData.summary.totalOrders} órdenes
                  </span>
                  {journeyData.summary.daysBetweenFirstVisitAndFirstOrder !=
                    null && (
                    <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-400/20 text-cyan-300">
                      {
                        journeyData.summary
                          .daysBetweenFirstVisitAndFirstOrder
                      }
                      d de anónimo a cliente
                    </span>
                  )}
                </div>

                {/* Timeline */}
                <div className="relative pl-6 max-h-[500px] overflow-y-auto">
                  <div
                    className="absolute left-2 top-2 bottom-2 w-px"
                    style={{
                      background:
                        "linear-gradient(to bottom, rgba(16,185,129,0.5), rgba(6,182,212,0.2))",
                    }}
                  />
                  {journeyData.timeline.slice(-80).map((item: any) => {
                    const dotColor =
                      item.type === "order"
                        ? "#10b981"
                        : item.type === "cart_add"
                        ? "#f59e0b"
                        : item.type === "identify"
                        ? "#a855f7"
                        : item.type === "product_view"
                        ? "#06b6d4"
                        : "#64748b";
                    const date = new Date(item.timestamp);
                    return (
                      <div
                        key={item.id}
                        className="relative mb-3 flex items-start gap-3"
                      >
                        <span
                          className="absolute -left-[22px] top-1 w-2.5 h-2.5 rounded-full ring-2 ring-black/40"
                          style={{ backgroundColor: dotColor }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-zinc-200">
                              {item.title}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {date.toLocaleDateString("es-AR", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          {item.subtitle && (
                            <p className="text-[11px] text-zinc-500 truncate max-w-[90%]">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="p-6 text-center text-xs text-zinc-500">
                No hay eventos para este cliente.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ DECILES DE LTV + CONCENTRACIÓN PARETO ════════════════════════ */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 lg:p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            Deciles de LTV y concentración Pareto
            <InfoTip text="Segmenta tus clientes en 10 grupos iguales ordenados por LTV. El decil 10 es tu top 10% de clientes. La concentración te dice cuánto del revenue total generan los mejores deciles." />
          </h2>
        </div>
        <div className="p-4 lg:p-6">
          {Array.isArray(data.ltvDeciles) && data.ltvDeciles.length > 0 ? (
            <>
              {/* Barra horizontal 10 segmentos */}
              <div className="mb-6">
                <div className="flex h-8 rounded-lg overflow-hidden border border-gray-200">
                  {data.ltvDeciles.map((d: any) => {
                    const share = Math.max(
                      0,
                      Math.min(1, Number(d.revenueShare) || 0)
                    );
                    const isTop = d.decile === 10;
                    return (
                      <div
                        key={d.decile}
                        title={`Decil ${d.decile} — ${Math.round(
                          share * 100
                        )}% del revenue`}
                        className="relative flex items-center justify-center text-[10px] font-mono"
                        style={{
                          width: `${Math.max(share * 100, 3)}%`,
                          background: isTop
                            ? "linear-gradient(135deg, #10b981, #06b6d4)"
                            : `rgba(16,185,129,${0.15 + d.decile * 0.07})`,
                          color: isTop ? "white" : "#064e3b",
                          borderRight:
                            d.decile < 10
                              ? "1px solid rgba(255,255,255,0.4)"
                              : undefined,
                          minWidth: "20px",
                        }}
                      >
                        D{d.decile}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1 font-mono uppercase tracking-wider">
                  <span>Menor LTV</span>
                  <span>Mayor LTV</span>
                </div>
              </div>

              {/* Tabla detallada */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
                      <th className="text-left px-3 py-2 font-medium">
                        Decil
                      </th>
                      <th className="text-right px-3 py-2 font-medium">
                        Clientes
                      </th>
                      <th className="text-right px-3 py-2 font-medium">
                        LTV Range
                      </th>
                      <th className="text-right px-3 py-2 font-medium">
                        Revenue
                      </th>
                      <th className="text-right px-3 py-2 font-medium">
                        Share
                      </th>
                      <th className="text-right px-3 py-2 font-medium">
                        Repeat Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.ltvDeciles]
                      .sort((a: any, b: any) => b.decile - a.decile)
                      .map((d: any) => (
                        <tr
                          key={d.decile}
                          className="border-t border-gray-50 hover:bg-gray-50/40"
                        >
                          <td className="px-3 py-2 font-medium text-gray-800">
                            D{d.decile}
                            {d.decile === 10 && (
                              <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-mono uppercase tracking-wider">
                                Top
                              </span>
                            )}
                          </td>
                          <td className="text-right px-3 py-2 text-gray-600 tabular-nums">
                            {Number(d.customers).toLocaleString("es-AR")}
                          </td>
                          <td className="text-right px-3 py-2 text-gray-500 text-xs tabular-nums">
                            {formatARS(Number(d.minLtv) || 0)} —{" "}
                            {formatARS(Number(d.maxLtv) || 0)}
                          </td>
                          <td className="text-right px-3 py-2 text-gray-700 tabular-nums">
                            {formatARS(Number(d.totalRevenue) || 0)}
                          </td>
                          <td className="text-right px-3 py-2 font-medium text-gray-800 tabular-nums">
                            {Math.round(
                              (Number(d.revenueShare) || 0) * 100
                            )}
                            %
                          </td>
                          <td className="text-right px-3 py-2 text-gray-500 text-xs tabular-nums">
                            {Math.round(
                              (Number(d.repeatRate) || 0) * 100
                            )}
                            %
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-sm text-gray-400">
              No hay data suficiente de deciles para este período.
            </div>
          )}
        </div>
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
    </>
  );
}
