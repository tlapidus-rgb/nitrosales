// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  LineChart, Line, ReferenceLine,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import { DateRangeFilter } from "@/components/dashboard";
import { useBreakeven, getRoasHealth } from "@/lib/hooks/useBreakeven";
import { roasColorClass } from "@/components/campaigns/BreakevenChip";
import {
  Play, Pause, Eye, MousePointer, ShoppingCart, Target, Zap, TrendingUp, TrendingDown,
  Film, ImageIcon, AlertTriangle, CheckCircle2, XCircle, Flame, Snowflake,
  BarChart3, Filter, ChevronDown, ChevronUp, ChevronRight, ArrowRight, ArrowUpRight, ArrowDownRight,
  Activity, Video, Sparkles, X, Crosshair, Users, Layers, Package,
  Search, Grid3X3, List, Maximize2, ExternalLink, Award, Clock,
  ShieldCheck, Gauge, RefreshCw, Volume2, VolumeX, Star,
} from "lucide-react";

/* ── Constants ─────────────────────────────────────── */

const QUICK_RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

type PlatformView = "META" | "GOOGLE" | "ALL";

const PLATFORM_META = {
  META:   { label: "Meta Ads",   short: "Meta",   color: "#8b5cf6", bg: "bg-purple-500", text: "text-purple-600", soft: "bg-purple-50", ring: "ring-purple-200" },
  GOOGLE: { label: "Google Ads", short: "Google", color: "#3b82f6", bg: "bg-blue-500",   text: "text-blue-600",   soft: "bg-blue-50",   ring: "ring-blue-200" },
  ALL:    { label: "Todos",      short: "Todos",  color: "#475569", bg: "bg-slate-500",  text: "text-slate-600",  soft: "bg-slate-50",  ring: "ring-slate-200" },
} as const;

const FUNNEL_META: Record<string, { color: string; bg: string; ring: string; icon: any; label: string }> = {
  TOF:     { color: "text-purple-700",  bg: "bg-purple-50",  ring: "ring-purple-200",  icon: Eye,          label: "TOF · Awareness" },
  MOF:     { color: "text-blue-700",    bg: "bg-blue-50",    ring: "ring-blue-200",    icon: MousePointer, label: "MOF · Consideration" },
  BOF:     { color: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200", icon: ShoppingCart, label: "BOF · Conversion" },
  UNKNOWN: { color: "text-slate-600",   bg: "bg-slate-50",   ring: "ring-slate-200",   icon: Layers,       label: "Sin clasificar" },
};

function toDateInputValue(d: Date) { return d.toISOString().split("T")[0]; }
function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }
function num(n: number) { return n.toLocaleString("es-AR"); }

/* ── Media Proxy Helper ────────────────────────────── */
// Envuelve URLs de Meta/Google CDNs a traves de /api/media/proxy
// para evitar CORS + hot-linking restrictions. URLs nulas o de otros
// hosts se devuelven tal cual.
const PROXIED_HOSTS = [
  "fbcdn.net", "facebook.com", "cdninstagram.com",
  "googleusercontent.com", "ggpht.com", "youtube.com", "ytimg.com",
  "doubleclick.net", "tiktokcdn.com",
];
function proxied(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const shouldProxy = PROXIED_HOSTS.some((h) => host === h || host.endsWith("." + h));
    if (!shouldProxy) return url;
    return `/api/media/proxy?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

/* ── Fatigue Detection ─────────────────────────────── */

type FatigueLevel = "fresh" | "watch" | "fatigued" | "burned" | "new" | "lowdata";

interface FatigueResult {
  level: FatigueLevel;
  score: number;        // 0-100
  reasons: string[];    // human-readable signals
  cpmDelta: number;     // % change first half vs second half
  roasDelta: number;
  ctrDelta: number;
  recommendation: string;
}

function analyzeFatigue(c: any): FatigueResult {
  const days = c.dailySpend?.length || 0;
  if (days < 3) {
    return { level: "new", score: 0, reasons: ["Creativo nuevo · pocos datos"], cpmDelta: 0, roasDelta: 0, ctrDelta: 0, recommendation: "Esperá 5-7 dias de data antes de evaluar." };
  }
  if (c.spend < 5000) {
    return { level: "lowdata", score: 0, reasons: ["Inversion baja · sin senal"], cpmDelta: 0, roasDelta: 0, ctrDelta: 0, recommendation: "Aumentá presupuesto o consolidá con otros creativos." };
  }

  const arr = [...c.dailySpend].sort((a, b) => a.date.localeCompare(b.date));
  const half = Math.floor(arr.length / 2);
  const first = arr.slice(0, half);
  const second = arr.slice(half);

  const sum = (xs: any[], k: string) => xs.reduce((s, x) => s + (Number(x[k]) || 0), 0);

  const cpm1 = sum(first, "impressions") > 0 ? (sum(first, "spend") / sum(first, "impressions")) * 1000 : 0;
  const cpm2 = sum(second, "impressions") > 0 ? (sum(second, "spend") / sum(second, "impressions")) * 1000 : 0;
  const ctr1 = sum(first, "impressions") > 0 ? sum(first, "clicks") / sum(first, "impressions") : 0;
  const ctr2 = sum(second, "impressions") > 0 ? sum(second, "clicks") / sum(second, "impressions") : 0;

  const cpmDelta = cpm1 > 0 ? (cpm2 - cpm1) / cpm1 : 0;
  const ctrDelta = ctr1 > 0 ? (ctr2 - ctr1) / ctr1 : 0;
  const roasDelta = 0; // ROAS por dia no esta directo en dailySpend, usamos CTR/CPM como proxy

  const reasons: string[] = [];
  let score = 50;

  if (cpmDelta > 0.30) { reasons.push(`CPM subiendo ${pct(cpmDelta)}`); score -= 25; }
  else if (cpmDelta > 0.15) { reasons.push(`CPM en alza (${pct(cpmDelta)})`); score -= 12; }
  else if (cpmDelta < -0.10) { reasons.push(`CPM bajando ${pct(cpmDelta)}`); score += 10; }

  if (ctrDelta < -0.30) { reasons.push(`CTR cayendo ${pct(ctrDelta)}`); score -= 25; }
  else if (ctrDelta < -0.15) { reasons.push(`CTR en baja (${pct(ctrDelta)})`); score -= 12; }
  else if (ctrDelta > 0.10) { reasons.push(`CTR subiendo ${pct(ctrDelta)}`); score += 10; }

  if (days > 21) { reasons.push(`Activo hace ${days} dias`); score -= 8; }

  score = Math.max(0, Math.min(100, score));

  let level: FatigueLevel;
  let recommendation: string;
  if (score >= 70) { level = "fresh"; recommendation = "Performance solida · escalá presupuesto."; }
  else if (score >= 45) { level = "watch"; recommendation = "Performance estable · monitoreá CPM y CTR."; }
  else if (score >= 25) { level = "fatigued"; recommendation = "Fatiga detectada · prepará variantes nuevas."; }
  else { level = "burned"; recommendation = "Pausá y reemplazá · este creativo dejó de funcionar."; }

  if (reasons.length === 0) reasons.push("Performance estable");

  return { level, score, reasons, cpmDelta, roasDelta, ctrDelta, recommendation };
}

const FATIGUE_META: Record<FatigueLevel, { label: string; color: string; bg: string; text: string; ring: string; icon: any }> = {
  fresh:    { label: "Fresco",        color: "#10b981", bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", icon: Sparkles },
  watch:    { label: "Estable",       color: "#3b82f6", bg: "bg-blue-50",    text: "text-blue-700",    ring: "ring-blue-200",    icon: Activity },
  fatigued: { label: "Fatiga",        color: "#f59e0b", bg: "bg-amber-50",   text: "text-amber-700",   ring: "ring-amber-200",   icon: AlertTriangle },
  burned:   { label: "Quemado",       color: "#ef4444", bg: "bg-red-50",     text: "text-red-700",     ring: "ring-red-200",     icon: Flame },
  new:      { label: "Nuevo",         color: "#8b5cf6", bg: "bg-purple-50",  text: "text-purple-700",  ring: "ring-purple-200",  icon: Star },
  lowdata:  { label: "Poca data",     color: "#94a3b8", bg: "bg-slate-50",   text: "text-slate-600",   ring: "ring-slate-200",   icon: Snowflake },
};

/* ── Helper Components ─────────────────────────────── */

function PlatformChip({ platform }: { platform: string }) {
  const m = PLATFORM_META[platform as keyof typeof PLATFORM_META] || PLATFORM_META.ALL;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${m.soft} ${m.text} ring-1 ${m.ring}`}>
      {m.short}
    </span>
  );
}

function FunnelChip({ stage }: { stage: string }) {
  const m = FUNNEL_META[stage] || FUNNEL_META.UNKNOWN;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${m.bg} ${m.color} ring-1 ${m.ring}`}>
      <Icon size={10} />
      {stage === "UNKNOWN" ? "—" : stage}
    </span>
  );
}

function FatigueChip({ fatigue, compact = false }: { fatigue: FatigueResult; compact?: boolean }) {
  const m = FATIGUE_META[fatigue.level];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 ${compact ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"} rounded-full font-bold ${m.bg} ${m.text} ring-1 ${m.ring}`}>
      <Icon size={compact ? 10 : 12} />
      {m.label}
    </span>
  );
}

function ScoreBadge({ score, size = "md" }: { score: number | null; size?: "sm" | "md" | "lg" }) {
  if (score == null) {
    const cls = size === "lg" ? "text-2xl" : size === "sm" ? "text-xs" : "text-base";
    return <span className={`${cls} text-slate-300 font-bold tabular-nums`}>—</span>;
  }
  const color =
    score >= 75 ? "text-emerald-600 bg-emerald-50 ring-emerald-200" :
    score >= 50 ? "text-amber-600 bg-amber-50 ring-amber-200" :
    "text-red-600 bg-red-50 ring-red-200";
  const sz = size === "lg" ? "text-2xl px-3 py-1.5" : size === "sm" ? "text-[11px] px-1.5 py-0.5" : "text-sm px-2 py-0.5";
  return (
    <span className={`inline-flex items-center justify-center font-extrabold tabular-nums rounded-lg ring-1 ${color} ${sz}`}>
      {Math.round(score)}
    </span>
  );
}

function RoasPill({ value, breakeven }: { value: number; breakeven: number }) {
  const cls = roasColorClass(value, breakeven);
  const bgCls =
    cls === "text-green-600" ? "bg-emerald-50 ring-emerald-200" :
    cls === "text-amber-600" ? "bg-amber-50 ring-amber-200" :
    cls === "text-red-600" ? "bg-red-50 ring-red-200" :
    "bg-slate-50 ring-slate-200";
  return (
    <span className={`inline-flex items-center font-extrabold tabular-nums text-sm px-2 py-0.5 rounded-md ring-1 ${cls} ${bgCls}`}>
      {value.toFixed(2)}x
    </span>
  );
}

function MiniSparkline({ data, color = "#3b82f6" }: { data: any[]; color?: string }) {
  if (!data || data.length < 2) return <div className="h-8 w-full bg-slate-50 rounded" />;
  return (
    <ResponsiveContainer width="100%" height={32}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="spend" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color.replace("#", "")})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Media Preview ────────────────────────────────── */

function MediaThumb({ creative, onClick }: { creative: any; onClick?: () => void }) {
  const url = creative.mediaUrls?.[0];
  const isVideo = creative.isVideo;
  const [errored, setErrored] = useState(false);

  return (
    <div
      onClick={onClick}
      className="relative w-full aspect-square bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden cursor-pointer group"
    >
      {url && !errored ? (
        <>
          {/* En grid, tanto video como imagen muestran el thumbnail proxied. El play real ocurre en el modal. */}
          <img
            src={proxied(url)}
            alt={creative.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setErrored(true)}
          />
          <div className={`absolute inset-0 ${isVideo ? "bg-black/10" : "bg-black/0"} group-hover:bg-black/30 transition-colors flex items-center justify-center`}>
            <div className="w-14 h-14 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-[280ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]">
              {isVideo ? (
                <Play size={24} className="text-slate-900 ml-0.5" fill="currentColor" />
              ) : (
                <Maximize2 size={18} className="text-slate-900" />
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
          {isVideo ? <Film size={40} /> : <ImageIcon size={40} />}
          <span className="text-[10px] uppercase tracking-wider font-medium">Sin preview</span>
        </div>
      )}

      {/* Type chip top-left */}
      <div className="absolute top-2 left-2">
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-white font-medium uppercase tracking-wider">
          {isVideo ? <><Film size={10} /> Video</> : <><ImageIcon size={10} /> Imagen</>}
        </span>
      </div>

      {/* Status chip top-right */}
      {creative.status && (
        <div className="absolute top-2 right-2">
          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md backdrop-blur-sm font-medium uppercase tracking-wider ${
            creative.status === "ACTIVE" ? "bg-emerald-500/90 text-white" :
            creative.status === "PAUSED" ? "bg-slate-500/90 text-white" :
            "bg-slate-400/90 text-white"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${creative.status === "ACTIVE" ? "bg-white animate-pulse" : "bg-white/70"}`} />
            {creative.status}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Creative Card (gallery item) ──────────────────── */

function CreativeCard({ creative, breakeven, onClick }: { creative: any; breakeven: number; onClick: () => void }) {
  const fatigue = useMemo(() => analyzeFatigue(creative), [creative]);
  const score = creative.videoMetrics?.videoEfficiencyScore ?? null;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all cursor-pointer overflow-hidden flex flex-col"
    >
      <MediaThumb creative={creative} onClick={onClick} />

      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Header row: platform + funnel + score */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <PlatformChip platform={creative.platform} />
            <FunnelChip stage={creative.funnelStage} />
          </div>
          {score != null && <ScoreBadge score={score} size="sm" />}
        </div>

        {/* Name */}
        <div className="min-h-[2.5rem]">
          <div className="text-sm font-bold text-slate-900 line-clamp-2 leading-snug">
            {creative.name || creative.headline || "Sin nombre"}
          </div>
          {creative.campaignName && (
            <div className="text-[11px] text-slate-500 truncate mt-0.5">{creative.campaignName}</div>
          )}
        </div>

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 px-2 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Inversión</div>
            <div className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">{formatCompact(creative.spend)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 px-2 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">ROAS</div>
            <div className="mt-0.5 flex justify-center"><RoasPill value={creative.roas} breakeven={breakeven} /></div>
          </div>
        </div>

        {/* Secondary metrics */}
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
          <div>
            <div className="text-slate-500">CTR</div>
            <div className="font-bold text-slate-800 tabular-nums">{creative.ctr.toFixed(2)}%</div>
          </div>
          <div>
            <div className="text-slate-500">CPC</div>
            <div className="font-bold text-slate-800 tabular-nums">{formatARS(creative.cpc)}</div>
          </div>
          <div>
            <div className="text-slate-500">Conv.</div>
            <div className="font-bold text-slate-800 tabular-nums">{num(creative.conversions)}</div>
          </div>
        </div>

        {/* Footer: fatigue + sparkline */}
        <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <FatigueChip fatigue={fatigue} compact />
          <div className="text-[10px] text-slate-400 flex items-center gap-1">
            <Clock size={10} /> {creative.daysWithData}d
          </div>
        </div>
        <div className="-mt-2 h-8">
          <MiniSparkline data={creative.dailySpend} color={PLATFORM_META[creative.platform]?.color || "#64748b"} />
        </div>
      </div>
    </div>
  );
}

/* ── Detail Modal ─────────────────────────────────── */

function CreativeDetailModal({ creative, breakeven, onClose }: { creative: any; breakeven: number; onClose: () => void }) {
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fatigue = useMemo(() => analyzeFatigue(creative), [creative]);
  const score = creative.videoMetrics?.videoEfficiencyScore ?? null;
  const thumbUrl = creative.mediaUrls?.[0]; // siempre es una imagen (thumbnail)

  // Video source on-demand (solo para creativos de video).
  // /api/media/video/[creativeId] resuelve el source real via Graph API.
  // Si el source no se puede obtener (permisos del token), devolvemos
  // permalinkUrl como fallback (link a Facebook).
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoPoster, setVideoPoster] = useState<string | null>(null);
  const [videoPermalink, setVideoPermalink] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Image preview on-demand (solo para creativos NO-video)
  // /api/media/image/[creativeId] devuelve URL fresca + flag isDynamic (DPA)
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageIsDynamic, setImageIsDynamic] = useState(false);
  const [imagePermalink, setImagePermalink] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    if (!creative?.isVideo || !creative?.id) return;
    let cancelled = false;
    setVideoLoading(true);
    setVideoError(null);
    setVideoSrc(null);
    setVideoPoster(null);
    setVideoPermalink(null);
    fetch(`/api/media/video/${creative.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.posterUrl) setVideoPoster(data.posterUrl);
        if (data?.permalinkUrl) setVideoPermalink(data.permalinkUrl);
        if (data?.videoUrl) {
          // Los sources de Meta viven en video.xx.fbcdn.net → proxy obligatorio
          setVideoSrc(proxied(data.videoUrl) || data.videoUrl);
        } else {
          setVideoError(data?.error || "No pudimos obtener el video de Meta");
        }
      })
      .catch((e) => {
        if (!cancelled) setVideoError(e?.message || "Error cargando video");
      })
      .finally(() => {
        if (!cancelled) setVideoLoading(false);
      });
    return () => { cancelled = true; };
  }, [creative?.id, creative?.isVideo]);

  useEffect(() => {
    // Solo para creativos de imagen (no video). Las URLs de imagen de Meta
    // caducan rapido, asi que las refrescamos on-demand.
    if (creative?.isVideo || !creative?.id) return;
    let cancelled = false;
    setImageLoading(true);
    setImageError(null);
    setImageSrc(null);
    setImageIsDynamic(false);
    setImagePermalink(null);
    fetch(`/api/media/image/${creative.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.permalinkUrl) setImagePermalink(data.permalinkUrl);
        if (data?.isDynamic) {
          setImageIsDynamic(true);
        } else if (data?.imageUrl) {
          setImageSrc(proxied(data.imageUrl) || data.imageUrl);
        } else {
          setImageError(data?.error || "No pudimos obtener la imagen");
        }
      })
      .catch((e) => {
        if (!cancelled) setImageError(e?.message || "Error cargando imagen");
      })
      .finally(() => {
        if (!cancelled) setImageLoading(false);
      });
    return () => { cancelled = true; };
  }, [creative?.id, creative?.isVideo]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onEsc); document.body.style.overflow = ""; };
  }, [onClose]);

  const retentionData = creative.videoMetrics ? [
    { point: "0%",  retention: 100 },
    { point: "25%", retention: creative.videoMetrics.dropOffAnalysis?.retention25 ?? 0 },
    { point: "50%", retention: creative.videoMetrics.dropOffAnalysis?.retention50 ?? 0 },
    { point: "75%", retention: creative.videoMetrics.dropOffAnalysis?.retention75 ?? 0 },
    { point: "100%", retention: creative.videoMetrics.dropOffAnalysis?.retention100 ?? 0 },
  ] : [];

  const scoreBreakdown = creative.videoMetrics?.scoreBreakdown
    ? Object.entries(creative.videoMetrics.scoreBreakdown).map(([k, v]: any) => ({ metric: k, value: Number(v) || 0 }))
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-6xl w-full my-8 overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* LEFT: media */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-700 relative flex flex-col">
          <div className="relative flex-1 flex items-center justify-center min-h-[400px] lg:min-h-[600px]">
            {creative.isVideo ? (
              // VIDEO: usamos el source real resuelto on-demand por /api/media/video/[creativeId].
              // Mientras carga mostramos el thumbnail como poster + spinner. Si falla, thumbnail + mensaje.
              videoSrc ? (
                <video
                  ref={videoRef}
                  src={videoSrc}
                  poster={proxied(videoPoster || thumbUrl)}
                  className="w-full h-full max-h-[600px] object-contain"
                  controls
                  autoPlay
                  muted={muted}
                  playsInline
                  preload="metadata"
                />
              ) : (
                <div className="relative w-full h-full max-h-[600px] flex items-center justify-center bg-black">
                  {(videoPoster || thumbUrl) && (
                    <img
                      src={proxied(videoPoster || thumbUrl)}
                      alt={creative.name}
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  )}
                  {/* Loading state: spinner centrado sin oscurecer el poster */}
                  {videoLoading && (
                    <div className="relative z-10 flex flex-col items-center gap-3 text-white px-6">
                      <div className="flex flex-col items-center gap-3 px-6 py-4 rounded-2xl bg-black/60 backdrop-blur-sm">
                        <RefreshCw size={36} className="animate-spin text-white/90" />
                        <span className="text-xs text-white/80 uppercase tracking-[0.2em]">Cargando video…</span>
                      </div>
                    </div>
                  )}
                  {/* Error state: gradient solo abajo + mensaje + boton */}
                  {!videoLoading && videoError && (
                    <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 px-6 pt-16 pb-8 bg-gradient-to-t from-black/90 via-black/60 to-transparent text-white">
                      <span className="text-xs text-white/85 max-w-[360px] text-center leading-relaxed">{videoError}</span>
                      {videoPermalink && (
                        <a
                          href={videoPermalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-slate-900 text-xs font-semibold uppercase tracking-[0.15em] hover:bg-white/90 transition"
                        >
                          <Film size={14} /> Ver en Facebook
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )
            ) : (
              // IMAGEN: refrescada on-demand via /api/media/image/[creativeId].
              // 3 estados: loading (spinner sobre thumb cacheado), dynamic (catalogo
              // dinamico - no hay imagen unica), fresh image (URL fresca de Meta).
              <div className="relative w-full h-full max-h-[600px] flex items-center justify-center bg-black">
                {/* Imagen fresca o thumb cacheado de fallback */}
                {(imageSrc || thumbUrl) && !imageIsDynamic && (
                  <img
                    src={imageSrc || proxied(thumbUrl)}
                    alt={creative.name}
                    className="w-full h-full max-h-[600px] object-contain"
                    onError={(e) => {
                      // Si la imagen fresca falla, caemos al thumb cacheado
                      const img = e.currentTarget;
                      if (img.src !== proxied(thumbUrl) && thumbUrl) {
                        img.src = proxied(thumbUrl) || "";
                      }
                    }}
                  />
                )}

                {/* Loading state */}
                {imageLoading && !imageSrc && !imageIsDynamic && (
                  <div className="relative z-10 flex flex-col items-center gap-3 text-white px-6">
                    <div className="flex flex-col items-center gap-3 px-6 py-4 rounded-2xl bg-black/60 backdrop-blur-sm">
                      <RefreshCw size={36} className="animate-spin text-white/90" />
                      <span className="text-xs text-white/80 uppercase tracking-[0.2em]">Cargando imagen…</span>
                    </div>
                  </div>
                )}

                {/* Catalogo Dinamico: no hay imagen unica */}
                {imageIsDynamic && (
                  <div className="relative z-10 flex flex-col items-center gap-4 text-white px-8 text-center max-w-[420px]">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 backdrop-blur-md border border-white/15 flex items-center justify-center">
                      <Package size={40} className="text-white" />
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-white/90">Catálogo Dinámico</div>
                      <div className="text-xs text-white/70 leading-relaxed">
                        Meta arma una imagen distinta para cada usuario según el producto del feed que más le interesa. No hay un creativo único para previsualizar.
                      </div>
                    </div>
                    {imagePermalink && (
                      <a
                        href={imagePermalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-slate-900 text-xs font-semibold uppercase tracking-[0.15em] hover:bg-white/90 transition"
                      >
                        <ExternalLink size={14} /> Ver previews en Facebook
                      </a>
                    )}
                  </div>
                )}

                {/* Error state (no es dinamico, no hay imagen, falla el fetch) */}
                {!imageLoading && !imageSrc && !imageIsDynamic && !thumbUrl && (
                  <div className="text-white/50 flex flex-col items-center gap-3">
                    <ImageIcon size={64} />
                    <span className="text-xs text-white/60 max-w-[280px] text-center">{imageError || "Preview no disponible"}</span>
                    {imagePermalink && (
                      <a
                        href={imagePermalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-slate-900 text-xs font-medium uppercase tracking-[0.15em] hover:bg-white/90 transition"
                      >
                        <ExternalLink size={14} /> Ver en Facebook
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Mute toggle for video */}
            {videoSrc && creative.isVideo && (
              <button
                onClick={() => setMuted((m) => !m)}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/80 transition"
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            )}
          </div>

          {/* Caption / copy */}
          <div className="bg-slate-900/95 text-white p-4 space-y-2 border-t border-white/10">
            {creative.headline && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/50 font-semibold">Headline</div>
                <div className="text-sm font-medium">{creative.headline}</div>
              </div>
            )}
            {creative.description && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/50 font-semibold">Descripción</div>
                <div className="text-xs text-white/80">{creative.description}</div>
              </div>
            )}
            {creative.ctaType && (
              <div className="pt-1">
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-white/10 text-white font-bold uppercase tracking-wider">
                  CTA · {creative.ctaType}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: detail */}
        <div className="p-6 lg:p-8 space-y-5 overflow-y-auto max-h-[90vh]">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <PlatformChip platform={creative.platform} />
                <FunnelChip stage={creative.funnelStage} />
                <FatigueChip fatigue={fatigue} compact />
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 leading-tight">{creative.name || "Sin nombre"}</h2>
              {creative.campaignName && (
                <div className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                  <Layers size={12} /> {creative.campaignName}
                </div>
              )}
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition">
              <X size={18} />
            </button>
          </div>

          {/* Hero ROAS + Score */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 p-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">ROAS</div>
              <div className={`text-3xl font-extrabold tabular-nums ${roasColorClass(creative.roas, breakeven)}`}>
                {creative.roas.toFixed(2)}<span className="text-lg">x</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">BE: <span className="font-bold tabular-nums">{breakeven.toFixed(2)}x</span></div>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 p-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Score</div>
              <div className="flex items-baseline gap-2">
                <ScoreBadge score={score} size="lg" />
                <span className="text-xs text-slate-500">/ 100</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">{score == null ? "Sin video metrics" : "Funnel-aware"}</div>
            </div>
          </div>

          {/* Performance grid */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2">Performance</div>
            <div className="grid grid-cols-3 gap-2">
              <MetricBox label="Inversión" value={formatARS(creative.spend)} />
              <MetricBox label="Revenue" value={formatARS(creative.conversionValue)} />
              <MetricBox label="Conv." value={num(creative.conversions)} />
              <MetricBox label="Impresiones" value={formatCompact(creative.impressions)} />
              <MetricBox label="Clicks" value={formatCompact(creative.clicks)} />
              <MetricBox label="CTR" value={`${creative.ctr.toFixed(2)}%`} />
              <MetricBox label="CPC" value={formatARS(creative.cpc)} />
              <MetricBox label="CPM" value={formatARS(creative.cpm)} />
              <MetricBox label="CPA" value={creative.conversions > 0 ? formatARS(creative.costPerConversion) : "—"} />
            </div>
          </div>

          {/* Video retention */}
          {creative.isVideo && creative.videoMetrics && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2 flex items-center gap-1.5">
                <Video size={12} /> Curva de retención
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={retentionData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ret-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="point" tick={{ fontSize: 10, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} domain={[0, 100]} unit="%" />
                    <RechartsTooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Retención"]}
                    />
                    <Area type="monotone" dataKey="retention" stroke="#3b82f6" strokeWidth={2} fill="url(#ret-grad)" />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                  <RetentionBox label="Hook" value={creative.videoMetrics.hookRate} />
                  <RetentionBox label="Hold" value={creative.videoMetrics.holdRate} />
                  <RetentionBox label="Action" value={creative.videoMetrics.actionRate} />
                  <RetentionBox label="Complete" value={creative.videoMetrics.completionRate} />
                </div>
                {creative.videoMetrics.dropOffAnalysis?.diagnosisLabel && (
                  <div className="mt-3 text-xs text-slate-700 bg-white rounded-lg p-2.5 border border-slate-200">
                    <span className="font-bold">Diagnóstico:</span> {creative.videoMetrics.dropOffAnalysis.diagnosisLabel}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Score breakdown */}
          {scoreBreakdown.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2">Score breakdown</div>
              <div className="space-y-1.5">
                {scoreBreakdown.map((s) => (
                  <div key={s.metric} className="flex items-center gap-2 text-xs">
                    <span className="w-20 text-slate-600 font-medium capitalize">{s.metric}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full" style={{ width: `${Math.min(100, s.value)}%` }} />
                    </div>
                    <span className="w-10 text-right font-bold tabular-nums text-slate-800">{s.value.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fatigue panel */}
          <div className={`rounded-2xl p-4 ring-1 ${FATIGUE_META[fatigue.level].bg} ${FATIGUE_META[fatigue.level].ring}`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-full ${FATIGUE_META[fatigue.level].text} bg-white flex items-center justify-center shrink-0 ring-1 ${FATIGUE_META[fatigue.level].ring}`}>
                {React.createElement(FATIGUE_META[fatigue.level].icon, { size: 18 })}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-extrabold ${FATIGUE_META[fatigue.level].text} mb-1`}>
                  {FATIGUE_META[fatigue.level].label} · score {fatigue.score}/100
                </div>
                <div className="text-xs text-slate-700 mb-2">{fatigue.recommendation}</div>
                <div className="flex flex-wrap gap-1.5">
                  {fatigue.reasons.map((r, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/80 text-slate-700 ring-1 ring-slate-200 font-medium">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Daily trend */}
          {creative.dailySpend?.length > 1 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2">Tendencia diaria · Inversión</div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <ResponsiveContainer width="100%" height={100}>
                  <AreaChart data={creative.dailySpend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={PLATFORM_META[creative.platform]?.color || "#64748b"} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={PLATFORM_META[creative.platform]?.color || "#64748b"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
                    <RechartsTooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      formatter={(v: any) => [formatARS(Number(v)), "Spend"]}
                    />
                    <Area type="monotone" dataKey="spend" stroke={PLATFORM_META[creative.platform]?.color || "#64748b"} strokeWidth={1.5} fill="url(#trend-grad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function RetentionBox({ label, value }: { label: string; value: number }) {
  const v = Number(value) || 0;
  const color = v >= 50 ? "text-emerald-700" : v >= 25 ? "text-amber-700" : "text-red-700";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={`text-sm font-extrabold tabular-nums ${color}`}>{v.toFixed(1)}%</div>
    </div>
  );
}

/* ── Drilldown components ─────────────────────────── */
// Vista Campaign -> AdSet -> Ad. Patron breadcrumb (single pane)
// para que sea consistente entre desktop y mobile.

const GOOGLE_TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  SEARCH:          { label: "Search",    icon: Search,       color: "#3b82f6" },
  SHOPPING:        { label: "Shopping",  icon: ShoppingCart, color: "#10b981" },
  PERFORMANCE_MAX: { label: "PMax",      icon: Sparkles,     color: "#8b5cf6" },
  DISPLAY:         { label: "Display",   icon: ImageIcon,    color: "#f59e0b" },
  VIDEO:           { label: "Video",     icon: Video,        color: "#ef4444" },
  DEMAND_GEN:      { label: "Demand Gen",icon: Flame,        color: "#ec4899" },
  LOCAL:           { label: "Local",     icon: Crosshair,    color: "#06b6d4" },
};

function StatusDot({ status }: { status: string }) {
  const isActive = status === "ACTIVE";
  const isPaused = status === "PAUSED";
  const c = isActive ? "bg-emerald-500" : isPaused ? "bg-slate-400" : "bg-slate-300";
  const l = isActive ? "Activa" : isPaused ? "Pausada" : (status || "—");
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
      <span className={`w-1.5 h-1.5 rounded-full ${c} ${isActive ? "animate-pulse" : ""}`} />
      {l}
    </span>
  );
}

function MiniMetric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
      <div className={`text-sm font-extrabold tabular-nums mt-0.5 ${accent || "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function CampaignRow({ campaign, breakeven, onClick }: any) {
  const isMeta = campaign.platform === "META";
  const accent = isMeta ? "#8b5cf6" : "#3b82f6";
  return (
    <button
      onClick={onClick}
      className="group w-full bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)] transition-all duration-[280ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] p-4 text-left"
    >
      <div className="flex items-center gap-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${accent}1a`, color: accent }}
        >
          <Layers size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <PlatformChip platform={campaign.platform} />
            <FunnelChip stage={campaign.funnelStage} />
            <StatusDot status={campaign.status} />
          </div>
          <div className="text-sm font-bold text-slate-900 truncate">{campaign.name || "Sin nombre"}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {campaign.adSetsCount} ad set{campaign.adSetsCount === 1 ? "" : "s"} · {campaign.adsCount} creativo{campaign.adsCount === 1 ? "" : "s"}
          </div>
        </div>
        <div className="hidden lg:grid grid-cols-4 gap-5 shrink-0">
          <MiniMetric label="Inv." value={formatCompact(campaign.spend)} />
          <MiniMetric label="Conv." value={num(campaign.conversions)} />
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">ROAS</div>
            <div className="mt-0.5 flex justify-end"><RoasPill value={campaign.roas} breakeven={breakeven} /></div>
          </div>
          <MiniMetric label="CTR" value={`${campaign.ctr.toFixed(2)}%`} />
        </div>
        <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-transform duration-[220ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] shrink-0" />
      </div>
    </button>
  );
}

function AdSetRow({ adSet, breakeven, onClick }: any) {
  const topAd = adSet.topAd;
  return (
    <button
      onClick={onClick}
      className="group w-full bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)] transition-all duration-[280ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] p-4 text-left"
    >
      <div className="flex items-center gap-4">
        <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden shrink-0 ring-1 ring-slate-200/60">
          {topAd?.mediaUrl ? (
            <img
              src={proxied(topAd.mediaUrl)}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              {topAd?.type === "VIDEO" ? <Film size={20} /> : <ImageIcon size={20} />}
            </div>
          )}
          {adSet.isVideoCount > 0 && (
            <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-black/75 backdrop-blur-sm text-white flex items-center justify-center">
              <Play size={9} fill="currentColor" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <StatusDot status={adSet.status} />
            {adSet.optimizationGoal && (
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold truncate max-w-[180px]">
                {adSet.optimizationGoal}
              </span>
            )}
          </div>
          <div className="text-sm font-bold text-slate-900 truncate">{adSet.name || "Sin nombre"}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {adSet.adsCount} creativo{adSet.adsCount === 1 ? "" : "s"}
            {adSet.isVideoCount > 0 && <> · {adSet.isVideoCount} video{adSet.isVideoCount === 1 ? "" : "s"}</>}
            {adSet.frequency && <> · Freq {adSet.frequency.toFixed(2)}</>}
          </div>
        </div>
        <div className="hidden lg:grid grid-cols-4 gap-5 shrink-0">
          <MiniMetric label="Inv." value={formatCompact(adSet.spend)} />
          <MiniMetric label="Conv." value={num(adSet.conversions)} />
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">ROAS</div>
            <div className="mt-0.5 flex justify-end"><RoasPill value={adSet.roas} breakeven={breakeven} /></div>
          </div>
          <MiniMetric label="CTR" value={`${adSet.ctr.toFixed(2)}%`} />
        </div>
        <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-transform duration-[220ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] shrink-0" />
      </div>
    </button>
  );
}

function DrilldownHero({ title, subtitle, chips, metrics }: any) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-[0_1px_0_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
      <div className="flex items-center gap-2 flex-wrap mb-2">{chips}</div>
      <h2 className="text-lg font-extrabold text-slate-900 tracking-tight leading-tight">{title}</h2>
      <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-4 pt-4 border-t border-slate-100">
        {metrics.map((m: any) => (
          <div key={m.label}>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{m.label}</div>
            <div className={`text-base font-extrabold tabular-nums mt-0.5 ${m.accent || "text-slate-900"}`}>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrilldownEmpty({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-100 mx-auto mb-3 flex items-center justify-center text-slate-400">
        <Layers size={20} />
      </div>
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

function DrilldownSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 h-20 animate-pulse" />
      ))}
    </div>
  );
}

function DrilldownView({
  structure,
  structureLoading,
  platformView,
  breakeven,
  selectedCampaignId,
  selectedAdSetId,
  setSelectedCampaignId,
  setSelectedAdSetId,
  adSetCreatives,
  adSetCreativesLoading,
  onSelectCreative,
}: any) {
  const [googleType, setGoogleType] = useState<string>("ALL");

  const selectedCampaign = useMemo(
    () => structure?.campaigns?.find((c: any) => c.id === selectedCampaignId) || null,
    [structure, selectedCampaignId]
  );
  const selectedAdSet = useMemo(() => {
    if (!selectedCampaign) return null;
    return selectedCampaign.adSets?.find((s: any) => s.id === selectedAdSetId) || null;
  }, [selectedCampaign, selectedAdSetId]);

  const sortedAdSetCreatives = useMemo(() => {
    if (!adSetCreatives) return [];
    return [...adSetCreatives].sort((a: any, b: any) => b.spend - a.spend);
  }, [adSetCreatives]);

  const googleTypeCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: 0 };
    if (!structure?.campaigns) return counts;
    structure.campaigns.forEach((c: any) => {
      if (c.platform !== "GOOGLE") return;
      counts.ALL++;
      const t = c.objective || "UNKNOWN";
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [structure]);

  const campaignsList = useMemo(() => {
    if (!structure?.campaigns) return [];
    let cs = structure.campaigns;
    if (platformView === "GOOGLE" && googleType !== "ALL") {
      cs = cs.filter((c: any) => (c.objective || "UNKNOWN") === googleType);
    }
    return cs;
  }, [structure, platformView, googleType]);

  if (structureLoading) return <DrilldownSkeleton />;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm flex-wrap">
        <button
          onClick={() => { setSelectedCampaignId(null); setSelectedAdSetId(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors duration-[200ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${
            selectedCampaignId
              ? "text-slate-600 hover:bg-slate-100"
              : "bg-slate-900 text-white shadow-sm"
          }`}
        >
          <Layers size={14} /> Campañas
        </button>
        {selectedCampaign && (
          <>
            <ChevronRight size={14} className="text-slate-300" />
            <button
              onClick={() => setSelectedAdSetId(null)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors duration-[200ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] max-w-[280px] ${
                selectedAdSetId
                  ? "text-slate-600 hover:bg-slate-100"
                  : "bg-slate-900 text-white shadow-sm"
              }`}
            >
              <span className="truncate">{selectedCampaign.name}</span>
            </button>
          </>
        )}
        {selectedAdSet && (
          <>
            <ChevronRight size={14} className="text-slate-300" />
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold max-w-[280px] shadow-sm">
              <span className="truncate">{selectedAdSet.name}</span>
            </span>
          </>
        )}
      </div>

      {/* L0: Campaigns */}
      {!selectedCampaign && (
        <div className="space-y-4">
          {/* Google split tabs */}
          {platformView === "GOOGLE" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-1.5 flex gap-1 overflow-x-auto">
              {(["ALL","SEARCH","SHOPPING","PERFORMANCE_MAX","DISPLAY","VIDEO","DEMAND_GEN","LOCAL"] as const).map((t) => {
                const meta = t === "ALL" ? null : GOOGLE_TYPE_META[t];
                const count = googleTypeCounts[t] || 0;
                if (t !== "ALL" && count === 0) return null;
                const Icon = meta?.icon || Layers;
                const active = googleType === t;
                return (
                  <button
                    key={t}
                    onClick={() => setGoogleType(t)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all duration-[220ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] flex items-center gap-2 whitespace-nowrap ${
                      active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Icon size={14} style={{ color: active ? "#fff" : meta?.color || "#64748b" }} />
                    {t === "ALL" ? "Todas" : meta?.label}
                    <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-md ${
                      active ? "bg-white/15 text-white/90" : "bg-slate-100 text-slate-500"
                    }`}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {campaignsList.length === 0 ? (
            <DrilldownEmpty message="No hay campañas con actividad en este rango." />
          ) : (
            <div className="space-y-2">
              {campaignsList.map((c: any) => (
                <CampaignRow
                  key={c.id}
                  campaign={c}
                  breakeven={breakeven}
                  onClick={() => setSelectedCampaignId(c.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* L1: AdSets */}
      {selectedCampaign && !selectedAdSet && (
        <div className="space-y-4">
          <DrilldownHero
            title={selectedCampaign.name || "Sin nombre"}
            subtitle={`${selectedCampaign.objective || "—"} · ${selectedCampaign.adSetsCount} ad sets · ${selectedCampaign.adsCount} creativos`}
            chips={
              <>
                <PlatformChip platform={selectedCampaign.platform} />
                <FunnelChip stage={selectedCampaign.funnelStage} />
                <StatusDot status={selectedCampaign.status} />
              </>
            }
            metrics={[
              { label: "Inversión", value: formatARS(selectedCampaign.spend) },
              { label: "Revenue",   value: formatARS(selectedCampaign.conversionValue) },
              { label: "ROAS",      value: `${selectedCampaign.roas.toFixed(2)}x`, accent: roasColorClass(selectedCampaign.roas, breakeven) },
              { label: "Conv.",     value: num(selectedCampaign.conversions) },
              { label: "CTR",       value: `${selectedCampaign.ctr.toFixed(2)}%` },
              { label: "CPA",       value: selectedCampaign.cpa > 0 ? formatARS(selectedCampaign.cpa) : "—" },
            ]}
          />
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2">
              Ad Sets · {selectedCampaign.adSets?.length || 0}
            </div>
            {(!selectedCampaign.adSets || selectedCampaign.adSets.length === 0) ? (
              <DrilldownEmpty message="Esta campaña no tiene ad sets activos en el rango." />
            ) : (
              <div className="space-y-2">
                {selectedCampaign.adSets.map((s: any) => (
                  <AdSetRow
                    key={s.id}
                    adSet={s}
                    breakeven={breakeven}
                    onClick={() => setSelectedAdSetId(s.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* L2: Ads (creativos) */}
      {selectedAdSet && (
        <div className="space-y-4">
          <DrilldownHero
            title={selectedAdSet.name || "Sin nombre"}
            subtitle={`${selectedAdSet.optimizationGoal || "—"} · ${selectedAdSet.adsCount} creativos${selectedAdSet.dailyBudget ? ` · Budget ${formatARS(selectedAdSet.dailyBudget)}/día` : ""}`}
            chips={
              <>
                <StatusDot status={selectedAdSet.status} />
                {selectedAdSet.frequency && (
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                    Freq {selectedAdSet.frequency.toFixed(2)}
                  </span>
                )}
              </>
            }
            metrics={[
              { label: "Inversión", value: formatARS(selectedAdSet.spend) },
              { label: "Revenue",   value: formatARS(selectedAdSet.conversionValue) },
              { label: "ROAS",      value: `${selectedAdSet.roas.toFixed(2)}x`, accent: roasColorClass(selectedAdSet.roas, breakeven) },
              { label: "Conv.",     value: num(selectedAdSet.conversions) },
              { label: "CTR",       value: `${selectedAdSet.ctr.toFixed(2)}%` },
              { label: "Reach",     value: selectedAdSet.reach ? formatCompact(selectedAdSet.reach) : "—" },
            ]}
          />
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2">
              Creativos · {sortedAdSetCreatives.length}
            </div>
            {adSetCreativesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="w-full aspect-square bg-slate-100 animate-pulse" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 bg-slate-100 rounded w-2/3 animate-pulse" />
                      <div className="h-3 bg-slate-100 rounded w-full animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : sortedAdSetCreatives.length === 0 ? (
              <DrilldownEmpty message="No hay creativos con métricas en este rango para este ad set." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedAdSetCreatives.map((c: any) => (
                  <CreativeCard
                    key={c.id}
                    creative={c}
                    breakeven={breakeven}
                    onClick={() => onSelectCreative(c)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Hero KPI Strip ───────────────────────────────── */

function KpiHero({ label, value, sub, icon: Icon, accent = "slate", trend }: any) {
  const accents: Record<string, { bg: string; text: string; ring: string }> = {
    slate:    { bg: "bg-slate-50",    text: "text-slate-700",    ring: "ring-slate-200" },
    blue:     { bg: "bg-blue-50",     text: "text-blue-700",     ring: "ring-blue-200" },
    purple:   { bg: "bg-purple-50",   text: "text-purple-700",   ring: "ring-purple-200" },
    emerald:  { bg: "bg-emerald-50",  text: "text-emerald-700",  ring: "ring-emerald-200" },
    amber:    { bg: "bg-amber-50",    text: "text-amber-700",    ring: "ring-amber-200" },
    red:      { bg: "bg-red-50",      text: "text-red-700",      ring: "ring-red-200" },
  };
  const a = accents[accent] || accents.slate;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-sm transition">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl ${a.bg} ${a.text} ring-1 ${a.ring} flex items-center justify-center`}>
          <Icon size={16} />
        </div>
        {trend && (
          <span className={`text-[11px] font-bold tabular-nums flex items-center gap-0.5 ${trend > 0 ? "text-emerald-600" : trend < 0 ? "text-red-600" : "text-slate-400"}`}>
            {trend > 0 ? <ArrowUpRight size={12} /> : trend < 0 ? <ArrowDownRight size={12} /> : null}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
      <div className="text-2xl font-extrabold text-slate-900 tabular-nums leading-tight mt-1">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

/* ── Main Page ────────────────────────────────────── */

export default function CreativosLabPage() {
  const [dateFrom, setDateFrom] = useState(toDateInputValue(new Date(Date.now() - 30 * 86400000)));
  const [dateTo, setDateTo] = useState(toDateInputValue(new Date()));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(30);

  const handleQuickRange = (days: number) => {
    setDateTo(toDateInputValue(new Date()));
    setDateFrom(toDateInputValue(new Date(Date.now() - days * 86400000)));
    setActiveQuickRange(days);
  };
  const handleDateChange = (type: "from" | "to", v: string) => {
    if (type === "from") setDateFrom(v); else setDateTo(v);
    setActiveQuickRange(null);
  };

  const [platformView, setPlatformView] = useState<PlatformView>("META");
  const [funnelFilter, setFunnelFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"spend" | "roas" | "score" | "ctr">("spend");

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCreative, setSelectedCreative] = useState<any | null>(null);

  // ── Phase B2: Drilldown view ──
  // viewMode controla si renderizamos la galería plana o el árbol
  // jerárquico Campaign → AdSet → Ad. structureData se hidrata lazy
  // (solo cuando el usuario entra a drilldown) para no penalizar TTI.
  const [viewMode, setViewMode] = useState<"gallery" | "drilldown">("gallery");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedAdSetId, setSelectedAdSetId] = useState<string | null>(null);
  const [structureData, setStructureData] = useState<any>(null);
  const [structureLoading, setStructureLoading] = useState(false);
  const [adSetCreatives, setAdSetCreatives] = useState<any[] | null>(null);
  const [adSetCreativesLoading, setAdSetCreativesLoading] = useState(false);

  const { breakevenRoas, contributionMargin } = useBreakeven(dateFrom, dateTo);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo });
      if (platformView !== "ALL") params.set("platform", platformView);
      const res = await fetch(`/api/metrics/ads?${params.toString()}`);
      const j = await res.json();
      setData(j);
    } catch (e) {
      console.error(e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, platformView]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch structure (Campaigns + AdSets) cuando se entra a drilldown
  // o cambia el rango/plataforma. Se cachea en structureData.
  const fetchStructure = useCallback(async () => {
    setStructureLoading(true);
    try {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo });
      if (platformView !== "ALL") params.set("platform", platformView);
      const res = await fetch(`/api/metrics/ads/structure?${params.toString()}`);
      const j = await res.json();
      setStructureData(j);
    } catch (e) {
      console.error(e);
      setStructureData(null);
    } finally {
      setStructureLoading(false);
    }
  }, [dateFrom, dateTo, platformView]);

  useEffect(() => {
    if (viewMode === "drilldown") fetchStructure();
  }, [viewMode, fetchStructure]);

  // Fetch creativos del adSet seleccionado (L2). Usa el endpoint de ads
  // con filtro adSet, asi siempre trae todos los creativos del adset
  // independiente de los filtros de la galeria (clasificacion/funnel).
  useEffect(() => {
    if (!selectedAdSetId) {
      setAdSetCreatives(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setAdSetCreativesLoading(true);
      try {
        // Endpoint dedicado: trae todos los AdCreative del adSet sin filtros
        const params = new URLSearchParams({ from: dateFrom, to: dateTo, adSet: selectedAdSetId });
        const res = await fetch(`/api/metrics/ads/by-adset?${params.toString()}`);
        const j = await res.json();
        if (!cancelled) setAdSetCreatives(j?.creatives || []);
      } catch (e) {
        console.error(e);
        if (!cancelled) setAdSetCreatives([]);
      } finally {
        if (!cancelled) setAdSetCreativesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedAdSetId, dateFrom, dateTo, platformView]);

  // Reset selección al cambiar plataforma/rango
  useEffect(() => {
    setSelectedCampaignId(null);
    setSelectedAdSetId(null);
  }, [platformView, dateFrom, dateTo]);

  // Filter + sort
  const filteredCreatives = useMemo(() => {
    if (!data?.creatives) return [];
    let cs = data.creatives;
    if (funnelFilter !== "ALL") cs = cs.filter((c: any) => c.funnelStage === funnelFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      cs = cs.filter((c: any) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.headline || "").toLowerCase().includes(q) ||
        (c.campaignName || "").toLowerCase().includes(q)
      );
    }
    cs = [...cs].sort((a, b) => {
      if (sortBy === "score") return (b.videoMetrics?.videoEfficiencyScore ?? -1) - (a.videoMetrics?.videoEfficiencyScore ?? -1);
      return b[sortBy] - a[sortBy];
    });
    return cs;
  }, [data, funnelFilter, searchQuery, sortBy]);

  // Aggregates
  const totals = data?.totals;
  const fatigueAlerts = useMemo(() => {
    if (!data?.creatives) return [];
    return data.creatives
      .map((c: any) => ({ creative: c, fatigue: analyzeFatigue(c) }))
      .filter((x: any) => (x.fatigue.level === "fatigued" || x.fatigue.level === "burned") && x.creative.spend > 10000)
      .sort((a: any, b: any) => b.creative.spend - a.creative.spend);
  }, [data]);

  const topPerformer = useMemo(() => {
    if (!data?.creatives || data.creatives.length === 0) return null;
    return [...data.creatives].sort((a, b) => b.roas - a.roas)[0];
  }, [data]);

  const activeCount = data?.creatives?.filter((c: any) => c.status === "ACTIVE").length || 0;
  const videoCount = data?.creatives?.filter((c: any) => c.isVideo).length || 0;

  const blendedRoas = totals?.spend > 0 ? totals.conversionValue / totals.spend : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white sticky top-0 z-30 backdrop-blur-sm bg-white/95">
        <div className="px-6 py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <span>Marketing & Adquisición</span>
                <ArrowRight size={12} />
                <span>Campaigns</span>
                <ArrowRight size={12} />
                <span className="font-semibold text-slate-700">Creativos Lab</span>
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
                <Sparkles className="text-purple-500" size={22} />
                Creativos Lab
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">Galería visual con preview, scoring y detección de fatiga.</p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <DateRangeFilter
                dateFrom={dateFrom}
                dateTo={dateTo}
                activeQuickRange={activeQuickRange}
                quickRanges={QUICK_RANGES}
                onQuickRange={handleQuickRange}
                onDateChange={handleDateChange}
                loading={loading}
              />
              <button
                onClick={fetchData}
                className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition"
                title="Refrescar"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* Platform segmented control */}
          <div className="mt-4 inline-flex p-1 bg-slate-100 rounded-xl">
            {(["META", "GOOGLE", "ALL"] as PlatformView[]).map((p) => {
              const m = PLATFORM_META[p];
              const active = platformView === p;
              return (
                <button
                  key={p}
                  onClick={() => setPlatformView(p)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                    active ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full`} style={{ background: m.color }} />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-[1600px] mx-auto space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiHero
            label="Inversión"
            value={formatCompact(totals?.spend || 0)}
            sub={`${data?.creatives?.length || 0} creativos`}
            icon={Zap}
            accent={platformView === "META" ? "purple" : platformView === "GOOGLE" ? "blue" : "slate"}
            trend={data?.changes?.spend}
          />
          <KpiHero
            label="Revenue atrib."
            value={formatCompact(totals?.conversionValue || 0)}
            sub={`${num(totals?.conversions || 0)} conv.`}
            icon={ShoppingCart}
            accent="emerald"
            trend={data?.changes?.conversionValue}
          />
          <KpiHero
            label="ROAS"
            value={`${blendedRoas.toFixed(2)}x`}
            sub={`BE: ${breakevenRoas.toFixed(2)}x · CM ${(contributionMargin * 100).toFixed(0)}%`}
            icon={Gauge}
            accent={blendedRoas >= breakevenRoas * 1.5 ? "emerald" : blendedRoas >= breakevenRoas ? "amber" : "red"}
          />
          <KpiHero
            label="Activos"
            value={`${activeCount}`}
            sub={`${videoCount} videos · ${(data?.creatives?.length || 0) - videoCount} imagenes`}
            icon={Activity}
            accent="blue"
          />
          <KpiHero
            label="Necesitan refresh"
            value={`${fatigueAlerts.length}`}
            sub={fatigueAlerts.length === 0 ? "Todo fresco ✨" : "Fatiga detectada"}
            icon={Flame}
            accent={fatigueAlerts.length > 0 ? "red" : "emerald"}
          />
          <KpiHero
            label="CTR promedio"
            value={`${totals?.spend > 0 && totals?.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : "0.00"}%`}
            sub={`CPC ${formatARS(totals?.clicks > 0 ? totals.spend / totals.clicks : 0)}`}
            icon={MousePointer}
            accent="slate"
          />
        </div>

        {/* Fatigue alert panel */}
        {fatigueAlerts.length > 0 && (
          <div className="bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 rounded-2xl border border-red-200 p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-red-500/30">
                <Flame size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-extrabold text-slate-900">{fatigueAlerts.length} creativo{fatigueAlerts.length === 1 ? "" : "s"} necesita{fatigueAlerts.length === 1 ? "" : "n"} acción</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500 text-white font-bold uppercase tracking-wider">Urgente</span>
                </div>
                <p className="text-sm text-slate-700 mb-3">CPM en alza o CTR cayendo · pausá o creá variantes nuevas para no quemar presupuesto.</p>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {fatigueAlerts.slice(0, 8).map(({ creative, fatigue }: any) => (
                    <button
                      key={creative.id}
                      onClick={() => setSelectedCreative(creative)}
                      className="shrink-0 flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-red-200 hover:border-red-400 hover:shadow-sm transition text-left max-w-[260px]"
                    >
                      <div className="relative w-10 h-10 rounded-lg bg-slate-200 overflow-hidden shrink-0">
                        {creative.mediaUrls?.[0] ? (
                          <>
                            <img
                              src={proxied(creative.mediaUrls[0])}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            {creative.isVideo && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                <Play size={12} className="text-white" fill="currentColor" />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            {creative.isVideo ? <Film size={14} /> : <ImageIcon size={14} />}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 truncate">{creative.name || "Sin nombre"}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <FatigueChip fatigue={fatigue} compact />
                          <span className="tabular-nums">{formatCompact(creative.spend)}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top performer showcase */}
        {topPerformer && topPerformer.spend > 0 && (
          <div className="bg-gradient-to-br from-emerald-50 via-white to-blue-50 rounded-2xl border border-emerald-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Award size={16} />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">Top performer del periodo</h3>
              <PlatformChip platform={topPerformer.platform} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-5 items-center">
              <div className="w-full md:w-[200px] aspect-square rounded-xl overflow-hidden bg-slate-100 cursor-pointer" onClick={() => setSelectedCreative(topPerformer)}>
                <MediaThumb creative={topPerformer} onClick={() => setSelectedCreative(topPerformer)} />
              </div>
              <div className="space-y-2 min-w-0">
                <div className="text-lg font-extrabold text-slate-900 line-clamp-2">{topPerformer.name || "Sin nombre"}</div>
                {topPerformer.campaignName && (
                  <div className="text-sm text-slate-500 flex items-center gap-1.5">
                    <Layers size={12} /> {topPerformer.campaignName}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <FunnelChip stage={topPerformer.funnelStage} />
                  <FatigueChip fatigue={analyzeFatigue(topPerformer)} compact />
                  {topPerformer.videoMetrics?.videoEfficiencyScore != null && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white text-slate-700 ring-1 ring-slate-200 font-bold">
                      Score {Math.round(topPerformer.videoMetrics.videoEfficiencyScore)}/100
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-1 gap-3 md:gap-2 min-w-[180px]">
                <div className="text-center md:text-left">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">ROAS</div>
                  <div className={`text-3xl font-extrabold tabular-nums ${roasColorClass(topPerformer.roas, breakevenRoas)}`}>
                    {topPerformer.roas.toFixed(2)}<span className="text-base">x</span>
                  </div>
                </div>
                <div className="text-center md:text-left">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Inversión</div>
                  <div className="text-base font-bold text-slate-900 tabular-nums">{formatARS(topPerformer.spend)}</div>
                </div>
                <div className="text-center md:text-left">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Revenue</div>
                  <div className="text-base font-bold text-slate-900 tabular-nums">{formatARS(topPerformer.conversionValue)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 flex-wrap">
          {/* View mode toggle (Galería ↔ Drilldown) */}
          <div className="inline-flex p-0.5 bg-slate-100 rounded-xl">
            <button
              onClick={() => setViewMode("gallery")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-[200ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] flex items-center gap-1.5 ${
                viewMode === "gallery"
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Grid3X3 size={13} /> Galería
            </button>
            <button
              onClick={() => setViewMode("drilldown")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-[200ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] flex items-center gap-1.5 ${
                viewMode === "drilldown"
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <List size={13} /> Drilldown
            </button>
          </div>

          {viewMode === "gallery" && (
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search size={16} className="text-slate-400" />
              <input
                type="text"
                placeholder="Buscar creativo, headline o campaña..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-400"
              />
            </div>
          )}
          {viewMode === "drilldown" && <div className="flex-1" />}

          {viewMode === "gallery" && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Funnel</span>
                <div className="flex p-0.5 bg-slate-100 rounded-lg">
                  {["ALL", "TOF", "MOF", "BOF"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setFunnelFilter(f)}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${
                        funnelFilter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {f === "ALL" ? "Todos" : f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Ordenar</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="text-xs font-bold bg-slate-100 px-2.5 py-1 rounded-lg border-none outline-none cursor-pointer"
                >
                  <option value="spend">Inversión</option>
                  <option value="roas">ROAS</option>
                  <option value="score">Score</option>
                  <option value="ctr">CTR</option>
                </select>
              </div>
            </>
          )}
        </div>

        {/* Drilldown view (Campaigns → AdSets → Ads) */}
        {viewMode === "drilldown" ? (
          <DrilldownView
            structure={structureData}
            structureLoading={structureLoading}
            platformView={platformView}
            breakeven={breakevenRoas}
            selectedCampaignId={selectedCampaignId}
            selectedAdSetId={selectedAdSetId}
            setSelectedCampaignId={setSelectedCampaignId}
            setSelectedAdSetId={setSelectedAdSetId}
            adSetCreatives={adSetCreatives}
            adSetCreativesLoading={adSetCreativesLoading}
            onSelectCreative={setSelectedCreative}
          />
        ) : loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="w-full aspect-square bg-slate-100 animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-slate-100 rounded w-2/3 animate-pulse" />
                  <div className="h-3 bg-slate-100 rounded w-full animate-pulse" />
                  <div className="h-3 bg-slate-100 rounded w-1/2 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredCreatives.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 mx-auto mb-4 flex items-center justify-center text-slate-400">
              <Film size={28} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">No hay creativos para mostrar</h3>
            <p className="text-sm text-slate-500">Probá ampliar el rango de fechas, cambiar plataforma o ajustar los filtros.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">
                Mostrando <span className="font-bold text-slate-900">{filteredCreatives.length}</span> creativo{filteredCreatives.length === 1 ? "" : "s"}
                {platformView !== "ALL" && <> de <span className="font-bold">{PLATFORM_META[platformView].label}</span></>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredCreatives.map((c: any) => (
                <CreativeCard
                  key={c.id}
                  creative={c}
                  breakeven={breakevenRoas}
                  onClick={() => setSelectedCreative(c)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedCreative && (
        <CreativeDetailModal
          creative={selectedCreative}
          breakeven={breakevenRoas}
          onClose={() => setSelectedCreative(null)}
        />
      )}
    </div>
  );
}
