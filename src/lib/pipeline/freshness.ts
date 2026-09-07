// ══════════════════════════════════════════════════════════════════════════
// Frescura de las tablas del pipeline (Silver / Gold / rollups del pixel)
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE (auditoría 2026-07-21, hallazgo A2):
//   Había UN chequeo de frescura, sobre `pixel_daily_aggregates`, construido
//   después de que ese rollup estuviera caído 5 días en junio sin que nadie lo
//   notara. La lección no se transfirió: las 6 tablas Silver/Gold que hoy
//   respaldan el header de revenue no tenían NINGÚN monitoreo.
//
//   El mismo día se descubrió que `refresh-pixel-first-source` llevaba CINCO
//   SEMANAS desagendado (removido de vercel.json el 14-jun y nunca repuesto).
//   La dimensión quedó congelada, `metrics/pixel` perdió del breakdown por canal
//   a todo visitante nuevo, y la brecha creció todos los días. Nadie se enteró
//   porque nada mira si estas tablas se están actualizando.
//
//   El patrón del fallo no es "el cron explota" —eso se ve en los logs— sino
//   "el cron deja de existir". Un cron que no corre no falla: simplemente no
//   pasa nada, y los números se van quedando viejos en silencio.
//
// CÓMO SE USA: `checkPipelineFreshness` devuelve las tablas atrasadas. El caller
// decide qué hacer (log, mail, status). No manda mails ni tira excepciones: es
// una consulta, no una política.
// ══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";

export interface FreshnessTarget {
  /** Nombre de la tabla. Va interpolado, así que NO puede venir de input externo. */
  table: string;
  /** Columna timestamptz que el transform pisa en cada corrida. */
  column: string;
  /** A partir de cuántas horas sin refrescar se considera atrasada. */
  maxHours: number;
  /** Para el mensaje: qué cron debería estar refrescándola. */
  refreshedBy: string;
  /**
   * De dónde sale la data de esta tabla.
   *
   * ⚠️ SIN ESTO, EL CHEQUEO POR ORGANIZACIÓN ALERTA PARA SIEMPRE (revisión del
   * 2026-09-07). Todos los upserts del pipeline filtran por ventana:
   * `... FROM orders WHERE "organizationId" = $1 AND "orderDate" >= $2`. Si un
   * cliente no vendió nada en tres días, ese upsert afecta CERO filas y
   * `silver_updated_at` de sus filas viejas no se mueve. El cron corrió, hizo
   * exactamente lo que tenía que hacer, y el chequeo lo reporta atrasado.
   *
   * El chequeo global viejo tapaba esto (un solo `MAX` sobre toda la tabla), y
   * al agruparlo por organización quedó a la vista: **cada cliente tranquilo
   * genera una alerta permanente**. Con clientes chicos entrando, la casilla se
   * llena de ruido el primer día y a la semana nadie mira más los mails — que
   * es peor que no tener el chequeo, porque encima da sensación de cobertura.
   *
   * Con la fuente, el criterio pasa a ser el correcto: una tabla derivada está
   * atrasada si su fuente tiene algo MÁS NUEVO que ella. Sin nada nuevo arriba,
   * no hay nada que refrescar abajo.
   */
  fuente?: { tabla: string; columna: string };
}

/**
 * Las fuentes de cada capa. La regla es que la fuente tiene que ser BARATA de
 * agrupar por organizacion: esto corre dentro de `warm-cache`, no puede
 * costar mas que el trabajo que vigila.
 *
 * Por eso `pixel_events` NO es la fuente de los rollups aunque lo sea de
 * verdad: no hay indice por `receivedAt` y es la tabla mas grande de todas, o
 * sea justo la query que se cuelga. Se usa `pixel_daily_aggregates`, que es
 * chica, la refresca el mismo cron y ya es el centinela historico del
 * pipeline. Si `aggregates` se movio para una org y `source` no, eso es un
 * atraso real; si no se movio ninguna, esa org no tuvo trafico.
 *
 * `pixel_daily_aggregates` se queda SIN fuente a proposito: alguien tiene que
 * ser el canario y medirse contra el reloj y nada mas.
 */
const FUENTE_ORDENES = { tabla: "orders", columna: "updatedAt" } as const;
const FUENTE_SILVER = { tabla: "silver_orders", columna: "silver_updated_at" } as const;
const FUENTE_ATRIBUCIONES = { tabla: "pixel_attributions", columna: "createdAt" } as const;
const FUENTE_ROLLUPS = { tabla: "pixel_daily_aggregates", columna: "refreshed_at" } as const;
/**
 * Qué se vigila y con qué tolerancia.
 *
 * Los umbrales son ~3× la cadencia del cron: suficiente para absorber una
 * corrida perdida o un deploy, y bajo para que un cron desagendado se note el
 * mismo día en vez de a las cinco semanas.
 */
export const PIPELINE_FRESHNESS_TARGETS: readonly FreshnessTarget[] = [
  // Silver — refresh-silver-orders, cada 30 min
  { table: "silver_orders", column: "silver_updated_at", maxHours: 3, refreshedBy: "refresh-silver-orders", fuente: FUENTE_ORDENES },
  { table: "silver_customer_firsts", column: "silver_updated_at", maxHours: 3, refreshedBy: "refresh-silver-orders", fuente: FUENTE_ORDENES },
  // Gold de órdenes — refresh-gold-daily-revenue
  { table: "gold_daily_revenue", column: "gold_updated_at", maxHours: 6, refreshedBy: "refresh-gold-daily-revenue", fuente: FUENTE_SILVER },
  { table: "gold_order_segments", column: "gold_updated_at", maxHours: 6, refreshedBy: "refresh-gold-daily-revenue", fuente: FUENTE_SILVER },
  { table: "gold_product_sales", column: "gold_updated_at", maxHours: 6, refreshedBy: "refresh-gold-daily-revenue", fuente: FUENTE_SILVER },
  { table: "gold_customer_daily", column: "gold_updated_at", maxHours: 6, refreshedBy: "refresh-gold-daily-revenue", fuente: FUENTE_SILVER },
  // Gold de atribución — refresh-gold-attribution
  { table: "gold_attribution_source", column: "gold_updated_at", maxHours: 6, refreshedBy: "refresh-gold-attribution", fuente: FUENTE_ATRIBUCIONES },
  { table: "gold_attribution_channel", column: "gold_updated_at", maxHours: 6, refreshedBy: "refresh-gold-attribution-channel", fuente: FUENTE_ATRIBUCIONES },
  // Rollups del pixel — refresh-pixel-rollups. Se vigilan TODOS y no sólo
  // `aggregates` (ampliado 2026-07-21): el cron corre 7 statements y cada uno
  // puede fallar por separado sin tumbar los demás. Con un solo centinela, un
  // fallo aislado —justo el de `source`, que alimenta el breakdown por canal—
  // quedaba invisible mientras `aggregates` se refrescaba puntual.
  //
  // maxHours=8 (recalibrado 2026-08-19, BP-ROLLUP-STUCK): el cron pasó a rotar
  // UNA tabla por invocación (cada 15 min → ciclo completo de 7 tablas ≈ 1.75h).
  // El costo de recuperación tras un skip de Vercel es alto: edad pre-skip ~1.75h
  // + gap observado ~2.3h + hasta ~1.75h de ciclo hasta re-tocar esa tabla ≈ 5.8h.
  // A 5h eso disparaba mail falso (el incidente); 8h tolera un skip + un ciclo de
  // recuperación y SIGUE detectando un cron desagendado el mismo día. NO subir más
  // sin bajar también la cadencia — 8h es el techo antes de perder señal útil.
  { table: "pixel_daily_aggregates", column: "refreshed_at", maxHours: 8, refreshedBy: "refresh-pixel-rollups" },
  { table: "pixel_daily_source", column: "refreshed_at", maxHours: 8, refreshedBy: "refresh-pixel-rollups", fuente: FUENTE_ROLLUPS },
  { table: "pixel_daily_funnel_by_source", column: "refreshed_at", maxHours: 8, refreshedBy: "refresh-pixel-rollups", fuente: FUENTE_ROLLUPS },
  { table: "pixel_daily_device", column: "refreshed_at", maxHours: 8, refreshedBy: "refresh-pixel-rollups", fuente: FUENTE_ROLLUPS },
  { table: "pixel_daily_product", column: "refreshed_at", maxHours: 8, refreshedBy: "refresh-pixel-rollups", fuente: FUENTE_ROLLUPS },
  { table: "pixel_daily_type", column: "refreshed_at", maxHours: 8, refreshedBy: "refresh-pixel-rollups", fuente: FUENTE_ROLLUPS },
  { table: "pixel_daily_page", column: "refreshed_at", maxHours: 8, refreshedBy: "refresh-pixel-rollups", fuente: FUENTE_ROLLUPS },
];

export interface FreshnessRow {
  table: string;
  refreshedBy: string;
  /** null = la tabla no existe todavía, o está vacía. */
  hoursStale: number | null;
  lastRefresh: string | null;
  stale: boolean;
  /** true = la tabla no existe (aún no se corrió su runbook). No es una alerta. */
  missing: boolean;
  /**
   * Las organizaciones atrasadas EN ESTA TABLA, con su atraso en horas.
   *
   * Vacío puede significar dos cosas distintas: que ninguna está atrasada, o
   * que no se pudo agrupar por organización (ver `porOrg`).
   */
  orgsStale?: Array<{ org: string; hours: number }>;
  /**
   * `true` si el chequeo se hizo POR ORGANIZACIÓN. `false` = se cayó al modo
   * global viejo porque no se encontró la columna de organización.
   */
  porOrg?: boolean;
  /**
   * El chequeo no se pudo hacer, y NO es porque la tabla no exista.
   *
   * ⚠️ ESTO ES LA DIFERENCIA ENTRE "NO HAY PROBLEMA" Y "NO SÉ" (revisión del
   * 2026-09-07). Antes había un `catch {}` que marcaba todo como `missing:
   * true`, o sea "el runbook está pendiente, no es una alerta". Cualquier
   * `statement_timeout`, cualquier permiso, cualquier error de sintaxis en la
   * query nueva por organización caía ahí y salía por la puerta de "todo bien".
   *
   * Es el peor modo de falla posible para un módulo de monitoreo: el chequeo
   * que existe para avisar que algo dejó de correr se rompe, y lo que reporta
   * es silencio. Y es exactamente lo que pasó con la query agrupada nueva, que
   * es bastante más cara que el `MAX` de antes.
   */
  error?: string;
  /**
   * Organizaciones que están viejas pero cuya fuente TAMPOCO se movió: no hay
   * nada que refrescar. No cuentan como atraso. Se reportan igual porque
   * "quince clientes quietos" es un dato en sí mismo.
   */
  orgsSinNovedad?: number;
}

/** `true` si el error de Postgres es "la relación no existe" (42P01). */
function esTablaAusente(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message || e);
  return msg.includes("42P01") || /relation .* does not exist/i.test(msg);
}

export type FilaDeOrg = { org: string; hours: number; last: Date | null };

/**
 * Qué organizaciones están REALMENTE atrasadas en una tabla.
 *
 * El criterio tiene dos partes y las dos importan:
 *
 *   1. pasó el umbral de horas;
 *   2. y su fuente tiene algo más nuevo que ella.
 *
 * Sin (2), todo cliente tranquilo alerta para siempre (ver `fuente` en
 * `FreshnessTarget`). Con (2) de más, se perdería la señal cuando la fuente
 * misma se cae — por eso, si de la fuente no se sabe nada, se alerta igual:
 * **ante la duda esto hace ruido, nunca silencio.** Un chequeo de frescura que
 * prefiere callarse no sirve para nada.
 *
 * Es una función aparte de la query para poder probar el criterio, que es la
 * parte que se rompe.
 */
export function orgsRealmenteAtrasadas(
  filas: readonly FilaDeOrg[],
  maxHours: number,
  /** org → última marca de la fuente. `null` = no hay fuente, o no se pudo leer. */
  fuentePorOrg: ReadonlyMap<string, Date> | null,
): {
  atrasadas: Array<{ org: string; hours: number }>;
  sinNovedad: number;
  /**
   * El atraso de la organización PEOR **entre las que tienen algo que
   * refrescar**. `null` si ninguna lo tiene.
   *
   * ⚠️ ESTE NÚMERO NO ES COSMÉTICO. `maybeSelfHealRollups` en `warm-cache` lo
   * usa para decidir si dispara una corrida extra de `refresh-pixel-rollups`
   * (umbral 2.5 h, cooldown 4 min), y esa corrida es un escaneo HLL de ~190 s
   * sobre una tabla de 43 GB. Si acá saliera el máximo sobre TODAS las orgs,
   * un solo cliente dormido —cuya marca puede ser de hace meses— dejaría ese
   * escaneo disparándose cada cuatro minutos, para siempre, desalojando de la
   * RAM de Neon justo las páginas que el dashboard necesita. El síntoma sería
   * "la app está lenta", no "hay una alerta".
   */
  peorConTrabajo: number | null;
} {
  const viejas = filas.filter((f) => f.hours > maxHours);
  const peor = (xs: ReadonlyArray<{ hours: number }>) =>
    xs.length > 0 ? Math.max(...xs.map((x) => x.hours)) : null;

  if (!fuentePorOrg) {
    // Sin saber nada de las fuentes, toda la tabla cuenta como trabajo
    // pendiente: ante la duda esto hace ruido, nunca silencio.
    const todas = filas.map((f) => ({ org: f.org, hours: f.hours }));
    return {
      atrasadas: viejas.map((f) => ({ org: f.org, hours: f.hours })),
      sinNovedad: 0,
      peorConTrabajo: peor(todas),
    };
  }

  const atrasadas: Array<{ org: string; hours: number }> = [];
  let sinNovedad = 0;
  // Las que todavía no pasaron el umbral pero sí tienen datos nuevos pendientes:
  // no son alerta, pero son trabajo real y cuentan para el self-heal.
  const conTrabajo: Array<{ hours: number }> = [];

  const tieneNovedad = (f: FilaDeOrg): boolean => {
    const fuente = fuentePorOrg.get(f.org);
    // La fuente no tiene NADA de esta org: no hay nada que refrescar. Pasa con
    // un cliente recién dado de alta cuyo backfill todavía no trajo órdenes.
    if (!fuente) return false;
    // La fuente tampoco se movió desde el último refresco: al día.
    if (f.last && fuente <= f.last) return false;
    return true;
  };

  for (const f of filas) {
    if (!tieneNovedad(f)) {
      if (f.hours > maxHours) sinNovedad++;
      continue;
    }
    conTrabajo.push({ hours: f.hours });
    if (f.hours > maxHours) atrasadas.push({ org: f.org, hours: f.hours });
  }
  return { atrasadas, sinNovedad, peorConTrabajo: peor(conTrabajo) };
}

/**
 * Las tablas del pipeline usan DOS convenciones para la columna de
 * organización: los rollups del pixel tienen `"organizationId"` (camelCase,
 * creada por `setup-pixel-rollups`) y Silver/Gold tienen `organization_id`
 * (snake, de los `.schema.sql`).
 *
 * Se DETECTA en vez de hardcodear: una lista escrita a mano se desincroniza en
 * silencio cuando se agrega una tabla, y el modo de falla sería que el chequeo
 * vuelva a ser global sin que nadie lo note — o sea el bug que esto arregla,
 * de vuelta.
 */
async function columnasDeOrg(tablas: readonly string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (tablas.length === 0) return mapa;
  try {
    const filas = await prisma.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name IN ('organization_id', 'organizationId')
          AND table_name = ANY($1::text[])`,
      tablas,
    );
    for (const f of filas) mapa.set(f.table_name, f.column_name);
  } catch {
    // Sin esto se cae al modo global, que es el comportamiento anterior.
  }
  return mapa;
}

/**
 * Última marca de cada fuente, por organización.
 *
 * Se consulta UNA vez por fuente distinta y no una por tabla vigilada: cuatro
 * fuentes cubren las quince tablas. Si una falla, esa fuente queda en `null` y
 * las tablas que dependen de ella vuelven al criterio de sólo-reloj — ruidoso,
 * pero nunca ciego.
 */
async function marcasDeLasFuentes(
  targets: readonly FreshnessTarget[],
): Promise<Map<string, Map<string, Date> | null>> {
  const fuentes = new Map<string, { tabla: string; columna: string }>();
  for (const t of targets) {
    if (t.fuente) fuentes.set(`${t.fuente.tabla}.${t.fuente.columna}`, t.fuente);
  }
  const orgCols = await columnasDeOrg([...fuentes.values()].map((f) => f.tabla));

  const out = new Map<string, Map<string, Date> | null>();
  for (const [clave, f] of fuentes) {
    const orgCol = orgCols.get(f.tabla);
    if (!orgCol) {
      out.set(clave, null);
      continue;
    }
    try {
      const filas = await prisma.$queryRawUnsafe<Array<{ org: string; last: Date | null }>>(
        `SELECT "${orgCol}" AS org, MAX("${f.columna}") AS last
           FROM ${f.tabla}
          GROUP BY 1`,
      );
      const m = new Map<string, Date>();
      for (const fila of filas) {
        if (fila.last) m.set(String(fila.org), new Date(fila.last));
      }
      out.set(clave, m);
    } catch (e) {
      // Una fuente que no se puede leer no puede silenciar el chequeo de las
      // tablas que dependen de ella. `null` = volvé al criterio de sólo-reloj.
      if (!esTablaAusente(e)) {
        console.error(`[freshness] no se pudo leer la fuente ${clave}:`, e);
      }
      out.set(clave, null);
    }
  }
  return out;
}

/**
 * Mide el atraso de cada tabla. Una tabla inexistente NO cuenta como atrasada:
 * hay tablas cuyo runbook todavía no se corrió y no queremos alertar por eso.
 * Cada tabla se consulta por separado a propósito: si una no existe, las demás
 * igual se miden (un UNION fallaría entero).
 */
export async function checkPipelineFreshness(
  targets: readonly FreshnessTarget[] = PIPELINE_FRESHNESS_TARGETS
): Promise<FreshnessRow[]> {
  // E-19 — POR QUÉ ESTO AHORA AGRUPA POR ORGANIZACIÓN.
  //
  // Era `SELECT MAX(columna) FROM tabla`, SIN `WHERE` y sin `GROUP BY`. O sea
  // que medía la tabla entera: con 20 clientes, si 19 refrescan bien y uno queda
  // congelado, `MAX` sigue siendo de hace 10 minutos y **el chequeo da verde**.
  //
  // La detección se diluía exactamente en proporción al crecimiento: cuantos más
  // clientes, menos probable que un cliente roto se note. Agrupando, el chequeo
  // **se afila** con cada cliente nuevo en vez de embotarse.
  //
  // Si no se encuentra la columna de organización se cae al modo global, que es
  // el comportamiento anterior — degradar es preferible a no medir nada.
  const orgCols = await columnasDeOrg(targets.map((t) => t.table));
  const marcas = await marcasDeLasFuentes(targets);

  const out: FreshnessRow[] = [];
  for (const t of targets) {
    const orgCol = orgCols.get(t.table);
    const fuentePorOrg = t.fuente
      ? (marcas.get(`${t.fuente.tabla}.${t.fuente.columna}`) ?? null)
      : null;
    try {
      if (orgCol) {
        const filas = await prisma.$queryRawUnsafe<
          Array<{ org: string; last: Date | null; hours: number | null }>
        >(
          `SELECT "${orgCol}" AS org,
                  MAX("${t.column}") AS last,
                  EXTRACT(EPOCH FROM (NOW() - MAX("${t.column}")))/3600 AS hours
             FROM ${t.table}
            GROUP BY 1`,
        );
        const conHoras = filas
          .map((f) => ({
            org: String(f.org),
            hours: f.hours != null ? Math.round(Number(f.hours) * 10) / 10 : null,
            last: f.last,
          }))
          .filter((f) => f.hours != null) as Array<{ org: string; hours: number; last: Date | null }>;

        // Una organización vieja NO está atrasada si su fuente tampoco se
        // movió: un cliente sin ventas hace cuatro días no tiene nada que
        // refrescar. Ver `fuente` en `FreshnessTarget`.
        const { atrasadas, sinNovedad, peorConTrabajo } = orgsRealmenteAtrasadas(
          conHoras,
          t.maxHours,
          fuentePorOrg,
        );
        // El "atraso de la tabla" pasa a ser el de la organización PEOR, no el
        // de la mejor. Con el MAX global era literalmente al revés.
        //
        // Y sale de las que TIENEN algo que refrescar: un cliente que dejó de
        // vender hace seis meses tiene la marca más vieja de todas, y decir
        // "sin refrescar hace 4.300h" manda a buscar el problema al lugar
        // equivocado — además de disparar el self-heal de warm-cache en loop.
        const peor = peorConTrabajo;
        const masReciente = conHoras.reduce<Date | null>(
          (acc, f) => (f.last && (!acc || f.last > acc) ? f.last : acc),
          null,
        );

        out.push({
          table: t.table,
          refreshedBy: t.refreshedBy,
          hoursStale: peor,
          lastRefresh: masReciente ? new Date(masReciente).toISOString() : null,
          stale: atrasadas.length > 0,
          missing: false,
          orgsStale: atrasadas,
          orgsSinNovedad: sinNovedad,
          porOrg: true,
        });
        continue;
      }

      const r = await prisma.$queryRawUnsafe<Array<{ last: Date | null; hours: number | null }>>(
        `SELECT MAX("${t.column}") AS last,
                EXTRACT(EPOCH FROM (NOW() - MAX("${t.column}")))/3600 AS hours
         FROM ${t.table}`
      );
      const hours = r?.[0]?.hours != null ? Math.round(Number(r[0].hours) * 10) / 10 : null;
      const last = r?.[0]?.last ? new Date(r[0].last).toISOString() : null;
      out.push({
        table: t.table,
        refreshedBy: t.refreshedBy,
        hoursStale: hours,
        lastRefresh: last,
        stale: hours != null && hours > t.maxHours,
        missing: false,
        porOrg: false,
      });
    } catch (e) {
      // ⚠️ "LA TABLA NO EXISTE" Y "NO PUDE MEDIR" NO SON LO MISMO.
      // Antes esto era un `catch {}` que marcaba todo como `missing: true`, o
      // sea "no es una alerta". Un `statement_timeout` de la query agrupada
      // —que es bastante más cara que el `MAX` de antes— salía por ahí y el
      // chequeo reportaba silencio. El módulo que existe para avisar que algo
      // dejó de correr se rompía y decía que todo estaba bien.
      const ausente = esTablaAusente(e);
      if (!ausente) {
        console.error(`[freshness] no se pudo medir ${t.table}:`, e);
      }
      out.push({
        table: t.table,
        refreshedBy: t.refreshedBy,
        hoursStale: null,
        lastRefresh: null,
        // Un chequeo que no se puede hacer ES un problema, y se reporta como
        // tal. Sólo la tabla ausente sigue siendo el caso benigno de siempre
        // (hay runbooks pendientes a propósito).
        stale: !ausente,
        missing: ausente,
        error: ausente ? undefined : String((e as { message?: string })?.message || e).slice(0, 300),
      });
    }
  }
  return out;
}

/** Resumen de una línea por tabla atrasada, para log o cuerpo de mail. */
export function formatStaleSummary(rows: FreshnessRow[]): string {
  return rows
    .filter((r) => r.stale)
    .map((r) => {
      // El chequeo se rompió. Decirlo con todas las letras: si esto se
      // confundiera con un atraso normal, alguien iría a mirar el cron
      // equivocado.
      if (r.error) {
        return `${r.table}: NO SE PUDO MEDIR LA FRESCURA (${r.error}) — el chequeo está ciego para esta tabla`;
      }
      const base = `${r.table}: sin refrescar hace ${r.hoursStale}h (último: ${r.lastRefresh}) — lo refresca ${r.refreshedBy}`;
      // Cuáles clientes, no sólo "la tabla". Con el MAX global no se sabía.
      if (r.orgsStale && r.orgsStale.length > 0) {
        const orgs = r.orgsStale
          .slice(0, 5)
          .map((o) => `${o.org} (${o.hours}h)`)
          .join(", ");
        const resto = r.orgsStale.length > 5 ? ` y ${r.orgsStale.length - 5} más` : "";
        return `${base}\n    orgs atrasadas: ${orgs}${resto}`;
      }
      return base;
    })
    .join("\n");
}
