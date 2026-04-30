// ══════════════════════════════════════════════════════════════
// VTEX enrichment helper
// ══════════════════════════════════════════════════════════════
// Dada una order VTEX (GET /api/oms/pvt/orders/{orderId}), crea:
//   - Customer (upsert por externalId, dedup por org)
//   - Product (upsert SKU-first)
//   - OrderItem (1 por cada item del pedido)
//   - Actualiza order con shipping, discounts, promos, coupon
//
// Extraido de src/app/api/sync/vtex/route.ts para que processors del
// backfill puedan reusar la misma logica probada en el sync incremental.
//
// Uso tipico:
//   const vData = await fetchVtexOrderDetail(creds, orderId);
//   if (vData) await enrichOrderFromVtex(dbOrderId, orgId, vData);
// ══════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import { upsertProductBySku } from "@/lib/products/upsert-by-sku";
import { retryWithBackoff, isRetryableStatus } from "@/lib/sync/retry";
import { extractRealEmail as _extractRealEmail } from "@/lib/connectors/vtex-email";

export interface VtexCreds {
  accountName: string;
  appKey: string;
  appToken: string;
}

export interface EnrichResult {
  customerCreated: boolean;
  itemsCreated: number;
}

/**
 * Re-export del helper compartido (S59 BIS: centralizado en vtex-email.ts).
 * Mantenemos el export aca por compat con codigo que ya lo importaba.
 */
export const extractRealEmail = _extractRealEmail;

/**
 * GET /api/oms/pvt/orders/{orderId} con retry + timeout.
 * Retorna null si falla definitivamente (despues de retries).
 */
export async function fetchVtexOrderDetail(
  creds: VtexCreds,
  orderId: string,
): Promise<any | null> {
  if (!creds?.accountName || !creds?.appKey || !creds?.appToken) return null;
  const url = `https://${creds.accountName}.vtexcommercestable.com.br/api/oms/pvt/orders/${orderId}`;
  const headers: Record<string, string> = {
    "X-VTEX-API-AppKey": creds.appKey,
    "X-VTEX-API-AppToken": creds.appToken,
    Accept: "application/json",
  };

  try {
    return await retryWithBackoff(
      async () => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15_000);
        try {
          const res = await fetch(url, { headers, signal: ctrl.signal });
          if (!res.ok) {
            const err: any = new Error(`VTEX ${res.status}`);
            err.status = res.status;
            throw err;
          }
          return await res.json();
        } finally {
          clearTimeout(t);
        }
      },
      {
        attempts: 3,
        baseMs: 500,
        capMs: 5000,
        shouldRetry: (err: any) => !err.status || isRetryableStatus(err.status),
      },
    );
  } catch (err: any) {
    console.error(`[vtex-enrichment] fetch detail ${orderId} failed:`, err.message);
    return null;
  }
}

/**
 * Enriquece un order existente en DB con la data completa de VTEX.
 * - Crea/actualiza Customer (con shipping address)
 * - Crea/actualiza Product (SKU-first)
 * - Crea OrderItem (1 por item del pedido)
 * - Completa order.shippingCost, discountValue, promotionNames, couponCode
 */
export async function enrichOrderFromVtex(
  dbOrderId: string,
  orgId: string,
  vData: any,
): Promise<EnrichResult | null> {
  try {
    let customerCreated = false;
    let itemsCreated = 0;

    // ── Customer ─────────────────────────────────────
    const profile = vData.clientProfileData;
    if (profile) {
      const rawEmail = profile.email || "";
      const realEmail = rawEmail ? extractRealEmail(rawEmail) : "";
      const firstName = profile.firstName || null;
      const lastName = profile.lastName || null;
      const customerExtId = profile.userProfileId || rawEmail || `vtex-anon-${vData.orderId}`;

      if (firstName || lastName || realEmail) {
        const customer = await prisma.customer.upsert({
          where: {
            organizationId_externalId: { organizationId: orgId, externalId: customerExtId },
          },
          create: {
            organizationId: orgId,
            externalId: customerExtId,
            email: realEmail || null,
            firstName,
            lastName,
            city: vData.shippingData?.address?.city || null,
            state: vData.shippingData?.address?.state || null,
            country: vData.shippingData?.address?.country || null,
            firstOrderAt: new Date(vData.creationDate),
            lastOrderAt: new Date(vData.creationDate),
            totalOrders: 1,
            totalSpent: (vData.value || 0) / 100,
          },
          update: {
            ...(realEmail ? { email: realEmail } : {}),
            ...(firstName ? { firstName } : {}),
            ...(lastName ? { lastName } : {}),
            city: vData.shippingData?.address?.city || undefined,
            state: vData.shippingData?.address?.state || undefined,
            lastOrderAt: new Date(vData.creationDate),
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
    // S58 O3.2: batch inserts de OrderItems. Antes 1 INSERT por item
    // (5-10 round-trips DB por orden). Ahora: products en serie + 1
    // createMany de TODOS los items. Ahorro ~30% en DB writes.
    //
    // S58 F-RACE: race condition mitigation. Antes count+if(==0)+createMany;
    // si dos calls concurrentes (webhook + backfill) llegaban al mismo
    // dbOrderId entre el count y el createMany podian crear duplicados.
    // Ahora: deleteMany previo + createMany. Atomico desde el punto de
    // vista de "estado final consistente" — la orden queda con EXACTAMENTE
    // los items que devuelve VTEX en este snapshot.
    const items = vData.items || [];
    if (items.length > 0) {
      const orderItemsToCreate: any[] = [];

      for (const item of items) {
        const productExtId = String(item.id || item.productId);
        const realSku = (item.refId || item.sellerSku || "").trim() || null;
        const rawCatIds = item.additionalInfo?.categoriesIds || "";
        const categoryPath = typeof rawCatIds === "string" && rawCatIds.includes("/")
          ? rawCatIds.split("/").filter(Boolean).join(" > ")
          : null;
        const ean = item.ean || item.gtin || null;

        // S58 F-PRICE: usar ?? (nullish coalescing) en vez de || para soportar
        // sellingPrice = 0 (regalo, sample, item promocional). VTEX devuelve
        // sellingPrice y price en centavos. Si AMBOS son null/undefined, fallback 0.
        const rawSelling = item.sellingPrice;
        const rawList = item.price;
        const rawCents = rawSelling != null ? Number(rawSelling) : (rawList != null ? Number(rawList) : 0);
        const unitPrice = Number.isFinite(rawCents) ? rawCents / 100 : 0;

        const product = await upsertProductBySku({
          organizationId: orgId,
          externalId: productExtId,
          sku: realSku,
          create: {
            name: item.name || `SKU ${productExtId}`,
            brand: item.additionalInfo?.brandName || null,
            category: rawCatIds || null,
            ...(categoryPath ? { categoryPath } : {}),
            ...(ean ? { ean } : {}),
            price: unitPrice,
            imageUrl: item.imageUrl || null,
            isActive: true,
          },
          update: {
            name: item.name || undefined,
            price: unitPrice,
            imageUrl: item.imageUrl || undefined,
            ...(categoryPath ? { categoryPath } : {}),
            ...(ean ? { ean } : {}),
          },
        });

        orderItemsToCreate.push({
          orderId: dbOrderId,
          productId: product.id,
          quantity: item.quantity,
          unitPrice,
          totalPrice: unitPrice * item.quantity,
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

    // ── Campos de order que el LIST endpoint no trae ───
    // S58 BP-S58-002: ahora poblamos TODOS los campos opcionales del schema
    // que VTEX expone en el detail. Antes solo 4 (shippingCost, discount,
    // promotion, coupon) y solo si > 0. Ahora 11+ campos sin filtro de > 0
    // (env\u00edo gratis o discount=0 son info valida tambien).
    const totalsArr = Array.isArray(vData.totals) ? vData.totals : [];
    const shippingTotal = totalsArr.find((t: any) => t.id === "Shipping");
    const discountTotal = totalsArr.find((t: any) => t.id === "Discounts");
    const shippingCost = shippingTotal ? Number(shippingTotal.value || 0) / 100 : null;
    const discountValue = discountTotal ? Math.abs(Number(discountTotal.value || 0)) / 100 : null;

    // Promotions: VTEX devuelve el shape como `ratesAndBenefitsData.rateAndBenefitsIdentifiers`
    // (objeto), no array directo. El codigo viejo asumia array y por eso quedaba 100% null.
    const rateIdentifiers = vData.ratesAndBenefitsData?.rateAndBenefitsIdentifiers
      || (Array.isArray(vData.ratesAndBenefitsData) ? vData.ratesAndBenefitsData : []);
    const promoNames = (Array.isArray(rateIdentifiers) ? rateIdentifiers : [])
      .map((r: any) => r?.name || r?.featured || null)
      .filter(Boolean)
      .join(", ") || null;

    const couponCode = vData.marketingData?.coupon || null;
    const utmSource = vData.marketingData?.utmSource || null;
    const utmMedium = vData.marketingData?.utmMedium || null;

    // Shipping logistics
    const logistics = vData.shippingData?.logisticsInfo;
    const firstLogi = Array.isArray(logistics) && logistics.length > 0 ? logistics[0] : null;
    const shippingCarrier = firstLogi?.deliveryCompany || null;
    const shippingService = firstLogi?.selectedSla || firstLogi?.shippingMethod || null;
    const realShippingCost = firstLogi?.sellingPrice != null ? Number(firstLogi.sellingPrice) / 100 : null;

    // Delivery type: pickup (retiro) vs shipping (envio domicilio).
    // S58 F-DELIVERY: parens explicitos para evitar ambiguedad de precedencia.
    // Logica: si hay pickupStoreName O sla matchea pickup/retiro -> PICKUP.
    // Si hay logistica pero no es pickup -> DELIVERY. Si no hay logistica -> null.
    const sla = String(firstLogi?.selectedSla || "").toLowerCase();
    const pickupStoreName = firstLogi?.pickupStoreInfo?.friendlyName || null;
    const isPickup = Boolean(pickupStoreName) || /pickup|retiro/.test(sla);
    const deliveryType = isPickup
      ? "PICKUP"
      : (firstLogi ? "DELIVERY" : null);

    // Channel: VTEX salesChannel (1 = retail default, 2 = B2B, etc).
    // S59 BIS: marcar automaticamente como "marketplace" cuando el orden viene
    // de un marketplace externo publicado via VTEX (Fravega, Banco Provincia,
    // etc). Estos se identifican por prefijo en el externalId. Importante para
    // que los KPIs del pixel los excluyan del calculo de cobertura.
    const externalIdStr = String(vData.orderId || "");
    const isMarketplaceOrder = externalIdStr.startsWith("FVG-") || externalIdStr.startsWith("BPR-");
    const channel = isMarketplaceOrder
      ? "marketplace"
      : (vData.salesChannel != null ? `sc-${vData.salesChannel}` : null);
    const trafficSource = isMarketplaceOrder ? "Marketplace" : undefined;

    // Address fields (additional to Customer.city/state/country).
    const postalCode = vData.shippingData?.address?.postalCode || null;

    // Payment method (primary).
    const transactions = Array.isArray(vData.paymentData?.transactions) ? vData.paymentData.transactions : [];
    const firstTxn = transactions[0];
    const firstPayment = Array.isArray(firstTxn?.payments) && firstTxn.payments[0];
    const paymentMethod = firstPayment?.paymentSystemName || firstPayment?.group || null;

    // Device type: VTEX no expone directamente. Si openTextField o origin tiene info, usar.
    const origin = String(vData.origin || "").toLowerCase();
    const deviceType = /mobile|android|ios|app/.test(origin) ? "MOBILE" : (origin === "fulfillment" || origin === "marketplace" ? null : "DESKTOP");

    await prisma.order.update({
      where: { id: dbOrderId },
      data: {
        // Solo seteamos si hay valor distinto de null (preservamos lo que ya tenia
        // si VTEX no lo devuelve).
        ...(shippingCost !== null ? { shippingCost } : {}),
        ...(discountValue !== null ? { discountValue } : {}),
        ...(promoNames ? { promotionNames: promoNames } : {}),
        ...(couponCode ? { couponCode } : {}),
        ...(channel ? { channel } : {}),
        ...(paymentMethod ? { paymentMethod } : {}),
        ...(shippingCarrier ? { shippingCarrier } : {}),
        ...(shippingService ? { shippingService } : {}),
        ...(realShippingCost !== null ? { realShippingCost } : {}),
        ...(deliveryType ? { deliveryType } : {}),
        ...(pickupStoreName ? { pickupStoreName } : {}),
        ...(postalCode ? { postalCode } : {}),
        ...(deviceType ? { deviceType } : {}),
        // S59 BIS: trafficSource = "Marketplace" para orders FVG-/BPR-,
        // sino el utmSource del campo marketingData (UTM tracking original).
        ...(trafficSource ? { trafficSource } : (utmSource ? { trafficSource: utmSource } : {})),
      },
    });

    return { customerCreated, itemsCreated };
  } catch (err: any) {
    console.error(`[vtex-enrichment] enrichOrder ${dbOrderId} failed:`, err.message);
    return null;
  }
}
