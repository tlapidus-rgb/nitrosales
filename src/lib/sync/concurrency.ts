// ══════════════════════════════════════════════════════════════
// Concurrency control para llamadas a APIs externas
// ══════════════════════════════════════════════════════════════
// Wrapper liviano (sin dependencias) para limitar cuántas promises
// corren en paralelo. Patrón equivalente a p-limit de sindresorhus.
//
// Uso:
//   const results = await withConcurrency(
//     8,                                      // max 8 en paralelo
//     orderIds.map(id => () => fetchOrder(id))
//   );
//
// Por qué existe:
//   - Rate limits externos (MELI: 1500/min global, 100/min en /search)
//   - Protección del pool de Postgres (8 connections)
//   - Evitar "explotar" memoria si hay 50K tasks pending
// ══════════════════════════════════════════════════════════════

export type Task<T> = () => Promise<T>;

export async function withConcurrency<T>(
  limit: number,
  tasks: Task<T>[]
): Promise<T[]> {
  if (limit <= 0) throw new Error("concurrency limit must be >= 1");
  if (tasks.length === 0) return [];

  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  }

  // Lanzar N workers en paralelo (cada uno va consumiendo del pool)
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Variante que no falla si una task individual rompe.
 * Devuelve { ok, value/error } por posición.
 */
export type Settled<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

export async function withConcurrencySettled<T>(
  limit: number,
  tasks: Task<T>[]
): Promise<Settled<T>[]> {
  if (limit <= 0) throw new Error("concurrency limit must be >= 1");
  if (tasks.length === 0) return [];

  const results: Settled<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= tasks.length) return;
      try {
        const value = await tasks[i]();
        results[i] = { ok: true, value };
      } catch (err: any) {
        results[i] = { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
