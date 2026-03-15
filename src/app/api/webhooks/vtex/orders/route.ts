// ══════════════════════════════════════════════════════════════
// Webhook: VTEX Order Notifications (Real-time)
// ══════════════════════════════════════════════════════════════
// Endpoint: POST /api/webhooks/vtex/orders
//
// VTEX Order Hook envía una notificación cada vez que una orden
// cambia de estado. Este endpoint recibe la notificación y
// procesa la orden completa (items, productos, cliente) al instante.
//
// Payload de VTEX:
// {
//   "Domain": "Fulfillment",
//   "OrderId": "v12345678abc-01",
//   "State": "payment-approved",
//   "LastState": "order-created",
//   "LastChange": "2024-01-15T10:30:00.000Z",
//   "CurrentChange": "2024-01-15T10:35:00.000Z",
//   "Origin": { "Account": "mundojuguete", "Key": "vtex" }
// }
//
// Este webhook reemplaza la necesidad de correr vtex-details vía cron.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Map VTEX status → NitroSales status
function mapStatus(vtexStatus: string): string {
  const statusMap: Record<string, string> = {
    "order-created": "PENDING",
    "on-order-completed": "PENDING",
    "payment-pending": "PENDING",
    "waiting-for-seller-confirmation": "PENDING",
    "payment-approved": "APPROVED",
    "waiting-for-authorization": "APPROVED",
    "approve-payment": "APPROVED",
    "request-cancel": "CANCELLED",
    cancel: "CANCELLED",
    canceled: "CANCELLED",
    "window-to-cancel": "APPROVED",
    handling: "INVOICED",
    "waiting-for-mkt-authorization": "APPROVED",
    "waiting-ffmt-authorization": "APPROVED",
    invoiced: "INVOICED",
    invoice: "INVOICED",
    replaced: "CANCELLED",
    "cancellation-requested": "CANCELLED",
  };
  const lower = vtexStatus.toLowerCase().replace(/\s+/g, "-");
  return statusMap[lower] || "PENDING";
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // ── Validate key ──
    const key = req.nextUrl.searchParams.get("key") || "";
    if (key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse VTEX payload ──
    const body = await req.json();
    const orderId = body.OrderId;
    const state = body.State;

    if (!orderId) {
      return NextResponse.json({ error: "Missing OrderId" }, { status: 400 });
    }

    console.log(`[Webhook:Orders] Received: ${orderId} → ${state}`);

    // ── Get organization + VTEX credentials ──
    const connection = await prisma.connection.findFirst({
      where: { platform: "VTEX", status: "ACTIVE" },
      include: { organization: true },
    });

    if (!connection) {
      return NextResponse.json({ error: "No active VTEX connection" }, { status: 404 });
    }

    const org = connection.organization;
    const creds = connection.credentials as any;
    const vtexBaseUrl = `https://${creds.accountName}.vtexcommercestable.com.br`;
    const vtexHeaders = {
      "X-VTEX-API-AppKey": creds.appKey,
      "X-VTEX-API-AppToken": creds.appToken,
      Accept: "application/json",
    };

    // ── Fetch full order detail from VTEX ──
    const orderRes = await fetch(`${vtexBaseUrl}/api/oms/pvt/orders/${orderId}`, {
      headers: vtexHeaders,
    });

    if (!orderRes.ok) {
      console.error(`[Webhook:Orders] Failed to fetch order ${orderId}: ${orderRes.status}`);
      // Return 200 to VTEX so it doesn't retry endlessly
      return NextResponse.json({
        ok: false,
        error: `Failed to fetch order: ${orderRes.status}`,
        orderId,
      });
    }

    const vtexOrder = await orderRes.json();

    // ── Upsert Order ──
    const nsStatus = mapStatus(vtexOrder.status || state);
    const totalValue = (vtexOrder.value || 0) / 100; // VTEX uses cents
    const items = vtexOrder.items || [];
    const shippingCost = vtexOrder.totals?.find((t: any) => t.id === "Shipping")?.value || 0;
    const discountValue = Math.abs(
      vtexOrder.totals?.find((t: any) => t.id === "Discounts")?.value || 0
    );

    // Determine payment method
    const payments = vtexOrder.paymentData?.transactions?.[0]?.payments || [];
    const paymentMethod = payments.length > 0
      ? payments.map((p: any) => p.paymentSystemName || p.group).join(", ")
      : null;

    const order = await prisma.order.upsert({
      where: {
        organizationId_externalId: {
          organizationId: org.id,
          externalId: orderId,
        },
      },
      create: {
        organizationId: org.id,
        externalId: orderId,
        status: nsStatus as any,
        totalValue,
        currency: vtexOrder.storePreferencesData?.currencyCode || "ARS",
        itemCount: items.length,
        channel: vtexOrder.salesChannel || null,
        paymentMethod,
        shippingCost: shippingCost / 100,
        discountValue: discountValue / 100,
        orderDate: new Date(vtexOrder.creationDate),
      },
      update: {
        status: nsStatus as any,
        totalValue,
        itemCount: items.length,
        paymentMethod,
        shippingCost: shippingCost / 100,
        discountValue: discountValue / 100,
      },
    });

    // ── Upsert Customer ──
    let customerId: string | null = null;
    const profile = vtexOrder.clientProfileData;
    if (profile?.email) {
      const customerExtId = profile.userProfileId || profile.email;
      const customer = await prisma.customer.upsert({
        where: {
          organizationId_externalId: {
            organizationId: org.id,
            externalId: customerExtId,
          },
        },
        create: {
          organizationId: org.id,
          externalId: customerExtId,
          email: profile.email,
          firstName: profile.firstName || null,
          lastName: profile.lastName || null,
          city: vtexOrder.shippingData?.address?.city || null,
          state: vtexOrder.shippingData?.address?.state || null,
          country: vtexOrder.shippingData?.address?.country || null,
          firstOrderAt: new Date(vtexOrder.creationDate),
          lastOrderAt: new Date(vtexOrder.creationDate),
          totalOrders: 1,
          totalSpent: totalValue,
        },
        update: {
          email: profile.email,
          firstName: profile.firstName || null,
          lastName: profile.lastName || null,
          city: vtexOrder.shippingData?.address?.city || null,
          state: vtexOrder.shippingData?.address?.state || null,
          lastOrderAt: new Date(vtexOrder.creationDate),
          totalOrders: { increment: 0 }, // Will be recalculated
          totalSpent: { increment: 0 },
        },
      });
      customerId = customer.id;

      // Link customer to order
      await prisma.order.update({
        where: { id: order.id },
        data: { customerId: customer.id },
      });
    }

    // ── Upsert Products + OrderItems ──
    let itemsCreated = 0;
    let productsCreated = 0;

    // Delete existing items for this order (to avoid duplicates on re-processing)
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });

    for (const item of items) {
      // Use SKU ID (item.id) as externalId to align with inventory sync
      const productExtId = String(item.id || item.productId);

      // Upsert product
      const product = await prisma.product.upsert({
        where: {
          organizationId_externalId: {
            organizationId: org.id,
            externalId: productExtId,
          },
        },
        create: {
          organizationId: org.id,
          externalId: productExtId,
          name: item.name || `SKU ${productExtId}`,
          sku: item.refId || item.sellerSku || productExtId,
          brand: item.additionalInfo?.brandName || null,
          category: item.additionalInfo?.categoriesIds
            ? null // Could extract but not critical
            : null,
          price: (item.sellingPrice || item.price || 0) / 100,
          imageUrl: item.imageUrl || null,
          isActive: true,
        },
        update: {
          name: item.name || undefined,
          price: (item.sellingPrice || item.price || 0) / 100,
          imageUrl: item.imageUrl || undefined,
        },
      });
      productsCreated++;

      // Create order item
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          quantity: item.quantity || 1,
          unitPrice: (item.sellingPrice || item.price || 0) / 100,
          totalPrice: ((item.sellingPrice || item.price || 0) * (item.quantity || 1)) / 100,
        },
      });
      itemsCreated++;
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[Webhook:Orders] Processed ${orderId}: ${itemsCreated} items, ${productsCreated} products, ${elapsed}ms`
    );

    return NextResponse.json({
      ok: true,
      orderId,
      status: nsStatus,
      itemsCreated,
      productsCreated,
      customerId: customerId ? "linked" : "none",
      elapsedMs: elapsed,
    });
  } catch (error: any) {
    console.error("[Webhook:Orders] Error:", error);
    // Return 200 to prevent VTEX from retrying on our app errors
    return NextResponse.json({
      ok: false,
      error: error.message,
    });
  }
}

// GET endpoint for testing connectivity
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || "";
  if (key !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    webhook: "vtex-orders",
    message: "Webhook endpoint is active. VTEX should POST order notifications here.",
    timestamp: new Date().toISOString(),
  });
}
