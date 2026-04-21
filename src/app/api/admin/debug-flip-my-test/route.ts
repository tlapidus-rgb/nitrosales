// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/debug-flip-my-test?phase=validating
// ══════════════════════════════════════════════════════════════
// Atajo: encuentra automaticamente la postulacion de prueba (la mas
// reciente con createdOrgId !== MdJ) y la flipea a la fase pedida.
// Un solo GET, sin pasar IDs a mano.
//
// Query params:
//   phase=wizard | validating | backfilling | done  (default: validating)
//   excludeOrgId=<id>  (opcional, default: el primer OWNER de la DB, osea MdJ)
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

export async function GET(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const phase = (url.searchParams.get("phase") || "validating").toLowerCase();
    if (!PHASE_TO_STATUS[phase]) {
      return NextResponse.json(
        { error: `phase invalida. Opciones: ${Object.keys(PHASE_TO_STATUS).join(", ")}` },
        { status: 400 }
      );
    }

    // Buscar postulaciones que ya tengan org creada pero no sean la primera (MdJ)
    const orgs = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT o."id", o."createdOrgId", o."companyName", o."contactEmail", o."status", o."createdAt",
              org."createdAt" as "orgCreatedAt"
       FROM "onboarding_requests" o
       LEFT JOIN "organizations" org ON org."id" = o."createdOrgId"
       WHERE o."createdOrgId" IS NOT NULL
       ORDER BY o."createdAt" DESC`
    );

    if (orgs.length === 0) {
      return NextResponse.json({
        error: "No encontré postulaciones activadas. Primero aprobá una cuenta desde /control/onboardings.",
      }, { status: 404 });
    }

    // Elegimos la mas reciente (la de prueba de Tomy)
    const target = orgs[0];

    const newStatus = PHASE_TO_STATUS[phase];

    await prisma.$executeRawUnsafe(
      `UPDATE "onboarding_requests"
       SET "status" = $2::"OnboardingStatus", "updatedAt" = NOW()
       WHERE "id" = $1`,
      target.id,
      newStatus
    );

    const extras: any = {};

    if (phase === "backfilling") {
      // Limpiar jobs previos
      await prisma.$executeRawUnsafe(
        `DELETE FROM "backfill_jobs" WHERE "onboardingRequestId" = $1`,
        target.id
      );

      // Crear jobs fake con progreso para ver el overlay completo
      const now = new Date();
      const from12m = new Date(now);
      from12m.setMonth(from12m.getMonth() - 12);

      const vtexJobId = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "backfill_jobs"
          ("id","organizationId","platform","status","monthsRequested","fromDate","toDate",
           "processedCount","totalEstimate","progressPct","startedAt","lastChunkAt","onboardingRequestId")
         VALUES ($1,$2,'VTEX','RUNNING',12,$3,$4,6750,15000,45,NOW(),NOW(),$5)`,
        vtexJobId, target.createdOrgId, from12m, now, target.id
      );

      const mlJobId = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "backfill_jobs"
          ("id","organizationId","platform","status","monthsRequested","fromDate","toDate",
           "processedCount","totalEstimate","progressPct","startedAt","lastChunkAt","onboardingRequestId")
         VALUES ($1,$2,'MERCADOLIBRE','RUNNING',12,$3,$4,300,2000,15,NOW(),NOW(),$5)`,
        mlJobId, target.createdOrgId, from12m, now, target.id
      );

      extras.fakeJobsCreated = { VTEX: vtexJobId, MERCADOLIBRE: mlJobId };
    }

    if (phase === "done") {
      await prisma.$executeRawUnsafe(
        `UPDATE "backfill_jobs"
         SET "status" = 'COMPLETED', "progressPct" = 100, "completedAt" = NOW()
         WHERE "onboardingRequestId" = $1`,
        target.id
      );
    }

    if (phase === "wizard" || phase === "validating") {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "backfill_jobs" WHERE "onboardingRequestId" = $1`,
        target.id
      );
    }

    return NextResponse.json({
      ok: true,
      flipped: {
        onboardingRequestId: target.id,
        orgId: target.createdOrgId,
        companyName: target.companyName,
        contactEmail: target.contactEmail,
        previousStatus: target.status,
        newStatus,
        phase,
      },
      instructions: `Logueate como ${target.contactEmail} y vas a ver el overlay en fase '${phase}'. Hacé refresh para verlo al toque.`,
      extras,
    });
  } catch (error: any) {
    console.error("[debug-flip-my-test] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
