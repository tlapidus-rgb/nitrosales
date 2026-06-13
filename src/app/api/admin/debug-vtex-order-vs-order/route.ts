// @ts-nocheck
// GET /api/admin/debug-vtex-order-vs-order?key=Y
// Compara 5 ordenes TVC que SI dispararon webhook vs 5 que NO.
// Pega a VTEX /api/oms/pvt/orders/{id} y trae campos clave para detectar
// que diferencia tiene una vs otra (affiliateId, origin, marketplaceServicesEndpoint).

import { ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getVtexConfig } from "@/lib/vtex-credentials";

export const dynamic = "force-dynamic";
const KEY = ADMIN_API_KEY;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (key !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const org = await prisma.organization.findFirst({
      where: { OR: [{ slug: "teve-compras" }, { name: { contains: "teve", mode: "insensitive" } }] },
    });
    if (!org) return NextResponse.json({ error: "TVC org no encontrada" }, { status: 404 });

    // Ordenes TVC que dispararon webhook (sessionId LIKE 'webhook-%')
    const withWebhookOrderIds = await prisma.$queryRawUnsafe<any[]>(`
      SELECT DISTINCT (props->>'orderId') as ext_id, MAX(timestamp) as ts
      FROM pixel_events
      WHERE "organizationId" = $1
        AND type = 'PURCHASE'
        AND "sessionId" LIKE 'webhook-%'
        AND props->>'orderId' IS NOT NULL
      GROUP BY 1
      ORDER BY ts DESC
      LIMIT 5
    `, org.id);

    // Ordenes TVC SIN webhook event — las del cron diario
    const withoutWebhook = await prisma.$queryRawUnsafe<any[]>(`
      SELECT o."externalId" as ext_id, o."orderDate"
      FROM orders o
      LEFT JOIN pixel_attributions pa ON pa."orderId" = o.id AND pa.model::text = 'NITRO'
      WHERE o."organizationId" = $1
        AND o.source::text = 'VTEX'
        AND o."orderDate" > NOW() - INTERVAL '7 days'
        AND pa.id IS NULL
        AND COALESCE(o."externalId", '') NOT LIKE 'FVG-%'
        AND COALESCE(o."externalId", '') NOT LIKE 'BPR-%'
      ORDER BY o."orderDate" DESC
      LIMIT 5
    `, org.id);

    const vtexConfig = await getVtexConfig(org.id);

    async function fetchOrderSummary(extId: string) {
      const url2 = `https://${vtexConfig.creds.accountName}.vtexcommercestable.com.br/api/oms/pvt/orders/${extId}`;
      try {
        const r = await fetch(url2, { headers: vtexConfig.headers, signal: AbortSignal.timeout(10000) });
        if (!r.ok) return { extId, error: `vtex ${r.status}` };
        const d: any = await r.json();
        return {
          extId,
          status: d.status,
          origin: d.origin,
          affiliateId: d.affiliateId,
          marketplaceServicesEndpoint: d.marketplaceServicesEndpoint || null,
          salesChannel: d.salesChannel,
          callCenterOperatorData: !!d.callCenterOperatorData,
          openTextField: d.openTextField,
          creationDate: d.creationDate,
        };
      } catch (e: any) {
        return { extId, fetchError: e.message };
      }
    }

    const detailsWith = await Promise.all(withWebhookOrderIds.map((r) => fetchOrderSummary(r.ext_id)));
    const detailsWithout = await Promise.all(withoutWebhook.map((r) => fetchOrderSummary(r.ext_id)));

    return NextResponse.json({
      ok: true,
      orgName: org.name,
      withWebhook: detailsWith,
      withoutWebhook: detailsWithout,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}
