import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

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

    const account = process.env.VTEX_ACCOUNT || "";
    const appKey = process.env.VTEX_APP_KEY || "";
    const appToken = process.env.VTEX_APP_TOKEN || "";

    if (!account || !appKey || !appToken) {
      return NextResponse.json(
        { error: "Missing VTEX credentials" },
        { status: 400 }
      );
    }

    const org = await prisma.organization.findFirst({
      where: { slug: "elmundodeljuguete" },
    });
    if (!org)
      return NextResponse.json({ error: "Org not found" }, { status: 404 });

    /* ── MODE: resync-products ──────────────────────────────────────────
       Re-fetch VTEX details for orders whose products lack brand/category.
       This updates existing products without creating duplicate items. */
    if (mode === "resync-products") {
      // Find products with null brand that have at least one order item
      const productsToUpdate = await prisma.product.findMany({
        where: {
          organizationId: org.id,
          brand: null,
          items: { some: {} },
        },
        include: {
          items: {
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
        where: { organizationId: org.id, brand: null, items: { some: {} } },
      });

      let updated = 0;
      const errors: string[] = [];

      for (const product of productsToUpdate) {
        try {
          const orderExtId = product.items[0]?.order?.externalId;
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
              String(i.productId || i.id) === product.externalId
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
            `product ${product.externalId}: ${e.message.substring(0, 80)}`
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

    /* ── MODE: normal (default) ─────────────────────────────────────────
       Original behavior: process orders without items. */

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
            const productExtId = String(item.productId || item.id);
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

        if (detail.deviceInfo || detail.origin) {
          try {
            await prisma.order.update({
              where: { id: order.id },
              data: {
                deviceType: detail.deviceInfo?.deviceType || null,
                trafficSource: detail.origin || null,
              },
            });
          } catch {}
        }

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

function extractBrandCategory(item: any) {
  const brand = item.additionalInfo?.brandName || item.brandName || null;
  let category = null;
  const catSource = item.additionalInfo?.categories || item.productCategories || null;
  if (catSource && typeof catSource === "object") {
    const values = Object.values(catSource).filter(Boolean);
    if (values.length > 0) category = values[values.length - 1];
  }
  return { brand, category };
}
