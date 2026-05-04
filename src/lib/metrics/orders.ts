// ══════════════════════════════════════════════════════════════
// src/lib/metrics/orders.ts — SINGLE SOURCE OF TRUTH para "ordenes"
// ══════════════════════════════════════════════════════════════
// Toda la plataforma DEBE usar estos helpers para definir que es una
// "orden valida". Tener queries duplicadas con distintos filtros en
// distintos endpoints fue la causa de que /pixel/analytics mostrara
// 12, 14 y 16 para la misma metrica (ver CLAUDE_STATE.md S60 EXT-2 BIS+++++++).
//
// REGLA: si vas a contar/sumar "ordenes" en cualquier endpoint, importa
// estos helpers. NO copies y pegues filtros SQL ad-hoc.
// ══════════════════════════════════════════════════════════════

import { Prisma } from "@prisma/client";

// ────────────────────────────────────────────────────────────────
// Status canonicos
// ────────────────────────────────────────────────────────────────

/**
 * Status que indican venta concretada (cliente pago, pedido valido, no cancelado).
 *
 * IMPORTANTE: estos valores DEBEN matchear el enum OrderStatus de prisma/schema.prisma.
 * Si agregas status nuevos, primero al enum, despues aca.
 */
export const ORDER_STATUS_CONCRETED = [
  "APPROVED",
  "INVOICED",
  "SHIPPED",
  "DELIVERED",
] as const;

/** Status que indican venta NO concretada o invalida (no contar como venta real). */
export const ORDER_STATUS_NOT_CONCRETED = [
  "CANCELLED",
  "PENDING",
  "RETURNED",
] as const;

// ────────────────────────────────────────────────────────────────
// SQL fragments para inyectar en queries crudas
// ────────────────────────────────────────────────────────────────

/**
 * Filtros que definen "orden VALIDA" (concretada, valor > 0).
 *
 * Asume que la tabla orders tiene alias `o`. Si tu query no lo usa,
 * pasale el alias correcto via `aliasOrders`.
 *
 * Aplicar en WHERE de cualquier query que cuente ordenes.
 */
export function ordersValidWhere(aliasOrders: string = "o") {
  const a = Prisma.raw(`"${aliasOrders}"`);
  return Prisma.sql`
    ${a}.status NOT IN ('CANCELLED', 'PENDING', 'RETURNED')
    AND ${a}."totalValue" > 0
  `;
}

/**
 * Filtros adicionales que definen "orden WEB" (no marketplace).
 * Usar EN COMBINACION con ordersValidWhere().
 *
 * Excluye:
 *   - VTEX con channel='marketplace' (ej: VTEX listado en MercadoLibre via SellerCenter)
 *   - VTEX con trafficSource='Marketplace'
 *   - VTEX con externalId que empieza con FVG- o BPR- (ordenes generadas por marketplaces)
 *   - Source MELI (mercadolibre directo)
 */
export function ordersWebWhere(aliasOrders: string = "o") {
  const a = Prisma.raw(`"${aliasOrders}"`);
  return Prisma.sql`
    ${a}."trafficSource" IS DISTINCT FROM 'Marketplace'
    AND ${a}.source IS DISTINCT FROM 'MELI'
    AND ${a}.channel IS DISTINCT FROM 'marketplace'
    AND ${a}."externalId" NOT LIKE 'FVG-%'
    AND ${a}."externalId" NOT LIKE 'BPR-%'
  `;
}

/**
 * Filtros combinados: orden valida Y web. Equivale a:
 *   ordersValidWhere() AND ordersWebWhere()
 */
export function ordersValidWebWhere(aliasOrders: string = "o") {
  return Prisma.sql`
    ${ordersValidWhere(aliasOrders)}
    AND ${ordersWebWhere(aliasOrders)}
  `;
}

// ────────────────────────────────────────────────────────────────
// Helpers JS (cuando no podes inyectar SQL)
// ────────────────────────────────────────────────────────────────

export function isOrderConcreted(status: string | null | undefined): boolean {
  if (!status) return false;
  return !ORDER_STATUS_NOT_CONCRETED.includes(status as any);
}

export function isOrderWeb(order: {
  source?: string | null;
  channel?: string | null;
  trafficSource?: string | null;
  externalId?: string | null;
}): boolean {
  if (order.source === "MELI") return false;
  if (order.channel === "marketplace") return false;
  if (order.trafficSource === "Marketplace") return false;
  const eid = String(order.externalId || "");
  if (eid.startsWith("FVG-")) return false;
  if (eid.startsWith("BPR-")) return false;
  return true;
}

export function isOrderValidWeb(order: {
  status?: string | null;
  totalValue?: number | string | null;
  source?: string | null;
  channel?: string | null;
  trafficSource?: string | null;
  externalId?: string | null;
}): boolean {
  if (!isOrderConcreted(order.status)) return false;
  if (Number(order.totalValue || 0) <= 0) return false;
  return isOrderWeb(order);
}

// ────────────────────────────────────────────────────────────────
// Field de fecha canonico
// ────────────────────────────────────────────────────────────────

/**
 * Campo de fecha canonico para filtrar "ordenes en un rango".
 *
 * SIEMPRE usar `orderDate` (cuando se hizo la compra) en vez de
 * `createdAt` (cuando se sincronizo a nuestra DB). El sync puede tener
 * lag de minutos a horas; orderDate es la verdad de negocio.
 */
export const ORDER_DATE_FIELD = "orderDate";

// ────────────────────────────────────────────────────────────────
// Match de externalId con sufijo
// ────────────────────────────────────────────────────────────────

/**
 * VTEX a veces guarda el externalId con sufijo "-01" y el pixel
 * dispara el evento PURCHASE con o sin sufijo. Para matchear hay que
 * probar ambas variantes.
 *
 * Devuelve un fragmento SQL que matchea externalId con o sin -01:
 *   externalId = ${eventOrderId} OR externalId = ${eventOrderId}-01
 */
export function externalIdMatchesEvent(eventOrderId: string) {
  return Prisma.sql`
    ("externalId" = ${eventOrderId}
     OR "externalId" = ${eventOrderId + "-01"}
     OR "externalId" = ${String(eventOrderId).replace(/-01$/, "")})
  `;
}
