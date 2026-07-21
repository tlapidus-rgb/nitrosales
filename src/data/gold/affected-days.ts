// ══════════════════════════════════════════════════════════════════════════
// Gold — ventana incremental por DÍAS AFECTADOS + borrado de huérfanas
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE (auditoría 2026-07-21, bug B1+B3):
//
//   Los 4 rollups Gold recortaban con `AND s.order_date >= $1`, o sea "los días
//   recientes". Y `silver_orders` se refrescaba con `WHERE o."orderDate" >= $2`.
//   Las dos ventanas miran la FECHA DE LA ORDEN, pero el evento que nos importa
//   —que una orden cambie de estado— no mueve `orderDate`: el webhook de VTEX lo
//   escribe sólo en el bloque `create`, nunca en `update`.
//
//   Consecuencia medida: una orden que se CANCELA o se DEVUELVE 10 días después
//   actualizaba Bronze y NUNCA volvía a entrar a Silver ni a Gold. El revenue
//   sólo podía corregirse hacia arriba. Los transforms lo documentaban como
//   "limitación conocida, mitigar con un rebuild periódico" — ese rebuild no
//   existía en ningún cron.
//
// LA CORRECCIÓN, EN DOS MITADES QUE NO SIRVEN POR SEPARADO:
//
//   1. Silver pasa a mirar `orders."updatedAt"` (ver silver-orders-transform).
//      Así ve los cambios de estado retroactivos. Bonus: también ve las órdenes
//      históricas que inserta el backfill-runner, que antes nacían fuera de la
//      ventana y no llegaban nunca.
//
//   2. Gold recomputa los DÍAS AFECTADOS — los días de las órdenes que Silver
//      tocó desde `$1` — en vez de "los últimos N días". Sin esto, Silver se
//      corrige y Gold sigue sirviendo el número viejo.
//
//   3. Y el borrado de huérfanas deja de ser opcional. Al recomputar un día
//      viejo, si la orden cancelada era la ÚNICA de su bucket (day, source), el
//      upsert simplemente no emite esa fila y la vieja sobrevive con el revenue
//      viejo. Es decir: sin el DELETE, las mitades 1 y 2 no arreglan el caso que
//      motivó todo esto. Por eso van juntas.
//
// CONTRATO DE PARÁMETROS (igual para los 4 rollups):
//   $1 = since        (ISO timestamptz) — desde cuándo mirar `silver_updated_at`
//   $2 = runStartedAt (ISO timestamptz) — sólo en el DELETE de huérfanas
//
// ⚠️ ÍNDICES NECESARIOS (correr a mano en Neon, ver docs):
//   orders (organizationId, "updatedAt")        → la ventana de Silver
//   silver_orders (silver_updated_at)           → el set de días afectados
//   Sin ellos esto hace seq-scan y el cron se cae por tiempo.
// ══════════════════════════════════════════════════════════════════════════

/** Zona canónica del negocio. Fuente única: estaba duplicada en 4 transforms. */
export const AR_TZ = "America/Argentina/Buenos_Aires";

/** Expresión del día del rollup. Tiene que coincidir EXACTO con el GROUP BY. */
export function dayExpr(orderDateExpr: string): string {
  return `(${orderDateExpr} AT TIME ZONE '${AR_TZ}')::date`;
}

/**
 * (organization_id, day) de los días que Silver tocó desde `$1`.
 *
 * `silver_updated_at` se pisa con `now()` en CADA upsert de Silver, así que el
 * set incluye siempre los días recientes (comportamiento viejo preservado) MÁS
 * cualquier día viejo cuya orden haya cambiado.
 */
export function affectedDaysSql(): string {
  return `SELECT sa.organization_id, ${dayExpr("sa.order_date")} AS day
    FROM silver_orders sa
    WHERE sa.silver_updated_at >= $1::timestamptz
    GROUP BY 1, 2`;
}

/**
 * Predicado para el WHERE de un rollup: "esta fila pertenece a un día afectado".
 *
 * Filtra por DÍA COMPLETO, no por fila cambiada, a propósito: el rollup agrega
 * por (org, day, …) y necesita TODAS las filas del día para que el total sea
 * correcto. Filtrar sólo las filas tocadas daría agregados parciales.
 */
export function affectedDaysPredicate(alias: string): string {
  return `\n    AND (${alias}.organization_id, ${dayExpr(
    `${alias}.order_date`
  )}) IN (${affectedDaysSql()})`;
}

/**
 * Borra las filas huérfanas de un rollup, acotado a los días afectados.
 *
 * Cómo se detecta una huérfana: el upsert pone `gold_updated_at = now()` en toda
 * fila que toca. Cualquier fila de un día recomputado que quedó con un
 * `gold_updated_at` ANTERIOR al inicio de la corrida es un bucket que ya no
 * existe. Correr DESPUÉS del upsert y EN LA MISMA TRANSACCIÓN.
 *
 * ⚠️ `$2` (runStartedAt) DEBE salir del reloj de la BASE (`SELECT now()`), no de
 * `new Date()` de la app: `gold_updated_at` lo escribe Postgres, y con skew de
 * reloj en la dirección equivocada este DELETE borraría lo recién insertado.
 */
export function buildDeleteOrphans(table: string): string {
  return `
DELETE FROM ${table} g
WHERE (g.organization_id, g.day) IN (${affectedDaysSql()})
  AND g.gold_updated_at < $2::timestamptz;`.trim();
}
