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
import { upsertProductBySku } from "@/lib/products/upsert-by-sku";

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
  const { topic, resource, user_id: mlUserId } = notification;

  try {
    // Multi-tenant safe: resolver orgId por mlUserId del payload.
    // mlUserId es único global en MELI, así que matcheamos exactamente la
    // org que tiene esa cuenta ML conectada.
    if (!mlUserId) {
      console.error("[ML Processor] Notification sin user_id — NO se puede resolver org. Descartada.");
      return;
    }

    const connections = await prisma.connection.findMany({
      where: { platform: "MERCADOLIBRE" as any, status: "ACTIVE" as any },
      select: { id: true, organizationId: true, credentials: true },
    });

    const connection = connections.find((c) => {
      const creds = c.credentials as any;
      return creds?.mlUserId === mlUserId;
    });

    if (!connection) {
      console.error(
        `[ML Processor] No active ML connection match para user_id=${mlUserId}. Notification descartada (posiblemente de una org que se desconectó).`
      );
      return;
    }

    const orgId = connection.organizationId;
    const { token } = await getSellerToken(orgId);

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

    // Update last sync timestamp + marcar sync exitoso (limpia error previo)
    const now = new Date();
    await prisma.connection.update({
      where: { id: connection.id },
      data: { lastSyncAt: now, lastSuccessfulSyncAt: now, lastSyncError: null },
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

  // ── Extract marketplace fee (commission) from order items ──
  const marketplaceFee = mlItems.reduce(
    (sum: number, item: any) => sum + (Number(item.sale_fee) || 0), 0
  );

  // ── Extract shipping cost & delivery type ──
  const shippingCost = order.shipping?.cost ?? null;
  const deliveryType = order.shipping?.shipment_type === "pickup"
    ? "pickup" : order.shipping ? "shipping" : null;

  const packId = order.pack_id ? String(order.pack_id) : null; // dedup carritos MELI

  const dbOrder = await prisma.order.upsert({
    where: {
      organizationId_externalId: { organizationId: orgId, externalId: String(order.id) },
    },
    update: {
      status,
      totalValue,
      itemCount,
      packId,
      paymentMethod: order.payments?.[0]?.payment_type || null,
      ...(marketplaceFee > 0 ? { marketplaceFee } : {}),
      ...(shippingCost != null ? { shippingCost } : {}),
      ...(deliveryType ? { deliveryType } : {}),
    },
    create: {
      organizationId: orgId,
      externalId: String(order.id),
      packId,
      status,
      totalValue,
      currency: order.currency_id || "ARS",
      itemCount,
      source: "MELI",
      channel: "marketplace",
      paymentMethod: order.payments?.[0]?.payment_type || null,
      ...(marketplaceFee > 0 ? { marketplaceFee } : {}),
      ...(shippingCost != null ? { shippingCost } : {}),
      ...(deliveryType ? { deliveryType } : {}),
      orderDate: new Date(order.date_created),
    },
  });

  // ── Customer enrichment (S58 F2.1) ──
  // Antes el webhook orders_v2 NO creaba customers, dejando customerId NULL
  // en orders nuevas post-backfill. Esto rompia atribucion + LTV. Ahora
  // creamos/actualizamos el Customer desde order.buyer + shipping.
  try {
    const buyer = order.buyer;
    if (buyer && buyer.id) {
      const customerExtId = `ml-${buyer.id}`;
      const rawEmail = String(buyer.email || "").toLowerCase().trim();
      const realEmail = rawEmail && !rawEmail.includes("noreply@mercadolibre") && !rawEmail.includes("mail.mercadolibre")
        ? rawEmail : null;
      const firstName = buyer.first_name || null;
      const lastName = buyer.last_name || null;
      const nickname = buyer.nickname || null;

      // S58 F-WEBHOOK-TOKEN: si no viene receiver_address en el payload del
      // /orders, GET /shipments/{id} como hace el backfill. Antes el webhook
      // no hacia este fallback y orders nuevas quedaban sin city/state.
      let addr = order.shipping?.receiver_address;
      const shippingId = order.shipping?.id;
      if (!addr && shippingId && token) {
        try {
          const r = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
          });
          if (r.ok) {
            const shipData = await r.json();
            addr = shipData?.receiver_address;
          }
        } catch {
          // Silencioso — no bloqueamos el webhook por falta de address.
        }
      }
      const city = addr?.city?.name || null;
      const state = addr?.state?.name || null;
      const country = addr?.country?.id || null;

      const orderDate = order.date_created ? new Date(order.date_created) : new Date();

      if (firstName || lastName || nickname || realEmail) {
        const customer = await prisma.customer.upsert({
          where: {
            organizationId_externalId: {
              organizationId: orgId,
              externalId: customerExtId,
            },
          },
          create: {
            organizationId: orgId,
            externalId: customerExtId,
            email: realEmail,
            firstName: firstName || nickname,
            lastName,
            city,
            state,
            country,
            firstOrderAt: orderDate,
            lastOrderAt: orderDate,
            totalOrders: 1,
            totalSpent: Number(totalValue) || 0,
          },
          update: {
            ...(realEmail ? { email: realEmail } : {}),
            ...(firstName ? { firstName } : nickname ? { firstName: nickname } : {}),
            ...(lastName ? { lastName } : {}),
            ...(city ? { city } : {}),
            ...(state ? { state } : {}),
            ...(country ? { country } : {}),
            lastOrderAt: orderDate,
          },
        });

        await prisma.order.update({
          where: { id: dbOrder.id },
          data: { customerId: customer.id },
        });
      }
    }
  } catch (err: any) {
    console.warn(`[ML Processor] customer enrichment failed for order ${order.id}: ${err.message}`);
  }

  // ── Create Products + OrderItems for MELI ──
  if (mlItems.length > 0) {
    await prisma.orderItem.deleteMany({ where: { orderId: dbOrder.id } });
    for (const mlItem of mlItems) {
      const mlItemId = String(mlItem.item?.id || mlItem.item_id || "");
      const itemTitle = mlItem.item?.title || mlItem.title || `ML Item ${mlItemId}`;
      const unitPrice = mlItem.unit_price || mlItem.full_unit_price || 0;
      const quantity = mlItem.quantity || 1;
      let thumbnailUrl: string | null = mlItem.item?.thumbnail || null;
      // Sesion 21: usar seller_sku real, NO el MLA listing id.
      let sellerSku: string | null = (mlItem.item?.seller_sku || "").trim() || null;

      // Sesion 22: el payload de orders API normalmente NO trae seller_sku
      // en order_items[].item. Lo pedimos a /items/{id} si falta.
      if (mlItemId && (!sellerSku || !thumbnailUrl)) {
        try {
          const itemDetail = await mlGet(
            `/items/${mlItemId}?attributes=id,seller_sku,attributes,pictures,thumbnail`,
            token
          );
          if (!sellerSku) {
            let s = (itemDetail.seller_sku || "").trim() || null;
            if (!s && Array.isArray(itemDetail.attributes)) {
              const a = itemDetail.attributes.find(
                (x: any) => x.id === "SELLER_SKU" || x.name === "SKU"
              );
              s = (a?.value_name || a?.values?.[0]?.name || "").trim() || null;
            }
            sellerSku = s;
          }
          if (!thumbnailUrl) {
            const pic = Array.isArray(itemDetail.pictures) && itemDetail.pictures[0];
            thumbnailUrl = pic?.secure_url || pic?.url || itemDetail.thumbnail || null;
            if (thumbnailUrl && thumbnailUrl.startsWith("http://")) {
              thumbnailUrl = thumbnailUrl.replace("http://", "https://");
            }
          }
        } catch (err: any) {
          console.warn(`[ML Processor] could not fetch /items/${mlItemId}: ${err.message}`);
        }
      }

      const externalId = mlItemId || `meli-${order.id}-${mlItem.item?.id || 0}`;

      const product = await upsertProductBySku({
        organizationId: orgId,
        externalId,
        sku: sellerSku,
        create: {
          name: itemTitle,
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

  console.log(`[ML Processor] Order ${order.id} upserted (${status}), ${mlItems.length} items, fee=${marketplaceFee}, ship=${shippingCost}`);
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
