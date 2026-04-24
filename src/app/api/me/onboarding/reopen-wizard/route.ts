// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/me/onboarding/reopen-wizard
// ══════════════════════════════════════════════════════════════
// Permite al cliente volver atras al wizard desde la phase "validating"
// (status NEEDS_INFO), antes de que el admin apruebe el backfill.
//
// Casos de uso:
//   - El cliente se equivoco al cargar credenciales.
//   - Falto conectar una plataforma.
//   - El OAuth de ML fallo y quiere reintentar.
//   - Olvido tildar una plataforma.
//
// REGLAS (importante para no corromper estado post-backfill):
//   - Solo OWNER puede hacerlo (session.user.role).
//   - Solo si onboarding_request.status = NEEDS_INFO.
//   - Si hay backfill jobs RUNNING o QUEUED o COMPLETED o FAILED → NO.
//   - Si status = ACTIVE → NO (ya paso del wizard).
//   - Connections existentes NO se tocan: el wizard las va a leer al
//     re-montar y pre-fillea los inputs (ver endpoint state-creds).
//
// Efecto: cambia onboarding_request.status de NEEDS_INFO → IN_PROGRESS.
// El overlay del cliente detecta el cambio en el proximo poll (30s) o
// el cliente llama fetchState() manualmente despues de POST exitoso.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, organizationId: true, role: true },
    });
    if (!user || user.role !== "OWNER") {
      return NextResponse.json({ error: "Solo el OWNER puede volver al wizard" }, { status: 403 });
    }

    // 1. Onboarding request de esta org
    const obRows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "id", "status" FROM "onboarding_requests" WHERE "createdOrgId" = $1 LIMIT 1`,
      user.organizationId
    );
    const ob = obRows[0];
    if (!ob) {
      return NextResponse.json({ error: "No hay onboarding asociado a esta cuenta" }, { status: 404 });
    }

    // 2. Chequear que se puede reabrir
    if (ob.status !== "NEEDS_INFO") {
      return NextResponse.json({
        error: `No se puede volver al wizard en el estado actual (${ob.status}). Si tenés dudas, contactá a soporte.`,
      }, { status: 409 });
    }

    // 3. Chequear que no haya backfill jobs en estados avanzados
    const jobRows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT COUNT(*)::int as "count" FROM "backfill_jobs"
       WHERE "organizationId" = $1
         AND "status" IN ('RUNNING','QUEUED','COMPLETED','FAILED')`,
      user.organizationId
    );
    const activeJobs = Number(jobRows[0]?.count || 0);
    if (activeJobs > 0) {
      return NextResponse.json({
        error: "El backfill ya arranco, no se puede volver al wizard. Si necesitás cambios, contactá a soporte.",
      }, { status: 409 });
    }

    // 4. Todo OK — volver status a IN_PROGRESS
    await prisma.$executeRawUnsafe(
      `UPDATE "onboarding_requests"
       SET "status" = 'IN_PROGRESS'::"OnboardingStatus",
           "progressStage" = 'wizard_reopened',
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      ob.id
    );

    return NextResponse.json({
      ok: true,
      message: "Wizard reabierto. Podés editar tus datos y volver a enviar.",
    });
  } catch (error: any) {
    console.error("[me/onboarding/reopen-wizard] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
