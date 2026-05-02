// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/debug-cr-by-device?orgId=X&days=30&key=Y
// ══════════════════════════════════════════════════════════════
// Diagnostica por que "CR por Dispositivo" aparece vacio:
//   - query #5 (visitors by device de pixel_events)
//   - query #24 (orders by device de pixel_attributions JOIN visitors)
//   - intersection: que devices del #24 NO matchean con #5
//   - sample de pixel_visitors con deviceTypes[1] vs pixel_events.deviceType
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    const days = parseInt(url.searchParams.get("days") || "30", 10);
    const model = url.searchParams.get("model") || "NITRO";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - days * 24 * 60 * 60 * 1000);

    // pixel install
    const installResult = await prisma.$queryRaw<Array<{ installedAt: Date | null }>>`
      SELECT MIN(timestamp) as "installedAt" FROM pixel_events WHERE "organizationId" = ${orgId}
    `;
    const installedAt = installResult[0]?.installedAt || null;
    const crDateFrom = installedAt && installedAt.getTime() > dateFrom.getTime() ? installedAt : dateFrom;

    // query #5: visitors by device de pixel_events
    const visitorsByDevice = await prisma.$queryRaw<Array<{ device: string; count: number }>>`
      SELECT COALESCE(pe."deviceType", 'unknown') as device, COUNT(DISTINCT pe."visitorId")::int as count
      FROM pixel_events pe
      WHERE pe."organizationId" = ${orgId}
        AND pe.timestamp >= ${dateFrom}
        AND pe.timestamp <= ${dateTo}
      GROUP BY 1
      ORDER BY count DESC
    `;

    // query #24 OLD: orders by device leyendo solo pv.deviceTypes
    const ordersByDeviceOld = await prisma.$queryRaw<Array<{ device: string; orders: number; revenue: number }>>`
      SELECT
        COALESCE(pv."deviceTypes"[1], 'unknown') as device,
        COUNT(DISTINCT pa."orderId")::int as orders,
        SUM(pa."attributedValue")::float as revenue
      FROM pixel_attributions pa
      JOIN pixel_visitors pv ON pv."visitorId" = pa."visitorId" AND pv."organizationId" = pa."organizationId"
      JOIN orders o ON o.id = pa."orderId"
      WHERE pa."organizationId" = ${orgId}
        AND o."orderDate" >= ${crDateFrom}
        AND o."orderDate" <= ${dateTo}
        AND pa.model::text = ${model}
        AND o.status NOT IN ('CANCELLED', 'PENDING')
        AND o."totalValue" > 0
        AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
        AND o.source IS DISTINCT FROM 'MELI'
        AND o.channel IS DISTINCT FROM 'marketplace'
        AND o."externalId" NOT LIKE 'FVG-%'
        AND o."externalId" NOT LIKE 'BPR-%'
      GROUP BY 1
      ORDER BY orders DESC
    `;

    // query #24 NEW: con LEFT JOIN LATERAL a pixel_events
    const ordersByDeviceNew = await prisma.$queryRaw<Array<{ device: string; orders: number; revenue: number }>>`
      SELECT
        COALESCE(pe_dev.dev, pv."deviceTypes"[1], 'unknown') as device,
        COUNT(DISTINCT pa."orderId")::int as orders,
        SUM(pa."attributedValue")::float as revenue
      FROM pixel_attributions pa
      JOIN pixel_visitors pv ON pv."visitorId" = pa."visitorId" AND pv."organizationId" = pa."organizationId"
      JOIN orders o ON o.id = pa."orderId"
      LEFT JOIN LATERAL (
        SELECT pe2."deviceType" as dev
        FROM pixel_events pe2
        WHERE pe2."visitorId" = pa."visitorId"
          AND pe2."organizationId" = pa."organizationId"
          AND pe2."deviceType" IS NOT NULL
        ORDER BY pe2.timestamp DESC
        LIMIT 1
      ) pe_dev ON true
      WHERE pa."organizationId" = ${orgId}
        AND o."orderDate" >= ${crDateFrom}
        AND o."orderDate" <= ${dateTo}
        AND pa.model::text = ${model}
        AND o.status NOT IN ('CANCELLED', 'PENDING')
        AND o."totalValue" > 0
        AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
        AND o.source IS DISTINCT FROM 'MELI'
        AND o.channel IS DISTINCT FROM 'marketplace'
        AND o."externalId" NOT LIKE 'FVG-%'
        AND o."externalId" NOT LIKE 'BPR-%'
      GROUP BY 1
      ORDER BY orders DESC
    `;

    // sample: visitor de pixel_attributions con su deviceTypes y deviceType de pixel_events mas reciente
    const sample = await prisma.$queryRaw<Array<{
      visitorId: string; pvDevice: string | null; peDevice: string | null; orders: number;
    }>>`
      SELECT
        pa."visitorId",
        pv."deviceTypes"[1] as "pvDevice",
        (SELECT pe2."deviceType" FROM pixel_events pe2
          WHERE pe2."visitorId" = pa."visitorId" AND pe2."organizationId" = ${orgId}
          ORDER BY pe2.timestamp DESC LIMIT 1) as "peDevice",
        COUNT(DISTINCT pa."orderId")::int as orders
      FROM pixel_attributions pa
      JOIN pixel_visitors pv ON pv."visitorId" = pa."visitorId" AND pv."organizationId" = pa."organizationId"
      JOIN orders o ON o.id = pa."orderId"
      WHERE pa."organizationId" = ${orgId}
        AND o."orderDate" >= ${crDateFrom}
        AND o."orderDate" <= ${dateTo}
        AND pa.model::text = ${model}
        AND o.status NOT IN ('CANCELLED', 'PENDING')
      GROUP BY pa."visitorId", pv."deviceTypes"
      ORDER BY orders DESC
      LIMIT 15
    `;

    // Total pixel attributions in window
    const totalAttr = await prisma.$queryRaw<Array<{ total: number; valid: number }>>`
      SELECT
        COUNT(*)::int as total,
        COUNT(CASE WHEN o.status NOT IN ('CANCELLED','PENDING')
                    AND o."totalValue" > 0
                    AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
                    AND o.source IS DISTINCT FROM 'MELI'
                    AND o.channel IS DISTINCT FROM 'marketplace'
                    AND o."externalId" NOT LIKE 'FVG-%'
                    AND o."externalId" NOT LIKE 'BPR-%' THEN 1 END)::int as valid
      FROM pixel_attributions pa
      JOIN orders o ON o.id = pa."orderId"
      WHERE pa."organizationId" = ${orgId}
        AND o."orderDate" >= ${crDateFrom}
        AND o."orderDate" <= ${dateTo}
        AND pa.model::text = ${model}
    `;

    return NextResponse.json({
      ok: true,
      orgId,
      model,
      window: { from: crDateFrom.toISOString(), to: dateTo.toISOString(), days },
      pixelInstalledAt: installedAt?.toISOString() || null,
      totalAttributionsInWindow: totalAttr[0],
      query5_visitorsByDevice: visitorsByDevice,
      query24_OLD_ordersByDevice: ordersByDeviceOld,
      query24_NEW_ordersByDevice: ordersByDeviceNew,
      sample_visitor_devices: sample,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
