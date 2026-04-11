// ══════════════════════════════════════════════════════════════
// ML Notification Processor — Async handler for real-time events
// ══════════════════════════════════════════════════════════════
// Processes notifications from ML webhook endpoint.
// Each topic type has its own handler that:
//   1. Fetches the updated resource from ML API (READ-ONLY)
//   2. Upserts the data into our DB
//
// SAFETY: Only GET calls to ML API. Never writes to ML.
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import { getSellerToken } from "./mercadolibre-seller";

const ML_API = "https://api.mercadolibre.com";

interface MLNotification {
  _id: string;
  resource: string;
  user_id: number;
  topic: string;
  application_id: number;
  attempts: number;
  sent: string;
  received: string;
}

// ── Main dispatcher ─────────────────────────────────────────

export async function processMLNotification(notification: MLNotification): Promise<void> {
  const { topic, resource } = notification;

  try {
    // Get valid token and org info
    const { token } = await getSellerToken();
    const connection = await prisma.connection.findFirst({
      where: { platform: "MERCADOLIBRE" as any },
    });
    if (!connection) {
      console.error("[ML Processor] No ML connection found");
      return;
    }
    const orgId = connection.organizationId;

    // Dispatch to topic handler
    switch (topic) {
      case "orders_v2":
        await processOrder(token, orgId, resource);
        break;
      case "items":
        await processItem(token, orgId, resource);
        break;
      case "questions":
        await processQuestion(token, orgId, resource);
        break;
      case "payments":
        await processPayment(token, orgId, resource);
        break;
      case "shipments":
        await processShipment(token, orgId, resource);
        break;
      default:
        console.log(`[ML Processor] Unhandled topic: ${topic}`);
    }

    // Update last sync timestamp
    await prisma.connection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date() },
    });
  } catch (err: any) {
    console.error(`[ML Processor] Error processing ${topic} ${resource}:`, err.message);
    // Don't throw — webhook already responded 200
  }
}

// ── Helper: Fetch from ML API (READ-ONLY) ────────────────────

async function mlGet(path: string, token: string): Promise<any> {
  const url = path.startsWith("http") ? path : `${ML_API}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`ML API GET ${path} → ${res.status}`);
  }
  return res.json();
}

// ── Order processor ──────────────────────────────────────────

async function processOrder(token: string, orgId: string, resource: string): Promise<void> {
  // resource = "/orders/1234567890"
  const order = await mlGet(resource, token);

  const status = mapMLOrderStatus(order.status);
  const totalValue = order.total_amount || 0;
  const mlItems = order.order_items || [];
  const itemCount = mlItems.reduce(
    (sum: number, i: any) => sum + (i.quantity || 1), 0
  );

  const dbOrder = await prisma.order.upsert({
    where: {
      organizationId_externalId: { organizationId: orgId, externalId: String(order.id) },
    },
    update: {
      status,
      totalValue,
      itemCount,
      paymentMethod: order.payments?.[0]?.payment_type || null,
    },
    create: {
      organizationId: orgId,
      externalId: String(order.id),
      status,
      totalValue,
      currency: order.currency_id || "ARS",
      itemCount,
      source: "MELI",
      channel: "marketplace",
      paymentMethod: order.payments?.[0]?.payment_type || null,
      orderDate: new Date(order.date_created),
    },
  });

  // ── Create Products + OrderItems for MELI ──
  if (mlItems.length > 0) {
    await prisma.orderItem.deleteMany({ where: { orderId: dbOrder.id } });
    for (const mlItem of mlItems) {
      const mlItemId = String(mlItem.item?.id || mlItem.item_id || "");
      const itemTitle = mlItem.item?.title || mlItem.title || `ML Item ${mlItemId}`;
      const unitPrice = mlItem.unit_price || mlItem.full_unit_price || 0;
      const quantity = mlItem.quantity || 1;
      const thumbnailUrl = mlItem.item?.thumbnail || null;

      const product = await prisma.product.upsert({
        where: {
          organizationId_externalId: { organizationId: orgId, externalId: mlItemId || `meli-${order.id}-${mlItem.item?.id || 0}` },
        },
        create: {
          organizationId: orgId,
          externalId: mlItemId || `meli-${order.id}-${mlItem.item?.id || 0}`,
          name: itemTitle,
          sku: mlItemId,
          price: unitPrice,
          imageUrl: thumbnailUrl,
          isActive: true,
        },
        update: {
          name: itemTitle,
          price: unitPrice,
          ...(thumbnailUrl ? { imageUrl: thumbnailUrl } : {}),
        },
      });

      await prisma.orderItem.create({
        data: {
          orderId: dbOrder.id,
          productId: product.id,
          quantity,
          unitPrice,
          totalPrice: unitPrice * quantity,
        } as any,
      });
    }
  }

  console.log(`[ML Processor] Order ${order.id} upserted (${status}), ${mlItems.length} items`);
}

// ── Item processor ───────────────────────────────────────────

async function processItem(token: string, orgId: string, resource: string): Promise<void> {
  // resource = "/items/MLA123456789"
  const item = await mlGet(resource, token);

  await prisma.mlListing.upsert({
    where: {
      organizationId_mlItemId: { organizationId: orgId, mlItemId: item.id },
    },
    update: {
      title: item.title || "",
      status: item.status || "unknown",
      categoryId: item.category_id,
      price: item.price || 0,
      originalPrice: item.original_price,
      currencyId: item.currency_id || "ARS",
      availableQty: item.available_quantity || 0,
      soldQty: item.sold_quantity || 0,
      listingType: item.listing_type_id,
      condition: item.condition,
      permalink: item.permalink,
      thumbnailUrl: item.thumbnail,
      freeShipping: item.shipping?.free_shipping || false,
      fulfillment: item.shipping?.logistic_type,
      catalogListing: !!item.catalog_listing,
      lastSyncAt: new Date(),
    },
    create: {
      organizationId: orgId,
      mlItemId: item.id,
      title: item.title || "",
      status: item.status || "unknown",
      categoryId: item.category_id,
      price: item.price || 0,
      originalPrice: item.original_price,
      currencyId: item.currency_id || "ARS",
      availableQty: item.available_quantity || 0,
      soldQty: item.sold_quantity || 0,
      listingType: item.listing_type_id,
      condition: item.condition,
      permalink: item.permalink,
      thumbnailUrl: item.thumbnail,
      freeShipping: item.shipping?.free_shipping || false,
      fulfillment: item.shipping?.logistic_type,
      catalogListing: !!item.catalog_listing,
      lastSyncAt: new Date(),
    },
  });

  console.log(`[ML Processor] Item ${item.id} upserted (${item.status}, stock=${item.available_quantity})`);
}

// ── Question processor ───────────────────────────────────────

async function processQuestion(token: string, orgId: string, resource: string): Promise<void> {
  // resource = "/questions/1234567890"
  const q = await mlGet(resource, token);

  await prisma.mlQuestion.upsert({
    where: {
      organizationId_mlQuestionId: { organizationId: orgId, mlQuestionId: String(q.id) },
    },
    update: {
      status: q.status,
      text: q.text || "",
      answerText: q.answer?.text || null,
      answerDate: q.answer?.date_created ? new Date(q.answer.date_created) : null,
    },
    create: {
      organizationId: orgId,
      mlQuestionId: String(q.id),
      mlItemId: q.item_id || "",
      text: q.text || "",
      status: q.status || "UNKNOWN",
      dateCreated: new Date(q.date_created),
      answerText: q.answer?.text || null,
      answerDate: q.answer?.date_created ? new Date(q.answer.date_created) : null,
      fromBuyerId: q.from?.id ? BigInt(q.from.id) : null,
    },
  });

  console.log(`[ML Processor] Question ${q.id} upserted (${q.status})`);
}

// ── Payment processor ────────────────────────────────────────

async function processPayment(token: string, orgId: string, resource: string): Promise<void> {
  // resource = "/collections/1234567890"
  // Payments link to orders — we update the order's payment info
  const payment = await mlGet(resource, token);

  if (payment.order_id) {
    // Try to update the related order's payment method
    try {
      await prisma.order.updateMany({
        where: {
          organizationId: orgId,
          externalId: String(payment.order_id),
        },
        data: {
          paymentMethod: payment.payment_type || null,
        },
      });
      console.log(`[ML Processor] Payment ${payment.id} → order ${payment.order_id} updated`);
    } catch {
      // Order might not exist yet — will be created when orders_v2 notification arrives
      console.log(`[ML Processor] Payment ${payment.id} → order ${payment.order_id} not found (will sync later)`);
    }
  }
}

// ── Shipment processor ───────────────────────────────────────

async function processShipment(token: string, orgId: string, resource: string): Promise<void> {
  // resource = "/shipments/1234567890"
  const shipment = await mlGet(resource, token);

  // Update related order status if shipment status is "delivered"
  if (shipment.order_id) {
    const newStatus = mapShipmentToOrderStatus(shipment.status);
    if (newStatus) {
      await prisma.order.updateMany({
        where: {
          organizationId: orgId,
          externalId: String(shipment.order_id),
        },
        data: { status: newStatus },
      });
      console.log(`[ML Processor] Shipment ${shipment.id} → order ${shipment.order_id} status=${newStatus}`);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────

function mapMLOrderStatus(mlStatus: string): "PENDING" | "APPROVED" | "SHIPPED" | "DELIVERED" | "CANCELLED" {
  switch (mlStatus) {
    case "confirmed": return "APPROVED";
    case "payment_required": return "PENDING";
    case "payment_in_process": return "PENDING";
    case "paid": return "APPROVED";
    case "partially_paid": return "PENDING";
    case "shipped": return "SHIPPED";
    case "delivered": return "DELIVERED";
    case "cancelled": return "CANCELLED";
    default: return "PENDING";
  }
}

function mapShipmentToOrderStatus(shipmentStatus: string): "SHIPPED" | "DELIVERED" | null {
  switch (shipmentStatus) {
    case "shipped":
    case "ready_to_ship":
      return "SHIPPED";
    case "delivered":
      return "DELIVERED";
    default:
      return null;
  }
}
