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
    const account = process.env.VTEX_ACCOUNT || "";
    const appKey = process.env.VTEX_APP_KEY || "";
    const appToken = process.env.VTEX_APP_TOKEN || "";

    if (!account || !appKey || !appToken) {
      return NextResponse.json({ error: "Missing VTEX credentials" }, { status: 400 });
    }

    const org = await prisma.organization.findFirst({ where: { slug: "elmundodeljuguete" } });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    // Find orders that have no items yet
    const ordersWithoutItems = await prisma.order.findMany({
      where: {
        organizationId: org.id,
        items: { none: {} }
      },
      take: batchSize,
      orderBy: { orderDate: "desc" }
    });

    if (ordersWithoutItems.length === 0) {
      return NextResponse.json({ ok: true, message: "All orders have items", processed: 0 });
    }

    const totalWithoutItems = await prisma.order.count({
      where: { organizationId: org.id, items: { none: {} } }
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
            "Accept": "application/json",
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
              where: { organizationId_externalId: { organizationId: org.id, externalId: client.userProfileId || client.email } },
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
              }
            });
            customersCreated++;

            // Link customer to order
            const cust = await prisma.customer.findUnique({
              where: { organizationId_externalId: { organizationId: org.id, externalId: client.userProfileId || client.email } }
            });
            if (cust) {
              await prisma.order.update({ where: { id: order.id }, data: { customerId: cust.id } });
            }
          } catch (ce: any) {
            errors.push("customer " + order.externalId + ": " + ce.message.substring(0, 80));
          }
        }

        // --- ITEMS & PRODUCTS ---
        const items = detail.items || [];
        for (const item of items) {
          try {
            // Upsert Product
            const productExtId = String(item.productId || item.id);
            let product = null;
            try {
              product = await prisma.product.upsert({
                where: { organizationId_externalId: { organizationId: org.id, externalId: productExtId } },
                update: {
                  name: item.name || "Sin nombre",
                  sku: item.sellerSku || item.sku || null,
                  price: (item.sellingPrice || item.price || 0) / 100,
                  imageUrl: item.imageUrl || null,
                  isActive: true,
                },
                create: {
                  externalId: productExtId,
                  name: item.name || "Sin nombre",
                  sku: item.sellerSku || item.sku || null,
                  price: (item.sellingPrice || item.price || 0) / 100,
                  imageUrl: item.imageUrl || null,
                  isActive: true,
                  organizationId: org.id,
                }
              });
              productsCreated++;
            } catch (pe: any) {
              errors.push("product " + productExtId + ": " + pe.message.substring(0, 80));
            }

            // Create OrderItem
            await prisma.orderItem.create({
              data: {
                quantity: item.quantity || 1,
                unitPrice: (item.sellingPrice || item.price || 0) / 100,
                totalPrice: ((item.sellingPrice || item.price || 0) * (item.quantity || 1)) / 100,
                orderId: order.id,
                productId: product?.id || null,
              }
            });
            itemsCreated++;
          } catch (ie: any) {
            errors.push("item " + order.externalId + ": " + ie.message.substring(0, 80));
          }
        }

        // Update order with device info if available
        if (detail.deviceInfo || detail.origin) {
          try {
            await prisma.order.update({
              where: { id: order.id },
              data: {
                deviceType: detail.deviceInfo?.deviceType || null,
                trafficSource: detail.origin || null,
              }
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
