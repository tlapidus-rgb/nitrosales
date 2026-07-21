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
  // Rollups del pixel — refresh-pixel-rollups, cada 2h (el que ya se vigilaba)
  // Rollups del pixel — refresh-pixel-rollups, cada 2h.
  // Se vigilan TODOS y no sólo `aggregates` (ampliado 2026-07-21): el cron corre
  // 7 statements y cada uno puede fallar por separado sin tumbar los demás. Con
  // un solo centinela, un fallo aislado —justo el de `source`, que alimenta el
  // breakdown por canal— quedaba invisible mientras `aggregates` se refrescaba
  // puntual. Es la variante barata del mismo agujero que costó la jornada.
  { table: "pixel_daily_aggregates", column: "refreshed_at", maxHours: 5, refreshedBy: "refresh-pixel-rollups" },
  { table: "pixel_daily_source", column: "refreshed_at", maxHours: 5, refreshedBy: "refresh-pixel-rollups" },
  { table: "pixel_daily_funnel_by_source", column: "refreshed_at", maxHours: 5, refreshedBy: "refresh-pixel-rollups" },
  { table: "pixel_daily_device", column: "refreshed_at", maxHours: 5, refreshedBy: "refresh-pixel-rollups" },
  { table: "pixel_daily_product", column: "refreshed_at", maxHours: 5, refreshedBy: "refresh-pixel-rollups" },
  { table: "pixel_daily_type", column: "refreshed_at", maxHours: 5, refreshedBy: "refresh-pixel-rollups" },
  { table: "pixel_daily_page", column: "refreshed_at", maxHours: 5, refreshedBy: "refresh-pixel-rollups" },
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
  const out: FreshnessRow[] = [];
  for (const t of targets) {
    try {
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
