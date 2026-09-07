// ══════════════════════════════════════════════════════════════════════════
// src/lib/cache/warm-plan.ts — en qué orden calentar la caché
// ══════════════════════════════════════════════════════════════════════════
// E-12. `warm-cache` recorría organización → rango → endpoint, o sea 8 fetches
// por organización (4 rangos × 2 endpoints), con presupuesto para ~11 en total.
// El cron corre cada 5 minutos.
//
// El resultado con 4 clientes: la primera organización se llevaba sus 8, la
// segunda alcanzaba 3, y la tercera y la cuarta **no se calentaban nunca**. Y
// como la query de organizaciones no tenía `ORDER BY`, el orden lo decidía
// Postgres — en la práctica estable, así que siempre eran las mismas las que
// quedaban afuera. Con 20 clientes se calentaría el 7%.
//
// Dos cambios, los dos sin necesidad de guardar estado:
//
//   1. **El rango manda sobre la organización.** Primero "hoy" para TODAS, y
//      recién después "ayer" para todas. Si el presupuesto corta, corta en un
//      rango menos importante para todos y no en "a estos clientes no les tocó
//      nada". Es lo que convierte el truncado de "algunos no existen" en
//      "todos tienen lo que más se mira".
//   2. **La organización rota entre corridas.** El desempate de lo que sí queda
//      truncado se mueve, en vez de castigar siempre a la misma. La rotación
//      sale del reloj, así que no hace falta persistir ningún cursor.
//
// Es pura a propósito: el orden es la parte que hay que poder testear sin
// levantar el cron ni pegarle a la base.
// ══════════════════════════════════════════════════════════════════════════

export type OrgAWarmear = { id: string; name: string; attribution_model: string | null };
export type RangoAWarmear = { label: string; from: string; to: string };

export type TrabajoDeWarm = {
  org: OrgAWarmear;
  range: RangoAWarmear;
  endpoint: string;
};

/** Cada cuánto avanza la rotación. Coincide con el schedule del cron: cada 5 min. */
export const PASO_DE_ROTACION_MS = 5 * 60 * 1000;

/**
 * Índice desde el cual arrancar la vuelta de organizaciones.
 * Deriva del reloj: cada corrida del cron cae en un paso distinto, así que la
 * primera organización va cambiando sin guardar nada en ningún lado.
 */
export function offsetDeRotacion(ahoraMs: number, cuantasOrgs: number): number {
  if (cuantasOrgs <= 0) return 0;
  return Math.floor(ahoraMs / PASO_DE_ROTACION_MS) % cuantasOrgs;
}

/** `[c,d,a,b]` para `rotar([a,b,c,d], 2)`. No muta la entrada. */
export function rotar<T>(xs: readonly T[], offset: number): T[] {
  if (xs.length === 0) return [];
  const o = ((offset % xs.length) + xs.length) % xs.length;
  return [...xs.slice(o), ...xs.slice(0, o)];
}

/**
 * La lista de trabajos, en el orden en que hay que hacerlos.
 *
 * `ranges` viene ya ordenado por importancia (hoy, ayer, 7d, 30d) y ese orden se
 * respeta: es el eje de afuera.
 */
export function planDeWarm(params: {
  orgs: readonly OrgAWarmear[];
  ranges: readonly RangoAWarmear[];
  endpoints: readonly string[];
  ahoraMs: number;
}): TrabajoDeWarm[] {
  const orgsRotadas = rotar(params.orgs, offsetDeRotacion(params.ahoraMs, params.orgs.length));
  const plan: TrabajoDeWarm[] = [];
  for (const range of params.ranges) {
    for (const org of orgsRotadas) {
      for (const endpoint of params.endpoints) {
        plan.push({ org, range, endpoint });
      }
    }
  }
  return plan;
}
