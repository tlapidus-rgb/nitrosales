// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/onboardings/[id]/reject
// ══════════════════════════════════════════════════════════════
// Rechaza una solicitud. Soft delete: marca como REJECTED con razón.
// NO borra la fila (auditoría).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = body.reason ? String(body.reason).slice(0, 500) : "Rechazado";

    const rows = await prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT "status" FROM "onboarding_requests" WHERE "id" = $1 LIMIT 1`,
      id
    );
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (rows[0].status === "ACTIVE") {
      return NextResponse.json(
        { error: "No se puede rechazar una solicitud activa" },
        { status: 400 }
      );
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "onboarding_requests"
       SET "status" = 'REJECTED'::"OnboardingStatus",
           "adminNotes" = COALESCE("adminNotes" || E'\n---\n', '') || $2,
           "progressStage" = 'rejected',
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      id,
      `[REJECTED ${new Date().toISOString()}] ${reason}`
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[admin/onboardings/reject] error:", error);
    return NextResponse.json({ error: "Error al rechazar" }, { status: 500 });
  }
}
