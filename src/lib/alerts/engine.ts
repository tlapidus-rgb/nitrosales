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
import { sendEmail } from "@/lib/email/send";
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

// Ventana de "alerta reciente" para mostrar schedules en /alertas:
// si lastFiredAt está en las últimas 24hs, mostrar la alerta aunque
// nextFireAt ya esté en el futuro. Esto evita perder visibilidad de
// reportes diarios entre disparos del cron.
const SCHEDULE_VISIBILITY_HOURS = 24;

// Evalúa una regla y devuelve UnifiedAlert si cumple + en cooldown OK
// Para schedules: respeta nextFireAt — solo dispara cuando llega su momento.
// Si ya fue disparada por el cron en las últimas 24hs, la muestra (sin re-disparar).
export async function evaluateRule(
  rule: StoredRule
): Promise<UnifiedAlert | null> {
  const primitive = getPrimitive(rule.primitiveKey);
  if (!primitive) return null;

  const now = Date.now();

  // Check cooldown (solo para type='condition')
  if (rule.type === "condition" && rule.lastFiredAt) {
    const elapsedMs = now - new Date(rule.lastFiredAt).getTime();
    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    if (elapsedMs < cooldownMs) return null; // en cooldown, skip
  }

  // Para schedules, decidir si:
  // (A) hay que disparar AHORA porque nextFireAt llegó o nunca disparó
  // (B) hay que MOSTRAR la última disparada porque está en la ventana de visibilidad (24h)
  // (C) silencio (todavía no es tiempo Y no hay reciente para mostrar)
  let shouldFireNow = true;
  let shouldShowExisting = false;

  if (rule.type === "schedule") {
    const nextFireAt = rule.nextFireAt ? new Date(rule.nextFireAt).getTime() : null;
    const lastFiredAt = rule.lastFiredAt ? new Date(rule.lastFiredAt).getTime() : null;
    const visibilityWindowMs = SCHEDULE_VISIBILITY_HOURS * 60 * 60 * 1000;

    const recentlyFired = lastFiredAt !== null && now - lastFiredAt < visibilityWindowMs;
    const dueNow = nextFireAt === null || nextFireAt <= now;

    if (dueNow) {
      shouldFireNow = true;
    } else if (recentlyFired) {
      shouldFireNow = false;
      shouldShowExisting = true;
    } else {
      // No es momento de disparar y no hay reciente para mostrar — silencio.
      return null;
    }
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

    const id = result.dedupeKey ?? `rule.${rule.id}.${rule.lastFiredAt ? new Date(rule.lastFiredAt).getTime() : Date.now()}`;
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
      createdAt: rule.lastFiredAt && shouldShowExisting
        ? new Date(rule.lastFiredAt).toISOString()
        : new Date().toISOString(),
    };

    // Solo update timestamps + email si efectivamente DISPARAMOS (no si solo mostramos histórico)
    if (shouldFireNow) {
      const nextFireAt = rule.type === "schedule" ? computeNextFireAt(rule.schedule) : null;
      await prisma.$executeRawUnsafe(
        `UPDATE "alert_rules"
            SET "lastFiredAt" = NOW(),
                "nextFireAt" = $2,
                "updatedAt" = NOW()
          WHERE "id" = $1`,
        rule.id,
        nextFireAt
      );

      // Email si el rule tiene canal email
      if (Array.isArray(rule.channels) && rule.channels.includes("email")) {
        await sendAlertEmail(rule, alert).catch((e) => {
          console.warn(`[alerts/engine] Email send failed for rule ${rule.id}:`, e?.message);
        });
      }
    }

    return alert;
  } catch (err) {
    console.warn(`[alerts/engine] Error evaluating rule ${rule.id}:`, err);
    return null;
  }
}

// Manda email de alerta al user dueño de la rule
async function sendAlertEmail(rule: StoredRule, alert: UnifiedAlert): Promise<void> {
  // Resolver email del user
  const userRow = await prisma.$queryRawUnsafe<Array<{ email: string; name: string | null }>>(
    `SELECT "email", "name" FROM "users" WHERE "id" = $1 LIMIT 1`,
    rule.userId
  );
  const userEmail = userRow?.[0]?.email;
  if (!userEmail) return;

  const sevColor = alert.severity === "critical" ? "#ef4444" : alert.severity === "warning" ? "#f59e0b" : "#0ea5e9";
  const sevLabel = alert.severity === "critical" ? "Crítica" : alert.severity === "warning" ? "Atención" : "Info";
  const ctaButton = alert.cta && alert.ctaHref
    ? `<a href="https://nitrosales.vercel.app${alert.ctaHref}" style="display:inline-block;margin-top:18px;padding:10px 18px;background:#6366f1;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${escapeHtml(alert.cta)} →</a>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;padding:32px 16px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;background:white;border-radius:14px;overflow:hidden;box-shadow:0 8px 32px rgba(15,23,42,0.06);">
        <tr><td style="padding:24px 28px 0;">
          <div style="font-size:11px;font-weight:700;color:${sevColor};text-transform:uppercase;letter-spacing:0.08em;">
            ${sevLabel} · ${escapeHtml(rule.name)}
          </div>
          <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;line-height:1.3;">
            ${escapeHtml(alert.title)}
          </h1>
        </td></tr>
        <tr><td style="padding:14px 28px 24px;">
          <div style="font-size:14px;color:#475569;line-height:1.6;font-variant-numeric:tabular-nums;">
            ${escapeHtml(alert.body)}
          </div>
          ${ctaButton}
        </td></tr>
        <tr><td style="padding:18px 28px;background:#fafafa;border-top:1px solid rgba(15,23,42,0.06);font-size:11px;color:#94a3b8;line-height:1.5;">
          Esta alerta se dispara por la regla <b style="color:#475569;">${escapeHtml(rule.name)}</b>.
          Podés modificarla o desactivarla en <a href="https://nitrosales.vercel.app/alertas/reglas" style="color:#6366f1;text-decoration:none;">/alertas/reglas</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail({
    to: userEmail,
    subject: `[NitroSales] ${alert.title}`,
    html,
  });
}

function escapeHtml(str: string): string {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

// Carga TODAS las schedules pendientes de disparo (cualquier user / org).
// Solo para el cron — no para ningún flow del usuario logueado.
export async function loadAllPendingSchedules(): Promise<StoredRule[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<StoredRule[]>(
      `SELECT * FROM "alert_rules"
       WHERE "type" = 'schedule'
         AND "enabled" = TRUE
         AND ("nextFireAt" IS NULL OR "nextFireAt" <= NOW())
       ORDER BY "nextFireAt" ASC NULLS FIRST`
    );
    return rows;
  } catch {
    return [];
  }
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
