// ══════════════════════════════════════════════════════════════════════════
// NitroPixel — composición de la cache key de /api/metrics/pixel
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE (auditoría 2026-07-21):
//   La key era `[org, from, to, "v12"]` y omitía tres params que SÍ cambian la
//   respuesta: `model`, `page` y `pageSize`.
//     · `model` decide qué columna de gold_attribution_source se reconstruye
//       (goldModelRevenueSql) → el selector de modelo de atribución no hacía
//       nada mientras la entrada siguiera viva.
//     · `page`/`pageSize` recortan `recentEvents` → la página 2 servía la 1.
//   Con api_cache compartida en Postgres (1d1dc64a) el efecto dejó de ser
//   por-instancia de lambda: el primero que pegaba fijaba el modelo para TODOS
//   los usuarios de la org al mismo tiempo.
//
// REGLA: si un parámetro cambia el payload, va en la key. Sin excepciones.
//
// Está en un módulo aparte y es PURA para poder testear la regla sin levantar
// la ruta (que corre 29 queries). Ver src/__tests__/pixel-cache-key.test.ts.
// ══════════════════════════════════════════════════════════════════════════

/** Versión de la key. Bumpear cuando cambie la FORMA del payload cacheado. */
export const PIXEL_CACHE_KEY_VERSION = "v13";

export interface PixelCacheKeyParams {
  orgId: string;
  /** `from`/`to` crudos del query string; null/vacío ⇒ el rango default. */
  from?: string | null;
  to?: string | null;
  /**
   * `model` CRUDO del query string, ya en mayúsculas. Vacío ⇒ manda el default
   * de la org. Va crudo a propósito: resolverlo contra los settings exigiría
   * leer `organizations` ANTES del lookup y agregaría un round-trip al camino
   * rápido, que es justo lo que la caché existe para evitar.
   */
  model?: string | null;
  page: number;
  pageSize: number;
}

/**
 * Partes de la cache key de /api/metrics/pixel.
 *
 * ⚠️ Los settings de la org (attributionModel default, nitroWeights,
 * attributionWindowDays) NO están acá — ver la nota de `model`. Cambiarlos no
 * se refleja hasta que expire la entrada. La salida barata, si molesta, es
 * invalidar la key de la org desde el PUT de settings.
 */
export function buildPixelCacheKey(params: PixelCacheKeyParams): string[] {
  return [
    params.orgId,
    params.from || "default",
    params.to || "default",
    (params.model || "").toUpperCase() || "orgdefault",
    `p${params.page}x${params.pageSize}`,
    PIXEL_CACHE_KEY_VERSION,
  ];
}
