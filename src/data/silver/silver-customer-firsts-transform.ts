// ══════════════════════════════════════════════════════════════════════════
// Transform Silver → Silver: silver_customer_firsts — tanda 3 de metrics/orders
// ══════════════════════════════════════════════════════════════════════════
// Dim de primera orden por cliente. Reemplaza el LATERAL correlacionado de la
// query de cohorts (MIN("orderDate") por cliente sobre toda la historia, POR
// REQUEST) por un JOIN a esta tabla precomputada.
//
// Semántica (paridad con el Bronze): MIN(order_date) sobre TODAS las órdenes
// del cliente, SIN filtro de status — el LATERAL original tampoco filtraba
// (una orden cancelada también marca la "primera vez"). silver_orders copia
// todas las órdenes (los flags is_valid/is_web son columnas, no filtros), así
// que leer de Silver preserva esa semántica.
//
// Incremental seguro: ON CONFLICT ... LEAST(existente, nuevo) → procesar solo
// una ventana reciente nunca puede pisar una primera-fecha histórica con una
// más nueva. Backfill = sin filtro de fecha.
//
// LIMITACIÓN conocida: si se BORRA la primera orden de un cliente (raro), la
// dim queda con la fecha vieja hasta un backfill. El LATERAL en vivo sí lo
// reflejaría. Mismo tradeoff que el resto de Medallion.
// ══════════════════════════════════════════════════════════════════════════

function buildUpsert(whereRows: string): string {
  return `
INSERT INTO silver_customer_firsts (
  organization_id, customer_id, first_order_date, silver_updated_at
)
SELECT
  s.organization_id,
  s.customer_id,
  MIN(s.order_date) AS first_order_date,
  now()
FROM silver_orders s
WHERE s.customer_id IS NOT NULL${whereRows}
GROUP BY s.organization_id, s.customer_id
ON CONFLICT (organization_id, customer_id) DO UPDATE SET
  first_order_date = LEAST(silver_customer_firsts.first_order_date, EXCLUDED.first_order_date),
  silver_updated_at = now();`.trim();
}

/**
 * Incremental: procesa clientes con órdenes desde $2 (ISO timestamptz), por org ($1).
 * Ejecutar: prisma.$executeRawUnsafe(buildCustomerFirstsUpsert(), orgId, sinceISO).
 * LEAST() garantiza que la ventana no pise fechas históricas.
 */
export function buildCustomerFirstsUpsert(): string {
  return buildUpsert(`\n  AND s.organization_id = $1\n  AND s.order_date >= $2::timestamptz`);
}

/** Backfill inicial: toda la historia, TODAS las orgs. Correr una vez en Neon (sin parámetros). */
export function buildCustomerFirstsBackfill(): string {
  return buildUpsert("");
}
