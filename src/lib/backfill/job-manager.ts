// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// BackfillJob manager
// ══════════════════════════════════════════════════════════════
// Helpers para crear, avanzar, completar jobs de backfill.
// Usa SQL directo porque la tabla no está en el Prisma schema
// (evitamos modificar el schema hasta que la tabla esté en prod).
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import { randomUUID } from "crypto";
import type { BackfillPlatform, BackfillStatus } from "./types";

export async function createBackfillJob(args: {
  organizationId: string;
  platform: BackfillPlatform;
  monthsRequested: number;
  onboardingRequestId?: string | null;
}): Promise<string> {
  const id = randomUUID();
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setMonth(fromDate.getMonth() - args.monthsRequested);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "backfill_jobs"
      ("id", "organizationId", "platform", "status", "monthsRequested", "fromDate", "toDate", "onboardingRequestId")
     VALUES ($1, $2, $3, 'QUEUED', $4, $5, $6, $7)`,
    id,
    args.organizationId,
    args.platform,
    args.monthsRequested,
    fromDate,
    toDate,
    args.onboardingRequestId || null
  );

  return id;
}

export async function getJob(id: string): Promise<any | null> {
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT * FROM "backfill_jobs" WHERE "id" = $1 LIMIT 1`,
    id
  );
  return rows[0] || null;
}

export async function getActiveJobsForOrg(orgId: string): Promise<any[]> {
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT * FROM "backfill_jobs"
     WHERE "organizationId" = $1
       AND "status" IN ('QUEUED', 'RUNNING')
     ORDER BY "createdAt" ASC`,
    orgId
  );
  return rows;
}

export async function getJobsByOnboarding(onboardingRequestId: string): Promise<any[]> {
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT * FROM "backfill_jobs"
     WHERE "onboardingRequestId" = $1
     ORDER BY "createdAt" ASC`,
    onboardingRequestId
  );
  return rows;
}

// Siguiente job a procesar (el mas viejo QUEUED o RUNNING pero sin chunk en los ultimos 2 min)
export async function pickNextJob(): Promise<any | null> {
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT * FROM "backfill_jobs"
     WHERE "status" = 'QUEUED'
        OR ("status" = 'RUNNING' AND ("lastChunkAt" IS NULL OR "lastChunkAt" < $1))
     ORDER BY
       CASE "status" WHEN 'RUNNING' THEN 0 ELSE 1 END,
       "createdAt" ASC
     LIMIT 1`,
    twoMinAgo
  );
  return rows[0] || null;
}

export async function markJobRunning(id: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "backfill_jobs"
     SET "status" = 'RUNNING',
         "startedAt" = COALESCE("startedAt", NOW()),
         "updatedAt" = NOW()
     WHERE "id" = $1 AND "status" != 'COMPLETED'`,
    id
  );
}

export async function updateJobProgress(
  id: string,
  args: {
    cursor?: any;
    processedCount?: number;
    totalEstimate?: number;
    progressPct?: number;
  }
): Promise<void> {
  const sets: string[] = [`"lastChunkAt" = NOW()`, `"updatedAt" = NOW()`];
  const values: any[] = [id];
  let idx = 2;

  if (args.cursor !== undefined) {
    sets.push(`"cursor" = $${idx++}::jsonb`);
    values.push(JSON.stringify(args.cursor));
  }
  if (args.processedCount !== undefined) {
    sets.push(`"processedCount" = $${idx++}`);
    values.push(args.processedCount);
  }
  if (args.totalEstimate !== undefined) {
    sets.push(`"totalEstimate" = $${idx++}`);
    values.push(args.totalEstimate);
  }
  if (args.progressPct !== undefined) {
    sets.push(`"progressPct" = $${idx++}`);
    values.push(Math.min(100, Math.max(0, Math.round(args.progressPct))));
  }

  await prisma.$executeRawUnsafe(
    `UPDATE "backfill_jobs" SET ${sets.join(", ")} WHERE "id" = $1`,
    ...values
  );
}

export async function completeJob(id: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "backfill_jobs"
     SET "status" = 'COMPLETED',
         "progressPct" = 100,
         "completedAt" = NOW(),
         "updatedAt" = NOW(),
         "lastError" = NULL
     WHERE "id" = $1`,
    id
  );
}

export async function failJob(id: string, error: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "backfill_jobs"
     SET "status" = 'FAILED',
         "lastError" = $2,
         "updatedAt" = NOW()
     WHERE "id" = $1`,
    id,
    error.slice(0, 2000)
  );
}

// Todos los jobs de un onboarding estan completos?
export async function areAllJobsComplete(onboardingRequestId: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT COUNT(*) FILTER (WHERE "status" NOT IN ('COMPLETED', 'FAILED')) as pending,
            COUNT(*) as total
     FROM "backfill_jobs"
     WHERE "onboardingRequestId" = $1`,
    onboardingRequestId
  );
  const r = rows[0];
  const pending = Number(r?.pending || 0);
  const total = Number(r?.total || 0);
  return total > 0 && pending === 0;
}

// ══════════════════════════════════════════════════════════════
// E-08 — claim atómico + conteo de jobs activos
// ══════════════════════════════════════════════════════════════

/**
 * Cuántos jobs están efectivamente corriendo AHORA: RUNNING con `lastChunkAt`
 * fresco. Un RUNNING con el chunk viejo está abandonado (la lambda se murió) y
 * no cuenta — si contara, un job huérfano bloquearía la cola para siempre.
 */
export async function contarJobsActivos(cooldownMs: number): Promise<number> {
  const corte = new Date(Date.now() - cooldownMs);
  const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*)::int AS n FROM "backfill_jobs"
     WHERE "status" = 'RUNNING' AND "lastChunkAt" IS NOT NULL AND "lastChunkAt" >= $1`,
    corte
  );
  return Number(rows[0]?.n || 0);
}

/**
 * Toma el próximo job y lo marca RUNNING en UNA sola sentencia.
 *
 * ⚠️ POR QUÉ REEMPLAZA A `pickNextJob` + `markJobRunning` (E-08):
 * eran dos queries separadas, así que dos invocaciones que arrancaban juntas
 * —el cron de cada minuto y el trigger inmediato de `approve-backfill`— podían
 * hacer el SELECT las dos antes de que ninguna hiciera el UPDATE, y salir las
 * dos con el MISMO job. El "lock" por frescura de `lastChunkAt` no servía para
 * un job en QUEUED: todavía no tenía ninguno.
 *
 * `FOR UPDATE SKIP LOCKED` hace que dos invocaciones concurrentes nunca vean la
 * misma fila: la segunda saltea la que la primera está por tomar.
 *
 * `lastChunkAt = NOW()` se escribe **en el claim**, no después del primer chunk.
 * Si se escribiera después, entre el claim y el primer chunk el job seguiría
 * pareciendo libre.
 */
export const RECLAMAR_PROXIMO_JOB_SQL = `UPDATE "backfill_jobs" j
        SET "status" = 'RUNNING',
            "startedAt" = COALESCE(j."startedAt", NOW()),
            "lastChunkAt" = NOW(),
            "updatedAt" = NOW()
      WHERE j."id" = (
        SELECT c."id" FROM "backfill_jobs" c
         WHERE c."status" = 'QUEUED'
            OR (c."status" = 'RUNNING'
                AND (c."lastChunkAt" IS NULL OR c."lastChunkAt" < $1))
         ORDER BY CASE c."status" WHEN 'RUNNING' THEN 0 ELSE 1 END,
                  c."createdAt" ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING j.*`;

export async function reclamarProximoJob(cooldownMs: number): Promise<any | null> {
  const corte = new Date(Date.now() - cooldownMs);
  const rows = await prisma.$queryRawUnsafe<Array<any>>(RECLAMAR_PROXIMO_JOB_SQL, corte);
  return rows[0] || null;
}
