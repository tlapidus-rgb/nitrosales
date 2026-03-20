// ══════════════════════════════════════════════════════════════
// Order Validation — Pure functions for sync/backfill filters
// ══════════════════════════════════════════════════════════════
// Single source of truth for order validation logic.
// Used by sync/vtex, backfill/vtex, and webhooks to determine
// whether an incoming VTEX order should be imported or skipped.
// ══════════════════════════════════════════════════════════════

import { mapVtexStatus } from "@/lib/vtex-status";

export interface VtexOrderSummary {
  orderId: string;
  status: string | null | undefined;
  totalValue: number | null | undefined;
  creationDate?: string | null;
}

/**
 * Determines if a VTEX order from the List Orders API is valid for import.
 * Returns { valid: true } or { valid: false, reason: string }
 *
 * Ghost order detection:
 * - Empty/null/undefined status → ghost
 * - Status literally "null" or "undefined" string → ghost
 * - Zero or missing totalValue → likely incomplete
 *
 * This is the ONLY place these rules should live.
 */
export function isOrderValidForImport(
  order: VtexOrderSummary
): { valid: true } | { valid: false; reason: string } {
  const status = (order.status || "").toLowerCase().trim();

  // Ghost order: no status
  if (!status || status === "" || status === "null" || status === "undefined") {
    return { valid: false, reason: "empty-status" };
  }

  // Zero-value order: likely incomplete or test
  if (!order.totalValue || order.totalValue === 0) {
    return { valid: false, reason: "zero-value" };
  }

  return { valid: true };
}

/**
 * Checks if an order with the given externalId already exists in the provided set.
 * Used for idempotency — prevents re-importing orders already in DB.
 */
export function isOrderAlreadyImported(
  orderId: string,
  existingIds: Set<string>
): boolean {
  return existingIds.has(String(orderId));
}

/**
 * Filters a batch of VTEX orders, returning only those that should be imported.
 * Combines idempotency check + validation in one pass.
 * Returns { toImport, skipped } with reasons for each skip.
 */
export function filterOrdersForImport(
  orders: VtexOrderSummary[],
  existingIds: Set<string>
): {
  toImport: VtexOrderSummary[];
  skipped: Array<{ orderId: string; reason: string }>;
} {
  const toImport: VtexOrderSummary[] = [];
  const skipped: Array<{ orderId: string; reason: string }> = [];

  for (const order of orders) {
    const id = String(order.orderId);

    // Idempotency: already in DB
    if (isOrderAlreadyImported(id, existingIds)) {
      skipped.push({ orderId: id, reason: "already-exists" });
      continue;
    }

    // Validation: ghost/incomplete check
    const validation = isOrderValidForImport(order);
    if (!validation.valid) {
      skipped.push({ orderId: id, reason: validation.reason });
      continue;
    }

    toImport.push(order);
  }

  return { toImport, skipped };
}
