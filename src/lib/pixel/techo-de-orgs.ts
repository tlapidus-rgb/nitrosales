// ══════════════════════════════════════════════════════════════════════════
// src/lib/pixel/techo-de-orgs.ts — cuántos clientes aguanta el pipeline
// ══════════════════════════════════════════════════════════════════════════
// La pregunta que todo el plan de expansión viene contestando de memoria.
// Hasta hoy circulaban TRES números distintos, y ninguno estaba medido:
//
//   · **8-10** — del estudio de escalabilidad. **Mal calculado**: tomó el
//     auto-límite de 250s como pared dura cuando `maxDuration` es 800s.
//     Corregido el mismo día que se escribió.
//   · **50-77** — la corrección. Es la pared donde una unidad de trabajo no
//     entra ni en 800s. Sigue siendo aritmética, no medición.
//   · **~10 orgs chicas, o 2 tamaño Arredo** — la tabla del propio estudio, y
//     el más pesimista de los tres. Venía de que la unidad de trabajo era
//     **indivisible**: si un día-tabla no entraba en el presupuesto, no entraba
//     nunca. **Eso es lo que E-01 arregló**, así que ese techo ya no aplica tal
//     cual — ahora el trabajo se reparte entre invocaciones.
//
// Con E-01 puesto, el límite deja de ser "¿entra la unidad?" y pasa a ser
// "¿alcanza el presupuesto del día?". Esto calcula eso.
//
// ── LO QUE ESTE MÓDULO **NO** CONTESTA ───────────────────────────────────
// Sólo mide el pipeline de rollups. Hay otro techo, más cerca, que esto no ve:
// la cache de Neon. El estudio de aislamiento lo dice medido —working set de
// ~28 GB contra 16 GB de cache, y con 5 orgs grandes >100 GB— y agrega que
// "ninguna cantidad de CU razonable lo arregla". **Ese techo aprieta antes que
// éste**, y bajarlo es E-09 (retención), que está pendiente.
//
// O sea: el número que sale de acá es un techo, no EL techo. Decirlo sin esa
// aclaración sería el mismo error que ya cometimos tres veces con este dato.
// ══════════════════════════════════════════════════════════════════════════

/** Lo que cuesta una org, medido en una corrida real. */
export type CostoDeOrg = {
  org: string;
  ms: number;
};

export type PresupuestoDiario = {
  /** Invocaciones del cron por día. */
  invocacionesPorDia: number;
  /** Presupuesto útil de cada invocación, en ms. */
  presupuestoPorInvocacionMs: number;
  /** Cuántas tablas hay que refrescar (una por invocación, por rotación). */
  tablas: number;
};

export type Techo = {
  /** Segundos de trabajo disponibles por día. */
  presupuestoDiarioMs: number;
  /** Trabajo que pide un día completo con las orgs medidas. */
  demandaDiariaMs: number;
  /** Qué fracción del presupuesto se está usando hoy. 1 = justo al límite. */
  ocupacion: number;
  /** Costo medio de una org, en ms. */
  costoMedioMs: number;
  /** La org más cara y la más barata: la diferencia define qué tan útil es la media. */
  masCaraMs: number;
  masBarataMs: number;
  /**
   * Cuántas orgs MÁS entran, asumiendo que se parecen al promedio medido.
   * `null` si ya está por encima del presupuesto.
   */
  orgsAdicionales: number | null;
  /** Total de orgs que aguantaría, incluyendo las actuales. */
  techoDeOrgs: number;
  /**
   * Cuántas entrarían si todas fueran como la MÁS CARA de las medidas.
   * Es el número que hay que mirar antes de firmar un cliente grande.
   */
  techoSiTodasFueranGrandes: number;
};

export function calcularTecho(costos: CostoDeOrg[], p: PresupuestoDiario): Techo {
  const presupuestoDiarioMs = p.invocacionesPorDia * p.presupuestoPorInvocacionMs;

  // Cada tabla hay que rehacerla para el día que pasó, así que la demanda de un
  // día es la suma de las orgs multiplicada por la cantidad de tablas.
  const sumaPorTabla = costos.reduce((a, c) => a + c.ms, 0);
  const demandaDiariaMs = sumaPorTabla * p.tablas;

  const n = costos.length;
  const costoMedioMs = n === 0 ? 0 : sumaPorTabla / n;
  const msDeCadaUna = costos.map((c) => c.ms);
  const masCaraMs = n === 0 ? 0 : Math.max(...msDeCadaUna);
  const masBarataMs = n === 0 ? 0 : Math.min(...msDeCadaUna);

  const ocupacion = presupuestoDiarioMs === 0 ? Infinity : demandaDiariaMs / presupuestoDiarioMs;

  // Lo que sobra, traducido a orgs del tamaño promedio.
  const sobranteMs = presupuestoDiarioMs - demandaDiariaMs;
  const costoDeUnaOrgPorDia = costoMedioMs * p.tablas;
  const orgsAdicionales =
    sobranteMs < 0 || costoDeUnaOrgPorDia <= 0
      ? sobranteMs < 0
        ? null
        : 0
      : Math.floor(sobranteMs / costoDeUnaOrgPorDia);

  const costoDeUnaGrandePorDia = masCaraMs * p.tablas;

  return {
    presupuestoDiarioMs,
    demandaDiariaMs,
    ocupacion,
    costoMedioMs,
    masCaraMs,
    masBarataMs,
    orgsAdicionales,
    techoDeOrgs: costoDeUnaOrgPorDia <= 0 ? 0 : Math.floor(presupuestoDiarioMs / costoDeUnaOrgPorDia),
    techoSiTodasFueranGrandes:
      costoDeUnaGrandePorDia <= 0 ? 0 : Math.floor(presupuestoDiarioMs / costoDeUnaGrandePorDia),
  };
}

/**
 * Qué tan parecidas son las orgs entre sí.
 *
 * Importa para saber **cuánto vale el promedio**: si la más cara sale 50 veces
 * lo que la más barata, el promedio no describe a nadie y el único techo
 * honesto es el que asume que todas son grandes.
 */
export function dispersion(costos: CostoDeOrg[]): number {
  if (costos.length === 0) return 0;
  const ms = costos.map((c) => c.ms);
  const min = Math.min(...ms);
  return min === 0 ? Infinity : Math.max(...ms) / min;
}
