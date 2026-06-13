// @ts-nocheck
// GET /api/admin/measure-attribution-health?key=Y&days=14
// Mide la salud de la atribucion por org por dia.
// Para cada org VTEX activa:
//   - dia | totalOrdersVTEX | conNitroAttr | sinNitroAttr | coberturaPct
//   - createdAt vs orderDate: cuantas se crearon batch vs realtime
// Sirve para confirmar la hipotesis: ordenes que entraron por sync (no webhook)
// quedan sin atribucion y bajan la cobertura.

import { ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const KEY = ADMIN_API_KEY;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (key !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const days = Math.min(Number(url.searchParams.get("days") || "14"), 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Orgs con VTEX activo
    const orgs = await prisma.$queryRawUnsafe<any[]>(`
      SELECT DISTINCT o.id, o.name
      FROM organizations o
      JOIN connections c ON c."organizationId" = o.id
      WHERE c.platform::text = 'VTEX' AND c.status::text = 'ACTIVE'
    `);

    const result: any[] = [];

    for (const org of orgs) {
      // Por dia, contar ordenes VTEX y cuantas tienen atribucion NITRO
      const byDay = await prisma.$queryRawUnsafe<any[]>(`
        SELECT
          TO_CHAR(DATE(o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') as day,
          COUNT(*)::int as total_orders,
          COUNT(DISTINCT CASE WHEN pa.id IS NOT NULL THEN o.id END)::int as orders_with_attr,
          COUNT(DISTINCT CASE WHEN pa.id IS NULL THEN o.id END)::int as orders_without_attr,
          -- Detectar batch inserts: ordenes cuyo createdAt en DB es muy lejano al orderDate
          -- (>10 min) sugiere que entraron por sync no webhook real-time
          COUNT(DISTINCT CASE
            WHEN EXTRACT(EPOCH FROM (o."createdAt" - o."orderDate")) > 600 THEN o.id
          END)::int as orders_inserted_by_sync
        FROM orders o
        LEFT JOIN pixel_attributions pa
          ON pa."orderId" = o.id AND pa.model::text = 'NITRO'
        WHERE o."organizationId" = $1
          AND o.source::text = 'VTEX'
          AND o."orderDate" >= $2
          -- Excluir marketplaces (FVG-/BPR-) que correctamente NO tienen atribucion
          AND COALESCE(o."externalId", '') NOT LIKE 'FVG-%'
          AND COALESCE(o."externalId", '') NOT LIKE 'BPR-%'
        GROUP BY 1
        ORDER BY 1 DESC
      `, org.id, since);

      // Resumen
      const totalOrders = byDay.reduce((s, d) => s + d.total_orders, 0);
      const totalWithAttr = byDay.reduce((s, d) => s + d.orders_with_attr, 0);
      const totalWithoutAttr = byDay.reduce((s, d) => s + d.orders_without_attr, 0);
      const totalInsertedBySync = byDay.reduce((s, d) => s + d.orders_inserted_by_sync, 0);
      const coverage = totalOrders > 0 ? totalWithAttr / totalOrders : 0;

      result.push({
        orgId: org.id,
        orgName: org.name,
        summary: {
          totalOrders,
          totalWithAttr,
          totalWithoutAttr,
          totalInsertedBySync,
          coverage: Math.round(coverage * 1000) / 10, // porcentaje con 1 decimal
        },
        byDay: byDay.map((d) => ({
          ...d,
          coverage: d.total_orders > 0
            ? Math.round((d.orders_with_attr / d.total_orders) * 1000) / 10
            : 0,
        })),
      });
    }

    return NextResponse.json({
      ok: true,
      days,
      since: since.toISOString(),
      orgs: result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
