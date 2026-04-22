// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/cron/backfill-runner
// ══════════════════════════════════════════════════════════════
// Cron que procesa el siguiente chunk del job de backfill más viejo.
// Invocado desde vercel.json cada 1 min + on-demand via isInternalUser
// + trigger inmediato desde approve-backfill via waitUntil.
//
// LOOP INTERNO: a diferencia de la version anterior (1 chunk = 1 invocacion),
// ahora cada invocacion procesa multiples chunks hasta agotar el budget de
// tiempo (4 min de los 5 max de Vercel) o hasta que no queden jobs.
// Cap duro de 50 iteraciones como red de seguridad anti loop infinito.
//
// Cuando un job completa, chequea si ya terminaron todos los de su
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
// (onboardingActivationEmail ya no se usa aca — se manda en /activate)

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_KEY = "nitrosales-secret-key-2024-production";

// Budget de tiempo del loop: 240s (4min) de los 300s (5min) max.
// Deja 60s de margen para la response final + cleanup.
const LOOP_BUDGET_MS = 240_000;
// Cap de iteraciones como red de seguridad (independiente del tiempo).
// Con 2000 ordenes/iter y 50 iter = 100k ordenes max por invocacion,
// que es mas de lo que cualquier cliente razonable tiene en 3 anios.
const MAX_ITERATIONS = 50;

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const iterations: any[] = [];

  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const ok = key === CRON_KEY ? true : await isInternalUser();
    if (!ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Loop: procesar chunks hasta agotar tiempo o no quedar jobs
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= LOOP_BUDGET_MS) {
        // Se agoto el budget. La proxima invocacion (cron o manual) sigue.
        break;
      }

      const job = await pickNextJob();
      if (!job) {
        // No hay mas jobs en QUEUED/RUNNING activos
        break;
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
        // Error en chunk: marcar lastError pero no failimos inmediatamente.
        // El job queda RUNNING con el cursor donde fallo; el proximo tick retoma.
        await prisma.$executeRawUnsafe(
          `UPDATE "backfill_jobs" SET "lastError" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
          job.id,
          result.error.slice(0, 2000)
        );
        iterations.push({ jobId: job.id, platform: job.platform, items: result.itemsProcessed, error: result.error });
        // En caso de error, salir del loop para no machacar al provider
        // (el cursor quedo guardado, proxima invocacion retoma)
        break;
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

      iterations.push({
        jobId: job.id,
        platform: job.platform,
        items: result.itemsProcessed,
        complete: result.isComplete,
        pct,
      });
    }

    const totalProcessed = iterations.reduce((a, it) => a + (Number(it.items) || 0), 0);

    return NextResponse.json({
      ok: true,
      iterations: iterations.length,
      totalProcessed,
      elapsedMs: Date.now() - startTime,
      details: iterations,
    });
  } catch (error: any) {
    console.error("[cron/backfill-runner] error:", error);
    return NextResponse.json({
      error: error.message,
      iterationsBeforeError: iterations.length,
      elapsedMs: Date.now() - startTime,
    }, { status: 500 });
  }
}

// Cuando TODOS los backfill jobs del onboarding terminaron → marcar el
// onboarding como ACTIVE (overlay desaparece) y mandar email "tu data esta lista".
// El email de activacion (con credenciales de login) se mando en el momento de
// la primera aprobacion (/activate), no aca.
async function finalizeOnboarding(onboardingRequestId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT * FROM "onboarding_requests" WHERE "id" = $1 LIMIT 1`,
    onboardingRequestId
  );
  if (!rows[0]) return;
  const r = rows[0];

  // Marcar ACTIVE (esto hace que el overlay del producto desaparezca solo)
  await prisma.$executeRawUnsafe(
    `UPDATE "onboarding_requests"
     SET "status" = 'ACTIVE'::"OnboardingStatus",
         "progressStage" = 'completed',
         "updatedAt" = NOW()
     WHERE "id" = $1`,
    onboardingRequestId
  );

  // Email "tu data esta lista"
  if (r.contactEmail) {
    try {
      const appUrl = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";
      await sendEmail({
        to: r.contactEmail,
        subject: `✨ Tu data está lista — ${r.companyName}`,
        html: `<!DOCTYPE html><html><body style="background:#0A0A0F;color:#fff;font-family:-apple-system,sans-serif;padding:40px 20px;">
<div style="max-width:520px;margin:0 auto;background:#141419;border-radius:16px;padding:32px;border:1px solid #1F1F2E;">
  <div style="font-size:11px;color:#22C55E;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">NitroSales · Listo</div>
  <h1 style="margin:0 0 12px;font-size:22px;color:#fff;">Tu plataforma está completamente desbloqueada</h1>
  <p style="color:#9CA3AF;font-size:14px;line-height:1.6;margin:0 0 24px;">
    Hola ${r.contactName}, terminamos de procesar toda tu data histórica. Cuando entres a NitroSales vas a tener acceso completo a todos los productos.
  </p>
  <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF5E1A,#FF8C4A);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Abrir NitroSales →</a>
</div>
</body></html>`,
      });
      console.log(`[backfill-runner] Email 'data lista' enviado a ${r.contactEmail}`);
    } catch (err) {
      console.error(`[backfill-runner] Email failed:`, err);
    }
  }
}
