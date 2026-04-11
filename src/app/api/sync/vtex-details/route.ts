import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getVtexConfig } from "@/lib/vtex-credentials";
import { getOrganization } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const batchSize = parseInt(url.searchParams.get("batch") || "5");
    const mode = url.searchParams.get("mode") || "normal";

    const org = await getOrganization();

    const vtexConfig = await getVtexConfig(org.id);
    const account = vtexConfig.creds.accountName;
    const appKey = vtexConfig.creds.appKey;
    const appToken = vtexConfig.creds.appToken;

    /* ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ MODE: resync-products ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ
       Re-fetch VTEX details for orders whose products lack brand/category.
       This updates existing products without creating duplicate items. */
    if (mode === "resync-products") {
      // Find products with null brand that have at least one order item
      const productsToUpdate = await prisma.product.findMany({
        where: {
          organizationId: org.id,
          brand: null,
          orderItems: { some: {} },
        },
        include: {
          orderItems: {
            take: 1,
            include: { order: { select: { externalId: true } } },
          },
        },
        take: batchSize,
      });

      if (productsToUpdate.length === 0) {
        return NextResponse.json({
          ok: true,
          mode: "resync-products",
          message: "All products already have brand info",
          updated: 0,
        });
      }

      const totalMissing = await prisma.product.count({
        where: { organizationId: org.id, brand: null, orderItems: { some: {} } },
      });

      let updated = 0;
      const errors: string[] = [];

      for (const product of productsToUpdate) {
        try {
          const orderExtId = product.orderItems[0]?.order?.externalId;
          if (!orderExtId) continue;

          const detailUrl = `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders/${orderExtId}`;
          const res = await fetch(detailUrl, {
            headers: {
              "X-VTEX-API-AppKey": appKey,
              "X-VTEX-API-AppToken": appToken,
              Accept: "application/json",
            },
          });

          if (!res.ok) {
            errors.push(`product ${product.externalId}: HTTP ${res.status}`);
            continue;
          }

          const detail = await res.json();
          const items = detail.items || [];

          // Find the matching item for this product
          const matchingItem = items.find(
            (i: any) =>
              String(i.id) === product.externalId ||
              String(i.productId) === product.externalId
          );

          if (matchingItem) {
            const { brand, category } = extractBrandCategory(matchingItem);

            if (brand || category) {
              await prisma.product.update({
                where: { id: product.id },
                data: {
                  ...(brand ? { brand } : {}),
                  ...(category ? { category } : {}),
                },
              });
              updated++;
            }
          }
        } catch (e: any) {
          errors.push(
            `product ${product.externalId}: ${e.message.substring(0, 200)}`
          );
        }
      }

      return NextResponse.json({
        ok: true,
        mode: "resync-products",
        updated,
        remaining: totalMissing - updated,
        errors: errors.slice(0, 10),
      });
    }

    /* ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ MODE: normal (default) ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ
       Original behavior: process orders without items. */

    /* ── MODE: resync-promos ── */
    if (mode === "resync-promos") {
      const ordersNeedPromo = await prisma.$queryRawUnsafe<Array<{ id: string; externalId: string }>>(`
        SELECT o.id, o."externalId"
        FROM orders o
        JOIN order_items oi ON oi."orderId" = o.id
        WHERE o."organizationId" = '${org.id}'
          AND (o."promotionNames" IS NULL OR o."promotionNames" = '')
        GROUP BY o.id, o."externalId"
        ORDER BY o."orderDate" DESC
        LIMIT ${batchSize}
      `);

      if (ordersNeedPromo.length === 0) {
        return NextResponse.json({ ok: true, mode: "resync-promos", message: "All orders have promo data", updated: 0 });
      }

      const totalMissingResult = await prisma.$queryRawUnsafe<[{ cnt: string }]>(`
        SELECT COUNT(DISTINCT o.id)::text AS cnt
        FROM orders o
        JOIN order_items oi ON oi."orderId" = o.id
        WHERE o."organizationId" = '${org.id}'
          AND (o."promotionNames" IS NULL OR o."promotionNames" = '')
      `);
      const totalMissing = Number(totalMissingResult[0].cnt);

      let updated = 0;
      const errors: string[] = [];

      for (const order of ordersNeedPromo) {
        try {
          const detailUrl = `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders/${order.externalId}`;
          const res = await fetch(detailUrl, {
            headers: { "X-VTEX-API-AppKey": appKey, "X-VTEX-API-AppToken": appToken, Accept: "application/json" },
          });
          if (!res.ok) { errors.push(order.externalId + ": HTTP " + res.status); continue; }
          const detail = await res.json();
          const rbd = detail.ratesAndBenefitsData;
          const promoNames = (Array.isArray(rbd) ? rbd : []).map((r: any) => r?.name).filter(Boolean).join(", ");
          await prisma.$executeRawUnsafe(
            `UPDATE orders SET "promotionNames" = $1 WHERE id = $2`,
            promoNames || "Sin promo",
            order.id
          );
          updated++;
        } catch (e: any) {
          errors.push(order.externalId + ": " + e.message.substring(0, 80));
        }
      }

      return NextResponse.json({
        ok: true, mode: "resync-promos", updated, remaining: totalMissing - updated, errors: errors.slice(0, 10),
      });
    }

    // ═══ MODE: resync-coupons — backfill couponCode from VTEX marketingData ═══
    if (mode === "resync-coupons") {
      const ordersNeedCoupon = await prisma.$queryRawUnsafe<Array<{ id: string; externalId: string }>>(`
        SELECT o.id, o."externalId"
        FROM orders o
        WHERE o."organizationId" = '${org.id}'
          AND o.source = 'VTEX'
          AND o."couponCode" IS NULL
        ORDER BY o."orderDate" DESC
        LIMIT ${batchSize}
      `);

      if (ordersNeedCoupon.length === 0) {
        return NextResponse.json({ ok: true, mode: "resync-coupons", message: "All VTEX orders checked for coupons", updated: 0 });
      }

      const totalMissingResult = await prisma.$queryRawUnsafe<[{ cnt: string }]>(`
        SELECT COUNT(*)::text AS cnt FROM orders
        WHERE "organizationId" = '${org.id}' AND source = 'VTEX' AND "couponCode" IS NULL
      `);
      const totalMissing = Number(totalMissingResult[0].cnt);

      let updated = 0;
      let noCoupon = 0;
      const errors: string[] = [];

      for (const order of ordersNeedCoupon) {
        try {
          const detailUrl = `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders/${order.externalId}`;
          const res = await fetch(detailUrl, {
            headers: { "X-VTEX-API-AppKey": appKey, "X-VTEX-API-AppToken": appToken, Accept: "application/json" },
          });
          if (!res.ok) { errors.push(order.externalId + ": HTTP " + res.status); continue; }
          const detail = await res.json();
          const coupon = detail.marketingData?.coupon || null;

          await prisma.$executeRawUnsafe(
            `UPDATE orders SET "couponCode" = $1 WHERE id = $2`,
            coupon || "__none__",
            order.id
          );
          if (coupon) updated++;
          else noCoupon++;
        } catch (e: any) {
          errors.push(order.externalId + ": " + e.message.substring(0, 80));
        }
      }

      return NextResponse.json({
        ok: true, mode: "resync-coupons", updated, noCoupon, remaining: totalMissing - updated - noCoupon, errors: errors.slice(0, 10),
      });
    }

    // ═══ MODE: resync-postalcodes — backfill postalCode from VTEX shippingData ═══
    if (mode === "resync-postalcodes") {
      const ordersNeedPostal = await prisma.$queryRawUnsafe<Array<{ id: string; externalId: string }>>(`
        SELECT o.id, o."externalId"
        FROM orders o
        WHERE o."organizationId" = '${org.id}'
          AND o.source = 'VTEX'
          AND (o."postalCode" IS NULL OR o."postalCode" = '')
        ORDER BY o."orderDate" DESC
        LIMIT ${batchSize}
      `);

      if (ordersNeedPostal.length === 0) {
        return NextResponse.json({ ok: true, mode: "resync-postalcodes", message: "All VTEX orders have postalCode", updated: 0 });
      }

      const totalMissingResult = await prisma.$queryRawUnsafe<[{ cnt: string }]>(`
        SELECT COUNT(*)::text AS cnt FROM orders
        WHERE "organizationId" = '${org.id}' AND source = 'VTEX'
          AND ("postalCode" IS NULL OR "postalCode" = '')
      `);
      const totalMissing = Number(totalMissingResult[0].cnt);

      let updated = 0;
      const errors: string[] = [];

      for (const order of ordersNeedPostal) {
        try {
          const detailUrl = `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders/${order.externalId}`;
          const res = await fetch(detailUrl, {
            headers: { "X-VTEX-API-AppKey": appKey, "X-VTEX-API-AppToken": appToken, Accept: "application/json" },
          });
          if (!res.ok) { errors.push(order.externalId + ": HTTP " + res.status); continue; }
          const detail = await res.json();
          const postal = detail.shippingData?.address?.postalCode || null;

          if (postal) {
            await prisma.order.update({
              where: { id: order.id },
              data: { postalCode: postal },
            });
            updated++;
          }
        } catch (e: any) {
          errors.push(order.externalId + ": " + e.message.substring(0, 80));
        }
      }

      return NextResponse.json({
        ok: true, mode: "resync-postalcodes", updated, remaining: totalMissing - updated, errors: errors.slice(0, 10),
      });
    }

    // ═══ MODE: resync-delivery — backfill deliveryType for orders missing it ═══
    if (mode === "resync-delivery") {
      const ordersNeedDelivery = await prisma.$queryRawUnsafe<Array<{ id: string; externalId: string }>>(`
        SELECT o.id, o."externalId"
        FROM orders o
        WHERE o."organizationId" = '${org.id}'
          AND o.source = 'VTEX'
          AND (o."deliveryType" IS NULL OR o."deliveryType" = '')
        ORDER BY o."orderDate" DESC
        LIMIT ${batchSize}
      `);

      if (ordersNeedDelivery.length === 0) {
        return NextResponse.json({ ok: true, mode: "resync-delivery", message: "All VTEX orders have deliveryType", updated: 0 });
      }

      const totalMissingResult = await prisma.$queryRawUnsafe<[{ cnt: string }]>(`
        SELECT COUNT(*)::text AS cnt FROM orders
        WHERE "organizationId" = '${org.id}' AND source = 'VTEX'
          AND ("deliveryType" IS NULL OR "deliveryType" = '')
      `);
      const totalMissing = Number(totalMissingResult[0].cnt);

      let updated = 0;
      const errors: string[] = [];

      for (const order of ordersNeedDelivery) {
        try {
          const detailUrl = `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders/${order.externalId}`;
          const res = await fetch(detailUrl, {
            headers: { "X-VTEX-API-AppKey": appKey, "X-VTEX-API-AppToken": appToken, Accept: "application/json" },
          });
          if (!res.ok) { errors.push(order.externalId + ": HTTP " + res.status); continue; }
          const detail = await res.json();

          const logInfo = detail.shippingData?.logisticsInfo || [];
          let carrier: string | null = null;
          let sla: string | null = null;
          let isPk = false;
          let pkName: string | null = null;
          for (const li of logInfo) {
            if (li?.pickupStoreInfo?.isPickupStore === true) { isPk = true; pkName = li.pickupStoreInfo.friendlyName || null; }
            if (li?.deliveryCompany && !carrier) carrier = li.deliveryCompany;
            if (li?.selectedSla && !sla) sla = li.selectedSla;
          }

          await prisma.order.update({
            where: { id: order.id },
            data: {
              deliveryType: isPk ? "pickup" : "shipping",
              pickupStoreName: isPk ? pkName : null,
              shippingCarrier: carrier,
              shippingService: sla,
              postalCode: detail.shippingData?.address?.postalCode || null,
            },
          });
          updated++;
        } catch (e: any) {
          errors.push(order.externalId + ": " + e.message.substring(0, 80));
        }
      }

      return NextResponse.json({
        ok: true, mode: "resync-delivery", updated, remaining: totalMissing - updated, errors: errors.slice(0, 10),
      });
    }

    const ordersWithoutItems = await prisma.order.findMany({
      where: {
        organizationId: org.id,
        items: { none: {} },
      },
      take: batchSize,
      orderBy: { orderDate: "desc" },
    });

    if (ordersWithoutItems.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "All orders have items",
        processed: 0,
      });
    }

    const totalWithoutItems = await prisma.order.count({
      where: {
        organizationId: org.id,
        items: { none: {} },
      },
    });

    let processed = 0;
    let itemsCreated = 0;
    let productsCreated = 0;
    let customersCreated = 0;
    const errors: string[] = [];

    for (const order of ordersWithoutItems) {
      try {
        const detailUrl = `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders/${order.externalId}`;
        const res = await fetch(detailUrl, {
          headers: {
            "X-VTEX-API-AppKey": appKey,
            "X-VTEX-API-AppToken": appToken,
            Accept: "application/json",
          },
        });

        if (!res.ok) {
          errors.push(order.externalId + ": HTTP " + res.status);
          continue;
        }

        const detail = await res.json();

        // --- SAFETY NET: Delete incomplete orders (empty VTEX status) ---
      const vtexStatus = (detail.status || "").trim();
      if (!vtexStatus) {
        await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
        await prisma.order.delete({ where: { id: order.id } });
        errors.push(order.externalId + ": deleted-incomplete");
        continue;
      }

      // --- CUSTOMER ---
        const client = detail.clientProfileData;
        if (client && client.email) {
          try {
            await prisma.customer.upsert({
              where: {
                organizationId_externalId: {
                  organizationId: org.id,
                  externalId: client.userProfileId || client.email,
                },
              },
              update: {
                email: client.email,
                firstName: client.firstName || null,
                lastName: client.lastName || null,
                lastOrderAt: order.orderDate,
                totalOrders: { increment: 1 },
                totalSpent: { increment: order.totalValue },
              },
              create: {
                externalId: client.userProfileId || client.email,
                email: client.email,
                firstName: client.firstName || null,
                lastName: client.lastName || null,
                city: detail.shippingData?.address?.city || null,
                state: detail.shippingData?.address?.state || null,
                country: detail.shippingData?.address?.country || null,
                firstOrderAt: order.orderDate,
                lastOrderAt: order.orderDate,
                totalOrders: 1,
                totalSpent: order.totalValue,
                organizationId: org.id,
              },
            });
            customersCreated++;

            const cust = await prisma.customer.findUnique({
              where: {
                organizationId_externalId: {
                  organizationId: org.id,
                  externalId: client.userProfileId || client.email,
                },
              },
            });
            if (cust) {
              await prisma.order.update({
                where: { id: order.id },
                data: { customerId: cust.id },
              });
            }
          } catch (ce: any) {
            errors.push(
              "customer " + order.externalId + ": " + ce.message.substring(0, 80)
            );
          }
        }

        const items = detail.items || [];
        for (const item of items) {
          try {
            const { brand, category } = extractBrandCategory(item);
            // Usar SKU ID (item.id) como externalId para alinear con inventory sync.
            // VTEX item.id = SKU ID, item.productId = Product ID (nivel padre).
            const productExtId = String(item.id || item.productId);
            let product = null;
            try {
              product = await prisma.product.upsert({
                where: {
                  organizationId_externalId: {
                    organizationId: org.id,
                    externalId: productExtId,
                  },
                },
                update: {
                  name: item.name || "Sin nombre",
                  sku: item.sellerSku || item.sku || null,
                  price: (item.sellingPrice || item.price || 0) / 100,
                  imageUrl: item.imageUrl || null,
                  isActive: true,
                  brand,
                  category,
                },
                create: {
                  externalId: productExtId,
                  name: item.name || "Sin nombre",
                  sku: item.sellerSku || item.sku || null,
                  price: (item.sellingPrice || item.price || 0) / 100,
                  imageUrl: item.imageUrl || null,
                  isActive: true,
                  brand,
                  category,
                  organizationId: org.id,
                },
              });
              productsCreated++;
            } catch (pe: any) {
              errors.push("product " + productExtId + ": " + pe.message.substring(0, 80));
            }

            await prisma.orderItem.create({
              data: {
                quantity: item.quantity || 1,
                unitPrice: (item.sellingPrice || item.price || 0) / 100,
                totalPrice: ((item.sellingPrice || item.price || 0) * (item.quantity || 1)) / 100,
                orderId: order.id,
                productId: product?.id || null,
              },
            });
            itemsCreated++;
          } catch (ie: any) {
            errors.push("item " + order.externalId + ": " + ie.message.substring(0, 80));
          }
        }

        // ── Extract promotion names from VTEX ratesAndBenefitsData ──
      const rbd2 = detail.ratesAndBenefitsData;
      const promoNames = (Array.isArray(rbd2) ? rbd2 : [])
        .map((r: any) => r?.name)
        .filter(Boolean)
        .join(', ');
      if (promoNames) {
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE orders SET "promotionNames" = $1 WHERE id = $2`,
            promoNames,
            order.id
          );
        } catch {}
      }

      // ── Extract delivery type + pickup store name from VTEX logisticsInfo ──
      // Iterate ALL logisticsInfo items (one per package/item) to find the best carrier/SLA
      const allLogInfo = detail.shippingData?.logisticsInfo || [];
      let bestCarrier: string | null = null;
      let bestSla: string | null = null;
      let isPickup = false;
      let pickupName: string | null = null;

      for (const li of allLogInfo) {
        // Check for pickup
        if (li?.pickupStoreInfo?.isPickupStore === true) {
          isPickup = true;
          pickupName = li.pickupStoreInfo.friendlyName || null;
        }
        // Prefer entry with deliveryCompany (actual carrier name)
        if (li?.deliveryCompany && !bestCarrier) {
          bestCarrier = li.deliveryCompany;
        }
        // Capture selectedSla (shipping service name)
        if (li?.selectedSla && !bestSla) {
          bestSla = li.selectedSla;
        }
      }

      // Fallback to first entry if no carrier/SLA found in loop
      const logInfoFirst = allLogInfo[0];
      if (!bestCarrier && logInfoFirst?.deliveryCompany) bestCarrier = logInfoFirst.deliveryCompany;
      if (!bestSla && logInfoFirst?.selectedSla) bestSla = logInfoFirst.selectedSla;

      const shipTotalCents = ((detail.totals || []).find((t: any) => t.id === "Shipping") || {}).value || 0;

      try {
          await prisma.order.update({
              where: { id: order.id },
              data: {
                deviceType: detail.deviceInfo?.deviceType || null,
                trafficSource: detail.origin || null,
                deliveryType: isPickup ? "pickup" : "shipping",
                pickupStoreName: isPickup ? pickupName : null,
                shippingCost: shipTotalCents / 100,
                postalCode: detail.shippingData?.address?.postalCode || null,
                shippingCarrier: bestCarrier,
                shippingService: bestSla,
              },
            });
          } catch {}


        processed++;
      } catch (oe: any) {
        errors.push(order.externalId + ": " + oe.message.substring(0, 100));
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      remaining: totalWithoutItems - processed,
      itemsCreated,
      productsCreated,
      customersCreated,
      errors: errors.slice(0, 10),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function extractBrandCategory(item: any): {
  brand: string | null;
  category: string | null;
} {
  const brand =
    item.additionalInfo?.brandName ||
    item.brandName ||
    null;

  let category: string | null = null;

  const catSource =
    item.additionalInfo?.categories ||
    item.productCategories ||
    null;

  if (catSource && typeof catSource === "object") {
    const values = Object.values(catSource).filter(Boolean);
    if (values.length > 0) {
      const last: any = values[values.length - 1];
      // VTEX may return plain strings OR objects like {id, name}
      if (typeof last === "string") {
        category = last;
      } else if (last && typeof last === "object" && last.name) {
        category = last.name;
      }
    }
  }

  return { brand, category };
}
