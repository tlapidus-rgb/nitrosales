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

// ─── Helper: Extract real email from VTEX masked format ───
// VTEX masks emails: "real@email.com-265600829169b.ct.vtex.com.br"
// We need the real email for pixel visitor matching.
function extractRealEmail(vtexEmail: string): string {
  if (!vtexEmail) return vtexEmail;
  // Pattern: real@email.com-{vtexId}.ct.vtex.com.br
  const vtexMaskPattern = /-\w+\.ct\.vtex\.com\.br$/i;
  if (vtexMaskPattern.test(vtexEmail)) {
    return vtexEmail.replace(vtexMaskPattern, '').toLowerCase().trim();
  }
  return vtexEmail.toLowerCase().trim();
}

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

    const promoNames = (Array.isArray(vtexOrder.ratesAndBenefitsData) ? vtexOrder.ratesAndBenefitsData : [])
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
      // Use real email (not VTEX masked) for customer record
      const customerRealEmail = extractRealEmail(profile.email);
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
          email: customerRealEmail,
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
          email: customerRealEmail,
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
    // Multiple strategies to link VTEX order → pixel visitor → attribution.
    // Priority: 1) Client-side PURCHASE event, 2) Checkout heuristic, 3) Real email, 4) Recent activity
    // Este bloque NUNCA puede romper el webhook. Si falla, solo loguea.
    let pixelAttribution = false;
    try {
      const orderIdBase = orderId.replace(/-\d+$/, ''); // Strip VTEX suffix: "1619691502674-01" → "1619691502674"
      const realEmail = profile?.email ? extractRealEmail(profile.email) : null;
      console.log(`[NitroPixel] Starting attribution for order ${orderId} (base: ${orderIdBase}, realEmail: ${realEmail}, vtexEmail: ${profile?.email})`);

      // ── Strategy 1: Client-side PURCHASE event already exists ──
      // Pixel fires PURCHASE on orderPlaced page. If we find it, use its visitor.
      let matchedVisitorId: string | null = null;
      let matchStrategy = '';

      const existingPurchase = await prisma.pixelEvent.findFirst({
        where: {
          organizationId: org.id,
          type: 'PURCHASE',
          props: { path: ['orderId'], string_contains: orderIdBase }
        }
      });

      if (existingPurchase) {
        matchedVisitorId = existingPurchase.visitorId;
        matchStrategy = 'client-side-purchase';
        console.log(`[NitroPixel] Strategy 1 HIT: Found client-side PURCHASE, visitor=${matchedVisitorId}`);
      }

      // ── Strategy 2: Email-first checkout heuristic ──
      // Two sub-strategies:
      //   2a) If we have the customer email, find a visitor identified with that SAME email
      //       who was active during checkout. This is very reliable.
      //   2b) Fallback: Find any visitor on /checkout/ pages within the time window.
      //       Less reliable but still useful for single-concurrent-checkout stores.
      if (!matchedVisitorId) {
        const orderTime = new Date(vtexOrder.creationDate);
        const windowStart = new Date(orderTime.getTime() - 60 * 60 * 1000); // 60 min window
        const windowEnd = new Date(orderTime.getTime() + 5 * 60 * 1000);

        // 2a) Email-matched visitor with checkout activity
        // CRITICAL: Exclude webhook-created events (sessionId LIKE 'webhook-%')
        // to prevent cascading contamination where webhook PURCHASE events
        // feed back into the checkout heuristic and create a "black hole" visitor.
        if (realEmail) {
          const emailCheckout: any[] = await prisma.$queryRaw`
            SELECT pv.id as "visitorId"
            FROM pixel_visitors pv
            INNER JOIN pixel_events pe ON pe."visitorId" = pv.id
            WHERE pv."organizationId" = ${org.id}
              AND pv.email = ${realEmail}
              AND pe.timestamp >= ${windowStart}
              AND pe.timestamp <= ${windowEnd}
              AND pe."sessionId" NOT LIKE 'webhook-%'
              AND (pe."pageUrl" LIKE '%/checkout/%' OR pe."pageUrl" LIKE '%orderPlaced%'
                   OR pe.type IN ('CHECKOUT_SHIPPING', 'CHECKOUT_PAYMENT', 'IDENTIFY'))
            ORDER BY pe.timestamp DESC
            LIMIT 1
          `;
          if (emailCheckout.length > 0) {
            matchedVisitorId = emailCheckout[0].visitorId;
            matchStrategy = 'email-checkout-heuristic';
            console.log(`[NitroPixel] Strategy 2a HIT: Email+checkout match (${realEmail}), visitor=${matchedVisitorId}`);
          }
        }

        // 2b) Generic checkout heuristic (any visitor on checkout pages)
        // CRITICAL: Exclude webhook-created events to prevent cascading contamination.
        if (!matchedVisitorId) {
          const checkoutEvent: any[] = await prisma.$queryRaw`
            SELECT pe."visitorId"
            FROM pixel_events pe
            WHERE pe."organizationId" = ${org.id}
              AND pe.timestamp >= ${windowStart}
              AND pe.timestamp <= ${windowEnd}
              AND pe."sessionId" NOT LIKE 'webhook-%'
              AND (pe."pageUrl" LIKE '%/checkout/%' OR pe."pageUrl" LIKE '%orderPlaced%'
                   OR pe.type IN ('CHECKOUT_SHIPPING', 'CHECKOUT_PAYMENT'))
            ORDER BY pe.timestamp DESC
            LIMIT 1
          `;

          if (checkoutEvent.length > 0) {
            matchedVisitorId = checkoutEvent[0].visitorId;
            matchStrategy = 'checkout-heuristic';
            console.log(`[NitroPixel] Strategy 2b HIT: Checkout heuristic, visitor=${matchedVisitorId}`);
          } else {
            console.log(`[NitroPixel] Strategy 2 MISS: No checkout events in window [${windowStart.toISOString()} → ${windowEnd.toISOString()}]`);
          }
        }
      }

      // ── Strategy 3: Match by REAL email (extracted from VTEX masked email) ──
      if (!matchedVisitorId && realEmail) {
        const pixelVisitor = await prisma.pixelVisitor.findFirst({
          where: { organizationId: org.id, email: realEmail }
        });

        if (pixelVisitor) {
          matchedVisitorId = pixelVisitor.id;
          matchStrategy = 'email-match';
          console.log(`[NitroPixel] Strategy 3 HIT: Email match (${realEmail}), visitor=${matchedVisitorId}`);
        } else {
          console.log(`[NitroPixel] Strategy 3 MISS: No visitor with email ${realEmail}`);
        }
      }

      // ── Strategy 4: Most recent visitor with site activity ──
      // CRITICAL: Exclude webhook sessions to prevent cascading contamination.
      if (!matchedVisitorId) {
        const orderTime = new Date(vtexOrder.creationDate);
        const windowStart = new Date(orderTime.getTime() - 2 * 60 * 60 * 1000); // 2 hour window

        const recentVisitor: any[] = await prisma.$queryRaw`
          SELECT pv.id, pv."visitorId"
          FROM pixel_visitors pv
          INNER JOIN pixel_events pe ON pe."visitorId" = pv.id
          WHERE pv."organizationId" = ${org.id}
            AND pv.email IS NULL
            AND pe."sessionId" NOT LIKE 'webhook-%'
            AND pe.timestamp >= ${windowStart}
            AND pe.timestamp <= ${orderTime}
          ORDER BY pe.timestamp DESC
          LIMIT 1
        `;

        if (recentVisitor.length > 0) {
          matchedVisitorId = recentVisitor[0].id;
          matchStrategy = 'recent-activity';
          console.log(`[NitroPixel] Strategy 4 HIT: Recent activity, visitor=${matchedVisitorId}`);
        } else {
          console.log(`[NitroPixel] Strategy 4 MISS: No recent unidentified visitors`);
        }
      }

      // ── Execute attribution if we found a visitor ──
      if (matchedVisitorId) {
        // Update visitor with real email — but ONLY if visitor has no email yet.
        // Overwriting an existing email would contaminate identity resolution
        // (a visitor matched by checkout heuristic might belong to a DIFFERENT customer).
        if (realEmail) {
          await prisma.pixelVisitor.updateMany({
            where: { id: matchedVisitorId, OR: [{ email: null }, { email: '' }, { email: realEmail }] },
            data: { email: realEmail }
          }).catch(() => {}); // Don't fail if update errors
        }

        // Calculate attribution
        await calculateAttribution(order.id, matchedVisitorId, org.id);

        // Create server-side PURCHASE event if client-side didn't already
        if (matchStrategy !== 'client-side-purchase') {
          // Store BOTH the full orderId AND the base for dedup matching
          // The event receiver uses string_contains on orderIdBase to find this event
          await prisma.$executeRaw`
            INSERT INTO pixel_events (id, "organizationId", "visitorId", "sessionId", type, "pageUrl", "deviceType", timestamp, "referrer", props)
            VALUES (
              gen_random_uuid()::text,
              ${org.id},
              ${matchedVisitorId},
              ${'webhook-' + orderId},
              'PURCHASE',
              ${'/checkout/orderPlaced?og=' + orderId},
              NULL,
              NOW(),
              NULL,
              ${JSON.stringify({
                orderId,
                orderIdBase,
                total: totalValue,
                source: 'webhook',
                matchStrategy,
                email: realEmail || profile?.email,
                _provisional: matchStrategy !== 'email-match' && matchStrategy !== 'email-checkout-heuristic',
              })}::jsonb
            )
          `;
        }

        pixelAttribution = true;
        console.log(`[NitroPixel] Attribution SUCCESS for order ${orderId} via ${matchStrategy}, visitor=${matchedVisitorId}`);
      } else {
        console.log(`[NitroPixel] Attribution FAILED for order ${orderId}: no visitor match. realEmail=${realEmail}. All 4 strategies exhausted.`);
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
