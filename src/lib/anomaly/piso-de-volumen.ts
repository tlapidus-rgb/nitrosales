// Heurística de negocio: eleva umbrales porcentuales cuando hay pocas órdenes.
// 100/sqrt(n) y el factor 2 se conservan por compatibilidad; NO constituyen
// una prueba de significancia ni garantizan una tasa de falsos positivos.
// Órdenes no equivalen a muestras de revenue, ROAS, CPA o AOV. Hace falta
// calibración por métrica, variabilidad, períodos y estacionalidad antes de
// interpretar los resultados como evidencia estadística.
// Los nombres exportados se mantienen para compatibilidad con callers.
export const VOLUMEN_MINIMO = 5;


export function ruidoEsperadoPct(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return Infinity;
  return 100 / Math.sqrt(n);
}


const FACTOR_HEURISTICO = 2;


export function umbralCreible(umbralDeNegocioPct: number, baseN: number): number {
  const negocio = Math.abs(umbralDeNegocioPct);
  const ajuste = ruidoEsperadoPct(baseN) * FACTOR_HEURISTICO;
  return Math.max(negocio, ajuste);
}


export function esCambioCreible(
  cambioPct: number | null,
  umbralDeNegocio: number,
  baseN: number,
): cambioPct is number {
  if (cambioPct === null || !Number.isFinite(cambioPct)) return false;
  if (!Number.isFinite(baseN) || baseN < VOLUMEN_MINIMO) return false;

  const vara = umbralCreible(umbralDeNegocio, baseN);
  return umbralDeNegocio < 0 ? cambioPct <= -vara : cambioPct >= vara;
}


export function esSubaDeGastoCreible(
  cambioPct: number | null,
  umbralDeNegocio: number,
  gastoPrevio: number,
): cambioPct is number {
  if (cambioPct === null || !Number.isFinite(cambioPct)) return false;
  if (!Number.isFinite(gastoPrevio) || gastoPrevio <= 0) return false;
  return cambioPct >= Math.abs(umbralDeNegocio);
}


export function elCeroEsNoticia(ordenesPrevias: number): boolean {
  return Number.isFinite(ordenesPrevias) && ordenesPrevias >= VOLUMEN_MINIMO * 2;
}
