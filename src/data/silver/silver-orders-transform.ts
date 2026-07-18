// ══════════════════════════════════════════════════════════════════════════
// Transform Bronze(orders) → Silver(silver_orders) — Fase 2 (§6.2, §8)
// ══════════════════════════════════════════════════════════════════════════
// Genera el UPSERT que llena silver_orders desde orders (Bronze), con los flags
// de negocio pre-computados.
//
// CLAVE anti-drift: is_valid / is_web NO se escriben a mano acá — se generan
// desde el CONTRATO (ordersValidSql / ordersWebSql de @/domains/orders). Si el
// contrato cambia, Silver cambia con él. Es la MISMA definición que usa todo el
// resto de la plataforma → imposible que Silver diga "12" y el dashboard "16".
//
// Dos modos, mismo SELECT (DRY):
//   - buildSilverOrdersUpsert(): incremental, parametrizado ($1 org, $2 since).
//   - buildSilverOrdersBackfill(): toda la historia / todas las orgs (fill inicial).
// Ambos idempotentes (ON CONFLICT (id) DO UPDATE): correr N veces = mismo estado.
// ══════════════════════════════════════════════════════════════════════════

import { ordersValidSql, ordersWebSql } from "@/domains/orders";

function buildUpsert(whereClause: string): string {
  const isValid = ordersValidSql("o"); // "o".status NOT IN (...) AND "o"."totalValue" > 0
  const isWeb = ordersWebSql("o"); //     "o"."trafficSource" IS DISTINCT FROM 'Marketplace' AND ...

  return `
INSERT INTO silver_orders (
  id, organization_id, external_id, order_date, status, total_value, currency,
  item_count, pack_id, source, channel, traffic_source, device_type, customer_id,
  shipping_cost, discount_value, marketplace_fee,
  real_shipping_cost, delivery_type, shipping_carrier, payment_method,
  device_enriched, traffic_enriched,
  is_valid, is_web, is_marketplace, silver_updated_at
)
SELECT
  o.id, o."organizationId", o."externalId", o."orderDate", o.status::text, o."totalValue", o.currency,
  o."itemCount", o."packId", o.source, o.channel, o."trafficSource", o."deviceType", o."customerId",
  o."shippingCost", o."discountValue", o."marketplaceFee",
  o."realShippingCost", o."deliveryType", o."shippingCarrier", o."paymentMethod",
  -- Enriquecimiento desde NitroPixel (tanda 5c). Espejo EXACTO del COALESCE que
  -- hacían segByDevice/segByTraffic en metrics/orders. La atribución elegida es la
  -- más reciente (igual que el DISTINCT ON ... ORDER BY pa."createdAt" DESC del
  -- Bronze); da igual cuál, los touchpoints son model-independientes.
  COALESCE(o."deviceType", pv."deviceTypes"[1]) AS device_enriched,
  COALESCE(o."trafficSource", att.touchpoints::jsonb->0->>'source') AS traffic_enriched,
  (${isValid}) AS is_valid,
  (${isWeb}) AS is_web,
  (NOT (${isWeb})) AS is_marketplace,
  now()
FROM orders o
LEFT JOIN LATERAL (
  SELECT pa."visitorId", pa.touchpoints
  FROM pixel_attributions pa
  WHERE pa."orderId" = o.id
  ORDER BY pa."createdAt" DESC
  LIMIT 1
) att ON true
LEFT JOIN pixel_visitors pv ON pv.id = att."visitorId"
${whereClause}ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  total_value = EXCLUDED.total_value,
  currency = EXCLUDED.currency,
  item_count = EXCLUDED.item_count,
  channel = EXCLUDED.channel,
  traffic_source = EXCLUDED.traffic_source,
  device_type = EXCLUDED.device_type,
  customer_id = EXCLUDED.customer_id,
  shipping_cost = EXCLUDED.shipping_cost,
  discount_value = EXCLUDED.discount_value,
  marketplace_fee = EXCLUDED.marketplace_fee,
  real_shipping_cost = EXCLUDED.real_shipping_cost,
  delivery_type = EXCLUDED.delivery_type,
  shipping_carrier = EXCLUDED.shipping_carrier,
  payment_method = EXCLUDED.payment_method,
  device_enriched = EXCLUDED.device_enriched,
  traffic_enriched = EXCLUDED.traffic_enriched,
  is_valid = EXCLUDED.is_valid,
  is_web = EXCLUDED.is_web,
  is_marketplace = EXCLUDED.is_marketplace,
  silver_updated_at = now();`.trim();
}

/**
 * UPSERT incremental Bronze→Silver.
 * Placeholders: $1 = organizationId, $2 = since (ISO timestamptz).
 * Ejecutar: prisma.$executeRawUnsafe(buildSilverOrdersUpsert(), orgId, sinceISO).
 */
export function buildSilverOrdersUpsert(): string {
  return buildUpsert(`WHERE o."organizationId" = $1\n  AND o."orderDate" >= $2::timestamptz\n`);
}

/**
 * Backfill inicial: TODA la historia, TODAS las orgs, sin parámetros.
 * Para correr una sola vez en Neon (llenar la tabla recién creada).
 */
export function buildSilverOrdersBackfill(): string {
  return buildUpsert("");
}
