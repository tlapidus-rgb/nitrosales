// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/onboardings/[id]/approve-backfill
// ══════════════════════════════════════════════════════════════
// Segunda aprobación del flow: Tomy revisa que el wizard del cliente
// esté OK y dispara los backfill jobs.
//
// Estado: NEEDS_INFO → BACKFILLING.
// Crea backfill jobs para VTEX y MERCADOLIBRE (con sus respectivos
// rangos guardados en el onboarding_request).
// Manda email al cliente avisando que arrancó el backfill.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { createBackfillJob } from "@/lib/backfill/job-manager";
import { sendEmail } from "@/lib/email/send";
import { backfillStartedEmailActive } from "@/lib/onboarding/emails";
import { waitUntil } from "@vercel/functions";

export const dynamic = "force-dynamic";

const BACKFILL_RUNNER_KEY = "nitrosales-secret-key-2024-production";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "onboarding_requests" WHERE "id" = $1 LIMIT 1`,
      id
    );
    const ob = rows[0];
    if (!ob) {
      return NextResponse.json({ error: "Onboarding request no encontrado" }, { status: 404 });
    }
    if (!ob.createdOrgId) {
      return NextResponse.json({ error: "El onboarding aún no fue activado (sin org)" }, { status: 400 });
    }
    if (ob.status === "BACKFILLING") {
      return NextResponse.json({ error: "Backfill ya está corriendo" }, { status: 409 });
    }
    if (ob.status === "ACTIVE") {
      return NextResponse.json({ error: "Onboarding ya está completado" }, { status: 409 });
    }
    if (ob.status !== "NEEDS_INFO") {
      return NextResponse.json(
        { error: `El onboarding está en ${ob.status}, no se puede aprobar backfill (debe estar NEEDS_INFO)` },
        { status: 400 }
      );
    }

    // Verificar que haya al menos una connection PENDING con credenciales reales
    const connections = await prisma.connection.findMany({
      where: { organizationId: ob.createdOrgId },
      select: { id: true, platform: true, status: true, credentials: true },
    });
    if (connections.length === 0) {
      return NextResponse.json(
        { error: "No hay conexiones configuradas (el cliente no completó el wizard)" },
        { status: 400 }
      );
    }

    // Marcar connections como ACTIVE si están listas para sincronizar.
    // Para OAuth (ML/Google Ads): ACTIVE solo si ya hay tokens (accessToken/mlUserId).
    // Para el resto: ACTIVE directo.
    for (const c of connections) {
      const creds = (c.credentials as any) || {};
      if (creds.needsSetup) continue;

      let newStatus: "ACTIVE" | "PENDING" = "ACTIVE";
      if (c.platform === "MERCADOLIBRE") {
        // Tiene tokens del OAuth callback? Entonces ACTIVE. Si no, queda PENDING.
        newStatus = creds.accessToken && creds.mlUserId ? "ACTIVE" : "PENDING";
      } else if (c.platform === "GOOGLE_ADS") {
        newStatus = creds.accessToken ? "ACTIVE" : "PENDING";
      }

      await prisma.connection.update({
        where: { id: c.id },
        data: { status: newStatus as any, lastSyncError: null },
      });
    }

    // Crear backfill jobs (VTEX + ML, los que tengan months > 0)
    const createdJobs: string[] = [];

    const vtexConn = connections.find((c) => c.platform === "VTEX");
    const vtexMonths = Number(ob.historyVtexMonths) || 0;
    if (vtexConn && vtexMonths > 0) {
      // Verificar que no haya un job activo
      const existing = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT "id" FROM "backfill_jobs"
         WHERE "organizationId" = $1 AND "platform" = 'VTEX'
           AND "status" IN ('QUEUED', 'RUNNING') LIMIT 1`,
        ob.createdOrgId
      );
      if (existing.length === 0) {
        const jobId = await createBackfillJob({
          organizationId: ob.createdOrgId,
          platform: "VTEX",
          monthsRequested: vtexMonths,
          onboardingRequestId: ob.id,
        });
        createdJobs.push(`VTEX:${jobId}`);
      }
    }

    const mlConn = connections.find((c) => c.platform === "MERCADOLIBRE");
    const mlMonths = Number(ob.historyMlMonths) || 0;
    if (mlConn && mlMonths > 0) {
      const existing = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT "id" FROM "backfill_jobs"
         WHERE "organizationId" = $1 AND "platform" = 'MERCADOLIBRE'
           AND "status" IN ('QUEUED', 'RUNNING') LIMIT 1`,
        ob.createdOrgId
      );
      if (existing.length === 0) {
        const jobId = await createBackfillJob({
          organizationId: ob.createdOrgId,
          platform: "MERCADOLIBRE",
          monthsRequested: mlMonths,
          onboardingRequestId: ob.id,
        });
        createdJobs.push(`ML:${jobId}`);
      }
    }

    // Status onboarding → BACKFILLING
    await prisma.$executeRawUnsafe(
      `UPDATE "onboarding_requests"
       SET "status" = 'BACKFILLING'::"OnboardingStatus",
           "progressStage" = 'backfilling',
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      ob.id
    );

    // Email al cliente
    const tpl = await backfillStartedEmailActive({
      contactName: ob.contactName,
      companyName: ob.companyName,
    });
    // CRÍTICO: waitUntil para que Vercel no mate la función antes de que
    // el email llegue a Resend.
    waitUntil(
      sendEmail({
        to: ob.contactEmail,
        subject: tpl.subject,
        html: tpl.html,
        context: "backfill.started",
      }).catch((err) => console.error("[approve-backfill] client email failed:", err?.message))
    );

    // Trigger inmediato del runner: no esperar al proximo tick del cron (1 min).
    // Disparamos el runner en background para que arranque a procesar AHORA.
    // waitUntil mantiene la funcion alive despues de responder 200 al admin.
    if (createdJobs.length > 0) {
      const baseUrl = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";
      const runnerUrl = `${baseUrl}/api/cron/backfill-runner?key=${encodeURIComponent(BACKFILL_RUNNER_KEY)}`;
      waitUntil(
        fetch(runnerUrl, { method: "GET" })
          .then((r) => console.log(`[approve-backfill] runner triggered: HTTP ${r.status}`))
          .catch((err) => console.error(`[approve-backfill] runner trigger failed: ${err.message}`))
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Backfill aprobado para ${ob.companyName}. Jobs creados: ${createdJobs.length}`,
      jobs: createdJobs,
      orgId: ob.createdOrgId,
      runnerTriggered: createdJobs.length > 0,
    });
  } catch (error: any) {
    console.error("[admin/onboardings/approve-backfill] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
