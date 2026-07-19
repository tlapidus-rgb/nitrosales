// ══════════════════════════════════════════════════════════════════════════
// Tasa de conversión — compradores vs visitantes del pixel
// ══════════════════════════════════════════════════════════════════════════
// `CR = compradores / visitantes` solo tiene sentido si los dos lados miden la
// misma población. En nitrosales NO la miden:
//
//   · Las VENTAS están completas — vienen de VTEX, que registra todo.
//   · Las VISITAS están incompletas — el 46% de los eventos VIEW_PRODUCT de
//     Arredo no traen productId (787.575 de 1.731.186 en 30 días), así que esos
//     visitantes existen pero no se le pueden asignar a ningún producto.
//   · Además, alguien puede VER un producto fuera de la ventana y COMPRARLO
//     adentro: la visita queda afuera del rango y la venta adentro.
//
// Consecuencia: el denominador está sistemáticamente por debajo y **todo el CR
// está inflado**. Donde se vuelve absurdo (1 visita / 8 ventas) preferimos no
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
