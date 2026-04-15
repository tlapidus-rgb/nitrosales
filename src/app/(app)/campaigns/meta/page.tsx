// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════════════
// /campaigns/meta — Rebuild sesión 21
// ──────────────────────────────────────────────────────────────────────
// Bloques:
//   1. Command Bar (header + hero KPIs + breakeven chip)
//   2. Funnel Map (TOF → MOF → BOF)
//   3. Diagnósticos automáticos
//   4. Tabla jerárquica de campañas (expand → adsets)
//   5. Campaign Drawer (right slide)
//
// Premium: light mode, aurora, multi-shadow, count-up animations,
// cubic-bezier (0.16, 1, 0.3, 1), tabular-nums, rounded-2xl, tracking-tight.
// ══════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import { KpiCard, DateRangeFilter } from "@/components/dashboard";
import { useSyncStatus } from "@/lib/hooks/useSyncStatus";
import { useBreakeven } from "@/lib/hooks/useBreakeven";
import { BreakevenChip, roasColorClass } from "@/components/campaigns/BreakevenChip";
import {
  DollarSign, Target, MousePointer, ShoppingCart, Activity,
  ChevronRight, ChevronDown, RefreshCw, Zap, AlertTriangle,
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Sparkles, Flame, Trophy, Hourglass, Gauge, ExternalLink,
  Search, X, Clock, ArrowRight, Layers, BarChart3,
} from "lucide-react";

/* ════════════════════════════════════════════════════
   Constants
   ════════════════════════════════════════════════════ */

const QUICK_RANGES = [
  { label: "7 días", days: 7 },
  { label: "14 días", days: 14 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
];

const FUNNEL_STAGES: Array<{
  key: "TOF" | "MOF" | "BOF";
  label: string;
  sublabel: string;
  hex: string;
  glow: string;
  ring: string;
  text: string;
  soft: string;
}> = [
  {
    key: "TOF",
    label: "Top of Funnel",
    sublabel: "Awareness",
    hex: "#8b5cf6",
    glow: "from-violet-500/15 to-violet-500/0",
    ring: "ring-violet-200",
    text: "text-violet-700",
    soft: "bg-violet-50",
  },
  {
    key: "MOF",
    label: "Mid Funnel",
    sublabel: "Consideration",
    hex: "#3b82f6",
    glow: "from-blue-500/15 to-blue-500/0",
    ring: "ring-blue-200",
    text: "text-blue-700",
    soft: "bg-blue-50",
  },
  {
    key: "BOF",
    label: "Bottom of Funnel",
    sublabel: "Conversión",
    hex: "#10b981",
    glow: "from-emerald-500/15 to-emerald-500/0",
    ring: "ring-emerald-200",
    text: "text-emerald-700",
    soft: "bg-emerald-50",
  },
];

function toDateInputValue(d: Date) {
  return d.toISOString().split("T")[0];
}

const ES_TRANSITION = "cubic-bezier(0.16, 1, 0.3, 1)";

/* ════════════════════════════════════════════════════
   Hooks
   ════════════════════════════════════════════════════ */

function useCountUp(target: number, duration = 600) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const step = (t: number) => {
      if (!startRef.current) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4); // easeOutQuart
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}

/* ════════════════════════════════════════════════════
   Small Components
   ════════════════════════════════════════════════════ */

function CountARS({ value }: { value: number }) {
  const v = useCountUp(value, 700);
  return <span className="tabular-nums">{formatARS(v)}</span>;
}

function CountX({ value, digits = 2 }: { value: number; digits?: number }) {
  const v = useCountUp(value, 700);
  return <span className="tabular-nums">{v.toFixed(digits)}x</span>;
}

function CountNum({ value }: { value: number }) {
  const v = useCountUp(value, 700);
  return <span className="tabular-nums">{Math.round(v).toLocaleString("es-AR")}</span>;
}

function DeltaPill({ value, inverse = false }: { value: number; inverse?: boolean }) {
  if (!isFinite(value) || value === 0) {
    return <span className="text-[11px] text-slate-400 tabular-nums">—</span>;
  }
  const good = inverse ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${
        good ? "text-emerald-600" : "text-rose-500"
      }`}
    >
      <Icon size={11} strokeWidth={2.5} />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const s = (status || "").toUpperCase();
  const cfg =
    s === "ACTIVE"
      ? { bg: "bg-emerald-500", label: "Activa", ring: "ring-emerald-200" }
      : s === "PAUSED"
      ? { bg: "bg-amber-400", label: "Pausada", ring: "ring-amber-200" }
      : s === "ARCHIVED"
      ? { bg: "bg-slate-400", label: "Archivada", ring: "ring-slate-200" }
      : { bg: "bg-slate-300", label: s || "Sin estado", ring: "ring-slate-200" };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.bg} ring-2 ${cfg.ring}`} />
      {cfg.label}
    </span>
  );
}

function StageChip({ stage }: { stage: string }) {
  const cfg = FUNNEL_STAGES.find((f) => f.key === stage);
  if (!cfg) {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
        —
      </span>
    );
  }
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${cfg.soft} ${cfg.text}`}
    >
      {cfg.key}
    </span>
  );
}

/**
 * Auto-classify a campaign or adset based on simple heuristics.
 * Returns a badge config (or null if nothing interesting).
 */
function classifyCampaign(c: {
  status: string;
  spend: number;
  conversions: number;
  roas: number;
  daysWithData: number;
  breakevenRoas: number;
}): { label: string; kind: string; Icon: any; soft: string; text: string } | null {
  const active = (c.status || "").toUpperCase() === "ACTIVE";
  if (!active) return null;

  // Ganador: ROAS muy por encima del BE con gasto relevante
  if (c.breakevenRoas > 0 && c.roas >= c.breakevenRoas * 1.5 && c.spend > 5000) {
    return {
      label: "Ganador",
      kind: "win",
      Icon: Trophy,
      soft: "bg-emerald-50",
      text: "text-emerald-700",
    };
  }

  // Quemado: gasto alto sin conversiones en varios días
  if (c.spend > 10000 && c.conversions === 0 && c.daysWithData >= 5) {
    return {
      label: "Quemado",
      kind: "burn",
      Icon: Flame,
      soft: "bg-rose-50",
      text: "text-rose-700",
    };
  }

  // En aprendizaje: poca data aún
  if (c.daysWithData > 0 && c.daysWithData <= 3 && c.conversions < 5) {
    return {
      label: "En aprendizaje",
      kind: "learn",
      Icon: Hourglass,
      soft: "bg-blue-50",
      text: "text-blue-700",
    };
  }

  // Sangrando: ROAS debajo del BE con gasto alto
  if (c.breakevenRoas > 0 && c.roas < c.breakevenRoas && c.spend > 5000) {
    return {
      label: "Por debajo BE",
      kind: "bleed",
      Icon: AlertTriangle,
      soft: "bg-amber-50",
      text: "text-amber-700",
    };
  }

  return null;
}

function Badge({
  Icon,
  label,
  soft,
  text,
}: {
  Icon: any;
  label: string;
  soft: string;
  text: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${soft} ${text}`}
    >
      <Icon size={10} strokeWidth={2.5} />
      {label}
    </span>
  );
}

/**
 * Sparkline for a single campaign from dailyTrend (platform-scoped spend).
 * Here we receive the campaign's own dailyMetrics (spend per day) if available;
 * if not, we show a flat line.
 */
function Sparkline({ points, color = "#3b82f6" }: { points: number[]; color?: string }) {
  if (!points || points.length < 2) {
    return <span className="text-[11px] text-slate-300">—</span>;
  }
  const max = Math.max(...points, 1);
  const min = Math.min(...points);
  const w = 80;
  const h = 22;
  const step = w / (points.length - 1);
  const d = points
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / (max - min || 1)) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="block">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════
   Main Page
   ════════════════════════════════════════════════════ */

export default function MetaCampaignsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MetaCampaignsInner />
    </Suspense>
  );
}

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-[1400px] mx-auto animate-pulse space-y-4">
        <div className="h-8 w-64 bg-slate-200 rounded" />
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white rounded-2xl" />
          ))}
        </div>
        <div className="h-64 bg-white rounded-2xl" />
      </div>
    </div>
  );
}

function MetaCampaignsInner() {
  /* ── Date range ───────────────────────────────── */
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(
    toDateInputValue(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
  );
  const [dateTo, setDateTo] = useState(toDateInputValue(now));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(30);

  /* ── Data state ───────────────────────────────── */
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [structure, setStructure] = useState<any>(null);
  const [structureLoading, setStructureLoading] = useState(false);

  /* ── UI state ─────────────────────────────────── */
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<"ALL" | "TOF" | "MOF" | "BOF">("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  /* ── Hooks: sync + breakeven ──────────────────── */
  const { lastSyncAt, isSyncing, triggerSync, onSyncComplete } = useSyncStatus("META_ADS");
  const breakeven = useBreakeven(dateFrom, dateTo);

  /* ── Fetching ─────────────────────────────────── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/metrics/campaigns?platform=META&from=${dateFrom}&to=${dateTo}`,
        { cache: "no-store" }
      );
      const d = await r.json();
      setData(d && typeof d === "object" ? d : null);
    } catch (e) {
      console.error("[/campaigns/meta] fetchData error", e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  const fetchStructure = useCallback(async () => {
    setStructureLoading(true);
    try {
      const r = await fetch(
        `/api/metrics/ads/structure?platform=META&from=${dateFrom}&to=${dateTo}`,
        { cache: "no-store" }
      );
      const d = await r.json();
      setStructure(d && typeof d === "object" ? d : null);
    } catch (e) {
      console.error("[/campaigns/meta] fetchStructure error", e);
      setStructure(null);
    } finally {
      setStructureLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
    fetchStructure();
  }, [fetchData, fetchStructure]);

  // Refresh when sync completes
  useEffect(() => {
    onSyncComplete(() => {
      fetchData();
      fetchStructure();
    });
  }, [onSyncComplete, fetchData, fetchStructure]);

  /* ── Date range handlers ──────────────────────── */
  const handleQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    setDateFrom(toDateInputValue(start));
    setDateTo(toDateInputValue(end));
    setActiveQuickRange(days);
  };
  const handleDateChange = (type: "from" | "to", value: string) => {
    if (type === "from") setDateFrom(value);
    else setDateTo(value);
    setActiveQuickRange(null);
  };

  /* ── Derived data ─────────────────────────────── */
  const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : [];
  const totals = data?.totals || {};
  const changes = data?.changes || {};
  const funnelSummary = Array.isArray(data?.funnelSummary) ? data.funnelSummary : [];
  const dailyTrend = Array.isArray(data?.dailyTrend) ? data.dailyTrend : [];

  const metaCampaigns = useMemo(
    () => campaigns.filter((c: any) => c.platform === "META"),
    [campaigns]
  );

  const metaTotals = useMemo(() => {
    return metaCampaigns.reduce(
      (acc: any, c: any) => ({
        spend: acc.spend + (c.spend || 0),
        impressions: acc.impressions + (c.impressions || 0),
        clicks: acc.clicks + (c.clicks || 0),
        conversions: acc.conversions + (c.conversions || 0),
        conversionValue: acc.conversionValue + (c.conversionValue || 0),
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 }
    );
  }, [metaCampaigns]);

  const metaRoas = metaTotals.spend > 0 ? metaTotals.conversionValue / metaTotals.spend : 0;
  const metaCtr = metaTotals.impressions > 0 ? (metaTotals.clicks / metaTotals.impressions) * 100 : 0;
  const metaCpa = metaTotals.conversions > 0 ? metaTotals.spend / metaTotals.conversions : 0;

  // Filter + search
  const displayCampaigns = useMemo(() => {
    let list = metaCampaigns;
    if (stageFilter !== "ALL") list = list.filter((c: any) => c.funnelStage === stageFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((c: any) => (c.name || "").toLowerCase().includes(q));
    }
    return list;
  }, [metaCampaigns, stageFilter, query]);

  // Funnel aggregates (Meta only)
  const metaFunnel = useMemo(() => {
    const agg: Record<string, { spend: number; conversions: number; conversionValue: number; count: number }> = {
      TOF: { spend: 0, conversions: 0, conversionValue: 0, count: 0 },
      MOF: { spend: 0, conversions: 0, conversionValue: 0, count: 0 },
      BOF: { spend: 0, conversions: 0, conversionValue: 0, count: 0 },
    };
    metaCampaigns.forEach((c: any) => {
      const s = c.funnelStage;
      if (agg[s]) {
        agg[s].spend += c.spend || 0;
        agg[s].conversions += c.conversions || 0;
        agg[s].conversionValue += c.conversionValue || 0;
        agg[s].count++;
      }
    });
    return agg;
  }, [metaCampaigns]);

  // Diagnóstico: auto-insights
  const diagnostics = useMemo(() => {
    const out: Array<{
      severity: "high" | "med" | "low";
      Icon: any;
      title: string;
      detail: string;
      campaignId?: string;
    }> = [];

    // Check: no ACTIVE campaigns
    const active = metaCampaigns.filter((c: any) => (c.status || "").toUpperCase() === "ACTIVE");
    if (metaCampaigns.length > 0 && active.length === 0) {
      out.push({
        severity: "high",
        Icon: AlertTriangle,
        title: "Sin campañas activas",
        detail: `Todas las ${metaCampaigns.length} campañas están pausadas o archivadas.`,
      });
    }

    // Check: quemadas (spend alto sin conversiones)
    const burned = metaCampaigns.filter(
      (c: any) =>
        (c.status || "").toUpperCase() === "ACTIVE" &&
        c.spend > 10000 &&
        c.conversions === 0 &&
        c.daysWithData >= 5
    );
    burned.slice(0, 3).forEach((c: any) => {
      out.push({
        severity: "high",
        Icon: Flame,
        title: "Campaña quemada",
        detail: `${c.name} gastó ${formatARS(c.spend)} en ${c.daysWithData} días sin conversiones.`,
        campaignId: c.id,
      });
    });

    // Check: ROAS bajo break-even con gasto
    if (breakeven.breakevenRoas > 0) {
      const bleeding = metaCampaigns.filter(
        (c: any) =>
          (c.status || "").toUpperCase() === "ACTIVE" &&
          c.spend > 5000 &&
          c.roas > 0 &&
          c.roas < breakeven.breakevenRoas
      );
      if (bleeding.length > 0) {
        const totalBleed = bleeding.reduce((s: number, c: any) => s + c.spend, 0);
        out.push({
          severity: "med",
          Icon: TrendingDown,
          title: `${bleeding.length} campañas bajo break-even`,
          detail: `Gastando ${formatARS(totalBleed)} con ROAS < ${breakeven.breakevenRoas.toFixed(2)}x.`,
        });
      }
    }

    // Check: ganadoras — buena noticia
    if (breakeven.breakevenRoas > 0) {
      const winners = metaCampaigns.filter(
        (c: any) =>
          (c.status || "").toUpperCase() === "ACTIVE" &&
          c.spend > 5000 &&
          c.roas >= breakeven.breakevenRoas * 1.5
      );
      if (winners.length > 0) {
        const topWinner = [...winners].sort((a: any, b: any) => b.roas - a.roas)[0];
        out.push({
          severity: "low",
          Icon: Trophy,
          title: `${winners.length} campaña${winners.length > 1 ? "s" : ""} ganadora${winners.length > 1 ? "s" : ""}`,
          detail: `Top: ${topWinner.name} con ${topWinner.roas.toFixed(2)}x ROAS.`,
          campaignId: topWinner.id,
        });
      }
    }

    // Check: no data
    if (metaCampaigns.length === 0 && !loading) {
      out.push({
        severity: "med",
        Icon: AlertTriangle,
        title: "Sin datos de Meta Ads",
        detail: "No hay campañas en este rango. Verificá la conexión o ampliá el período.",
      });
    }

    return out;
  }, [metaCampaigns, breakeven.breakevenRoas, loading]);

  // Build per-campaign spend series (last N days) from dailyTrend
  // dailyTrend has META/GOOGLE/TIKTOK totals, not per-campaign. Fallback to sparkline from structure.
  const spendByDay = useMemo(() => {
    const list = dailyTrend
      .slice(-14)
      .map((d: any) => ({ date: d.date, spend: d.META || 0, revenue: d.conversionValue || 0 }));
    return list;
  }, [dailyTrend]);

  // Find drawer campaign
  const drawerCampaign = useMemo(() => {
    if (!drawerId) return null;
    const c = metaCampaigns.find((x: any) => x.id === drawerId);
    const s = structure?.campaigns?.find((x: any) => x.id === drawerId);
    return c ? { ...c, adSets: s?.adSets || [] } : null;
  }, [drawerId, metaCampaigns, structure]);

  // Structure map for expand → adsets
  const adsetsByCampaign = useMemo(() => {
    const m: Record<string, any[]> = {};
    (structure?.campaigns || []).forEach((c: any) => {
      m[c.id] = c.adSets || [];
    });
    return m;
  }, [structure]);

  /* ════════════════════════════════════════════════════
     Render
     ════════════════════════════════════════════════════ */
  const hasData = metaCampaigns.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-x-hidden">
      {/* ── Aurora background ── */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1100px 600px at 15% -10%, rgba(139,92,246,0.12), transparent 60%), radial-gradient(900px 500px at 95% 10%, rgba(59,130,246,0.10), transparent 60%), radial-gradient(800px 400px at 50% 100%, rgba(16,185,129,0.06), transparent 65%)",
        }}
      />

      <div className="max-w-[1400px] mx-auto p-5 lg:p-8 space-y-6">
        {/* ── Header ── */}
        <div
          className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
          style={{ animation: `meta-enter 500ms ${ES_TRANSITION}` }}
        >
          <div>
            <div className="text-xs text-slate-500 tracking-tight flex items-center gap-1.5">
              <span>Campañas</span>
              <ChevronRight size={12} className="text-slate-300" />
              <span className="text-slate-700 font-medium">Meta Ads</span>
            </div>
            <h1 className="mt-1 text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              Meta Ads
              <span className="text-[11px] font-medium uppercase tracking-widest text-slate-400">
                Facebook · Instagram
              </span>
            </h1>
            <p className="mt-1 text-sm text-slate-500 tracking-tight">
              Visión unificada de performance, funnel y diagnóstico para tus campañas Meta.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <SyncPill lastSyncAt={lastSyncAt} isSyncing={isSyncing} onTrigger={triggerSync} />
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
        </div>

        {/* ── Breakeven chip ── */}
        {!breakeven.loading && (
          <div style={{ animation: `meta-enter 500ms ${ES_TRANSITION} 80ms both` }}>
            <BreakevenChip
              currentRoas={metaRoas}
              breakevenRoas={breakeven.breakevenRoas}
              contributionMargin={breakeven.contributionMargin}
            />
          </div>
        )}

        {/* ══════════════════════════════════════════════
            BLOCK 1 — Command Bar (Hero KPIs)
           ══════════════════════════════════════════════ */}
        <section
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          style={{ animation: `meta-enter 500ms ${ES_TRANSITION} 120ms both` }}
        >
          <HeroKpi
            icon={<DollarSign size={16} className="text-slate-700" />}
            iconBg="bg-slate-100"
            label="Gasto"
            value={<CountARS value={metaTotals.spend} />}
            delta={changes?.spend}
            sub="Total en rango"
          />
          <HeroKpi
            icon={<Target size={16} className="text-emerald-700" />}
            iconBg="bg-emerald-50"
            label="ROAS"
            value={<CountX value={metaRoas} />}
            delta={changes?.roas}
            sub={
              breakeven.breakevenRoas > 0
                ? `Break-even ${breakeven.breakevenRoas.toFixed(2)}x`
                : "Sin break-even"
            }
            valueClass={roasColorClass(metaRoas, breakeven.breakevenRoas)}
          />
          <HeroKpi
            icon={<MousePointer size={16} className="text-blue-700" />}
            iconBg="bg-blue-50"
            label="CTR"
            value={
              <span className="tabular-nums">
                <CountUpPct value={metaCtr} />%
              </span>
            }
            delta={null}
            sub={`${formatCompact(metaTotals.clicks)} clicks / ${formatCompact(metaTotals.impressions)} imp`}
          />
          <HeroKpi
            icon={<ShoppingCart size={16} className="text-violet-700" />}
            iconBg="bg-violet-50"
            label="Conversiones"
            value={<CountNum value={metaTotals.conversions} />}
            delta={changes?.conversions}
            sub={metaCpa > 0 ? `CPA ${formatARS(metaCpa)}` : "—"}
          />
        </section>

        {/* ══════════════════════════════════════════════
            BLOCK 2 — Funnel Map
           ══════════════════════════════════════════════ */}
        <section
          className="rounded-2xl bg-white/90 backdrop-blur p-5 lg:p-6 border border-slate-100"
          style={{
            boxShadow:
              "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
            animation: `meta-enter 500ms ${ES_TRANSITION} 180ms both`,
          }}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                <Layers size={15} className="text-slate-500" />
                Mapa del funnel
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Distribución de gasto y retorno por etapa
              </p>
            </div>
            <span className="text-[11px] text-slate-400 tabular-nums">
              Total: {formatARS(metaTotals.spend)}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-3 relative">
            {FUNNEL_STAGES.map((f, idx) => {
              const v = metaFunnel[f.key] || { spend: 0, count: 0, conversionValue: 0, conversions: 0 };
              const pct = metaTotals.spend > 0 ? (v.spend / metaTotals.spend) * 100 : 0;
              const roas = v.spend > 0 ? v.conversionValue / v.spend : 0;
              return (
                <div key={f.key} className="relative">
                  <div
                    className="rounded-2xl p-4 lg:p-5 bg-white ring-1 ring-slate-100 relative overflow-hidden"
                    style={{
                      boxShadow:
                        "0 1px 0 rgba(15,23,42,0.04), 0 4px 12px -6px rgba(15,23,42,0.08)",
                    }}
                  >
                    <div
                      aria-hidden
                      className={`absolute inset-0 bg-gradient-to-br ${f.glow} pointer-events-none`}
                    />
                    <div className="relative">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className={`text-[10px] font-bold uppercase tracking-widest ${f.text}`}>
                            {f.key}
                          </div>
                          <div className="text-sm font-semibold text-slate-900 mt-0.5 tracking-tight">
                            {f.label}
                          </div>
                          <div className="text-[11px] text-slate-500">{f.sublabel}</div>
                        </div>
                        <span className={`text-[10px] font-semibold ${f.text} ${f.soft} px-2 py-0.5 rounded-md`}>
                          {v.count} camp
                        </span>
                      </div>

                      <div className="mt-4">
                        <div className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
                          {formatARS(v.spend)}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                          {pct.toFixed(1)}% del gasto
                        </div>
                      </div>

                      <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-[width]"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            backgroundColor: f.hex,
                            transition: `width 600ms ${ES_TRANSITION}`,
                          }}
                        />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <Mini label="ROAS" value={`${roas.toFixed(2)}x`} valueClass={roasColorClass(roas, breakeven.breakevenRoas)} />
                        <Mini label="Conv." value={Math.round(v.conversions).toLocaleString("es-AR")} />
                      </div>
                    </div>
                  </div>

                  {idx < FUNNEL_STAGES.length - 1 && (
                    <div className="hidden lg:flex absolute -right-2.5 top-1/2 -translate-y-1/2 items-center justify-center z-10">
                      <div className="w-5 h-5 rounded-full bg-white ring-1 ring-slate-200 flex items-center justify-center shadow-sm">
                        <ArrowRight size={12} className="text-slate-400" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            BLOCK 3 — Diagnósticos
           ══════════════════════════════════════════════ */}
        <section
          className="rounded-2xl bg-white/90 backdrop-blur p-5 lg:p-6 border border-slate-100"
          style={{
            boxShadow:
              "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
            animation: `meta-enter 500ms ${ES_TRANSITION} 240ms both`,
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                <Sparkles size={15} className="text-slate-500" />
                Diagnósticos automáticos
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Insights generados de tus campañas Meta
              </p>
            </div>
            <span className="text-[11px] text-slate-400 tabular-nums">
              {diagnostics.length} {diagnostics.length === 1 ? "insight" : "insights"}
            </span>
          </div>

          {diagnostics.length === 0 ? (
            <EmptyInsight />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {diagnostics.map((d, i) => (
                <DiagnosticCard
                  key={i}
                  severity={d.severity}
                  Icon={d.Icon}
                  title={d.title}
                  detail={d.detail}
                  onClick={d.campaignId ? () => setDrawerId(d.campaignId!) : undefined}
                />
              ))}
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════════
            BLOCK 4 — Campaign Table (hierarchical)
           ══════════════════════════════════════════════ */}
        <section
          className="rounded-2xl bg-white border border-slate-100 overflow-hidden"
          style={{
            boxShadow:
              "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
            animation: `meta-enter 500ms ${ES_TRANSITION} 300ms both`,
          }}
        >
          {/* Table header bar */}
          <div className="p-4 lg:p-5 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                <BarChart3 size={15} className="text-slate-500" />
                Campañas
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {displayCampaigns.length} de {metaCampaigns.length} — clic para ver detalle
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar campaña…"
                  className="pl-7.5 pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-52 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition-[border,box-shadow] tracking-tight"
                  style={{ transition: `border-color 180ms ${ES_TRANSITION}, box-shadow 180ms ${ES_TRANSITION}` }}
                />
              </div>

              <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
                {(["ALL", "TOF", "MOF", "BOF"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStageFilter(s)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md tracking-tight ${
                      stageFilter === s
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                    style={{ transition: `background-color 180ms ${ES_TRANSITION}, color 180ms ${ES_TRANSITION}` }}
                  >
                    {s === "ALL" ? "Todas" : s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <TableSkeleton />
          ) : displayCampaigns.length === 0 ? (
            <EmptyTable hasData={hasData} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 border-b border-slate-100">
                    <th className="text-left py-3 px-4 lg:px-6">Campaña</th>
                    <th className="text-left py-3 px-2">Stage</th>
                    <th className="text-left py-3 px-2">Estado</th>
                    <th className="text-right py-3 px-2">Gasto</th>
                    <th className="text-right py-3 px-2">CTR</th>
                    <th className="text-right py-3 px-2">CPA</th>
                    <th className="text-right py-3 px-2">Conv.</th>
                    <th className="text-right py-3 px-2">ROAS</th>
                    <th className="text-right py-3 px-2">Tags</th>
                    <th className="w-8 py-3 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayCampaigns.map((c: any, idx: number) => {
                    const badge = classifyCampaign({
                      status: c.status,
                      spend: c.spend,
                      conversions: c.conversions,
                      roas: c.roas,
                      daysWithData: c.daysWithData,
                      breakevenRoas: breakeven.breakevenRoas,
                    });
                    const expanded = expandedId === c.id;
                    const adsets = adsetsByCampaign[c.id] || [];
                    return (
                      <React.Fragment key={c.id}>
                        <tr
                          className="border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer group"
                          style={{ transition: `background-color 180ms ${ES_TRANSITION}` }}
                          onClick={() => setDrawerId(c.id)}
                        >
                          <td className="py-3 px-4 lg:px-6">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedId(expanded ? null : c.id);
                                }}
                                className="p-0.5 rounded hover:bg-slate-100 text-slate-400"
                                style={{ transition: `transform 200ms ${ES_TRANSITION}` }}
                                aria-label={expanded ? "Colapsar" : "Expandir"}
                              >
                                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                              <div className="min-w-0">
                                <div className="text-[13px] font-medium text-slate-900 truncate max-w-[280px] tracking-tight">
                                  {c.name}
                                </div>
                                <div className="text-[10px] text-slate-400 tabular-nums">
                                  {c.daysWithData} día{c.daysWithData === 1 ? "" : "s"} con data
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <StageChip stage={c.funnelStage} />
                          </td>
                          <td className="py-3 px-2">
                            <StatusDot status={c.status} />
                          </td>
                          <td className="py-3 px-2 text-right text-[13px] text-slate-900 tabular-nums font-medium">
                            {formatARS(c.spend)}
                          </td>
                          <td className="py-3 px-2 text-right text-[12px] text-slate-700 tabular-nums">
                            {c.ctr.toFixed(2)}%
                          </td>
                          <td className="py-3 px-2 text-right text-[12px] text-slate-700 tabular-nums">
                            {c.costPerConversion > 0 ? formatARS(c.costPerConversion) : "—"}
                          </td>
                          <td className="py-3 px-2 text-right text-[12px] text-slate-700 tabular-nums">
                            {c.conversions.toLocaleString("es-AR")}
                          </td>
                          <td className="py-3 px-2 text-right text-[13px] font-bold tabular-nums">
                            <span className={roasColorClass(c.roas, breakeven.breakevenRoas)}>
                              {c.roas.toFixed(2)}x
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right">
                            {badge ? (
                              <Badge Icon={badge.Icon} label={badge.label} soft={badge.soft} text={badge.text} />
                            ) : (
                              <span className="text-[11px] text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <ExternalLink size={12} className="text-slate-300 group-hover:text-slate-500" />
                          </td>
                        </tr>

                        {expanded && (
                          <tr className="bg-slate-50/70 border-b border-slate-100">
                            <td colSpan={10} className="p-4 lg:p-5">
                              {structureLoading && adsets.length === 0 ? (
                                <div className="text-[11px] text-slate-500">Cargando ad sets…</div>
                              ) : adsets.length === 0 ? (
                                <div className="text-[11px] text-slate-500">Sin ad sets en este período.</div>
                              ) : (
                                <AdsetsMini
                                  adsets={adsets}
                                  breakevenRoas={breakeven.breakevenRoas}
                                />
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Footer mini chart */}
        {spendByDay.length > 0 && (
          <section
            className="rounded-2xl bg-white border border-slate-100 p-5 lg:p-6"
            style={{
              boxShadow:
                "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
              animation: `meta-enter 500ms ${ES_TRANSITION} 360ms both`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
                  Gasto diario Meta · 14 días
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Tendencia de inversión en la plataforma
                </p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={spendByDay}>
                <defs>
                  <linearGradient id="metaSpendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => (d || "").slice(5)}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(n) => formatCompact(n)}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: 10,
                    fontSize: 11,
                    boxShadow: "0 8px 24px -12px rgba(15,23,42,0.12)",
                  }}
                  labelStyle={{ color: "#64748b" }}
                  formatter={(v: any) => [formatARS(v), "Gasto"]}
                />
                <Area
                  type="monotone"
                  dataKey="spend"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#metaSpendGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </section>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          BLOCK 5 — Campaign Drawer
         ══════════════════════════════════════════════ */}
      <CampaignDrawer
        open={!!drawerId}
        onClose={() => setDrawerId(null)}
        campaign={drawerCampaign}
        breakevenRoas={breakeven.breakevenRoas}
        loadingStructure={structureLoading}
      />

      {/* ── Animations ── */}
      <style jsx global>{`
        @keyframes meta-enter {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes meta-slide-in {
          0% {
            opacity: 0;
            transform: translateX(24px);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Sub-components
   ════════════════════════════════════════════════════ */

function SyncPill({
  lastSyncAt,
  isSyncing,
  onTrigger,
}: {
  lastSyncAt: string | null;
  isSyncing: boolean;
  onTrigger: () => void;
}) {
  const ago = useMemo(() => {
    if (!lastSyncAt) return "Nunca";
    const s = Math.round((Date.now() - new Date(lastSyncAt).getTime()) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}min`;
    return `${Math.round(s / 3600)}h`;
  }, [lastSyncAt]);
  return (
    <button
      onClick={onTrigger}
      disabled={isSyncing}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white ring-1 ring-slate-200 text-[11px] text-slate-600 hover:ring-slate-300 disabled:opacity-60 tracking-tight"
      style={{ transition: `box-shadow 180ms ${ES_TRANSITION}` }}
      title={lastSyncAt ? `Última sync: ${new Date(lastSyncAt).toLocaleString("es-AR")}` : "Nunca sincronizado"}
    >
      <RefreshCw size={11} className={isSyncing ? "animate-spin" : ""} />
      {isSyncing ? "Sincronizando…" : <>Sync · <span className="tabular-nums font-medium">{ago}</span></>}
    </button>
  );
}

function HeroKpi({
  icon,
  iconBg,
  label,
  value,
  delta,
  sub,
  valueClass = "",
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: React.ReactNode;
  delta: number | null | undefined;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div
      className="rounded-2xl bg-white p-5 border border-slate-100 relative overflow-hidden"
      style={{
        boxShadow:
          "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 rounded-xl ${iconBg}`}>{icon}</div>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{label}</span>
      </div>
      <div className={`text-2xl lg:text-[28px] font-bold tracking-tight ${valueClass || "text-slate-900"}`}>
        {value}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {delta !== null && delta !== undefined ? <DeltaPill value={Number(delta)} /> : null}
        <span className="text-[11px] text-slate-500 tabular-nums">{sub}</span>
      </div>
    </div>
  );
}

function CountUpPct({ value }: { value: number }) {
  const v = useCountUp(value, 700);
  return <>{v.toFixed(2)}</>;
}

function Mini({ label, value, valueClass = "" }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</div>
      <div className={`text-[14px] font-bold mt-0.5 tabular-nums ${valueClass || "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function DiagnosticCard({
  severity,
  Icon,
  title,
  detail,
  onClick,
}: {
  severity: "high" | "med" | "low";
  Icon: any;
  title: string;
  detail: string;
  onClick?: () => void;
}) {
  const cfg =
    severity === "high"
      ? { border: "border-rose-100", iconBg: "bg-rose-50", iconColor: "text-rose-600", tag: "Urgente", tagColor: "text-rose-700 bg-rose-50" }
      : severity === "med"
      ? { border: "border-amber-100", iconBg: "bg-amber-50", iconColor: "text-amber-600", tag: "Atención", tagColor: "text-amber-700 bg-amber-50" }
      : { border: "border-emerald-100", iconBg: "bg-emerald-50", iconColor: "text-emerald-600", tag: "Buena señal", tagColor: "text-emerald-700 bg-emerald-50" };

  const Component: any = onClick ? "button" : "div";
  return (
    <Component
      onClick={onClick}
      className={`text-left rounded-xl bg-white p-4 border ${cfg.border} group ${
        onClick ? "hover:shadow-md cursor-pointer" : ""
      }`}
      style={{ transition: `box-shadow 220ms ${ES_TRANSITION}, transform 220ms ${ES_TRANSITION}` }}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${cfg.iconBg} shrink-0`}>
          <Icon size={14} className={cfg.iconColor} strokeWidth={2.25} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${cfg.tagColor}`}>{cfg.tag}</span>
            {onClick && (
              <ChevronRight
                size={13}
                className="text-slate-300 group-hover:text-slate-500 ml-auto"
                style={{ transition: `transform 220ms ${ES_TRANSITION}` }}
              />
            )}
          </div>
          <div className="text-[13px] font-semibold text-slate-900 mt-1 tracking-tight">{title}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{detail}</div>
        </div>
      </div>
    </Component>
  );
}

function EmptyInsight() {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
      <Gauge size={18} className="mx-auto text-slate-300 mb-1.5" />
      <div className="text-[12px] text-slate-500 tracking-tight">
        Todo en orden — sin alertas para este rango.
      </div>
    </div>
  );
}

function AdsetsMini({
  adsets,
  breakevenRoas,
}: {
  adsets: any[];
  breakevenRoas: number;
}) {
  return (
    <div className="rounded-xl bg-white border border-slate-100 overflow-hidden">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 border-b border-slate-100">
            <th className="text-left py-2 px-3">Ad Set</th>
            <th className="text-left py-2 px-2">Estado</th>
            <th className="text-right py-2 px-2">Gasto</th>
            <th className="text-right py-2 px-2">CTR</th>
            <th className="text-right py-2 px-2">CPA</th>
            <th className="text-right py-2 px-2">Conv.</th>
            <th className="text-right py-2 px-2">ROAS</th>
            <th className="text-right py-2 px-3">Ads</th>
          </tr>
        </thead>
        <tbody>
          {adsets
            .slice()
            .sort((a: any, b: any) => (b.spend || 0) - (a.spend || 0))
            .map((a: any) => (
              <tr key={a.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2 px-3">
                  <div className="text-[12px] text-slate-800 truncate max-w-[260px] tracking-tight">{a.name}</div>
                  <div className="text-[10px] text-slate-400">{a.optimizationGoal || "—"}</div>
                </td>
                <td className="py-2 px-2">
                  <StatusDot status={a.status} />
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-slate-700 font-medium">
                  {formatARS(a.spend || 0)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-slate-600">
                  {(a.ctr || 0).toFixed(2)}%
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-slate-600">
                  {a.cpa > 0 ? formatARS(a.cpa) : "—"}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-slate-600">
                  {(a.conversions || 0).toLocaleString("es-AR")}
                </td>
                <td className="py-2 px-2 text-right tabular-nums font-bold">
                  <span className={roasColorClass(a.roas || 0, breakevenRoas)}>
                    {(a.roas || 0).toFixed(2)}x
                  </span>
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-slate-500">
                  {a.adsCount || 0}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyTable({ hasData }: { hasData: boolean }) {
  return (
    <div className="p-12 text-center">
      <BarChart3 size={28} className="mx-auto text-slate-300 mb-2" />
      <div className="text-sm text-slate-600 font-medium tracking-tight">
        {hasData ? "Sin resultados con los filtros actuales" : "Sin campañas Meta en el rango"}
      </div>
      <div className="text-[11px] text-slate-400 mt-1">
        {hasData ? "Probá ampliar el filtro o buscar otra campaña." : "Ampliá el rango de fechas o verificá la conexión Meta."}
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="p-5 space-y-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-10 bg-slate-50 rounded animate-pulse" />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Campaign Drawer
   ════════════════════════════════════════════════════ */

function CampaignDrawer({
  open,
  onClose,
  campaign,
  breakevenRoas,
  loadingStructure,
}: {
  open: boolean;
  onClose: () => void;
  campaign: any;
  breakevenRoas: number;
  loadingStructure: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !campaign) {
    return (
      <div
        className="fixed inset-0 z-40 pointer-events-none"
        aria-hidden
      />
    );
  }

  const badge = classifyCampaign({
    status: campaign.status,
    spend: campaign.spend,
    conversions: campaign.conversions,
    roas: campaign.roas,
    daysWithData: campaign.daysWithData,
    breakevenRoas,
  });

  const adsets: any[] = Array.isArray(campaign.adSets) ? campaign.adSets : [];

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[2px]"
        onClick={onClose}
        style={{ animation: `meta-enter 240ms ${ES_TRANSITION}` }}
      />
      {/* Drawer */}
      <aside
        className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-[580px] bg-white shadow-2xl overflow-y-auto"
        style={{
          animation: `meta-slide-in 360ms ${ES_TRANSITION}`,
          boxShadow: "0 0 0 1px rgba(15,23,42,0.06), -20px 0 60px -30px rgba(15,23,42,0.30)",
        }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-100 p-5 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <StageChip stage={campaign.funnelStage} />
                <StatusDot status={campaign.status} />
                {badge && (
                  <Badge Icon={badge.Icon} label={badge.label} soft={badge.soft} text={badge.text} />
                )}
              </div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">{campaign.name}</h3>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {campaign.objective || "Sin objetivo"}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              aria-label="Cerrar"
              style={{ transition: `background-color 180ms ${ES_TRANSITION}` }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="p-5 grid grid-cols-2 gap-3">
          <DrawerKpi
            icon={<DollarSign size={14} className="text-slate-700" />}
            iconBg="bg-slate-100"
            label="Gasto"
            value={formatARS(campaign.spend)}
          />
          <DrawerKpi
            icon={<Target size={14} className="text-emerald-700" />}
            iconBg="bg-emerald-50"
            label="ROAS"
            value={`${(campaign.roas || 0).toFixed(2)}x`}
            valueClass={roasColorClass(campaign.roas || 0, breakevenRoas)}
          />
          <DrawerKpi
            icon={<ShoppingCart size={14} className="text-violet-700" />}
            iconBg="bg-violet-50"
            label="Conversiones"
            value={(campaign.conversions || 0).toLocaleString("es-AR")}
          />
          <DrawerKpi
            icon={<MousePointer size={14} className="text-blue-700" />}
            iconBg="bg-blue-50"
            label="CTR"
            value={`${(campaign.ctr || 0).toFixed(2)}%`}
          />
          <DrawerKpi
            icon={<Activity size={14} className="text-amber-700" />}
            iconBg="bg-amber-50"
            label="CPA"
            value={campaign.costPerConversion > 0 ? formatARS(campaign.costPerConversion) : "—"}
          />
          <DrawerKpi
            icon={<Clock size={14} className="text-slate-700" />}
            iconBg="bg-slate-100"
            label="Días con data"
            value={(campaign.daysWithData || 0).toString()}
          />
        </div>

        {/* Adsets */}
        <div className="px-5 pb-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[12px] font-semibold uppercase tracking-widest text-slate-500">
              Ad sets ({adsets.length})
            </h4>
          </div>
          {loadingStructure && adsets.length === 0 ? (
            <div className="text-[12px] text-slate-500">Cargando ad sets…</div>
          ) : adsets.length === 0 ? (
            <div className="text-[12px] text-slate-500 rounded-xl border border-dashed border-slate-200 p-6 text-center">
              Sin ad sets en este período.
            </div>
          ) : (
            <div className="space-y-2">
              {adsets
                .slice()
                .sort((a: any, b: any) => (b.spend || 0) - (a.spend || 0))
                .map((a: any) => (
                  <div
                    key={a.id}
                    className="rounded-xl border border-slate-100 p-3 bg-slate-50/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-slate-900 truncate tracking-tight">
                          {a.name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {a.optimizationGoal || "—"} · {a.adsCount || 0} ads
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-[14px] font-bold tabular-nums ${roasColorClass(a.roas || 0, breakevenRoas)}`}>
                          {(a.roas || 0).toFixed(2)}x
                        </div>
                        <div className="text-[10px] text-slate-500 tabular-nums">{formatARS(a.spend || 0)}</div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Link to Creativos Lab */}
          <a
            href={`/campaigns/creatives?platform=META&campaign=${encodeURIComponent(campaign.id)}`}
            className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 hover:text-blue-700"
            style={{ transition: `color 180ms ${ES_TRANSITION}` }}
          >
            Ver creativos en Creativos Lab
            <ExternalLink size={12} />
          </a>
        </div>
      </aside>
    </>
  );
}

function DrawerKpi({
  icon,
  iconBg,
  label,
  value,
  valueClass = "",
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50/60 p-3 border border-slate-100">
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className={`p-1.5 rounded-lg ${iconBg}`}>{icon}</div>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</span>
      </div>
      <div className={`text-[15px] font-bold tabular-nums tracking-tight ${valueClass || "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}
