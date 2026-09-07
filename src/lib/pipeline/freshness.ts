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
}

/**
 * Qué se vigila y con qué tolerancia.
 *
 * Los umbrales son ~3× la cadencia del cron: suficiente para absorber una
 * corrida perdida o un deploy, y bajo para que un cron desagendado se note el
 * mismo día en vez de a las cinco semanas.
 */
export const PIPELINE_FRESHNESS_TARGETS: readonly FreshnessTarget[] = [
  // Silver — refresh-silver-orders, cada 30 min
  { table: "silver_orders", column: "silver_updated_at", maxHours: 3, refreshedBy: "refresh-silver-orders" },
  { table: "silver_customer_firsts", column: "silver_updated_at", maxHours: 3, refreshedBy: "refresh-silver-orders" },
  // Gold de órdenes — refresh-gold-daily-revenue
  { table: "gold_daily_revenue", column: "gold_updated_at", maxHours: 6, refreshedBy: "refresh-gold-daily-revenue" },
  { table: "gold_order_segments", column: "gold_updated_at", maxHours: 6, refreshedBy: "refresh-gold-daily-revenue" },
  { table: "gold_product_sales", column: "gold_updated_at", maxHours: 6, refreshedBy: "refresh-gold-daily-revenue" },
  { table: "gold_customer_daily", column: "gold_updated_at", maxHours: 6, refreshedBy: "refresh-gold-daily-revenue" },
  // Gold de atribución — refresh-gold-attribution
  { table: "gold_attribution_source", column: "gold_updated_at", maxHours: 6, refreshedBy: "refresh-gold-attribution" },
  { table: "gold_attribution_channel", column: "gold_updated_at", maxHours: 6, refreshedBy: "refresh-gold-attribution-channel" },
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
  { table: "pixel_daily_source", column: "refreshed_at", maxHours: 8, refreshedBy: "refresh-pixel-rollups" },
  { table: "pixel_daily_funnel_by_source", column: "refreshed_at", maxHours: 8, refreshedBy: "refresh-pixel-rollups" },
  { table: "pixel_daily_device", column: "refreshed_at", maxHours: 8, refreshedBy: "refresh-pixel-rollups" },
  { table: "pixel_daily_product", column: "refreshed_at", maxHours: 8, refreshedBy: "refresh-pixel-rollups" },
  { table: "pixel_daily_type", column: "refreshed_at", maxHours: 8, refreshedBy: "refresh-pixel-rollups" },
  { table: "pixel_daily_page", column: "refreshed_at", maxHours: 8, refreshedBy: "refresh-pixel-rollups" },
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

  const out: FreshnessRow[] = [];
  for (const t of targets) {
    const orgCol = orgCols.get(t.table);
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

        const atrasadas = conHoras.filter((f) => f.hours > t.maxHours);
        // El "atraso de la tabla" pasa a ser el de la organización PEOR, no el
        // de la mejor. Con el MAX global era literalmente al revés.
        const peor = conHoras.length > 0 ? Math.max(...conHoras.map((f) => f.hours)) : null;
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
          orgsStale: atrasadas.map((f) => ({ org: f.org, hours: f.hours })),
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
    } catch {
      // relation does not exist → runbook pendiente, no es una alerta.
      out.push({
        table: t.table,
        refreshedBy: t.refreshedBy,
        hoursStale: null,
        lastRefresh: null,
        stale: false,
        missing: true,
      });
    }
  }
  return out;
}

/** Resumen de una línea por tabla atrasada, para log o cuerpo de mail. */
export function formatStaleSummary(rows: FreshnessRow[]): string {
  return rows
    .filter((r) => r.stale)
    .map(
      (r) =>
        `${r.table}: sin refrescar hace ${r.hoursStale}h (último: ${r.lastRefresh}) — lo refresca ${r.refreshedBy}`
    )
    .join("\n");
}
