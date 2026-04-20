// ═══════════════════════════════════════════════════════════════════
// primitives/ops.ts — Fase 8g-1 Tier 1
// ═══════════════════════════════════════════════════════════════════
// Consolida Tier 1 de operaciones: Products, Aura payouts, Competencia,
// Sistema (sync errors), Security.
// ═══════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import type { PrimitiveDefinition, EvaluationContext, EvaluationResult } from "./types";

// ─────────────────────────────────────────────────────────────
// PRODUCTS
// ─────────────────────────────────────────────────────────────

async function getLowStockCount(orgId: string, safetyLevel: number) {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "products"
       WHERE "organizationId" = $1 AND "stock" IS NOT NULL AND "stock" <= $2 AND "stock" > 0`,
      orgId,
      safetyLevel
    );
    return Number(rows?.[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

async function getZeroStockCount(orgId: string) {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "products"
       WHERE "organizationId" = $1 AND "stock" = 0`,
      orgId
    );
    return Number(rows?.[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export const productsStockBelow: PrimitiveDefinition = {
  key: "products.stock.critical_count_above",
  type: "condition",
  module: "products",
  label: "SKUs bajo safety level > X",
  description: "Avisa cuando hay más de X SKUs con stock bajo el safety level configurado.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 720,
  paramsSchema: {
    count: { type: "number", label: "Umbral de SKUs", default: 10, required: true },
    safetyLevel: { type: "number", label: "Safety level (unidades)", default: 5, required: true },
  },
  naturalExamples: ["avisame si tengo más de 10 SKUs con stock bajo 5 unidades"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const threshold = Number(ctx.params.count ?? 10);
    const safety = Number(ctx.params.safetyLevel ?? 5);
    const count = await getLowStockCount(ctx.orgId, safety);
    const triggered = count > threshold;
    return {
      triggered,
      severity: count > threshold * 2 ? "critical" : "warning",
      title: `${count} SKUs con stock < ${safety} unidades`,
      body: `Riesgo de quiebre de stock. Revisar reorder points.`,
      metadata: { count, threshold, safetyLevel: safety },
      cta: "Ver productos",
      ctaHref: "/products",
      dedupeKey: `products.stock.critical.${ctx.orgId}.${threshold}.${safety}`,
    };
  },
};

export const productsStockZero: PrimitiveDefinition = {
  key: "products.stock.zero_count_above",
  type: "condition",
  module: "products",
  label: "SKUs sin stock > X",
  description: "Avisa cuando hay más de X SKUs en 0 unidades (out of stock).",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    count: { type: "number", label: "Umbral", default: 5, required: true, min: 1 },
  },
  naturalExamples: ["avisame si tengo más de 5 productos sin stock"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const threshold = Number(ctx.params.count ?? 5);
    const count = await getZeroStockCount(ctx.orgId);
    const triggered = count > threshold;
    return {
      triggered,
      severity: count > threshold * 2 ? "critical" : "warning",
      title: `${count} SKUs sin stock`,
      body: `Productos out of stock con potencial de venta perdida.`,
      metadata: { count, threshold },
      cta: "Ver productos",
      ctaHref: "/products?filter=out_of_stock",
      dedupeKey: `products.stock.zero.${ctx.orgId}.${threshold}`,
    };
  },
};

export const productsReportLowStock: PrimitiveDefinition = {
  key: "products.report.low_stock_weekly",
  type: "schedule",
  module: "products",
  label: "Reporte semanal de stock crítico",
  description: "Cada semana: lista de SKUs con stock bajo + valor de inventario en riesgo.",
  defaultSeverity: "info",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 0,
  paramsSchema: {},
  naturalExamples: ["cada lunes mandame el reporte de stock crítico"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const low = await getLowStockCount(ctx.orgId, 5);
    const zero = await getZeroStockCount(ctx.orgId);
    return {
      triggered: true,
      severity: "info",
      title: `Stock: ${low} críticos, ${zero} sin stock`,
      body: `Revisar reorder points y ajustar órdenes de compra.`,
      metadata: { low, zero },
      cta: "Ver productos",
      ctaHref: "/products",
    };
  },
};

// ─────────────────────────────────────────────────────────────
// AURA (Payouts)
// ─────────────────────────────────────────────────────────────

export const auraPayoutsPending: PrimitiveDefinition = {
  key: "aura.payouts.pending_amount_above",
  type: "condition",
  module: "aura",
  label: "Payouts pending > monto",
  description: "Avisa cuando el monto total de payouts pending supera un umbral.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    amount: { type: "number", label: "Monto mínimo ($)", default: 500000, required: true },
  },
  naturalExamples: ["avisame si debo pagar más de $500k a creators"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const threshold = Number(ctx.params.amount ?? 500000);
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ total: string; count: bigint }>>(
        `SELECT COALESCE(SUM("amount"), 0)::text AS total, COUNT(*)::bigint AS count FROM "payouts"
         WHERE "organizationId" = $1 AND "status" = 'PENDING'`,
        ctx.orgId
      );
      const total = Number(rows?.[0]?.total ?? 0);
      const count = Number(rows?.[0]?.count ?? 0);
      const triggered = total > threshold;
      return {
        triggered,
        severity: "warning",
        title: `Payouts pending: $ ${Math.round(total).toLocaleString("es-AR")}`,
        body: `${count} payouts pendientes de pago.`,
        metadata: { total, count, threshold },
        cta: "Ver Aura",
        ctaHref: "/aura",
        dedupeKey: `aura.payouts.pending.${ctx.orgId}.${threshold}`,
      };
    } catch {
      return { triggered: false };
    }
  },
};

export const auraReportPending: PrimitiveDefinition = {
  key: "aura.payouts.report.pending_weekly",
  type: "schedule",
  module: "aura",
  label: "Reporte semanal de payouts pending",
  description: "Cada semana: lista de payouts pendientes ordenada por monto.",
  defaultSeverity: "info",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 0,
  paramsSchema: {},
  naturalExamples: ["cada lunes mandame los payouts pendientes"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ total: string; count: bigint }>>(
        `SELECT COALESCE(SUM("amount"), 0)::text AS total, COUNT(*)::bigint AS count FROM "payouts"
         WHERE "organizationId" = $1 AND "status" = 'PENDING'`,
        ctx.orgId
      );
      const total = Number(rows?.[0]?.total ?? 0);
      const count = Number(rows?.[0]?.count ?? 0);
      return {
        triggered: true,
        severity: "info",
        title: `Aura · ${count} payouts pendientes`,
        body: `Total a pagar: $ ${Math.round(total).toLocaleString("es-AR")}.`,
        metadata: { total, count },
        cta: "Ver Aura",
        ctaHref: "/aura",
      };
    } catch {
      return { triggered: true, severity: "info", title: "Aura · Sin datos", body: "No hay payouts registrados." };
    }
  },
};

// ─────────────────────────────────────────────────────────────
// COMPETENCIA (price drops)
// ─────────────────────────────────────────────────────────────

export const compPriceDropped: PrimitiveDefinition = {
  key: "comp.price.dropped_pct",
  type: "condition",
  module: "competencia",
  label: "Competidor bajó precio X%",
  description: "Avisa cuando un competidor bajó el precio de un producto > X% en el último scrape.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 360,
  paramsSchema: {
    percent: { type: "number", label: "Baja mínima (%)", default: 15, required: true, min: 5 },
  },
  naturalExamples: ["avisame si un competidor baja precio más de 15%"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const pct = Number(ctx.params.percent ?? 15);
    try {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ productName: string; currentPrice: number; previousPrice: number; productUrl: string }>
      >(
        `SELECT "productName", "currentPrice", "previousPrice", "productUrl" FROM "competitor_prices" cp
          JOIN "competitor_stores" cs ON cp."competitorId" = cs.id
         WHERE cs."organizationId" = $1
           AND "previousPrice" > 0
           AND ("previousPrice" - "currentPrice") / "previousPrice" * 100 >= $2
           AND "lastScrapedAt" > NOW() - INTERVAL '24 hours'
         LIMIT 10`,
        ctx.orgId,
        pct
      );
      const count = rows.length;
      if (count === 0) return { triggered: false };
      const sample = rows[0];
      const dropPct =
        ((Number(sample.previousPrice) - Number(sample.currentPrice)) / Number(sample.previousPrice)) * 100;
      return {
        triggered: true,
        severity: "warning",
        title: `${count} competidor${count > 1 ? "es" : ""} bajaron precio > ${pct}%`,
        body: `Ejemplo: "${sample.productName}" bajó ${dropPct.toFixed(1)}% (de $${sample.previousPrice} a $${sample.currentPrice}).`,
        metadata: { count, products: rows, threshold: pct },
        cta: "Ver competencia",
        ctaHref: "/competitors",
        dedupeKey: `comp.price.dropped.${ctx.orgId}.${pct}.${new Date().toISOString().slice(0, 10)}`,
      };
    } catch {
      return { triggered: false };
    }
  },
};

export const compPriceLowerThanMine: PrimitiveDefinition = {
  key: "comp.price.lower_than_mine_by_pct",
  type: "condition",
  module: "competencia",
  label: "Competidor más barato que yo por X%",
  description: "Avisa si un competidor tiene precio X% menor al mío en un producto matcheado.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    percent: { type: "number", label: "Diferencia mínima (%)", default: 10, required: true, min: 1 },
  },
  naturalExamples: ["avisame si un competidor tiene un producto 10% más barato que yo"],
  async evaluate(_ctx: EvaluationContext): Promise<EvaluationResult> {
    // Implementación simplificada: requiere match con products. Stub por ahora.
    return { triggered: false };
  },
};

export const compReportDaily: PrimitiveDefinition = {
  key: "comp.price.report.daily_changes",
  type: "schedule",
  module: "competencia",
  label: "Reporte diario de cambios de precio",
  description: "Todos los días: resumen de cambios de precio detectados en competidores.",
  defaultSeverity: "info",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 0,
  paramsSchema: {},
  naturalExamples: ["todos los días mandame los cambios de precios de competencia"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM "competitor_prices" cp
          JOIN "competitor_stores" cs ON cp."competitorId" = cs.id
         WHERE cs."organizationId" = $1
           AND "previousPrice" IS NOT NULL AND "currentPrice" != "previousPrice"
           AND "lastScrapedAt" > NOW() - INTERVAL '24 hours'`,
        ctx.orgId
      );
      const count = Number(rows?.[0]?.count ?? 0);
      return {
        triggered: true,
        severity: "info",
        title: `${count} cambios de precio detectados (últimas 24hs)`,
        body: count > 0 ? "Revisar para ajustar pricing si corresponde." : "Sin movimientos en competidores.",
        metadata: { count },
        cta: "Ver competencia",
        ctaHref: "/competitors",
      };
    } catch {
      return { triggered: false };
    }
  },
};

// ─────────────────────────────────────────────────────────────
// SISTEMA (Integraciones)
// ─────────────────────────────────────────────────────────────

export const systemConnectionError: PrimitiveDefinition = {
  key: "system.connection.status_error",
  type: "condition",
  module: "sistema",
  label: "Alguna integración en ERROR",
  description: "Avisa cuando cualquier integración (VTEX, MELI, Meta, Google, GA4, GSC) queda en estado ERROR.",
  defaultSeverity: "critical",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 360,
  paramsSchema: {},
  naturalExamples: ["avisame si cualquier integración se cae"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    try {
      const rows = await prisma.connection.findMany({
        where: { organizationId: ctx.orgId, status: "ERROR" },
        select: { platform: true, lastSyncError: true, lastSyncAt: true },
      });
      if (rows.length === 0) return { triggered: false };
      const platforms = rows.map((r) => r.platform).join(", ");
      return {
        triggered: true,
        severity: "critical",
        title: `${rows.length} integración${rows.length > 1 ? "es" : ""} con ERROR: ${platforms}`,
        body: `Última sincronización fallida. Revisar credenciales/conectividad.`,
        metadata: { connections: rows },
        cta: "Ir a Integraciones",
        ctaHref: "/settings/integraciones",
        dedupeKey: `system.connection.error.${ctx.orgId}.${platforms}`,
      };
    } catch {
      return { triggered: false };
    }
  },
};

export const systemSyncStale: PrimitiveDefinition = {
  key: "system.connection.sync_stale_above_hours",
  type: "condition",
  module: "sistema",
  label: "Integración sin sync hace X horas",
  description: "Avisa cuando una integración no se sincroniza hace más de X horas.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 720,
  paramsSchema: {
    hours: { type: "number", label: "Horas máximas", default: 12, required: true, min: 1 },
  },
  naturalExamples: ["avisame si alguna integración no sincroniza hace más de 12 horas"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const hours = Number(ctx.params.hours ?? 12);
    const threshold = new Date(Date.now() - hours * 3600 * 1000);
    try {
      const rows = await prisma.connection.findMany({
        where: {
          organizationId: ctx.orgId,
          status: "ACTIVE",
          lastSuccessfulSyncAt: { lt: threshold },
        },
        select: { platform: true, lastSuccessfulSyncAt: true },
      });
      if (rows.length === 0) return { triggered: false };
      return {
        triggered: true,
        severity: "warning",
        title: `${rows.length} integración${rows.length > 1 ? "es" : ""} sin sync > ${hours}h`,
        body: `Plataformas: ${rows.map((r) => r.platform).join(", ")}.`,
        metadata: { connections: rows, hoursThreshold: hours },
        cta: "Ir a Integraciones",
        ctaHref: "/settings/integraciones",
        dedupeKey: `system.connection.stale.${ctx.orgId}.${hours}`,
      };
    } catch {
      return { triggered: false };
    }
  },
};

export const systemTokenExpiring: PrimitiveDefinition = {
  key: "system.connection.token_expiring_in_days",
  type: "condition",
  module: "sistema",
  label: "Token de integración expira en X días",
  description: "Avisa cuando un token de alguna integración está por expirar.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 10080,
  paramsSchema: {
    days: { type: "number", label: "Días de aviso", default: 7, required: true, min: 1 },
  },
  naturalExamples: ["avisame una semana antes de que expire algún token"],
  async evaluate(_ctx: EvaluationContext): Promise<EvaluationResult> {
    // Requiere lógica de parsing de expiry en credentials JSON. Stub.
    return { triggered: false };
  },
};

export const systemReportHealth: PrimitiveDefinition = {
  key: "system.connection.report.daily_health",
  type: "schedule",
  module: "sistema",
  label: "Reporte diario de salud de integraciones",
  description: "Estado + freshness de todas las integraciones.",
  defaultSeverity: "info",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 0,
  paramsSchema: {},
  naturalExamples: ["cada día mandame el estado de las integraciones"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    try {
      const rows = await prisma.connection.findMany({
        where: { organizationId: ctx.orgId },
        select: { platform: true, status: true, lastSuccessfulSyncAt: true },
      });
      const errs = rows.filter((r) => r.status === "ERROR").length;
      const ok = rows.filter((r) => r.status === "ACTIVE").length;
      return {
        triggered: true,
        severity: errs > 0 ? "warning" : "info",
        title: `Integraciones · ${ok} OK · ${errs} error${errs !== 1 ? "es" : ""}`,
        body: rows.map((r) => `${r.platform}: ${r.status}`).join("\n"),
        metadata: { rows, ok, errs },
        cta: "Ver integraciones",
        ctaHref: "/settings/integraciones",
      };
    } catch {
      return { triggered: false };
    }
  },
};

// ─────────────────────────────────────────────────────────────
// SECURITY
// ─────────────────────────────────────────────────────────────

export const securityLoginFailures: PrimitiveDefinition = {
  key: "security.login.failed_attempts_above",
  type: "condition",
  module: "security",
  label: "Intentos fallidos de login > X",
  description: "Avisa cuando hay más de X intentos de login fallidos en las últimas 24h.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 360,
  paramsSchema: {
    count: { type: "number", label: "Umbral", default: 5, required: true, min: 1 },
  },
  naturalExamples: ["avisame si hay más de 5 intentos fallidos de login"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const threshold = Number(ctx.params.count ?? 5);
    try {
      const since = new Date(Date.now() - 24 * 3600 * 1000);
      const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM "login_events" le
          JOIN "users" u ON le."userId" = u.id
         WHERE u."organizationId" = $1 AND le."success" = FALSE AND le."createdAt" >= $2`,
        ctx.orgId,
        since
      );
      const count = Number(rows?.[0]?.count ?? 0);
      const triggered = count > threshold;
      return {
        triggered,
        severity: count > threshold * 2 ? "critical" : "warning",
        title: `${count} intentos de login fallidos (últimas 24h)`,
        body: `Revisar si hay intentos de acceso no autorizados.`,
        metadata: { count, threshold },
        cta: "Ver seguridad",
        ctaHref: "/settings/seguridad",
        dedupeKey: `security.login.failures.${ctx.orgId}.${threshold}`,
      };
    } catch {
      return { triggered: false };
    }
  },
};

export const securityApiKeyExpiring: PrimitiveDefinition = {
  key: "security.api_keys.expiring_in_days",
  type: "condition",
  module: "security",
  label: "API Key expira en X días",
  description: "Avisa cuando una API Key está por expirar.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 10080,
  paramsSchema: {
    days: { type: "number", label: "Días de aviso", default: 7, required: true, min: 1 },
  },
  naturalExamples: ["avisame una semana antes de que expire alguna API key"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const days = Number(ctx.params.days ?? 7);
    try {
      const threshold = new Date(Date.now() + days * 86400 * 1000);
      const rows = await prisma.$queryRawUnsafe<Array<{ name: string; expiresAt: Date }>>(
        `SELECT "name", "expiresAt" FROM "api_keys"
         WHERE "organizationId" = $1 AND "revokedAt" IS NULL AND "expiresAt" IS NOT NULL AND "expiresAt" <= $2`,
        ctx.orgId,
        threshold
      );
      if (rows.length === 0) return { triggered: false };
      return {
        triggered: true,
        severity: "warning",
        title: `${rows.length} API Key${rows.length > 1 ? "s" : ""} próxima${rows.length > 1 ? "s" : ""} a expirar`,
        body: rows.map((r) => `${r.name}: expira ${new Date(r.expiresAt).toLocaleDateString("es-AR")}`).join("\n"),
        metadata: { keys: rows, daysThreshold: days },
        cta: "Ver API Keys",
        ctaHref: "/settings/api-keys",
        dedupeKey: `security.api_keys.expiring.${ctx.orgId}.${days}`,
      };
    } catch {
      return { triggered: false };
    }
  },
};

export const securityReportWeekly: PrimitiveDefinition = {
  key: "security.report.login_activity_weekly",
  type: "schedule",
  module: "security",
  label: "Reporte semanal de logins",
  description: "Cada semana: actividad de logins del equipo + intentos fallidos.",
  defaultSeverity: "info",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 0,
  paramsSchema: {},
  naturalExamples: ["cada lunes mandame el reporte de seguridad de la semana"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    try {
      const since = new Date(Date.now() - 7 * 86400 * 1000);
      const rows = await prisma.$queryRawUnsafe<
        Array<{ total: bigint; success: bigint; failed: bigint }>
      >(
        `SELECT COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE le."success" = TRUE)::bigint AS success,
                COUNT(*) FILTER (WHERE le."success" = FALSE)::bigint AS failed
           FROM "login_events" le
           JOIN "users" u ON le."userId" = u.id
          WHERE u."organizationId" = $1 AND le."createdAt" >= $2`,
        ctx.orgId,
        since
      );
      const total = Number(rows?.[0]?.total ?? 0);
      const success = Number(rows?.[0]?.success ?? 0);
      const failed = Number(rows?.[0]?.failed ?? 0);
      return {
        triggered: true,
        severity: failed > 5 ? "warning" : "info",
        title: `Logins semana: ${success} OK, ${failed} fallidos`,
        body: `Total de eventos: ${total}.`,
        metadata: { total, success, failed },
        cta: "Ver seguridad",
        ctaHref: "/settings/seguridad",
      };
    } catch {
      return { triggered: false };
    }
  },
};

// ─────────────────────────────────────────────────────────────
// Export consolidado
// ─────────────────────────────────────────────────────────────

export const opsPrimitives: PrimitiveDefinition[] = [
  // Products
  productsStockBelow,
  productsStockZero,
  productsReportLowStock,
  // Aura
  auraPayoutsPending,
  auraReportPending,
  // Competencia
  compPriceDropped,
  compPriceLowerThanMine,
  compReportDaily,
  // Sistema
  systemConnectionError,
  systemSyncStale,
  systemTokenExpiring,
  systemReportHealth,
  // Security
  securityLoginFailures,
  securityApiKeyExpiring,
  securityReportWeekly,
];
