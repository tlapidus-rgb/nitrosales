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
    let customerCreated = false;
    let itemsCreated = 0;
    // S58 BIS-2: shipData se mantiene en outer scope para usarlo no solo
    // en customer (city/state) sino tambien en order.update (shippingCost,
    // shippingCarrier via logistic_type, postalCode via zip_code). Sin
    // esto, el code anterior leia esos campos del mlOrder.shipping (objeto
    // chico de /orders/search que casi nunca los trae).
    let shipData: any = null;

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
      let addr = mlOrder.shipping?.receiver_address;
      const needsShipmentLookup = !addr?.city?.name || !addr?.state?.name;
      const shippingId = mlOrder.shipping?.id;
      if (needsShipmentLookup && shippingId && token) {
        try {
          // S58 F-TIMEOUT: 8s -> 15s. ML /shipments puede tardar 5-10s en
          // sellers grandes; con 8s timing-out frecuentemente y perdemos
          // city/state. El backfill ya tiene timeouts mas generosos en otros
          // pasos asi que 15s no rompe budget total.
          const r = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
          });
          if (r.ok) {
            shipData = await r.json();
            // Mergear: priorizar shipData (mas completo) pero conservar
            // valores del addr inicial si existen.
            const shipAddr = shipData?.receiver_address;
            if (shipAddr) addr = shipAddr;
          }
        } catch {
          // Silencioso — la falta de address no rompe el enrich completo.
        }
      }
      const city = addr?.city?.name || null;
      const state = addr?.state?.name || null;
      const country = addr?.country?.id || null;

      const orderDate = mlOrder.date_created
        ? new Date(mlOrder.date_created)
        : new Date();

      // Solo crear customer si hay al menos alguna pista identificable
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

        await prisma.order.update({
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
    const items = mlOrder.order_items || [];
    if (items.length > 0) {
      const orderItemsToCreate: any[] = [];

      for (const it of items) {
        const mlItem = it.item || {};
        const productExtId = String(mlItem.id || mlItem.variation_id || "");
        if (!productExtId) continue;

        const realSku = (mlItem.seller_sku || mlItem.seller_custom_field || "").toString().trim() || null;
        const unitPrice = Number(it.unit_price ?? it.full_unit_price ?? 0);
        const quantity = Number(it.quantity) || 1;

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
            const sibling = await prisma.product.findFirst({
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
        });

        orderItemsToCreate.push({
          orderId: dbOrderId,
          productId: product.id,
          quantity,
          unitPrice,
          totalPrice: unitPrice * quantity,
          costPrice: (product as any).costPrice ?? null,
        });
      }

      if (orderItemsToCreate.length > 0) {
        await prisma.$transaction([
          prisma.orderItem.deleteMany({ where: { orderId: dbOrderId } }),
          prisma.orderItem.createMany({ data: orderItemsToCreate as any }),
        ]);
        itemsCreated = orderItemsToCreate.length;
      }
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

    await prisma.order.update({
      where: { id: dbOrderId },
      data: orderFields,
    });

    return { customerCreated, itemsCreated };
  } catch (err: any) {
    console.error(`[ml-enrichment] enrichOrder ${dbOrderId} failed:`, err.message);
    return null;
  }
}
