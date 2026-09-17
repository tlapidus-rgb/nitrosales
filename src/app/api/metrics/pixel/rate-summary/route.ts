export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { ordersValidWhere } from "@/domains/orders";
import { canonicalMarketingSource } from "@/lib/pixel/source-classification";
import { getSharedCachedSWR, setSharedCache } from "@/lib/api-cache-shared";

const MS_PER_DAY = 86_400_000;

export async function GET(request: NextRequest) {
  try {
    const organizationId = await getOrganizationId();
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const dateTo = searchParams.get("to")
      ? new Date(`${searchParams.get("to")}T23:59:59.999-03:00`)
      : now;
    const dateFrom = searchParams.get("from")
      ? new Date(`${searchParams.get("from")}T00:00:00.000-03:00`)
      : new Date(now.getTime() - 7 * MS_PER_DAY);

    const [org, rollupMetaRows] = await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } }),
      prisma.$queryRaw<Array<{ minDay: string | null }>>`
        SELECT MIN(day)::text as "minDay"
        FROM pixel_daily_source
        WHERE "organizationId" = ${organizationId}
      `,
    ]);
    const settings = (org?.settings as Record<string, any>) || {};
    const validModels = ["LAST_CLICK", "FIRST_CLICK", "LINEAR", "NITRO"];
    const settingsModel = validModels.includes(settings.attributionModel) ? settings.attributionModel : "NITRO";
    const requestedModel = (searchParams.get("model") || settingsModel).toUpperCase();
    const selectedModel = validModels.includes(requestedModel) ? requestedModel : settingsModel;
    const installedAt = rollupMetaRows[0]?.minDay
      ? new Date(`${rollupMetaRows[0].minDay}T00:00:00.000-03:00`)
      : null;
    const crDateFrom = installedAt && installedAt > dateFrom ? installedAt : dateFrom;
    const cacheKey = [organizationId, dateFrom.toISOString(), dateTo.toISOString(), selectedModel];
    const cached = await getSharedCachedSWR<Record<string, unknown>>("pixel-rate-summary-v3", ...cacheKey);
    if (cached?.data) return NextResponse.json(cached.data);

    // Traffic and first-touch attribution are already maintained as daily rollups.
    // Reading them here avoids revisiting every attribution whenever a date button
    // changes. Device conversion uses the device recorded on the web order itself.
    const [sourceVisitors, sourcePurchases, deviceVisitors, deviceOrders] = await Promise.all([
      prisma.$queryRaw<Array<{ source: string; visitors: number }>>`
        SELECT first_source as source,
               hll_cardinality(hll_union_agg(pv_visitors_hll))::int as visitors
        FROM pixel_daily_source
        WHERE "organizationId" = ${organizationId}
          AND day >= (${dateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        GROUP BY 1
      `,
      prisma.$queryRaw<Array<{ source: string; purchases: number }>>`
        SELECT source, COALESCE(SUM(first_touch_count), 0)::int as purchases
        FROM gold_attribution_source
        WHERE organization_id = ${organizationId}
          AND day >= (${dateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        GROUP BY 1
      `,
      prisma.$queryRaw<Array<{ device: string; count: number }>>`
        SELECT device, COALESCE(hll_cardinality(hll_union_agg(visitors_hll)), 0)::int as count
        FROM pixel_daily_device
        WHERE "organizationId" = ${organizationId}
          AND day >= (${crDateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        GROUP BY 1
      `,
      prisma.$queryRaw<Array<{ device: string; orders: number; revenue: number }>>`
        SELECT COALESCE(NULLIF(LOWER(o."deviceType"), ''), 'unknown') as device,
               COUNT(*)::int as orders,
               COALESCE(SUM(o."totalValue"), 0)::float as revenue
        FROM orders o
        WHERE o."organizationId" = ${organizationId}
          AND o."orderDate" >= ${crDateFrom}
          AND o."orderDate" <= ${dateTo}
          AND ${ordersValidWhere("o")}
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1
        ORDER BY orders DESC
      `,
    ]);

    const channelMap = new Map<string, { source: string; visitors: number; purchases: number; revenue: number }>();
    for (const row of sourceVisitors) {
      const source = canonicalMarketingSource(row.source || "sin_clasificar");
      const current = channelMap.get(source) || { source, visitors: 0, purchases: 0, revenue: 0 };
      current.visitors += row.visitors || 0;
      channelMap.set(source, current);
    }
    for (const row of sourcePurchases) {
      const source = canonicalMarketingSource(row.source || "sin_clasificar");
      const current = channelMap.get(source) || { source, visitors: 0, purchases: 0, revenue: 0 };
      current.purchases += row.purchases || 0;
      channelMap.set(source, current);
    }

    const folded = [...channelMap.values()].sort((a, b) => b.visitors - a.visitors);
    const valid = folded.filter((row) => /^[a-z0-9_\-.]+$/i.test(row.source));
    const invalid = folded.filter((row) => !/^[a-z0-9_\-.]+$/i.test(row.source));
    const head = valid.slice(0, 12);
    const tail = [...valid.slice(12), ...invalid];
    if (tail.length) {
      head.push(tail.reduce((sum, row) => ({
        source: "otros",
        visitors: sum.visitors + row.visitors,
        purchases: sum.purchases + row.purchases,
        revenue: 0,
      }), { source: "otros", visitors: 0, purchases: 0, revenue: 0 }));
    }
    const byChannel = head.map((row) => ({
      ...row,
      cr: row.visitors > 0 ? Math.round((row.purchases / row.visitors) * 10_000) / 100 : 0,
      ...(row.source === "otros" ? { channelsMerged: tail.length } : {}),
    }));

    const visitorByDevice = new Map(deviceVisitors.map((row) => [row.device?.toLowerCase(), row.count || 0]));
    const byDevice = deviceOrders.map((row) => {
      const visitors = visitorByDevice.get(row.device?.toLowerCase()) || 0;
      return {
        ...row,
        visitors,
        revenue: row.revenue || 0,
        cr: visitors > 0 ? Math.round((row.orders / visitors) * 10_000) / 100 : 0,
      };
    });

    const payload = {
      conversionRates: { byChannel, byDevice },
      meta: {
        dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString(),
        pixelInstalledAt: installedAt?.toISOString() ?? null,
        crDateFrom: crDateFrom.toISOString(),
        crDateAdjusted: !!installedAt && installedAt > dateFrom,
        deviceOrdersBasis: "web_orders",
      },
    };
    await setSharedCache("pixel-rate-summary-v3", payload, ...cacheKey);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[pixel-rate-summary]", error);
    return NextResponse.json({ error: "No se pudo cargar el resumen de conversión" }, { status: 500 });
  }
}
