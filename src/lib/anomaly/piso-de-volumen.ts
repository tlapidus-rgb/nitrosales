// ══════════════════════════════════════════════════════════════════════════
// src/lib/anomaly/piso-de-volumen.ts — cuándo un porcentaje significa algo
// ══════════════════════════════════════════════════════════════════════════
// E-24. El detector de anomalías es **100 % porcentual y sin piso de volumen**.
// Con 7 órdenes por día, pasar a 4 dispara una alerta HIGH de "facturación cayó
// 43 %".
//
// ── POR QUÉ ESTO IMPORTA AHORA Y NO ANTES ────────────────────────────────
// Con cuatro clientes grandes el problema era teórico. Desde E-19 los checks
// mandan **un mail por día**, así que el primer cliente chico que entre recibe
// alertas falsas desde la semana uno. Y el modo de falla no es "molesta": es
// que **deja de leer los mails**, y con eso el producto pierde su único canal
// proactivo. Una alerta que no se lee es peor que no tener alertas, porque
// además da sensación de cobertura.
//
// ── LA CUENTA ────────────────────────────────────────────────────────────
// Las órdenes son un conteo, y un conteo tiene ruido de Poisson: con `n`
// eventos, la desviación estándar es `√n`, o sea que la variación relativa
// esperada **sólo por azar** es `√n / n = 1/√n`.
//
//     n = 7   →  ruido ~38 %   ← el umbral de -30 % dispara SOBRE NADA
//     n = 25  →  ruido ~20 %
//     n = 100 →  ruido ~10 %
//     n = 400 →  ruido ~5 %
//
// Con lo cual el umbral fijo de 30 % no está mal: está **mal para clientes
// chicos**. Un umbral que no supera al ruido no es un umbral.
//
// ── POR QUÉ NO UN PISO FIJO A SECAS ──────────────────────────────────────
// "No alertar por debajo de N órdenes" es más simple y era la primera idea.
// Pero elegir N es arbitrario y tiene los dos errores: deja pasar ruido apenas
// arriba de N, y silencia una caída real y grande justo abajo. Ajustar el
// umbral al ruido no necesita elegir nada: **se adapta solo al tamaño del
// cliente**, y a un cliente grande lo deja exactamente como está hoy.
//
// Igual queda un piso duro, pero para otra cosa: con 0-4 órdenes no hay
// estadística que valga y el porcentaje es directamente un sinsentido.
// ══════════════════════════════════════════════════════════════════════════

/**
 * Debajo de esto no se evalúa ninguna regla porcentual.
 *
 * No es un umbral estadístico: es el reconocimiento de que con menos de cinco
 * eventos el porcentaje no describe nada. De 2 órdenes a 1 es "-50 %", y no
 * significa absolutamente nada.
 */
export const VOLUMEN_MINIMO = 5;

/**
 * Variación relativa esperada por puro azar, en porcentaje, para un conteo de
 * `n` eventos. Es `1/√n`.
 *
 * Devuelve `Infinity` para `n <= 0`: sin eventos, cualquier cambio es ruido.
 */
export function ruidoEsperadoPct(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return Infinity;
  return 100 / Math.sqrt(n);
}

/**
 * Cuánto margen sobre el ruido se exige para considerar que un cambio es señal.
 *
 * `1` significaría "que apenas supere al ruido", y eso dispararía una de cada
 * tres veces por azar (es ~1 sigma). `2` es el criterio de siempre —dos
 * desviaciones, ~5 % de falsos positivos— y es el que se usa acá.
 */
const SIGMAS = 2;

/**
 * El umbral que hay que superar para que un cambio porcentual sea creíble, dado
 * el volumen que lo sostiene.
 *
 * Es el más exigente de los dos: el umbral de negocio configurado en
 * `THRESHOLDS` y el umbral estadístico. A un cliente grande lo deja igual que
 * hoy (el ruido es chico y manda el de negocio); a uno chico le sube la vara
 * hasta donde el dato deja de ser azar.
 */
export function umbralCreible(umbralDeNegocioPct: number, baseN: number): number {
  const negocio = Math.abs(umbralDeNegocioPct);
  const estadistico = ruidoEsperadoPct(baseN) * SIGMAS;
  return Math.max(negocio, estadistico);
}

/**
 * ¿Este cambio porcentual amerita una alerta?
 *
 * @param cambioPct        el cambio observado (negativo = caída)
 * @param umbralDeNegocio  el umbral de `THRESHOLDS` (con su signo original)
 * @param baseN            el conteo que sostiene la métrica — casi siempre las
 *                         órdenes del período. Es el que tiene el ruido.
 */
export function esCambioCreible(
  cambioPct: number | null,
  umbralDeNegocio: number,
  baseN: number,
  // El type predicate no es cosmético: reemplaza a los `cambio !== null` que
  // había antes de cada regla, así que sin esto TypeScript dejaría de saber que
  // adentro del `if` el cambio ya no puede ser null.
): cambioPct is number {
  if (cambioPct === null || !Number.isFinite(cambioPct)) return false;
  // Con casi nada de volumen, ninguna regla porcentual corre.
  if (!Number.isFinite(baseN) || baseN < VOLUMEN_MINIMO) return false;

  const vara = umbralCreible(umbralDeNegocio, baseN);
  // El signo lo pone el umbral de negocio: negativo = caída, positivo = suba.
  return umbralDeNegocio < 0 ? cambioPct <= -vara : cambioPct >= vara;
}

/**
 * El caso de "cero" —cero órdenes, cero inversión— no es porcentual y necesita
 * su propio criterio.
 *
 * Un día sin ventas es una emergencia para un cliente que vende 200 por día, y
 * es un martes cualquiera para uno que vende 3 por semana. Sin esto, el cliente
 * chico recibe "0 pedidos en el periodo — posible caida del sitio" de forma
 * rutinaria, que es la alerta que más rápido enseña a ignorar los mails.
 */
export function elCeroEsNoticia(ordenesPrevias: number): boolean {
  return Number.isFinite(ordenesPrevias) && ordenesPrevias >= VOLUMEN_MINIMO * 2;
}
