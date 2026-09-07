// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// BackfillJob manager
// ══════════════════════════════════════════════════════════════
// Helpers para crear, avanzar, completar jobs de backfill.
// Usa SQL directo porque la tabla no está en el Prisma schema
// (evitamos modificar el schema hasta que la tabla esté en prod).
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import { randomUUID } from "crypto";
import type { BackfillPlatform, BackfillStatus } from "./types";

export async function createBackfillJob(args: {
  organizationId: string;
  platform: BackfillPlatform;
  monthsRequested: number;
  onboardingRequestId?: string | null;
}): Promise<string> {
  const id = randomUUID();
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setMonth(fromDate.getMonth() - args.monthsRequested);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "backfill_jobs"
      ("id", "organizationId", "platform", "status", "monthsRequested", "fromDate", "toDate", "onboardingRequestId")
     VALUES ($1, $2, $3, 'QUEUED', $4, $5, $6, $7)`,
    id,
    args.organizationId,
    args.platform,
    args.monthsRequested,
    fromDate,
    toDate,
    args.onboardingRequestId || null
  );

  return id;
}

export async function getJob(id: string): Promise<any | null> {
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT * FROM "backfill_jobs" WHERE "id" = $1 LIMIT 1`,
    id
  );
  return rows[0] || null;
}

export async function getActiveJobsForOrg(orgId: string): Promise<any[]> {
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT * FROM "backfill_jobs"
     WHERE "organizationId" = $1
       AND "status" IN ('QUEUED', 'RUNNING')
     ORDER BY "createdAt" ASC`,
    orgId
  );
  return rows;
}

export async function getJobsByOnboarding(onboardingRequestId: string): Promise<any[]> {
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT * FROM "backfill_jobs"
     WHERE "onboardingRequestId" = $1
     ORDER BY "createdAt" ASC`,
    onboardingRequestId
  );
  return rows;
}

// Siguiente job a procesar (el mas viejo QUEUED o RUNNING pero sin chunk en los ultimos 2 min)
export async function pickNextJob(): Promise<any | null> {
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT * FROM "backfill_jobs"
     WHERE "status" = 'QUEUED'
        OR ("status" = 'RUNNING' AND ("lastChunkAt" IS NULL OR "lastChunkAt" < $1))
     ORDER BY
       CASE "status" WHEN 'RUNNING' THEN 0 ELSE 1 END,
       "createdAt" ASC
     LIMIT 1`,
    twoMinAgo
  );
  return rows[0] || null;
}

export async function markJobRunning(id: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "backfill_jobs"
     SET "status" = 'RUNNING',
         "startedAt" = COALESCE("startedAt", NOW()),
         "updatedAt" = NOW()
     WHERE "id" = $1 AND "status" != 'COMPLETED'`,
    id
  );
}

export async function updateJobProgress(
  id: string,
  args: {
    cursor?: any;
    processedCount?: number;
    totalEstimate?: number;
    progressPct?: number;
  },
  // `lastChunkAt` es el LATIDO del job: dice "esto todavia esta avanzando".
  // Lo usan dos cosas: `contarJobsActivos` (para el limite de concurrencia) y
  // `reclamarProximoJob` (para saber si un job quedo abandonado).
  //
  // Por eso un chunk que FALLA no tiene que tocarlo: si lo tocara, un job roto
  // seguiria pareciendo vivo para siempre. Ver el reaper de abajo.
  opts: { tocarLatido?: boolean } = {}
): Promise<void> {
  const tocarLatido = opts.tocarLatido !== false;
  const sets: string[] = tocarLatido
    ? [`"lastChunkAt" = NOW()`, `"updatedAt" = NOW()`]
    : [`"updatedAt" = NOW()`];
  const values: any[] = [id];
  let idx = 2;

  if (args.cursor !== undefined) {
    sets.push(`"cursor" = $${idx++}::jsonb`);
    values.push(JSON.stringify(args.cursor));
  }
  if (args.processedCount !== undefined) {
    sets.push(`"processedCount" = $${idx++}`);
    values.push(args.processedCount);
  }
  if (args.totalEstimate !== undefined) {
    sets.push(`"totalEstimate" = $${idx++}`);
    values.push(args.totalEstimate);
  }
  if (args.progressPct !== undefined) {
    sets.push(`"progressPct" = $${idx++}`);
    values.push(Math.min(100, Math.max(0, Math.round(args.progressPct))));
  }

  await prisma.$executeRawUnsafe(
    `UPDATE "backfill_jobs" SET ${sets.join(", ")} WHERE "id" = $1`,
    ...values
  );
}

export async function completeJob(id: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "backfill_jobs"
     SET "status" = 'COMPLETED',
         "progressPct" = 100,
         "completedAt" = NOW(),
         "updatedAt" = NOW(),
         "lastError" = NULL
     WHERE "id" = $1`,
    id
  );
}

export async function failJob(id: string, error: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "backfill_jobs"
     SET "status" = 'FAILED',
         "lastError" = $2,
         "updatedAt" = NOW()
     WHERE "id" = $1`,
    id,
    error.slice(0, 2000)
  );
}

// Todos los jobs de un onboarding estan completos?
export type ConteoDeJobs = { total: number; pendientes: number; fallados: number };

export const CONTEO_DE_JOBS_SQL = `SELECT
        COUNT(*) FILTER (WHERE "status" NOT IN ('COMPLETED', 'FAILED')) as pendientes,
        COUNT(*) FILTER (WHERE "status" = 'FAILED') as fallados,
        COUNT(*) as total
   FROM "backfill_jobs"
  WHERE "onboardingRequestId" = $1`;

export async function contarJobsDelOnboarding(
  onboardingRequestId: string,
): Promise<ConteoDeJobs> {
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    CONTEO_DE_JOBS_SQL,
    onboardingRequestId,
  );
  const r = rows[0];
  return {
    total: Number(r?.total || 0),
    pendientes: Number(r?.pendientes || 0),
    fallados: Number(r?.fallados || 0),
  };
}

/**
 * El criterio, separado de la query, para poder testearlo sin una base.
 *
 * ⚠️ UN JOB FALLADO NO ES UN ALTA COMPLETA (corregido el 2026-09-07).
 * Antes FAILED contaba como terminado. O sea: si VTEX se caia media hora en
 * medio del backfill, el reaper marcaba el job FAILED, esto devolvia `true`, se
 * disparaba `post-backfill-finalize` y el cliente quedaba "listo" con un
 * backfill parcial o vacio. Nadie lo re-encolaba y nada volvia a mirarlo: la
 * unica senal habria sido que los numeros estaban bajos, y eso en un cliente
 * nuevo no se nota, porque nadie sabe todavia cuanto tendria que dar.
 *
 * Ahora un fallado deja el onboarding en BACKFILLING, que es donde
 * `checkStuckOnboardings` lo levanta a las 12 h y lo mira una persona. Es peor
 * como experiencia y mucho mejor como resultado.
 *
 * Para desatascarlo a mano esta `force-complete-job`, que sobre un job FAILED
 * lo pasa a COMPLETED: el admin decide explicitamente, job por job, que la data
 * parcial alcanza. Lo que ya no pasa es que lo decida un timeout.
 */
export function esAltaCompleta(c: ConteoDeJobs): boolean {
  return c.total > 0 && c.pendientes === 0 && c.fallados === 0;
}

// Todos los jobs de un onboarding estan completos?
export async function areAllJobsComplete(onboardingRequestId: string): Promise<boolean> {
  return esAltaCompleta(await contarJobsDelOnboarding(onboardingRequestId));
}

// ══════════════════════════════════════════════════════════════
// E-08 — claim atómico + conteo de jobs activos
// ══════════════════════════════════════════════════════════════

/**
 * Cuántos jobs están efectivamente corriendo AHORA: RUNNING con `lastChunkAt`
 * fresco. Un RUNNING con el chunk viejo está abandonado (la lambda se murió) y
 * no cuenta — si contara, un job huérfano bloquearía la cola para siempre.
 */
export async function contarJobsActivos(cooldownMs: number): Promise<number> {
  // Cuenta los que AVANZAN, no los que se reintentan. `lastChunkAt` solo se
  // mueve cuando un chunk sale bien (ver `updateJobProgress`), asi que un job
  // que falla en loop no cuenta como activo y deja de bloquear la cola.
  const corte = new Date(Date.now() - cooldownMs);
  const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*)::int AS n FROM "backfill_jobs"
     WHERE "status" = 'RUNNING' AND "lastChunkAt" IS NOT NULL AND "lastChunkAt" >= $1`,
    corte
  );
  return Number(rows[0]?.n || 0);
}

/**
 * Marca FAILED los jobs que quedaron RUNNING sin avanzar un solo chunk en
 * `sinProgresoMs`. Devuelve los que mató.
 *
 * ⚠️ POR QUE ESTO ES NECESARIO Y NO UN LUJO (encontrado en revision, 2026-09-07):
 * `failJob` estaba importado en el runner y NO SE LLAMABA DESDE NINGUN LADO. Un
 * job cuyo chunk falla siempre —credenciales de VTEX vencidas, una plataforma no
 * soportada— se quedaba RUNNING para siempre. Y como el limite de concurrencia
 * es 1 por default, ese job zombie bloqueaba EL ALTA DE TODOS LOS DEMAS
 * CLIENTES: cada tick del cron devolvia `admitido:false, otro-backfill-corriendo`,
 * con HTTP 200, sin error, sin mail, sin nada que nadie mire.
 *
 * O sea que el freno de concurrencia que se agrego para proteger la base
 * convertia un job roto en una caida total del onboarding. Esto lo cierra.
 *
 * El criterio es "sin PROGRESO", no "sin intentos": `lastChunkAt` solo se
 * actualiza cuando un chunk sale bien (ver `updateJobProgress`), asi que un job
 * que reintenta y falla no lo mueve. Un backfill largo pero sano lo refresca en
 * cada chunk y nunca lo alcanza este corte.
 */
export const MATAR_JOBS_SIN_PROGRESO_SQL = `UPDATE "backfill_jobs"
        SET "status" = 'FAILED',
            "lastError" = COALESCE("lastError", '') ||
              ' [abandonado: sin progreso por mas de ' || $2 || ' minutos]',
            "updatedAt" = NOW()
      WHERE "status" = 'RUNNING'
        AND "startedAt" IS NOT NULL
        AND ("lastChunkAt" IS NULL OR "lastChunkAt" < $1)
        AND "startedAt" < $1
      RETURNING "id"`;

export async function matarJobsSinProgreso(sinProgresoMs: number): Promise<string[]> {
  const corte = new Date(Date.now() - sinProgresoMs);
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    MATAR_JOBS_SIN_PROGRESO_SQL,
    corte,
    Math.round(sinProgresoMs / 60000)
  );
  return rows.map((r) => r.id);
}

/**
 * Toma el próximo job y lo marca RUNNING en UNA sola sentencia.
 *
 * ⚠️ POR QUÉ REEMPLAZA A `pickNextJob` + `markJobRunning` (E-08):
 * eran dos queries separadas, así que dos invocaciones que arrancaban juntas
 * —el cron de cada minuto y el trigger inmediato de `approve-backfill`— podían
 * hacer el SELECT las dos antes de que ninguna hiciera el UPDATE, y salir las
 * dos con el MISMO job. El "lock" por frescura de `lastChunkAt` no servía para
 * un job en QUEUED: todavía no tenía ninguno.
 *
 * `FOR UPDATE SKIP LOCKED` hace que dos invocaciones concurrentes nunca vean la
 * misma fila: la segunda saltea la que la primera está por tomar.
 *
 * ⚠️ EL CLAIM NO TOCA `lastChunkAt` (corregido el 2026-09-07, tras revisión).
 * Hay DOS relojes y confundirlos rompia el reaper:
 *
 *   · `updatedAt` = "alguien lo tiene tomado". Lo pisa el claim. Sirve de lock:
 *     evita que dos invocaciones se lleven el mismo job, y que uno recien
 *     tomado parezca libre entre el claim y el primer chunk.
 *   · `lastChunkAt` = "la ultima vez que AVANZO". Solo lo mueve un chunk
 *     exitoso.
 *
 * La version anterior escribia `lastChunkAt = NOW()` en el claim, y con eso el
 * reaper era inalcanzable: el cron corre cada MINUTO y el cooldown es de 2, asi
 * que un job roto se re-reclamaba cada 2 minutos y su latido se refrescaba
 * solo. Nunca acumulaba los 30 minutos que `matarJobsSinProgreso` exige. O sea
 * que el arreglo del job zombie no arreglaba nada: seguia bloqueando la cola.
 */
export const RECLAMAR_PROXIMO_JOB_SQL = `UPDATE "backfill_jobs" j
        SET "status" = 'RUNNING',
            "startedAt" = COALESCE(j."startedAt", NOW()),
            "updatedAt" = NOW()
      WHERE j."id" = (
        SELECT c."id" FROM "backfill_jobs" c
         WHERE c."status" = 'QUEUED'
            OR (c."status" = 'RUNNING'
                AND (c."updatedAt" IS NULL OR c."updatedAt" < $1))
         ORDER BY CASE c."status" WHEN 'RUNNING' THEN 0 ELSE 1 END,
                  c."createdAt" ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING j.*`;

export async function reclamarProximoJob(cooldownMs: number): Promise<any | null> {
  const corte = new Date(Date.now() - cooldownMs);
  const rows = await prisma.$queryRawUnsafe<Array<any>>(RECLAMAR_PROXIMO_JOB_SQL, corte);
  return rows[0] || null;
}
