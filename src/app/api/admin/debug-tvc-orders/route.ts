// @ts-nocheck
// GET /api/admin/debug-tvc-orders?orgId=X&key=Y
// Lista las 30 ordenes recientes de TVC (o cualquier org) con detalle
// de attribution + touchpoints + packId para diagnosticar duplicados
// y ordenes sin touchpoints.

import { ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
const KEY = ADMIN_API_KEY;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    if (key !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    const onlySource = url.searchParams.get("source"); // 'VTEX' | 'MELI' | null
    const onlyWithAttr = url.searchParams.get("withAttr") === "1";
    const srcWhere = onlySource ? `AND o.source = '${onlySource.replace(/[^A-Z]/g, "")}'` : "";
    const attrWhere = onlyWithAttr ? `AND EXISTS (SELECT 1 FROM pixel_attributions pa2 WHERE pa2."orderId" = o.id)` : "";

    // 30 ordenes recientes
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        o.id, o."externalId", o."packId", o."totalValue", o.status::text as status,
        o.source, o.channel, o."trafficSource", o."orderDate",
        (
          SELECT json_build_object(
            'model', pa.model::text,
            'tpCount', COALESCE(jsonb_array_length(pa.touchpoints), 0),
            'touchpoints', pa.touchpoints,
            'attributedValue', pa."attributedValue"
          )
          FROM pixel_attributions pa
          WHERE pa."orderId" = o.id
            AND pa.model::text = 'NITRO'
          LIMIT 1
        ) as attr
      FROM orders o
      WHERE o."organizationId" = $1
        AND o."orderDate" > NOW() - INTERVAL '30 days'
        ${srcWhere}
        ${attrWhere}
      ORDER BY o."orderDate" DESC
      LIMIT 30
    `, orgId);

    // Detectar duplicados por packId
    const byPack: Record<string, number> = {};
    const byValue: Record<string, number> = {};
    for (const r of rows) {
      const packKey = r.packId || r.externalId;
      if (packKey) byPack[packKey] = (byPack[packKey] || 0) + 1;
      const valKey = String(Math.round(Number(r.totalValue) / 100) * 100); // round nearest 100
      byValue[valKey] = (byValue[valKey] || 0) + 1;
    }

    const duplicatePacks = Object.entries(byPack).filter(([_, n]) => n > 1);
    const repeatedValues = Object.entries(byValue).filter(([_, n]) => n > 1);

    return NextResponse.json({
      ok: true,
      orgId,
      totalOrdersChecked: rows.length,
      orders: rows.map((r) => ({
        externalId: r.externalId,
        packId: r.packId,
        totalValue: Number(r.totalValue),
        status: r.status,
        source: r.source,
        channel: r.channel,
        trafficSource: r.trafficSource,
        orderDate: r.orderDate,
        attribution: r.attr ? {
          model: r.attr.model,
          tpCount: r.attr.tpCount,
          attributedValue: Number(r.attr.attributedValue),
          touchpoints: r.attr.touchpoints,
        } : null,
      })),
      diagnosis: {
        duplicatePacks: duplicatePacks.map(([pack, count]) => ({ pack, count })),
        repeatedValueCounts: repeatedValues.map(([val, count]) => ({ approxValue: val, count })),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
