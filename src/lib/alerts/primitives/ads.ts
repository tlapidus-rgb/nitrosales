// ═══════════════════════════════════════════════════════════════════
// primitives/ads.ts — Fase 8g-1 Tier 1
// ═══════════════════════════════════════════════════════════════════
// Meta Ads + Google Ads (ROAS, CPA, spend, impression share).
// ═══════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import type { PrimitiveDefinition, EvaluationContext, EvaluationResult } from "./types";

async function getAdsAggregated(orgId: string, platform: "META" | "GOOGLE", days: number) {
  try {
    const from = new Date(Date.now() - days * 86400 * 1000);
    const rows = await prisma.$queryRawUnsafe<
      Array<{ spend: string; conversionValue: string; conversions: bigint; clicks: bigint; impressions: bigint }>
    >(
      `SELECT COALESCE(SUM("spend"), 0)::text AS spend,
              COALESCE(SUM("conversionValue"), 0)::text AS "conversionValue",
              COALESCE(SUM("conversions"), 0)::bigint AS conversions,
              COALESCE(SUM("clicks"), 0)::bigint AS clicks,
              COALESCE(SUM("impressions"), 0)::bigint AS impressions
         FROM "ad_metrics_daily"
        WHERE "platform" = $1 AND "date" >= $2`,
      platform,
      from
    );
    const spend = Number(rows?.[0]?.spend ?? 0);
    const convValue = Number(rows?.[0]?.conversionValue ?? 0);
    const conversions = Number(rows?.[0]?.conversions ?? 0);
    const clicks = Number(rows?.[0]?.clicks ?? 0);
    const impressions = Number(rows?.[0]?.impressions ?? 0);
    return {
      spend,
      convValue,
      conversions,
      clicks,
      impressions,
      roas: spend > 0 ? convValue / spend : 0,
      cpa: conversions > 0 ? spend / conversions : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
    };
  } catch {
    return { spend: 0, convValue: 0, conversions: 0, clicks: 0, impressions: 0, roas: 0, cpa: 0, cpc: 0 };
  }
}

// 1. meta.roas.below
export const metaRoasBelow: PrimitiveDefinition = {
  key: "meta.roas.below",
  type: "condition",
  module: "meta",
  label: "ROAS Meta < X",
  description: "Avisa cuando el ROAS blended de Meta cae bajo un umbral.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    roas: { type: "number", label: "ROAS mínimo", default: 3, required: true, min: 0.5 },
    days: { type: "number", label: "Ventana (días)", default: 7, required: false },
  },
  naturalExamples: ["avisame si el ROAS de Meta cae bajo 3"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const threshold = Number(ctx.params.roas ?? 3);
    const days = Number(ctx.params.days ?? 7);
    const m = await getAdsAggregated(ctx.orgId, "META", days);
    if (m.spend === 0) return { triggered: false };
    const triggered = m.roas < threshold;
    return {
      triggered,
      severity: m.roas < threshold * 0.5 ? "critical" : "warning",
      title: `ROAS Meta: ${m.roas.toFixed(2)} (últimos ${days}d)`,
      body: `Spend $ ${Math.round(m.spend).toLocaleString("es-AR")} · Revenue atribuido $ ${Math.round(m.convValue).toLocaleString("es-AR")}.`,
      metadata: { ...m, threshold },
      cta: "Ver Meta",
      ctaHref: "/campaigns/meta",
      dedupeKey: `meta.roas.${ctx.orgId}.${threshold}.${days}`,
    };
  },
};

// 2. meta.cpa.above
export const metaCpaAbove: PrimitiveDefinition = {
  key: "meta.cpa.above",
  type: "condition",
  module: "meta",
  label: "CPA Meta > X",
  description: "Avisa cuando el CPA de Meta supera un monto.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    amount: { type: "number", label: "CPA máximo", default: 2000, required: true },
    days: { type: "number", label: "Ventana (días)", default: 7, required: false },
  },
  naturalExamples: ["avisame si el CPA de Meta pasa de $2000"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const threshold = Number(ctx.params.amount ?? 2000);
    const days = Number(ctx.params.days ?? 7);
    const m = await getAdsAggregated(ctx.orgId, "META", days);
    if (m.conversions === 0) return { triggered: false };
    const triggered = m.cpa > threshold;
    return {
      triggered,
      severity: m.cpa > threshold * 1.5 ? "critical" : "warning",
      title: `CPA Meta: $ ${Math.round(m.cpa).toLocaleString("es-AR")}`,
      body: `Supera el umbral ($ ${threshold}) configurado.`,
      metadata: { ...m, threshold },
      cta: "Ver campañas",
      ctaHref: "/campaigns/meta",
      dedupeKey: `meta.cpa.${ctx.orgId}.${threshold}.${days}`,
    };
  },
};

// 3. meta.daily_spend.above
export const metaDailySpendAbove: PrimitiveDefinition = {
  key: "meta.daily_spend.above",
  type: "condition",
  module: "meta",
  label: "Spend Meta diario > X",
  description: "Avisa cuando el spend diario de Meta supera un monto.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    amount: { type: "number", label: "Spend máximo/día", default: 50000, required: true },
  },
  naturalExamples: ["avisame si gasto más de $50k/día en Meta"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const threshold = Number(ctx.params.amount ?? 50000);
    const m = await getAdsAggregated(ctx.orgId, "META", 1);
    const triggered = m.spend > threshold;
    return {
      triggered,
      severity: m.spend > threshold * 1.5 ? "critical" : "warning",
      title: `Spend Meta hoy: $ ${Math.round(m.spend).toLocaleString("es-AR")}`,
      body: `Supera el umbral diario ($ ${Math.round(threshold).toLocaleString("es-AR")}).`,
      metadata: { spend: m.spend, threshold },
      cta: "Ver Meta",
      ctaHref: "/campaigns/meta",
      dedupeKey: `meta.daily_spend.${ctx.orgId}.${threshold}.${new Date().toISOString().slice(0, 10)}`,
    };
  },
};

// 4. meta.report.daily_performance
export const metaReportDaily: PrimitiveDefinition = {
  key: "meta.report.daily_performance",
  type: "schedule",
  module: "meta",
  label: "Reporte diario Meta Ads",
  description: "Spend, ROAS, conversions de Meta del día.",
  defaultSeverity: "info",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 0,
  paramsSchema: {},
  naturalExamples: ["cada día mandame el performance de Meta"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const m = await getAdsAggregated(ctx.orgId, "META", 1);
    return {
      triggered: true,
      severity: "info",
      title: `Meta Ads hoy · ROAS ${m.roas.toFixed(2)}`,
      body: `Spend $ ${Math.round(m.spend).toLocaleString("es-AR")} · ${m.conversions} conversions · CPA $ ${Math.round(m.cpa).toLocaleString("es-AR")}.`,
      metadata: m,
      cta: "Ver Meta",
      ctaHref: "/campaigns/meta",
    };
  },
};

// 5. google.roas.below
export const googleRoasBelow: PrimitiveDefinition = {
  key: "google.roas.below",
  type: "condition",
  module: "google",
  label: "ROAS Google < X",
  description: "Avisa cuando el ROAS de Google cae bajo un umbral.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    roas: { type: "number", label: "ROAS mínimo", default: 3, required: true },
    days: { type: "number", label: "Ventana (días)", default: 7, required: false },
  },
  naturalExamples: ["avisame si el ROAS de Google cae bajo 3"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const threshold = Number(ctx.params.roas ?? 3);
    const days = Number(ctx.params.days ?? 7);
    const m = await getAdsAggregated(ctx.orgId, "GOOGLE", days);
    if (m.spend === 0) return { triggered: false };
    const triggered = m.roas < threshold;
    return {
      triggered,
      severity: m.roas < threshold * 0.5 ? "critical" : "warning",
      title: `ROAS Google: ${m.roas.toFixed(2)} (últimos ${days}d)`,
      body: `Spend $ ${Math.round(m.spend).toLocaleString("es-AR")} · Revenue atribuido $ ${Math.round(m.convValue).toLocaleString("es-AR")}.`,
      metadata: { ...m, threshold },
      cta: "Ver Google",
      ctaHref: "/campaigns/google",
      dedupeKey: `google.roas.${ctx.orgId}.${threshold}.${days}`,
    };
  },
};

// 6. google.cpa.above
export const googleCpaAbove: PrimitiveDefinition = {
  key: "google.cpa.above",
  type: "condition",
  module: "google",
  label: "CPA Google > X",
  description: "Avisa cuando el CPA de Google supera un monto.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    amount: { type: "number", label: "CPA máximo", default: 2000, required: true },
    days: { type: "number", label: "Ventana (días)", default: 7, required: false },
  },
  naturalExamples: ["avisame si el CPA de Google pasa de $2000"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const threshold = Number(ctx.params.amount ?? 2000);
    const days = Number(ctx.params.days ?? 7);
    const m = await getAdsAggregated(ctx.orgId, "GOOGLE", days);
    if (m.conversions === 0) return { triggered: false };
    const triggered = m.cpa > threshold;
    return {
      triggered,
      severity: m.cpa > threshold * 1.5 ? "critical" : "warning",
      title: `CPA Google: $ ${Math.round(m.cpa).toLocaleString("es-AR")}`,
      body: `Supera el umbral ($ ${threshold}) configurado.`,
      metadata: { ...m, threshold },
      cta: "Ver Google",
      ctaHref: "/campaigns/google",
      dedupeKey: `google.cpa.${ctx.orgId}.${threshold}.${days}`,
    };
  },
};

// 7. google.report.daily_performance
export const googleReportDaily: PrimitiveDefinition = {
  key: "google.report.daily_performance",
  type: "schedule",
  module: "google",
  label: "Reporte diario Google Ads",
  description: "Spend, ROAS, conversions de Google del día.",
  defaultSeverity: "info",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 0,
  paramsSchema: {},
  naturalExamples: ["cada día mandame el performance de Google"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const m = await getAdsAggregated(ctx.orgId, "GOOGLE", 1);
    return {
      triggered: true,
      severity: "info",
      title: `Google Ads hoy · ROAS ${m.roas.toFixed(2)}`,
      body: `Spend $ ${Math.round(m.spend).toLocaleString("es-AR")} · ${m.conversions} conversions · CPA $ ${Math.round(m.cpa).toLocaleString("es-AR")}.`,
      metadata: m,
      cta: "Ver Google",
      ctaHref: "/campaigns/google",
    };
  },
};

export const adsPrimitives: PrimitiveDefinition[] = [
  metaRoasBelow,
  metaCpaAbove,
  metaDailySpendAbove,
  metaReportDaily,
  googleRoasBelow,
  googleCpaAbove,
  googleReportDaily,
];
