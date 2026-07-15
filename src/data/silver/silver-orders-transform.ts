// ══════════════════════════════════════════════════════════════════════════
// Transform Bronze(orders) → Silver(silver_orders) — Fase 2 (§6.2, §8)
// ══════════════════════════════════════════════════════════════════════════
// Genera el UPSERT incremental e idempotente que llena silver_orders desde
// orders (Bronze), con los flags de negocio pre-computados.
//
// CLAVE anti-drift: is_valid / is_web NO se escriben a mano acá — se generan
// desde el CONTRATO (ordersValidSql / ordersWebSql de @/domains/orders). Si el
// contrato cambia, Silver cambia con él. Es la MISMA definición que usa todo el
// resto de la plataforma → imposible que Silver diga "12" y el dashboard "16".
//
// Incremental: parametrizado por (organizationId, since) → solo reprocesa el
// rango afectado. Idempotente: ON CONFLICT (id) DO UPDATE → correr N veces = igual.
// ══════════════════════════════════════════════════════════════════════════

import { ordersValidSql, ordersWebSql } from "@/domains/orders";

/**
 * SQL del UPSERT incremental Bronze→Silver.
 * Placeholders: $1 = organizationId, $2 = since (ISO timestamptz).
 * Ejecutar con prisma.$executeRawUnsafe(buildSilverOrdersUpsert(), orgId, sinceISO).
 */
export function buildSilverOrdersUpsert(): string {
  const isValid = ordersValidSql("o"); // "o".status NOT IN (...) AND "o"."totalValue" > 0
  const isWeb = ordersWebSql("o"); //     "o"."trafficSource" IS DISTINCT FROM 'Marketplace' AND ...

  return `
INSERT INTO silver_orders (
  id, organization_id, external_id, order_date, status, total_value, currency,
  item_count, pack_id, source, channel, traffic_source, device_type, customer_id,
  is_valid, is_web, is_marketplace, silver_updated_at
)
SELECT
  o.id, o."organizationId", o."externalId", o."orderDate", o.status::text, o."totalValue", o.currency,
  o."itemCount", o."packId", o.source, o.channel, o."trafficSource", o."deviceType", o."customerId",
  (${isValid}) AS is_valid,
  (${isWeb}) AS is_web,
  (NOT (${isWeb})) AS is_marketplace,
  now()
FROM orders o
WHERE o."organizationId" = $1
  AND o."orderDate" >= $2::timestamptz
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  total_value = EXCLUDED.total_value,
  currency = EXCLUDED.currency,
  item_count = EXCLUDED.item_count,
  channel = EXCLUDED.channel,
  traffic_source = EXCLUDED.traffic_source,
  device_type = EXCLUDED.device_type,
  customer_id = EXCLUDED.customer_id,
  is_valid = EXCLUDED.is_valid,
  is_web = EXCLUDED.is_web,
  is_marketplace = EXCLUDED.is_marketplace,
  silver_updated_at = now();`.trim();
}
