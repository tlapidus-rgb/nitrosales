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

import { persistMlOrder } from "./ml-order-persistence";
import { enrichOrderFromMl } from "./mercadolibre-enrichment";
import { prisma } from "@/lib/db/client";
import { getSellerToken } from "./mercadolibre-seller";
// E-30. Acá vivía una de las SIETE copias del mapeo de estados de MELI, en
// dos familias que no coincidían: `confirmed` era APPROVED en cinco y
// PENDING en dos, y eso decide si la orden cuenta como venta. Ahora todos
// llaman a `mapMeliStatus` —espejo de `vtex-status.ts`— directamente.
import { mapMeliStatus } from "@/lib/meli-status";

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
      return String(creds?.mlUserId ?? "") === String(mlUserId);
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
    // The outbox must record this as failed, not mark it processed.
    throw err;
  }
}

// ── Helper: Fetch from ML API (READ-ONLY) ────────────────────

async function mlGet(path: string, token: string): Promise<any> {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) throw new Error("Invalid ML resource path");
  const url = `${ML_API}${path}`;
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

  // Resolve optional catalog fields before any transaction holds a row lock.
  //
  // Opcionales de verdad: si esta consulta falla, la orden se guarda igual sin
  // SKU ni foto (el enriquecimiento tolera que falten). Si el error cortara acá,
  // la orden no entraría, y el reenvío de ML con el mismo _id se descarta como
  // duplicado: quedaría afuera hasta que la levante ml-reconcile. Así era antes
  // de b35efafd y así tiene que seguir.
  for (const line of order.order_items ?? []) {
    const item = line.item ?? {};
    if (item.id && (!item.seller_sku || !item.thumbnail)) {
      try {
        const detail = await mlGet(`/items/${encodeURIComponent(String(item.id))}?attributes=id,seller_sku,attributes,pictures,thumbnail`, token);
        item.seller_sku ||= detail.seller_sku || detail.attributes?.find((a: any) => a.id === "SELLER_SKU" || a.name === "SKU")?.value_name;
        item.thumbnail ||= detail.thumbnail || detail.pictures?.[0]?.url;
        line.item = item;
      } catch (err: any) {
        console.warn(`[ML Processor] could not fetch /items/${item.id}: ${err.message}`);
      }
    }
  }
  const result = await persistMlOrder(orgId, order, mapMeliStatus(order.status, order.tags));
  let orderId = result.dbOrderId;
  if (!orderId) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM orders WHERE "organizationId"=$1 AND "externalId"=$2 AND source='MELI'
        AND "externalUpdatedAt"=$3::timestamptz`, orgId, String(order.id), new Date(order.last_updated || order.date_created));
    orderId = rows[0]?.id ?? null;
  }
  // A strictly newer stored version wins over an old notification.
  if (!orderId) return;
  if (!await enrichOrderFromMl(orderId, orgId, order, token)) throw new Error("ML order enrichment incomplete");
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
  const payment = await mlGet(resource, token);
  if (payment.order_id) await processOrder(token, orgId, `/orders/${encodeURIComponent(String(payment.order_id))}`);
}

async function processShipment(token: string, orgId: string, resource: string): Promise<void> {
  const shipment = await mlGet(resource, token);
  if (shipment.order_id) await processOrder(token, orgId, `/orders/${encodeURIComponent(String(shipment.order_id))}`);
}
