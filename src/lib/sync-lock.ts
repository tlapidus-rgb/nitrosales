// Sync Lock (Mutex) — NitroSales [FASE 2.2]
// Previene que dos syncs corran al mismo tiempo (cron overlap)
// Usa una tabla/registro en DB como lock distribuido
import { prisma } from "@/lib/db/client";

const ORG_ID = process.env.ORG_ID || "cmmmga1uq0000sb43w0krvvys";
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutos — despues se considera stale

interface LockResult {
  acquired: boolean;
  reason?: string;
}

export async function acquireSyncLock(lockType: string): Promise<LockResult> {
  try {
    // Check if there's an active lock
    const existing = await prisma.connection.findFirst({
      where: { organizationId: ORG_ID, platform: "VTEX" },
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
        action: "stale-lock-override", details: { lockType, lockAgeMs: lockAge },
      }));
    }

    // Acquire lock
    await prisma.connection.updateMany({
      where: { organizationId: ORG_ID, platform: "VTEX" },
      data: { lastSyncError: `LOCK:${lockType}`, lastSyncAt: new Date() },
    });

    return { acquired: true };
  } catch (error) {
    console.error("[sync-lock] Failed to acquire:", error);
    return { acquired: true }; // On error, let sync proceed (non-blocking)
  }
}

export async function releaseSyncLock(): Promise<void> {
  try {
    await prisma.connection.updateMany({
      where: {
        organizationId: ORG_ID,
        platform: "VTEX",
        lastSyncError: { startsWith: "LOCK:" },
      },
      data: { lastSyncError: null },
    });
  } catch (error) {
    console.error("[sync-lock] Failed to release:", error);
  }
}
