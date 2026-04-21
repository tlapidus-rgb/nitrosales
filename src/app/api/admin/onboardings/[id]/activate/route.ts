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
import { decryptCredentials } from "@/lib/crypto";
import { sendEmail } from "@/lib/email/send";
import { onboardingActivationEmail } from "@/lib/onboarding/emails";
import { createBackfillJob } from "@/lib/backfill/job-manager";
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

function decryptField(encryptedJson: string | null | undefined): string | null {
  if (!encryptedJson) return null;
  try {
    const decrypted = decryptCredentials(encryptedJson);
    // decryptCredentials devuelve el objeto original
    const firstVal = decrypted ? Object.values(decrypted)[0] : null;
    return typeof firstVal === "string" ? firstVal : null;
  } catch (e) {
    console.warn("[activate] decrypt failed:", (e as any)?.message);
    return null;
  }
}

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
    const vtexAppKey = decryptField(request.vtexAppKeyEncrypted);
    const vtexAppToken = decryptField(request.vtexAppTokenEncrypted);
    const metaAccessToken = decryptField(request.metaAccessTokenEncrypted);
    const metaPixelToken = decryptField(request.metaPixelTokenEncrypted);

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

      // 3. Crear Connections
      const connectionsCreated: string[] = [];

      if (request.vtexAccountName && vtexAppKey && vtexAppToken) {
        await tx.connection.create({
          data: {
            organizationId: org.id,
            platform: "VTEX",
            status: "ACTIVE",
            credentials: {
              accountName: request.vtexAccountName,
              appKey: vtexAppKey,
              appToken: vtexAppToken,
            },
          },
        });
        connectionsCreated.push("VTEX");
      }

      if (request.mlUsername) {
        // ML requiere OAuth flow — creamos placeholder PENDING hasta que hagan OAuth
        await tx.connection.create({
          data: {
            organizationId: org.id,
            platform: "MERCADOLIBRE",
            status: "PENDING",
            credentials: {
              username: request.mlUsername,
              needsOAuth: true,
            },
          },
        });
        connectionsCreated.push("ML (pending OAuth)");
      }

      if (request.metaAdAccountId && metaAccessToken) {
        await tx.connection.create({
          data: {
            organizationId: org.id,
            platform: "META_ADS",
            status: "ACTIVE",
            credentials: {
              adAccountId: request.metaAdAccountId,
              accessToken: metaAccessToken,
            },
          },
        });
        connectionsCreated.push("Meta Ads");
      }

      // Meta Pixel (CAPI) — connection separada tipo META_PIXEL
      if (request.metaPixelId && metaPixelToken) {
        await tx.connection.create({
          data: {
            organizationId: org.id,
            platform: "META_PIXEL" as any,
            status: "ACTIVE",
            credentials: {
              pixelId: request.metaPixelId,
              accessToken: metaPixelToken,
            },
          },
        });
        connectionsCreated.push("Meta Pixel (CAPI)");
      }

      if (request.googleAdsCustomerId) {
        // Google Ads requiere OAuth para refreshToken — placeholder PENDING
        await tx.connection.create({
          data: {
            organizationId: org.id,
            platform: "GOOGLE_ADS",
            status: "PENDING",
            credentials: {
              customerId: request.googleAdsCustomerId,
              needsOAuth: true,
            },
          },
        });
        connectionsCreated.push("Google Ads (pending OAuth)");
      }

      // 4. Decidir estado final: si hay VTEX o ML con meses > 0, queda BACKFILLING
      //    (el backfill runner va a completarlo y mandar email cuando termine).
      //    Si no, pasa directo a ACTIVE.
      const hasVtexBackfill =
        request.vtexAccountName && (Number(request.historyVtexMonths) || 0) > 0;
      const hasMlBackfill =
        request.mlUsername && (Number(request.historyMlMonths) || 0) > 0;
      const needsBackfill = hasVtexBackfill || hasMlBackfill;

      const newStatus = needsBackfill ? "BACKFILLING" : "ACTIVE";

      await tx.$executeRawUnsafe(
        `UPDATE "onboarding_requests"
         SET "status" = $3::"OnboardingStatus",
             "createdOrgId" = $2,
             "activatedAt" = NOW(),
             "progressStage" = $4,
             "updatedAt" = NOW()
         WHERE "id" = $1`,
        request.id,
        org.id,
        newStatus,
        needsBackfill ? "backfilling" : "activated"
      );

      return { org, user, connectionsCreated, needsBackfill, hasVtexBackfill, hasMlBackfill };
    });

    // ── Fuera de la transaction ────────────────────────────────
    if (result.needsBackfill) {
      // Crear backfill jobs (VTEX + ML si aplica). Corren via cron cada 5 min.
      const createdJobs: string[] = [];
      if (result.hasVtexBackfill) {
        const months = Number(request.historyVtexMonths) || 12;
        const jobId = await createBackfillJob({
          organizationId: result.org.id,
          platform: "VTEX",
          monthsRequested: months,
          onboardingRequestId: request.id,
        });
        createdJobs.push(`VTEX:${jobId}`);
      }
      if (result.hasMlBackfill) {
        const months = Number(request.historyMlMonths) || 12;
        const jobId = await createBackfillJob({
          organizationId: result.org.id,
          platform: "MERCADOLIBRE",
          monthsRequested: months,
          onboardingRequestId: request.id,
        });
        createdJobs.push(`ML:${jobId}`);
      }
      console.log(`[activate] backfill jobs creados: ${createdJobs.join(", ")}`);
      // NO mandamos email todavia — el backfill runner lo manda cuando termine.
    } else {
      // Sin backfill → mandamos email ahora mismo (flow clasico).
      const { subject, html } = onboardingActivationEmail({
        contactName: request.contactName,
        companyName: request.companyName,
        loginEmail: request.contactEmail,
        temporaryPassword: tempPassword,
        orgId: result.org.id,
      });
      sendEmail({ to: request.contactEmail, subject, html }).catch((err) => {
        console.error("[activate] email send failed:", err?.message);
      });
    }

    return NextResponse.json({
      ok: true,
      message: result.needsBackfill
        ? `Cuenta de ${request.companyName} creada, arranca backfill histórico. Email se manda al completar.`
        : `Cuenta activada para ${request.companyName}`,
      orgId: result.org.id,
      orgSlug: result.org.slug,
      userId: result.user.id,
      connectionsCreated: result.connectionsCreated,
      backfillStarted: result.needsBackfill,
      emailSentTo: result.needsBackfill ? null : request.contactEmail,
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
