// ══════════════════════════════════════════════════════════════
// Webhook: VTEX Order Notifications (Real-time)
// ══════════════════════════════════════════════════════════════
// Endpoint: POST /api/webhooks/vtex/orders
// VTEX Order Hook envía una notificación cada vez que una orden
// cambia de estado. Este endpoint recibe la notificación y
// procesa la orden completa (items, productos, cliente) al instante.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Fallback VTEX credentials (same as backfill route) ──
const FALLBACK_VTEX_ACCOUNT = "mundojuguete";
const FALLBACK_VTEX_KEY = "vtexappkey-mundojuguete-ZMTYUJ";
const FALLBACK_VTEX_TOKEN =
  "RSXGIUXPYGDHTDZWHBDBRJKMTFNYAISMOANAHPXZNBRSQKHPTFQNJUAZOKEXHCIOVEENIPJMUXVKJWFYHJQRBXOORRWSYGAAYXGNNSKCLVKAVOUQGDRMGDWQQHXBEULB";


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
  const lower = vtexStatus.toLowerCase().replace("-", "");
  return statusMap[lower] || "PENDING";
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // ── VTEX Validation/Ping handler ──
    // When VTEX configures a hook, it sends a validation POST.
    // We must return 200 immediately to pass the check.
    let body: any;
    try {
      const text = await req.text();
      if (!text || text.trim() === "" || text.trim() === "{}") {
        // Empty body = validation ping from VTEX
        return NextResponse.json({
          ok: true,
          webhook: "vtex-orders",
          message: "Validation OK",
          timestamp: new Date().toISOString(),
        });
      }
      body = JSON.parse(text);
    } catch (parseError) {
      // If body can't be parsed, it's likely a validation ping
      return NextResponse.json({
        ok: true,
        webhook: "vtex-orders",
        message: "Validation OK - parse fallback",
        timestamp: new Date().toISOString(),
      });
    }

    // If no OrderId, this is a test/validation request
    const orderId = body.OrderId;
    const state = body.State;
    if (!orderId) {
      return NextResponse.json({
        ok: true,
        webhook: "vtex-orders",
        message: "Validation OK - no OrderId",
        timestamp: new Date().toISOString(),
      });
    }

    // ── Validate key ──
    const key = req.nextUrl.searchParams.get("key");
    if (key !== process.env.NEXTAUTH_SECRET) {
      // Log but still return 200 to not confuse VTEX
      console.warn(`[Webhook:Orders] Invalid key for order ${orderId}`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    // ── Build VTEX headers (try DB creds first, fallback to hardcoded) ──
    const vtexAccount = creds.accountName || FALLBACK_VTEX_ACCOUNT;
    const vtexBaseUrl = `https://${vtexAccount}.vtexcommercestable.com.br`;
    const vtexHeaders = {
      "X-VTEX-API-AppKey": creds.appKey,
      "X-VTEX-API-AppToken": creds.appToken,
      Accept: "application/json",
    };

    // ── Fetch full order detail from VTEX ──
    let orderRes = await fetch(`${vtexBaseUrl}/api/oms/pvt/orders/${orderId}`, {
      headers: vtexHeaders,
    });



    // If DB credentials fail, retry with fallback credentials
    if (!orderRes.ok && (orderRes.status === 401 || orderRes.status === 403)) {
      console.warn(
        `[Webhook:Orders] DB credentials failed (${orderRes.status}), retrying with fallback credentials`
      );
      const fallbackBaseUrl = `https://${FALLBACK_VTEX_ACCOUNT}.vtexcommercestable.com.br`;
      const fallbackHeaders = {
        "X-VTEX-API-AppKey": FALLBACK_VTEX_KEY,
        "X-VTEX-API-AppToken": FALLBACK_VTEX_TOKEN,
        Accept: "application/json",
      };
      orderRes = await fetch(`${fallbackBaseUrl}/api/oms/pvt/orders/${orderId}`, {
        headers: fallbackHeaders,
      });
    }

    if (!orderRes.ok) {
      console.error(`[Webhook:Orders] Failed to fetch order ${orderId}: ${orderRes.status}`);
      return NextResponse.json({
        ok: false,
        error: `Failed to fetch order: ${orderRes.status}`,
        orderId,
      });
    }

    const vtexOrder = await orderRes.json();

    // ── Upsert Order ──
    const nsStatus = mapStatus(vtexOrder.status || state);
    const totalValue = (vtexOrder.value || 0) / 100;
    const items = vtexOrder.items || [];
    const shippingCost = (vtexOrder.totals?.find((t: any) => t.id === "Shipping")?.value || 0);
    const discountValue = Math.abs(vtexOrder.totals?.find((t: any) => t.id === "Discounts")?.value || 0);

    const payments = vtexOrder.paymentData?.transactions?.[0]?.payments || [];
    const paymentMethod = payments.length
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
          totalOrders: { increment: 1 },
          totalSpent: { increment: totalValue },
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
      const productExtId = String(item.id || item.productId);

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
      productsCreated++;

      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          quantity: item.quantity,
          unitPrice: (item.sellingPrice || item.price) / 100,
          totalPrice: ((item.sellingPrice || item.price) * item.quantity) / 100,
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
      customer: customerId ? "linked" : "none",
      elapsedMs: elapsed,
    });
  } catch (error: any) {
    console.error("[Webhook:Orders] Error:", error);
    return NextResponse.json({ ok: false, error: error.message });
  }
}

// GET endpoint for testing connectivity
export async function GET(req: NextRequest) {
  // Allow GET without key for VTEX validation
  return NextResponse.json({
    ok: true,
    webhook: "vtex-orders",
    message: "Webhook endpoint is active. VTEX should POST order notifications here.",
    timestamp: new Date().toISOString(),
  });
}
