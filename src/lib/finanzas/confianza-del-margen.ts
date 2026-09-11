// ══════════════════════════════════════════════════════════════════════════
// src/lib/finanzas/confianza-del-margen.ts — cuándo el margen se puede mostrar
// ══════════════════════════════════════════════════════════════════════════
// E-25. Sin costos cargados, `COALESCE(oi."costPrice", p."costPrice", 0)` da
// COGS = 0, y con eso el margen bruto sale **100 %**.
//
// No es un error de cálculo: es la respuesta correcta a la pregunta equivocada.
// El SQL contesta "cuánto costó lo que sé que costó algo", y lo que no sabe lo
// cuenta como gratis. Con un cliente que todavía no cargó su lista de costos
// —o sea, **todo cliente nuevo el día 1**— el producto no se rompe: **miente**,
// y miente en la dirección más peligrosa, diciéndole que gana más de lo que
// gana.
//
// ── LO QUE FALTABA NO ERA EL DATO ────────────────────────────────────────
// `/api/metrics/pnl` ya calculaba la cobertura y la devolvía; `/finanzas/estado`
// ya mostraba un cartel cuando bajaba del 50 %. Faltaban dos cosas:
//
//   1. **`/finanzas/pulso` no calculaba la cobertura en absoluto.** Mostraba el
//      margen sin tener idea de si los costos existían.
//   2. **Un cartel al lado de un "100 %" gigante sigue siendo una mentira en
//      pantalla.** El ojo lee el número, no el cartel. Por debajo de cierto
//      punto el número no hay que matizarlo: no hay que mostrarlo.
//
// Este módulo es el criterio, separado de las dos pantallas para que digan lo
// mismo. Que una avisara y la otra no es exactamente el tipo de divergencia que
// aparece cuando la regla vive en el componente.
// ══════════════════════════════════════════════════════════════════════════

export type ConfianzaDelMargen = "confiable" | "parcial" | "sin-datos";

/**
 * Debajo de esto el margen NO se muestra.
 *
 * Es el mismo 20 % que ya usaba el detector de anomalías para decidir si
 * evaluar el margen (`hasCostData` en `anomaly/detector.ts`). Se alinea a
 * propósito: que el mail diga una cosa y la pantalla otra es peor que
 * cualquiera de las dos solas.
 */
export const COBERTURA_MINIMA = 20;

/**
 * Debajo de esto se muestra con advertencia. Es el umbral que `/finanzas/estado`
 * ya usaba; se mantiene para no cambiarle a nadie lo que ve hoy.
 */
export const COBERTURA_CONFIABLE = 50;

export function confianzaDelMargen(coberturaPct: number): ConfianzaDelMargen {
  if (!Number.isFinite(coberturaPct) || coberturaPct < COBERTURA_MINIMA) return "sin-datos";
  if (coberturaPct < COBERTURA_CONFIABLE) return "parcial";
  return "confiable";
}

/**
 * El margen que corresponde mostrar, o `null` si no corresponde mostrar ninguno.
 *
 * `null` **no** significa "mostrá 0 %" ni "mostrá 100 %": significa que la
 * pantalla tiene que decir que no sabe. Un cero es tan mentira como un cien.
 */
export function margenParaMostrar(
  margenPct: number,
  coberturaPct: number,
): number | null {
  return confianzaDelMargen(coberturaPct) === "sin-datos" ? null : margenPct;
}

/**
 * Qué decirle al cliente, o `null` si no hay nada que aclarar.
 *
 * Está escrito para que se entienda sin saber qué es el COGS, y sobre todo para
 * que se entienda **qué hacer**: el problema no es del sistema, es que falta
 * cargar los costos.
 */
export function avisoDeCobertura(coberturaPct: number): string | null {
  switch (confianzaDelMargen(coberturaPct)) {
    case "sin-datos":
      return (
        "No podemos calcular el margen todavía: falta cargar los precios de costo " +
        "de tus productos. Hasta que estén, la ganancia y el margen no se muestran " +
        "— preferimos no mostrarte un número antes que mostrarte uno equivocado."
      );
    case "parcial":
      return (
        `Sólo ${Math.round(coberturaPct)}% de los productos vendidos tienen precio ` +
        "de costo cargado, así que el margen que ves es mejor que el real. " +
        "Completá los costos que faltan para que el número cierre."
      );
    case "confiable":
      return null;
  }
}
