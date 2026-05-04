// @ts-nocheck
// GET /api/admin/test-helpers?orgId=X&key=Y
// Test individual de cada query con helpers para localizar el error 500

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { ordersValidWhere, ordersWebWhere, ordersValidWebWhere } from "@/lib/metrics/orders";

export const dynamic = "force-dynamic";
const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    if (key !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - 1 * 24 * 60 * 60 * 1000);
    const results: any = {};

    // Test 1: ordersValidWebWhere alone
    try {
      const r = await prisma.$queryRaw`
        SELECT COUNT(*)::int as c FROM orders o
        WHERE o."organizationId" = ${orgId}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND ${ordersValidWebWhere("o")}
      `;
      results.test1_validWebWhere = { ok: true, result: r };
    } catch (e: any) {
      results.test1_validWebWhere = { ok: false, error: e.message };
    }

    // Test 2: ordersValidWhere alone
    try {
      const r = await prisma.$queryRaw`
        SELECT COUNT(*)::int as c FROM orders o
        WHERE o."organizationId" = ${orgId}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND ${ordersValidWhere("o")}
      `;
      results.test2_validWhere = { ok: true, result: r };
    } catch (e: any) {
      results.test2_validWhere = { ok: false, error: e.message };
    }

    // Test 3: query #23 byChannel completa
    try {
      const r = await prisma.$queryRaw`
        WITH visitor_first_source AS (
          SELECT DISTINCT ON ("visitorId")
            "visitorId",
            CASE
              WHEN ("clickIds"->>'fbclid') IS NOT NULL AND ("clickIds"->>'fbclid') != '' THEN 'meta'
              WHEN ("clickIds"->>'gclid') IS NOT NULL AND ("clickIds"->>'gclid') != '' THEN 'google'
              ELSE 'direct'
            END AS first_source
          FROM pixel_events
          WHERE "organizationId" = ${orgId}
            AND timestamp >= ${dateFrom}
            AND timestamp <= ${dateTo}
            AND ("sessionId" IS NULL OR "sessionId" NOT LIKE 'webhook-%')
          ORDER BY "visitorId", timestamp ASC
        ),
        visitor_to_orders AS (
          SELECT DISTINCT pa."visitorId" as pv_id, o.id as order_id
          FROM orders o
          JOIN pixel_attributions pa ON pa."orderId" = o.id
          WHERE pa."organizationId" = ${orgId}
            AND pa.model::text = 'NITRO'
            AND o."orderDate" >= ${dateFrom}
            AND o."orderDate" <= ${dateTo}
            AND o.status NOT IN ('CANCELLED', 'PENDING', 'RETURNED', 'ON_HOLD', 'FAILED')
            AND o."totalValue" > 0
            AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
            AND o.source IS DISTINCT FROM 'MELI'
            AND o.channel IS DISTINCT FROM 'marketplace'
            AND o."externalId" NOT LIKE 'FVG-%'
            AND o."externalId" NOT LIKE 'BPR-%'
        )
        SELECT
          vfs.first_source as source,
          COUNT(DISTINCT pe."visitorId") FILTER (WHERE pe.type = 'PAGE_VIEW')::int as visitors,
          COUNT(DISTINCT vto.order_id)::int as purchases
        FROM pixel_events pe
        INNER JOIN visitor_first_source vfs ON vfs."visitorId" = pe."visitorId"
        LEFT JOIN visitor_to_orders vto ON vto.pv_id = pe."visitorId"
        WHERE pe."organizationId" = ${orgId}
          AND pe.timestamp >= ${dateFrom}
          AND pe.timestamp <= ${dateTo}
          AND (pe."sessionId" IS NULL OR pe."sessionId" NOT LIKE 'webhook-%')
        GROUP BY 1
        ORDER BY visitors DESC
        LIMIT 5
      `;
      results.test3_byChannel = { ok: true, result: r };
    } catch (e: any) {
      results.test3_byChannel = { ok: false, error: e.message, stack: e.stack?.slice(0, 500) };
    }

    return NextResponse.json({ ok: true, orgId, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}
