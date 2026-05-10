// @ts-nocheck
// GET /api/admin/debug-vtex-webhook-traffic?key=Y
// Cuenta los webhook-events generados por VTEX en TVC, EMDJ y Arredo.
// Cuando llega un webhook VTEX y se procesa, se crea un PURCHASE event
// con sessionId LIKE 'webhook-%'. Si una org tiene 0 = no le llegan webhooks.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (key !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Conectar TVC, EMDJ y Arredo
    const orgs = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, name, slug FROM organizations
      WHERE LOWER(name) LIKE '%mundo%juguete%'
         OR LOWER(name) LIKE '%teve%'
         OR LOWER(name) LIKE '%arredo%'
      ORDER BY name
    `);

    const result: any[] = [];
    for (const org of orgs) {
      // Webhook PURCHASE events ultimos 14 dias
      const byDay = await prisma.$queryRawUnsafe<any[]>(`
        SELECT
          TO_CHAR(DATE(timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') as day,
          COUNT(*)::int as webhook_events,
          COUNT(DISTINCT (props->>'orderId'))::int as distinct_orders
        FROM pixel_events
        WHERE "organizationId" = $1
          AND type = 'PURCHASE'
          AND "sessionId" LIKE 'webhook-%'
          AND timestamp > NOW() - INTERVAL '14 days'
        GROUP BY 1
        ORDER BY 1 DESC
      `, org.id);

      // Total webhook events ever
      const totalEver = await prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*)::int as n,
               MIN(timestamp) as first_ts,
               MAX(timestamp) as last_ts
        FROM pixel_events
        WHERE "organizationId" = $1
          AND "sessionId" LIKE 'webhook-%'
      `, org.id);

      // Para comparar: cuantas ordenes VTEX nuevas hubo ultimos 14d
      const ordersNew = await prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*)::int as n
        FROM orders
        WHERE "organizationId" = $1
          AND source::text = 'VTEX'
          AND "orderDate" > NOW() - INTERVAL '14 days'
          AND COALESCE("externalId", '') NOT LIKE 'FVG-%'
          AND COALESCE("externalId", '') NOT LIKE 'BPR-%'
      `, org.id);

      result.push({
        orgId: org.id,
        orgName: org.name,
        slug: org.slug,
        totalWebhookEventsEver: Number(totalEver[0]?.n || 0),
        firstWebhookAt: totalEver[0]?.first_ts,
        lastWebhookAt: totalEver[0]?.last_ts,
        ordersVtexLast14d: Number(ordersNew[0]?.n || 0),
        webhookEventsLast14dByDay: byDay,
      });
    }

    return NextResponse.json({ ok: true, orgs: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}
