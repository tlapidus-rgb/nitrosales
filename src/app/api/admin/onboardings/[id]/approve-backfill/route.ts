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

    // Marcar connections sin needsOAuth como ACTIVE
    for (const c of connections) {
      const creds = (c.credentials as any) || {};
      if (creds.needsSetup) continue; // saltear las que no se configuraron
      const isOAuth = c.platform === "MERCADOLIBRE" || c.platform === "GOOGLE_ADS";
      const newStatus = isOAuth ? "PENDING" : "ACTIVE"; // OAuth queda PENDING hasta que hagan login externo
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
    const appUrl = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";
    sendEmail({
      to: ob.contactEmail,
      subject: `🚀 Arrancó tu backfill — ${ob.companyName}`,
      html: `<!DOCTYPE html><html><body style="background:#0A0A0F;color:#fff;font-family:-apple-system,sans-serif;padding:40px 20px;">
<div style="max-width:520px;margin:0 auto;background:#141419;border-radius:16px;padding:32px;border:1px solid #1F1F2E;">
  <div style="font-size:11px;color:#FF5E1A;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">NitroSales</div>
  <h1 style="margin:0 0 12px;font-size:22px;color:#fff;">Estamos trayendo tu data histórica</h1>
  <p style="color:#9CA3AF;font-size:14px;line-height:1.6;margin:0 0 16px;">
    Hola ${ob.contactName}, validamos tus credenciales y arrancamos el backfill de tu data histórica. Esto puede tardar entre 1 y 24 horas dependiendo del volumen.
  </p>
  <p style="color:#9CA3AF;font-size:13px;line-height:1.6;margin:0 0 24px;">
    Podés entrar al producto cuando quieras — vas a ver el progreso en vivo. El producto se desbloquea automáticamente al terminar.
  </p>
  <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF5E1A,#FF8C4A);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Abrir NitroSales →</a>
</div>
</body></html>`,
    }).catch((err) => console.error("[approve-backfill] client email failed:", err?.message));

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
