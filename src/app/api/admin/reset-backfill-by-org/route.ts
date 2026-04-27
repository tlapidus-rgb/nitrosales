// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/reset-backfill-by-org?id=<orgId-o-onboardingId>&confirm=yes
// ══════════════════════════════════════════════════════════════
// Wrapper friendly-browser para reset-backfill. Acepta GET (vs el
// POST original) para que el admin pueda dispararlo abriendo una URL
// en el navegador sin curl. Resuelve el onboarding por:
//   - id directo de onboarding_requests, o
//   - createdOrgId (orgId de organizations)
//
// Requiere ?confirm=yes para evitar accidentes (preview de Vercel
// abre URLs cuando previsualiza).
//
// Auth: isInternalUser (sesion admin via cookie).
// Idempotente: corrida 2 veces seguidas no rompe.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const confirm = url.searchParams.get("confirm");
    if (!id) return NextResponse.json({ error: "Falta ?id=" }, { status: 400 });
    if (confirm !== "yes") {
      return NextResponse.json({
        error: "Pasá &confirm=yes para ejecutar. Previene disparos accidentales.",
        usage: `?id=${id}&confirm=yes`,
      }, { status: 400 });
    }

    // Buscar onboarding por id directo o por createdOrgId.
    const obRows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "id", "status", "createdOrgId", "companyName"
       FROM "onboarding_requests"
       WHERE "id" = $1 OR "createdOrgId" = $1
       ORDER BY "updatedAt" DESC
       LIMIT 1`,
      id
    );
    const ob = obRows[0];
    if (!ob) {
      return NextResponse.json({
        error: "No encontre onboarding ni por id ni por createdOrgId.",
        searched: id,
      }, { status: 404 });
    }

    // Borrar todos los jobs (cualquier status)
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM "backfill_jobs" WHERE "onboardingRequestId" = $1`,
      ob.id
    );

    // Status -> NEEDS_INFO
    await prisma.$executeRawUnsafe(
      `UPDATE "onboarding_requests"
       SET "status" = 'NEEDS_INFO'::"OnboardingStatus",
           "progressStage" = 'awaiting_admin_review',
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      ob.id
    );

    return NextResponse.json({
      ok: true,
      onboarding: {
        id: ob.id,
        companyName: ob.companyName,
        createdOrgId: ob.createdOrgId,
        previousStatus: ob.status,
        newStatus: "NEEDS_INFO",
      },
      jobsDeleted: Number(deleted),
      nextStep: "Andá a /control/onboardings y aprobá el backfill de nuevo.",
    });
  } catch (error: any) {
    console.error("[reset-backfill-by-org] error:", error);
    return NextResponse.json({ error: error?.message || "Error interno" }, { status: 500 });
  }
}
