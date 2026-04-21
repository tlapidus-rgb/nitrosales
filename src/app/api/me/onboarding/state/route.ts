// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/me/onboarding/state
// ══════════════════════════════════════════════════════════════
// Devuelve el estado del onboarding del cliente logueado:
//   - locked: boolean (mostrar overlay si true)
//   - phase: "wizard" | "validating" | "backfilling" | "done"
//   - backfillProgress (cuando phase=backfilling)
//
// Usado por el OnboardingOverlay del producto para decidir que mostrar.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, organizationId: true, role: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Solo OWNER ve overlay (los miembros del equipo entran al producto sin onboarding)
    if (user.role !== "OWNER") {
      return NextResponse.json({ ok: true, locked: false, phase: "done" });
    }

    // Onboarding request asociado a esta org
    const obRows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "id", "status", "progressStage" FROM "onboarding_requests"
       WHERE "createdOrgId" = $1 LIMIT 1`,
      user.organizationId
    );
    const ob = obRows[0];

    // Si no hay onboarding (cliente legacy creado a mano) → producto desbloqueado.
    if (!ob) {
      return NextResponse.json({ ok: true, locked: false, phase: "done" });
    }

    // Mapeo de status a phase del overlay:
    // - IN_PROGRESS / 'awaiting_wizard' → wizard (cliente debe completar plataformas+credenciales)
    // - NEEDS_INFO / 'wizard_submitted' → validating (Tomy tiene que aprobar backfill)
    // - BACKFILLING → backfilling (jobs corriendo)
    // - ACTIVE → done (desbloqueado)
    let phase: "wizard" | "validating" | "backfilling" | "done";
    let locked = true;

    switch (ob.status) {
      case "IN_PROGRESS":
        phase = "wizard";
        break;
      case "NEEDS_INFO":
        phase = "validating";
        break;
      case "BACKFILLING":
        phase = "backfilling";
        break;
      case "ACTIVE":
        phase = "done";
        locked = false;
        break;
      default:
        // PENDING / REJECTED no deberia tener createdOrgId, pero por seguridad lock
        phase = "wizard";
    }

    // Si esta backfilling, calcular progreso global
    let backfillProgress: any = null;
    if (phase === "backfilling") {
      const jobsRows = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT "platform", "status", "progressPct", "processedCount", "totalEstimate"
         FROM "backfill_jobs"
         WHERE "onboardingRequestId" = $1
         ORDER BY "createdAt" ASC`,
        ob.id
      );
      const overallPct = jobsRows.length > 0
        ? Math.round(jobsRows.reduce((a, j) => a + Number(j.progressPct || 0), 0) / jobsRows.length)
        : 0;
      backfillProgress = {
        overallPct,
        jobs: jobsRows.map((j) => ({
          platform: j.platform,
          status: j.status,
          progressPct: Number(j.progressPct || 0),
          processed: Number(j.processedCount || 0),
          totalEstimate: j.totalEstimate ? Number(j.totalEstimate) : null,
        })),
      };
    }

    return NextResponse.json({
      ok: true,
      locked,
      phase,
      onboardingRequestId: ob.id,
      backfillProgress,
    });
  } catch (error: any) {
    console.error("[me/onboarding/state] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
