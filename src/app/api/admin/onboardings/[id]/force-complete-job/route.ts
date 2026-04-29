// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/onboardings/[id]/force-complete-job
// ══════════════════════════════════════════════════════════════
// Marca un backfill_job como COMPLETED a mano. Util cuando el motor
// ya cargo toda la data real y se quedo paseando por anios vacios
// (ej: cliente con 4 anios de historia pero pediste "todo" = 10 anios,
// el motor camina hacia atras chunk por chunk hasta llegar al fromDate).
//
// Body: { jobId: string } o { platform: "VTEX" | "MERCADOLIBRE" }
// Si viene platform, busca el job RUNNING de esa plataforma del onboarding.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { completeJob, areAllJobsComplete } from "@/lib/backfill/job-manager";
import { waitUntil } from "@vercel/functions";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id: onboardingId } = await params;
    const body = await req.json().catch(() => ({}));
    const jobIdInput = body?.jobId ? String(body.jobId) : null;
    const platform = body?.platform ? String(body.platform).toUpperCase() : null;

    if (!jobIdInput && !platform) {
      return NextResponse.json({ error: "Mandar jobId o platform" }, { status: 400 });
    }

    // Buscar job
    let job: any;
    if (jobIdInput) {
      const rows = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT * FROM "backfill_jobs" WHERE "id" = $1 AND "onboardingRequestId" = $2 LIMIT 1`,
        jobIdInput,
        onboardingId,
      );
      job = rows[0];
    } else {
      const rows = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT * FROM "backfill_jobs"
         WHERE "onboardingRequestId" = $1
           AND "platform" = $2::"Platform"
           AND "status" IN ('QUEUED', 'RUNNING')
         ORDER BY "createdAt" DESC LIMIT 1`,
        onboardingId,
        platform,
      );
      job = rows[0];
    }

    if (!job) {
      return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });
    }
    if (job.status === "COMPLETED") {
      return NextResponse.json({ error: "Job ya esta completado" }, { status: 409 });
    }

    await completeJob(job.id);

    // Si es el ultimo job pendiente del onboarding → triggerear finalize
    let triggeredFinalize = false;
    if (job.onboardingRequestId) {
      const allDone = await areAllJobsComplete(job.onboardingRequestId);
      if (allDone) {
        const baseUrl = process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";
        const KEY = "nitrosales-secret-key-2024-production";
        const finalizeUrl = `${baseUrl}/api/cron/post-backfill-finalize?orgId=${encodeURIComponent(job.organizationId)}&key=${KEY}`;
        waitUntil(
          fetch(finalizeUrl, { method: "GET" })
            .then((r) => console.log(`[force-complete-job] finalize triggered: HTTP ${r.status}`))
            .catch((err) => console.error(`[force-complete-job] finalize failed: ${err.message}`)),
        );
        triggeredFinalize = true;

        // Marcar onboarding como READY_FOR_REVIEW
        await prisma.$executeRawUnsafe(
          `UPDATE "onboarding_requests"
           SET "status" = 'READY_FOR_REVIEW'::"OnboardingStatus",
               "progressStage" = 'awaiting_admin_activation',
               "updatedAt" = NOW()
           WHERE "id" = $1`,
          job.onboardingRequestId,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      platform: job.platform,
      message: `Job ${job.platform} marcado como COMPLETED.${triggeredFinalize ? " Onboarding paso a READY_FOR_REVIEW." : ""}`,
      triggeredFinalize,
    });
  } catch (err: any) {
    console.error("[force-complete-job] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
