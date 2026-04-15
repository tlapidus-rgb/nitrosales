// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, BarChart, Bar, Cell, LineChart, Line,
  ReferenceLine, ComposedChart,
} from "recharts";
import { formatARS, formatCompact } from "@/lib/utils/format";
import { KpiCard, DateRangeFilter } from "@/components/dashboard";
import {
  DollarSign, Eye, MousePointer, ShoppingCart, TrendingUp,
  TrendingDown, ArrowUp, ArrowDown, Download, Target, Zap,
  BarChart3, ArrowUpRight, ArrowDownRight, AlertTriangle,
  ShieldCheck, Activity, Gauge, Scale, Info,
  Flame, Rocket, Scissors, Layers, ExternalLink, Copy, CheckCircle2,
  Sparkles,
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

function RoasBadge({ value, breakeven }: { value: number; breakeven?: number | null }) {
  let color = "text-gray-600 bg-gray-50";
  if (breakeven && breakeven > 0) {
    if (value >= breakeven * 1.5) color = "text-green-600 bg-green-50";
    else if (value >= breakeven) color = "text-amber-600 bg-amber-50";
    else if (value > 0) color = "text-red-600 bg-red-50";
  } else {
    color = value >= 3 ? "text-green-600 bg-green-50" : value >= 1.5 ? "text-amber-600 bg-amber-50" : value > 0 ? "text-red-600 bg-red-50" : "text-gray-600 bg-gray-50";
  }
  return <span className={`px-2 py-1 rounded-md text-xs font-bold ${color}`}>{value}x</span>;
}

/* ── Break-even Health Banner ──────────────────────── */

function BreakevenBanner({
  blendedRoas,
  breakevenRoas,
  contributionMargin,
  adSpend,
  realRevenue,
}: {
  blendedRoas: number;
  breakevenRoas: number;
  contributionMargin: number;
  adSpend: number;
  realRevenue: number;
}) {
  const hasData = breakevenRoas > 0 && adSpend > 0;

  // Status & paleta premium
  type Status = "stellar" | "excellent" | "healthy" | "edge" | "loss" | "none";
  let status: Status = "none";
  let statusLabel = "Sin datos suficientes";
  let statusSub = "Cargá COGS y fees para calcular el break-even.";
  let Icon: any = Info;
  let zoneName = "Sin datos";
  const multiple = hasData ? blendedRoas / breakevenRoas : 0;

  if (hasData) {
    if (multiple >= 5) {
      status = "stellar"; statusLabel = "Estelar"; Icon = Sparkles; zoneName = "Estelar";
      statusSub = `Por cada $1 invertido en ads, $${blendedRoas.toFixed(2)} entran a VTEX. Vas ${multiple.toFixed(1)}× el break-even.`;
    } else if (multiple >= 3) {
      status = "excellent"; statusLabel = "Excelente"; Icon = Rocket; zoneName = "Excelente";
      statusSub = `Por cada $1 invertido, $${blendedRoas.toFixed(2)} entran a VTEX. Tenés margen para escalar agresivo.`;
    } else if (multiple >= 1.5) {
      status = "healthy"; statusLabel = "Rentable con margen"; Icon = ShieldCheck; zoneName = "Saludable";
      statusSub = `Por cada $1 invertido, $${blendedRoas.toFixed(2)} entran a VTEX. Margen sano sobre el break-even.`;
    } else if (multiple >= 1) {
      status = "edge"; statusLabel = "En equilibrio"; Icon = Activity; zoneName = "Equilibrio";
      statusSub = "Cubris costos pero el margen es fino. Optimizá creativos o bajá CPC.";
    } else {
      status = "loss"; statusLabel = "Perdiendo plata"; Icon = AlertTriangle; zoneName = "Pérdida";
      const gap = ((breakevenRoas - blendedRoas) / breakevenRoas) * 100;
      statusSub = `Estás ${gap.toFixed(0)}% por debajo del break-even. Revisar campañas ASAP.`;
    }
  }

  // Paleta por estado — premium, contraste alto
  const palette = {
    stellar:   { accent: "#059669", from: "from-emerald-100/70", via: "via-teal-50/40",     to: "to-white",          ring: "ring-emerald-200/80",  chipBg: "bg-emerald-600 text-white",     icon: "bg-emerald-100 text-emerald-700", glow: "from-emerald-300/30",  bar: ["#10b981","#059669","#047857"] },
    excellent: { accent: "#10b981", from: "from-emerald-50",     via: "via-emerald-50/40",  to: "to-white",          ring: "ring-emerald-200",     chipBg: "bg-emerald-500 text-white",     icon: "bg-emerald-100 text-emerald-700", glow: "from-emerald-300/25",  bar: ["#34d399","#10b981","#059669"] },
    healthy:   { accent: "#10b981", from: "from-emerald-50/70",  via: "via-white",          to: "to-emerald-50/40",  ring: "ring-emerald-200",     chipBg: "bg-emerald-500 text-white",     icon: "bg-emerald-100 text-emerald-700", glow: "from-emerald-200/20",  bar: ["#34d399","#10b981"] },
    edge:      { accent: "#f59e0b", from: "from-amber-50",       via: "via-yellow-50/30",   to: "to-white",          ring: "ring-amber-200",       chipBg: "bg-amber-500 text-white",       icon: "bg-amber-100 text-amber-700",     glow: "from-amber-200/30",    bar: ["#fbbf24","#f59e0b"] },
    loss:      { accent: "#ef4444", from: "from-rose-50",        via: "via-red-50/30",      to: "to-white",          ring: "ring-rose-200",        chipBg: "bg-rose-600 text-white",        icon: "bg-rose-100 text-rose-700",       glow: "from-rose-300/25",     bar: ["#f87171","#ef4444"] },
    none:      { accent: "#64748b", from: "from-slate-50",       via: "via-white",          to: "to-slate-50",       ring: "ring-slate-200",       chipBg: "bg-slate-200 text-slate-700",   icon: "bg-slate-100 text-slate-600",     glow: "from-slate-200/30",    bar: ["#cbd5e1","#94a3b8"] },
  } as const;
  const p = palette[status];

  // Zone gauge: 5 tramos nombrados (Pérdida / Equilibrio / Saludable / Excelente / Estelar)
  // Cada tramo ocupa 20% de la barra, escala visual independiente del valor exacto
  const zoneStops = [
    { name: "Pérdida",    color: "#fecaca", text: "#b91c1c", min: 0,            max: breakevenRoas },
    { name: "Equilibrio", color: "#fde68a", text: "#b45309", min: breakevenRoas, max: breakevenRoas * 1.5 },
    { name: "Saludable",  color: "#a7f3d0", text: "#047857", min: breakevenRoas * 1.5, max: breakevenRoas * 3 },
    { name: "Excelente",  color: "#6ee7b7", text: "#047857", min: breakevenRoas * 3,   max: breakevenRoas * 5 },
    { name: "Estelar",    color: "#34d399", text: "#065f46", min: breakevenRoas * 5,   max: breakevenRoas * 8 },
  ];

  // Posición del marker (interpolada dentro del zone donde cae)
  let markerPct = 0;
  let markerZoneIdx = 0;
  if (hasData) {
    if (blendedRoas <= 0) { markerPct = 0; markerZoneIdx = 0; }
    else {
      let placed = false;
      for (let i = 0; i < zoneStops.length; i++) {
        const z = zoneStops[i];
        if (blendedRoas >= z.min && blendedRoas <= z.max) {
          const within = (blendedRoas - z.min) / Math.max(z.max - z.min, 0.0001);
          markerPct = (i * 20) + within * 20;
          markerZoneIdx = i;
          placed = true; break;
        }
      }
      if (!placed) { markerPct = 100; markerZoneIdx = zoneStops.length - 1; } // arriba de Estelar
    }
  }
  markerPct = Math.min(99.5, Math.max(0.5, markerPct));
  const beMarkerPct = 20; // BE siempre cae al final del primer tramo (Pérdida)

  return (
    <div className={`relative rounded-3xl overflow-hidden shadow-sm ring-1 ${p.ring} ns-fade-up`}>
      {/* Background premium: gradient sutil + 2 blobs de color */}
      <div className={`absolute inset-0 bg-gradient-to-br ${p.from} ${p.via} ${p.to}`} />
      <div className={`pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-gradient-to-br ${p.glow} to-transparent blur-3xl`} />
      <div className={`pointer-events-none absolute -bottom-24 -right-32 w-96 h-96 rounded-full bg-gradient-to-br ${p.glow} to-transparent blur-3xl opacity-60`} />

      <div className="relative p-6 md:p-7">
        {/* TOP ROW: Headline + Metrics mini-cards */}
        <div className="flex items-start justify-between gap-6 flex-wrap">
          {/* LEFT: status + headline */}
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <div className={`p-2.5 rounded-2xl ${p.icon} ring-1 ring-white/60 shadow-sm`}>
              <Icon size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.16em] px-2.5 py-1 rounded-full shadow-sm ${p.chipBg}`}>
                  {status === "stellar" && <Sparkles size={10} className="text-amber-300" />}
                  {statusLabel}
                </span>
                <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Salud publicitaria</span>
                {status !== "none" && status !== "loss" && (
                  <span className="relative flex w-1.5 h-1.5 ml-0.5">
                    <span className="absolute inset-0 rounded-full opacity-75 ns-pulse-halo" style={{ background: p.accent }} />
                    <span className="relative rounded-full w-1.5 h-1.5" style={{ background: p.accent }} />
                  </span>
                )}
              </div>

              {/* HERO: multiplicador como protagonista */}
              {hasData ? (
                <div className="mt-2.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[40px] md:text-[44px] font-bold text-slate-900 tabular-nums leading-none tracking-tight">
                      {multiple.toFixed(1)}<span className="text-[26px] text-slate-400 font-semibold">×</span>
                    </span>
                    <span className="text-[14px] text-slate-600">sobre el break-even</span>
                  </div>
                  <p className="text-[12.5px] text-slate-600 mt-1.5 max-w-xl leading-relaxed">{statusSub}</p>
                  <div className="mt-2 inline-flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/70 ring-1 ring-slate-200/80 backdrop-blur tabular-nums">
                      <span className="font-semibold text-slate-700">Blended ROAS</span> {blendedRoas.toFixed(2)}x
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/70 ring-1 ring-slate-200/80 backdrop-blur tabular-nums">
                      <span className="font-semibold text-slate-700">Break-even</span> {breakevenRoas.toFixed(2)}x
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-slate-900 mt-1">Break-even ROAS</h2>
                  <p className="text-sm text-slate-600 mt-0.5">{statusSub}</p>
                </>
              )}
            </div>
          </div>

          {/* RIGHT: 3 metric mini-cards */}
          <div className="grid grid-cols-3 gap-2 shrink-0">
            <MetricMini
              label="CM (VTEX)"
              value={contributionMargin > 0 ? `${(contributionMargin * 100).toFixed(1)}%` : "--"}
              hint="post-fees"
              accent={p.accent}
            />
            <MetricMini
              label="Inversión"
              value={formatCompact(adSpend)}
              hint="ad spend"
              accent={p.accent}
            />
            <MetricMini
              label="Revenue VTEX"
              value={formatCompact(realRevenue)}
              hint="entró a caja"
              accent={p.accent}
              highlight
            />
          </div>
        </div>

        {/* ZONE GAUGE: 5 tramos nombrados con marker glowing */}
        <div className="mt-7">
          <div className="flex items-end justify-between mb-1.5 px-0.5">
            <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-slate-500">Zona de salud</span>
            <span className="text-[10px] text-slate-400 tabular-nums">
              {hasData ? `Tu ROAS ${blendedRoas.toFixed(2)}x está en zona ` : ""}
              {hasData && <span className="font-semibold" style={{ color: p.accent }}>{zoneName}</span>}
            </span>
          </div>

          <div className="relative h-9 rounded-2xl overflow-hidden ring-1 ring-slate-200/80 shadow-inner bg-slate-50">
            {/* Tramos */}
            <div className="absolute inset-0 flex">
              {zoneStops.map((z, i) => (
                <div
                  key={z.name}
                  className="relative h-full flex items-center justify-center transition-opacity"
                  style={{
                    width: "20%",
                    background: i === markerZoneIdx
                      ? `linear-gradient(180deg, ${z.color}cc 0%, ${z.color}99 100%)`
                      : `linear-gradient(180deg, ${z.color}55 0%, ${z.color}33 100%)`,
                    opacity: hasData ? 1 : 0.4,
                  }}
                >
                  <span
                    className="text-[9.5px] font-bold uppercase tracking-wider"
                    style={{ color: i === markerZoneIdx ? z.text : `${z.text}99`, opacity: i === markerZoneIdx ? 1 : 0.7 }}
                  >
                    {z.name}
                  </span>
                  {i < zoneStops.length - 1 && (
                    <span className="absolute right-0 top-1.5 bottom-1.5 w-px bg-white/70" />
                  )}
                </div>
              ))}
            </div>

            {/* BE line */}
            {hasData && (
              <div
                className="absolute top-0 bottom-0 w-px bg-slate-700/80"
                style={{ left: `${beMarkerPct}%` }}
              />
            )}

            {/* Current ROAS marker */}
            {hasData && (
              <div
                className="absolute top-1/2 -translate-y-1/2 z-10"
                style={{ left: `${markerPct}%`, transform: "translate(-50%, -50%)" }}
              >
                <div className="relative">
                  <span className="absolute inset-0 rounded-full ns-pulse-halo opacity-60" style={{ background: p.accent, width: 22, height: 22, top: -3, left: -3 }} />
                  <div
                    className="relative flex items-center justify-center rounded-full ring-2 ring-white shadow-lg"
                    style={{ width: 16, height: 16, background: `linear-gradient(135deg, ${p.bar[0]} 0%, ${p.bar[p.bar.length - 1]} 100%)` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Eje inferior: 0x · BE · 1.5×BE · 3×BE · 5×BE · 8×BE+ */}
          <div className="flex justify-between mt-1.5 text-[10px] text-slate-500 tabular-nums px-0.5">
            <span>0x</span>
            <span className="font-semibold text-slate-700">BE {hasData ? breakevenRoas.toFixed(2) : "--"}x</span>
            <span>{hasData ? (breakevenRoas * 1.5).toFixed(1) : "--"}x</span>
            <span>{hasData ? (breakevenRoas * 3).toFixed(1) : "--"}x</span>
            <span>{hasData ? (breakevenRoas * 5).toFixed(1) : "--"}x</span>
            <span>{hasData ? (breakevenRoas * 8).toFixed(0) : "--"}x+</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Mini-card de métrica para el header del banner */
function MetricMini({
  label, value, hint, accent, highlight,
}: { label: string; value: string; hint?: string; accent: string; highlight?: boolean }) {
  return (
    <div
      className={`relative rounded-xl px-3 py-2.5 ring-1 backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-md ${
        highlight ? "bg-white shadow-sm ring-white" : "bg-white/70 ring-slate-200/80"
      }`}
      style={highlight ? { boxShadow: `0 1px 0 ${accent}33, 0 4px 12px ${accent}1a` } : undefined}
    >
      {highlight && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full" style={{ background: accent }} />
      )}
      <p className="text-[9.5px] uppercase tracking-[0.14em] text-slate-500 font-bold">{label}</p>
      <p className="text-[18px] font-bold text-slate-900 tabular-nums leading-tight mt-0.5">{value}</p>
      {hint && <p className="text-[9.5px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
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

/* ── Discrepancy Block ─────────────────────────────── */

function DiscrepancyBlock({
  attributedRevenue,
  vtexRevenue,
  adSpend,
}: {
  attributedRevenue: number;
  vtexRevenue: number;
  adSpend: number;
}) {
  if (attributedRevenue <= 0 && vtexRevenue <= 0) return null;
  const diff = vtexRevenue - attributedRevenue;
  const diffPct = attributedRevenue > 0 ? (diff / attributedRevenue) * 100 : 0;
  const attributedRoas = adSpend > 0 ? attributedRevenue / adSpend : 0;
  const blendedRoas = adSpend > 0 ? vtexRevenue / adSpend : 0;
  const positive = diff >= 0;

  // Insight humano, cortito, potente
  const headline = positive
    ? `Tu negocio está generando ${formatCompact(Math.abs(diff))} más de lo que las plataformas se atribuyen.`
    : `Las plataformas están sobre-atribuyendo ${formatCompact(Math.abs(diff))}.`;
  const subline = positive
    ? `Hay halo orgánico + tráfico directo que los ads ayudan a traer pero no se llevan el crédito.`
    : `Hay conversiones contadas dos veces o atribuidas a ads que no las originaron.`;

  // Magnitudes para los anchos de las barras visuales
  const maxRev = Math.max(attributedRevenue, vtexRevenue, 1);
  const platformBarPct = (attributedRevenue / maxRev) * 100;
  const vtexBarPct = (vtexRevenue / maxRev) * 100;

  return (
    <div className="relative rounded-3xl overflow-hidden ns-fade-up ring-1 ring-slate-200 shadow-sm bg-white">
      {/* Background blobs */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/60 via-white to-emerald-50/60" />
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-indigo-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-emerald-300/20 blur-3xl" />

      <div className="relative p-6 md:p-7">
        {/* Edge badge */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 text-white text-[10px] font-bold uppercase tracking-[0.18em] shadow-sm">
            <Sparkles size={11} className="text-amber-300" />
            NitroSales Edge
          </span>
          <span className="text-[11px] text-slate-500">Plataformas vs Realidad VTEX · lo que solo vos ves</span>
        </div>

        {/* Headline insight */}
        <h3 className="text-[20px] md:text-[22px] font-bold text-slate-900 leading-tight max-w-3xl">
          {headline}
        </h3>
        <p className="text-[13px] text-slate-600 mt-1.5 max-w-3xl">{subline}</p>

        {/* 3 cards de colores fuertes */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Plataformas dicen — morado/violeta */}
          <div className="relative rounded-2xl p-4 text-white overflow-hidden shadow-md"
               style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)" }}>
            <div className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-white/80" />
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">Plataformas dicen</p>
              </div>
              <p className="text-[24px] font-bold tabular-nums leading-tight mt-1.5">{formatCompact(attributedRevenue)}</p>
              <p className="text-[11px] text-white/80 mt-0.5">Meta + Google atribuido</p>
              <div className="mt-3 inline-flex items-center gap-1 rounded-md bg-white/15 backdrop-blur px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                ROAS {attributedRoas.toFixed(2)}x
              </div>
            </div>
          </div>

          {/* Realidad VTEX — verde */}
          <div className="relative rounded-2xl p-4 text-white overflow-hidden shadow-md"
               style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}>
            <div className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-1.5">
                <span className={`relative w-2 h-2 rounded-full bg-white ${positive ? "ns-pulse-dot" : ""}`} />
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/90">Realidad VTEX</p>
              </div>
              <p className="text-[24px] font-bold tabular-nums leading-tight mt-1.5">{formatCompact(vtexRevenue)}</p>
              <p className="text-[11px] text-white/85 mt-0.5">Lo que entró a caja</p>
              <div className="mt-3 inline-flex items-center gap-1 rounded-md bg-white/15 backdrop-blur px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                Blended ROAS {blendedRoas.toFixed(2)}x
              </div>
            </div>
          </div>

          {/* Diferencia */}
          <div className="relative rounded-2xl p-4 text-white overflow-hidden shadow-md"
               style={{ background: positive
                 ? "linear-gradient(135deg, #0f766e 0%, #059669 100%)"
                 : "linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)" }}>
            <div className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-1.5">
                {positive ? <TrendingUp size={12} className="text-white" /> : <TrendingDown size={12} className="text-white" />}
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/90">
                  {positive ? "Halo + directo" : "Sobre-atribución"}
                </p>
              </div>
              <p className="text-[24px] font-bold tabular-nums leading-tight mt-1.5">
                {positive ? "+" : ""}{formatCompact(diff)}
              </p>
              <p className="text-[11px] text-white/85 mt-0.5">Diferencia VTEX − plataformas</p>
              <div className="mt-3 inline-flex items-center gap-1 rounded-md bg-white/15 backdrop-blur px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                {positive ? "+" : ""}{diffPct.toFixed(0)}%
              </div>
            </div>
          </div>
        </div>

        {/* Footer insight */}
        <div className="mt-4 flex items-start gap-2 text-[11.5px] text-slate-600 bg-white/70 backdrop-blur rounded-xl px-3 py-2 ring-1 ring-slate-200/60">
          <Scale size={14} className="text-indigo-600 mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold text-slate-800">Por qué importa:</span>{" "}
            Meta y Google se pelean por atribuirse las ventas. VTEX te dice lo que realmente entró a caja.
            La brecha revela el impacto real de tus ads en el negocio —no solo lo que cada plataforma reclama.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Urgent Actions (Hoy) ──────────────────────────── */
// Hasta 6 acciones priorizadas por impacto en $, derivadas del API de campañas.
// NO ejecuta acciones: solo recomienda + deep-link a la plataforma.
// Detecta: kill (perdiendo), scale (escalar), rescue (cerca de BE), bid (CPC alto),
// creative (CTR bajo = fatiga), consolidated (varios losers juntos).

type UrgentActionKind = "kill" | "scale" | "rescue" | "bid" | "creative" | "consolidated";

type UrgentAction = {
  kind: UrgentActionKind;
  title: string;
  whyHuman: string;
  whyTech: string;
  impactArs: number;
  impactLabel: string;
  ctaLabel: string;
  platform?: string;
  campaignName?: string;
  externalUrl?: string;
};

function buildUrgentActions(
  campaigns: any[],
  breakevenRoas: number,
  totalSpend: number
): UrgentAction[] {
  const actions: UrgentAction[] = [];
  if (!Array.isArray(campaigns) || campaigns.length === 0) return actions;

  const beTarget = breakevenRoas > 0 ? breakevenRoas : 1.5;
  const active = campaigns.filter((c) => (c.spend || 0) > 0);
  if (active.length === 0) return actions;

  const avgSpend = totalSpend / Math.max(active.length, 1);
  const avgCpc = active.reduce((s, c) => s + (c.cpc || 0), 0) / active.length;
  const avgCtr = active.reduce((s, c) => s + (c.ctr || 0), 0) / active.length;

  /* 1) KILL — claramente bajo break-even (umbral más permisivo: $300+) */
  const losers = active
    .filter((c) => (c.roas || 0) < beTarget * 0.75 && c.spend >= 300)
    .sort((a, b) => b.spend - a.spend);

  if (losers.length > 0) {
    const worst = losers[0];
    const wasted = Math.max(0, worst.spend - (worst.conversionValue || 0) / Math.max(beTarget, 0.01));
    actions.push({
      kind: "kill",
      title: `Pausá "${worst.name}"`,
      whyHuman: `Gasta mucho y casi no recupera. Es la campaña que más plata te está quemando.`,
      whyTech: `Spend ${formatARS(worst.spend)} · ROAS ${(worst.roas || 0).toFixed(2)}x (BE ${beTarget.toFixed(2)}x) · ${worst.conversions || 0} conv · CPA ${worst.conversions > 0 ? formatARS(worst.spend / worst.conversions) : "—"}`,
      impactArs: wasted,
      impactLabel: `Ahorro ~${formatCompact(wasted)}`,
      ctaLabel: "Pausar en la plataforma",
      platform: worst.platform,
      campaignName: worst.name,
    });
  }

  /* 2) SCALE — ROAS >= BE * 1.3 + conv >= 1 (criterios más realistas) */
  const scalers = active
    .filter((c) => (c.roas || 0) >= beTarget * 1.3 && (c.conversions || 0) >= 1 && c.spend < avgSpend * 2.5)
    .sort((a, b) => (b.roas || 0) - (a.roas || 0));

  if (scalers.length > 0) {
    const best = scalers[0];
    const extraRev = best.spend * 0.3 * (best.roas || 0);
    actions.push({
      kind: "scale",
      title: `Subí +30% el presupuesto de "${best.name}"`,
      whyHuman: `Esta campaña rinde muy bien. Le queda aire para crecer sin perder eficiencia.`,
      whyTech: `ROAS ${(best.roas || 0).toFixed(2)}x (${((best.roas || 0) / beTarget).toFixed(1)}× BE) · ${best.conversions} conv · Spend ${formatARS(best.spend)} · CTR ${(best.ctr || 0).toFixed(2)}%`,
      impactArs: extraRev,
      impactLabel: `Ingreso extra ~${formatCompact(extraRev)}`,
      ctaLabel: "Subir presupuesto",
      platform: best.platform,
      campaignName: best.name,
    });
  }

  /* 3) RESCUE — cerca del break-even (entre BE*0.75 y BE). Probar antes de matar */
  const rescuers = active
    .filter((c) => (c.roas || 0) >= beTarget * 0.75 && (c.roas || 0) < beTarget && c.spend >= 200)
    .sort((a, b) => b.spend - a.spend);

  if (rescuers.length > 0) {
    const r = rescuers[0];
    const gap = (beTarget - (r.roas || 0)) * r.spend; // gap en revenue si llegáramos a BE
    actions.push({
      kind: "rescue",
      title: `Optimizá "${r.name}" antes de pausarla`,
      whyHuman: `Está cerca de ser rentable. Tocando audiencia o bid podría pasar el equilibrio.`,
      whyTech: `ROAS ${(r.roas || 0).toFixed(2)}x · BE ${beTarget.toFixed(2)}x (gap ${(beTarget - (r.roas || 0)).toFixed(2)}x) · Spend ${formatARS(r.spend)} · ${r.conversions || 0} conv`,
      impactArs: gap,
      impactLabel: `Recuperar ~${formatCompact(gap)}`,
      ctaLabel: "Ajustar puja/audiencia",
      platform: r.platform,
      campaignName: r.name,
    });
  }

  /* 4) BID — CPC desproporcionado (más caro que el promedio del mix) */
  const bidIssues = active
    .filter((c) => avgCpc > 0 && (c.cpc || 0) > avgCpc * 2 && c.spend >= 200)
    .sort((a, b) => (b.cpc || 0) - (a.cpc || 0));

  if (bidIssues.length > 0) {
    const b = bidIssues[0];
    const overpay = (b.cpc - avgCpc) * (b.clicks || 0);
    actions.push({
      kind: "bid",
      title: `Bajá la puja en "${b.name}"`,
      whyHuman: `Cada click te sale el doble que el promedio. Estás pagando de más por audiencia que podés conseguir más barata.`,
      whyTech: `CPC ${formatARS(b.cpc)} vs avg ${formatARS(avgCpc)} (${(b.cpc / Math.max(avgCpc, 0.01)).toFixed(1)}×) · ${b.clicks || 0} clicks · Spend ${formatARS(b.spend)}`,
      impactArs: Math.max(0, overpay),
      impactLabel: `Ahorro ~${formatCompact(Math.max(0, overpay))}`,
      ctaLabel: "Revisar puja máx.",
      platform: b.platform,
      campaignName: b.name,
    });
  }

  /* 5) CREATIVE — CTR muy por debajo del promedio + impressions altas = fatiga */
  const creativeIssues = active
    .filter((c) => avgCtr > 0 && (c.ctr || 0) < avgCtr * 0.5 && (c.impressions || 0) > 5000)
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0));

  if (creativeIssues.length > 0) {
    const c = creativeIssues[0];
    // Si el CTR fuese el promedio, cuántos clicks extra → revenue extra
    const expectedClicks = ((c.impressions || 0) * avgCtr) / 100;
    const lostRev = Math.max(0, expectedClicks - (c.clicks || 0)) * (c.cpc || 0) * (c.roas || 0);
    actions.push({
      kind: "creative",
      title: `Refrescá los creativos de "${c.name}"`,
      whyHuman: `La gente la ve mucho pero no clickea. El creativo está cansado o no le habla a la audiencia.`,
      whyTech: `CTR ${(c.ctr || 0).toFixed(2)}% vs avg ${avgCtr.toFixed(2)}% · ${formatCompact(c.impressions)} impresiones · ${c.clicks || 0} clicks`,
      impactArs: lostRev,
      impactLabel: `Recuperar ~${formatCompact(lostRev)}`,
      ctaLabel: "Subir creativos nuevos",
      platform: c.platform,
      campaignName: c.name,
    });
  }

  /* 6) CONSOLIDATED — varios losers menores juntos */
  if (losers.length >= 3) {
    const totalWasted = losers.reduce(
      (s, c) => s + Math.max(0, c.spend - (c.conversionValue || 0) / Math.max(beTarget, 0.01)),
      0
    );
    actions.push({
      kind: "consolidated",
      title: `Revisá ${losers.length} campañas por debajo del break-even`,
      whyHuman: `Hay varias campañas quemando plata al mismo tiempo. Juntarlas te da el mayor ahorro del día.`,
      whyTech: `${losers.length} camp. < ${beTarget.toFixed(2)}x · Spend total ${formatCompact(losers.reduce((s, c) => s + c.spend, 0))} · Rev ${formatCompact(losers.reduce((s, c) => s + (c.conversionValue || 0), 0))}`,
      impactArs: totalWasted,
      impactLabel: `Ahorro potencial ~${formatCompact(totalWasted)}`,
      ctaLabel: "Ver lista completa",
    });
  }

  /* Ranking por impacto $$, hasta 6 */
  return actions.sort((a, b) => b.impactArs - a.impactArs).slice(0, 6);
}

function UrgentActionCard({ action }: { action: UrgentAction }) {
  const [copied, setCopied] = useState(false);

  const styleByKind: Record<string, {
    ring: string; chipBg: string; chipText: string; iconBg: string;
    Icon: any; label: string; accent: string;
  }> = {
    kill: {
      ring: "ring-red-200", chipBg: "bg-red-100", chipText: "text-red-800",
      iconBg: "bg-red-100 text-red-600", Icon: Scissors, label: "Cortar gasto", accent: "text-red-700",
    },
    scale: {
      ring: "ring-emerald-200", chipBg: "bg-emerald-100", chipText: "text-emerald-800",
      iconBg: "bg-emerald-100 text-emerald-600", Icon: Rocket, label: "Escalar", accent: "text-emerald-700",
    },
    rescue: {
      ring: "ring-amber-200", chipBg: "bg-amber-100", chipText: "text-amber-800",
      iconBg: "bg-amber-100 text-amber-600", Icon: ShieldCheck, label: "Rescatar", accent: "text-amber-700",
    },
    bid: {
      ring: "ring-cyan-200", chipBg: "bg-cyan-100", chipText: "text-cyan-800",
      iconBg: "bg-cyan-100 text-cyan-600", Icon: Gauge, label: "Ajustar puja", accent: "text-cyan-700",
    },
    creative: {
      ring: "ring-purple-200", chipBg: "bg-purple-100", chipText: "text-purple-800",
      iconBg: "bg-purple-100 text-purple-600", Icon: Sparkles, label: "Nuevo creativo", accent: "text-purple-700",
    },
    consolidated: {
      ring: "ring-orange-200", chipBg: "bg-orange-100", chipText: "text-orange-800",
      iconBg: "bg-orange-100 text-orange-600", Icon: Flame, label: "Revisión grupal", accent: "text-orange-700",
    },
    // Backward compat: si llega "fix" antiguo
    fix: {
      ring: "ring-amber-200", chipBg: "bg-amber-100", chipText: "text-amber-800",
      iconBg: "bg-amber-100 text-amber-600", Icon: Flame, label: "Revisar", accent: "text-amber-700",
    },
  };

  const s = styleByKind[action.kind];
  const Icon = s.Icon;

  const copyRecommendation = async () => {
    const text = `${action.title}\n\n${action.whyHuman}\n\nDatos: ${action.whyTech}\n${action.impactLabel}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  return (
    <div className={`relative bg-white rounded-2xl shadow-sm ring-1 ${s.ring} p-5 flex flex-col gap-3 overflow-hidden`}>
      {/* Top: Label + Icon */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-xl ${s.iconBg}`}>
            <Icon size={16} />
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${s.chipBg} ${s.chipText}`}>
            {s.label}
          </span>
        </div>
        {action.platform && (
          <PlatformBadge platform={action.platform} />
        )}
      </div>

      {/* Title (human-first) */}
      <div>
        <h3 className="text-[15px] font-bold text-slate-900 leading-snug line-clamp-2">{action.title}</h3>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{action.whyHuman}</p>
      </div>

      {/* Tech line — siempre visible para el que quiere el dato */}
      <p className="text-[11px] text-slate-500 font-mono tabular-nums bg-slate-50 rounded-lg px-2 py-1.5 leading-snug">
        {action.whyTech}
      </p>

      {/* Impact + CTA */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Impacto</p>
          <p className={`text-sm font-bold tabular-nums ${s.accent}`}>{action.impactLabel}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={copyRecommendation}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors"
            title="Copiar recomendación"
          >
            {copied ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function UrgentActionsBlock({ actions }: { actions: UrgentAction[] }) {
  if (!actions || actions.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-emerald-200 p-6 ns-fade-up">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={16} />
          </div>
          <h3 className="font-semibold text-slate-900">Sin acciones urgentes hoy</h3>
          <span className="relative flex w-2 h-2 ml-1">
            <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 ns-pulse-halo" />
            <span className="relative rounded-full w-2 h-2 bg-emerald-500" />
          </span>
        </div>
        <p className="text-sm text-slate-500">
          No detectamos campañas quemando plata ni oportunidades obvias de escalar en este período.
          Probá ampliar el rango de fechas o revisar manualmente en Meta Ads y Google Ads.
        </p>
      </div>
    );
  }
  const totalImpact = actions.reduce((s, a) => s + (a.impactArs || 0), 0);
  return (
    <div className="ns-fade-up">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900 text-white text-[10px] font-bold uppercase tracking-[0.14em]">
            <Flame size={10} className="text-orange-300" />
            {actions.length} {actions.length === 1 ? "Acción urgente" : "Acciones urgentes"}
          </span>
          <span className="text-[11px] text-slate-500">
            priorizadas por impacto en $ · impacto total estimado <span className="font-semibold text-slate-700">~{formatCompact(totalImpact)}</span>
          </span>
          <Tooltip text="Detectamos automáticamente: campañas perdiendo plata (kill), oportunidades de escalar (scale), campañas a salvar antes de pausar (rescue), pujas demasiado caras (bid), creativos cansados con CTR bajo (creative), y revisiones grupales si hay varias en pérdida." />
        </div>
        <span className="text-[10px] text-slate-400 inline-flex items-center gap-1">
          <Activity size={10} />
          Se recalculan con cada cambio de fecha o sync de datos
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {actions.map((a, i) => (
          <div key={i} style={{ animationDelay: `${i * 60}ms` }} className="ns-fade-up">
            <UrgentActionCard action={a} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Tooltip (explicaciones para no-técnicos) ──────── */
// Hover sobre el ícono Info muestra la explicación. Premium feel.

function Tooltip({ text, side = "top" }: { text: string; side?: "top" | "bottom" }) {
  return (
    <span className="relative group/tt inline-flex items-center">
      <Info size={11} className="text-slate-400 hover:text-slate-700 cursor-help transition-colors" />
      <span
        className={`pointer-events-none absolute z-50 left-1/2 -translate-x-1/2 ${side === "top" ? "bottom-full mb-2" : "top-full mt-2"} w-64 rounded-lg bg-slate-900 text-white text-[11px] leading-snug px-3 py-2 shadow-xl opacity-0 invisible group-hover/tt:opacity-100 group-hover/tt:visible transition-all duration-150 ring-1 ring-slate-700`}
      >
        {text}
        <span className={`absolute left-1/2 -translate-x-1/2 ${side === "top" ? "top-full" : "bottom-full"} w-0 h-0 border-x-4 border-x-transparent ${side === "top" ? "border-t-4 border-t-slate-900" : "border-b-4 border-b-slate-900"}`} />
      </span>
    </span>
  );
}

/* ── Mix Health (TOF/MOF/BOF) ──────────────────────── */

function MixHealthPanel({ funnelSummary, totalSpend }: { funnelSummary: any[]; totalSpend: number }) {
  if (!Array.isArray(funnelSummary) || funnelSummary.length === 0 || totalSpend <= 0) return null;

  const tof = funnelSummary.find((s) => s.stage === "TOF");
  const mof = funnelSummary.find((s) => s.stage === "MOF");
  const bof = funnelSummary.find((s) => s.stage === "BOF");
  const unknown = funnelSummary.find((s) => s.stage === "UNKNOWN");

  const stages = [
    { key: "TOF", label: "TOF", sub: "Nuevos (prospecting)", data: tof, color: "bg-indigo-500", text: "text-indigo-700", bg: "bg-indigo-50", help: "Top of Funnel · Audiencias frías que no te conocen. Buscás darte a conocer." },
    { key: "MOF", label: "MOF", sub: "Consideración", data: mof, color: "bg-cyan-500", text: "text-cyan-700", bg: "bg-cyan-50", help: "Middle of Funnel · Gente que te visitó pero no compró. Buscás convencerlos." },
    { key: "BOF", label: "BOF", sub: "Retargeting / Marca", data: bof, color: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", help: "Bottom of Funnel · Carrito abandonado, recompra, marca. Cosechás ventas." },
    { key: "UNKNOWN", label: "S/C", sub: "Sin clasificar", data: unknown, color: "bg-slate-400", text: "text-slate-600", bg: "bg-slate-100", help: "Campañas que no tienen TOF/MOF/BOF en el nombre. Renombralas en Meta/Google para clasificarlas." },
  ];

  // Divisor REAL = suma de spend de los stages presentes. Así los % siempre suman 100.
  const stageSpendTotal = stages.reduce((acc, s) => acc + (s.data?.spend || 0), 0) || totalSpend;

  const visibleStages = stages.filter((s) => s.data && s.data.spend > 0);
  const showUnknownTile = !!unknown && unknown.spend > 0;

  const bofShare = bof ? (bof.spend / stageSpendTotal) * 100 : 0;
  const tofShare = tof ? (tof.spend / stageSpendTotal) * 100 : 0;
  const unclassifiedShare = unknown ? (unknown.spend / stageSpendTotal) * 100 : 0;

  let warning: { tone: "warn" | "ok" | "info"; msg: string } | null = null;
  if (unclassifiedShare > 50) {
    warning = {
      tone: "info",
      msg: `${unclassifiedShare.toFixed(0)}% del gasto está sin clasificar. Renombrá las campañas en Meta/Google con TOF/MOF/BOF para que el análisis sea más preciso.`,
    };
  } else if (bofShare > 60) {
    warning = {
      tone: "warn",
      msg: `${bofShare.toFixed(0)}% va a retargeting/marca. Estás cosechando, no cazando — si se seca el TOF, se seca la venta a futuro.`,
    };
  } else if (tofShare < 20 && tof) {
    warning = {
      tone: "warn",
      msg: `Solo ${tofShare.toFixed(0)}% va a prospecting. Sin audiencia nueva entrando, no hay crecimiento sostenible.`,
    };
  } else if (unclassifiedShare > 30) {
    warning = {
      tone: "info",
      msg: `${unclassifiedShare.toFixed(0)}% sin clasificar. Ajustá el naming (TOF/MOF/BOF) en Meta/Google.`,
    };
  } else {
    warning = {
      tone: "ok",
      msg: "Mix balanceado entre prospecting y retargeting.",
    };
  }

  const warnBg = warning.tone === "warn" ? "bg-amber-50 text-amber-800 ring-amber-200"
    : warning.tone === "info" ? "bg-slate-50 text-slate-700 ring-slate-200"
    : "bg-emerald-50 text-emerald-800 ring-emerald-200";
  const warnIcon = warning.tone === "warn" ? AlertTriangle : warning.tone === "info" ? Info : ShieldCheck;
  const WIcon = warnIcon;

  // Stages a mostrar en tiles: si hay UNKNOWN > 0, 4 columnas; sino 3
  const tilesToShow = showUnknownTile ? stages : stages.slice(0, 3);
  const gridCols = showUnknownTile ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3";

  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5 ns-fade-up">
      <div className="flex items-center gap-2 mb-4">
        <Layers size={16} className="text-indigo-600" />
        <h3 className="font-semibold text-slate-900">Salud del Mix de Inversión</h3>
        <Tooltip text="TOF (frío) → MOF (consideración) → BOF (cierre). Un mix sano tiene ~30-40% TOF, ~10-20% MOF, ~40-50% BOF. Si todo va a BOF, no hay nuevos clientes entrando." />
        <span className="text-xs text-slate-400 ml-auto">Auto-clasificado por nombre de campaña</span>
      </div>

      {/* Barra apilada — SIEMPRE 100% (sin huecos grises) */}
      <div className="relative h-3 rounded-full overflow-hidden mb-3 ring-1 ring-slate-200 flex">
        {visibleStages.map((st) => {
          const pct = (st.data!.spend / stageSpendTotal) * 100;
          return (
            <div
              key={st.key}
              className={`${st.color} h-full transition-all ns-bar-fill`}
              style={{ width: `${pct}%` }}
              title={`${st.label}: ${pct.toFixed(1)}% · ${formatCompact(st.data!.spend)}`}
            />
          );
        })}
      </div>

      {/* Tiles por stage */}
      <div className={`grid ${gridCols} gap-3 mt-4`}>
        {tilesToShow.map((st) => {
          const pct = st.data ? (st.data.spend / stageSpendTotal) * 100 : 0;
          const hasData = !!st.data && st.data.spend > 0;
          return (
            <div key={st.key} className={`rounded-xl p-3 ring-1 ring-slate-100 ${hasData ? st.bg : "bg-slate-50"}`}>
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${hasData ? st.text : "text-slate-400"}`}>
                  {st.label}
                  <Tooltip text={st.help} />
                </span>
                <span className={`text-[10px] font-semibold tabular-nums ${hasData ? "text-slate-700" : "text-slate-400"}`}>
                  {pct.toFixed(0)}%
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">{st.sub}</p>
              <p className={`text-sm font-bold tabular-nums mt-1 ${hasData ? "text-slate-900" : "text-slate-400"}`}>
                {hasData ? formatCompact(st.data!.spend) : "--"}
              </p>
              <p className="text-[10px] text-slate-500 font-mono tabular-nums mt-0.5">
                {hasData ? `ROAS ${st.data!.roas}x · ${st.data!.conversions} conv` : "sin inversión"}
              </p>
            </div>
          );
        })}
      </div>

      {/* Alerta contextual */}
      <div className={`mt-4 rounded-xl px-3 py-2 ring-1 ${warnBg} flex items-start gap-2`}>
        <WIcon size={14} className="flex-shrink-0 mt-0.5" />
        <p className="text-[12px] leading-snug">{warning.msg}</p>
      </div>
    </div>
  );
}

/* ── Premium KPI Card (Hoy) ────────────────────────── */

function PremiumKpi({
  label, value, subtitle, deltaPct, accent = "indigo", delay = 0, healthy = false, help,
}: {
  label: string; value: string; subtitle?: string | null; deltaPct?: number | null;
  accent?: "indigo" | "emerald" | "red" | "amber" | "cyan" | "purple" | "blue";
  delay?: number;
  healthy?: boolean; // true = pulso verde (todo está OK)
  help?: string;     // tooltip explicativo
}) {
  const accents: Record<string, { bar: string; chipBg: string; chipText: string; glow: string }> = {
    indigo:  { bar: "bg-indigo-500",  chipBg: "bg-indigo-50",  chipText: "text-indigo-700",  glow: "from-indigo-400/15" },
    emerald: { bar: "bg-emerald-500", chipBg: "bg-emerald-50", chipText: "text-emerald-700", glow: "from-emerald-400/15" },
    red:     { bar: "bg-red-500",     chipBg: "bg-red-50",     chipText: "text-red-700",     glow: "from-red-400/15" },
    amber:   { bar: "bg-amber-500",   chipBg: "bg-amber-50",   chipText: "text-amber-700",   glow: "from-amber-400/15" },
    cyan:    { bar: "bg-cyan-500",    chipBg: "bg-cyan-50",    chipText: "text-cyan-700",    glow: "from-cyan-400/15" },
    purple:  { bar: "bg-purple-500",  chipBg: "bg-purple-50",  chipText: "text-purple-700",  glow: "from-purple-400/15" },
    blue:    { bar: "bg-blue-500",    chipBg: "bg-blue-50",    chipText: "text-blue-700",    glow: "from-blue-400/15" },
  };
  const a = accents[accent];
  const hasDelta = typeof deltaPct === "number" && deltaPct !== 0;
  const deltaUp = (deltaPct || 0) >= 0;

  return (
    <div
      className="group relative bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/80 p-5 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ns-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${a.bar}`} />
      {/* Soft glow */}
      <div className={`pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${a.glow} to-transparent blur-2xl opacity-70 group-hover:opacity-100 transition-opacity`} />

      <div className="relative">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          {help && <Tooltip text={help} />}
          {healthy && (
            <span className="relative flex w-1.5 h-1.5" title="Saludable">
              <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 ns-pulse-halo" />
              <span className="relative rounded-full w-1.5 h-1.5 bg-emerald-500" />
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2 mt-1.5">
          <p className="text-[28px] font-bold text-slate-900 tabular-nums leading-none">{value}</p>
          {hasDelta && (
            <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${deltaUp ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {deltaUp ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
              {Math.abs(deltaPct!).toFixed(1)}%
            </span>
          )}
        </div>
        {subtitle && <p className="text-[11px] text-slate-500 mt-1.5 tabular-nums">{subtitle}</p>}
      </div>
    </div>
  );
}

/* ── Premium KPI Gauge (Blended ROAS) ──────────────── */
// Variante del KPI con micro-gauge horizontal mostrando ROAS vs Break-even.
// Solo usar para Blended ROAS (donde la comparación contra BE es clave).

function PremiumKpiGauge({
  label, roas, breakeven, contribMargin, delay = 0,
}: { label: string; roas: number; breakeven: number; contribMargin: number; delay?: number }) {
  const hasBE = breakeven > 0;
  const target = hasBE ? breakeven * 2 : 4;
  const roasPct = Math.min(100, (roas / target) * 100);
  const bePct = hasBE ? Math.min(100, (breakeven / target) * 100) : 50;

  let status: "good" | "edge" | "bad";
  if (!hasBE) status = roas >= 2 ? "good" : roas >= 1 ? "edge" : "bad";
  else status = roas >= breakeven * 1.2 ? "good" : roas >= breakeven ? "edge" : "bad";

  const cfg = status === "good"
    ? { bar: "bg-emerald-500", text: "text-emerald-700", chip: "bg-emerald-50 text-emerald-700", glow: "from-emerald-400/15", barColor: "linear-gradient(90deg, #10b981 0%, #059669 100%)", msg: "rentable" }
    : status === "edge"
    ? { bar: "bg-amber-500", text: "text-amber-700", chip: "bg-amber-50 text-amber-700", glow: "from-amber-400/15", barColor: "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)", msg: "en equilibrio" }
    : { bar: "bg-red-500", text: "text-red-700", chip: "bg-red-50 text-red-700", glow: "from-red-400/15", barColor: "linear-gradient(90deg, #ef4444 0%, #dc2626 100%)", msg: "perdiendo" };

  const multiple = hasBE && breakeven > 0 ? (roas / breakeven) : null;

  return (
    <div
      className="group relative bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/80 p-5 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ns-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${cfg.bar}`} />
      <div className={`pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${cfg.glow} to-transparent blur-2xl opacity-70 group-hover:opacity-100 transition-opacity`} />

      <div className="relative">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <Tooltip text="Blended ROAS = Revenue VTEX / Inversión total en ads. A diferencia del ROAS reportado por las plataformas, este NO depende de ventanas de atribución: es la verdad cruda de cuántos pesos de venta generaste por cada peso invertido." />
          {status === "good" && (
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 ns-pulse-halo" />
              <span className="relative rounded-full w-1.5 h-1.5 bg-emerald-500" />
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-2 mt-1.5">
          <p className="text-[28px] font-bold text-slate-900 tabular-nums leading-none">{roas.toFixed(2)}<span className="text-[18px] text-slate-400">x</span></p>
          {multiple != null && (
            <span className={`inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${cfg.chip}`}>
              {multiple.toFixed(2)}× BE
            </span>
          )}
        </div>

        {/* Mini gauge horizontal */}
        <div className="mt-3 relative">
          <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden ring-1 ring-slate-200">
            <div
              className="relative h-full rounded-full ns-bar-fill overflow-hidden"
              style={{ width: `${roasPct}%`, background: cfg.barColor }}
            >
              <span className="absolute inset-0 ns-shimmer" />
            </div>
            {hasBE && (
              <div className="absolute inset-y-0 w-0.5 bg-slate-900/70" style={{ left: `${bePct}%` }} />
            )}
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-500 tabular-nums">
            <span>0x</span>
            {hasBE && (
              <span className="absolute font-semibold text-slate-700" style={{ left: `${bePct}%`, transform: "translateX(-50%)" }}>
                BE {breakeven.toFixed(2)}x
              </span>
            )}
            <span>{target.toFixed(0)}x</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 mt-3 tabular-nums">
          Margen de contribución <span className="font-semibold text-slate-700">{(contribMargin * 100).toFixed(0)}%</span> · {cfg.msg}
        </p>
      </div>
    </div>
  );
}

/* ── Premium Platform Card ─────────────────────────── */

function PlatformPremiumCard({
  platform, data, breakevenRoas, delay = 0,
}: { platform: "META" | "GOOGLE"; data: any; breakevenRoas: number; delay?: number }) {
  const cfg = platform === "META"
    ? { label: "Meta Ads", color: "#8b5cf6", from: "from-purple-500/10", ring: "ring-purple-100", dot: "bg-purple-500" }
    : { label: "Google Ads", color: "#3b82f6", from: "from-blue-500/10", ring: "ring-blue-100", dot: "bg-blue-500" };

  const roas = Number(data?.roas || 0);
  const spend = Number(data?.spend || 0);
  const revenue = Number(data?.conversionValue || 0);
  const conv = Number(data?.conversions || 0);
  const ctr = Number(data?.ctr || 0);
  const cpc = Number(data?.cpc || 0);
  const convRate = Number(data?.convRate || 0);

  let statusLabel = "Sin datos";
  let statusChip = "bg-slate-100 text-slate-600";
  let isHealthy = false;
  if (breakevenRoas > 0 && spend > 0) {
    if (roas >= breakevenRoas * 1.5) { statusLabel = "Rentable"; statusChip = "bg-emerald-100 text-emerald-800"; isHealthy = true; }
    else if (roas >= breakevenRoas)  { statusLabel = "En equilibrio"; statusChip = "bg-amber-100 text-amber-800"; }
    else                              { statusLabel = "Perdiendo"; statusChip = "bg-red-100 text-red-800"; }
  } else if (spend > 0) {
    isHealthy = roas >= 2;
    statusLabel = roas >= 2 ? "Rentable" : roas >= 1 ? "En equilibrio" : "Perdiendo";
    statusChip = roas >= 2 ? "bg-emerald-100 text-emerald-800" : roas >= 1 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";
  }

  const target = breakevenRoas > 0 ? breakevenRoas * 2 : 4;
  const roasPct = Math.min(100, (roas / target) * 100);
  const bePct = breakevenRoas > 0 ? Math.min(100, (breakevenRoas / target) * 100) : 50;

  return (
    <div
      className="group relative bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/80 p-5 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ns-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full bg-gradient-to-br ${cfg.from} to-transparent blur-3xl`} />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ring-4 ring-offset-0 ring-current/10`} style={{ color: cfg.color }} />
            <div>
              <h3 className="font-bold text-slate-900 text-[15px] leading-none">{cfg.label}</h3>
              <p className="text-[11px] text-slate-500 mt-1">{data?.campaigns || 0} campañas · {formatCompact(spend)} inv.</p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusChip}`}>
            {isHealthy && (
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 ns-pulse-halo" />
                <span className="relative rounded-full w-1.5 h-1.5 bg-emerald-500" />
              </span>
            )}
            {statusLabel}
          </span>
        </div>

        {/* Big ROAS */}
        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">ROAS reportado</p>
              <Tooltip text={`ROAS reportado = Revenue atribuido / Inversión, según ${platform === "META" ? "Meta" : "Google"}. La plataforma cuenta las ventas que ELLA cree haber generado. Si está alto pero el Blended ROAS está bajo, hay sobre-atribución.`} />
            </div>
            <p className="text-[40px] font-bold text-slate-900 tabular-nums leading-none mt-1">{roas.toFixed(2)}<span className="text-[22px] text-slate-400">x</span></p>
            {breakevenRoas > 0 && (
              <p className="text-[11px] text-slate-500 mt-1.5 tabular-nums">vs BE {breakevenRoas.toFixed(2)}x · {((roas / breakevenRoas) || 0).toFixed(1)}× del punto de equilibrio</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Revenue atrib.</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums mt-1">{formatCompact(revenue)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">{conv} conv.</p>
          </div>
        </div>

        {/* Gauge */}
        <div className="mt-5">
          <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden ring-1 ring-slate-200">
            <div
              className="relative h-full rounded-full transition-all duration-1000 ns-bar-fill overflow-hidden"
              style={{ width: `${roasPct}%`, background: cfg.color }}
            >
              <span className="absolute inset-0 ns-shimmer" />
            </div>
            {breakevenRoas > 0 && (
              <div className="absolute inset-y-0 w-0.5 bg-slate-900/70" style={{ left: `${bePct}%` }} />
            )}
          </div>
        </div>

        {/* Mini metrics */}
        <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="inline-flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
              CTR <Tooltip text="Click-Through Rate = Clicks / Impresiones. Qué porcentaje de personas que vieron el ad lo clickearon. Benchmark sano: >1% en Meta, >2% en Google Search." />
            </p>
            <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">{ctr.toFixed(2)}%</p>
          </div>
          <div>
            <p className="inline-flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
              CPC <Tooltip text="Cost Per Click = Cuánto pagás en promedio por cada click. Si está muy alto vs tus competidores, estás pujando de más o tu Quality Score es bajo." />
            </p>
            <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">{formatARS(cpc)}</p>
          </div>
          <div>
            <p className="inline-flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
              Conv. Rate <Tooltip text="Conversion Rate = Conversiones / Clicks. De los que clickean, cuántos terminan comprando. Si está muy bajo, el problema es la landing page o el producto, no el ad." />
            </p>
            <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">{convRate.toFixed(2)}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ────────────────────────────────── */

export default function CampaignsPage() {
  const [data, setData] = useState<any>(null);
  const [pnl, setPnl] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("ALL");
  const [sortField, setSortField] = useState("spend");
  const [sortAsc, setSortAsc] = useState(false);
  const [chartMode, setChartMode] = useState<"spend" | "roas">("roas");

  // Date range
  const [dateFrom, setDateFrom] = useState(toDateInputValue(new Date(Date.now() - 30 * 86400000)));
  const [dateTo, setDateTo] = useState(toDateInputValue(new Date()));
  const [activeQuickRange, setActiveQuickRange] = useState<number | null>(30);

  /* ── Fetch ─────────────────────────────────────── */
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/metrics/campaigns?from=${dateFrom}&to=${dateTo}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/metrics/pnl?from=${dateFrom}&to=${dateTo}`).then((r) => r.json()).catch(() => null),
    ])
      .then(([campaigns, pnlData]) => {
        setData(campaigns);
        setPnl(pnlData);
      })
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
  const funnelSummary = data?.funnelSummary || [];

  // ── Break-even calculation from P&L (solo VTEX, tienda directa) ──
  // Motivo: los ads mandan trafico a VTEX. MELI es marketplace organico aparte.
  const pnlSummary = pnl?.summary || {};
  const pnlBySource: any[] = Array.isArray(pnl?.bySource) ? pnl.bySource : [];
  const vtexSource = pnlBySource.find((x) => x.source === "VTEX");
  const totalRevenueAllSources = Number(pnlSummary.revenue || 0);

  const useVtex = Number(vtexSource?.revenue || 0) > 0;
  const realRevenue = useVtex ? Number(vtexSource.revenue) : totalRevenueAllSources;
  const realCogs = useVtex ? Number(vtexSource.cogs || 0) : Number(pnlSummary.cogs || 0);
  const realShipping = useVtex ? Number(vtexSource.shipping || 0) : Number(pnlSummary.shipping || 0);
  const realPlatformFees = useVtex ? Number(vtexSource.platformFee || 0) : Number(pnlSummary.platformFees || 0);
  const totalPaymentFees = Number(pnlSummary.paymentFees || 0);
  const realPaymentFees = useVtex && totalRevenueAllSources > 0
    ? totalPaymentFees * (Number(vtexSource.revenue) / totalRevenueAllSources)
    : totalPaymentFees;

  // Contribution margin pre-ads = (Revenue - COGS - Shipping - PlatformFees - PaymentFees) / Revenue
  const contributionProfit = realRevenue - realCogs - realShipping - realPlatformFees - realPaymentFees;
  const contributionMargin = realRevenue > 0 ? contributionProfit / realRevenue : 0;
  const breakevenRoas = contributionMargin > 0 ? 1 / contributionMargin : 0;

  // Revenue MELI (para mostrar aparte como "no atribuible a ads")
  const meliSource = pnlBySource.find((x) => x.source === "MELI");
  const meliRevenue = Number(meliSource?.revenue || 0);

  // Blended ROAS = Revenue real / Ad spend
  const adSpendTotal = Number(totals.spend || 0);
  const blendedRoas = adSpendTotal > 0 ? realRevenue / adSpendTotal : 0;
  const attributedRevenue = Number(totals.conversionValue || 0);
  const attributedRoas = adSpendTotal > 0 ? attributedRevenue / adSpendTotal : 0;

  // MER (Marketing Efficiency Ratio) = Real revenue / Ad spend (same as Blended ROAS here)
  const mer = blendedRoas;

  // nCAC estimate = Ad spend / New customers (approx. = conversions)
  const totalConv = Number(totals.conversions || 0);
  const nCAC = totalConv > 0 ? adSpendTotal / totalConv : 0;

  // Urgent actions (derivadas 100% de datos ya cargados)
  const urgentActions = useMemo(
    () => buildUrgentActions(campaigns, breakevenRoas, adSpendTotal),
    [campaigns, breakevenRoas, adSpendTotal]
  );

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

  const globalCtr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : "0";
  const globalCpc = totals.clicks > 0 ? (totals.spend / totals.clicks).toFixed(0) : "0";
  const globalConvRate = totals.clicks > 0 ? ((totals.conversions / totals.clicks) * 100).toFixed(2) : "0";

  const googleCount = campaigns.filter((c: any) => c.platform === "GOOGLE").length;
  const metaCount = campaigns.filter((c: any) => c.platform === "META").length;

  // Daily ROAS with break-even reference
  const dailyRoasSeries = useMemo(() => {
    return dailyTrend.map((d: any) => {
      const totalSpend = d.META + d.GOOGLE + (d.TIKTOK || 0);
      return {
        date: d.date,
        roas: totalSpend > 0 ? Math.round((d.conversionValue / totalSpend) * 100) / 100 : 0,
        breakeven: breakevenRoas > 0 ? Math.round(breakevenRoas * 100) / 100 : null,
      };
    });
  }, [dailyTrend, breakevenRoas]);

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
        <span className="text-gray-500">Cargando Resumen...</span>
      </div>
    );
  }

  /* ── Render ────────────────────────────────────── */
  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header + Date Range */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-indigo-600 font-semibold">Marketing & Adquisicion</p>
          <h1 className="text-3xl font-bold text-gray-900">Resumen</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cockpit cross-platform &middot; {dateFrom} a {dateTo}
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

      {/* Acciones urgentes de hoy (lo primero que tiene que ver Tomy) */}
      <UrgentActionsBlock actions={urgentActions} />

      {/* Break-even Health Banner */}
      <BreakevenBanner
        blendedRoas={blendedRoas}
        breakevenRoas={breakevenRoas}
        contributionMargin={contributionMargin}
        adSpend={adSpendTotal}
        realRevenue={realRevenue}
      />

      {/* Salud del Mix TOF/MOF/BOF */}
      <MixHealthPanel funnelSummary={funnelSummary} totalSpend={adSpendTotal} />

      {/* Premium KPI Strip — solo los 4 numeros que importan hoy */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <PremiumKpi
          label="Inversión ads"
          value={formatCompact(adSpendTotal)}
          subtitle="Total gastado en Meta + Google"
          deltaPct={typeof changes.spend === "number" ? changes.spend : null}
          accent="red"
          delay={0}
          help="Suma del gasto en todas las plataformas de ads en este rango de fechas. No incluye fees de marketplaces (MELI)."
        />
        <PremiumKpi
          label="Revenue VTEX"
          value={formatCompact(realRevenue)}
          subtitle="Facturado en tu tienda"
          accent="emerald"
          delay={60}
          healthy={realRevenue > 0}
          help="Plata que entró a tu tienda VTEX en este período. Es lo REAL — no depende de pixels ni atribución de ads. Excluye MELI (es marketplace aparte)."
        />
        <PremiumKpiGauge
          label="Blended ROAS"
          roas={blendedRoas}
          breakeven={breakevenRoas}
          contribMargin={contributionMargin}
          delay={120}
        />
        <PremiumKpi
          label="nCAC estimado"
          value={nCAC > 0 ? formatARS(nCAC) : "--"}
          subtitle={`${totalConv} conversiones · CTR ${globalCtr}%`}
          accent="amber"
          delay={180}
          help="new Customer Acquisition Cost = Inversión en ads / Conversiones. Cuánto te cuesta adquirir un cliente nuevo en promedio. Tiene que ser menor al margen del primer pedido para ser rentable."
        />
      </div>

      {/* Plataformas — Meta vs Google lado a lado */}
      {platformSummary.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
              Plataformas
            </span>
            <span className="text-[11px] text-slate-400">— cuál está rindiendo mejor</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PlatformPremiumCard
              platform="META"
              data={platformSummary.find((p: any) => p.platform === "META") || { campaigns: 0, spend: 0, conversionValue: 0, conversions: 0, roas: 0, ctr: 0, cpc: 0, convRate: 0 }}
              breakevenRoas={breakevenRoas}
              delay={0}
            />
            <PlatformPremiumCard
              platform="GOOGLE"
              data={platformSummary.find((p: any) => p.platform === "GOOGLE") || { campaigns: 0, spend: 0, conversionValue: 0, conversions: 0, roas: 0, ctr: 0, cpc: 0, convRate: 0 }}
              breakevenRoas={breakevenRoas}
              delay={100}
            />
          </div>
        </div>
      )}

      {/* ⭐ HERO: Plataformas vs Realidad VTEX — el diferencial de NitroSales */}
      <DiscrepancyBlock
        attributedRevenue={attributedRevenue}
        vtexRevenue={realRevenue}
        adSpend={adSpendTotal}
      />

      {/* Chart único — ROAS diario vs Break-even */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/80 p-6 ns-fade-up">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="font-bold text-slate-900 text-[15px]">Tendencia de ROAS diario</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {breakevenRoas > 0
                ? `Línea punteada = Break-even ${breakevenRoas.toFixed(2)}x · Arriba es rentable.`
                : "Evolución del ROAS reportado por las plataformas."}
            </p>
          </div>
        </div>
        {dailyRoasSeries.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={dailyRoasSeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="roasGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}x`} width={40} />
              <RechartsTooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.08)", fontSize: 12 }}
                formatter={(v: number, n: string) => [`${v}x`, n === "roas" ? "ROAS" : "Break-even"]}
              />
              <Area type="monotone" dataKey="roas" stroke="#6366f1" strokeWidth={2.5} fill="url(#roasGradient)" dot={false} />
              {breakevenRoas > 0 && (
                <ReferenceLine y={breakevenRoas} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `BE ${breakevenRoas.toFixed(2)}x`, fill: "#ef4444", fontSize: 11, position: "insideTopRight" }} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[260px] flex items-center justify-center text-slate-400 text-sm">Sin datos de tendencia</div>
        )}
      </div>

      {/* Animations CSS — se inyecta una vez */}
      <style jsx global>{`
        @keyframes ns-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ns-fade-up {
          animation: ns-fade-up 450ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        /* Pulso verde titilando: halo que crece y se desvanece */
        @keyframes ns-pulse-halo {
          0%   { transform: scale(1);   opacity: 0.75; }
          70%  { transform: scale(2.2); opacity: 0;    }
          100% { transform: scale(2.2); opacity: 0;    }
        }
        .ns-pulse-halo {
          animation: ns-pulse-halo 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        /* Variante más sutil para dots pequeños */
        @keyframes ns-pulse-dot {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
          50%      { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);  }
        }
        .ns-pulse-dot {
          animation: ns-pulse-dot 1.8s ease-out infinite;
        }

        /* Shimmer: reflejo que pasa de izquierda a derecha sobre una barra */
        @keyframes ns-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%);  }
        }
        .ns-shimmer {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.55) 50%,
            transparent 100%
          );
          animation: ns-shimmer 2.4s ease-in-out infinite;
        }

        /* Barra que se llena al montar */
        @keyframes ns-bar-fill {
          from { transform: scaleX(0); transform-origin: left; }
          to   { transform: scaleX(1); transform-origin: left; }
        }
        .ns-bar-fill {
          animation: ns-bar-fill 900ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>
    </div>
  );
}
