// ══════════════════════════════════════════════════════════════
// Scheduler helpers para crons multi-tenant de Meta/Google Ads.
//
// Diseno:
// - getActiveOrgs(platform): devuelve orgs con conexion ACTIVE.
// - shouldSkipSync(connection, mode): true si lastSyncAt esta fresh.
// - runWithConcurrency(items, fn, max): procesa en lote acotado.
//
// Uso desde un cron:
//   const orgs = await getActiveOrgs("META_ADS");
//   await runWithConcurrency(orgs, async (org) => {
//     if (await shouldSkipSync(org.connection, "hourly")) return { skipped: true };
//     return await fetch(`${baseUrl}/api/sync/meta?key=...&organizationId=${org.id}&mode=hourly`);
//   }, 3);
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";

export type SyncMode = "hourly" | "daily";

// Si el sync corrio dentro de este margen, skipear.
// hourly = 20 min (cron horario tiene margen para deduplicar)
// daily  = 23 h  (cron diario, pero permite 1 intento extra si fallo cerca)
const FRESH_WINDOW_MS: Record<SyncMode, number> = {
  hourly: 20 * 60 * 1000,
  daily: 23 * 60 * 60 * 1000,
};

export interface OrgWithConnection {
  id: string;
  name: string;
  connection: {
    id: string;
    lastSyncAt: Date | null;
    lastSyncError: string | null;
    status: string;
  };
}

/**
 * Devuelve todas las organizaciones que tienen conexion ACTIVE
 * para la plataforma indicada.
 */
export async function getActiveOrgs(
  platform: "META_ADS" | "GOOGLE_ADS"
): Promise<OrgWithConnection[]> {
  const conns = await prisma.connection.findMany({
    where: {
      platform: platform as any,
      status: "ACTIVE",
    },
    select: {
      id: true,
      lastSyncAt: true,
      lastSyncError: true,
      status: true,
      organization: { select: { id: true, name: true } },
    },
  });

  return conns
    .filter((c) => !!c.organization)
    .map((c) => ({
      id: c.organization!.id,
      name: c.organization!.name,
      connection: {
        id: c.id,
        lastSyncAt: c.lastSyncAt,
        lastSyncError: c.lastSyncError,
        status: c.status,
      },
    }));
}

/**
 * Devuelve true si esta org NO debe sincronizarse ahora porque
 * los datos ya estan suficientemente frescos.
 */
export function shouldSkipSync(
  connection: { lastSyncAt: Date | null },
  mode: SyncMode
): boolean {
  if (!connection.lastSyncAt) return false;
  const ageMs = Date.now() - new Date(connection.lastSyncAt).getTime();
  return ageMs < FRESH_WINDOW_MS[mode];
}

/**
 * Procesa items en paralelo con un limite de concurrencia.
 * Protege el pool de conexiones a DB y los rate limits externos.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  maxConcurrent: number = 3
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = await fn(items[idx]);
      } catch (e: any) {
        results[idx] = { error: e?.message || String(e) } as any;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(maxConcurrent, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/**
 * URL base para llamadas internas server-to-server.
 */
export function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://nitrosales.vercel.app")
  );
}
