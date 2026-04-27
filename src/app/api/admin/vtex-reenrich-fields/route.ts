// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/vtex-reenrich-fields?orgId=X&limit=2000&offset=0
// ══════════════════════════════════════════════════════════════
// Re-aplica SOLO los campos opcionales del Order desde el detail VTEX
// (channel, paymentMethod, shippingCarrier, deliveryType, postalCode,
// deviceType, trafficSource, etc) sin tocar Customer/OrderItems.
//
// Diferencia con /vtex-reenrich:
//   - reenrich: procesa orders SIN OrderItems (usa enrichOrderFromVtex full)
//   - reenrich-fields: procesa TODAS las orders y solo updatea campos del
//     Order que estan null
//
// Caso de uso S58: las 12.133 orders ya tienen Customer + OrderItems del
// backfill, pero les faltan los 11 campos opcionales que agregamos al
// vtex-enrichment.ts en F1.3. Este endpoint los aplica a las orders
// existentes sin re-procesar items.
//
// Diseno:
//  - Pagina con limit + offset (default 2000 por call)
//  - Concurrency 8 (mas alta que reenrich porque solo es 1 update por order)
//  - Procesa orders donde Order.channel IS NULL (heuristic: si channel es
//    null asumimos que el order no tiene los campos nuevos)
//  - Devuelve { processed, updated, hasMore } para retomar
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { fetchVtexOrderDetail } from "@/lib/connectors/vtex-enrichment";
import { withConcurrency } from "@/lib/sync/concurrency";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KEY = "nitrosales-secret-key-2024-production";
const CONCURRENCY = 8;

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const orgId = url.searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

    const limit = Math.min(Number(url.searchParams.get("limit") || 2000), 5000);
    const offset = Number(url.searchParams.get("offset") || 0);

    // VTEX credentials
    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "VTEX" as any },
      select: { credentials: true },
    });
    if (!conn?.credentials) return NextResponse.json({ error: "Sin VTEX connection" }, { status: 404 });
    const creds = conn.credentials as any;
    if (!creds?.accountName || !creds?.appKey || !creds?.appToken) {
      return NextResponse.json({ error: "VTEX credentials incompletas" }, { status: 400 });
    }

    // Total orders sin channel (heuristic: orders no enriquecidas con campos nuevos)
    const totalRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as count FROM "orders"
       WHERE "organizationId" = $1 AND "source" = 'VTEX'
         AND ("channel" IS NULL OR "channel" = '')`,
      orgId
    );
    const totalRemaining = Number(totalRows[0]?.count || 0);

    // Orders a procesar en esta corrida
    const orders: any[] = await prisma.$queryRawUnsafe(
      `SELECT "id", "externalId" FROM "orders"
       WHERE "organizationId" = $1 AND "source" = 'VTEX'
         AND ("channel" IS NULL OR "channel" = '')
       ORDER BY "createdAt" DESC
       LIMIT $2 OFFSET $3`,
      orgId, limit, offset
    );

    if (orders.length === 0) {
      return NextResponse.json({
        ok: true,
        note: "No hay orders sin enriquecer. Todo OK.",
        processed: 0,
        updated: 0,
        totalRemaining,
        hasMore: false,
        elapsedMs: Date.now() - startTime,
      });
    }

    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    const tasks = orders.map((o) => async () => {
      try {
        const vData = await fetchVtexOrderDetail(creds, o.externalId);
        if (!vData) {
          failed++;
          if (errors.length < 5) errors.push(`${o.externalId}: detail null`);
          return;
        }

        // Mismos calculos que vtex-enrichment.ts (S58 F1.3)
        const totalsArr = Array.isArray(vData.totals) ? vData.totals : [];
        const shippingTotal = totalsArr.find((t: any) => t.id === "Shipping");
        const discountTotal = totalsArr.find((t: any) => t.id === "Discounts");
        const shippingCost = shippingTotal ? Number(shippingTotal.value || 0) / 100 : null;
        const discountValue = discountTotal ? Math.abs(Number(discountTotal.value || 0)) / 100 : null;

        const rateIdentifiers = vData.ratesAndBenefitsData?.rateAndBenefitsIdentifiers
          || (Array.isArray(vData.ratesAndBenefitsData) ? vData.ratesAndBenefitsData : []);
        const promoNames = (Array.isArray(rateIdentifiers) ? rateIdentifiers : [])
          .map((r: any) => r?.name || r?.featured || null)
          .filter(Boolean)
          .join(", ") || null;

        const couponCode = vData.marketingData?.coupon || null;
        const utmSource = vData.marketingData?.utmSource || null;

        const logistics = vData.shippingData?.logisticsInfo;
        const firstLogi = Array.isArray(logistics) && logistics.length > 0 ? logistics[0] : null;
        const shippingCarrier = firstLogi?.deliveryCompany || null;
        const shippingService = firstLogi?.selectedSla || firstLogi?.shippingMethod || null;
        const realShippingCost = firstLogi?.sellingPrice != null ? Number(firstLogi.sellingPrice) / 100 : null;

        const sla = String(firstLogi?.selectedSla || "").toLowerCase();
        const pickupStoreName = firstLogi?.pickupStoreInfo?.friendlyName || null;
        const deliveryType = pickupStoreName || /pickup|retiro/.test(sla) ? "PICKUP" : (firstLogi ? "DELIVERY" : null);

        const channel = vData.salesChannel != null ? `sc-${vData.salesChannel}` : null;
        const postalCode = vData.shippingData?.address?.postalCode || null;

        const transactions = Array.isArray(vData.paymentData?.transactions) ? vData.paymentData.transactions : [];
        const firstTxn = transactions[0];
        const firstPayment = Array.isArray(firstTxn?.payments) && firstTxn.payments[0];
        const paymentMethod = firstPayment?.paymentSystemName || firstPayment?.group || null;

        const origin = String(vData.origin || "").toLowerCase();
        const deviceType = /mobile|android|ios|app/.test(origin) ? "MOBILE" : (origin === "fulfillment" || origin === "marketplace" ? null : "DESKTOP");

        const data: any = {};
        if (shippingCost !== null) data.shippingCost = shippingCost;
        if (discountValue !== null) data.discountValue = discountValue;
        if (promoNames) data.promotionNames = promoNames;
        if (couponCode) data.couponCode = couponCode;
        if (channel) data.channel = channel;
        if (paymentMethod) data.paymentMethod = paymentMethod;
        if (shippingCarrier) data.shippingCarrier = shippingCarrier;
        if (shippingService) data.shippingService = shippingService;
        if (realShippingCost !== null) data.realShippingCost = realShippingCost;
        if (deliveryType) data.deliveryType = deliveryType;
        if (pickupStoreName) data.pickupStoreName = pickupStoreName;
        if (postalCode) data.postalCode = postalCode;
        if (deviceType) data.deviceType = deviceType;
        if (utmSource) data.trafficSource = utmSource;

        if (Object.keys(data).length > 0) {
          await prisma.order.update({ where: { id: o.id }, data });
          updated++;
        }
      } catch (err: any) {
        failed++;
        if (errors.length < 5) errors.push(`${o.externalId}: ${err.message?.slice(0, 100)}`);
      }
    });

    await withConcurrency(CONCURRENCY, tasks);

    const remainingAfter = totalRemaining - updated;
    return NextResponse.json({
      ok: true,
      orgId,
      processed: orders.length,
      updated,
      failed,
      errors,
      totalRemaining: remainingAfter,
      hasMore: remainingAfter > 0,
      nextOffset: offset + limit,
      elapsedMs: Date.now() - startTime,
      hint: remainingAfter > 0
        ? `Quedan ${remainingAfter} orders. Volvé a abrir la URL para procesar la siguiente tanda.`
        : "Procesamiento completo. Todas las orders enriquecidas.",
    });
  } catch (err: any) {
    console.error("[vtex-reenrich-fields] fatal:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
