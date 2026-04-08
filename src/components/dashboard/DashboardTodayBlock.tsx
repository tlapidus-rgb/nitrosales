"use client";

import React from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Sparkles,
  Target,
  Package,
  Users,
  Zap,
  Activity,
  ArrowRight,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────
export type InsightTone = "positive" | "negative" | "warning" | "neutral";

export interface Insight {
  id: string;
  tone: InsightTone;
  icon: React.ComponentType<{ className?: string }>;
  category: string; // "Ventas" | "Marketing" | "Stock" | etc.
  headline: string; // Una línea corta y directa
  detail: string; // Contexto / número de soporte
  metric?: string; // Número grande opcional ($, %, x)
  hint?: string; // CTA o sugerencia ("revisá Pixel", etc.)
}

// ──────────────────────────────────────────────────────────────
// Helpers de formato (locales para evitar imports cruzados)
// ──────────────────────────────────────────────────────────────
function fARS(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}
function fNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("es-AR").format(Math.round(n));
}
function fPct(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(1)}%`;
}
function signedPct(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

// ──────────────────────────────────────────────────────────────
// Generador de insights desde allData
// Devuelve hasta 4 insights ordenados por importancia.
// ──────────────────────────────────────────────────────────────
export function buildTodayInsights(allData: Record<string, any>): Insight[] {
  const out: Insight[] = [];
  const m = allData.metrics?.summary;
  const c = allData.metrics?.changes;
  const prod = allData.products?.stockSummary;
  const cust = allData.customers?.kpis;
  const pnl = allData.pnl?.summary;

  // 1. Revenue trend (positive/negative based on delta)
  if (m && c && Number.isFinite(c.revenue)) {
    const delta = c.revenue;
    if (Math.abs(delta) >= 5) {
      out.push({
        id: "revenue-trend",
        tone: delta > 0 ? "positive" : "negative",
        icon: delta > 0 ? TrendingUp : TrendingDown,
        category: "Ventas",
        headline:
          delta > 0
            ? `Vendés ${signedPct(delta)} más que el período anterior`
            : `Tu facturación cayó ${signedPct(delta)} vs el período anterior`,
        detail: `${fARS(m.revenue)} en ${fNum(m.orders)} pedidos · ticket ${fARS(m.avgTicket)}`,
        metric: signedPct(delta),
        hint:
          delta > 0
            ? "Mantené el ritmo: revisá qué canal está empujando."
            : "Revisá ROAS por plataforma y stock de tus top sellers.",
      });
    }
  }

  // 2. ROAS performance
  if (m && Number.isFinite(m.roas)) {
    const roas = m.roas;
    const roasChange = c?.roas;
    if (roas > 0) {
      let tone: InsightTone = "neutral";
      let headline = `ROAS general: ${roas.toFixed(2)}x`;
      let hint = "";
      if (roas >= 4) {
        tone = "positive";
        headline = `ROAS sano: estás devolviendo ${roas.toFixed(2)}x cada peso invertido`;
        hint = "Probá escalar presupuesto en tu mejor campaña.";
      } else if (roas >= 2) {
        tone = "neutral";
        headline = `ROAS en zona media: ${roas.toFixed(2)}x — hay margen para optimizar`;
        hint = "Revisá creativos cansados y audiencias de bajo retorno.";
      } else {
        tone = "warning";
        headline = `ROAS bajo: ${roas.toFixed(2)}x — estás quemando inversión`;
        hint = "Pausá lo peor y reasigná a tu top performer.";
      }
      out.push({
        id: "roas-status",
        tone,
        icon: Target,
        category: "Marketing",
        headline,
        detail: `Inversión ${fARS(m.adSpend)} · Google ${fARS(m.googleSpend)} · Meta ${fARS(m.metaSpend)}${
          Number.isFinite(roasChange) ? ` · ${signedPct(roasChange)} vs anterior` : ""
        }`,
        metric: `${roas.toFixed(2)}x`,
        hint,
      });
    }
  }

  // 3. Stock crítico
  if (prod && (prod.criticalCount || 0) + (prod.lowCount || 0) > 0) {
    const total = (prod.criticalCount || 0) + (prod.lowCount || 0);
    out.push({
      id: "stock-alert",
      tone: prod.criticalCount > 0 ? "warning" : "neutral",
      icon: Package,
      category: "Stock",
      headline:
        prod.criticalCount > 0
          ? `${fNum(prod.criticalCount)} productos en stock crítico`
          : `${fNum(total)} productos para reponer pronto`,
      detail: `${fNum(prod.criticalCount || 0)} críticos · ${fNum(prod.lowCount || 0)} bajos${
        prod.deadCount ? ` · ${fNum(prod.deadCount)} sin ventas 60+ días` : ""
      }`,
      metric: fNum(total),
      hint: "Generá orden de compra antes de quedarte sin stock estrella.",
    });
  }

  // 4. Conversion shift
  if (m && Number.isFinite(m.conversionRate) && Number.isFinite(c?.conversionRate)) {
    const cr = m.conversionRate;
    const crDelta = c.conversionRate;
    if (Math.abs(crDelta) >= 10) {
      out.push({
        id: "conversion-shift",
        tone: crDelta > 0 ? "positive" : "warning",
        icon: Activity,
        category: "Conversión",
        headline:
          crDelta > 0
            ? `Tu conversión mejoró ${signedPct(crDelta)} — algo está funcionando`
            : `Conversión en caída: ${signedPct(crDelta)} vs anterior`,
        detail: `Ahora ${fPct(cr)} con ${fNum(m.sessions)} sesiones`,
        metric: fPct(cr),
        hint:
          crDelta > 0
            ? "Documentá qué cambiaste para escalarlo a otras campañas."
            : "Revisá velocidad del checkout y promos activas.",
      });
    }
  }

  // 5. Cancelled orders alert
  if (m && (m.cancelledOrders || 0) > 0) {
    out.push({
      id: "cancelled-orders",
      tone: "warning",
      icon: AlertTriangle,
      category: "Operaciones",
      headline: `${fNum(m.cancelledOrders)} órdenes canceladas en el período`,
      detail: `${fARS(m.cancelledRevenue || 0)} excluidos del cálculo de facturación`,
      metric: fNum(m.cancelledOrders),
      hint: "Revisá motivos de cancelación para detectar patrones.",
    });
  }

  // 6. New customers (if no other warning insights and we have data)
  if (cust && (cust.newCustomers || 0) > 0 && out.filter((i) => i.tone === "warning").length === 0) {
    out.push({
      id: "new-customers",
      tone: "positive",
      icon: Users,
      category: "Clientes",
      headline: `${fNum(cust.newCustomers)} clientes nuevos en el período`,
      detail: `Repeat rate ${fPct(cust.repeatRate || 0)} · ticket promedio ${fARS(cust.avgSpentPerCustomer || 0)}`,
      metric: fNum(cust.newCustomers),
      hint: "Mandales un welcome flow para empujar la 2da compra.",
    });
  }

  // 7. Margin alert if data exists
  if (pnl && Number.isFinite(pnl.grossMargin) && pnl.grossMargin < 30) {
    out.push({
      id: "margin-alert",
      tone: "warning",
      icon: TrendingDown,
      category: "Finanzas",
      headline: `Margen bruto bajo: ${fPct(pnl.grossMargin)}`,
      detail: `Operating profit ${fARS(pnl.operatingProfit || 0)}`,
      metric: fPct(pnl.grossMargin),
      hint: "Revisá pricing en tus top SKUs o renegociá costos.",
    });
  }

  // Si no hay nada relevante, mostrar un fallback positivo
  if (out.length === 0) {
    out.push({
      id: "default-info",
      tone: "neutral",
      icon: Sparkles,
      category: "Resumen",
      headline: "Tu operación está estable en este período",
      detail: "Sin alertas críticas ni cambios bruscos. Buen momento para experimentar.",
      hint: "Probá un nuevo creativo o segmento esta semana.",
    });
  }

  // Top 4 más importantes
  return out.slice(0, 4);
}

// ──────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────
const TONE_STYLES: Record<
  InsightTone,
  { accent: string; bg: string; iconBg: string; iconColor: string; metricColor: string; dot: string }
> = {
  positive: {
    accent: "border-l-cyan-500",
    bg: "bg-gradient-to-br from-cyan-50/40 to-white",
    iconBg: "bg-cyan-50",
    iconColor: "text-cyan-600",
    metricColor: "text-cyan-600",
    dot: "bg-cyan-500",
  },
  negative: {
    accent: "border-l-rose-500",
    bg: "bg-gradient-to-br from-rose-50/30 to-white",
    iconBg: "bg-rose-50",
    iconColor: "text-rose-600",
    metricColor: "text-rose-600",
    dot: "bg-rose-500",
  },
  warning: {
    accent: "border-l-amber-500",
    bg: "bg-gradient-to-br from-amber-50/40 to-white",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    metricColor: "text-amber-600",
    dot: "bg-amber-500",
  },
  neutral: {
    accent: "border-l-slate-300",
    bg: "bg-gradient-to-br from-slate-50/40 to-white",
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
    metricColor: "text-slate-700",
    dot: "bg-slate-400",
  },
};

interface DashboardTodayBlockProps {
  insights: Insight[];
  loading?: boolean;
}

export default function DashboardTodayBlock({ insights, loading }: DashboardTodayBlockProps) {
  if (loading) {
    return (
      <section className="dash-today mb-6">
        <header className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-slate-400" />
          <h2 className="text-[11px] font-semibold tracking-[0.18em] uppercase text-slate-500">
            Lo que importa hoy
          </h2>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="dash-card dash-skeleton h-[112px]" />
          ))}
        </div>
      </section>
    );
  }

  if (!insights.length) return null;

  return (
    <section className="dash-today mb-6">
      <header className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-amber-500" />
        <h2 className="text-[11px] font-semibold tracking-[0.18em] uppercase text-slate-500">
          Lo que importa hoy
        </h2>
        <span className="text-[11px] text-slate-400 font-normal normal-case tracking-normal">
          · {insights.length} {insights.length === 1 ? "insight" : "insights"} detectados
        </span>
      </header>

      <div className="dash-stagger grid grid-cols-1 md:grid-cols-2 gap-3">
        {insights.map((insight) => {
          const styles = TONE_STYLES[insight.tone];
          const Icon = insight.icon;
          return (
            <article
              key={insight.id}
              className={`dash-card dash-insight border-l-[3px] ${styles.accent} ${styles.bg} p-4 group cursor-default`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`shrink-0 w-9 h-9 rounded-xl ${styles.iconBg} ${styles.iconColor} flex items-center justify-center`}
                >
                  <Icon className="w-[18px] h-[18px]" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-1 h-1 rounded-full ${styles.dot}`} />
                    <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-slate-500">
                      {insight.category}
                    </span>
                    {insight.metric && (
                      <span
                        className={`ml-auto text-base font-bold tabular-nums tracking-tight ${styles.metricColor}`}
                      >
                        {insight.metric}
                      </span>
                    )}
                  </div>

                  <h3 className="text-[14px] font-semibold tracking-tight text-slate-900 leading-snug mb-1">
                    {insight.headline}
                  </h3>

                  <p className="text-[12px] text-slate-500 leading-relaxed">{insight.detail}</p>

                  {insight.hint && (
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-600/80 font-medium">
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      {insight.hint}
                    </p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
