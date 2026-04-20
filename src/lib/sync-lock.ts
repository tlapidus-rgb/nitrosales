// Sync Lock (Mutex) — NitroSales [FASE 2.2 + Multi-tenant S52]
// Previene que dos syncs corran al mismo tiempo (cron overlap)
// Usa una tabla/registro en DB como lock distribuido.
//
// Multi-tenant: el lock es per-org. Dos orgs distintas pueden sincronizar
// en paralelo. Dos syncs de la MISMA org se bloquean entre sí.
import { prisma } from "@/lib/db/client";

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutos — despues se considera stale

interface LockResult {
  acquired: boolean;
  reason?: string;
}

/**
 * Adquiere un lock de sync para una org específica.
 * orgId es OBLIGATORIO — multi-tenant safety.
 */
export async function acquireSyncLock(
  orgId: string,
  lockType: string
): Promise<LockResult> {
  if (!orgId) {
    console.error("[sync-lock] acquireSyncLock sin orgId — rechazado");
    return { acquired: false, reason: "orgId obligatorio" };
  }
  try {
    // Check if there's an active lock
    const existing = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "VTEX" },
      select: { lastSyncAt: true, lastSyncError: true },
    });

    if (existing?.lastSyncError === `LOCK:${lockType}`) {
      // There's a lock — check if it's stale
      const lockAge = existing.lastSyncAt
        ? Date.now() - new Date(existing.lastSyncAt).getTime()
        : Infinity;

      if (lockAge < LOCK_TTL_MS) {
        return { acquired: false, reason: `Lock active for ${lockType} (${Math.round(lockAge / 1000)}s old)` };
      }
      // Stale lock — proceed (will be overwritten)
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(), level: "warn", service: "sync-lock",
        action: "stale-lock-override", details: { orgId, lockType, lockAgeMs: lockAge },
      }));
    }

    // Acquire lock
    await prisma.connection.updateMany({
      where: { organizationId: orgId, platform: "VTEX" },
      data: { lastSyncError: `LOCK:${lockType}`, lastSyncAt: new Date() },
    });

    return { acquired: true };
  } catch (error) {
    console.error("[sync-lock] Failed to acquire:", error);
    return { acquired: true }; // On error, let sync proceed (non-blocking)
  }
}

/**
 * Libera el lock de sync de una org específica.
 * orgId es OBLIGATORIO.
 */
export async function releaseSyncLock(orgId: string): Promise<void> {
  if (!orgId) {
    console.error("[sync-lock] releaseSyncLock sin orgId — skipped");
    return;
  }
  try {
    await prisma.connection.updateMany({
      where: {
        organizationId: orgId,
        platform: "VTEX",
        lastSyncError: { startsWith: "LOCK:" },
      },
      data: { lastSyncError: null },
    });
  } catch (error) {
    console.error("[sync-lock] Failed to release:", error);
  }
}
