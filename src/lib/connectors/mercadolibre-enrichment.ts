// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// MercadoLibre enrichment helper
// ══════════════════════════════════════════════════════════════
// Dada una order ML (payload completo de /orders/search), crea:
//   - Customer (upsert por externalId "ml-<buyerId>")
//   - Product (upsert SKU-first usando seller_sku)
//   - OrderItem (1 por cada item del pedido)
//
// VENTAJA vs VTEX: ML devuelve el payload completo en /orders/search.
// No hay que hacer GET detail por cada orden. Ahorra 1 API call por
// orden.
//
// Uso tipico (desde ml-processor.ts, ya tenes el mlOrder del search):
//   await enrichOrderFromMl(dbOrderId, orgId, mlOrder);
//
// Sesion 58: agregado como fix de BP-S56-002. El processor ML ahora
// enriquece items/customers/products automaticamente en el backfill.
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import { upsertProductBySku } from "@/lib/products/upsert-by-sku";

export interface MlEnrichResult {
  customerCreated: boolean;
  itemsCreated: number;
}

/**
 * Email de ML: el buyer.email casi nunca viene (ML no lo expone publico).
 * Si viene vacio o es el placeholder "noreply@mercadolibre.com", devolver null.
 */
function extractMlEmail(rawEmail?: string | null): string | null {
  if (!rawEmail) return null;
  const clean = rawEmail.toLowerCase().trim();
  if (!clean) return null;
  if (clean.includes("noreply@mercadolibre")) return null;
  if (clean.includes("mail.mercadolibre")) return null;
  return clean;
}

/**
 * Enriquece un order existente en DB con la data completa del payload ML.
 * - Crea/actualiza Customer (desde buyer + shipping.receiver_address)
 * - Crea/actualiza Product (SKU-first usando seller_sku)
 * - Crea OrderItem (1 por item del pedido)
 *
 * Idempotente: si ya hay OrderItems para ese dbOrderId, NO duplica.
 */
export async function enrichOrderFromMl(
  dbOrderId: string,
  orgId: string,
  mlOrder: any,
  // S58 F2.3: token opcional para GET /shipments/{id} si la direccion NO viene
  // en el payload de /orders/search (caso normal — receiver_address es null).
  // Si se pasa, se hace 1 GET extra por orden con shipping.id para traer
  // city/state/country/zip completos.
  token?: string,
): Promise<MlEnrichResult | null> {
  try {
    // All provider requests happen before locking the order.
    let shipData: any = null;
    const addr = mlOrder.shipping?.receiver_address;
    if (mlOrder.shipping?.id && token && (!addr?.city?.name || !addr?.state?.name)) {
      const r = await fetch(`https://api.mercadolibre.com/shipments/${encodeURIComponent(String(mlOrder.shipping.id))}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error("Shipment lookup unavailable");
      shipData = await r.json();
    }
    const version = new Date(mlOrder.last_updated || mlOrder.date_created);
    if (!Number.isFinite(version.getTime())) throw new Error("Invalid order version");
    return await prisma.$transaction(async tx => {
      const locked = await tx.$queryRawUnsafe(
        `SELECT id FROM orders WHERE id=$1 AND "organizationId"=$2 AND source='MELI'
           AND "externalUpdatedAt"=$3::timestamptz FOR UPDATE`, dbOrderId, orgId, version);
      if (!locked.length) return null;
      let customerCreated = false;
      let itemsCreated = 0;
    // ── Customer ─────────────────────────────────────
    const buyer = mlOrder.buyer;
    if (buyer && buyer.id) {
      const customerExtId = `ml-${buyer.id}`;
      const realEmail = extractMlEmail(buyer.email);
      const firstName = buyer.first_name || null;
      const lastName = buyer.last_name || null;
      const nickname = buyer.nickname || null;

      // Location desde shipping. Primero intentamos del payload (a veces viene
      // en webhooks); si no, GET /shipments/{id} (caso normal del backfill).
      // S58 BIS: el check anterior (`!addr`) era muy permisivo — ML devuelve
      // receiver_address como objeto VACIO {} en /orders/search, asi que addr
      // queda truthy pero city/state son undefined. Cambio: hacer el lookup
      // siempre que falte city o state.
      const addr = shipData?.receiver_address ?? mlOrder.shipping?.receiver_address;
      const city = addr?.city?.name || null;
      const state = addr?.state?.name || null;
      const country = addr?.country?.id || null;

      const orderDate = mlOrder.date_created
        ? new Date(mlOrder.date_created)
        : new Date();

      // Solo crear customer si hay al menos alguna pista identificable
      if (firstName || lastName || nickname || realEmail) {
        const customer = await tx.customer.upsert({
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
            totalSpent: Number(mlOrder.total_amount) || 0,
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

        await tx.order.update({
          where: { id: dbOrderId },
          data: { customerId: customer.id },
        });
        customerCreated = true;
      }
    }

    // ── Products + OrderItems ───────────────────────
    // S58 F-RACE: race condition mitigation (mismo patron que VTEX).
    // Antes: count + if(==0) + create por item. Si webhook + backfill llegaban
    // concurrentes al mismo order podian crear duplicados. Ahora: products en
    // serie, despues UN deleteMany + createMany atomico.
    const items = mlOrder.order_items;
    if (!Array.isArray(items)) throw new Error("Order items unavailable");
    {
      const orderItemsToCreate: any[] = [];

      for (const it of items) {
        const mlItem = it.item || {};
        const productExtId = String(mlItem.id || mlItem.variation_id || "");
        if (!productExtId) throw new Error("Item identifier unavailable");

        const realSku = (mlItem.seller_sku || mlItem.seller_custom_field || "").toString().trim() || null;
        const unitPrice = Number(it.unit_price ?? it.full_unit_price);
        const quantity = Number(it.quantity);
        if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Invalid order item amounts");

        // ML devuelve la imagen directamente en el payload de /orders/search
        // via mlItem.thumbnail. Ojo: puede ser http:// (http v1 de ML) — forzar https para
        // evitar mixed-content warnings en el frontend.
        const rawThumb = (mlItem.thumbnail || "").toString().trim();
        let thumbnail = rawThumb ? rawThumb.replace(/^http:\/\//, "https://") : null;
        let brandFromSibling: string | null = null;

        // S59 BIS: cross-source SKU matching para imagen + brand.
        // Si ML no devuelve thumbnail (caso comun en /orders/search) y existe
        // un producto hermano de VTEX con el mismo SKU, le copiamos la imagen
        // y la marca para que se vea bien en dashboard + health-check + DB.
        // Esto persiste, no es solo runtime.
        if (realSku && (!thumbnail || !mlItem.title)) {
          try {
            const sibling = await tx.product.findFirst({
              where: {
                organizationId: orgId,
                sku: realSku,
                NOT: { externalId: productExtId },
                OR: [
                  { imageUrl: { not: null } },
                  { brand: { not: null } },
                ],
              },
              select: { imageUrl: true, brand: true },
            });
            if (sibling) {
              if (!thumbnail && sibling.imageUrl) thumbnail = sibling.imageUrl;
              if (sibling.brand) brandFromSibling = sibling.brand;
            }
          } catch {
            // silent — no romper el enrichment si falla la query
          }
        }

        const product = await upsertProductBySku({
          organizationId: orgId,
          externalId: productExtId,
          sku: realSku,
          create: {
            name: mlItem.title || `ML ${productExtId}`,
            brand: brandFromSibling,
            category: mlItem.category_id || null,
            price: unitPrice,
            imageUrl: thumbnail,
            isActive: true,
          },
          update: {
            // No sobreescribir name/price si ya vinieron de VTEX u otra fuente con mas data
            name: mlItem.title || undefined,
            category: mlItem.category_id || undefined,
            ...(thumbnail ? { imageUrl: thumbnail } : {}),
            ...(brandFromSibling ? { brand: brandFromSibling } : {}),
          },
        }, tx);

        orderItemsToCreate.push({
          orderId: dbOrderId,
          productId: product.id,
          quantity,
          unitPrice,
          totalPrice: unitPrice * quantity,
          costPrice: (product as any).costPrice ?? null,
        });
      }

      await tx.orderItem.deleteMany({ where: { orderId: dbOrderId } });
      if (orderItemsToCreate.length > 0) await tx.orderItem.createMany({ data: orderItemsToCreate as any });
      itemsCreated = orderItemsToCreate.length;
    }

    // ── Campos opcionales de la orden ─────────────────
    // S58 BIS: el processor del backfill ML antes solo seteaba status/total/
    // currency/itemCount/paymentMethod/marketplaceFee. El webhook ML
    // (post-S58 F2.1) setea ademas channel/shippingCost/deliveryType. Ahora
    // el backfill tambien — para que las orders historicas tengan los
    // mismos campos que las nuevas via webhook.
    //
    // S58 BIS-2: priorizar shipData (de /shipments) sobre mlOrder.shipping
    // para shippingCost/shippingCarrier/postalCode. mlOrder.shipping es el
    // mini-objeto que /orders/search devuelve (casi nunca trae estos campos).
    // /shipments es la fuente autoritativa — la usamos cuando esta disponible.
    const orderFields: any = { channel: "marketplace" };
    const promotions = [
      ...(Array.isArray(mlOrder.promotions) ? mlOrder.promotions : []),
      ...items.map(it => it.promotion).filter(Boolean),
    ].map(p => String(p?.name || p?.type || "").trim()).filter(Boolean);
    orderFields.promotionNames = [...new Set(promotions)].join(", ") || null;
    if (items.every(it => it.sale_fee != null)) {
      const fees = items.map(it => Number(it.sale_fee));
      if (fees.some(fee => !Number.isFinite(fee) || fee < 0)) throw new Error("Invalid marketplace fee");
      orderFields.marketplaceFee = fees.reduce((sum, fee) => sum + fee, 0);
    }
    const payment = mlOrder.payments?.[0];
    if (payment?.payment_method_id || payment?.payment_type) {
      orderFields.paymentMethod = payment.payment_method_id || payment.payment_type;
    }

    // shippingCost: shipData.shipping_option.cost > shipData.cost > mlOrder.shipping.cost
    const rawShipCost = shipData?.shipping_option?.cost
      ?? shipData?.cost
      ?? mlOrder.shipping?.cost;
    if (rawShipCost != null) {
      const n = Number(rawShipCost);
      if (Number.isFinite(n)) orderFields.shippingCost = n;
    }

    // deliveryType: priorizar shipData.shipment_type, sino mlOrder.shipping.shipment_type
    const shipmentType = shipData?.shipment_type || mlOrder.shipping?.shipment_type;
    if (shipmentType === "pickup" || shipmentType === "self_service") {
      orderFields.deliveryType = "PICKUP";
    } else if (shipData || mlOrder.shipping) {
      orderFields.deliveryType = "DELIVERY";
    }

    // shippingCarrier: priorizar shipData.logistic_type
    const logisticType = shipData?.logistic_type || mlOrder.shipping?.logistic_type;
    if (logisticType) orderFields.shippingCarrier = String(logisticType);

    // postalCode: priorizar shipData.receiver_address.zip_code
    const postalCode = shipData?.receiver_address?.zip_code
      || mlOrder.shipping?.receiver_address?.zip_code;
    if (postalCode) orderFields.postalCode = String(postalCode);

    await tx.order.update({
      where: { id: dbOrderId },
      data: orderFields,
    });

    return { customerCreated, itemsCreated };
    }, { timeout: 30_000, maxWait: 5_000 });
  } catch (err: any) {
    console.error(`[ml-enrichment] enrichOrder ${dbOrderId} failed:`, err.message);
    return null;
  }
}
