// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/onboardings/[id]/activate
// ══════════════════════════════════════════════════════════════
// Activa una solicitud de onboarding. Crea en atomic transaction:
//   1. Organization con name + slug + storeUrl en settings
//   2. User OWNER con email del contacto + contraseña random temporal
//   3. Connections (VTEX, ML, Meta Ads, Google Ads) con credentials
//      desencriptadas de la solicitud
//   4. Marca la solicitud como ACTIVE con createdOrgId y activatedAt
//   5. Manda email al contacto con credenciales de login
//
// Idempotente: si ya estaba ACTIVE, devuelve error 409.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { sendEmail } from "@/lib/email/send";
import { onboardingActivationEmail } from "@/lib/onboarding/emails";
import { waitUntil } from "@vercel/functions";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function generateTempPassword(): string {
  // 12 chars: letras + números, legibles
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[buf[i] % chars.length];
  return out;
}

// decryptField removido: ya no decryptamos credenciales aca (el cliente
// las ingresa en el wizard adentro del producto).

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Cargar solicitud
    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "onboarding_requests" WHERE "id" = $1 LIMIT 1`,
      id
    );
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }
    const request = rows[0];

    if (request.status === "ACTIVE" || request.createdOrgId) {
      return NextResponse.json(
        {
          error: "Esta solicitud ya fue activada",
          createdOrgId: request.createdOrgId,
        },
        { status: 409 }
      );
    }
    if (request.status === "REJECTED") {
      return NextResponse.json(
        { error: "Esta solicitud fue rechazada. No se puede activar." },
        { status: 400 }
      );
    }

    // Validar que no exista ya un user con ese email
    const existingUser = await prisma.user.findUnique({
      where: { email: request.contactEmail },
    });
    if (existingUser) {
      return NextResponse.json(
        {
          error: `Ya existe un usuario con el email ${request.contactEmail}. Pedí un email alternativo al cliente.`,
        },
        { status: 409 }
      );
    }

    // Validar slug no tomado
    const existingOrg = await prisma.organization.findUnique({
      where: { slug: request.proposedSlug },
    });
    if (existingOrg) {
      return NextResponse.json(
        {
          error: `El slug "${request.proposedSlug}" ya está en uso. Pedile al cliente un slug alternativo (o editalo en la solicitud antes de activar).`,
        },
        { status: 409 }
      );
    }

    // Temp password
    const tempPassword = generateTempPassword();
    const hashedPassword = await hash(tempPassword, 12);

    // Desencriptar credentials
    // (Las credenciales encriptadas ya no se usan aca — el cliente las
    // ingresa adentro del producto via wizard.)

    // ── Transaction ──
    const result = await prisma.$transaction(async (tx) => {
      // 1. Crear Organization (con timezone, currency, fiscal de la solicitud)
      // Guardamos la password temporal en settings para que el backfill runner
      // pueda usarla al mandar el email cuando termine el backfill.
      const org = await tx.organization.create({
        data: {
          name: request.companyName,
          slug: request.proposedSlug,
          settings: {
            storeUrl: request.storeUrl,
            currency: request.currency || "ARS",
            fiscalCondition: request.fiscalCondition || null,
            _initialPassword: tempPassword,
            whiteLabel: {
              industry: request.industry ?? null,
              timezone: request.timezone || "America/Argentina/Buenos_Aires",
            },
          },
        },
      });

      // 2. Crear User OWNER
      const user = await tx.user.create({
        data: {
          email: request.contactEmail,
          name: request.contactName,
          hashedPassword,
          role: "OWNER",
          organizationId: org.id,
        },
      });

      // 3. NO creamos Connections aca. El cliente las configura adentro del
      //    producto via overlay/wizard despues de loguear (esto activa la
      //    aprobacion 2 que dispara el backfill).
      // 4. Marcar onboarding como IN_PROGRESS (cuenta creada, esperando wizard).
      await tx.$executeRawUnsafe(
        `UPDATE "onboarding_requests"
         SET "status" = 'IN_PROGRESS'::"OnboardingStatus",
             "createdOrgId" = $2,
             "activatedAt" = NOW(),
             "progressStage" = 'awaiting_wizard',
             "updatedAt" = NOW()
         WHERE "id" = $1`,
        request.id,
        org.id
      );

      return { org, user };
    });

    // ── Fuera de la transaction ────────────────────────────────
    // Mandar email con credenciales de login al cliente.
    const { subject, html } = onboardingActivationEmail({
      contactName: request.contactName,
      companyName: request.companyName,
      loginEmail: request.contactEmail,
      temporaryPassword: tempPassword,
      orgId: result.org.id,
    });
    // CRÍTICO: waitUntil garantiza que Vercel no mate la función antes de que
    // sendEmail termine de hablar con Resend. Sin esto, la response se manda
    // y el proceso termina → el email se pierde silenciosamente.
    waitUntil(
      sendEmail({ to: request.contactEmail, subject, html, context: "onboarding.activate" }).catch((err) => {
        console.error("[activate] email send failed:", err?.message);
      })
    );

    return NextResponse.json({
      ok: true,
      message: `Cuenta de ${request.companyName} creada. Email enviado a ${request.contactEmail}. El cliente va a completar plataformas y credenciales adentro del producto.`,
      orgId: result.org.id,
      orgSlug: result.org.slug,
      userId: result.user.id,
      emailSentTo: request.contactEmail,
      // temporaryPassword devolvemos SOLO en la respuesta al admin (por si el email falla)
      _adminNote: {
        temporaryPassword: tempPassword,
        warning: "Este password solo se muestra acá. Guardalo por si el email no llegó.",
      },
    });
  } catch (error: any) {
    console.error("[admin/onboardings/activate] error:", error);
    return NextResponse.json(
      { error: `Error al activar: ${error?.message ?? error}` },
      { status: 500 }
    );
  }
}
