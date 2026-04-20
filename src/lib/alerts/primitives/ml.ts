// ═══════════════════════════════════════════════════════════════════
// primitives/ml.ts — Fase 8g-1 Tier 1
// ═══════════════════════════════════════════════════════════════════
// MercadoLibre: preguntas, reputation, claims.
// ═══════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import type { PrimitiveDefinition, EvaluationContext, EvaluationResult } from "./types";

async function getUnansweredQuestions(orgId: string, hoursAgo: number) {
  try {
    const threshold = new Date(Date.now() - hoursAgo * 3600 * 1000);
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "ml_questions"
       WHERE "organizationId" = $1 AND "status" = 'UNANSWERED' AND "dateCreated" < $2`,
      orgId,
      threshold
    );
    return Number(rows?.[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

async function getReputationSnapshot(orgId: string) {
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ reputationLevel: string; cancellationRate: number; claimsRate: number }>
    >(
      `SELECT "reputationLevel", "cancellationRate", "claimsRate" FROM "ml_seller_metrics_daily"
       WHERE "organizationId" = $1 ORDER BY "date" DESC LIMIT 1`,
      orgId
    );
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

// 1. ml.questions.unanswered_count_above
export const mlQuestionsUnansweredAbove: PrimitiveDefinition = {
  key: "ml.questions.unanswered_count_above",
  type: "condition",
  module: "ml",
  label: "Preguntas ML sin responder > X",
  description: "Avisa cuando hay más de X preguntas sin responder.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 360,
  paramsSchema: {
    count: { type: "number", label: "Umbral", default: 5, required: true, min: 1 },
  },
  naturalExamples: ["avisame si tengo más de 5 preguntas sin responder en ML"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const threshold = Number(ctx.params.count ?? 5);
    const count = await getUnansweredQuestions(ctx.orgId, 0);
    const triggered = count > threshold;
    return {
      triggered,
      severity: count > threshold * 3 ? "critical" : "warning",
      title: `${count} preguntas sin responder en ML`,
      body: `Umbral configurado: ${threshold}. Responder rápido mejora tu reputación.`,
      metadata: { count, threshold },
      cta: "Ver preguntas",
      ctaHref: "/mercadolibre/preguntas",
      dedupeKey: `ml.questions.unanswered.${ctx.orgId}.${threshold}`,
    };
  },
};

// 2. ml.questions.unanswered_over_hours
export const mlQuestionsOverHours: PrimitiveDefinition = {
  key: "ml.questions.unanswered_over_hours",
  type: "condition",
  module: "ml",
  label: "Preguntas > X horas sin responder",
  description: "Avisa cuando hay preguntas con más de X horas sin respuesta.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 720,
  paramsSchema: {
    hours: { type: "number", label: "Horas máximas", default: 24, required: true, min: 1 },
    minCount: { type: "number", label: "Cantidad mínima", default: 1, required: false, min: 1 },
  },
  naturalExamples: ["avisame si hay preguntas sin responder hace más de 24 horas"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const hours = Number(ctx.params.hours ?? 24);
    const minCount = Number(ctx.params.minCount ?? 1);
    const count = await getUnansweredQuestions(ctx.orgId, hours);
    const triggered = count >= minCount;
    return {
      triggered,
      severity: count > 5 ? "critical" : "warning",
      title: `${count} pregunta${count > 1 ? "s" : ""} sin responder > ${hours} hs`,
      body: `Responder dentro de 24 hs es clave para mantener reputación verde en ML.`,
      metadata: { count, hoursThreshold: hours },
      cta: "Responder ahora",
      ctaHref: "/mercadolibre/preguntas",
      dedupeKey: `ml.questions.over_hours.${ctx.orgId}.${hours}`,
    };
  },
};

// 3. ml.reputation.level_dropped
export const mlReputationLevelDropped: PrimitiveDefinition = {
  key: "ml.reputation.level_dropped",
  type: "condition",
  module: "ml",
  label: "Reputation bajó de nivel",
  description: "Avisa si tu reputation level cae (5_green → 4_light_green → 3_yellow, etc).",
  defaultSeverity: "critical",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    minLevel: {
      type: "string",
      label: "Mantener al menos",
      default: "5_green",
      required: true,
      options: [
        { value: "5_green", label: "Verde" },
        { value: "4_light_green", label: "Verde claro" },
        { value: "3_yellow", label: "Amarillo" },
      ],
    },
  },
  naturalExamples: [
    "avisame si la reputation de ML no está en verde",
    "if my ML reputation drops alert me",
  ],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const minLevel = String(ctx.params.minLevel ?? "5_green");
    const snap = await getReputationSnapshot(ctx.orgId);
    if (!snap) return { triggered: false };
    const levels = ["1_red", "2_orange", "3_yellow", "4_light_green", "5_green"];
    const minIdx = levels.indexOf(minLevel);
    const currIdx = levels.indexOf(snap.reputationLevel);
    if (minIdx < 0 || currIdx < 0) return { triggered: false };
    const triggered = currIdx < minIdx;
    return {
      triggered,
      severity: "critical",
      title: `Reputation ML: ${snap.reputationLevel}`,
      body: `Tu nivel actual está por debajo del mínimo configurado (${minLevel}). Cancellation rate: ${(snap.cancellationRate * 100).toFixed(1)}% · Claims rate: ${(snap.claimsRate * 100).toFixed(1)}%.`,
      metadata: { currentLevel: snap.reputationLevel, minLevel, snap },
      cta: "Ver MercadoLibre",
      ctaHref: "/mercadolibre",
      dedupeKey: `ml.reputation.level_dropped.${ctx.orgId}.${minLevel}`,
    };
  },
};

// 4. ml.claims.active_count_above
export const mlClaimsActiveAbove: PrimitiveDefinition = {
  key: "ml.claims.active_count_above",
  type: "condition",
  module: "ml",
  label: "Claims ML activos > X",
  description: "Avisa cuando hay más de X claims activos.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 720,
  paramsSchema: {
    count: { type: "number", label: "Umbral", default: 3, required: true, min: 1 },
  },
  naturalExamples: ["avisame si tengo más de 3 reclamos activos en ML"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const threshold = Number(ctx.params.count ?? 3);
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM "ml_claims" WHERE "organizationId" = $1 AND "status" NOT IN ('closed', 'resolved')`,
        ctx.orgId
      );
      const count = Number(rows?.[0]?.count ?? 0);
      const triggered = count > threshold;
      return {
        triggered,
        severity: count > threshold * 2 ? "critical" : "warning",
        title: `${count} claims activos en ML`,
        body: `Atender rápido para evitar impacto en reputation.`,
        metadata: { count, threshold },
        cta: "Ver claims",
        ctaHref: "/mercadolibre/claims",
        dedupeKey: `ml.claims.active.${ctx.orgId}.${threshold}`,
      };
    } catch {
      return { triggered: false };
    }
  },
};

// 5. ml.cancellation_rate.above_pct
export const mlCancellationRateAbove: PrimitiveDefinition = {
  key: "ml.cancellation_rate.above_pct",
  type: "condition",
  module: "ml",
  label: "Cancellation rate ML > X%",
  description: "Avisa cuando la tasa de cancelación en ML supera un umbral.",
  defaultSeverity: "warning",
  defaultChannels: ["in_app", "email"],
  defaultCooldownMinutes: 1440,
  paramsSchema: {
    percent: { type: "number", label: "Umbral (%)", default: 3, required: true, min: 1, max: 50 },
  },
  naturalExamples: ["avisame si las cancelaciones en ML pasan el 3%"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const pct = Number(ctx.params.percent ?? 3);
    const snap = await getReputationSnapshot(ctx.orgId);
    if (!snap) return { triggered: false };
    const rate = Number(snap.cancellationRate ?? 0) * 100;
    const triggered = rate > pct;
    return {
      triggered,
      severity: rate > pct * 2 ? "critical" : "warning",
      title: `Cancellation rate ML: ${rate.toFixed(1)}%`,
      body: `Supera el umbral de ${pct}% que afecta tu reputation.`,
      metadata: { rate, threshold: pct },
      cta: "Ver métricas",
      ctaHref: "/mercadolibre",
      dedupeKey: `ml.cancellation_rate.${ctx.orgId}.${pct}`,
    };
  },
};

// 6. ml.report.daily_snapshot
export const mlReportDaily: PrimitiveDefinition = {
  key: "ml.report.daily_snapshot",
  type: "schedule",
  module: "ml",
  label: "Snapshot diario de MercadoLibre",
  description: "Todos los días: preguntas pendientes, reputation, claims activos, cancellation rate.",
  defaultSeverity: "info",
  defaultChannels: ["in_app"],
  defaultCooldownMinutes: 0,
  paramsSchema: {},
  naturalExamples: ["todos los días a las 9 mandame el estado de ML"],
  async evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
    const [qCount, snap] = await Promise.all([
      getUnansweredQuestions(ctx.orgId, 0),
      getReputationSnapshot(ctx.orgId),
    ]);
    return {
      triggered: true,
      severity: "info",
      title: `Snapshot ML · ${new Date().toLocaleDateString("es-AR")}`,
      body: `Preguntas: ${qCount} · Reputation: ${snap?.reputationLevel ?? "N/A"} · Cancelaciones: ${((Number(snap?.cancellationRate) ?? 0) * 100).toFixed(1)}%`,
      metadata: { qCount, snap },
      cta: "Abrir MercadoLibre",
      ctaHref: "/mercadolibre",
    };
  },
};

export const mlPrimitives: PrimitiveDefinition[] = [
  mlQuestionsUnansweredAbove,
  mlQuestionsOverHours,
  mlReputationLevelDropped,
  mlClaimsActiveAbove,
  mlCancellationRateAbove,
  mlReportDaily,
];
