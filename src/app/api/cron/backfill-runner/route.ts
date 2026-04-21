// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/cron/backfill-runner
// ══════════════════════════════════════════════════════════════
// Cron que procesa el siguiente chunk del job de backfill más viejo.
// Invocado desde vercel.json cada 5 min + on-demand via isInternalUser.
// Cuando el job completa, chequea si ya terminaron todos los de su
// onboardingRequestId → marca ACTIVE y manda email.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import {
  pickNextJob,
  markJobRunning,
  updateJobProgress,
  completeJob,
  failJob,
  areAllJobsComplete,
} from "@/lib/backfill/job-manager";
import { processChunk } from "@/lib/backfill/dispatcher";
import { sendEmail } from "@/lib/email/send";
import { onboardingActivationEmail } from "@/lib/onboarding/emails";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const ok = key === CRON_KEY ? true : await isInternalUser();
    if (!ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const job = await pickNextJob();
    if (!job) {
      return NextResponse.json({ ok: true, picked: null, reason: "no-jobs" });
    }

    await markJobRunning(job.id);

    const result = await processChunk(job);

    const newProcessed = (Number(job.processedCount) || 0) + result.itemsProcessed;
    const total = result.totalEstimate || job.totalEstimate || 0;
    const pct = total > 0 ? Math.round((newProcessed / total) * 100) : (result.isComplete ? 100 : 0);

    await updateJobProgress(job.id, {
      cursor: result.newCursor,
      processedCount: newProcessed,
      totalEstimate: result.totalEstimate || Number(job.totalEstimate) || undefined,
      progressPct: pct,
    });

    if (result.error) {
      // Error en este chunk — marcamos lastError pero no failimos inmediatamente.
      // El job queda RUNNING con el cursor donde fallo; el próximo tick retoma.
      await prisma.$executeRawUnsafe(
        `UPDATE "backfill_jobs" SET "lastError" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
        job.id,
        result.error.slice(0, 2000)
      );
    }

    if (result.isComplete) {
      await completeJob(job.id);

      // Si era parte de un onboarding y ya terminaron todos → activar
      if (job.onboardingRequestId) {
        const allDone = await areAllJobsComplete(job.onboardingRequestId);
        if (allDone) {
          await finalizeOnboarding(job.onboardingRequestId);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      platform: job.platform,
      itemsProcessed: result.itemsProcessed,
      totalProcessed: newProcessed,
      isComplete: result.isComplete,
      error: result.error || null,
      progressPct: pct,
    });
  } catch (error: any) {
    console.error("[cron/backfill-runner] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Cuando TODOS los backfill jobs del onboarding terminaron → marcar la
// cuenta como ACTIVE y mandar email al cliente con credenciales.
async function finalizeOnboarding(onboardingRequestId: string) {
  // 1. Levanto la solicitud + la password temporal guardada en settings
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT o.*, org."settings" as "orgSettings", u."email" as "ownerEmail"
     FROM "onboarding_requests" o
     LEFT JOIN "organizations" org ON org."id" = o."createdOrgId"
     LEFT JOIN "users" u ON u."organizationId" = org."id" AND u."role" = 'OWNER'
     WHERE o."id" = $1 LIMIT 1`,
    onboardingRequestId
  );
  if (!rows[0]) return;
  const r = rows[0];

  // 2. Marcar ACTIVE
  await prisma.$executeRawUnsafe(
    `UPDATE "onboarding_requests"
     SET "status" = 'ACTIVE'::"OnboardingStatus",
         "activatedAt" = COALESCE("activatedAt", NOW()),
         "updatedAt" = NOW()
     WHERE "id" = $1`,
    onboardingRequestId
  );

  // 3. Enviar email
  const orgSettings = r.orgSettings as any;
  const tempPw = orgSettings?._initialPassword || null;
  if (r.contactEmail && tempPw) {
    try {
      const appUrl = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";
      const { subject, html } = onboardingActivationEmail({
        companyName: r.companyName,
        contactName: r.contactName,
        loginEmail: r.ownerEmail || r.contactEmail,
        temporaryPassword: tempPw,
        loginUrl: `${appUrl}/login`,
        orgId: r.createdOrgId,
      });
      await sendEmail({ to: r.contactEmail, subject, html });
      console.log(`[backfill-runner] Email de activacion enviado a ${r.contactEmail}`);
    } catch (err) {
      console.error(`[backfill-runner] No se pudo enviar email activacion:`, err);
    }
  }
}
