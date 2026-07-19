// ══════════════════════════════════════════════════════════════════════════
// Caché de dos niveles: memoria (por instancia) + Postgres (compartido)
// ══════════════════════════════════════════════════════════════════════════
// EL PROBLEMA (medido 2026-07-18): `api-cache.ts` guarda en memoria del proceso,
// o sea POR INSTANCIA de lambda. Al refrescar la página caés en la misma
// instancia caliente y carga al instante — pero la PRIMERA carga del día, o
// cualquier request que Vercel rutee a una instancia nueva, paga los ~25s
// completos. El cron `warm-cache` calienta la instancia que atienda SU request,
// no la que te toque a vos: es lotería.
//
// LA SOLUCIÓN: un segundo nivel en Postgres, compartido por todas las
// instancias. El cron warmea una vez y TODAS lo aprovechan.
//
//   nivel 1: memoria    → lookup gratis, cero latencia
//   nivel 2: Postgres   → ~5-20ms, pero lo ve toda instancia
//   miss    → se ejecutan las queries (lo caro)
//
// Un hit de nivel 2 se copia a memoria, así que la instancia responde gratis a
// partir de la segunda vez.
//
// RESILIENTE: si `api_cache` no existe todavía, se comporta EXACTAMENTE como
// antes (solo memoria). Nunca rompe una pantalla por un problema de caché.
// ══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import { getCachedSWR, setCache } from "@/lib/api-cache";

const DEFAULT_TTL_MS = 5 * 60_000; // fresco 5 min (igual que el caché en memoria)
const STALE_GRACE_MS = 25 * 60_000; // + 25 min servible como stale

function buildKey(prefix: string, keyParts: unknown[]): string {
  return `${prefix}:${keyParts.map(String).join(":")}`;
}

export interface SharedCacheHit<T> {
  data: T;
  isStale: boolean;
  /** "memory" | "shared" — útil para medir si el warm-cache está sirviendo. */
  level: "memory" | "shared";
}

/**
 * Lectura de dos niveles. Memoria primero (gratis), Postgres después.
 * Devuelve null solo si no hay nada servible en ningún lado.
 */
export async function getSharedCachedSWR<T = unknown>(
  prefix: string,
  ...keyParts: unknown[]
): Promise<SharedCacheHit<T> | null> {
  // Nivel 1 — memoria de esta instancia.
  const local = getCachedSWR<T>(prefix, ...keyParts);
  if (local) return { data: local.data, isStale: local.isStale, level: "memory" };

  // Nivel 2 — Postgres, compartido.
  const key = buildKey(prefix, keyParts);
  try {
    const rows = (await prisma.$queryRaw`
      SELECT payload, fresh_until, stale_until
      FROM api_cache
      WHERE cache_key = ${key} AND stale_until > now()
      LIMIT 1
    `) as Array<{ payload: unknown; fresh_until: Date; stale_until: Date }>;

    const row = rows[0];
    if (!row) return null;

    // Copiar a memoria para que esta instancia no vuelva a consultar la tabla.
    // El TTL local se recorta a lo que le queda de vida a la entrada compartida.
    const msLeft = new Date(row.fresh_until).getTime() - Date.now();
    if (msLeft > 0) setCache(prefix, row.payload, msLeft, ...keyParts);

    return {
      data: row.payload as T,
      isStale: Date.now() > new Date(row.fresh_until).getTime(),
      level: "shared",
    };
  } catch {
    // Tabla inexistente o DB con problemas → nos comportamos como antes.
    return null;
  }
}

/**
 * Escribe en los dos niveles. El write a Postgres NO se espera: el caller ya
 * tiene la respuesta lista y no tiene por qué pagar la latencia de guardarla.
 */
export function setSharedCache(
  prefix: string,
  data: unknown,
  ...keyParts: unknown[]
): void {
  setCache(prefix, data, ...keyParts); // nivel 1, sincrónico

  const key = buildKey(prefix, keyParts);
  const freshUntil = new Date(Date.now() + DEFAULT_TTL_MS);
  const staleUntil = new Date(Date.now() + DEFAULT_TTL_MS + STALE_GRACE_MS);

  void prisma
    .$executeRaw`
      INSERT INTO api_cache (cache_key, payload, fresh_until, stale_until, updated_at)
      VALUES (${key}, ${JSON.stringify(data)}::jsonb, ${freshUntil}, ${staleUntil}, now())
      ON CONFLICT (cache_key) DO UPDATE SET
        payload = EXCLUDED.payload,
        fresh_until = EXCLUDED.fresh_until,
        stale_until = EXCLUDED.stale_until,
        updated_at = now()
    `
    .catch(() => {
      // Sin tabla o con la DB caída seguimos con caché en memoria. El usuario ya
      // tiene su respuesta; esto es best-effort por definición.
    });
}

/** Borra las entradas vencidas. Lo llama el cron de warm-cache. */
export async function purgeExpiredSharedCache(): Promise<number> {
  try {
    return await prisma.$executeRaw`DELETE FROM api_cache WHERE stale_until < now()`;
  } catch {
    return 0;
  }
}
