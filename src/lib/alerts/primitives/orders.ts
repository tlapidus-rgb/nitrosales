// ═══════════════════════════════════════════════════════════════════
// primitives/orders.ts — Fase 8g-1 Tier 1
// ═══════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import type { PrimitiveDefinition, EvaluationContext, EvaluationResult } from "./types";

async function getOrdersCount(orgId: string, fromDate: Date, toDate: Date = new Date()) {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint; total: string; aov: string }>>(
      `SELECT COUNT(*)::bigint AS count, COALESCE(SUM("totalValue"), 0)::text AS total,
              COALESCE(AVG("totalValue"), 0)::text AS aov
         FROM "orders"
        WHERE "organizationId" = $1 AND "orderDate" >= $2 AND "orderDate" <= $3
          AND "status" NOT IN ('CANCELLED')`,
      orgId,
      fromDate,
      toDate
    );
    return {
      count: Number(rows?.[0]?.count ?? 0),
      total: Number(rows?.[0]?.total ?? 0),
      aov: Number(rows?.[0]?.aov ?? 0),
    };
  } catch {
    return { count: 0, total: 0, aov: 0 };
  }
}

async function getCancellationRate(orgId: string, days: number) {
  try {
    const from = new Date(Date.now() - days * 86400 * 1000);
    const rows = await prisma.$queryRawUnsafe<
      Array<{ total: bigint; cancelled: bigint }>
    >(
      `SELECT COUNT(*)::bigint AS total,
              COUNT(*) FILTER (WHERE "status" = 'CANCELLED')::bigint AS cancelled
         FROM "orders"
        WHERE "organizationId" = $1 AND "orderDate" >= $2`,
      orgId,
      from
    );
    const total = Number(rows?.[0]?.total ?? 0);
    const cancelled = Number(rows?.[0]?.cancelled ?? 0);
    return { total, cancelled, rate: total > 0 ? (cancelled / total) * 100 : 0 };
  } catch {
    return { total: 0, cancelled: 0, rate: 0 };
  }
}

async function getPendingPayment(orgId: string) {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "orders"
       WHERE "organizationId" = $1 AND "status" = 'PENDING'`,
      orgId
    );
    return Number(rows?.[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

async function getPendingShipment(orgId: string) {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "orders"
       WHERE "organizationId" = $1 AND "status" IN ('APPROVED', 'INVOICED')`,
      orgId
    );
    return Number(rows?.[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

// 1. orders.count.below_in_period
export const ordersCountBelow: PrimitiveDefinition = {
  key: "orders.count.below_in_period",
  type: "condition",
  module: "orders",
  label: "Orders del período bajan de X",
  description: "Avisa cuando el total de orders en un período queda bajo un umbral.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 720,
  paramsSchema: {
    count: { type: "number", label: "Mínimo de orders", default: 10, required: true },
    period: {
      type: "string",
      label: "Período",
      default: "last_24h",
      required: false,
      options: [
        { value: "last_24h", label: "Últimas 24 hs" },
        { value: "last_7d", label: "Últimos 7 días" },
      ],
    },
  },
  naturalExamples: [
    "avisame si no llegan 10 orders en 24 horas",
    "alertame si vendo menos de 50 pedidos por semana",
  ],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const min = Number(ctx.params.count ?? 10);
    const period = String(ctx.params.period ?? "last_24h");
    const hours = period === "last_7d" ? 24 * 7 : 24;
    const from = new Date(Date.now() - hours * 3600 * 1000);
    const { count } = await getOrdersCount(ctx.orgId, from);
    const triggered = count < min;
    return {
      triggered,
      severity: count === 0 ? "critical" : "warning",
      title: `Solo ${count} orders en ${period === "last_7d" ? "7 días" : "24 horas"}`,
      body: `Umbral mínimo configurado: ${min} orders.`,
      metadata: { count, threshold: min, period },
      cta: "Ver pedidos",
      ctaHref: "/orders",
      dedupeKey: `orders.count.below.${ctx.orgId}.${min}.${period}`,
    };
  },
};

// 2. orders.aov.drops_pct
export const ordersAovDropsPct: PrimitiveDefinition = {
  key: "orders.aov.drops_pct",
  type: "condition",
  module: "orders",
  label: "AOV baja X% vs período anterior",
  description: "Avisa cuando el Ticket Promedio cae X% vs el período inmediato anterior.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    percent: { type: "number", label: "Baja mínima (%)", default: 15, required: true, min: 5 },
    days: { type: "number", label: "Ventana en días", default: 7, required: false, min: 1 },
  },
  naturalExamples: ["avisame si el AOV cae más de 15% vs la semana anterior"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const percent = Number(ctx.params.percent ?? 15);
    const days = Number(ctx.params.days ?? 7);
    const now = new Date();
    const prevTo = new Date(Date.now() - days * 86400 * 1000);
    const prevFrom = new Date(Date.now() - 2 * days * 86400 * 1000);
    const [curr, prev] = await Promise.all([
      getOrdersCount(ctx.orgId, prevTo, now),
      getOrdersCount(ctx.orgId, prevFrom, prevTo),
    ]);
    if (prev.aov <= 0) return { triggered: false };
    const dropPct = ((prev.aov - curr.aov) / prev.aov) * 100;
    const triggered = dropPct >= percent;
    return {
      triggered,
      severity: "warning",
      title: `AOV bajó ${dropPct.toFixed(1)}% vs período anterior`,
      body: `Actual: $ ${Math.round(curr.aov).toLocaleString("es-AR")} · Anterior: $ ${Math.round(prev.aov).toLocaleString("es-AR")}.`,
      metadata: { currAov: curr.aov, prevAov: prev.aov, dropPct },
      cta: "Ver pedidos",
      ctaHref: "/orders",
      dedupeKey: `orders.aov.drops.${ctx.orgId}.${percent}.${days}`,
    };
  },
};

// 3. orders.cancellation_rate.above_pct
export const ordersCancellationRateAbove: PrimitiveDefinition = {
  key: "orders.cancellation_rate.above_pct",
  type: "condition",
  module: "orders",
  label: "Cancelaciones > X%",
  description: "Avisa cuando la tasa de cancelación supera un umbral.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    percent: { type: "number", label: "% máximo aceptable", default: 10, required: true, min: 1, max: 100 },
    days: { type: "number", label: "Ventana en días", default: 7, required: false },
  },
  naturalExamples: ["avisame si las cancelaciones pasan el 10%"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const pct = Number(ctx.params.percent ?? 10);
    const days = Number(ctx.params.days ?? 7);
    const { rate, cancelled, total } = await getCancellationRate(ctx.orgId, days);
    const triggered = rate > pct;
    return {
      triggered,
      severity: rate > pct * 2 ? "critical" : "warning",
      title: `Cancelaciones: ${rate.toFixed(1)}% (últimos ${days}d)`,
      body: `${cancelled} cancelaciones sobre ${total} orders. Umbral: ${pct}%.`,
      metadata: { rate, threshold: pct, cancelled, total, days },
      cta: "Ver pedidos",
      ctaHref: "/orders?status=CANCELLED",
      dedupeKey: `orders.cancellation.${ctx.orgId}.${pct}.${days}`,
    };
  },
};

// 4. orders.pending_payment.count_above
export const pendingPaymentAbove: PrimitiveDefinition = {
  key: "orders.pending_payment.count_above",
  type: "condition",
  module: "orders",
  label: "Orders pendientes de pago > X",
  description: "Avisa cuando hay más de X orders en estado PENDING de pago.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 720,
  paramsSchema: {
    count: { type: "number", label: "Umbral", default: 5, required: true, min: 1 },
  },
  naturalExamples: ["avisame si hay más de 5 orders con pago pendiente"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const threshold = Number(ctx.params.count ?? 5);
    const count = await getPendingPayment(ctx.orgId);
    const triggered = count > threshold;
    return {
      triggered,
      severity: count > threshold * 2 ? "critical" : "warning",
      title: `${count} orders con pago pendiente`,
      body: `Revisar para detectar problemas de procesamiento.`,
      metadata: { count, threshold },
      cta: "Ver pendientes",
      ctaHref: "/orders?status=PENDING",
      dedupeKey: `orders.pending_payment.${ctx.orgId}.${threshold}`,
    };
  },
};

// 5. orders.pending_shipment.count_above
export const pendingShipmentAbove: PrimitiveDefinition = {
  key: "orders.pending_shipment.count_above",
  type: "condition",
  module: "orders",
  label: "Orders pendientes de envío > X",
  description: "Avisa cuando hay más de X orders esperando ser despachadas.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 720,
  paramsSchema: {
    count: { type: "number", label: "Umbral", default: 10, required: true, min: 1 },
  },
  naturalExamples: ["avisame si hay más de 10 orders sin despachar"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const threshold = Number(ctx.params.count ?? 10);
    const count = await getPendingShipment(ctx.orgId);
    const triggered = count > threshold;
    return {
      triggered,
      severity: count > threshold * 2 ? "critical" : "warning",
      title: `${count} orders pendientes de despacho`,
      body: `Revisar para evitar delays de entrega.`,
      metadata: { count, threshold },
      cta: "Ver para despachar",
      ctaHref: "/orders?status=APPROVED",
      dedupeKey: `orders.pending_shipment.${ctx.orgId}.${threshold}`,
    };
  },
};

// 6. orders.report.daily_digest
export const reportDailyDigest: PrimitiveDefinition = {
  key: "orders.report.daily_digest",
  type: "schedule",
  module: "orders",
  label: "Digest diario de ventas",
  description: "Todos los días a la hora que elijas: orders + revenue + AOV del día.",
  defaultSeverity: "info",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 0,
  paramsSchema: {},
  naturalExamples: ["cada día a las 8pm mandame el resumen de ventas"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const today = new Date(new Date().setHours(0, 0, 0, 0));
    const { count, total, aov } = await getOrdersCount(ctx.orgId, today);
    return {
      triggered: true,
      severity: "info",
      title: `Ventas de hoy · ${new Date().toLocaleDateString("es-AR")}`,
      body: `${count} orders · $ ${Math.round(total).toLocaleString("es-AR")} · AOV $ ${Math.round(aov).toLocaleString("es-AR")}`,
      metadata: { count, total, aov },
      cta: "Ver pedidos",
      ctaHref: "/orders",
    };
  },
};

// 7. orders.report.weekly_summary
export const reportOrdersWeekly: PrimitiveDefinition = {
  key: "orders.report.weekly_summary",
  type: "schedule",
  module: "orders",
  label: "Resumen semanal de pedidos",
  description: "Cada semana: orders + revenue + AOV de la semana con comparación vs anterior.",
  defaultSeverity: "info",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 0,
  paramsSchema: {},
  naturalExamples: ["cada lunes mandame las ventas de la semana"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const now = new Date();
    const weekAgo = new Date(Date.now() - 7 * 86400 * 1000);
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400 * 1000);
    const [thisW, prevW] = await Promise.all([
      getOrdersCount(ctx.orgId, weekAgo, now),
      getOrdersCount(ctx.orgId, twoWeeksAgo, weekAgo),
    ]);
    const deltaPct = prevW.total > 0 ? ((thisW.total - prevW.total) / prevW.total) * 100 : 0;
    return {
      triggered: true,
      severity: "info",
      title: "Resumen semanal de ventas",
      body: `${thisW.count} orders · $ ${Math.round(thisW.total).toLocaleString("es-AR")} (${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}% vs semana anterior)`,
      metadata: { thisW, prevW, deltaPct },
      cta: "Ver estado",
      ctaHref: "/finanzas/estado",
    };
  },
};

// 8. orders.count.drops_pct_vs_prev
export const ordersCountDropsPct: PrimitiveDefinition = {
  key: "orders.count.drops_pct_vs_prev",
  type: "condition",
  module: "orders",
  label: "Orders bajan X% vs período anterior",
  description: "Avisa cuando el # de orders baja X% vs período anterior.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    percent: { type: "number", label: "Baja mínima (%)", default: 20, required: true, min: 5 },
    days: { type: "number", label: "Ventana en días", default: 7, required: false, min: 1 },
  },
  naturalExamples: ["avisame si las ventas bajan más de 20% vs la semana pasada"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const percent = Number(ctx.params.percent ?? 20);
    const days = Number(ctx.params.days ?? 7);
    const now = new Date();
    const prevTo = new Date(Date.now() - days * 86400 * 1000);
    const prevFrom = new Date(Date.now() - 2 * days * 86400 * 1000);
    const [curr, prev] = await Promise.all([
      getOrdersCount(ctx.orgId, prevTo, now),
      getOrdersCount(ctx.orgId, prevFrom, prevTo),
    ]);
    if (prev.count <= 0) return { triggered: false };
    const dropPct = ((prev.count - curr.count) / prev.count) * 100;
    const triggered = dropPct >= percent;
    return {
      triggered,
      severity: dropPct > percent * 1.5 ? "critical" : "warning",
      title: `Orders bajaron ${dropPct.toFixed(1)}% vs período anterior`,
      body: `Actual: ${curr.count} · Anterior: ${prev.count}.`,
      metadata: { currCount: curr.count, prevCount: prev.count, dropPct },
      cta: "Ver pedidos",
      ctaHref: "/orders",
      dedupeKey: `orders.count.drops.${ctx.orgId}.${percent}.${days}`,
    };
  },
};

export const ordersPrimitives: PrimitiveDefinition[] = [
  ordersCountBelow,
  ordersCountDropsPct,
  ordersAovDropsPct,
  ordersCancellationRateAbove,
  pendingPaymentAbove,
  pendingShipmentAbove,
  reportDailyDigest,
  reportOrdersWeekly,
];
