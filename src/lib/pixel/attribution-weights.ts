// ══════════════════════════════════════════════════════════════════════════
// Reconstrucción de revenue de atribución por modelo, desde los componentes
// SIN ponderar de gold_attribution_source. Serve-time (los pesos NITRO son
// configurables → no se pueden hornear en el rollup).
// ══════════════════════════════════════════════════════════════════════════
// Replica EXACTAMENTE las 4 variantes del CASE de /api/metrics/pixel query #9:
//   LAST_CLICK / FIRST_CLICK / LINEAR = fijos.
//   NITRO / CUSTOM = ponderado con nitroWeights (first/middle/last, suman 100):
//     single(n=1) + first2*wF/(wF+wL) + last2*wL/(wF+wL)
//                 + firstN*wF/100 + lastN*wL/100 + middleN*wM/100
// ══════════════════════════════════════════════════════════════════════════

/** Componentes por source de una fila (o suma de filas) de gold_attribution_source. */
export interface AttributionComponents {
  last_click_revenue: number;
  first_click_revenue: number;
  linear_revenue: number;
  nitro_single: number;
  nitro_first2: number;
  nitro_last2: number;
  nitro_first_n: number;
  nitro_last_n: number;
  nitro_middle_n: number;
}

export interface NitroWeights {
  first: number;
  middle: number;
  last: number;
}

/**
 * Revenue atribuido a una source bajo el modelo dado. `weights` solo importa
 * para NITRO/CUSTOM (los demás modelos son fijos y lo ignoran).
 */
export function reconstructSourceRevenue(
  c: AttributionComponents,
  model: string,
  weights: NitroWeights,
): number {
  switch (model.toUpperCase()) {
    case "LAST_CLICK":
      return c.last_click_revenue;
    case "FIRST_CLICK":
      return c.first_click_revenue;
    case "LINEAR":
      return c.linear_revenue;
    case "NITRO":
    case "CUSTOM":
    default: {
      const wF = weights.first;
      const wM = weights.middle;
      const wL = weights.last;
      // n=2 renormaliza sobre (wF+wL) — igual que el endpoint; guard div-by-zero.
      const twoTouchDenom = wF + wL;
      const first2 = twoTouchDenom > 0 ? (c.nitro_first2 * wF) / twoTouchDenom : 0;
      const last2 = twoTouchDenom > 0 ? (c.nitro_last2 * wL) / twoTouchDenom : 0;
      return (
        c.nitro_single +
        first2 +
        last2 +
        (c.nitro_first_n * wF) / 100 +
        (c.nitro_last_n * wL) / 100 +
        (c.nitro_middle_n * wM) / 100
      );
    }
  }
}
