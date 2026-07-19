// ══════════════════════════════════════════════════════════════════════════
// Tasa de conversión — compradores vs visitantes del pixel
// ══════════════════════════════════════════════════════════════════════════
// `CR = compradores / visitantes` solo tiene sentido si los dos lados miden la
// misma población, y a veces no la miden: se puede comprar sin pasar por la
// ficha del producto (agregar al carrito desde la grilla), o haberla visto
// ANTES de la ventana y comprar adentro. En esos casos hay ventas con pocas o
// ninguna visita asociada.
//
// ⚠️ NO es un problema de tracking. Se investigó (2026-07-18): el 46% de los
// eventos VIEW_PRODUCT no traen productId, pero recuperarlos por nombre movió
// los visitantes por producto apenas +0,7% — esos eventos son del mismo
// visitante que ya estaba contado. **El denominador está bien y los CR del
// dashboard son correctos.**
//
// Donde el ratio igual se vuelve imposible (1 visita / 8 ventas) preferimos no
// afirmar nada: devolvemos 0, que la UI renderiza como "—".
//
// La fila NO se descarta: sus ventas siguen contando en los totales de
// categoría y marca. Lo que se omite es la TASA, no el dato.
// ══════════════════════════════════════════════════════════════════════════

/**
 * Margen de tolerancia sobre los visitantes antes de declarar el ratio
 * incoherente. Los visitantes vienen de HLL (~2% de error), así que 101
 * compradores sobre 100 visitantes es ruido estadístico normal, no un
 * problema de cobertura. 10% cubre el error de HLL más redondeo.
 */
const HLL_TOLERANCE = 1.1;

/**
 * CR en porcentaje con dos decimales.
 * Devuelve 0 (la UI muestra "—") cuando el ratio no es computable:
 *   · sin visitantes → no hay denominador
 *   · compradores muy por encima de los visitantes → la cobertura del pixel es
 *     insuficiente para ese producto; afirmar 100% sería inventar
 */
export function crPct(buyers: number, viewers: number): number {
  if (!Number.isFinite(buyers) || !Number.isFinite(viewers)) return 0;
  if (viewers <= 0) return 0;
  if (buyers > viewers * HLL_TOLERANCE) return 0;
  return Math.min(100, Math.round((buyers / viewers) * 10000) / 100);
}

/** true cuando hay ventas pero la cobertura del pixel no alcanza para el ratio. */
export function isCoverageIncoherent(buyers: number, viewers: number): boolean {
  return buyers > 0 && (viewers <= 0 || buyers > viewers * HLL_TOLERANCE);
}
