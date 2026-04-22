// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/onboardings/[id]/reset-backfill
// ══════════════════════════════════════════════════════════════
// Resetea el backfill de un onboarding: borra todos los jobs
// asociados y vuelve el status a NEEDS_INFO para que el admin
// pueda volver a aprobar y arrancar limpio.
//
// Util para:
// - Tests: arrancar de cero con el motor nuevo
// - Debugging: si un job quedo zombie
// - Re-procesamiento despues de un fix
//
// Solo internal users. Operacion idempotente.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const obRows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "id", "status", "createdOrgId", "companyName" FROM "onboarding_requests" WHERE "id" = $1 LIMIT 1`,
      id
    );
    const ob = obRows[0];
    if (!ob) {
      return NextResponse.json({ error: "Onboarding no encontrado" }, { status: 404 });
    }

    // Borrar todos los jobs del onboarding (cualquier status)
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM "backfill_jobs" WHERE "onboardingRequestId" = $1`,
      id
    );

    // Volver el status a NEEDS_INFO (lista para aprobar de nuevo)
    await prisma.$executeRawUnsafe(
      `UPDATE "onboarding_requests"
       SET "status" = 'NEEDS_INFO'::"OnboardingStatus",
           "progressStage" = 'awaiting_admin_review',
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      id
    );

    return NextResponse.json({
      ok: true,
      onboarding: {
        id: ob.id,
        companyName: ob.companyName,
        previousStatus: ob.status,
        newStatus: "NEEDS_INFO",
      },
      jobsDeleted: Number(deleted),
      nextStep: "Aprobar backfill desde /control/onboardings para arrancar limpio.",
    });
  } catch (error: any) {
    console.error("[admin/onboardings/reset-backfill] error:", error);
    return NextResponse.json({ error: error?.message || "Error interno" }, { status: 500 });
  }
}
