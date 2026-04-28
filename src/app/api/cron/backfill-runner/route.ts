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
  getJob,
} from "@/lib/backfill/job-manager";
import { processChunk } from "@/lib/backfill/dispatcher";
import { sendEmail } from "@/lib/email/send";
import { dataReadyEmailActive } from "@/lib/onboarding/emails";
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

    // Loop: procesar chunks hasta agotar tiempo o no quedar jobs.
    //
    // FIX (post-deploy inicial): el loop reusa el MISMO job mientras no complete,
    // en vez de re-pickear cada iteracion. pickNextJob tiene cooldown de 2 min
    // (proteccion anti race conditions entre cron + waitUntil) que bloqueaba
    // que el loop interno avance — el job recien procesado quedaba "bloqueado"
    // por su propio lastChunkAt fresco.
    //
    // Ahora: pickeamos un job al inicio (o cuando uno completa) y lo reusamos
    // hasta complete/error. La proteccion contra workers concurrentes sigue
    // intacta porque la reusa es DENTRO del mismo invoke (mismo worker que
    // ya tiene "lock" via lastChunkAt fresco).
    let currentJob: any = null;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= LOOP_BUDGET_MS) {
        // Se agoto el budget. La proxima invocacion (cron o manual) sigue.
        break;
      }

      // Pickear nuevo job solo si no tenemos uno activo
      if (!currentJob) {
        currentJob = await pickNextJob();
        if (!currentJob) {
          // No hay mas jobs en QUEUED/RUNNING activos
          break;
        }
        await markJobRunning(currentJob.id);
      } else {
        // Refrescar el job desde DB para tener cursor/processedCount actualizados
        // (los acabamos de updatear nosotros mismos en la iter anterior).
        const fresh = await getJob(currentJob.id);
        if (!fresh) break; // safety — no deberia pasar
        currentJob = fresh;
      }

      const result = await processChunk(currentJob);
      const newProcessed = (Number(currentJob.processedCount) || 0) + result.itemsProcessed;
      const total = result.totalEstimate || currentJob.totalEstimate || 0;
      const pct = total > 0 ? Math.round((newProcessed / total) * 100) : (result.isComplete ? 100 : 0);

      await updateJobProgress(currentJob.id, {
        cursor: result.newCursor,
        processedCount: newProcessed,
        totalEstimate: result.totalEstimate || Number(currentJob.totalEstimate) || undefined,
        progressPct: pct,
      });

      if (result.error) {
        // Error en chunk: marcar lastError pero no failimos inmediatamente.
        // El job queda RUNNING con el cursor donde fallo; el proximo tick retoma.
        await prisma.$executeRawUnsafe(
          `UPDATE "backfill_jobs" SET "lastError" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
          currentJob.id,
          result.error.slice(0, 2000)
        );
        iterations.push({ jobId: currentJob.id, platform: currentJob.platform, items: result.itemsProcessed, error: result.error });
        // En caso de error, soltar el job y salir del loop (no machacar al provider).
        // El cursor quedo guardado, proxima invocacion retoma despues del cooldown.
        currentJob = null;
        break;
      }

      iterations.push({
        jobId: currentJob.id,
        platform: currentJob.platform,
        items: result.itemsProcessed,
        complete: result.isComplete,
        pct,
      });

      if (result.isComplete) {
        await completeJob(currentJob.id);

        // Si era parte de un onboarding y ya terminaron TODOS los jobs:
        //   - dispara post-backfill-finalize (catalog-refresh + recompute aggregates +
        //     backfill-orderitem-costs SECUENCIALMENTE — fire-and-forget porque
        //     puede tardar 5-10 min)
        //   - llama finalizeOnboarding (email + activacion del cliente, mas rapido)
        if (currentJob.onboardingRequestId) {
          const allDone = await areAllJobsComplete(currentJob.onboardingRequestId);
          if (allDone) {
            const baseUrl = process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";
            const KEY = "nitrosales-secret-key-2024-production";
            const finalizeUrl = `${baseUrl}/api/cron/post-backfill-finalize?orgId=${encodeURIComponent(currentJob.organizationId)}&key=${KEY}`;
            fetch(finalizeUrl, { method: "GET" })
              .then((r) => console.log(`[backfill-runner] post-backfill-finalize triggered: HTTP ${r.status}`))
              .catch((err) => console.error(`[backfill-runner] post-backfill-finalize failed: ${err.message}`));

            await finalizeOnboarding(currentJob.onboardingRequestId);
          }
        }
        // Soltamos este job para que la proxima iter pickee otro (otra plataforma)
        currentJob = null;
      }
      // Si no completo, currentJob queda y la proxima iter lo refresca desde DB
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

  // S59: marcar READY_FOR_REVIEW (estado intermedio). El cliente sigue
  // viendo overlay "preparando" hasta que admin haga click "Habilitar"
  // desde /control/onboardings/[id] o /control/clientes/[id]. Asi se hace
  // QA visual antes de exponer el producto al cliente.
  //
  // El email "tu data esta lista" NO se manda aca — se manda cuando admin
  // hace click en activate-client.
  await prisma.$executeRawUnsafe(
    `UPDATE "onboarding_requests"
     SET "status" = 'READY_FOR_REVIEW'::"OnboardingStatus",
         "progressStage" = 'awaiting_admin_activation',
         "updatedAt" = NOW()
     WHERE "id" = $1`,
    onboardingRequestId
  );
  console.log(`[backfill-runner] Onboarding ${onboardingRequestId} marcado READY_FOR_REVIEW. Esperando activacion manual del admin.`);
}
