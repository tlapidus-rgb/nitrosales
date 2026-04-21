// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/setup/connect
// ══════════════════════════════════════════════════════════════
// Recibe credenciales de una plataforma, las valida mínimo, las guarda
// encriptadas, marca la Connection como ACTIVE y — si aplica — dispara
// el backfill job con el rango elegido originalmente en el onboarding.
//
// Body:
//   { platform: "VTEX" | "MERCADOLIBRE" | "META_ADS" | "META_PIXEL" | "GOOGLE_ADS",
//     credentials: { ...campos de la plataforma } }
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createBackfillJob } from "@/lib/backfill/job-manager";

export const dynamic = "force-dynamic";

const VALID_PLATFORMS = new Set(["VTEX", "MERCADOLIBRE", "META_ADS", "META_PIXEL", "GOOGLE_ADS"]);

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
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Solo OWNER/ADMIN pueden conectar plataformas
    if (user.role !== "OWNER" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden — requiere rol OWNER o ADMIN" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { platform, credentials } = body;

    if (!VALID_PLATFORMS.has(platform)) {
      return NextResponse.json({ error: `platform inválida: ${platform}` }, { status: 400 });
    }

    // Validación mínima según plataforma
    const validationError = validatePlatformCreds(platform, credentials);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Existe la connection?
    const existing = await prisma.connection.findFirst({
      where: { organizationId: user.organizationId, platform: platform as any },
      select: { id: true, credentials: true },
    });

    // Para OAuth platforms (ML, Google Ads): marcamos status=PENDING hasta que hagan OAuth
    // desde el producto. Guardamos los datos públicos (username, customerId).
    const needsOAuth = platform === "MERCADOLIBRE" || platform === "GOOGLE_ADS";
    const finalStatus = needsOAuth ? "PENDING" : "ACTIVE";

    if (existing) {
      await prisma.connection.update({
        where: { id: existing.id },
        data: {
          status: finalStatus as any,
          credentials: needsOAuth
            ? { ...credentials, needsOAuth: true }
            : credentials,
          lastSyncError: null,
        },
      });
    } else {
      await prisma.connection.create({
        data: {
          organizationId: user.organizationId,
          platform: platform as any,
          status: finalStatus as any,
          credentials: needsOAuth
            ? { ...credentials, needsOAuth: true }
            : credentials,
        },
      });
    }

    // Si la plataforma quedó ACTIVE y soporta backfill (VTEX), disparar job.
    let backfillJobId: string | null = null;
    if (finalStatus === "ACTIVE" && platform === "VTEX") {
      // Levanto los meses elegidos originalmente en el onboarding_request
      const obRows = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT "historyVtexMonths", "id" FROM "onboarding_requests"
         WHERE "createdOrgId" = $1 LIMIT 1`,
        user.organizationId
      );
      const ob = obRows[0];
      const months = Number(ob?.historyVtexMonths) || 12;

      if (months > 0) {
        // Chequear que no haya un job activo ya
        const existingJobs = await prisma.$queryRawUnsafe<Array<any>>(
          `SELECT "id" FROM "backfill_jobs"
           WHERE "organizationId" = $1 AND "platform" = 'VTEX'
             AND "status" IN ('QUEUED', 'RUNNING')
           LIMIT 1`,
          user.organizationId
        );
        if (existingJobs.length === 0) {
          backfillJobId = await createBackfillJob({
            organizationId: user.organizationId,
            platform: "VTEX",
            monthsRequested: months,
            onboardingRequestId: ob?.id || null,
          });
          console.log(`[setup/connect] backfill VTEX job creado: ${backfillJobId}`);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      platform,
      status: finalStatus,
      backfillJobId,
      needsOAuth,
    });
  } catch (error: any) {
    console.error("[setup/connect] error:", error);
    return NextResponse.json({ error: error.message || "Error" }, { status: 500 });
  }
}

function validatePlatformCreds(platform: string, creds: any): string | null {
  if (!creds || typeof creds !== "object") return "credentials requerido";

  switch (platform) {
    case "VTEX":
      if (!creds.accountName || typeof creds.accountName !== "string") return "accountName requerido";
      if (!creds.appKey || typeof creds.appKey !== "string") return "appKey requerido";
      if (!creds.appToken || typeof creds.appToken !== "string") return "appToken requerido";
      break;
    case "MERCADOLIBRE":
      if (!creds.username || typeof creds.username !== "string") return "username requerido";
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
