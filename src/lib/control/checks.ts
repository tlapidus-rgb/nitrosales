// ══════════════════════════════════════════════════════════════
// Control health checks
// ══════════════════════════════════════════════════════════════
// Lógica reusable para evaluar la salud operativa de cada cliente.
// Usado por el endpoint de alertas (cron) y /api/control/clients-health.
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";

export type HealthLevel = "ok" | "warn" | "error" | "pending";

export interface ConnectionIssue {
  orgId: string;
  orgName: string;
  platform: string;
  level: "warn" | "error";
  reason: string;
  minsSinceSync: number | null;
  lastError: string | null;
}

export interface StuckOnboarding {
  id: string;
  companyName: string;
  contactEmail: string;
  status: string;
  hoursOld: number;
}

export interface JobDeBackfillAtascado {
  jobId: string;
  organizationId: string;
  platform: string;
  status: string;
  horas: number;
  lastError: string | null;
}

export interface InactiveClient {
  orgId: string;
  orgName: string;
  daysSinceLogin: number | null;
  daysSinceOrder: number | null;
}

// Umbrales (minutos) por plataforma para considerar "desincronizado".
// SOLO aplicable a plataformas con sync automatico. Las on-demand (META_ADS,
// GOOGLE_ADS) se syncean solo cuando el user abre la pagina — no alertamos
// por staleness, solo por errores explicitos (lastSyncError).
const SYNC_THRESHOLDS_MIN: Record<string, number> = {
  VTEX: 60 * 24,
  MERCADOLIBRE: 60 * 24,
  GA4: 60 * 36,
  GSC: 60 * 36,
  // META_ADS / GOOGLE_ADS intencionalmente ausentes — on-demand
};

const ON_DEMAND_PLATFORMS = new Set(["META_ADS", "GOOGLE_ADS"]);

const STUCK_ONBOARDING_HOURS = 72;

// Los dos estados donde el alta espera a algo que puede no llegar nunca, con su
// propio umbral. Son MAS cortos que los 72 h de arriba a proposito: un alta en
// PENDING espera a que alguien la mire y puede aguantar; una en BACKFILLING o
// READY_FOR_REVIEW ya le prometio al cliente que su data esta en camino.
//
// ⚠️ NINGUNO DE LOS DOS ESTABA CUBIERTO (revision del 2026-09-07). El chequeo
// miraba PENDING, NEEDS_INFO e IN_PROGRESS — o sea, ninguno de los dos estados
// donde el flujo realmente se para. Un backfill que termina un viernes a las
// 23:00 deja al cliente viendo "preparando tu data" todo el fin de semana,
// control-alerts corre 8 veces y reporta "sin problemas".
const BACKFILLING_HORAS = 12;      // un backfill grande puede tardar horas, no 12
const READY_FOR_REVIEW_HORAS = 6;  // esto solo espera un click del admin

// Un job de backfill en QUEUED mas de esto es una senal de que el control de
// admision lo esta frenando y nadie se entera: ventana horaria mal puesta, otro
// job trabado, o la base lenta. El runner devuelve HTTP 200 con
// admitido:false, asi que ningun monitor de status lo ve.
const JOB_ENCOLADO_HORAS = 3;
const INACTIVE_CLIENT_DAYS = 14;

// ─── Check 1: conexiones caídas/lentas ───
// Un `lastSyncError` es "viejo" si despues del intento fallido hubo al menos
// un sync exitoso (lastSuccessfulSyncAt >= lastSyncAt). En ese caso lo ignoramos
// porque es basura residual de errores pasados que nunca se limpio el campo.
function isStaleError(lastSyncAt: Date | null, lastSuccessfulSyncAt: Date | null): boolean {
  if (!lastSuccessfulSyncAt || !lastSyncAt) return false;
  return new Date(lastSuccessfulSyncAt).getTime() >= new Date(lastSyncAt).getTime();
}

export async function checkConnectionIssues(): Promise<ConnectionIssue[]> {
  const connections = await prisma.connection.findMany({
    select: {
      platform: true,
      status: true,
      lastSyncAt: true,
      lastSuccessfulSyncAt: true,
      lastSyncError: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
  });

  const issues: ConnectionIssue[] = [];

  for (const c of connections) {
    const threshold = SYNC_THRESHOLDS_MIN[c.platform] || 60 * 24;
    // Usamos lastSuccessfulSyncAt para staleness: mide cuando fue el ULTIMO OK,
    // no cuando fue el ultimo intento (que puede ser un retry fallido).
    const effectiveSyncAt = c.lastSuccessfulSyncAt || c.lastSyncAt;
    const minsSinceSync = effectiveSyncAt
      ? Math.floor((Date.now() - new Date(effectiveSyncAt).getTime()) / 60000)
      : null;

    const hasFreshError = !!c.lastSyncError && !isStaleError(c.lastSyncAt, c.lastSuccessfulSyncAt);

    // ERROR status = crítico
    if (c.status === "ERROR") {
      issues.push({
        orgId: c.organizationId,
        orgName: c.organization.name,
        platform: c.platform,
        level: "error",
        reason: "Conexión en estado ERROR",
        minsSinceSync,
        lastError: c.lastSyncError,
      });
      continue;
    }

    // PENDING = ignorar (aún no se configuró el OAuth)
    if (c.status === "PENDING") continue;

    // On-demand: solo alertar si hay lastSyncError FRESCO (no viejo)
    if (ON_DEMAND_PLATFORMS.has(c.platform)) {
      if (hasFreshError) {
        issues.push({
          orgId: c.organizationId,
          orgName: c.organization.name,
          platform: c.platform,
          level: "warn",
          reason: "Último sync manual falló",
          minsSinceSync,
          lastError: c.lastSyncError,
        });
      }
      continue; // no chequear staleness
    }

    // Sync antiguo (usando ultimo sync exitoso como referencia)
    if (minsSinceSync !== null && minsSinceSync > threshold * 2) {
      issues.push({
        orgId: c.organizationId,
        orgName: c.organization.name,
        platform: c.platform,
        level: "error",
        reason: `Sin sync exitoso hace ${formatMins(minsSinceSync)} (umbral ${formatMins(threshold * 2)})`,
        minsSinceSync,
        lastError: c.lastSyncError,
      });
      continue;
    } else if (minsSinceSync !== null && minsSinceSync > threshold) {
      issues.push({
        orgId: c.organizationId,
        orgName: c.organization.name,
        platform: c.platform,
        level: "warn",
        reason: `Sync lento (ultimo OK hace ${formatMins(minsSinceSync)})`,
        minsSinceSync,
        lastError: c.lastSyncError,
      });
      continue;
    }

    // Sync reciente pero fresh error (raro: hubo retry fallido despues del OK)
    if (hasFreshError) {
      issues.push({
        orgId: c.organizationId,
        orgName: c.organization.name,
        platform: c.platform,
        level: "warn",
        reason: "Último intento con error (despues del ultimo OK)",
        minsSinceSync,
        lastError: c.lastSyncError,
      });
    }
  }

  return issues;
}

// ─── Check 2: onboardings pendientes >72h ───
export async function checkStuckOnboardings(): Promise<StuckOnboarding[]> {
  const since = new Date(Date.now() - STUCK_ONBOARDING_HOURS * 3600 * 1000);

  const desdeBackfilling = new Date(Date.now() - BACKFILLING_HORAS * 3600 * 1000);
  const desdeReview = new Date(Date.now() - READY_FOR_REVIEW_HORAS * 3600 * 1000);

  // Para los estados de espera se mide desde `updatedAt` (cuanto lleva EN ESE
  // ESTADO) y no desde `createdAt`: un alta creada hace un mes que entro a
  // BACKFILLING hace 10 minutos no esta atrasada.
  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT "id", "companyName", "contactEmail", "status", "createdAt", "updatedAt",
            CASE WHEN "status" IN ('BACKFILLING','READY_FOR_REVIEW')
                 THEN "updatedAt" ELSE "createdAt" END AS "desde"
     FROM "onboarding_requests"
     WHERE ("status" IN ('PENDING', 'NEEDS_INFO', 'IN_PROGRESS') AND "createdAt" < $1)
        OR ("status" = 'BACKFILLING'       AND "updatedAt" < $2)
        OR ("status" = 'READY_FOR_REVIEW'  AND "updatedAt" < $3)
     ORDER BY "desde" ASC`,
    since,
    desdeBackfilling,
    desdeReview
  );

  return rows.map((r) => ({
    id: r.id,
    companyName: r.companyName,
    contactEmail: r.contactEmail,
    status: r.status,
    hoursOld: Math.floor((Date.now() - new Date(r.desde).getTime()) / 3600000),
  }));
}

/**
 * Jobs de backfill que llevan demasiado sin arrancar o sin avanzar.
 *
 * Es el unico aviso de que el control de admision (E-08) esta frenando algo y
 * nadie se entera. El runner devuelve HTTP 200 con `admitido:false` cuando la
 * ventana horaria, el limite de concurrencia o el freno por latencia cortan, asi
 * que Vercel ve verde y ningun monitor de status lo nota.
 *
 * Resiliente: si la tabla no existe, devuelve vacio en vez de romper el resto
 * del reporte.
 */
/** El SQL, exportado para correrlo contra Postgres de verdad en los tests. */
export const JOBS_ATASCADOS_SQL = `SELECT j."id", j."organizationId", j."platform", j."status", j."lastError",
        COALESCE(j."lastChunkAt", j."startedAt", j."createdAt") AS "desde"
   FROM "backfill_jobs" j
  WHERE COALESCE(j."lastChunkAt", j."startedAt", j."createdAt") < $1
    AND (
      j."status" IN ('QUEUED','RUNNING')
      OR (
        j."status" = 'FAILED'
        AND EXISTS (
          SELECT 1 FROM "onboarding_requests" o
           WHERE o."id" = j."onboardingRequestId"
             AND o."status"::text = 'BACKFILLING'
        )
      )
    )
  ORDER BY "desde" ASC`;

export async function checkJobsDeBackfillAtascados(): Promise<JobDeBackfillAtascado[]> {
  const corte = new Date(Date.now() - JOB_ENCOLADO_HORAS * 3600 * 1000);
  try {
    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      // ⚠️ LOS FALLADOS TAMBIEN, PERO SOLO LOS QUE BLOQUEAN UN ALTA
      // (agregado el 2026-09-08).
      //
      // Antes esto miraba solo QUEUED y RUNNING. Eso alcanzaba cuando un job
      // FAILED no le importaba a nadie — pero desde que `esAltaCompleta` dejo
      // de contar FAILED como terminado, **un job fallado es justo lo que
      // retiene el onboarding en BACKFILLING**. O sea que el estado que mas
      // urgente hay que mirar era el unico que este check no veia.
      //
      // El unico aviso quedaba en `checkStuckOnboardings`, a las 12 h, y sin
      // decir cual job ni con que error. Aca sale a las 3 h con el `lastError`
      // al lado, que es lo unico accionable: si son credenciales, se corrigen y
      // se re-encola; si la data parcial alcanza, se fuerza con
      // `force-complete-job`.
      //
      // El filtro por onboarding en curso es lo que evita que esto se vuelva
      // ruido: un FAILED de hace tres meses, de un alta ya resuelta, no aparece.
      // Y se apaga solo — en cuanto el admin resuelve el alta, deja de listarse.
      JOBS_ATASCADOS_SQL,
      corte
    );
    return rows.map((r) => ({
      jobId: r.id,
      organizationId: r.organizationId,
      platform: r.platform,
      status: r.status,
      horas: Math.floor((Date.now() - new Date(r.desde).getTime()) / 3600000),
      lastError: r.lastError ?? null,
    }));
  } catch {
    return [];
  }
}

// ─── Check 3: clientes inactivos (sin login >14d) ───
export async function checkInactiveClients(): Promise<InactiveClient[]> {
  // E-11 (2026-09-07) — ANTES ESTO ERA UN N+1.
  // Hacia dos queries SECUENCIALES por organizacion (ultimo login y ultima
  // orden), dentro de un cron con maxDuration = 60. A ~2s por organizacion, a
  // partir de ~30 clientes se pasaba del limite y Vercel mataba la funcion: sin
  // mail, sin error visible, y sin que nadie se entere — un 5XX en un cron no
  // dispara ninguna alerta de Vercel.
  //
  // No lleva cursor a proposito, y es la diferencia con los otros crons de
  // E-11: esto no es trabajo incremental que se pueda repartir entre corridas,
  // es un REPORTE que se manda por mail. Medio reporte es peor que uno lento —
  // diria "todo bien" sobre clientes que ni miro. Asi que en vez de repartirlo,
  // se hace barato: dos agregaciones para todas las organizaciones juntas, y la
  // comparacion en memoria. El costo deja de escalar con la cantidad de
  // clientes.
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true },
  });
  if (orgs.length === 0) return [];

  const [loginRows, orderRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ organizationId: string; lastLogin: Date | null }>>(
      `SELECT u."organizationId" AS "organizationId", MAX(le."createdAt") AS "lastLogin"
         FROM "login_events" le
         JOIN "users" u ON u.id = le."userId"
        WHERE le."success" = true
        GROUP BY u."organizationId"`
    ),
    prisma.$queryRawUnsafe<Array<{ organizationId: string; lastOrder: Date | null }>>(
      `SELECT "organizationId", MAX("createdAt") AS "lastOrder"
         FROM "orders"
        GROUP BY "organizationId"`
    ),
  ]);

  const loginPorOrg = new Map(loginRows.map((r) => [r.organizationId, r.lastLogin]));
  const ordenPorOrg = new Map(orderRows.map((r) => [r.organizationId, r.lastOrder]));

  const inactives: InactiveClient[] = [];
  const ahora = Date.now();
  const dias = (d: Date | null | undefined): number | null =>
    d ? Math.floor((ahora - new Date(d).getTime()) / (24 * 3600 * 1000)) : null;

  for (const org of orgs) {
    const daysSinceLogin = dias(loginPorOrg.get(org.id));
    const daysSinceOrder = dias(ordenPorOrg.get(org.id));

    // Cliente inactivo: sin login >14d (o nunca) Y sin order reciente.
    const inactiveByLogin = daysSinceLogin === null || daysSinceLogin > INACTIVE_CLIENT_DAYS;
    const inactiveByOrders = daysSinceOrder === null || daysSinceOrder > INACTIVE_CLIENT_DAYS;

    if (inactiveByLogin && inactiveByOrders) {
      inactives.push({
        orgId: org.id,
        orgName: org.name,
        daysSinceLogin,
        daysSinceOrder,
      });
    }
  }

  return inactives;
}


// ─── helper ───
function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
