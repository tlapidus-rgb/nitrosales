// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/migrate-backfill-jobs
// ══════════════════════════════════════════════════════════════
// Crea la tabla backfill_jobs + agrega columnas al onboarding_requests
// + extiende el enum OnboardingStatus con BACKFILLING.
// Idempotente (usa IF NOT EXISTS).
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const log: string[] = [];

    // 1. Agregar "BACKFILLING" al enum OnboardingStatus (si no existe)
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TYPE "OnboardingStatus" ADD VALUE IF NOT EXISTS 'BACKFILLING'`
      );
      log.push("✓ OnboardingStatus: agregado BACKFILLING");
    } catch (e: any) {
      log.push(`? OnboardingStatus enum: ${e.message}`);
    }

    // 2. Agregar columnas de rango a onboarding_requests
    const addCol = async (col: string, def: string) => {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "onboarding_requests" ADD COLUMN IF NOT EXISTS "${col}" ${def}`
        );
        log.push(`✓ onboarding_requests.${col}`);
      } catch (e: any) {
        log.push(`x ${col}: ${e.message}`);
      }
    };

    await addCol("historyVtexMonths", "INTEGER DEFAULT 12");
    await addCol("historyMlMonths", "INTEGER DEFAULT 12");
    await addCol("historyMetaMonths", "INTEGER DEFAULT 6");
    await addCol("historyGoogleMonths", "INTEGER DEFAULT 6");

    // 3. Crear tabla backfill_jobs
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "backfill_jobs" (
        "id" TEXT PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "platform" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'QUEUED',
        "monthsRequested" INTEGER NOT NULL,
        "fromDate" TIMESTAMPTZ NOT NULL,
        "toDate" TIMESTAMPTZ NOT NULL,
        "cursor" JSONB DEFAULT '{}',
        "processedCount" INTEGER DEFAULT 0,
        "totalEstimate" INTEGER,
        "progressPct" INTEGER DEFAULT 0,
        "lastError" TEXT,
        "startedAt" TIMESTAMPTZ,
        "completedAt" TIMESTAMPTZ,
        "lastChunkAt" TIMESTAMPTZ,
        "onboardingRequestId" TEXT,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    log.push("✓ tabla backfill_jobs creada");

    // 4. Índices para el cron runner
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "backfill_jobs_status_idx" ON "backfill_jobs"("status", "createdAt")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "backfill_jobs_org_idx" ON "backfill_jobs"("organizationId", "platform")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "backfill_jobs_onboarding_idx" ON "backfill_jobs"("onboardingRequestId")`
    );
    log.push("✓ indices creados");

    return NextResponse.json({ ok: true, log });
  } catch (error: any) {
    console.error("[migrate-backfill-jobs] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
