// ══════════════════════════════════════════════════════════════════════════
// src/lib/aurum/cuota.ts — el único componente con costo variable sin techo
// ══════════════════════════════════════════════════════════════════════════
// E-23. Hasta ahora: el modo DEEP (Opus, 8 rondas de razonamiento) **lo elige
// el cliente desde la UI**, `/api/chat` no tiene cuota ni rate limit, y hasta
// E-21 ni siquiera se podía saber cuánto costaba. Las tres cosas juntas son un
// gasto que sólo tiene el techo que le ponga la buena fe del usuario.
//
// El costo de DEEP no es "5× FLASH" aunque el precio por token lo sea:
//
//   FLASH  Haiku   $1/$5    · 2.000 tokens  · 2 rondas de tools
//   DEEP   Opus    $5/$25   · 8.000 tokens  · 8 rondas de tools
//
// Cada ronda reenvía el historial más los resultados de las tools anteriores,
// así que las rondas multiplican los tokens de ENTRADA. 5× de precio sobre 4×
// de salida sobre ~4× de rondas es de dónde sale el "10-50×" del plan.
//
// ── LA DECISIÓN DE DISEÑO: DEGRADAR, NO BLOQUEAR ─────────────────────────
// Pasado el tope, Aurum **no deja de contestar**: contesta en FLASH. El
// razonamiento es que un cliente que paga y recibe "alcanzaste tu límite"
// pierde el producto entero por una variable de entorno; uno que recibe una
// respuesta más corta pierde profundidad y sigue trabajando.
//
// Y se lo DICE. Degradar en silencio sería exactamente el patrón que venimos
// arreglando toda la branch: el usuario vería respuestas peores sin saber por
// qué, y culparía al producto en vez de al tope.
//
// ── FAIL-OPEN, A PROPÓSITO Y CON INCOMODIDAD ─────────────────────────────
// Si no se puede medir el consumo, se deja pasar. Bloquear el producto porque
// una query de telemetría falló es peor que el gasto que evita, y es la misma
// regla que E-13 ya fijó para la validación de credenciales.
//
// El costo de esta decisión hay que decirlo: una caída de la base es, también,
// gasto sin techo. Por eso `medicionDisponible: false` sale en la respuesta —
// es una condición que hay que poder ver, no una que se asume benigna.
// ══════════════════════════════════════════════════════════════════════════

export type ModoDeAurum = "FLASH" | "CORE" | "DEEP";

/** Orden de costo, de más barato a más caro. */
export const MODOS_POR_COSTO: ModoDeAurum[] = ["FLASH", "CORE", "DEEP"];

/**
 * Tope de gasto mensual por organización, en USD.
 *
 * ⚠️ **Este número es un atrapa-fugas, no un precio.** Está puesto para que un
 * loop o un uso desbocado no se coma un mes de margen sin que nadie se entere,
 * no para definir cuánto Aurum le toca a cada plan. El número real sale de
 * `/api/admin/consumo-por-cliente`, que recién ahora existe, y lo tiene que
 * poner Tomy con los datos de uso reales en la mano.
 *
 * Se configura con `AURUM_TOPE_USD_MENSUAL`.
 */
export const TOPE_USD_MENSUAL_POR_DEFECTO = 100;

/** A partir de qué fracción del tope conviene avisar antes de degradar. */
export const FRACCION_DE_AVISO = 0.7;

/**
 * Consultas por minuto y por organización.
 *
 * Esto NO es el control de gasto —para eso está el tope en dólares— sino el
 * freno de un loop. Un cliente escribiendo a mano no llega a 20 por minuto; un
 * `useEffect` mal puesto llega en dos segundos, y con DEEP eso es caro rápido.
 *
 * Se configura con `AURUM_CONSULTAS_POR_MINUTO`.
 */
export const CONSULTAS_POR_MINUTO_POR_DEFECTO = 20;

export type LimitesDeAurum = {
  topeUsdMensual: number;
  consultasPorMinuto: number;
};

/** Lee los límites del entorno, cayendo a los defaults si no están o no parsean. */
export function limitesDeAurum(env: NodeJS.ProcessEnv = process.env): LimitesDeAurum {
  return {
    topeUsdMensual: numeroPositivo(env.AURUM_TOPE_USD_MENSUAL, TOPE_USD_MENSUAL_POR_DEFECTO),
    consultasPorMinuto: numeroPositivo(
      env.AURUM_CONSULTAS_POR_MINUTO,
      CONSULTAS_POR_MINUTO_POR_DEFECTO,
    ),
  };
}

function numeroPositivo(crudo: string | undefined, porDefecto: number): number {
  if (crudo === undefined || crudo === "") return porDefecto;
  const n = Number(crudo);
  // Un valor mal escrito cae al default en vez de volverse NaN. Un NaN acá
  // haría que toda comparación diera false y el tope no existiera — el modo de
  // falla más silencioso posible para un control de gasto.
  if (!Number.isFinite(n) || n <= 0) return porDefecto;
  return n;
}

export type ConsumoActual = {
  /** USD gastados en el mes en curso. `null` si no se pudo medir. */
  usdDelMes: number | null;
  /** Consultas en el último minuto. `null` si no se pudo medir. */
  consultasUltimoMinuto: number | null;
};

export type DecisionDeCuota = {
  /** `false` sólo cuando se pasó el rate limit: ahí sí no se contesta. */
  permitido: boolean;
  /** El modo con el que efectivamente hay que correr. */
  modoEfectivo: ModoDeAurum;
  /** `true` si el modo pedido se bajó por tope. */
  degradado: boolean;
  /** Qué decirle al usuario. `null` si no hay nada que decir. */
  motivo: string | null;
  /** `true` si está cerca del tope pero todavía no se degradó. */
  cercaDelTope: boolean;
  /** `false` si el consumo no se pudo medir y se dejó pasar por las dudas. */
  medicionDisponible: boolean;
};

export function evaluarCuota(args: {
  modoPedido: ModoDeAurum;
  consumo: ConsumoActual;
  limites: LimitesDeAurum;
}): DecisionDeCuota {
  const { modoPedido, consumo, limites } = args;

  // ── El freno del loop va primero ────────────────────────────────────────
  // Si alguien está disparando 200 consultas por minuto, el tope mensual
  // todavía no se enteró: se va a enterar en unos minutos, cuando ya gastó.
  if (
    consumo.consultasUltimoMinuto !== null &&
    consumo.consultasUltimoMinuto >= limites.consultasPorMinuto
  ) {
    return {
      permitido: false,
      modoEfectivo: modoPedido,
      degradado: false,
      motivo:
        `Se hicieron ${consumo.consultasUltimoMinuto} consultas en el último minuto, que es más ` +
        `de lo que el asistente acepta seguidas. Esperá unos segundos y volvé a intentar.`,
      cercaDelTope: false,
      medicionDisponible: true,
    };
  }

  // ── Sin medición, se deja pasar ─────────────────────────────────────────
  if (consumo.usdDelMes === null) {
    return {
      permitido: true,
      modoEfectivo: modoPedido,
      degradado: false,
      motivo: null,
      cercaDelTope: false,
      medicionDisponible: false,
    };
  }

  const usado = consumo.usdDelMes;

  if (usado >= limites.topeUsdMensual) {
    const yaEraElMasBarato = modoPedido === "FLASH";
    return {
      permitido: true,
      modoEfectivo: "FLASH",
      degradado: !yaEraElMasBarato,
      motivo: yaEraElMasBarato
        ? "El asistente está en modo rápido porque se alcanzó el tope de uso del mes."
        : `Se alcanzó el tope de uso del mes, así que esta respuesta va en modo rápido en vez ` +
          `de ${modoPedido}. Seguís teniendo el asistente: las respuestas son más cortas.`,
      cercaDelTope: true,
      medicionDisponible: true,
    };
  }

  if (usado >= limites.topeUsdMensual * FRACCION_DE_AVISO) {
    return {
      permitido: true,
      modoEfectivo: modoPedido,
      degradado: false,
      // Avisar ANTES de degradar: que el modo se caiga de un request al
      // siguiente sin ninguna señal previa se lee como que el producto se rompió.
      motivo:
        `Vas por el ${Math.round((usado / limites.topeUsdMensual) * 100)} % del uso del mes. ` +
        `Pasado el 100 %, el asistente sigue andando pero en modo rápido.`,
      cercaDelTope: true,
      medicionDisponible: true,
    };
  }

  return {
    permitido: true,
    modoEfectivo: modoPedido,
    degradado: false,
    motivo: null,
    cercaDelTope: false,
    medicionDisponible: true,
  };
}
