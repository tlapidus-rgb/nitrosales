// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/compare-orgs-pixel?key=Y
// ══════════════════════════════════════════════════════════════
// Comparativa lado a lado de TODAS las orgs activas: stats del
// pixel, eventos por tipo, visitors con email, orders con email,
// atribuciones, ratios. Sirve para ver POR QUE el pixel funciona
// bien en una org y mal en otra.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const days = Number(url.searchParams.get("days") || "7");

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Listar orgs con datos en tablas relevantes (filtra orgs zombie)
    const orgs: any[] = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT o."id", o."name"
       FROM "organizations" o
       WHERE EXISTS (SELECT 1 FROM "pixel_events" pe WHERE pe."organizationId" = o.id)
          OR EXISTS (SELECT 1 FROM "orders" ord WHERE ord."organizationId" = o.id)
       ORDER BY o."name"`,
    );

    const results: any[] = [];

    for (const org of orgs) {
      const orgId = org.id;

      // PIXEL EVENTS
      const eventsTotal = await prisma.pixelEvent.count({ where: { organizationId: orgId } });
      const eventsRecent = await prisma.pixelEvent.count({
        where: { organizationId: orgId, timestamp: { gte: since } },
      });

      // Breakdown por tipo
      const eventsByType: any[] = await prisma.$queryRawUnsafe(
        `SELECT "type"::text, COUNT(*)::int as n
         FROM "pixel_events"
         WHERE "organizationId" = $1 AND "timestamp" >= $2
         GROUP BY "type"
         ORDER BY n DESC`,
        orgId,
        since,
      );

      // PURCHASE events con email en props
      const purchaseEventsWithEmail: any[] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int as n FROM "pixel_events"
         WHERE "organizationId" = $1
           AND "type" = 'PURCHASE'
           AND "timestamp" >= $2
           AND ("props"->>'email' IS NOT NULL AND "props"->>'email' != '')`,
        orgId,
        since,
      );

      // IDENTIFY events
      const identifyEvents: any[] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int as n FROM "pixel_events"
         WHERE "organizationId" = $1
           AND "type" = 'IDENTIFY'
           AND "timestamp" >= $2`,
        orgId,
        since,
      );

      // VISITORS
      const visitorsTotal = await prisma.pixelVisitor.count({ where: { organizationId: orgId } });
      const visitorsWithEmail = await prisma.pixelVisitor.count({
        where: { organizationId: orgId, email: { not: null } },
      });
      const visitorsLinked = await prisma.pixelVisitor.count({
        where: { organizationId: orgId, customerId: { not: null } },
      });

      // ORDERS
      const ordersRecent = await prisma.order.count({
        where: { organizationId: orgId, orderDate: { gte: since } },
      });
      const ordersWithEmail: any[] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int as n FROM "orders" o
         INNER JOIN "customers" c ON c.id = o."customerId"
         WHERE o."organizationId" = $1 AND o."orderDate" >= $2 AND c."email" IS NOT NULL`,
        orgId,
        since,
      );
      const ordersBySource: any[] = await prisma.$queryRawUnsafe(
        `SELECT "source", COUNT(*)::int as n
         FROM "orders"
         WHERE "organizationId" = $1 AND "orderDate" >= $2
         GROUP BY "source"`,
        orgId,
        since,
      );

      // Customers con email (total)
      const customersTotal = await prisma.customer.count({ where: { organizationId: orgId } });
      const customersWithEmail = await prisma.customer.count({
        where: { organizationId: orgId, email: { not: null } },
      });

      // ATTRIBUTIONS
      const attributionsRecent: any[] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int as n FROM "pixel_attributions"
         WHERE "organizationId" = $1 AND "createdAt" >= $2`,
        orgId,
        since,
      );

      // Ratios calculados
      const visitorsEmailPct = visitorsTotal > 0 ? Math.round((visitorsWithEmail / visitorsTotal) * 100) : 0;
      const visitorsLinkedPct = visitorsTotal > 0 ? Math.round((visitorsLinked / visitorsTotal) * 100) : 0;
      const ordersEmailPct = ordersRecent > 0 ? Math.round((Number(ordersWithEmail[0]?.n || 0) / ordersRecent) * 100) : 0;
      const attributionRate = ordersRecent > 0 ? Math.round((Number(attributionsRecent[0]?.n || 0) / ordersRecent) * 100) : 0;

      results.push({
        orgId,
        orgName: org.name,
        pixel: {
          eventsTotal,
          eventsRecent,
          eventsByType: Object.fromEntries(eventsByType.map((e) => [e.type, e.n])),
          purchaseWithEmail: Number(purchaseEventsWithEmail[0]?.n || 0),
          identifyEvents: Number(identifyEvents[0]?.n || 0),
        },
        visitors: {
          total: visitorsTotal,
          withEmail: visitorsWithEmail,
          withEmailPct: visitorsEmailPct,
          linked: visitorsLinked,
          linkedPct: visitorsLinkedPct,
        },
        customers: {
          total: customersTotal,
          withEmail: customersWithEmail,
          withEmailPct: customersTotal > 0 ? Math.round((customersWithEmail / customersTotal) * 100) : 0,
        },
        orders: {
          recent: ordersRecent,
          withEmail: Number(ordersWithEmail[0]?.n || 0),
          withEmailPct: ordersEmailPct,
          bySource: Object.fromEntries(ordersBySource.map((o) => [o.source, o.n])),
        },
        attributions: {
          recent: Number(attributionsRecent[0]?.n || 0),
          attributionRate,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      periodDays: days,
      since: since.toISOString(),
      orgs: results,
    });
  } catch (err: any) {
    console.error("[compare-orgs-pixel] error:", err);
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
