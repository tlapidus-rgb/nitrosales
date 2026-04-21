// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/debug-flip-onboarding
// ══════════════════════════════════════════════════════════════
// Cambia manualmente el estado del onboarding_request para testear
// las distintas fases del OnboardingOverlay sin tener que pasar por
// todo el flujo real (sin reconectar credenciales cada vez).
//
// Body: { onboardingRequestId, targetPhase: "wizard"|"validating"|"backfilling"|"done" }
// Solo isInternalUser.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const PHASE_TO_STATUS: Record<string, string> = {
  wizard: "IN_PROGRESS",
  validating: "NEEDS_INFO",
  backfilling: "BACKFILLING",
  done: "ACTIVE",
};

export async function POST(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const onboardingRequestId = String(body.onboardingRequestId || "").trim();
    const targetPhase = String(body.targetPhase || "").trim().toLowerCase();

    if (!onboardingRequestId) {
      return NextResponse.json({ error: "Falta onboardingRequestId" }, { status: 400 });
    }
    if (!PHASE_TO_STATUS[targetPhase]) {
      return NextResponse.json(
        { error: `targetPhase invalido. Usá: ${Object.keys(PHASE_TO_STATUS).join(", ")}` },
        { status: 400 }
      );
    }

    // Verificar que existe
    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "id", "createdOrgId", "companyName" FROM "onboarding_requests" WHERE "id" = $1 LIMIT 1`,
      onboardingRequestId
    );
    const ob = rows[0];
    if (!ob) return NextResponse.json({ error: "Onboarding request no encontrado" }, { status: 404 });
    if (!ob.createdOrgId) {
      return NextResponse.json(
        { error: "El onboarding aun no tiene org creada (hay que aprobar la cuenta primero)" },
        { status: 400 }
      );
    }

    const newStatus = PHASE_TO_STATUS[targetPhase];

    // Update status
    await prisma.$executeRawUnsafe(
      `UPDATE "onboarding_requests"
       SET "status" = $2::"OnboardingStatus",
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      onboardingRequestId,
      newStatus
    );

    const extras: any = {};

    // Si pasamos a BACKFILLING, creamos jobs fake para que el overlay muestre progreso
    if (targetPhase === "backfilling") {
      // Limpiar jobs previos del mismo onboarding
      await prisma.$executeRawUnsafe(
        `DELETE FROM "backfill_jobs" WHERE "onboardingRequestId" = $1`,
        onboardingRequestId
      );

      // Crear 2 jobs fake: VTEX al 45%, ML al 15%
      const now = new Date();
      const from6m = new Date(now);
      from6m.setMonth(from6m.getMonth() - 12);

      const vtexJobId = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "backfill_jobs"
          ("id","organizationId","platform","status","monthsRequested","fromDate","toDate",
           "processedCount","totalEstimate","progressPct","startedAt","lastChunkAt","onboardingRequestId")
         VALUES ($1,$2,'VTEX','RUNNING',12,$3,$4,6750,15000,45,NOW(),NOW(),$5)`,
        vtexJobId,
        ob.createdOrgId,
        from6m,
        now,
        onboardingRequestId
      );

      const mlJobId = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "backfill_jobs"
          ("id","organizationId","platform","status","monthsRequested","fromDate","toDate",
           "processedCount","totalEstimate","progressPct","startedAt","lastChunkAt","onboardingRequestId")
         VALUES ($1,$2,'MERCADOLIBRE','RUNNING',12,$3,$4,300,2000,15,NOW(),NOW(),$5)`,
        mlJobId,
        ob.createdOrgId,
        from6m,
        now,
        onboardingRequestId
      );

      extras.fakeJobsCreated = [vtexJobId, mlJobId];
    }

    // Si pasamos a DONE, marcamos jobs como COMPLETED
    if (targetPhase === "done") {
      await prisma.$executeRawUnsafe(
        `UPDATE "backfill_jobs"
         SET "status" = 'COMPLETED', "progressPct" = 100, "completedAt" = NOW()
         WHERE "onboardingRequestId" = $1`,
        onboardingRequestId
      );
    }

    // Si volvemos a wizard o validating, limpiamos jobs
    if (targetPhase === "wizard" || targetPhase === "validating") {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "backfill_jobs" WHERE "onboardingRequestId" = $1`,
        onboardingRequestId
      );
    }

    return NextResponse.json({
      ok: true,
      onboardingRequestId,
      companyName: ob.companyName,
      newStatus,
      targetPhase,
      hint: `El cliente de esa org va a ver el overlay '${targetPhase}' apenas haga refresh (o espera 30s al auto-refresh del overlay).`,
      extras,
    });
  } catch (error: any) {
    console.error("[debug-flip-onboarding] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
