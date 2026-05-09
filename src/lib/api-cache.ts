// ══════════════════════════════════════════════════════════════
// Lightweight in-memory API response cache (Stale-While-Revalidate)
// ══════════════════════════════════════════════════════════════
// Works per Vercel function instance. If multiple requests hit the
// same instance within the TTL window, only the first one queries
// the database. Dramatically reduces DB load on dashboard refresh.
//
// SWR (Stale-While-Revalidate):
// - Fresh window: 5 min (data nueva)
// - Stale window: hasta 30 min (data vieja pero servida instant +
//   trigger de refresh background)
// - El cliente NUNCA espera el costo completo de la query si hay
//   data en cache (incluso vieja). El proximo request ya tiene fresh.
//
// Usage in API routes (S60 EXT-2 BIS+++++++++++++ NEW pattern):
//   const cached = getCachedSWR("metrics", orgId, from, to);
//   if (cached?.data) {
//     if (cached.isStale) {
//       // Devolver stale + dispatch refresh en background
//       waitUntil(refetchAndCache());
//     }
//     return NextResponse.json(cached.data);
//   }
//   // No cache: bloqueante (primera carga)
//   const data = await runQueries();
//   setCache("metrics", data, orgId, from, to);
//   return NextResponse.json(data);
// ══════════════════════════════════════════════════════════════

// Fresh window: data nueva (5 min). Despues de esto la data es "stale"
// pero todavia servible.
const DEFAULT_TTL_MS = 5 * 60_000; // 5 minutos

// Stale window: cuanto tiempo extra mantenemos data "vieja" servible
// antes de descartarla. SWR sirve stale instant + refresh background.
const STALE_GRACE_MS = 25 * 60_000; // 25 min extra (total 30 min)

interface CacheEntry {
  data: unknown;
  freshUntil: number; // Date.now + 5 min
  staleUntil: number; // Date.now + 30 min (5 fresh + 25 stale)
}

const store = new Map<string, CacheEntry>();

// Max entries to prevent memory leaks in long-running instances.
// 500 cubre ~10 orgs × 50 combinaciones rango/filtro sin evictions.
const MAX_ENTRIES = 500;

// Tracking de refreshes en flight para evitar duplicar trabajo si
// 2 requests stale llegan simultaneo (thundering herd).
const inflightRefresh = new Set<string>();

function buildKey(prefix: string, ...parts: unknown[]): string {
  return `${prefix}:${parts.map(String).join(":")}`;
}

/**
 * Get cached data if still valid (fresh window only).
 * @deprecated Usar `getCachedSWR` en lugar para SWR semantics.
 */
export function getCached<T = unknown>(
  prefix: string,
  ...keyParts: unknown[]
): T | null {
  const key = buildKey(prefix, ...keyParts);
  const entry = store.get(key);
  if (!entry) return null;
  // Si paso del fresh window, descartar (compatibilidad con caller viejo).
  if (Date.now() > entry.freshUntil) {
    // Si pasa el stale window completo, eliminar
    if (Date.now() > entry.staleUntil) {
      store.delete(key);
    }
    return null;
  }
  return entry.data as T;
}

/**
 * Stale-While-Revalidate get.
 * Devuelve un objeto con `data` y `isStale` flag.
 * - Si fresh: { data, isStale: false } → caller devuelve inmediato.
 * - Si stale: { data, isStale: true } → caller devuelve inmediato + dispatch refresh.
 * - Si miss/expired: null → caller debe ejecutar las queries (bloqueante).
 */
export function getCachedSWR<T = unknown>(
  prefix: string,
  ...keyParts: unknown[]
): { data: T; isStale: boolean } | null {
  const key = buildKey(prefix, ...keyParts);
  const entry = store.get(key);
  if (!entry) return null;
  const now = Date.now();
  // Stale window completo expirado → eliminar y miss
  if (now > entry.staleUntil) {
    store.delete(key);
    return null;
  }
  return {
    data: entry.data as T,
    isStale: now > entry.freshUntil,
  };
}

/**
 * Marca una key como "tengo refresh in flight". Si ya esta in flight,
 * devuelve false (otro request ya esta refrescando). Caller que llame
 * primero recibe true y debe ejecutar el refresh.
 */
export function tryAcquireRefreshLock(
  prefix: string,
  ...keyParts: unknown[]
): boolean {
  const key = buildKey(prefix, ...keyParts);
  if (inflightRefresh.has(key)) return false;
  inflightRefresh.add(key);
  return true;
}

export function releaseRefreshLock(
  prefix: string,
  ...keyParts: unknown[]
): void {
  const key = buildKey(prefix, ...keyParts);
  inflightRefresh.delete(key);
}

/**
 * Store data in cache with TTL (fresh window).
 * El stale window se calcula automaticamente como freshUntil + STALE_GRACE_MS.
 */
export function setCache(
  prefix: string,
  data: unknown,
  ...keyParts: unknown[]
): void;
export function setCache(
  prefix: string,
  data: unknown,
  ttlMs: number,
  ...keyParts: unknown[]
): void;
export function setCache(
  prefix: string,
  data: unknown,
  ...args: unknown[]
): void {
  let ttlMs = DEFAULT_TTL_MS;
  let keyParts = args;

  // If first arg is a number, treat it as TTL
  if (typeof args[0] === "number" && args.length > 1) {
    ttlMs = args[0] as number;
    keyParts = args.slice(1);
  }

  // Evict expired entries if too many
  if (store.size >= MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of store) {
      if (now > v.staleUntil) store.delete(k);
    }
    // If still too many, clear oldest half
    if (store.size >= MAX_ENTRIES) {
      const entries = [...store.entries()].sort(
        (a, b) => a[1].staleUntil - b[1].staleUntil
      );
      for (let i = 0; i < entries.length / 2; i++) {
        store.delete(entries[i][0]);
      }
    }
  }

  const key = buildKey(prefix, ...keyParts);
  const now = Date.now();
  store.set(key, {
    data,
    freshUntil: now + ttlMs,
    staleUntil: now + ttlMs + STALE_GRACE_MS,
  });
}
