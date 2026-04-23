// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/me/onboarding/submit-wizard
// ══════════════════════════════════════════════════════════════
// El cliente envia el wizard completo (plataformas + credenciales +
// rango historico). Guardamos:
//   - Una Connection por cada plataforma marcada (status PENDING +
//     credenciales encriptadas en el JSON credentials de la conn)
//   - historyXxxMonths en el onboarding_request para que el admin sepa
//     qué rango usar al aprobar el backfill
//   - status del onboarding_request → NEEDS_INFO (esperando aprobacion 2)
//
// Notifica a Tomy via email "Nuevo cliente listo para aprobar backfill".
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendEmail } from "@/lib/email/send";
import { waitUntil } from "@vercel/functions";

export const dynamic = "force-dynamic";

const VALID_PLATFORMS = new Set(["VTEX", "MERCADOLIBRE", "META_ADS", "META_PIXEL", "GOOGLE_ADS"]);

interface PlatformInput {
  platform: string;
  credentials: any;
}

export async function POST(req: NextRequest) {
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
      return NextResponse.json({ error: "Solo el OWNER puede completar el wizard" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const platforms: PlatformInput[] = Array.isArray(body.platforms) ? body.platforms : [];
    const historyMonths: Record<string, number> = body.historyMonths || {};

    if (platforms.length === 0) {
      return NextResponse.json({ error: "Tenés que conectar al menos una plataforma" }, { status: 400 });
    }

    // Validar y crear/actualizar connections
    const created: string[] = [];
    for (const p of platforms) {
      if (!VALID_PLATFORMS.has(p.platform)) continue;

      const validationError = validatePlatformCreds(p.platform, p.credentials);
      if (validationError) {
        return NextResponse.json(
          { error: `${p.platform}: ${validationError}` },
          { status: 400 }
        );
      }

      // Upsert connection (PENDING hasta aprobacion de Tomy)
      const existing = await prisma.connection.findFirst({
        where: { organizationId: user.organizationId, platform: p.platform as any },
        select: { id: true },
      });

      if (existing) {
        await prisma.connection.update({
          where: { id: existing.id },
          data: {
            status: "PENDING",
            credentials: p.credentials,
            lastSyncError: null,
          },
        });
      } else {
        await prisma.connection.create({
          data: {
            organizationId: user.organizationId,
            platform: p.platform as any,
            status: "PENDING",
            credentials: p.credentials,
          },
        });
      }
      created.push(p.platform);
    }

    // Guardar historyMonths en el onboarding_request asociado
    const obRows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "id" FROM "onboarding_requests" WHERE "createdOrgId" = $1 LIMIT 1`,
      user.organizationId
    );
    const ob = obRows[0];

    if (!ob) {
      return NextResponse.json({ error: "Onboarding request no encontrado" }, { status: 404 });
    }

    const vtexMonths = clampMonths(historyMonths.VTEX, 12);
    const mlMonths = clampMonths(historyMonths.MERCADOLIBRE, 12);
    const metaMonths = clampMonths(historyMonths.META_ADS, 6);
    const googleMonths = clampMonths(historyMonths.GOOGLE_ADS, 6);

    await prisma.$executeRawUnsafe(
      `UPDATE "onboarding_requests"
       SET "historyVtexMonths" = $2,
           "historyMlMonths" = $3,
           "historyMetaMonths" = $4,
           "historyGoogleMonths" = $5,
           "status" = 'NEEDS_INFO'::"OnboardingStatus",
           "progressStage" = 'wizard_submitted',
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      ob.id,
      vtexMonths,
      mlMonths,
      metaMonths,
      googleMonths
    );

    // Notificar a Tomy
    const adminEmail = "tlapidus@99media.com.ar";
    const orgName = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true },
    });
    const appUrl = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";
    waitUntil(
      sendEmail({
        to: adminEmail,
        subject: `🎯 ${orgName?.name || "Cliente"} completó el wizard — listo para aprobar backfill`,
        context: "wizard.submitted.admin-notify",
        html: `<!DOCTYPE html><html><body style="background:#0A0A0F;color:#fff;font-family:-apple-system,sans-serif;padding:40px 20px;">
<div style="max-width:520px;margin:0 auto;background:#141419;border-radius:16px;padding:32px;border:1px solid #1F1F2E;">
  <div style="font-size:11px;color:#FF5E1A;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">NitroSales · Centro de Control</div>
  <h1 style="margin:0 0 12px;font-size:22px;color:#fff;">Cliente listo para backfill</h1>
  <p style="color:#9CA3AF;font-size:14px;line-height:1.6;margin:0 0 16px;">
    <strong style="color:#fff;">${orgName?.name || "Cliente"}</strong> completó el wizard de credenciales y está esperando tu aprobación para arrancar el backfill histórico.
  </p>
  <p style="color:#9CA3AF;font-size:13px;line-height:1.6;margin:0 0 24px;">
    Plataformas conectadas: <strong style="color:#fff;">${created.join(", ")}</strong><br/>
    Rango histórico: VTEX ${vtexMonths}m · ML ${mlMonths}m
  </p>
  <a href="${appUrl}/control/onboardings" style="display:inline-block;background:linear-gradient(135deg,#FF5E1A,#FF8C4A);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Revisar y aprobar →</a>
</div>
</body></html>`,
      }).catch((err) => console.error("[submit-wizard] admin email failed:", err?.message))
    );

    return NextResponse.json({
      ok: true,
      message: "Wizard enviado. Esperando aprobación de NitroSales para arrancar el backfill.",
      platformsConnected: created,
    });
  } catch (error: any) {
    console.error("[me/onboarding/submit-wizard] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function clampMonths(v: any, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  if (n === -1) return 120;
  if (n < 0) return def;
  if (n > 120) return 120;
  return Math.round(n);
}

function validatePlatformCreds(platform: string, creds: any): string | null {
  if (!creds || typeof creds !== "object") return "credentials requerido";
  switch (platform) {
    case "VTEX":
      // 'provider' viene del dropdown de plataforma ecommerce (vtex/tiendanube/...)
      // Si NO es vtex, el cliente eligió una plataforma en desarrollo — lo aceptamos
      // como interes capturado pero sin credenciales.
      if (!creds.provider || typeof creds.provider !== "string") {
        return "Seleccioná tu plataforma ecommerce";
      }
      if (creds.provider === "vtex") {
        if (!creds.accountName || typeof creds.accountName !== "string") return "accountName requerido";
        if (!creds.appKey || typeof creds.appKey !== "string") return "appKey requerido";
        if (!creds.appToken || typeof creds.appToken !== "string") return "appToken requerido";
      }
      // Para providers no-vtex (tiendanube/shopify/etc), solo capturamos interes.
      break;
    case "MERCADOLIBRE":
      // OAuth flow: aceptar si hay mlUserId o accessToken (viene del callback OAuth).
      // El username ya no se pide en el wizard — MELI lo completa automaticamente.
      if (!creds.mlUserId && !creds.accessToken && !creds._connected && !creds.username) {
        return "MercadoLibre no está conectado. Hacé click en 'Conectar con MercadoLibre' para autorizar.";
      }
      break;
    case "META_ADS":
      if (!creds.adAccountId || typeof creds.adAccountId !== "string") return "adAccountId requerido";
      if (!creds.accessToken || typeof creds.accessToken !== "string") return "accessToken requerido";
      break;
    case "META_PIXEL":
      if (!creds.pixelId || typeof creds.pixelId !== "string") return "pixelId requerido";
      if (!creds.accessToken || typeof creds.accessToken !== "string") return "accessToken requerido";
      break;
    case "GOOGLE_ADS":
      if (!creds.customerId || typeof creds.customerId !== "string") return "customerId requerido";
      break;
  }
  return null;
}
