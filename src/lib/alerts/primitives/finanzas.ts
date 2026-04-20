// ═══════════════════════════════════════════════════════════════════
// primitives/finanzas.ts — Fase 8g-1 Tier 1
// ═══════════════════════════════════════════════════════════════════
// Primitivas del módulo Finanzas (Pulso).
// Tier 1 implementadas: runway, cash, burn, revenue, P&L básico.
// ═══════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import type { PrimitiveDefinition, EvaluationContext, EvaluationResult } from "./types";

// Helper: obtiene el cash override del mes actual (o 0 si no hay)
async function getCurrentCash(orgId: string): Promise<number> {
  const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ amount: string }>>(
      `SELECT "amount"::text AS amount FROM "cash_balance_overrides"
       WHERE "organizationId" = $1 AND "month" = $2 LIMIT 1`,
      orgId,
      thisMonth
    );
    return Number(rows?.[0]?.amount ?? 0);
  } catch {
    return 0;
  }
}

// Helper: burn rate 30d (ingresos últimos 30d - egresos últimos 30d)
async function getBurnRate30d(orgId: string): Promise<number> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000);
    const revRows = await prisma.$queryRawUnsafe<Array<{ total: string }>>(
      `SELECT COALESCE(SUM("totalValue"), 0)::text AS total FROM "orders"
       WHERE "organizationId" = $1 AND "orderDate" >= $2 AND "status" NOT IN ('CANCELLED')`,
      orgId,
      thirtyDaysAgo
    );
    const revenue = Number(revRows?.[0]?.total ?? 0);

    // Manual costs del mes
    const thisMonth = new Date().toISOString().slice(0, 7);
    const costRows = await prisma.$queryRawUnsafe<Array<{ total: string }>>(
      `SELECT COALESCE(SUM("amount"), 0)::text AS total FROM "manual_costs"
       WHERE "organizationId" = $1 AND "month" = $2 AND "isActive" = TRUE`,
      orgId,
      thisMonth
    );
    const costs = Number(costRows?.[0]?.total ?? 0);

    // Burn = costs - revenue (positivo = quemando)
    return Math.max(0, costs - revenue * 0.4); // Assumes 40% contribution margin as proxy
  } catch {
    return 0;
  }
}

// Helper: revenue en período
async function getRevenueInPeriod(
  orgId: string,
  fromDate: Date,
  toDate: Date = new Date()
): Promise<number> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ total: string }>>(
      `SELECT COALESCE(SUM("totalValue"), 0)::text AS total FROM "orders"
       WHERE "organizationId" = $1 AND "orderDate" >= $2 AND "orderDate" <= $3
         AND "status" NOT IN ('CANCELLED')`,
      orgId,
      fromDate,
      toDate
    );
    return Number(rows?.[0]?.total ?? 0);
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────
// 1. finanzas.runway.below_months
// ─────────────────────────────────────────────────────────────
export const runwayBelowMonths: PrimitiveDefinition = {
  key: "finanzas.runway.below_months",
  type: "condition",
  module: "finanzas",
  submodule: "pulso",
  label: "Runway baja de X meses",
  description: "Avisa cuando el runway (cash / burn_rate) cae por debajo de X meses.",
  defaultSeverity: "critical",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 1440, // 1 día
  paramsSchema: {
    months: {
      type: "number",
      label: "Meses mínimos",
      default: 3,
      required: true,
      description: "Si el runway baja de este número, se dispara la alerta.",
      min: 1,
      max: 24,
    },
  },
  naturalExamples: [
    "avisame si tengo menos de 3 meses de runway",
    "si el cash no me alcanza para más de 2 meses, dame una alerta",
    "alert me when runway drops below 6 months",
  ],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const months = Number(ctx.params.months ?? 3);
    const cash = await getCurrentCash(ctx.orgId);
    const burn = await getBurnRate30d(ctx.orgId);
    if (burn <= 0) return { triggered: false };
    const runway = cash / burn;
    const triggered = runway < months;
    return {
      triggered,
      severity: runway < months / 2 ? "critical" : "warning",
      title: `Runway crítico: ${runway.toFixed(1)} meses`,
      body: `Con el burn rate actual ($ ${Math.round(burn).toLocaleString("es-AR")}/mes) y el cash disponible ($ ${Math.round(cash).toLocaleString("es-AR")}), tenés pista de vuelo para ~${runway.toFixed(1)} meses.`,
      metadata: { cash, burn, runwayMonths: runway, thresholdMonths: months },
      cta: "Abrir Escenarios",
      ctaHref: "/finanzas/escenarios",
      dedupeKey: `finanzas.runway.below_months.${ctx.orgId}.${months}`,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// 2. finanzas.cash.below_amount
// ─────────────────────────────────────────────────────────────
export const cashBelowAmount: PrimitiveDefinition = {
  key: "finanzas.cash.below_amount",
  type: "condition",
  module: "finanzas",
  submodule: "pulso",
  label: "Cash disponible bajo X",
  description: "Avisa cuando el cash total baja de un monto absoluto.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    amount: {
      type: "number",
      label: "Monto mínimo",
      default: 5000000,
      required: true,
      description: "Si el cash baja de este monto, se dispara la alerta.",
    },
    currency: {
      type: "string",
      label: "Moneda",
      default: "ARS",
      required: false,
      options: [
        { value: "ARS", label: "ARS" },
        { value: "USD", label: "USD" },
      ],
    },
  },
  naturalExamples: [
    "avisame si el cash baja de 5 millones",
    "si tengo menos de $10M en caja, alertame",
  ],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const amount = Number(ctx.params.amount ?? 5_000_000);
    const cash = await getCurrentCash(ctx.orgId);
    const triggered = cash < amount;
    return {
      triggered,
      severity: cash < amount * 0.5 ? "critical" : "warning",
      title: `Cash bajo: $ ${Math.round(cash).toLocaleString("es-AR")}`,
      body: `El cash disponible bajó del umbral configurado ($ ${Math.round(amount).toLocaleString("es-AR")}).`,
      metadata: { cash, threshold: amount },
      cta: "Ver Pulso",
      ctaHref: "/finanzas/pulso",
      dedupeKey: `finanzas.cash.below_amount.${ctx.orgId}.${amount}`,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// 3. finanzas.burn_rate.above
// ─────────────────────────────────────────────────────────────
export const burnRateAbove: PrimitiveDefinition = {
  key: "finanzas.burn_rate.above",
  type: "condition",
  module: "finanzas",
  submodule: "pulso",
  label: "Burn rate mensual sobre X",
  description: "Avisa cuando el burn rate supera un monto mensual.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    amount: {
      type: "number",
      label: "Burn máximo aceptable ($/mes)",
      default: 2000000,
      required: true,
    },
  },
  naturalExamples: [
    "avisame si el burn pasa de 2 millones",
    "if monthly burn exceeds $3M alert me",
  ],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const amount = Number(ctx.params.amount ?? 2_000_000);
    const burn = await getBurnRate30d(ctx.orgId);
    const triggered = burn > amount;
    return {
      triggered,
      severity: burn > amount * 1.5 ? "critical" : "warning",
      title: `Burn rate alto: $ ${Math.round(burn).toLocaleString("es-AR")}/mes`,
      body: `Superaste el umbral configurado ($ ${Math.round(amount).toLocaleString("es-AR")}/mes).`,
      metadata: { burn, threshold: amount },
      cta: "Ver Costos",
      ctaHref: "/finanzas/costos",
      dedupeKey: `finanzas.burn_rate.above.${ctx.orgId}.${amount}`,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// 4. finanzas.revenue.below_amount
// ─────────────────────────────────────────────────────────────
export const revenueBelowAmount: PrimitiveDefinition = {
  key: "finanzas.revenue.below_amount",
  type: "condition",
  module: "finanzas",
  submodule: "estado",
  label: "Revenue del período bajo X",
  description: "Avisa cuando el revenue del período (último mes) baja de un monto.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    amount: {
      type: "number",
      label: "Revenue mínimo aceptable ($)",
      default: 10000000,
      required: true,
    },
    period: {
      type: "string",
      label: "Período",
      default: "last_30d",
      required: false,
      options: [
        { value: "last_7d", label: "Últimos 7 días" },
        { value: "last_30d", label: "Últimos 30 días" },
        { value: "mtd", label: "Mes en curso" },
      ],
    },
  },
  naturalExamples: [
    "avisame si el revenue del mes queda bajo $10M",
    "if monthly revenue falls below $5M alert",
  ],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const amount = Number(ctx.params.amount ?? 10_000_000);
    const period = String(ctx.params.period ?? "last_30d");
    let from = new Date();
    if (period === "last_7d") from = new Date(Date.now() - 7 * 86400 * 1000);
    else if (period === "mtd") {
      from = new Date();
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
    } else from = new Date(Date.now() - 30 * 86400 * 1000);

    const revenue = await getRevenueInPeriod(ctx.orgId, from);
    const triggered = revenue < amount;
    return {
      triggered,
      severity: revenue < amount * 0.5 ? "critical" : "warning",
      title: `Revenue bajo: $ ${Math.round(revenue).toLocaleString("es-AR")}`,
      body: `El revenue del período (${period}) quedó bajo el umbral ($ ${Math.round(amount).toLocaleString("es-AR")}).`,
      metadata: { revenue, threshold: amount, period },
      cta: "Ver Estado",
      ctaHref: "/finanzas/estado",
      dedupeKey: `finanzas.revenue.below_amount.${ctx.orgId}.${amount}.${period}`,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// 5. finanzas.revenue.drops_pct_vs_prev
// ─────────────────────────────────────────────────────────────
export const revenueDropsPctVsPrev: PrimitiveDefinition = {
  key: "finanzas.revenue.drops_pct_vs_prev",
  type: "condition",
  module: "finanzas",
  submodule: "estado",
  label: "Revenue baja X% vs período anterior",
  description: "Avisa cuando el revenue del período actual baja X% vs el período anterior inmediato.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    percent: {
      type: "number",
      label: "Baja mínima (%)",
      default: 20,
      required: true,
      min: 1,
      max: 100,
    },
    period: {
      type: "string",
      label: "Período",
      default: "month",
      required: false,
      options: [
        { value: "week", label: "Semana" },
        { value: "month", label: "Mes" },
        { value: "quarter", label: "Trimestre" },
      ],
    },
  },
  naturalExamples: [
    "avisame si el revenue baja más de 20% vs el mes pasado",
    "alertame cuando la facturación caiga 15% semanal",
  ],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const percent = Number(ctx.params.percent ?? 20);
    const period = String(ctx.params.period ?? "month");
    const days = period === "week" ? 7 : period === "quarter" ? 90 : 30;
    const now = new Date();
    const prevFrom = new Date(Date.now() - 2 * days * 86400 * 1000);
    const prevTo = new Date(Date.now() - days * 86400 * 1000);
    const currFrom = new Date(Date.now() - days * 86400 * 1000);
    const [curr, prev] = await Promise.all([
      getRevenueInPeriod(ctx.orgId, currFrom, now),
      getRevenueInPeriod(ctx.orgId, prevFrom, prevTo),
    ]);
    if (prev <= 0) return { triggered: false };
    const dropPct = ((prev - curr) / prev) * 100;
    const triggered = dropPct >= percent;
    return {
      triggered,
      severity: dropPct > percent * 1.5 ? "critical" : "warning",
      title: `Revenue bajó ${dropPct.toFixed(1)}% vs ${period === "week" ? "semana" : period === "quarter" ? "trimestre" : "mes"} anterior`,
      body: `Actual: $ ${Math.round(curr).toLocaleString("es-AR")} · Anterior: $ ${Math.round(prev).toLocaleString("es-AR")}.`,
      metadata: { current: curr, previous: prev, dropPct, threshold: percent },
      cta: "Ver Estado",
      ctaHref: "/finanzas/estado",
      dedupeKey: `finanzas.revenue.drops_pct_vs_prev.${ctx.orgId}.${percent}.${period}`,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// 6. finanzas.report.snapshot_daily (schedule)
// ─────────────────────────────────────────────────────────────
export const reportSnapshotDaily: PrimitiveDefinition = {
  key: "finanzas.report.snapshot_daily",
  type: "schedule",
  module: "finanzas",
  submodule: "pulso",
  label: "Reporte diario: cash, burn, runway, revenue hoy",
  description: "Todos los días a la hora que elijas, snapshot de los 4 números clave.",
  defaultSeverity: "info",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 0, // schedule, no aplica cooldown
  paramsSchema: {},
  naturalExamples: [
    "mandame todos los días a las 8am el cash y burn",
    "reporte diario de finanzas a las 9",
  ],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const cash = await getCurrentCash(ctx.orgId);
    const burn = await getBurnRate30d(ctx.orgId);
    const runway = burn > 0 ? cash / burn : 0;
    const revToday = await getRevenueInPeriod(
      ctx.orgId,
      new Date(new Date().setHours(0, 0, 0, 0))
    );
    return {
      triggered: true,
      severity: "info",
      title: `Snapshot Finanzas · ${new Date().toLocaleDateString("es-AR")}`,
      body: `Cash: $ ${Math.round(cash).toLocaleString("es-AR")} · Burn: $ ${Math.round(burn).toLocaleString("es-AR")}/mes · Runway: ${runway.toFixed(1)}m · Revenue hoy: $ ${Math.round(revToday).toLocaleString("es-AR")}`,
      metadata: { cash, burn, runway, revenueToday: revToday },
      cta: "Abrir Pulso",
      ctaHref: "/finanzas/pulso",
    };
  },
};

// ─────────────────────────────────────────────────────────────
// 7. finanzas.report.weekly_summary (schedule)
// ─────────────────────────────────────────────────────────────
export const reportWeeklySummary: PrimitiveDefinition = {
  key: "finanzas.report.weekly_summary",
  type: "schedule",
  module: "finanzas",
  submodule: "estado",
  label: "Resumen semanal de Finanzas",
  description: "Cada lunes a la hora que elijas, resumen de la semana (revenue, orders, AOV, variación vs semana anterior).",
  defaultSeverity: "info",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 0,
  paramsSchema: {},
  naturalExamples: [
    "cada lunes 9am mandame el resumen semanal",
    "weekly finance digest on mondays",
  ],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const now = new Date();
    const weekAgo = new Date(Date.now() - 7 * 86400 * 1000);
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400 * 1000);
    const [thisWeek, prevWeek] = await Promise.all([
      getRevenueInPeriod(ctx.orgId, weekAgo, now),
      getRevenueInPeriod(ctx.orgId, twoWeeksAgo, weekAgo),
    ]);
    const deltaPct = prevWeek > 0 ? ((thisWeek - prevWeek) / prevWeek) * 100 : 0;
    const trend = deltaPct > 0 ? "↑" : deltaPct < 0 ? "↓" : "=";
    return {
      triggered: true,
      severity: "info",
      title: `Resumen semanal Finanzas`,
      body: `Revenue: $ ${Math.round(thisWeek).toLocaleString("es-AR")} ${trend} ${deltaPct.toFixed(1)}% vs semana anterior.`,
      metadata: { thisWeek, prevWeek, deltaPct },
      cta: "Ver Estado",
      ctaHref: "/finanzas/estado",
    };
  },
};

// ─────────────────────────────────────────────────────────────
// 8. finanzas.burn_rate.rises_pct_vs_prev
// ─────────────────────────────────────────────────────────────
export const burnRateRisesPct: PrimitiveDefinition = {
  key: "finanzas.burn_rate.rises_pct_vs_prev",
  type: "condition",
  module: "finanzas",
  submodule: "pulso",
  label: "Burn rate sube X% vs mes anterior",
  description: "Avisa cuando el burn del mes actual subió X% vs el mes anterior.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 10080, // 7 días
  paramsSchema: {
    percent: {
      type: "number",
      label: "Suba mínima (%)",
      default: 30,
      required: true,
      min: 5,
      max: 200,
    },
  },
  naturalExamples: ["si el burn sube más de 30% en un mes"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const percent = Number(ctx.params.percent ?? 30);
    // Comparación simplificada: actual burn rate vs previous month cost sum / previous month revenue 40% margin
    const currentBurn = await getBurnRate30d(ctx.orgId);
    // Aproximación prev month burn
    try {
      const prevMonth = new Date();
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      const prevMonthKey = prevMonth.toISOString().slice(0, 7);
      const costRows = await prisma.$queryRawUnsafe<Array<{ total: string }>>(
        `SELECT COALESCE(SUM("amount"), 0)::text AS total FROM "manual_costs"
         WHERE "organizationId" = $1 AND "month" = $2 AND "isActive" = TRUE`,
        ctx.orgId,
        prevMonthKey
      );
      const prevCosts = Number(costRows?.[0]?.total ?? 0);
      if (prevCosts <= 0) return { triggered: false };
      const risePct = ((currentBurn - prevCosts) / prevCosts) * 100;
      const triggered = risePct >= percent;
      return {
        triggered,
        severity: "warning",
        title: `Burn subió ${risePct.toFixed(1)}% vs mes anterior`,
        body: `Actual: $ ${Math.round(currentBurn).toLocaleString("es-AR")}/mes · Anterior: $ ${Math.round(prevCosts).toLocaleString("es-AR")}/mes.`,
        metadata: { currentBurn, prevCosts, risePct },
        cta: "Ver Costos",
        ctaHref: "/finanzas/costos",
        dedupeKey: `finanzas.burn_rate.rises_pct.${ctx.orgId}.${percent}`,
      };
    } catch {
      return { triggered: false };
    }
  },
};

export const finanzasPrimitives: PrimitiveDefinition[] = [
  runwayBelowMonths,
  cashBelowAmount,
  burnRateAbove,
  revenueBelowAmount,
  revenueDropsPctVsPrev,
  reportSnapshotDaily,
  reportWeeklySummary,
  burnRateRisesPct,
];
