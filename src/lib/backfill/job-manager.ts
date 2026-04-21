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
