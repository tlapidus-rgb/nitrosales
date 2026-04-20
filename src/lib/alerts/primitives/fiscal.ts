// ═══════════════════════════════════════════════════════════════════
// primitives/fiscal.ts — Fase 8g-1 Tier 1
// ═══════════════════════════════════════════════════════════════════
// Primitivas Fiscal: vencimientos AFIP + Monotributo.
// ═══════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import type { PrimitiveDefinition, EvaluationContext, EvaluationResult } from "./types";

// Helper: obtener obligaciones próximas usando el fiscal-calendar existente
async function getUpcomingObligations(orgId: string, withinDays: number) {
  try {
    const { buildDefaultObligations, expandObligations, applyOverrides } = await import(
      "@/lib/finanzas/fiscal-calendar"
    );
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const settings = (org?.settings as Record<string, unknown>) || {};
    const profile = (settings.fiscalProfile as any) || null;
    if (!profile) return [];
    const overrideRows = await prisma.fiscalObligationOverride.findMany({
      where: { organizationId: orgId },
    });
    const overrides = overrideRows.map((r: any) => ({
      id: r.id,
      kind: r.kind,
      defaultKey: r.defaultKey,
      name: r.name,
      category: r.category,
      dueDay: r.dueDay,
      frequency: r.frequency,
      yearlyMonth: r.yearlyMonth,
      amount: r.amount ? Number(r.amount) : null,
      amountSource: r.amountSource,
      isActive: r.isActive,
      hideDefault: r.hideDefault,
      note: r.note,
      startMonth: r.startMonth,
      endMonth: r.endMonth,
    }));
    const defaults = buildDefaultObligations(profile);
    const merged = applyOverrides(defaults, overrides);
    const expanded = expandObligations(merged, new Date(), 2);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expanded.filter((o: any) => {
      if (o.isInformative) return false;
      const d = new Date(o.dueDate + "T00:00:00");
      const days = Math.round((d.getTime() - today.getTime()) / 86400000);
      return days >= 0 && days <= withinDays;
    });
  } catch {
    return [];
  }
}

// 1. fiscal.obligation.due_in_days
export const obligationDueInDays: PrimitiveDefinition = {
  key: "fiscal.obligation.due_in_days",
  type: "condition",
  module: "fiscal",
  label: "Obligación AFIP vence en ≤ X días",
  description: "Avisa cuando alguna obligación fiscal (IVA, Ganancias, IIBB, Monotributo) vence en los próximos X días.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    days: {
      type: "number",
      label: "Ventana en días",
      default: 3,
      required: true,
      min: 1,
      max: 30,
    },
  },
  naturalExamples: [
    "avisame 3 días antes de cualquier vencimiento fiscal",
    "alertame cuando se acerque un vencimiento de AFIP",
  ],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const days = Number(ctx.params.days ?? 3);
    const obligations = await getUpcomingObligations(ctx.orgId, days);
    if (obligations.length === 0) return { triggered: false };
    const next = obligations[0];
    const dueDate = new Date(next.dueDate + "T00:00:00");
    const daysLeft = Math.round((dueDate.getTime() - Date.now()) / 86400000);
    return {
      triggered: true,
      severity: daysLeft <= 1 ? "critical" : "warning",
      title: `${next.name} vence ${daysLeft === 0 ? "hoy" : daysLeft === 1 ? "mañana" : `en ${daysLeft} días`}`,
      body: `${obligations.length} obligación${obligations.length > 1 ? "es" : ""} dentro de los próximos ${days} días. Próxima: ${next.name} (${next.category}) el ${next.dueDate}.`,
      metadata: { count: obligations.length, next, allObligations: obligations.slice(0, 5) },
      cta: "Ver calendario fiscal",
      ctaHref: "/finanzas/fiscal",
      dedupeKey: `fiscal.obligation.due_in_days.${ctx.orgId}.${days}.${next.dueDate}`,
    };
  },
};

// 2. fiscal.monotributo.near_limit_pct
export const monotributoNearLimitPct: PrimitiveDefinition = {
  key: "fiscal.monotributo.near_limit_pct",
  type: "condition",
  module: "fiscal",
  label: "Monotributo cerca del tope (X%)",
  description: "Avisa cuando la facturación 12m supera X% del tope de tu categoría.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 10080,
  paramsSchema: {
    percent: {
      type: "number",
      label: "% del tope",
      default: 80,
      required: true,
      min: 50,
      max: 100,
    },
  },
  naturalExamples: [
    "avisame cuando esté al 80% del tope del monotributo",
    "alertame si me acerco al límite de facturación",
  ],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    try {
      const { analyzeMonotributo } = await import("@/lib/finanzas/fiscal-monotributo");
      const org = await prisma.organization.findUnique({
        where: { id: ctx.orgId },
        select: { settings: true },
      });
      const settings = (org?.settings as Record<string, unknown>) || {};
      const profile = (settings.fiscalProfile as any) || null;
      if (!profile || profile.taxRegime !== "MONOTRIBUTO") return { triggered: false };

      const from = new Date();
      from.setUTCMonth(from.getUTCMonth() - 11);
      from.setUTCDate(1);
      const rows = await prisma.$queryRawUnsafe<Array<{ revenue: string }>>(
        `SELECT COALESCE(SUM("totalValue"), 0)::text AS revenue FROM "orders"
         WHERE "organizationId" = $1 AND "orderDate" >= $2`,
        ctx.orgId,
        from
      );
      const actual = Number(rows?.[0]?.revenue ?? 0);
      const analysis = analyzeMonotributo({
        currentCategory: profile.monotributoCategory || "A",
        projectedRevenue12m: actual,
        actualRevenueLast12m: actual,
        monthlyRevenueSeries: [],
      });
      const topLimit = Number((analysis as any).topLimit ?? (analysis as any).annualLimit ?? 0);
      const pct = (actual / (topLimit || 1)) * 100;
      const threshold = Number(ctx.params.percent ?? 80);
      const triggered = pct >= threshold;
      return {
        triggered,
        severity: pct >= 95 ? "critical" : "warning",
        title: `Monotributo: ${pct.toFixed(0)}% del tope de categoría ${profile.monotributoCategory}`,
        body: `Facturación 12m: $ ${Math.round(actual).toLocaleString("es-AR")}. Umbral: ${threshold}% del tope.`,
        metadata: { actual, topLimit, pct, category: profile.monotributoCategory },
        cta: "Ver fiscal",
        ctaHref: "/finanzas/fiscal",
        dedupeKey: `fiscal.monotributo.near_limit_pct.${ctx.orgId}.${threshold}`,
      };
    } catch {
      return { triggered: false };
    }
  },
};

// 3. fiscal.report.upcoming_obligations_weekly
export const reportUpcomingObligationsWeekly: PrimitiveDefinition = {
  key: "fiscal.report.upcoming_obligations_weekly",
  type: "schedule",
  module: "fiscal",
  label: "Reporte semanal de vencimientos próximos",
  description: "Cada semana, lista de obligaciones AFIP de los próximos 30 días.",
  defaultSeverity: "info",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 0,
  paramsSchema: {},
  naturalExamples: ["cada lunes mandame los vencimientos de AFIP de la semana"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const obligations = await getUpcomingObligations(ctx.orgId, 30);
    if (obligations.length === 0)
      return {
        triggered: true,
        severity: "info",
        title: "Sin vencimientos en los próximos 30 días",
        body: "No hay obligaciones fiscales pendientes en la ventana de un mes.",
        cta: "Ver calendario",
        ctaHref: "/finanzas/fiscal",
      };
    const listStr = obligations
      .slice(0, 10)
      .map((o: any) => `• ${o.dueDate}: ${o.name}`)
      .join("\n");
    return {
      triggered: true,
      severity: "info",
      title: `${obligations.length} vencimiento${obligations.length > 1 ? "s" : ""} en los próximos 30 días`,
      body: listStr,
      metadata: { obligations },
      cta: "Ver calendario fiscal",
      ctaHref: "/finanzas/fiscal",
    };
  },
};

// 4. fiscal.obligation.due_today
export const obligationDueToday: PrimitiveDefinition = {
  key: "fiscal.obligation.due_today",
  type: "condition",
  module: "fiscal",
  label: "Obligación fiscal vence hoy",
  description: "Avisa si hay obligaciones AFIP con vencimiento el día actual.",
  defaultSeverity: "critical",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {},
  naturalExamples: ["avisame si tengo un vencimiento fiscal hoy"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const obligations = await getUpcomingObligations(ctx.orgId, 0);
    if (obligations.length === 0) return { triggered: false };
    const listStr = obligations.map((o: any) => `• ${o.name}`).join("\n");
    return {
      triggered: true,
      severity: "critical",
      title: `${obligations.length} vencimiento${obligations.length > 1 ? "s" : ""} fiscal${obligations.length > 1 ? "es" : ""} HOY`,
      body: listStr,
      metadata: { obligations },
      cta: "Ver calendario",
      ctaHref: "/finanzas/fiscal",
      dedupeKey: `fiscal.obligation.due_today.${ctx.orgId}.${new Date().toISOString().slice(0, 10)}`,
    };
  },
};

export const fiscalPrimitives: PrimitiveDefinition[] = [
  obligationDueInDays,
  obligationDueToday,
  monotributoNearLimitPct,
  reportUpcomingObligationsWeekly,
];
