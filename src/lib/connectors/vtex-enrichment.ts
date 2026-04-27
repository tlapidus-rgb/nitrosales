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
 * Remueve el formato enmascarado de emails VTEX para obtener el email real
 * (VTEX enmascara emails en entorno de sandbox/preview).
 */
export function extractRealEmail(vtexEmail: string): string {
  if (!vtexEmail) return vtexEmail;
  const vtexAnonPattern = /^[a-f0-9]{20,}@ct\.vtex\.com\.br$/i;
  if (vtexAnonPattern.test(vtexEmail)) return "";
  const vtexMaskPattern = /-[0-9a-z]+b?\.ct\.vtex\.com\.br$/i;
  if (vtexMaskPattern.test(vtexEmail)) {
    return vtexEmail.replace(vtexMaskPattern, "").toLowerCase().trim();
  }
  return vtexEmail.toLowerCase().trim();
}

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
    const items = vData.items || [];
    if (items.length > 0) {
      const existingItems = await prisma.orderItem.count({ where: { orderId: dbOrderId } });
      if (existingItems === 0) {
        for (const item of items) {
          const productExtId = String(item.id || item.productId);
          // SKU-first: refId o sellerSku es el SKU real.
          const realSku = (item.refId || item.sellerSku || "").trim() || null;
          const product = await upsertProductBySku({
            organizationId: orgId,
            externalId: productExtId,
            sku: realSku,
            create: {
              name: item.name || `SKU ${productExtId}`,
              brand: item.additionalInfo?.brandName || null,
              category: item.additionalInfo?.categoriesIds || null,
              price: (item.sellingPrice || item.price) / 100,
              imageUrl: item.imageUrl || null,
              isActive: true,
            },
            update: {
              name: item.name || undefined,
              price: (item.sellingPrice || item.price) / 100,
              imageUrl: item.imageUrl || undefined,
            },
          });

          await prisma.orderItem.create({
            data: {
              orderId: dbOrderId,
              productId: product.id,
              quantity: item.quantity,
              unitPrice: (item.sellingPrice || item.price) / 100,
              totalPrice: ((item.sellingPrice || item.price) * item.quantity) / 100,
              costPrice: (product as any).costPrice ?? null,
            } as any,
          });
          itemsCreated++;
        }
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
    // Heuristic: pickup si selectedSla incluye "pickup" o "retiro" o si hay pickupPointId.
    const sla = String(firstLogi?.selectedSla || "").toLowerCase();
    const pickupStoreName = firstLogi?.pickupStoreInfo?.friendlyName || null;
    const deliveryType = pickupStoreName || /pickup|retiro/.test(sla) ? "PICKUP" : (firstLogi ? "DELIVERY" : null);

    // Channel: VTEX salesChannel (1 = retail default, 2 = B2B, etc).
    const channel = vData.salesChannel != null ? `sc-${vData.salesChannel}` : null;

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
        ...(utmSource ? { trafficSource: utmSource } : {}),
      },
    });

    return { customerCreated, itemsCreated };
  } catch (err: any) {
    console.error(`[vtex-enrichment] enrichOrder ${dbOrderId} failed:`, err.message);
    return null;
  }
}
