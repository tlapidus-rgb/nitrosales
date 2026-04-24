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
    const shippingCost = (vData.totals?.find((t: any) => t.id === "Shipping")?.value || 0) / 100;
    const discountValue = Math.abs(vData.totals?.find((t: any) => t.id === "Discounts")?.value || 0) / 100;
    const promoNames = (Array.isArray(vData.ratesAndBenefitsData) ? vData.ratesAndBenefitsData : [])
      .map((r: any) => r.name)
      .filter(Boolean)
      .join(", ") || null;
    const couponCode = vData.marketingData?.coupon || null;

    await prisma.order.update({
      where: { id: dbOrderId },
      data: {
        ...(shippingCost > 0 ? { shippingCost } : {}),
        ...(discountValue > 0 ? { discountValue } : {}),
        ...(promoNames ? { promotionNames: promoNames } : {}),
        ...(couponCode ? { couponCode } : {}),
      },
    });

    return { customerCreated, itemsCreated };
  } catch (err: any) {
    console.error(`[vtex-enrichment] enrichOrder ${dbOrderId} failed:`, err.message);
    return null;
  }
}
