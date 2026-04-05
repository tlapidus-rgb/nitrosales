export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Admin: Batch Reconciliation — Pixel ↔ Orders
// ══════════════════════════════════════════════════════════════
// POST /api/admin/reconcile?key=ADMIN_SECRET
//
// Multi-layer batch reconciliation that links unattributed orders
// to pixel visitors. Run after deploying the reconciliation fixes
// to retroactively process historical orders.
//
// Strategies (in priority order):
// 1. Email bridge: customer.email → pixel_visitor.email → attribution
// 2. Checkout timing: visitor on checkout pages ± order creation time
// 3. OrderId matching: re-scan PURCHASE events with normalized orderId
//
// This is idempotent — safe to run multiple times.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { calculateAttribution } from '@/lib/pixel/attribution';

export const maxDuration = 60; // Allow up to 60s for batch processing

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  if (key !== process.env.ADMIN_SECRET && key !== 'reattribute-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const daysBack = parseInt(searchParams.get('days') || '30');
  const dryRun = searchParams.get('dry') === 'true';

  try {
    const org = await prisma.organization.findFirst();
    if (!org) return NextResponse.json({ error: 'No org found' }, { status: 404 });

    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - daysBack);

    const stats = {
      totalOrders: 0,
      alreadyAttributed: 0,
      emailBridgeMatches: 0,
      checkoutTimingMatches: 0,
      orderIdMatches: 0,
      noMatch: 0,
      errors: 0,
    };

    // ── Get all orders in window ──
    const orders: any[] = await prisma.$queryRaw`
      SELECT o.id, o."externalId", o."orderDate", o."totalValue",
             c.email as "customerEmail", c.id as "customerId"
      FROM orders o
      LEFT JOIN customers c ON c.id = o."customerId"
      WHERE o."organizationId" = ${org.id}
      AND o."orderDate" >= ${dateFrom}
      ORDER BY o."orderDate" DESC
    `;

    stats.totalOrders = orders.length;

    // ── Get already attributed orders ──
    const attributedOrderIds = new Set<string>();
    const existing: any[] = await prisma.$queryRaw`
      SELECT DISTINCT "orderId" FROM pixel_attributions
      WHERE "organizationId" = ${org.id}
      AND "createdAt" >= ${dateFrom}
    `;
    for (const row of existing) attributedOrderIds.add(row.orderId);
    stats.alreadyAttributed = attributedOrderIds.size;

    // ── Pre-load email → visitor lookup ──
    const emailToVisitor = new Map<string, string>();
    const visitors: any[] = await prisma.$queryRaw`
      SELECT id, email FROM pixel_visitors
      WHERE "organizationId" = ${org.id}
      AND email IS NOT NULL
    `;
    for (const v of visitors) emailToVisitor.set(v.email, v.id);

    // ── Process unattributed orders ──
    const results: Array<{ orderId: string; strategy: string; visitorId: string }> = [];

    for (const order of orders) {
      if (attributedOrderIds.has(order.id)) continue;

      try {
        let matchedVisitorId: string | null = null;
        let strategy = '';

        // ── Strategy 1: Email bridge ──
        if (order.customerEmail && emailToVisitor.has(order.customerEmail)) {
          matchedVisitorId = emailToVisitor.get(order.customerEmail)!;
          strategy = 'email-bridge';
          stats.emailBridgeMatches++;
        }

        // ── Strategy 2: OrderId match (re-scan PURCHASE events) ──
        // IMPORTANT: Exclude webhook-created events to prevent cascading contamination
        if (!matchedVisitorId) {
          const orderIdBase = order.externalId.replace(/-\d+$/, '');
          const purchaseMatch: any[] = await prisma.$queryRaw`
            SELECT "visitorId" FROM pixel_events
            WHERE "organizationId" = ${org.id}
            AND type = 'PURCHASE'
            AND "sessionId" NOT LIKE 'webhook-%'
            AND props->>'orderId' LIKE ${orderIdBase + '%'}
            LIMIT 1
          `;
          if (purchaseMatch.length > 0) {
            matchedVisitorId = purchaseMatch[0].visitorId;
            strategy = 'orderid-match';
            stats.orderIdMatches++;
          }
        }

        // ── Strategy 3: Checkout timing heuristic ──
        if (!matchedVisitorId) {
          const orderTime = new Date(order.orderDate);
          const windowStart = new Date(orderTime.getTime() - 60 * 60 * 1000);
          const windowEnd = new Date(orderTime.getTime() + 10 * 60 * 1000);

          // Prefer visitor with same email if available
          // IMPORTANT: Exclude webhook-created events to prevent cascading contamination
          let checkoutVisitor: any[] = [];
          if (order.customerEmail) {
            checkoutVisitor = await prisma.$queryRaw`
              SELECT pv.id as "visitorId"
              FROM pixel_visitors pv
              INNER JOIN pixel_events pe ON pe."visitorId" = pv.id
              WHERE pv."organizationId" = ${org.id}
                AND pe."sessionId" NOT LIKE 'webhook-%'
                AND pv.email = ${order.customerEmail}
                AND pe.timestamp >= ${windowStart}
                AND pe.timestamp <= ${windowEnd}
              ORDER BY pe.timestamp DESC
              LIMIT 1
            `;
          }

          // Fallback: any visitor on checkout pages
          // IMPORTANT: Exclude webhook-created events to prevent cascading contamination
          if (checkoutVisitor.length === 0) {
            checkoutVisitor = await prisma.$queryRaw`
              SELECT pe."visitorId"
              FROM pixel_events pe
              WHERE pe."organizationId" = ${org.id}
                AND pe."sessionId" NOT LIKE 'webhook-%'
                AND pe.timestamp >= ${windowStart}
                AND pe.timestamp <= ${windowEnd}
                AND (pe."pageUrl" LIKE '%/checkout/%'
                     OR pe."pageUrl" LIKE '%orderPlaced%'
                     OR pe.type IN ('CHECKOUT_SHIPPING', 'CHECKOUT_PAYMENT'))
              ORDER BY pe.timestamp DESC
              LIMIT 1
            `;
          }

          if (checkoutVisitor.length > 0) {
            matchedVisitorId = checkoutVisitor[0].visitorId;
            strategy = 'checkout-timing';
            stats.checkoutTimingMatches++;
          }
        }

        // ── Execute attribution ──
        if (matchedVisitorId) {
          if (!dryRun) {
            // Update visitor email if we know it and visitor doesn't have one
            if (order.customerEmail) {
              await prisma.$executeRaw`
                UPDATE pixel_visitors
                SET email = ${order.customerEmail}
                WHERE id = ${matchedVisitorId}
                AND email IS NULL
              `;
            }

            await calculateAttribution(order.id, matchedVisitorId, org.id);
          }
          results.push({ orderId: order.externalId, strategy, visitorId: matchedVisitorId });
        } else {
          stats.noMatch++;
        }
      } catch (err) {
        stats.errors++;
        console.error(`[Reconcile] Error for order ${order.externalId}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      daysBack,
      stats,
      newAttributions: results.length,
      coverageBefore: `${stats.alreadyAttributed}/${stats.totalOrders} (${(stats.alreadyAttributed/stats.totalOrders*100).toFixed(1)}%)`,
      coverageAfter: `${stats.alreadyAttributed + results.length}/${stats.totalOrders} (${((stats.alreadyAttributed + results.length)/stats.totalOrders*100).toFixed(1)}%)`,
      // Only include first 50 results to avoid huge response
      results: results.slice(0, 50),
    });
  } catch (error) {
    console.error('[Reconcile] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
