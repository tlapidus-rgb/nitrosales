// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
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

  let status: "green" | "amber" | "red" | "gray" = "gray";
  let statusLabel = "Sin datos suficientes";
  let statusSub = "Cargá COGS y fees para calcular el break-even.";
  let Icon: any = Info;
  let bg = "from-slate-50 to-slate-100";
  let ring = "ring-slate-200";
  let chipBg = "bg-slate-100 text-slate-700";

  if (hasData) {
    if (blendedRoas >= breakevenRoas * 1.5) {
      status = "green";
      statusLabel = "Rentable con margen";
      statusSub = `Estas ganando ${(blendedRoas / breakevenRoas).toFixed(1)}x sobre el punto de equilibrio.`;
      Icon = ShieldCheck;
      bg = "from-emerald-50 to-green-50";
      ring = "ring-emerald-200";
      chipBg = "bg-emerald-100 text-emerald-800";
    } else if (blendedRoas >= breakevenRoas) {
      status = "amber";
      statusLabel = "En zona de equilibrio";
      statusSub = "Cubris costos pero hay poco margen. Optimizar creativos o bajar CPC.";
      Icon = Activity;
      bg = "from-amber-50 to-yellow-50";
      ring = "ring-amber-200";
      chipBg = "bg-amber-100 text-amber-800";
    } else {
      status = "red";
      const gap = ((breakevenRoas - blendedRoas) / breakevenRoas) * 100;
      statusLabel = "Perdiendo plata";
      statusSub = `Estas ${gap.toFixed(0)}% por debajo del break-even. Revisar ASAP.`;
      Icon = AlertTriangle;
      bg = "from-red-50 to-rose-50";
      ring = "ring-red-200";
      chipBg = "bg-red-100 text-red-800";
    }
  }

  const target = breakevenRoas || 3;
  const filledPct = Math.min(100, Math.max(0, (blendedRoas / (target * 2)) * 100));
  const breakevenPct = Math.min(100, (breakevenRoas / (target * 2)) * 100);

  return (
    <div className={`bg-gradient-to-br ${bg} rounded-2xl ring-1 ${ring} p-6 shadow-sm`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl ${chipBg}`}>
            <Icon size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${chipBg}`}>
                {statusLabel}
              </span>
              <span className="text-xs text-slate-500">Salud publicitaria</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1">
              {hasData ? (
                <>Blended ROAS VTEX <span className="tabular-nums">{blendedRoas.toFixed(2)}x</span> vs Break-even <span className="tabular-nums">{breakevenRoas.toFixed(2)}x</span></>
              ) : (
                "Break-even ROAS"
              )}
            </h2>
            <p className="text-sm text-slate-600 mt-0.5 max-w-xl">{statusSub}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-right">
          <div>
            <p className="text-[10px] uppercase text-slate-500 font-semibold">CM (VTEX)</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">
              {contributionMargin > 0 ? `${(contributionMargin * 100).toFixed(1)}%` : "--"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-slate-500 font-semibold">Inversion</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">{formatCompact(adSpend)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-slate-500 font-semibold">Revenue VTEX</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">{formatCompact(realRevenue)}</p>
          </div>
        </div>
      </div>

      {/* Break-even gauge */}
      <div className="mt-5">
        <div className="relative h-3 bg-white/60 rounded-full overflow-hidden ring-1 ring-slate-200">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all ${
              status === "green" ? "bg-emerald-500" :
              status === "amber" ? "bg-amber-500" :
              status === "red" ? "bg-red-500" : "bg-slate-300"
            }`}
            style={{ width: `${filledPct}%` }}
          />
          {hasData && (
            <div
              className="absolute inset-y-0 w-0.5 bg-slate-900"
              style={{ left: `${breakevenPct}%` }}
              title={`Break-even: ${breakevenRoas.toFixed(2)}x`}
            />
          )}
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-slate-500">
          <span>0x</span>
          <span>Break-even {hasData ? breakevenRoas.toFixed(2) : "--"}x</span>
          <span>{(target * 2).toFixed(1)}x</span>
        </div>
      </div>
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

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Scale size={16} className="text-indigo-600" />
        <h3 className="font-semibold text-gray-900">Plataformas vs Realidad (VTEX)</h3>
        <span className="text-xs text-gray-400 ml-auto">Brecha de atribucion · solo tienda directa</span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-purple-50 p-3">
          <p className="text-[10px] uppercase text-purple-700 font-semibold">Plataformas dicen</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums mt-1">{formatCompact(attributedRevenue)}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">ROAS reportado: <span className="font-medium">{attributedRoas.toFixed(2)}x</span></p>
        </div>
        <div className="rounded-lg bg-emerald-50 p-3">
          <p className="text-[10px] uppercase text-emerald-700 font-semibold">Realidad VTEX</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums mt-1">{formatCompact(vtexRevenue)}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Blended ROAS: <span className="font-medium">{blendedRoas.toFixed(2)}x</span></p>
        </div>
        <div className={`rounded-lg p-3 ${diff >= 0 ? "bg-blue-50" : "bg-red-50"}`}>
          <p className={`text-[10px] uppercase font-semibold ${diff >= 0 ? "text-blue-700" : "text-red-700"}`}>Diferencia</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums mt-1">
            {diff >= 0 ? "+" : ""}{formatCompact(diff)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {diff >= 0
              ? `Organico directo + halo (+${diffPct.toFixed(0)}%)`
              : `Sobre-atribucion (${diffPct.toFixed(0)}%)`}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Urgent Actions (Hoy) ──────────────────────────── */
// Genera hasta 3 acciones urgentes priorizadas por $ impact,
// derivadas de los datos que ya trae el API de campañas.
// NO ejecuta acciones: solo recomienda + deep-link a la plataforma.

type UrgentAction = {
  kind: "kill" | "scale" | "fix";
  title: string;
  whyHuman: string;           // lenguaje simple
  whyTech: string;            // métricas técnicas
  impactArs: number;          // estimado en ARS (para ranking)
  impactLabel: string;        // texto ej: "Ahorro ~$18k/sem"
  ctaLabel: string;           // ej: "Pausar creativo"
  platform?: string;          // META | GOOGLE
  campaignName?: string;
  externalUrl?: string;       // deep-link a ads manager si lo tenemos
};

function buildUrgentActions(
  campaigns: any[],
  breakevenRoas: number,
  totalSpend: number
): UrgentAction[] {
  const actions: UrgentAction[] = [];
  if (!Array.isArray(campaigns) || campaigns.length === 0) return actions;

  const beTarget = breakevenRoas > 0 ? breakevenRoas : 1.5;

  // 1. Peor ofensor: mayor gasto con ROAS < break-even (plata que se quema)
  const losers = campaigns
    .filter((c) => c.spend > 0 && (c.roas || 0) < beTarget && c.spend >= 1000)
    .sort((a, b) => b.spend - a.spend);

  if (losers.length > 0) {
    const worst = losers[0];
    const wasted = Math.max(0, worst.spend - (worst.conversionValue || 0) / Math.max(beTarget, 0.01));
    actions.push({
      kind: "kill",
      title: `Pausá "${worst.name}"`,
      whyHuman: `Esta campaña gasta mucho y no recupera. Estás perdiendo plata acá.`,
      whyTech: `Spend ${formatARS(worst.spend)} · ROAS ${worst.roas}x (BE ${beTarget.toFixed(2)}x) · ${worst.conversions || 0} conv · CPA ${worst.conversions > 0 ? formatARS(worst.spend / worst.conversions) : "--"}`,
      impactArs: wasted,
      impactLabel: `Ahorro estimado ~${formatCompact(wasted)}`,
      ctaLabel: "Ir a la campaña",
      platform: worst.platform,
      campaignName: worst.name,
    });
  }

  // 2. Mejor oportunidad de escalar: ROAS >= 1.5x BE + conversiones suficientes + gasto no dominante
  const avgSpend = totalSpend / Math.max(campaigns.length, 1);
  const scalers = campaigns
    .filter((c) =>
      c.spend > 0 &&
      (c.roas || 0) >= beTarget * 1.5 &&
      (c.conversions || 0) >= 3 &&
      c.spend < avgSpend * 2
    )
    .sort((a, b) => (b.roas || 0) - (a.roas || 0));

  if (scalers.length > 0) {
    const best = scalers[0];
    // Impacto estimado: si le subís +30% al spend manteniendo ROAS, cuánto revenue extra
    const extraRev = best.spend * 0.3 * (best.roas || 0);
    actions.push({
      kind: "scale",
      title: `Subí presupuesto en "${best.name}"`,
      whyHuman: `Esta campaña está rindiendo muy bien. Le queda aire para escalar.`,
      whyTech: `ROAS ${best.roas}x (${((best.roas || 0) / beTarget).toFixed(1)}× BE) · ${best.conversions} conv · Spend ${formatARS(best.spend)} · CTR ${best.ctr}%`,
      impactArs: extraRev,
      impactLabel: `Ingreso extra ~${formatCompact(extraRev)}`,
      ctaLabel: "Ir a la campaña",
      platform: best.platform,
      campaignName: best.name,
    });
  }

  // 3. Fuga consolidada: si hay varios losers, mostrar el impacto total
  if (losers.length >= 2) {
    const totalWasted = losers.reduce(
      (s, c) => s + Math.max(0, c.spend - (c.conversionValue || 0) / Math.max(beTarget, 0.01)),
      0
    );
    actions.push({
      kind: "fix",
      title: `Revisá ${losers.length} campañas por debajo del break-even`,
      whyHuman: `Hay varias campañas quemando plata al mismo tiempo. Juntarlas te da el mayor ahorro del día.`,
      whyTech: `${losers.length} campañas con ROAS < ${beTarget.toFixed(2)}x · Spend total ${formatCompact(losers.reduce((s, c) => s + c.spend, 0))} · Revenue atrib. ${formatCompact(losers.reduce((s, c) => s + (c.conversionValue || 0), 0))}`,
      impactArs: totalWasted,
      impactLabel: `Ahorro potencial ~${formatCompact(totalWasted)}`,
      ctaLabel: "Ver lista completa",
    });
  }

  // Orden por impacto descendente y devolver top 3
  return actions.sort((a, b) => b.impactArs - a.impactArs).slice(0, 3);
}

function UrgentActionCard({ action }: { action: UrgentAction }) {
  const [copied, setCopied] = useState(false);

  const styleByKind: Record<string, {
    ring: string; chipBg: string; chipText: string; iconBg: string;
    Icon: any; label: string; accent: string;
  }> = {
    kill: {
      ring: "ring-red-200",
      chipBg: "bg-red-100",
      chipText: "text-red-800",
      iconBg: "bg-red-100 text-red-600",
      Icon: Scissors,
      label: "Cortar gasto",
      accent: "text-red-700",
    },
    scale: {
      ring: "ring-emerald-200",
      chipBg: "bg-emerald-100",
      chipText: "text-emerald-800",
      iconBg: "bg-emerald-100 text-emerald-600",
      Icon: Rocket,
      label: "Escalar",
      accent: "text-emerald-700",
    },
    fix: {
      ring: "ring-amber-200",
      chipBg: "bg-amber-100",
      chipText: "text-amber-800",
      iconBg: "bg-amber-100 text-amber-600",
      Icon: Flame,
      label: "Revisar",
      accent: "text-amber-700",
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
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={16} /></div>
          <h3 className="font-semibold text-slate-900">Sin acciones urgentes hoy</h3>
        </div>
        <p className="text-sm text-slate-500">
          No detectamos campañas quemando plata ni oportunidades obvias de escalar en este período.
          Probá ampliar el rango de fechas o revisar manualmente en Meta Ads y Google Ads.
        </p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
          Acciones urgentes de hoy
        </span>
        <span className="text-[11px] text-slate-400">— priorizadas por impacto en $</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {actions.map((a, i) => <UrgentActionCard key={i} action={a} />)}
      </div>
    </div>
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
    { key: "TOF", label: "TOF", sub: "Nuevos (prospecting)", data: tof, color: "bg-indigo-500", text: "text-indigo-700", bg: "bg-indigo-50" },
    { key: "MOF", label: "MOF", sub: "Consideración", data: mof, color: "bg-cyan-500", text: "text-cyan-700", bg: "bg-cyan-50" },
    { key: "BOF", label: "BOF", sub: "Retargeting / Marca", data: bof, color: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  ];

  const bofShare = bof && totalSpend > 0 ? (bof.spend / totalSpend) * 100 : 0;
  const tofShare = tof && totalSpend > 0 ? (tof.spend / totalSpend) * 100 : 0;
  const unclassifiedShare = unknown && totalSpend > 0 ? (unknown.spend / totalSpend) * 100 : 0;

  let warning: { tone: "warn" | "ok" | "info"; msg: string } | null = null;
  if (bofShare > 60) {
    warning = {
      tone: "warn",
      msg: `El ${bofShare.toFixed(0)}% de la inversión va a retargeting/marca. Estás cosechando, no cazando — si se seca el MOF/BOF, se seca la venta.`,
    };
  } else if (tofShare < 20 && tof) {
    warning = {
      tone: "warn",
      msg: `Solo ${tofShare.toFixed(0)}% del gasto es prospecting. Sin audiencia nueva entrando, no hay crecimiento sostenible.`,
    };
  } else if (unclassifiedShare > 30) {
    warning = {
      tone: "info",
      msg: `${unclassifiedShare.toFixed(0)}% del gasto está en campañas sin clasificar. Ajustá el naming (TOF/MOF/BOF) en Meta/Google para un análisis más preciso.`,
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

  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Layers size={16} className="text-indigo-600" />
        <h3 className="font-semibold text-slate-900">Salud del Mix de Inversión</h3>
        <span className="text-xs text-slate-400 ml-auto">TOF · MOF · BOF auto-clasificado</span>
      </div>

      {/* Barra apilada */}
      <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden mb-2 ring-1 ring-slate-200">
        {stages.map((st) => {
          if (!st.data || st.data.spend <= 0) return null;
          const pct = (st.data.spend / totalSpend) * 100;
          return (
            <div
              key={st.key}
              className={`${st.color} h-full float-left transition-all`}
              style={{ width: `${pct}%` }}
              title={`${st.label}: ${pct.toFixed(1)}% · ${formatCompact(st.data.spend)}`}
            />
          );
        })}
      </div>

      {/* Tiles por stage */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        {stages.map((st) => {
          const pct = st.data && totalSpend > 0 ? (st.data.spend / totalSpend) * 100 : 0;
          const hasData = !!st.data && st.data.spend > 0;
          return (
            <div key={st.key} className={`rounded-xl p-3 ring-1 ring-slate-100 ${hasData ? st.bg : "bg-slate-50"}`}>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${hasData ? st.text : "text-slate-400"}`}>
                  {st.label}
                </span>
                <span className={`text-[10px] font-semibold tabular-nums ${hasData ? "text-slate-700" : "text-slate-400"}`}>
                  {pct.toFixed(0)}%
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">{st.sub}</p>
              <p className={`text-sm font-bold tabular-nums mt-1 ${hasData ? "text-slate-900" : "text-slate-400"}`}>
                {hasData ? formatCompact(st.data.spend) : "--"}
              </p>
              <p className="text-[10px] text-slate-500 font-mono tabular-nums mt-0.5">
                {hasData ? `ROAS ${st.data.roas}x · ${st.data.conversions} conv` : "sin inversión"}
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

      {/* Hero KPI Row — 8 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <KpiCard icon={<DollarSign size={16} className="text-red-600" />} iconBg="bg-red-50" label="Inversion ads" value={formatCompact(adSpendTotal)} change={changes.spend} />
        <KpiCard icon={<ShoppingCart size={16} className="text-emerald-600" />} iconBg="bg-emerald-50" label="Revenue VTEX" value={formatCompact(realRevenue)} subtitle="Atribuible a ads" />
        <KpiCard icon={<Target size={16} className="text-purple-600" />} iconBg="bg-purple-50" label="Rev. atribuido" value={formatCompact(attributedRevenue)} subtitle={`ROAS rep: ${attributedRoas.toFixed(2)}x`} />
        <KpiCard icon={<TrendingUp size={16} className="text-indigo-600" />} iconBg="bg-indigo-50" label="Blended ROAS" value={`${blendedRoas.toFixed(2)}x`} subtitle="VTEX / Inv." />
        <KpiCard icon={<Gauge size={16} className="text-amber-600" />} iconBg="bg-amber-50" label="Break-even" value={breakevenRoas > 0 ? `${breakevenRoas.toFixed(2)}x` : "--"} subtitle={contributionMargin > 0 ? `CM ${(contributionMargin * 100).toFixed(1)}%` : "Sin margen"} />
        <KpiCard icon={<Activity size={16} className="text-cyan-600" />} iconBg="bg-cyan-50" label="MELI (organico)" value={formatCompact(meliRevenue)} subtitle="No atribuible" />
        <KpiCard icon={<ShoppingCart size={16} className="text-green-600" />} iconBg="bg-green-50" label="Conversiones" value={String(totalConv)} change={changes.conversions} />
        <KpiCard icon={<Zap size={16} className="text-orange-600" />} iconBg="bg-orange-50" label="nCAC" value={nCAC > 0 ? formatARS(nCAC) : "--"} subtitle={`CTR ${globalCtr}%`} />
      </div>

      {/* Discrepancy Block */}
      <DiscrepancyBlock
        attributedRevenue={attributedRevenue}
        vtexRevenue={realRevenue}
        adSpend={adSpendTotal}
      />

      {/* Platform Comparison */}
      {platformFilter === "ALL" && platformSummary.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {platformSummary.map((p: any) => {
            const color = PLATFORM_COLORS[p.platform] || "#6b7280";
            const label = PLATFORM_LABELS[p.platform] || p.platform;
            const roasVsBreakeven = breakevenRoas > 0 ? p.roas / breakevenRoas : 0;
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
                    <p className={`text-lg font-bold ${breakevenRoas > 0 ? (p.roas >= breakevenRoas * 1.5 ? "text-green-600" : p.roas >= breakevenRoas ? "text-amber-600" : "text-red-600") : (p.roas >= 2 ? "text-green-600" : p.roas >= 1 ? "text-amber-600" : "text-red-600")}`}>
                      {p.roas}x
                    </p>
                    {breakevenRoas > 0 && (
                      <p className="text-[10px] text-gray-400 mt-0.5">vs {breakevenRoas.toFixed(2)}x BE</p>
                    )}
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
            <div>
              <h3 className="font-semibold text-gray-900">
                {chartMode === "spend" ? "Inversion Diaria por Plataforma" : "ROAS Diario vs Break-even"}
              </h3>
              {chartMode === "roas" && breakevenRoas > 0 && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Linea punteada = Break-even {breakevenRoas.toFixed(2)}x
                </p>
              )}
            </div>
            <div className="bg-gray-100 p-1 rounded-lg inline-flex gap-1">
              <button onClick={() => setChartMode("roas")}
                className={`px-3 py-1 rounded-md text-xs font-medium ${chartMode === "roas" ? "bg-white shadow-sm text-indigo-600" : "text-gray-600"}`}>
                ROAS
              </button>
              <button onClick={() => setChartMode("spend")}
                className={`px-3 py-1 rounded-md text-xs font-medium ${chartMode === "spend" ? "bg-white shadow-sm text-indigo-600" : "text-gray-600"}`}>
                Inversion
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
                <LineChart data={dailyRoasSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getDate()}/${dt.getMonth() + 1}`; }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}x`} />
                  <Tooltip formatter={(v: number, n: string) => [`${v}x`, n === "roas" ? "ROAS" : "Break-even"]} />
                  <Line type="monotone" dataKey="roas" stroke="#10b981" strokeWidth={2} dot={false} />
                  {breakevenRoas > 0 && (
                    <ReferenceLine y={breakevenRoas} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `BE ${breakevenRoas.toFixed(2)}x`, fill: "#ef4444", fontSize: 11, position: "insideTopRight" }} />
                  )}
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
                    <td className="px-4 py-3 text-center"><RoasBadge value={c.roas} breakeven={breakevenRoas} /></td>
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
                  <td className="px-4 py-3 text-center"><RoasBadge value={Number(attributedRoas.toFixed(2))} breakeven={breakevenRoas} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
