// @ts-nocheck
// GET /api/admin/debug-tvc-when-inserted?key=Y&orgSlug=teve
// Para cada orden VTEX de los ultimos 7 dias en la org, devuelve:
//   - externalId, orderDate (cuando TVC tuvo la venta)
//   - createdAt (cuando NUESTRA DB la inserto)
//   - hourOfCreatedAt (para distinguir cron 30min vs cron 3am)
//   - has_nitro_attr
// Sirve para correlacionar cuando se inserto vs si quedo atribuida.

import { ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
const KEY = ADMIN_API_KEY;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgSlug = url.searchParams.get("orgSlug") || "teve";
    if (key !== KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const org = await prisma.organization.findFirst({
      where: { OR: [{ slug: orgSlug }, { name: { contains: orgSlug, mode: "insensitive" } }] },
      select: { id: true, name: true },
    });
    if (!org) return NextResponse.json({ error: "org no encontrada" }, { status: 404 });

    // Ultimos 7 dias
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        o."externalId",
        o."orderDate",
        o."createdAt",
        EXTRACT(HOUR FROM o."createdAt" AT TIME ZONE 'America/Argentina/Buenos_Aires') as create_hour_local,
        TO_CHAR(o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') as order_day,
        TO_CHAR(o."createdAt" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI') as create_local,
        EXTRACT(EPOCH FROM (o."createdAt" - o."orderDate")) / 60 as gap_minutes,
        (SELECT COUNT(*) FROM pixel_attributions pa WHERE pa."orderId" = o.id AND pa.model::text = 'NITRO')::int as has_nitro
      FROM orders o
      WHERE o."organizationId" = $1
        AND o.source::text = 'VTEX'
        AND o."orderDate" >= $2
        AND COALESCE(o."externalId", '') NOT LIKE 'FVG-%'
        AND COALESCE(o."externalId", '') NOT LIKE 'BPR-%'
      ORDER BY o."orderDate" DESC
    `, org.id, since);

    // Agrupar por order_day y create_hour_local
    const byDayAndHour: Record<string, any> = {};
    for (const r of rows) {
      const k = `${r.order_day}|h${Math.floor(Number(r.create_hour_local))}`;
      if (!byDayAndHour[k]) byDayAndHour[k] = { day: r.order_day, hour: Math.floor(Number(r.create_hour_local)), total: 0, withAttr: 0, withoutAttr: 0, avgGap: 0, gapSum: 0 };
      byDayAndHour[k].total++;
      if (r.has_nitro > 0) byDayAndHour[k].withAttr++;
      else byDayAndHour[k].withoutAttr++;
      byDayAndHour[k].gapSum += Number(r.gap_minutes);
    }
    const summary = Object.values(byDayAndHour).map((v: any) => ({
      ...v,
      avgGap: v.total > 0 ? Math.round(v.gapSum / v.total) : 0,
    })).sort((a, b) => (b.day + b.hour).localeCompare(a.day + a.hour));

    return NextResponse.json({
      ok: true,
      orgId: org.id,
      orgName: org.name,
      totalOrders: rows.length,
      summary,
      sample: rows.slice(0, 30).map((r) => ({
        externalId: r.externalId,
        order_day: r.order_day,
        create_local: r.create_local,
        gap_min: Math.round(Number(r.gap_minutes)),
        has_nitro: Number(r.has_nitro),
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
