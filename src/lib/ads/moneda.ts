// ══════════════════════════════════════════════════════════════════════════
// src/lib/ads/moneda.ts — ¿en qué moneda factura cada cuenta de ads?
// ══════════════════════════════════════════════════════════════════════════
// R-V05 / decisión #5 del plan. La pregunta lleva abierta desde la auditoría del
// 2026-09-02 y sigue sin responder, y es la de peor relación riesgo/esfuerzo de
// todas: **si alguna cuenta factura en dólares, el ROAS de ese canal está mal
// por un factor de ~1.000.**
//
// ── LO QUE ENCONTRÉ AL IR A MIRAR ────────────────────────────────────────
// El sistema **no sabe** en qué moneda está el gasto, y nunca preguntó:
//
//   · `ad_metrics_daily` no tiene columna de moneda. El campo se llama `spend` y
//     su comentario en el schema dice, literalmente, *"Gasto en USD/moneda"* —
//     o sea que la ambigüedad está escrita en el esquema.
//   · Google Ads convierte `cost_micros` a unidades de moneda
//     (`microsToCurrency`) y **nunca lee cuál**.
//   · Meta pide `spend` de las insights y tampoco pide `currency`.
//
// Y las dos APIs la devuelven gratis: Google en `customer.currency_code`, Meta
// en el campo `currency` de la cuenta. O sea que el dato estuvo siempre a una
// pregunta de distancia.
//
// ── POR QUÉ ESTO ES UN DIAGNÓSTICO Y NO UN ARREGLO ───────────────────────
// Convertir el gasto es una decisión con consecuencias: a qué tipo de cambio,
// desde qué fecha, y qué se hace con los históricos ya guardados. Este módulo
// **sólo contesta la pregunta**, que es lo que hoy nadie puede contestar. El
// arreglo, si hace falta, viene después y con la respuesta en la mano.
// ══════════════════════════════════════════════════════════════════════════

/** La moneda en la que se asume que está todo hoy, sin decirlo en ningún lado. */
export const MONEDA_ASUMIDA = "ARS";

export type MonedaDeCuenta = {
  plataforma: "META_ADS" | "GOOGLE_ADS";
  organizacion: string;
  cuenta: string | null;
  /** El código que devolvió la plataforma, o `null` si no se pudo preguntar. */
  moneda: string | null;
  /** `true` si NO es la moneda asumida. Es la señal que importa. */
  desalineada: boolean;
  detalle: string;
};

/**
 * El veredicto sobre una cuenta, dado lo que contestó la plataforma.
 *
 * Puro y aparte de las llamadas HTTP: el criterio es lo que hay que poder
 * discutir, y lo que se puede probar sin red.
 */
export function evaluarMoneda(
  plataforma: MonedaDeCuenta["plataforma"],
  organizacion: string,
  cuenta: string | null,
  moneda: string | null | undefined,
): MonedaDeCuenta {
  const codigo = typeof moneda === "string" && moneda.trim() ? moneda.trim().toUpperCase() : null;

  if (!codigo) {
    return {
      plataforma,
      organizacion,
      cuenta,
      moneda: null,
      // ⚠️ "No se pudo preguntar" NO es "está bien". Si esto contara como
      // alineada, el diagnóstico daría verde justo en la cuenta que no
      // pudimos revisar.
      desalineada: false,
      detalle: "No se pudo obtener la moneda de la cuenta. No es lo mismo que estar bien.",
    };
  }

  if (codigo === MONEDA_ASUMIDA) {
    return {
      plataforma,
      organizacion,
      cuenta,
      moneda: codigo,
      desalineada: false,
      detalle: `Factura en ${codigo}, que es lo que el sistema asume.`,
    };
  }

  return {
    plataforma,
    organizacion,
    cuenta,
    moneda: codigo,
    desalineada: true,
    detalle:
      `⚠️ Factura en ${codigo} y el sistema guarda el gasto como si fuera ${MONEDA_ASUMIDA}. ` +
      `El ROAS, el CPA y el P&L de este canal están mal por el tipo de cambio — con el dólar ` +
      `a ~1.000 pesos, un ROAS de 3x real se muestra como 3.000x. Revisar antes de tomar ` +
      `cualquier decisión de presupuesto con estos números.`,
  };
}

/** Resumen para quien mira el diagnóstico de un vistazo. */
export function resumir(cuentas: readonly MonedaDeCuenta[]): {
  total: number;
  desalineadas: number;
  sinRespuesta: number;
  veredicto: string;
} {
  const desalineadas = cuentas.filter((c) => c.desalineada).length;
  const sinRespuesta = cuentas.filter((c) => c.moneda === null).length;

  const veredicto =
    cuentas.length === 0
      ? "No hay cuentas de ads conectadas."
      : desalineadas > 0
        ? `${desalineadas} cuenta(s) NO facturan en ${MONEDA_ASUMIDA}. Los números de esos canales están mal.`
        : sinRespuesta > 0
          ? `Ninguna desalineada, pero ${sinRespuesta} no contestó: la respuesta todavía no es completa.`
          : `Las ${cuentas.length} cuentas facturan en ${MONEDA_ASUMIDA}. R-V05 contestada.`;

  return { total: cuentas.length, desalineadas, sinRespuesta, veredicto };
}
