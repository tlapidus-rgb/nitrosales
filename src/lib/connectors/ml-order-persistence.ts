import { prisma } from "@/lib/db/client";
import type { OrderStatus } from "@prisma/client";

export type UpsertResult = {
  action: "inserted" | "updated" | "skipped";
  dbOrderId: string | null;
};

export async function persistMlOrder(orgId: string, order: any, status: OrderStatus): Promise<UpsertResult> {
  const externalId = String(order.id);
  const packId = order.pack_id ? String(order.pack_id) : null; // dedup de carritos
  const total = Number(order.total_amount) || 0;
  const currency = order.currency_id || "ARS";
  const itemCount = Array.isArray(order.order_items)
    ? order.order_items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0)
    : 0;
  const orderDate = new Date(order.date_created);
  const externalUpdatedAt = order.last_updated ? new Date(order.last_updated) : orderDate;
  const paymentMethod = order.payments?.[0]?.payment_method_id || null;
  const marketplaceFee = order.order_items?.[0]?.sale_fee
    ? order.order_items.reduce((sum: number, it: any) => sum + (Number(it.sale_fee) || 0), 0)
    : null;

  // Raw SQL con ON CONFLICT guard. Usamos el UNIQUE (organizationId, externalId).
  const rows: any[] = await prisma.$queryRawUnsafe(
    `
    INSERT INTO "orders" (
      "id", "externalId", "packId", "status", "totalValue", "currency", "itemCount",
      "source", "paymentMethod", "marketplaceFee",
      "orderDate", "externalUpdatedAt", "organizationId", "createdAt", "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text, $1, $2, $3::"OrderStatus", $4, $5, $6,
      'MELI', $7, $8,
      $9, $10, $11, NOW(), NOW()
    )
    ON CONFLICT ("organizationId", "externalId")
    DO UPDATE SET
      "packId" = EXCLUDED."packId",
      "status" = EXCLUDED."status",
      "totalValue" = EXCLUDED."totalValue",
      "currency" = EXCLUDED."currency",
      "itemCount" = EXCLUDED."itemCount",
      "paymentMethod" = EXCLUDED."paymentMethod",
      "marketplaceFee" = EXCLUDED."marketplaceFee",
      "externalUpdatedAt" = EXCLUDED."externalUpdatedAt",
      "backfillEnrichedVersion" = NULL,
      "updatedAt" = NOW()
    WHERE "orders".source = 'MELI' AND (
      "orders"."externalUpdatedAt" IS NULL
      OR "orders"."externalUpdatedAt" < EXCLUDED."externalUpdatedAt")
    RETURNING "id", xmax = 0 AS "inserted"
    `,
    externalId, packId, status, total, currency, itemCount,
    paymentMethod, marketplaceFee,
    orderDate, externalUpdatedAt, orgId
  );

  if (rows.length === 0) return { action: "skipped", dbOrderId: null }; // guard blocked update (vino viejo)
  return {
    action: rows[0].inserted ? "inserted" : "updated",
    dbOrderId: String(rows[0].id),
  };
}

