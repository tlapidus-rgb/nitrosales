// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// alerts/engine.ts — Fase 8g-1
// ═══════════════════════════════════════════════════════════════════
// Motor de evaluación de reglas de alertas.
//
// - Lee rules activas del user/org
// - Evalúa cada primitive key llamando a la función evaluate()
// - Respeta cooldown por rule
// - Genera UnifiedAlert cuando dispara
// - Envía email si el rule tiene canal email
// - Actualiza lastFiredAt
// ═══════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import { getPrimitive } from "./primitives";
import type { UnifiedAlert, AlertSource } from "./alert-hub";

export interface StoredRule {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  type: "condition" | "schedule" | "anomaly";
  primitiveKey: string;
  params: Record<string, any>;
  operator: any;
  schedule: any;
  channels: string[];
  cooldownMinutes: number;
  severity: string;
  enabled: boolean;
  lastFiredAt: Date | null;
  nextFireAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function loadUserRules(
  orgId: string,
  userId: string | null
): Promise<StoredRule[]> {
  if (!userId) return [];
  try {
    const rows = await prisma.$queryRawUnsafe<StoredRule[]>(
      `SELECT * FROM "alert_rules"
       WHERE "organizationId" = $1 AND "userId" = $2 AND "enabled" = TRUE
       ORDER BY "createdAt" DESC`,
      orgId,
      userId
    );
    return rows;
  } catch {
    return [];
  }
}

// Evalúa una regla y devuelve UnifiedAlert si cumple + en cooldown OK
export async function evaluateRule(
  rule: StoredRule
): Promise<UnifiedAlert | null> {
  const primitive = getPrimitive(rule.primitiveKey);
  if (!primitive) return null;

  // Check cooldown (solo para type='condition')
  if (rule.type === "condition" && rule.lastFiredAt) {
    const elapsedMs = Date.now() - new Date(rule.lastFiredAt).getTime();
    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    if (elapsedMs < cooldownMs) return null; // en cooldown, skip
  }

  try {
    const result = await primitive.evaluate({
      orgId: rule.organizationId,
      userId: rule.userId,
      params: rule.params ?? {},
      now: new Date(),
      lastFiredAt: rule.lastFiredAt,
    });

    if (!result.triggered) return null;

    const id = result.dedupeKey ?? `rule.${rule.id}.${Date.now()}`;
    const alert: UnifiedAlert = {
      id,
      source: "custom",
      category: (primitive.module as any) === "fiscal" || primitive.module === "finanzas"
        ? (primitive.module as any)
        : (primitive.module as any) === "ml"
        ? "ventas"
        : primitive.module === "meta" || primitive.module === "google"
        ? "marketing"
        : primitive.module === "aura"
        ? "marketing"
        : primitive.module === "competencia"
        ? "ventas"
        : primitive.module === "sistema"
        ? "sistema"
        : primitive.module === "security"
        ? "sistema"
        : "ventas",
      severity: (result.severity ?? (rule.severity as any) ?? "warning") as any,
      priority: result.severity === "critical" ? "HIGH" : result.severity === "warning" ? "MEDIUM" : "LOW",
      title: result.title ?? rule.name,
      body: result.body ?? "Regla personalizada disparada.",
      cta: result.cta,
      ctaHref: result.ctaHref,
      metadata: { ...result.metadata, ruleId: rule.id, primitiveKey: rule.primitiveKey },
      createdAt: new Date().toISOString(),
    };

    // Update lastFiredAt
    await prisma.$executeRawUnsafe(
      `UPDATE "alert_rules" SET "lastFiredAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $1`,
      rule.id
    );

    // TODO: envío email si channel includes 'email' (siguiente commit)

    return alert;
  } catch (err) {
    console.warn(`[alerts/engine] Error evaluating rule ${rule.id}:`, err);
    return null;
  }
}

// Evalúa todas las reglas de un user en paralelo
export async function evaluateAllUserRules(
  orgId: string,
  userId: string | null
): Promise<UnifiedAlert[]> {
  const rules = await loadUserRules(orgId, userId);
  if (rules.length === 0) return [];
  const results = await Promise.all(rules.map((r) => evaluateRule(r)));
  return results.filter((r): r is UnifiedAlert => r !== null);
}

// Calcula el nextFireAt para una rule de schedule
export function computeNextFireAt(schedule: any, from: Date = new Date()): Date | null {
  if (!schedule || !schedule.frequency) return null;
  const next = new Date(from);
  const [hh, mm] = (schedule.time ?? "09:00").split(":").map((n: string) => parseInt(n, 10));
  next.setHours(hh, mm, 0, 0);
  if (next.getTime() <= from.getTime()) {
    // sumar período
    if (schedule.frequency === "daily") next.setDate(next.getDate() + 1);
    else if (schedule.frequency === "weekly") next.setDate(next.getDate() + 7);
    else if (schedule.frequency === "monthly") next.setMonth(next.getMonth() + 1);
  }
  return next;
}
