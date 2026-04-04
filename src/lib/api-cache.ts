// ══════════════════════════════════════════════════════════════
// Lightweight in-memory API response cache
// ══════════════════════════════════════════════════════════════
// Works per Vercel function instance. If multiple requests hit the
// same instance within the TTL window, only the first one queries
// the database. Dramatically reduces DB load on dashboard refresh.
//
// Usage in API routes:
//   const cached = getCached("metrics", orgId, from, to);
//   if (cached) return NextResponse.json(cached);
//   ... expensive queries ...
//   setCache("metrics", data, orgId, from, to);
// ══════════════════════════════════════════════════════════════

const DEFAULT_TTL_MS = 60_000; // 60 seconds

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

// Max entries to prevent memory leaks in long-running instances
const MAX_ENTRIES = 200;

function buildKey(prefix: string, ...parts: unknown[]): string {
  return `${prefix}:${parts.map(String).join(":")}`;
}

/**
 * Get cached data if still valid.
 */
export function getCached<T = unknown>(
  prefix: string,
  ...keyParts: unknown[]
): T | null {
  const key = buildKey(prefix, ...keyParts);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

/**
 * Store data in cache with TTL.
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
      if (now > v.expiresAt) store.delete(k);
    }
    // If still too many, clear oldest half
    if (store.size >= MAX_ENTRIES) {
      const entries = [...store.entries()].sort(
        (a, b) => a[1].expiresAt - b[1].expiresAt
      );
      for (let i = 0; i < entries.length / 2; i++) {
        store.delete(entries[i][0]);
      }
    }
  }

  const key = buildKey(prefix, ...keyParts);
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}
