// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════════════
// /campaigns/google — Rebuild sesión 21
// ──────────────────────────────────────────────────────────────────────
// Bloques (mismo criterio que /campaigns/meta, adaptado a Google):
//   1. Command Bar (header + hero KPIs + breakeven chip)
//   2. PMax Spotlight (card dedicada si hay PMax)
//   3. Mapa por Tipo (Search / Shopping / PMax / Display / Video)
//   4. Diagnósticos automáticos (incl. alertas específicas Google:
//      Quality Score bajo, Impression Share bajo)
//   5. Tabla jerárquica de campañas (expand → ad groups)
//   6. Campaign Drawer (KPIs + ad groups + QS/IS + link a Creativos Lab)
//
// Premium: light mode, aurora, multi-shadow, count-up,
// cubic-bezier (0.16, 1, 0.3, 1), tabular-nums, tracking-tight,
// rounded-2xl, prefers-reduced-motion respetado.
// ══════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import { DateRangeFilter } from "@/components/dashboard";
import { useSyncStatus } from "@/lib/hooks/useSyncStatus";
import { useBreakeven } from "@/lib/hooks/useBreakeven";
import { BreakevenChip, roasColorClass } from "@/components/campaigns/BreakevenChip";
import {
  DollarSign, Target, MousePointer, ShoppingCart, Activity,
  ChevronRight, ChevronDown, RefreshCw, AlertTriangle,
  TrendingDown, ArrowUpRight, ArrowDownRight,
  Sparkles, Flame, Trophy, Hourglass, Gauge, ExternalLink,
  Search as SearchIcon, X, Clock, BarChart3,
  ShoppingBag, Layers, Monitor, Youtube, Zap,
  Award, PieChart as PieIcon,
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

type GoogleType = "SEARCH" | "SHOPPING" | "PMAX" | "DISPLAY" | "VIDEO" | "OTHER";

interface TypeConfig {
  key: GoogleType;
  label: string;
  sublabel: string;
  hex: string;
  glow: string;
  ring: string;
  text: string;
  soft: string;
  Icon: any;
}

const TYPE_CONFIG: TypeConfig[] = [
  {
    key: "SEARCH",
    label: "Search",
    sublabel: "Intención directa",
    hex: "#3b82f6",
    glow: "from-blue-500/15 to-blue-500/0",
    ring: "ring-blue-200",
    text: "text-blue-700",
    soft: "bg-blue-50",
    Icon: SearchIcon,
  },
  {
    key: "SHOPPING",
    label: "Shopping",
    sublabel: "Catálogo de productos",
    hex: "#10b981",
    glow: "from-emerald-500/15 to-emerald-500/0",
    ring: "ring-emerald-200",
    text: "text-emerald-700",
    soft: "bg-emerald-50",
    Icon: ShoppingBag,
  },
  {
    key: "PMAX",
    label: "Performance Max",
    sublabel: "AI multi-canal",
    hex: "#f59e0b",
    glow: "from-amber-500/15 to-amber-500/0",
    ring: "ring-amber-200",
    text: "text-amber-700",
    soft: "bg-amber-50",
    Icon: Zap,
  },
  {
    key: "DISPLAY",
    label: "Display",
    sublabel: "Red de contenido",
    hex: "#8b5cf6",
    glow: "from-violet-500/15 to-violet-500/0",
    ring: "ring-violet-200",
    text: "text-violet-700",
    soft: "bg-violet-50",
    Icon: Monitor,
  },
  {
    key: "VIDEO",
    label: "Video",
    sublabel: "YouTube",
    hex: "#ef4444",
    glow: "from-rose-500/15 to-rose-500/0",
    ring: "ring-rose-200",
    text: "text-rose-700",
    soft: "bg-rose-50",
    Icon: Youtube,
  },
];

const TYPE_MAP: Record<GoogleType, TypeConfig> = TYPE_CONFIG.reduce((m, c) => {
  m[c.key] = c;
  return m;
}, {} as any);

function toDateInputValue(d: Date) {
  return d.toISOString().split("T")[0];
}

const ES_TRANSITION = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Detecta el tipo Google a partir del campo objective (que almacena advertising_channel_type). */
function detectGoogleType(objective: string | null | undefined, name: string | undefined): GoogleType {
  const obj = (objective || "").toUpperCase();
  const nm = (name || "").toUpperCase();
  const combined = `${obj} ${nm}`;

  if (/PERFORMANCE[ _.-]?MAX|PMAX/.test(combined)) return "PMAX";
  if (/SHOPPING|CATALOG|PRODUCT/.test(combined)) return "SHOPPING";
  if (/VIDEO|YOUTUBE/.test(combined)) return "VIDEO";
  if (/DISPLAY|BANNER|GDN/.test(combined)) return "DISPLAY";
  if (/SEARCH/.test(combined) || !obj) return "SEARCH";
  return "OTHER";
}

/* ════════════════════════════════════════════════════
   Hooks
   ════════════════════════════════════════════════════ */

function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  useEffect(() => {
    let start: number | null = null;
    fromRef.current = value;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
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
  const v = useCountUp(value);
  return <span className="tabular-nums">{formatARS(v)}</span>;
}
function CountX({ value }: { value: number }) {
  const v = useCountUp(value);
  return <span className="tabular-nums">{v.toFixed(2)}x</span>;
}
function CountNum({ value }: { value: number }) {
  const v = useCountUp(value);
  return <span className="tabular-nums">{Math.round(v).toLocaleString("es-AR")}</span>;
}
function CountPct({ value }: { value: number }) {
  const v = useCountUp(value);
  return <>{v.toFixed(2)}</>;
}

function DeltaPill({ value }: { value: number }) {
  if (!isFinite(value) || value === 0) {
    return <span className="text-[11px] text-slate-400 tabular-nums">—</span>;
  }
  const good = value > 0;
  const Icon = good ? ArrowUpRight : ArrowDownRight;
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
    s === "ACTIVE" || s === "ENABLED"
      ? { bg: "bg-emerald-500", label: "Activa", ring: "ring-emerald-200" }
      : s === "PAUSED"
      ? { bg: "bg-amber-400", label: "Pausada", ring: "ring-amber-200" }
      : s === "REMOVED" || s === "ARCHIVED"
      ? { bg: "bg-slate-400", label: "Eliminada", ring: "ring-slate-200" }
      : { bg: "bg-slate-300", label: s || "—", ring: "ring-slate-200" };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.bg} ring-2 ${cfg.ring}`} />
      {cfg.label}
    </span>
  );
}

function TypeChip({ type }: { type: GoogleType }) {
  const cfg = TYPE_MAP[type];
  if (!cfg) {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
        —
      </span>
    );
  }
  const I = cfg.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${cfg.soft} ${cfg.text}`}
    >
      <I size={10} strokeWidth={2.5} />
      {cfg.key === "PMAX" ? "PMAX" : cfg.label}
    </span>
  );
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

function classifyCampaign(c: {
  status: string;
  spend: number;
  conversions: number;
  roas: number;
  daysWithData: number;
  breakevenRoas: number;
}): { label: string; kind: string; Icon: any; soft: string; text: string } | null {
  const s = (c.status || "").toUpperCase();
  const active = s === "ACTIVE" || s === "ENABLED";
  if (!active) return null;

  if (c.breakevenRoas > 0 && c.roas >= c.breakevenRoas * 1.5 && c.spend > 5000) {
    return { label: "Ganador", kind: "win", Icon: Trophy, soft: "bg-emerald-50", text: "text-emerald-700" };
  }
  if (c.spend > 10000 && c.conversions === 0 && c.daysWithData >= 5) {
    return { label: "Quemado", kind: "burn", Icon: Flame, soft: "bg-rose-50", text: "text-rose-700" };
  }
  if (c.daysWithData > 0 && c.daysWithData <= 3 && c.conversions < 5) {
    return { label: "En aprendizaje", kind: "learn", Icon: Hourglass, soft: "bg-blue-50", text: "text-blue-700" };
  }
  if (c.breakevenRoas > 0 && c.roas < c.breakevenRoas && c.spend > 5000) {
    return { label: "Por debajo BE", kind: "bleed", Icon: AlertTriangle, soft: "bg-amber-50", text: "text-amber-700" };
  }
  return null;
}

function QualityScoreBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(10, score));
  const color =
    clamped >= 8 ? "#10b981" : clamped >= 5 ? "#f59e0b" : clamped > 0 ? "#ef4444" : "#94a3b8";
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Quality Score
        </span>
        <span className="text-[13px] font-bold tabular-nums" style={{ color }}>
          {clamped > 0 ? clamped.toFixed(1) : "—"}
          <span className="text-[10px] text-slate-400 font-medium ml-0.5">/10</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${(clamped / 10) * 100}%`,
            backgroundColor: color,
            transition: `width 600ms ${ES_TRANSITION}`,
          }}
        />
      </div>
    </div>
  );
}

function ImpressionShareBar({ share }: { share: number }) {
  // share viene en 0-1 (ratio) o 0-100 (%). Aceptamos ambos.
  const pct = share > 1 ? share : share * 100;
  const clamped = Math.max(0, Math.min(100, pct));
  const color = clamped >= 60 ? "#10b981" : clamped >= 30 ? "#f59e0b" : clamped > 0 ? "#ef4444" : "#94a3b8";
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Impression Share
        </span>
        <span className="text-[13px] font-bold tabular-nums" style={{ color }}>
          {clamped > 0 ? clamped.toFixed(0) : "—"}
          <span className="text-[10px] text-slate-400 font-medium">%</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${clamped}%`,
            backgroundColor: color,
            transition: `width 600ms ${ES_TRANSITION}`,
          }}
        />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   Main Page
   ════════════════════════════════════════════════════ */

export default function GoogleCampaignsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <GoogleCampaignsInner />
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

function GoogleCampaignsInner() {
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
  const [typeFilter, setTypeFilter] = useState<"ALL" | GoogleType>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  /* ── Hooks: sync + breakeven ──────────────────── */
  const { lastSyncAt, isSyncing, triggerSync, onSyncComplete } = useSyncStatus("GOOGLE_ADS");
  const breakeven = useBreakeven(dateFrom, dateTo);

  /* ── Fetching ─────────────────────────────────── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/metrics/campaigns?platform=GOOGLE&from=${dateFrom}&to=${dateTo}`,
        { cache: "no-store" }
      );
      const d = await r.json();
      setData(d && typeof d === "object" ? d : null);
    } catch (e) {
      console.error("[/campaigns/google] fetchData error", e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  const fetchStructure = useCallback(async () => {
    setStructureLoading(true);
    try {
      const r = await fetch(
        `/api/metrics/ads/structure?platform=GOOGLE&from=${dateFrom}&to=${dateTo}`,
        { cache: "no-store" }
      );
      const d = await r.json();
      setStructure(d && typeof d === "object" ? d : null);
    } catch (e) {
      console.error("[/campaigns/google] fetchStructure error", e);
      setStructure(null);
    } finally {
      setStructureLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
    fetchStructure();
  }, [fetchData, fetchStructure]);

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
  const campaignsRaw = Array.isArray(data?.campaigns) ? data.campaigns : [];
  const totals = data?.totals || {};
  const changes = data?.changes || {};
  const dailyTrend = Array.isArray(data?.dailyTrend) ? data.dailyTrend : [];

  // Enrich with detected type
  const campaigns = useMemo(
    () =>
      campaignsRaw
        .filter((c: any) => c.platform === "GOOGLE")
        .map((c: any) => ({ ...c, gType: detectGoogleType(c.objective, c.name) })),
    [campaignsRaw]
  );

  const googleTotals = useMemo(() => {
    return campaigns.reduce(
      (acc: any, c: any) => ({
        spend: acc.spend + (c.spend || 0),
        impressions: acc.impressions + (c.impressions || 0),
        clicks: acc.clicks + (c.clicks || 0),
        conversions: acc.conversions + (c.conversions || 0),
        conversionValue: acc.conversionValue + (c.conversionValue || 0),
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 }
    );
  }, [campaigns]);

  const googleRoas = googleTotals.spend > 0 ? googleTotals.conversionValue / googleTotals.spend : 0;
  const googleCtr =
    googleTotals.impressions > 0 ? (googleTotals.clicks / googleTotals.impressions) * 100 : 0;
  const googleCpa = googleTotals.conversions > 0 ? googleTotals.spend / googleTotals.conversions : 0;

  // Aggregates by type
  const typeAgg = useMemo(() => {
    const agg: Record<string, { spend: number; conversions: number; conversionValue: number; impressions: number; clicks: number; count: number }> = {};
    TYPE_CONFIG.forEach((t) => {
      agg[t.key] = { spend: 0, conversions: 0, conversionValue: 0, impressions: 0, clicks: 0, count: 0 };
    });
    agg.OTHER = { spend: 0, conversions: 0, conversionValue: 0, impressions: 0, clicks: 0, count: 0 };
    campaigns.forEach((c: any) => {
      const k = c.gType || "OTHER";
      if (!agg[k]) agg[k] = { spend: 0, conversions: 0, conversionValue: 0, impressions: 0, clicks: 0, count: 0 };
      agg[k].spend += c.spend || 0;
      agg[k].conversions += c.conversions || 0;
      agg[k].conversionValue += c.conversionValue || 0;
      agg[k].impressions += c.impressions || 0;
      agg[k].clicks += c.clicks || 0;
      agg[k].count += 1;
    });
    return agg;
  }, [campaigns]);

  // Visible types (con al menos 1 campaña)
  const visibleTypes = useMemo(
    () => TYPE_CONFIG.filter((t) => (typeAgg[t.key]?.count || 0) > 0),
    [typeAgg]
  );

  // PMax detection
  const pmaxAgg = typeAgg.PMAX || { spend: 0, conversions: 0, conversionValue: 0, impressions: 0, clicks: 0, count: 0 };
  const hasPMax = pmaxAgg.count > 0;
  const pmaxRoas = pmaxAgg.spend > 0 ? pmaxAgg.conversionValue / pmaxAgg.spend : 0;

  // Filter + search for table
  const displayCampaigns = useMemo(() => {
    let list = campaigns;
    if (typeFilter !== "ALL") list = list.filter((c: any) => c.gType === typeFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((c: any) => (c.name || "").toLowerCase().includes(q));
    }
    return list;
  }, [campaigns, typeFilter, query]);

  // Adsets (ad groups) by campaign
  const adsetsByCampaign = useMemo(() => {
    const m: Record<string, any[]> = {};
    (structure?.campaigns || []).forEach((c: any) => {
      m[c.id] = c.adSets || [];
    });
    return m;
  }, [structure]);

  // Diagnostics
  const diagnostics = useMemo(() => {
    const out: Array<{
      severity: "high" | "med" | "low";
      Icon: any;
      title: string;
      detail: string;
      campaignId?: string;
    }> = [];

    const active = campaigns.filter(
      (c: any) =>
        (c.status || "").toUpperCase() === "ACTIVE" ||
        (c.status || "").toUpperCase() === "ENABLED"
    );

    // No activas
    if (campaigns.length > 0 && active.length === 0) {
      out.push({
        severity: "high",
        Icon: AlertTriangle,
        title: "Sin campañas activas",
        detail: `Las ${campaigns.length} campañas Google están pausadas o eliminadas.`,
      });
    }

    // Quemadas
    const burned = campaigns.filter(
      (c: any) =>
        ((c.status || "").toUpperCase() === "ACTIVE" || (c.status || "").toUpperCase() === "ENABLED") &&
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

    // QS bajo
    const lowQS = campaigns.filter(
      (c: any) =>
        c.gType === "SEARCH" &&
        c.qualityScore != null &&
        c.qualityScore > 0 &&
        c.qualityScore < 5 &&
        c.spend > 3000
    );
    if (lowQS.length > 0) {
      const topLowQS = [...lowQS].sort((a: any, b: any) => b.spend - a.spend)[0];
      out.push({
        severity: "med",
        Icon: Award,
        title: `${lowQS.length} Search con Quality Score bajo`,
        detail: `Top: ${topLowQS.name} (QS ${topLowQS.qualityScore.toFixed(1)}/10, ${formatARS(topLowQS.spend)}).`,
        campaignId: topLowQS.id,
      });
    }

    // IS bajo con gasto alto
    const lowIS = campaigns.filter((c: any) => {
      if (c.impressionShare == null) return false;
      const pct = c.impressionShare > 1 ? c.impressionShare : c.impressionShare * 100;
      return pct > 0 && pct < 30 && c.spend > 5000 && (c.gType === "SEARCH" || c.gType === "SHOPPING");
    });
    if (lowIS.length > 0) {
      out.push({
        severity: "med",
        Icon: TrendingDown,
        title: `${lowIS.length} campaña${lowIS.length > 1 ? "s" : ""} con Impression Share bajo`,
        detail: "Estás perdiendo impresiones — podés crecer subiendo budget o bids.",
      });
    }

    // Bajo BE
    if (breakeven.breakevenRoas > 0) {
      const bleeding = campaigns.filter(
        (c: any) =>
          ((c.status || "").toUpperCase() === "ACTIVE" || (c.status || "").toUpperCase() === "ENABLED") &&
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

    // Ganadoras
    if (breakeven.breakevenRoas > 0) {
      const winners = campaigns.filter(
        (c: any) =>
          ((c.status || "").toUpperCase() === "ACTIVE" || (c.status || "").toUpperCase() === "ENABLED") &&
          c.spend > 5000 &&
          c.roas >= breakeven.breakevenRoas * 1.5
      );
      if (winners.length > 0) {
        const top = [...winners].sort((a: any, b: any) => b.roas - a.roas)[0];
        out.push({
          severity: "low",
          Icon: Trophy,
          title: `${winners.length} campaña${winners.length > 1 ? "s" : ""} ganadora${winners.length > 1 ? "s" : ""}`,
          detail: `Top: ${top.name} con ${top.roas.toFixed(2)}x ROAS.`,
          campaignId: top.id,
        });
      }
    }

    if (campaigns.length === 0 && !loading) {
      out.push({
        severity: "med",
        Icon: AlertTriangle,
        title: "Sin datos de Google Ads",
        detail: "No hay campañas en este rango. Verificá la conexión o ampliá el período.",
      });
    }

    return out;
  }, [campaigns, breakeven.breakevenRoas, loading]);

  // Daily Google spend last 14d
  const spendByDay = useMemo(() => {
    return dailyTrend
      .slice(-14)
      .map((d: any) => ({ date: d.date, spend: d.GOOGLE || 0 }));
  }, [dailyTrend]);

  // Drawer campaign
  const drawerCampaign = useMemo(() => {
    if (!drawerId) return null;
    const c = campaigns.find((x: any) => x.id === drawerId);
    const s = structure?.campaigns?.find((x: any) => x.id === drawerId);
    return c ? { ...c, adSets: s?.adSets || [] } : null;
  }, [drawerId, campaigns, structure]);

  const hasData = campaigns.length > 0;

  /* ════════════════════════════════════════════════════
     Render
     ════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-slate-50 relative overflow-x-hidden">
      {/* Aurora */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1100px 600px at 15% -10%, rgba(59,130,246,0.10), transparent 60%), radial-gradient(900px 500px at 95% 10%, rgba(245,158,11,0.10), transparent 60%), radial-gradient(800px 400px at 50% 100%, rgba(16,185,129,0.06), transparent 65%)",
        }}
      />

      <div className="max-w-[1400px] mx-auto p-5 lg:p-8 space-y-6">
        {/* Header */}
        <div
          className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
          style={{ animation: `gg-enter 500ms ${ES_TRANSITION}` }}
        >
          <div>
            <div className="text-xs text-slate-500 tracking-tight flex items-center gap-1.5">
              <span>Campañas</span>
              <ChevronRight size={12} className="text-slate-300" />
              <span className="text-slate-700 font-medium">Google Ads</span>
            </div>
            <h1 className="mt-1 text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              Google Ads
              <span className="text-[11px] font-medium uppercase tracking-widest text-slate-400">
                Search · Shopping · PMax · Display · Video
              </span>
            </h1>
            <p className="mt-1 text-sm text-slate-500 tracking-tight">
              Visión unificada de performance, tipo de campaña y diagnóstico para Google.
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

        {/* Breakeven chip */}
        {!breakeven.loading && (
          <div style={{ animation: `gg-enter 500ms ${ES_TRANSITION} 80ms both` }}>
            <BreakevenChip
              currentRoas={googleRoas}
              breakevenRoas={breakeven.breakevenRoas}
              contributionMargin={breakeven.contributionMargin}
            />
          </div>
        )}

        {/* ══════════════════════════════════════════════
            BLOCK 1 — Hero KPIs
           ══════════════════════════════════════════════ */}
        <section
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          style={{ animation: `gg-enter 500ms ${ES_TRANSITION} 120ms both` }}
        >
          <HeroKpi
            icon={<DollarSign size={16} className="text-slate-700" />}
            iconBg="bg-slate-100"
            label="Gasto"
            value={<CountARS value={googleTotals.spend} />}
            delta={changes?.spend}
            sub="Total en rango"
          />
          <HeroKpi
            icon={<Target size={16} className="text-emerald-700" />}
            iconBg="bg-emerald-50"
            label="ROAS"
            value={<CountX value={googleRoas} />}
            delta={changes?.roas}
            sub={
              breakeven.breakevenRoas > 0
                ? `Break-even ${breakeven.breakevenRoas.toFixed(2)}x`
                : "Sin break-even"
            }
            valueClass={roasColorClass(googleRoas, breakeven.breakevenRoas)}
          />
          <HeroKpi
            icon={<MousePointer size={16} className="text-blue-700" />}
            iconBg="bg-blue-50"
            label="CTR"
            value={
              <span className="tabular-nums">
                <CountPct value={googleCtr} />%
              </span>
            }
            delta={null}
            sub={`${formatCompact(googleTotals.clicks)} clicks / ${formatCompact(googleTotals.impressions)} imp`}
          />
          <HeroKpi
            icon={<ShoppingCart size={16} className="text-violet-700" />}
            iconBg="bg-violet-50"
            label="Conversiones"
            value={<CountNum value={googleTotals.conversions} />}
            delta={changes?.conversions}
            sub={googleCpa > 0 ? `CPA ${formatARS(googleCpa)}` : "—"}
          />
        </section>

        {/* ══════════════════════════════════════════════
            BLOCK 2 — PMax Spotlight
           ══════════════════════════════════════════════ */}
        {hasPMax && (
          <section
            className="rounded-2xl overflow-hidden relative border border-amber-100"
            style={{
              boxShadow:
                "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
              animation: `gg-enter 500ms ${ES_TRANSITION} 160ms both`,
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0) 45%, rgba(16,185,129,0.10) 100%)",
              }}
            />
            <div className="relative bg-white/80 backdrop-blur p-5 lg:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-50 ring-1 ring-amber-200">
                    <Zap size={17} className="text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                      Performance Max
                      <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md">
                        AI
                      </span>
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {pmaxAgg.count} campaña{pmaxAgg.count > 1 ? "s" : ""} · multi-canal (Search, YouTube, Display, Gmail, Maps)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setTypeFilter("PMAX")}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-white px-2.5 py-1 rounded-lg ring-1 ring-amber-200 hover:ring-amber-300"
                  style={{ transition: `box-shadow 180ms ${ES_TRANSITION}` }}
                >
                  Ver sólo PMax
                  <ChevronRight size={12} />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <PMaxStat label="Gasto" value={formatARS(pmaxAgg.spend)} />
                <PMaxStat
                  label="ROAS"
                  value={`${pmaxRoas.toFixed(2)}x`}
                  valueClass={roasColorClass(pmaxRoas, breakeven.breakevenRoas)}
                />
                <PMaxStat
                  label="Conversiones"
                  value={Math.round(pmaxAgg.conversions).toLocaleString("es-AR")}
                />
                <PMaxStat
                  label="% del gasto Google"
                  value={
                    googleTotals.spend > 0
                      ? `${((pmaxAgg.spend / googleTotals.spend) * 100).toFixed(0)}%`
                      : "—"
                  }
                />
              </div>

              <div className="mt-4 text-[11px] text-slate-500 italic flex items-start gap-1.5">
                <Sparkles size={11} className="mt-0.5 shrink-0 text-amber-500" />
                <span>
                  PMax es asset-based: los creativos individuales se agrupan en asset groups y no se sincronizan por ahora.
                  El análisis profundo de assets requiere exportar desde Google Ads directamente.
                </span>
              </div>
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════════
            BLOCK 3 — Type Map
           ══════════════════════════════════════════════ */}
        <section
          className="rounded-2xl bg-white/90 backdrop-blur p-5 lg:p-6 border border-slate-100"
          style={{
            boxShadow:
              "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
            animation: `gg-enter 500ms ${ES_TRANSITION} 220ms both`,
          }}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                <PieIcon size={15} className="text-slate-500" />
                Mapa por tipo de campaña
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Distribución de gasto y retorno por formato de Google Ads
              </p>
            </div>
            <span className="text-[11px] text-slate-400 tabular-nums">
              Total: {formatARS(googleTotals.spend)}
            </span>
          </div>

          {visibleTypes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
              <Gauge size={18} className="mx-auto text-slate-300 mb-1.5" />
              <div className="text-[12px] text-slate-500 tracking-tight">
                Sin campañas en el rango seleccionado.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 lg:gap-4">
              {visibleTypes.map((t) => {
                const v = typeAgg[t.key] || {
                  spend: 0,
                  conversions: 0,
                  conversionValue: 0,
                  impressions: 0,
                  clicks: 0,
                  count: 0,
                };
                const pct = googleTotals.spend > 0 ? (v.spend / googleTotals.spend) * 100 : 0;
                const roas = v.spend > 0 ? v.conversionValue / v.spend : 0;
                const I = t.Icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTypeFilter(typeFilter === t.key ? "ALL" : t.key)}
                    className={`text-left rounded-2xl p-4 lg:p-5 bg-white ring-1 relative overflow-hidden ${
                      typeFilter === t.key ? "ring-slate-300" : "ring-slate-100 hover:ring-slate-200"
                    }`}
                    style={{
                      boxShadow:
                        "0 1px 0 rgba(15,23,42,0.04), 0 4px 12px -6px rgba(15,23,42,0.08)",
                      transition: `box-shadow 220ms ${ES_TRANSITION}, transform 220ms ${ES_TRANSITION}`,
                    }}
                  >
                    <div
                      aria-hidden
                      className={`absolute inset-0 bg-gradient-to-br ${t.glow} pointer-events-none`}
                    />
                    <div className="relative">
                      <div className="flex items-center justify-between">
                        <div className={`p-1.5 rounded-lg ${t.soft}`}>
                          <I size={14} className={t.text} strokeWidth={2.25} />
                        </div>
                        <span className={`text-[10px] font-semibold ${t.text} ${t.soft} px-2 py-0.5 rounded-md`}>
                          {v.count} camp
                        </span>
                      </div>

                      <div className="mt-3">
                        <div className={`text-[10px] font-bold uppercase tracking-widest ${t.text}`}>
                          {t.key === "PMAX" ? "PMAX" : t.label}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{t.sublabel}</div>
                      </div>

                      <div className="mt-3">
                        <div className="text-xl font-bold text-slate-900 tabular-nums tracking-tight">
                          {formatARS(v.spend)}
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {pct.toFixed(1)}% del gasto
                        </div>
                      </div>

                      <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            backgroundColor: t.hex,
                            transition: `width 600ms ${ES_TRANSITION}`,
                          }}
                        />
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">ROAS</div>
                          <div
                            className={`text-[14px] font-bold tabular-nums ${roasColorClass(
                              roas,
                              breakeven.breakevenRoas
                            )}`}
                          >
                            {roas.toFixed(2)}x
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Conv.</div>
                          <div className="text-[14px] font-bold tabular-nums text-slate-900">
                            {Math.round(v.conversions).toLocaleString("es-AR")}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════════
            BLOCK 4 — Diagnostics
           ══════════════════════════════════════════════ */}
        <section
          className="rounded-2xl bg-white/90 backdrop-blur p-5 lg:p-6 border border-slate-100"
          style={{
            boxShadow:
              "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
            animation: `gg-enter 500ms ${ES_TRANSITION} 280ms both`,
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                <Sparkles size={15} className="text-slate-500" />
                Diagnósticos automáticos
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Insights específicos de tus campañas Google
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
            BLOCK 5 — Campaign Table
           ══════════════════════════════════════════════ */}
        <section
          className="rounded-2xl bg-white border border-slate-100 overflow-hidden"
          style={{
            boxShadow:
              "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
            animation: `gg-enter 500ms ${ES_TRANSITION} 340ms both`,
          }}
        >
          <div className="p-4 lg:p-5 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                <BarChart3 size={15} className="text-slate-500" />
                Campañas
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {displayCampaigns.length} de {campaigns.length} — clic para ver detalle
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar campaña…"
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-52 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 tracking-tight"
                  style={{
                    transition: `border-color 180ms ${ES_TRANSITION}, box-shadow 180ms ${ES_TRANSITION}`,
                  }}
                />
              </div>

              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 flex-wrap">
                {(["ALL", "SEARCH", "SHOPPING", "PMAX", "DISPLAY", "VIDEO"] as const).map((s) => {
                  const available =
                    s === "ALL" ||
                    (typeAgg[s as GoogleType] && typeAgg[s as GoogleType].count > 0);
                  if (!available) return null;
                  return (
                    <button
                      key={s}
                      onClick={() => setTypeFilter(s as any)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md tracking-tight ${
                        typeFilter === s
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                      style={{
                        transition: `background-color 180ms ${ES_TRANSITION}, color 180ms ${ES_TRANSITION}`,
                      }}
                    >
                      {s === "ALL"
                        ? "Todas"
                        : s === "PMAX"
                        ? "PMax"
                        : TYPE_MAP[s as GoogleType]?.label || s}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

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
                    <th className="text-left py-3 px-2">Tipo</th>
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
                  {displayCampaigns.map((c: any) => {
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
                    const isPMax = c.gType === "PMAX";
                    return (
                      <React.Fragment key={c.id}>
                        <tr
                          className="border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer group"
                          style={{ transition: `background-color 180ms ${ES_TRANSITION}` }}
                          onClick={() => setDrawerId(c.id)}
                        >
                          <td className="py-3 px-4 lg:px-6">
                            <div className="flex items-center gap-2">
                              {isPMax ? (
                                <span className="p-0.5 w-5 h-5 flex items-center justify-center text-slate-300">
                                  <Zap size={12} />
                                </span>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedId(expanded ? null : c.id);
                                  }}
                                  className="p-0.5 rounded hover:bg-slate-100 text-slate-400"
                                  aria-label={expanded ? "Colapsar" : "Expandir"}
                                >
                                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              )}
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
                            <TypeChip type={c.gType} />
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

                        {expanded && !isPMax && (
                          <tr className="bg-slate-50/70 border-b border-slate-100">
                            <td colSpan={10} className="p-4 lg:p-5">
                              {structureLoading && adsets.length === 0 ? (
                                <div className="text-[11px] text-slate-500">Cargando ad groups…</div>
                              ) : adsets.length === 0 ? (
                                <div className="text-[11px] text-slate-500">Sin ad groups en este período.</div>
                              ) : (
                                <AdGroupsMini adsets={adsets} breakevenRoas={breakeven.breakevenRoas} />
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

        {/* Footer chart */}
        {spendByDay.length > 0 && (
          <section
            className="rounded-2xl bg-white border border-slate-100 p-5 lg:p-6"
            style={{
              boxShadow:
                "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.10), 0 22px 40px -28px rgba(15,23,42,0.08)",
              animation: `gg-enter 500ms ${ES_TRANSITION} 400ms both`,
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
                  Gasto diario Google · 14 días
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Tendencia de inversión en la plataforma
                </p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={spendByDay}>
                <defs>
                  <linearGradient id="ggSpendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
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
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#ggSpendGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </section>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          BLOCK 6 — Campaign Drawer
         ══════════════════════════════════════════════ */}
      <GoogleCampaignDrawer
        open={!!drawerId}
        onClose={() => setDrawerId(null)}
        campaign={drawerCampaign}
        breakevenRoas={breakeven.breakevenRoas}
        loadingStructure={structureLoading}
      />

      <style jsx global>{`
        @keyframes gg-enter {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes gg-slide-in {
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

function PMaxStat({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl bg-white/70 p-3 border border-amber-100/80">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`text-[17px] font-bold tabular-nums tracking-tight mt-0.5 ${valueClass || "text-slate-900"}`}>
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
      style={{ transition: `box-shadow 220ms ${ES_TRANSITION}` }}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${cfg.iconBg} shrink-0`}>
          <Icon size={14} className={cfg.iconColor} strokeWidth={2.25} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${cfg.tagColor}`}>{cfg.tag}</span>
            {onClick && (
              <ChevronRight size={13} className="text-slate-300 group-hover:text-slate-500 ml-auto" />
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

function AdGroupsMini({
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
            <th className="text-left py-2 px-3">Ad Group</th>
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
        {hasData ? "Sin resultados con los filtros actuales" : "Sin campañas Google en el rango"}
      </div>
      <div className="text-[11px] text-slate-400 mt-1">
        {hasData ? "Probá ampliar el filtro o buscar otra campaña." : "Ampliá el rango de fechas o verificá la conexión Google Ads."}
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
   Google Campaign Drawer
   ════════════════════════════════════════════════════ */

function GoogleCampaignDrawer({
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
    return <div className="fixed inset-0 z-40 pointer-events-none" aria-hidden />;
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
  const type = campaign.gType || detectGoogleType(campaign.objective, campaign.name);
  const isPMax = type === "PMAX";
  const showQSIS = type === "SEARCH" || type === "SHOPPING";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[2px]"
        onClick={onClose}
        style={{ animation: `gg-enter 240ms ${ES_TRANSITION}` }}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-[580px] bg-white shadow-2xl overflow-y-auto"
        style={{
          animation: `gg-slide-in 360ms ${ES_TRANSITION}`,
          boxShadow: "0 0 0 1px rgba(15,23,42,0.06), -20px 0 60px -30px rgba(15,23,42,0.30)",
        }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-100 p-5 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <TypeChip type={type} />
                <StatusDot status={campaign.status} />
                {badge && <Badge Icon={badge.Icon} label={badge.label} soft={badge.soft} text={badge.text} />}
              </div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">{campaign.name}</h3>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {campaign.objective || "Sin tipo"}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              aria-label="Cerrar"
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

        {/* Google-specific signals (solo Search/Shopping) */}
        {showQSIS && (campaign.qualityScore != null || campaign.impressionShare != null) && (
          <div className="px-5 pb-2">
            <h4 className="text-[12px] font-semibold uppercase tracking-widest text-slate-500 mb-3">
              Señales Google
            </h4>
            <div className="rounded-xl bg-slate-50/60 p-4 border border-slate-100 space-y-4">
              {campaign.qualityScore != null && (
                <QualityScoreBar score={Number(campaign.qualityScore)} />
              )}
              {campaign.impressionShare != null && (
                <ImpressionShareBar share={Number(campaign.impressionShare)} />
              )}
            </div>
          </div>
        )}

        {/* PMax note */}
        {isPMax && (
          <div className="px-5 pb-2">
            <div className="rounded-xl bg-amber-50/60 p-4 border border-amber-100">
              <div className="flex items-start gap-2 text-[12px] text-slate-700">
                <Zap size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-900 tracking-tight">
                    Campaña Performance Max
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                    PMax es asset-based: los creativos se agrupan en asset groups gestionados por la AI de Google.
                    El breakdown por asset group no está sincronizado — para ver los assets visitá Google Ads directamente.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Ad groups (oculto para PMax) */}
        {!isPMax && (
          <div className="px-5 pt-3 pb-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[12px] font-semibold uppercase tracking-widest text-slate-500">
                Ad groups ({adsets.length})
              </h4>
            </div>
            {loadingStructure && adsets.length === 0 ? (
              <div className="text-[12px] text-slate-500">Cargando ad groups…</div>
            ) : adsets.length === 0 ? (
              <div className="text-[12px] text-slate-500 rounded-xl border border-dashed border-slate-200 p-6 text-center">
                Sin ad groups en este período.
              </div>
            ) : (
              <div className="space-y-2">
                {adsets
                  .slice()
                  .sort((a: any, b: any) => (b.spend || 0) - (a.spend || 0))
                  .map((a: any) => (
                    <div key={a.id} className="rounded-xl border border-slate-100 p-3 bg-slate-50/40">
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
                          <div
                            className={`text-[14px] font-bold tabular-nums ${roasColorClass(
                              a.roas || 0,
                              breakevenRoas
                            )}`}
                          >
                            {(a.roas || 0).toFixed(2)}x
                          </div>
                          <div className="text-[10px] text-slate-500 tabular-nums">
                            {formatARS(a.spend || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Link a Creativos Lab */}
        <div className="px-5 pb-6">
          <a
            href={`/campaigns/creatives?platform=GOOGLE&campaign=${encodeURIComponent(campaign.id)}`}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 hover:text-blue-700"
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
