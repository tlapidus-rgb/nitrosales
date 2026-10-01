// ══════════════════════════════════════════════════════════════════════════
// src/lib/comparacion-segura.ts — comparar secretos sin filtrar información
// ══════════════════════════════════════════════════════════════════════════
// Vive en un solo lugar a propósito. Es una primitiva de seguridad, y una
// primitiva de seguridad duplicada es una primitiva de seguridad que en algún
// momento va a estar arreglada en un lado y rota en el otro.
//
// La usan los dos secretos que se validan desde afuera: la clave de admin/cron
// (`admin-key.ts`) y la del webhook de órdenes de VTEX.
// ══════════════════════════════════════════════════════════════════════════

import crypto from "crypto";

/**
 * Comparación de tiempo constante entre dos strings.
 *
 * Se hashean los dos lados antes de comparar por dos razones:
 *
 *   · `timingSafeEqual` **tira** si los buffers tienen largos distintos, así que
 *     compararlos crudos obligaría a chequear el largo primero — y eso filtra el
 *     largo del secreto;
 *   · con SHA-256 los dos lados miden siempre 32 bytes, sin importar lo que
 *     entre. Una clave de 100.000 caracteres tampoco rompe nada.
 *
 * El `===` que había antes cortaba en el primer byte distinto. Para un secreto
 * que se puede probar desde internet contra decenas de endpoints, eso es una
 * diferencia medible.
 */
export function igualSeguro(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * ¿`candidata` coincide con la clave actual, o con la anterior mientras haya una
 * ventana de rotación abierta?
 *
 * Fail-closed: una candidata vacía nunca entra, y una `anterior` vacía o nula no
 * abre ninguna puerta — `ADMIN_API_KEY_ANTERIOR=""` en Vercel no puede volverse
 * un bypass.
 */
export function coincideConAlguna(
  candidata: string | null | undefined,
  actual: string,
  anterior: string | null | undefined,
): boolean {
  if (typeof candidata !== "string" || candidata.length === 0) return false;
  if (typeof actual === "string" && actual.length > 0 && igualSeguro(candidata, actual)) return true;
  if (typeof anterior === "string" && anterior.length > 0 && igualSeguro(candidata, anterior)) {
    return true;
  }
  return false;
}
