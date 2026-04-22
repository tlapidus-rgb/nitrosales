// ══════════════════════════════════════════════════════════════
// Retry con exponential backoff + full jitter (AWS pattern)
// ══════════════════════════════════════════════════════════════
// Implementa el patrón recomendado por AWS Builders Library:
// "Timeouts, retries and backoff with jitter".
//
// Full jitter:
//   delay = random(0, min(cap, base * 2^attempt))
//
// Por qué "full jitter" y no "exponential"?
//   - Sin jitter, N clientes que fallan al mismo tiempo retrían
//     juntos → sobrecargan el backend.
//   - Full jitter distribuye las retries uniformemente en la
//     ventana. Mejor que "equal jitter" en la mayoría de casos.
//
// Uso:
//   const data = await retryWithBackoff(
//     () => fetch(url).then(r => r.json()),
//     { attempts: 5, baseMs: 200, capMs: 30000 }
//   );
// ══════════════════════════════════════════════════════════════

import { sleep } from "./jitter";

export interface RetryOpts {
  /** Intentos totales (default 5, incluye el primero) */
  attempts?: number;
  /** Delay base en ms (default 200) */
  baseMs?: number;
  /** Delay máximo en ms (default 30s) */
  capMs?: number;
  /** Callback opcional para filtrar qué errores reintentar (default: todos) */
  shouldRetry?: (err: Error, attempt: number) => boolean;
  /** Callback opcional para loggear cada retry */
  onRetry?: (err: Error, attempt: number, delayMs: number) => void;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOpts = {}
): Promise<T> {
  const {
    attempts = 5,
    baseMs = 200,
    capMs = 30_000,
    shouldRetry = () => true,
    onRetry,
  } = opts;

  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastErr = error;

      // ¿Es el último intento? → no hay retry
      if (attempt === attempts - 1) break;
      // ¿El error no es retryable? → no reintentar
      if (!shouldRetry(error, attempt)) break;

      // Full jitter: delay uniforme entre 0 y cap_actual
      const expBackoff = Math.min(capMs, baseMs * Math.pow(2, attempt));
      const delay = Math.random() * expBackoff;

      if (onRetry) onRetry(error, attempt, delay);

      await sleep(delay);
    }
  }

  throw lastErr || new Error("retryWithBackoff: no error captured (should not happen)");
}

/**
 * Helper: identifica si un error es retryable por su código HTTP.
 * Típicamente: 408 (timeout), 429 (rate limit), 500-504 (server errors).
 * No retryable: 400 (bad req), 401/403 (auth), 404 (not found).
 */
export function isRetryableStatus(status: number): boolean {
  if (status === 408 || status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}
