// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/me/onboarding/state
// ══════════════════════════════════════════════════════════════
// Devuelve el estado del onboarding del cliente logueado.
//
// REGLA CRITICA: el producto SOLO se desbloquea (locked=false) si se
// cumplen TRES condiciones simultaneas:
//   1. El onboarding_request esta en status ACTIVE
//   2. Hay al menos una connection ACTIVE en la org
//   3. NO hay backfill jobs en estado RUNNING ni QUEUED
//
// Si cualquiera de esas falla, el overlay se mantiene bloqueado y
// ademas se determina la fase correcta en base a la REALIDAD (no solo
// al status del onboarding_request). Esto evita que un bug, una edicion
// manual en DB, o cualquier inconsistencia permita al cliente entrar al
// producto sin haber completado el flow.
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

    // Solo OWNER ve overlay. Los miembros del equipo entran al producto
    // normalmente una vez que la cuenta esta activa.
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

    // Si no hay onboarding_request (cliente legacy creado a mano antes del sistema)
    // → producto desbloqueado.
    if (!ob) {
      return NextResponse.json({ ok: true, locked: false, phase: "done", legacy: true });
    }

    // ─── Señales reales del estado ────────────────────────────
    const connectionsCount = await prisma.connection.count({
      where: { organizationId: user.organizationId },
    });
    const activeConnectionsCount = await prisma.connection.count({
      where: { organizationId: user.organizationId, status: "ACTIVE" },
    });

    const activeBackfillRows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT COUNT(*)::int as "count" FROM "backfill_jobs"
       WHERE "organizationId" = $1 AND "status" IN ('RUNNING','QUEUED')`,
      user.organizationId
    );
    const activeBackfillCount = Number(activeBackfillRows[0]?.count || 0);

    // ─── Decidir fase en base a la REALIDAD ───────────────────
    // Prioridad:
    //  1. Hay backfill activo            → backfilling (bloqueado)
    //  2. status=NEEDS_INFO              → validating (bloqueado, admin tiene que aprobar)
    //  3. No hay connections ni wizard   → wizard (bloqueado, cliente debe completar)
    //  4. status=ACTIVE Y hay al menos 1 connection ACTIVE Y no hay backfill activo → done (desbloqueado)
    //  5. Fallback seguro                → wizard (bloqueado)

    let phase: "wizard" | "validating" | "backfilling" | "done";
    let locked = true;

    if (activeBackfillCount > 0) {
      phase = "backfilling";
    } else if (ob.status === "NEEDS_INFO") {
      phase = "validating";
    } else if (ob.status === "BACKFILLING") {
      // Status dice backfilling pero no hay jobs activos → algo raro, lo mandamos a backfilling
      // (no desbloqueamos hasta que el admin intervenga o terminen los jobs)
      phase = "backfilling";
    } else if (ob.status === "ACTIVE" && activeConnectionsCount > 0) {
      phase = "done";
      locked = false;
    } else {
      // IN_PROGRESS, o ACTIVE sin connections reales, o cualquier otro estado inconsistente
      // → overlay wizard. El cliente debe (re)completar el wizard.
      phase = "wizard";
    }

    // Si esta backfilling, devolvemos progreso global
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
      // Diagnostico para debug
      signals: {
        obStatus: ob.status,
        connectionsCount,
        activeConnectionsCount,
        activeBackfillCount,
      },
    });
  } catch (error: any) {
    console.error("[me/onboarding/state] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
