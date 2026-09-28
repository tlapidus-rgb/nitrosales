import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { persistMlOrder } from "./ml-order-persistence";
import { enrichOrderFromMl } from "./mercadolibre-enrichment";

/** Base persistence and detail enrichment are separate recoverable phases.
 * Replaying the same version repairs an interrupted detail write. */
export async function ingestMlOrder(orgId: string, order: any, status: OrderStatus, token: string) {
  const version = new Date(order.last_updated || order.date_created);
  if (!order.id || !Number.isFinite(version.getTime())) throw new Error("Invalid ML order identity/version");
  const saved = await persistMlOrder(orgId, order, status);
  let id = saved.dbOrderId;
  if (!id) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM orders WHERE "organizationId"=$1 AND "externalId"=$2 AND source='MELI'
       AND "externalUpdatedAt"=$3::timestamptz`, orgId, String(order.id), version);
    id = rows[0]?.id ?? null;
  }
  if (!id) return { action: "skipped" as const, itemsCreated: 0, enriched: false };
  const enriched = await enrichOrderFromMl(id, orgId, order, token);
  if (!enriched) throw new Error("ML order enrichment incomplete or superseded");
  const confirmed = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `UPDATE orders SET "backfillEnrichedVersion"=$3::timestamptz
     WHERE id=$1 AND "organizationId"=$2 AND source='MELI'
       AND "externalUpdatedAt"=$3::timestamptz RETURNING id`, id, orgId, version);
  if (!confirmed.length) throw new Error("ML order enrichment confirmation superseded");
  return { action: saved.action, itemsCreated: enriched.itemsCreated, enriched: true };
}
