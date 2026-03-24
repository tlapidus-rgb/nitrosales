// ══════════════════════════════════════════════════════════════
// Webhook: VTEX Order Notifications (Real-time)
// ══════════════════════════════════════════════════════════════
// Endpoint: POST /api/webhooks/vtex/orders
// VTEX Order Hook envía una notificación cada vez que una orden
// cambia de estado. Este endpoint recibe la notificación y
// procesa la orden completa (items, productos, cliente) al instante.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { mapVtexStatus, isValidVtexStatus } from "@/lib/vtex-status";
import { getVtexConfig } from "@/lib/vtex-credentials";
import { calculateAttribution } from "@/lib/pixel/attribution";

export const dynamic = "force-dynamic";
export const maxDuration = 30;


// Status mapping imported from @/lib/vtex-status (single source of truth)

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

    // ── Build VTEX headers (centralized credential access) ──
    const vtexConfig = await getVtexConfig(org.id);
    const vtexBaseUrl = vtexConfig.baseUrl;
    const vtexHeaders = { ...vtexConfig.headers, Accept: "application/json" };

    // ── Fetch full order detail from VTEX ──
    const orderRes = await fetch(`${vtexBaseUrl}/api/oms/pvt/orders/${orderId}`, {
      headers: vtexHeaders,
    });

    if (!orderRes.ok) {
      console.error(`[Webhook:Orders] Failed to fetch order ${orderId}: ${orderRes.status}`);
      return NextResponse.json({
        ok: false,
        error: `Failed to fetch order: ${orderRes.status}`,
        orderId,
      });
    }

    const vtexOrder = await orderRes.json();

    // ── FILTER: Skip incomplete orders ──
    const vtexStatus = (vtexOrder.status || "").toLowerCase().trim();
    if (!vtexStatus || vtexStatus === "") {
      console.warn(`[Webhook:Orders] Skipping incomplete order ${orderId} (empty VTEX status)`);
      return NextResponse.json({ ok: true, orderId, skipped: true, reason: "incomplete-empty-status" });
    }
    // ── Upsert Order ──
    const nsStatus = mapVtexStatus(vtexOrder.status || state);
    const totalValue = (vtexOrder.value || 0) / 100;
    const items = vtexOrder.items || [];
    const shippingCost = (vtexOrder.totals?.find((t: any) => t.id === "Shipping")?.value || 0);
    const discountValue = Math.abs(vtexOrder.totals?.find((t: any) => t.id === "Discounts")?.value || 0);

    const payments = vtexOrder.paymentData?.transactions?.[0]?.payments || [];
    const paymentMethod = payments.length
      ? payments.map((p: any) => p.paymentSystemName || p.group).join(", ")
      : null;

    const promoNames = (vtexOrder.ratesAndBenefitsData || [])
      .map((r: any) => r.name)
      .filter(Boolean)
      .join(', ') || null;

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
        ...(promoNames ? { promotionNames: promoNames } : {}),
      },
      update: {
        status: nsStatus as any,
        totalValue,
        itemCount: items.length,
        paymentMethod,
        shippingCost: shippingCost / 100,
        discountValue: discountValue / 100,
        ...(promoNames ? { promotionNames: promoNames } : {}),
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
          // Snapshot del costo al momento de la orden para P&L histórico
          costPrice: (product as any).costPrice ?? null,
        } as any,
      });
      itemsCreated++;
    }

    // ── NitroPixel: Match order con visitor para atribución ──
    // 3-Layer dedup: client-side pixel may have already created PURCHASE event.
    // Webhook only creates PURCHASE if client-side didn't already.
    // Este bloque NUNCA puede romper el webhook. Si falla, solo loguea.
    let pixelAttribution = false;
    try {
      // Check if client-side pixel already created a PURCHASE event for this order
      const existingPurchase = await prisma.pixelEvent.findFirst({
        where: {
          organizationId: org.id,
          type: 'PURCHASE',
          props: { path: ['orderId'], string_contains: orderId.replace(/-\d+$/, '') }
        }
      });

      if (existingPurchase) {
        pixelAttribution = true;
        console.log(`[NitroPixel] PURCHASE already tracked client-side for order ${orderId} (visitor ${existingPurchase.visitorId})`);
      } else if (profile?.email) {
        const emailLower = profile.email.toLowerCase().trim();

        // Strategy 1: Match by email on pixelVisitor
        let pixelVisitor = await prisma.pixelVisitor.findFirst({
          where: { organizationId: org.id, email: emailLower }
        });

        // Strategy 2: If no email match, find visitor who was on /checkout/ recently
        if (!pixelVisitor) {
          const orderTime = new Date(vtexOrder.creationDate);
          const windowStart = new Date(orderTime.getTime() - 60 * 60 * 1000); // 60 min window (was 30)

          const checkoutEvent: any[] = await prisma.$queryRaw`
            SELECT pe."visitorId"
            FROM pixel_events pe
            WHERE pe."organizationId" = ${org.id}
              AND pe.timestamp >= ${windowStart}
              AND pe.timestamp <= ${orderTime}
              AND (pe."pageUrl" LIKE '%/checkout/%' OR pe."pageUrl" LIKE '%orderPlaced%')
            ORDER BY pe.timestamp DESC
            LIMIT 1
          `;

          if (checkoutEvent.length > 0) {
            pixelVisitor = await prisma.pixelVisitor.findUnique({
              where: { id: checkoutEvent[0].visitorId }
            });

            if (pixelVisitor) {
              await prisma.pixelVisitor.update({
                where: { id: pixelVisitor.id },
                data: { email: emailLower }
              });
              console.log(`[NitroPixel] Linked visitor ${pixelVisitor.visitorId} to ${emailLower} via checkout heuristic`);
            }
          }
        }

        // Strategy 3: If still no match, find the MOST RECENT visitor who visited the site
        // This is a broader heuristic but catches cases where visitor never went to /checkout/ URL
        if (!pixelVisitor) {
          const orderTime = new Date(vtexOrder.creationDate);
          const windowStart = new Date(orderTime.getTime() - 2 * 60 * 60 * 1000); // 2 hour window

          const recentVisitor: any[] = await prisma.$queryRaw`
            SELECT pv.id, pv."visitorId"
            FROM pixel_visitors pv
            INNER JOIN pixel_events pe ON pe."visitorId" = pv.id
            WHERE pv."organizationId" = ${org.id}
              AND pv.email IS NULL
              AND pe.timestamp >= ${windowStart}
              AND pe.timestamp <= ${orderTime}
            ORDER BY pe.timestamp DESC
            LIMIT 1
          `;

          if (recentVisitor.length > 0) {
            pixelVisitor = await prisma.pixelVisitor.findUnique({
              where: { id: recentVisitor[0].id }
            });

            if (pixelVisitor) {
              await prisma.pixelVisitor.update({
                where: { id: pixelVisitor.id },
                data: { email: emailLower }
              });
              console.log(`[NitroPixel] Linked visitor ${pixelVisitor.visitorId} to ${emailLower} via recent-activity heuristic`);
            }
          }
        }

        if (pixelVisitor) {
          await calculateAttribution(order.id, pixelVisitor.id, org.id);

          // Create PURCHASE event (server-side backup)
          await prisma.$executeRaw`
            INSERT INTO pixel_events (id, "organizationId", "visitorId", "sessionId", type, "pageUrl", "deviceType", timestamp, "referrer", props)
            VALUES (
              gen_random_uuid()::text,
              ${org.id},
              ${pixelVisitor.id},
              ${'webhook-' + orderId},
              'PURCHASE',
              ${'/checkout/orderPlaced?og=' + orderId},
              NULL,
              NOW(),
              NULL,
              ${JSON.stringify({ orderId, total: totalValue, source: 'webhook', email: profile.email })}::jsonb
            )
          `;

          pixelAttribution = true;
          console.log(`[NitroPixel] Server-side attribution + PURCHASE for order ${orderId} via visitor ${pixelVisitor.visitorId}`);
        } else {
          console.log(`[NitroPixel] No visitor match for order ${orderId} (email: ${emailLower}). Will retry on next webhook call.`);
        }
      }
    } catch (pixelError) {
      // NitroPixel error NUNCA rompe el webhook
      console.error('[NitroPixel] Error matching order with visitor:', pixelError);
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
      pixelAttribution,
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