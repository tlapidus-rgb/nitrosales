// ══════════════════════════════════════════════════════════════
// Jitter determinístico por orgId — anti "thundering herd"
// ══════════════════════════════════════════════════════════════
// Cuando hay múltiples organizaciones y todas corren el mismo
// cron a la misma hora (ej: todas las orgs a las 02:00), se
// genera un "thundering herd": miles de requests simultáneas
// a APIs externas + pool de DB saturado.
//
// Solución: cada org arranca con un delay proporcional a un
// hash DETERMINÍSTICO de su orgId. Misma org = mismo delay.
// Reproducible (debuggeable) y distribuye carga en N minutos.
//
// Pattern confirmado por AWS Builders Library y PayPal Engineering.
// ══════════════════════════════════════════════════════════════

/**
 * Hash simple pero estable (no cryptographic) de un string.
 * Suficiente para distribuir cargas. No usar para seguridad.
 */
function stableHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // 32-bit int
  }
  return Math.abs(hash);
}

/**
 * Delay determinístico en ms para una org.
 * @param orgId       ID de la organización
 * @param windowMs    Ventana total donde distribuir (default 15 min)
 * @returns número de ms a esperar antes de arrancar
 *
 * Ejemplo:
 *   await sleep(orgJitter(orgId, 15 * 60 * 1000));
 */
export function orgJitter(orgId: string, windowMs: number = 15 * 60 * 1000): number {
  if (!orgId) return 0;
  const h = stableHash(orgId);
  return h % windowMs;
}

/**
 * Helper: sleep por N ms.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
