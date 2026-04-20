// ═══════════════════════════════════════════════════════════════════
// alert-hub.ts — Fase 8a (actualizado 8e)
// ═══════════════════════════════════════════════════════════════════
// Consolidador central de alertas de NitroSales. Recolecta de todas
// las fuentes activas y normaliza al formato UnifiedAlert.
//
// Fuentes activas (Sesion 48):
//   - Finanzas / narrative.ts (runway, margin, revenue YoY, ad_heavy, burn)
//   - Finanzas / predictive-alerts.ts (shipping spike, COGS spike, CAC>LTV,
//                                       payback long, fiscal imminent)
//   - Fiscal / fiscal-monotributo.ts (cerca del tope cat, excede tope)
//   - Sistema / connections (sync error, token expirado)
//   - MercadoLibre (preguntas > 24h, claims activos, reputation bajo)
//   - Aurum async (query largas con aviso al terminar) — desde Fase 8f
//
// Fuentes "proximamente" (se muestran en sidebar pero no emiten aun):
//   - Bondly (loyalty/referrals)
//   - Aura (creator economy)
//   - Nitropixel (analytics)
//
// Favoritas (Fase 8e): cada user puede marcar alertas como favoritas,
// y siempre aparecen primero en la lista.
// ═══════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import type { FinancialAlert } from "@/types/finanzas";

export type AlertSource =
  | "finanzas_narrative"
  | "finanzas_predictive"
  | "fiscal_monotributo"
  | "fiscal_calendar"
  | "marketing_cac_ltv"
  | "mercadolibre"
  | "system_sync"
  | "inventory"
  | "aurum"
  | "bondly"
  | "aura"
  | "nitropixel"
  | "custom";

export type AlertCategory =
  | "finanzas"
  | "fiscal"
  | "marketing"
  | "operaciones"
  | "ventas"
  | "sistema"
  | "asistente";

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertPriority = "HIGH" | "MEDIUM" | "LOW";

export interface UnifiedAlert {
  id: string;                // deterministico (ej: `finanzas.predictive.shipping_spike.2026-04`)
  source: AlertSource;
  category: AlertCategory;
  severity: AlertSeverity;
  priority: AlertPriority;
  title: string;
  body: string;
  cta?: string | null;
  ctaHref?: string | null;   // Fase 8e: link directo del CTA
  metadata?: Record<string, any>;
  createdAt: string;
  expiresAt?: string | null;
  favorited?: boolean;       // Fase 8e: marcada como favorita por el user
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function priorityToSeverity(p: AlertPriority): AlertSeverity {
  if (p === "HIGH") return "critical";
  if (p === "MEDIUM") return "warning";
  return "info";
}

function severityToPriority(s: AlertSeverity): AlertPriority {
  if (s === "critical") return "HIGH";
  if (s === "warning") return "MEDIUM";
  return "LOW";
}

function normalizeFromFinancialAlert(
  alert: FinancialAlert,
  source: AlertSource,
  category: AlertCategory
): UnifiedAlert {
  return {
    id: alert.id,
    source,
    category,
    severity: priorityToSeverity(alert.priority),
    priority: alert.priority,
    title: alert.title,
    body: alert.body,
    createdAt: alert.createdAt,
  };
}

// ─────────────────────────────────────────────────────────────
// Fuente: system_sync (errores de sincronizacion de plataformas)
// ─────────────────────────────────────────────────────────────
async function getSystemSyncAlerts(orgId: string): Promise<UnifiedAlert[]> {
  const connections = await prisma.connection.findMany({
    where: { organizationId: orgId, status: "ERROR" },
    select: {
      platform: true,
      lastSyncAt: true,
      lastSyncError: true,
    },
  });

  const now = new Date().toISOString();
  return connections.map((c) => ({
    id: `system.sync_error.${c.platform}`,
    source: "system_sync" as const,
    category: "sistema" as const,
    severity: "warning" as AlertSeverity,
    priority: "MEDIUM" as AlertPriority,
    title: `Sync ${c.platform} con error`,
    body:
      c.lastSyncError ?? "Último intento de sincronización falló. Revisar configuración.",
    cta: "Ir a Integraciones",
    ctaHref: "/settings/integraciones",
    metadata: {
      platform: c.platform,
      lastSyncAt: c.lastSyncAt,
    },
    createdAt: c.lastSyncAt?.toISOString() ?? now,
  }));
}

// ─────────────────────────────────────────────────────────────
// Fuente: mercadolibre (preguntas sin responder, claims, reputation)
// ─────────────────────────────────────────────────────────────
async function getMercadoLibreAlerts(orgId: string): Promise<UnifiedAlert[]> {
  const out: UnifiedAlert[] = [];
  const now = new Date().toISOString();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const unansweredCount = await prisma.$queryRawUnsafe<
      Array<{ count: bigint }>
    >(
      `SELECT COUNT(*)::bigint AS count
         FROM "ml_questions"
        WHERE "organizationId" = $1
          AND "status" = 'UNANSWERED'
          AND "dateCreated" < $2`,
      orgId,
      twentyFourHoursAgo
    ).catch(() => [{ count: BigInt(0) }]);

    const n = Number(unansweredCount?.[0]?.count ?? 0);
    if (n > 0) {
      out.push({
        id: `ml.questions_unanswered_24h.${new Date().toISOString().slice(0, 10)}`,
        source: "mercadolibre",
        category: "ventas",
        severity: n >= 5 ? "critical" : "warning",
        priority: n >= 5 ? "HIGH" : "MEDIUM",
        title: `${n} pregunta${n !== 1 ? "s" : ""} sin responder hace más de 24h`,
        body: `Afectan tu reputación en MercadoLibre. Respondé lo antes posible.`,
        cta: "Ver preguntas",
        ctaHref: "/mercadolibre/preguntas",
        metadata: { count: n },
        createdAt: now,
      });
    }
  } catch {
    // silent fail
  }

  return out;
}

// ─────────────────────────────────────────────────────────────
// Fuente: fiscal_calendar (vencimientos proximos)
// ─────────────────────────────────────────────────────────────
async function getFiscalCalendarAlerts(orgId: string): Promise<UnifiedAlert[]> {
  try {
    const {
      buildDefaultObligations,
      expandObligations,
      applyOverrides,
    } = await import("@/lib/finanzas/fiscal-calendar");

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
    const nonInformative = expanded.filter((o) => !o.isInformative);

    const out: UnifiedAlert[] = [];
    const now = new Date().toISOString();
    for (const o of nonInformative) {
      const d = new Date(o.dueDate + "T00:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const days = Math.round(
        (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (days >= 0 && days <= 5) {
        const priority: AlertPriority = days <= 1 ? "HIGH" : "MEDIUM";
        out.push({
          id: `fiscal.due_soon.${o.defaultKey}.${o.dueDate}`,
          source: "fiscal_calendar",
          category: "fiscal",
          severity: days <= 1 ? "critical" : "warning",
          priority,
          title:
            days === 0
              ? `${o.name} vence hoy`
              : days === 1
              ? `${o.name} vence mañana`
              : `${o.name} vence en ${days} días`,
          body: o.note ?? "Preparar pago y documentación.",
          cta: "Ver calendario fiscal",
          ctaHref: "/finanzas/fiscal",
          metadata: { category: o.category, dueDate: o.dueDate, amount: o.amount },
          createdAt: now,
        });
      }
    }
    return out;
  } catch (err) {
    console.warn("[alert-hub] fiscal_calendar error:", err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Fuente: fiscal_monotributo
// ─────────────────────────────────────────────────────────────
async function getFiscalMonotributoAlerts(
  orgId: string
): Promise<UnifiedAlert[]> {
  try {
    const {
      analyzeMonotributo,
    } = await import("@/lib/finanzas/fiscal-monotributo");

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const settings = (org?.settings as Record<string, unknown>) || {};
    const profile = (settings.fiscalProfile as any) || null;
    if (!profile || profile.taxRegime !== "MONOTRIBUTO") return [];

    const from = new Date();
    from.setUTCMonth(from.getUTCMonth() - 11);
    from.setUTCDate(1);
    const rows = await prisma.$queryRawUnsafe<
      Array<{ month: string; revenue: string }>
    >(
      `SELECT TO_CHAR(DATE_TRUNC('month', "orderDate"), 'YYYY-MM') AS month,
              COALESCE(SUM("totalValue"), 0)::text AS revenue
         FROM orders
        WHERE "organizationId" = $1 AND "orderDate" >= $2
        GROUP BY 1
        ORDER BY 1 ASC`,
      orgId,
      from
    );
    const series = rows.map((r) => Number(r.revenue ?? 0));
    const actual = series.reduce((s, v) => s + v, 0);
    const last3 = series.slice(-3);
    const pace = last3.length
      ? last3.reduce((s, v) => s + v, 0) / last3.length
      : 0;
    const projected = Math.max(actual, pace * 12);

    const analysis = analyzeMonotributo({
      currentCategory: profile.monotributoCategory || "A",
      projectedRevenue12m: projected,
      actualRevenueLast12m: actual,
      monthlyRevenueSeries: series,
    });

    const now = new Date().toISOString();
    return analysis.alerts.map((a: any) => ({
      id: `fiscal.monotributo.${a.id}`,
      source: "fiscal_monotributo" as const,
      category: "fiscal" as const,
      severity: a.severity as AlertSeverity,
      priority: severityToPriority(a.severity as AlertSeverity),
      title: a.title,
      body: a.body,
      cta: a.cta ?? null,
      ctaHref: "/finanzas/fiscal",
      createdAt: now,
    }));
  } catch (err) {
    console.warn("[alert-hub] monotributo error:", err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Fuente: finanzas_predictive
// ─────────────────────────────────────────────────────────────
async function getPredictiveFinanceAlerts(
  baseUrl: string,
  cookie: string
): Promise<UnifiedAlert[]> {
  try {
    const res = await fetch(`${baseUrl}/api/finance/alerts/predictive`, {
      headers: cookie ? { Cookie: cookie } : {},
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = await res.json();
    const alerts = (json.alerts ?? []) as FinancialAlert[];
    return alerts.map((a) => {
      const base = normalizeFromFinancialAlert(
        a,
        "finanzas_predictive",
        "finanzas"
      );
      return { ...base, ctaHref: "/finanzas/pulso" };
    });
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Fuente: aurum (async task completions) — Fase 8f (stub por ahora)
// ─────────────────────────────────────────────────────────────
async function getAurumAsyncAlerts(
  _orgId: string,
  _userId: string | null
): Promise<UnifiedAlert[]> {
  // Implementacion real en Fase 8f. Por ahora devuelve vacio.
  return [];
}

// ─────────────────────────────────────────────────────────────
// Favoritas del user (Fase 8e)
// ─────────────────────────────────────────────────────────────
async function getUserFavorites(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ alertId: string }>>(
      `SELECT "alertId" FROM "user_alert_favorites" WHERE "userId" = $1`,
      userId
    );
    return new Set(rows.map((r) => r.alertId));
  } catch {
    return new Set();
  }
}

// ─────────────────────────────────────────────────────────────
// Build unificado
// ─────────────────────────────────────────────────────────────
export async function buildUnifiedAlerts(params: {
  orgId: string;
  userId?: string | null;
  baseUrl?: string;
  cookie?: string;
}): Promise<{
  alerts: UnifiedAlert[];
  countsBySource: Record<AlertSource, number>;
  countsBySeverity: Record<AlertSeverity, number>;
  countsByCategory: Record<string, number>;
  favoriteCount: number;
}> {
  const { orgId, userId, baseUrl, cookie } = params;

  const [
    systemSync,
    mercadolibre,
    fiscalCalendar,
    fiscalMono,
    predictive,
    aurumAsync,
    favorites,
  ] = await Promise.all([
    getSystemSyncAlerts(orgId),
    getMercadoLibreAlerts(orgId),
    getFiscalCalendarAlerts(orgId),
    getFiscalMonotributoAlerts(orgId),
    baseUrl ? getPredictiveFinanceAlerts(baseUrl, cookie ?? "") : Promise.resolve([]),
    getAurumAsyncAlerts(orgId, userId ?? null),
    getUserFavorites(userId ?? null),
  ]);

  const all = [
    ...systemSync,
    ...mercadolibre,
    ...fiscalCalendar,
    ...fiscalMono,
    ...predictive,
    ...aurumAsync,
  ].map((a) => ({
    ...a,
    favorited: favorites.has(a.id),
  }));

  // Sort: favoritas primero, luego HIGH > MEDIUM > LOW, luego por fecha desc
  const priorityOrder: Record<AlertPriority, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2,
  };
  all.sort((a, b) => {
    if (a.favorited && !b.favorited) return -1;
    if (!a.favorited && b.favorited) return 1;
    const diff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (diff !== 0) return diff;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const countsBySource = all.reduce(
    (acc, a) => ({ ...acc, [a.source]: (acc[a.source] ?? 0) + 1 }),
    {} as Record<AlertSource, number>
  );
  const countsBySeverity = all.reduce(
    (acc, a) => ({ ...acc, [a.severity]: (acc[a.severity] ?? 0) + 1 }),
    {} as Record<AlertSeverity, number>
  );
  const countsByCategory = all.reduce(
    (acc, a) => ({ ...acc, [a.category]: (acc[a.category] ?? 0) + 1 }),
    {} as Record<string, number>
  );
  const favoriteCount = all.filter((a) => a.favorited).length;

  return { alerts: all, countsBySource, countsBySeverity, countsByCategory, favoriteCount };
}

// ─────────────────────────────────────────────────────────────
// Metadata para UI (Fase 8e: agrega iconKey + comingSoon)
// ─────────────────────────────────────────────────────────────
export const SOURCE_META: Record<
  AlertSource,
  {
    label: string;
    color: string;
    categoryLabel: string;
    iconKey: string;       // lucide icon name
    comingSoon?: boolean;
  }
> = {
  finanzas_narrative: {
    label: "Narrativa financiera",
    color: "#f59e0b",
    categoryLabel: "Finanzas",
    iconKey: "DollarSign",
  },
  finanzas_predictive: {
    label: "Alertas predictivas",
    color: "#0ea5e9",
    categoryLabel: "Finanzas",
    iconKey: "TrendingUp",
  },
  fiscal_monotributo: {
    label: "Monotributo",
    color: "#10b981",
    categoryLabel: "Fiscal",
    iconKey: "Receipt",
  },
  fiscal_calendar: {
    label: "Vencimientos fiscales",
    color: "#8b5cf6",
    categoryLabel: "Fiscal",
    iconKey: "CalendarClock",
  },
  marketing_cac_ltv: {
    label: "CAC / LTV",
    color: "#ec4899",
    categoryLabel: "Marketing",
    iconKey: "Target",
  },
  mercadolibre: {
    label: "MercadoLibre",
    color: "#fed100",
    categoryLabel: "Ventas",
    iconKey: "ShoppingBag",
  },
  system_sync: {
    label: "Sincronización",
    color: "#64748b",
    categoryLabel: "Sistema",
    iconKey: "RefreshCw",
  },
  inventory: {
    label: "Inventario",
    color: "#f97316",
    categoryLabel: "Operaciones",
    iconKey: "Package",
  },
  aurum: {
    label: "Aurum",
    color: "#0ea5e9",
    categoryLabel: "Asistente",
    iconKey: "Sparkles",
  },
  bondly: {
    label: "Bondly",
    color: "#a855f7",
    categoryLabel: "Ventas",
    iconKey: "Heart",
    comingSoon: true,
  },
  aura: {
    label: "Aura",
    color: "#f43f5e",
    categoryLabel: "Marketing",
    iconKey: "Wand2",
    comingSoon: true,
  },
  nitropixel: {
    label: "Nitropixel",
    color: "#6366f1",
    categoryLabel: "Marketing",
    iconKey: "Zap",
    comingSoon: true,
  },
  custom: {
    label: "Custom",
    color: "#6366f1",
    categoryLabel: "Otros",
    iconKey: "Bell",
  },
};
