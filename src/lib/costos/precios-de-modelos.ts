// ══════════════════════════════════════════════════════════════════════════
// src/lib/costos/precios-de-modelos.ts — cuánto cuesta una llamada a Aurum
// ══════════════════════════════════════════════════════════════════════════
// E-21. `aurum_usage_logs` guarda tokens desde siempre, pero **no había una
// tabla de precios en ningún lado del repo**, así que el único componente con
// costo variable del producto no se podía costear ni en pesos ni en dólares.
//
// ── POR QUÉ ESTO ES CONFIGURACIÓN Y NO UNA VERDAD DEL CÓDIGO ─────────────
// Los precios los pone Anthropic y cambian. Una tabla hardcodeada que nadie
// vuelve a mirar es exactamente el patrón que nos mordió en E-26: una
// afirmación que envejece **sin ningún síntoma**, porque un número equivocado
// se ve igual de convincente que uno correcto.
//
// Por eso:
//   · la tabla lleva la fecha en que se verificó, y esa fecha viaja en la
//     respuesta del endpoint — el que mira el número ve contra qué está mirando;
//   · se puede pisar por entorno (`PRECIOS_MODELOS_JSON`) sin deployar, para
//     corregir un precio el día que cambie;
//   · un modelo que NO está en la tabla devuelve `conocido: false`, **nunca
//     cero**. Un costo de cero es una mentira que además da tranquilidad.
//
// ── LO QUE ESTE NÚMERO NO INCLUYE ────────────────────────────────────────
// Es el costo de INFERENCIA, no el costo de servir al cliente. Fuera quedan
// Neon, Vercel, storage y todo lo demás, que hoy **no son atribuibles por
// organización** sin trabajo aparte. Decir "este cliente nos cuesta X" con
// este número solo sería subestimarlo.
//
// Nota: hoy Aurum no usa prompt caching en ninguna llamada (no hay un solo
// `cache_control` en el repo), así que todos los tokens de entrada se pagan a
// precio lleno y esta cuenta es exacta. Si algún día se activa el caching, esta
// tabla queda ALTA y hay que sumar los tokens de cache a los logs.
//
// Precios verificados contra platform.claude.com/docs/en/about-claude/pricing
// el 2026-09-12. La página no publica fecha de vigencia, así que la fecha de
// abajo es la de la verificación, no la del precio.
// ══════════════════════════════════════════════════════════════════════════

export const PRECIOS_VERIFICADOS_EL = "2026-09-12";

/** Cuántos días puede tener la tabla antes de que convenga volver a mirarla. */
export const DIAS_ANTES_DE_REVISAR = 90;

export type PrecioDeModelo = {
  /** USD por millón de tokens de entrada. */
  entrada: number;
  /** USD por millón de tokens de salida. */
  salida: number;
};

const TABLA_BASE: Record<string, PrecioDeModelo> = {
  "claude-opus-4-5": { entrada: 5, salida: 25 },
  "claude-sonnet-4-5": { entrada: 3, salida: 15 },
  "claude-haiku-4-5": { entrada: 1, salida: 5 },
  // El repo loguea el id exacto que manda, y `chat/route.ts` usa la variante
  // con fecha para Haiku. Las dos apuntan al mismo modelo y al mismo precio.
  "claude-haiku-4-5-20251001": { entrada: 1, salida: 5 },
};

/**
 * La tabla efectiva: la base, pisada por `PRECIOS_MODELOS_JSON` si existe.
 *
 * Se lee en cada llamada y no al importar: así un cambio de entorno tiene
 * efecto sin redeployar el módulo, que es todo el punto de que sea pisable.
 */
export function tablaDePrecios(env: NodeJS.ProcessEnv = process.env): Record<string, PrecioDeModelo> {
  const crudo = env.PRECIOS_MODELOS_JSON;
  if (!crudo) return TABLA_BASE;
  try {
    const parseado = JSON.parse(crudo);
    if (!parseado || typeof parseado !== "object" || Array.isArray(parseado)) return TABLA_BASE;
    const limpio: Record<string, PrecioDeModelo> = {};
    for (const [modelo, p] of Object.entries(parseado as Record<string, unknown>)) {
      const v = p as { entrada?: unknown; salida?: unknown };
      // Un precio mal escrito se ignora en vez de convertirse en NaN. Un NaN
      // acá se propaga hasta el total y lo vuelve ilegible sin decir por qué.
      if (typeof v?.entrada === "number" && typeof v?.salida === "number") {
        if (Number.isFinite(v.entrada) && Number.isFinite(v.salida) && v.entrada >= 0 && v.salida >= 0) {
          limpio[modelo] = { entrada: v.entrada, salida: v.salida };
        }
      }
    }
    return { ...TABLA_BASE, ...limpio };
  } catch {
    // Un JSON roto en Vercel no puede tumbar el costeo entero.
    return TABLA_BASE;
  }
}

export type CostoDeLaLlamada = {
  /** USD, o `null` si el modelo no está en la tabla. NUNCA 0 por desconocido. */
  usd: number | null;
  conocido: boolean;
};

export function costoDeLaLlamada(
  modelo: string,
  tokensEntrada: number,
  tokensSalida: number,
  env: NodeJS.ProcessEnv = process.env,
): CostoDeLaLlamada {
  const precio = tablaDePrecios(env)[modelo];
  if (!precio) return { usd: null, conocido: false };

  const entrada = Math.max(0, tokensEntrada) / 1_000_000;
  const salida = Math.max(0, tokensSalida) / 1_000_000;
  return { usd: entrada * precio.entrada + salida * precio.salida, conocido: true };
}

/** `true` si la tabla ya tiene edad como para volver a verificarla. */
export function convieneRevisarLosPrecios(ahora: Date = new Date()): boolean {
  const verificado = new Date(`${PRECIOS_VERIFICADOS_EL}T00:00:00Z`).getTime();
  const dias = (ahora.getTime() - verificado) / 86_400_000;
  return dias > DIAS_ANTES_DE_REVISAR;
}
