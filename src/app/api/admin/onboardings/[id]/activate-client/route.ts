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

import { ADMIN_API_KEY } from "@/lib/admin-key";
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

    // ══════════════════════════════════════════════════════════════
    // AUTO-CONFIGURAR Orders Broadcaster VTEX (multi-tenant fix)
    // ══════════════════════════════════════════════════════════════
    // Si el cliente tiene VTEX activo, disparar el POST a su VTEX para
    // configurar el Orders Broadcaster. Si falla, NO bloquea la activacion
    // — solo loguea y deja un flag en la respuesta para que el admin lo vea.
    let broadcasterResult: any = null;
    if (ob.createdOrgId) {
      try {
        const vtexConn = await prisma.connection.findFirst({
          where: { organizationId: ob.createdOrgId, platform: "VTEX" as any, status: "ACTIVE" as any },
          select: { id: true },
        });
        if (vtexConn) {
          const { getVtexConfig } = await import("@/lib/vtex-credentials");
          const vtexConfig = await getVtexConfig(ob.createdOrgId);
          const account = vtexConfig.creds.accountName;
          const baseUrl = "https://nitrosales.vercel.app";
          const secret = process.env.NEXTAUTH_SECRET || ADMIN_API_KEY;
          const hookUrl =
            `${baseUrl}/api/webhooks/vtex/orders` +
            `?key=${encodeURIComponent(secret)}` +
            `&org=${encodeURIComponent(ob.createdOrgId)}`;
          const payload = {
            filter: {
              type: "FromWorkflow",
              status: ["order-created","payment-approved","handling","invoiced","canceled","request-cancel"],
            },
            hook: { url: hookUrl, headers: {} },
          };
          const r = await fetch(
            `https://${account}.vtexcommercestable.com.br/api/orders/hook/config`,
            {
              method: "POST",
              headers: { ...vtexConfig.headers, "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(15000),
            }
          );
          broadcasterResult = {
            attempted: true,
            ok: r.ok,
            status: r.status,
            account,
            hookUrl,
          };
          console.log(`[activate-client] Orders Broadcaster setup for ${account}: status=${r.status}`);
        } else {
          broadcasterResult = { attempted: false, reason: "No hay VTEX connection ACTIVE" };
        }
      } catch (e: any) {
        broadcasterResult = { attempted: true, ok: false, error: e.message };
        console.error("[activate-client] Orders Broadcaster falló (no bloquea):", e.message);
      }
    }

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
      broadcasterResult,
      message: emailSent
        ? `Cliente activado. Email enviado a ${ob.contactEmail}.`
        : `Cliente activado. (No se envió email — ver logs)`,
    });
  } catch (err: any) {
    console.error("[activate-client] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
