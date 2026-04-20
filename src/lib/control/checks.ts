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

  const rows = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT "id", "companyName", "contactEmail", "status", "createdAt"
     FROM "onboarding_requests"
     WHERE "status" IN ('PENDING', 'NEEDS_INFO', 'IN_PROGRESS')
       AND "createdAt" < $1
     ORDER BY "createdAt" ASC`,
    since
  );

  return rows.map((r) => ({
    id: r.id,
    companyName: r.companyName,
    contactEmail: r.contactEmail,
    status: r.status,
    hoursOld: Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 3600000),
  }));
}

// ─── Check 3: clientes inactivos (sin login >14d) ───
export async function checkInactiveClients(): Promise<InactiveClient[]> {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true },
  });

  const inactives: InactiveClient[] = [];
  const since = new Date(Date.now() - INACTIVE_CLIENT_DAYS * 24 * 3600 * 1000);

  for (const org of orgs) {
    const lastLoginRow = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT MAX(le."createdAt") as "lastLogin"
       FROM "login_events" le
       JOIN "users" u ON u.id = le."userId"
       WHERE u."organizationId" = $1 AND le."success" = true`,
      org.id
    );
    const lastLogin: Date | null = lastLoginRow[0]?.lastLogin
      ? new Date(lastLoginRow[0].lastLogin)
      : null;

    const lastOrderRow = await prisma.order.findFirst({
      where: { organizationId: org.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const lastOrder = lastOrderRow?.createdAt || null;

    const daysSinceLogin = lastLogin
      ? Math.floor((Date.now() - lastLogin.getTime()) / (24 * 3600 * 1000))
      : null;
    const daysSinceOrder = lastOrder
      ? Math.floor((Date.now() - lastOrder.getTime()) / (24 * 3600 * 1000))
      : null;

    // Cliente inactivo: sin login >14d (o nunca) Y sin order reciente
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
