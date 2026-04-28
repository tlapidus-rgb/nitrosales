// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/onboardings/[id]/activate-client
// ══════════════════════════════════════════════════════════════
// Tomy hace click "Habilitar cliente" desde /control/onboardings/[id]
// o /control/clientes/[id] cuando el onboarding está en READY_FOR_REVIEW.
//
// Marca status = ACTIVE → el cliente puede entrar al producto normal.
// Manda email "tu plataforma está lista".
//
// Solo internal users (isInternalUser).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { sendEmail } from "@/lib/email/send";
import { dataReadyEmailActive } from "@/lib/onboarding/emails";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "id", "status", "companyName", "contactName", "contactEmail", "createdOrgId"
       FROM "onboarding_requests" WHERE "id" = $1 LIMIT 1`,
      id,
    );
    const ob = rows[0];
    if (!ob) {
      return NextResponse.json({ error: "Onboarding no encontrado" }, { status: 404 });
    }

    if (ob.status === "ACTIVE") {
      return NextResponse.json({
        ok: true,
        message: "El cliente ya estaba activo. No se hizo nada.",
        alreadyActive: true,
      });
    }

    // Permitimos activar desde READY_FOR_REVIEW (caso normal) o IN_PROGRESS
    // (override manual del admin si hace falta).
    if (ob.status !== "READY_FOR_REVIEW" && ob.status !== "IN_PROGRESS" && ob.status !== "BACKFILLING") {
      return NextResponse.json({
        error: `Estado actual ${ob.status} no permite activación. Esperá que llegue a READY_FOR_REVIEW (backfill terminado).`,
      }, { status: 400 });
    }

    // Marcar ACTIVE
    await prisma.$executeRawUnsafe(
      `UPDATE "onboarding_requests"
       SET "status" = 'ACTIVE'::"OnboardingStatus",
           "progressStage" = 'completed',
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      id,
    );

    // Email "tu plataforma está lista"
    let emailSent = false;
    if (ob.contactEmail) {
      try {
        const tpl = await dataReadyEmailActive({
          contactName: ob.contactName,
          companyName: ob.companyName,
        });
        await sendEmail({
          to: ob.contactEmail,
          subject: tpl.subject,
          html: tpl.html,
          context: { orgId: ob.createdOrgId, kind: "data_ready_manual_activation" },
        });
        emailSent = true;
      } catch (err: any) {
        console.error(`[activate-client] email fallo:`, err.message);
      }
    }

    return NextResponse.json({
      ok: true,
      onboarding: {
        id: ob.id,
        companyName: ob.companyName,
        contactEmail: ob.contactEmail,
        previousStatus: ob.status,
        newStatus: "ACTIVE",
      },
      emailSent,
      message: emailSent
        ? `Cliente activado. Email enviado a ${ob.contactEmail}.`
        : `Cliente activado. (No se envió email — ver logs)`,
    });
  } catch (err: any) {
    console.error("[activate-client] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
