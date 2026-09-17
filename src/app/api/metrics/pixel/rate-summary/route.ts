export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 200;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { ordersValidWhere } from "@/domains/orders";
import { canonicalMarketingSource } from "@/lib/pixel/source-classification";
import { getSharedCachedSWR, setSharedCache } from "@/lib/api-cache-shared";

const MS_PER_DAY = 86_400_000;

type AttributionSummaryRow = {
  kind: "source" | "device" | "lag";
  dimension: string;
  count: number;
  revenue: number;
};

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
    const cached = await getSharedCachedSWR<Record<string, unknown>>("pixel-rate-summary-v2", ...cacheKey);
    if (cached?.data) return NextResponse.json(cached.data);

    // Filter orders once and reuse the matching attribution rows for channel,
    // device and conversion-lag summaries. These used to be three scans and the
    // browser waited for the lag request until the rate request had completed.
    const [sourceVisitors, deviceVisitors, attributionRows] = await Promise.all([
      prisma.$queryRaw<Array<{ source: string; visitors: number }>>`
        SELECT first_source as source,
               hll_cardinality(hll_union_agg(pv_visitors_hll))::int as visitors
        FROM pixel_daily_source
        WHERE "organizationId" = ${organizationId}
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
      prisma.$queryRaw<AttributionSummaryRow[]>`
        WITH valid_orders AS MATERIALIZED (
          SELECT o.id
          FROM orders o
          WHERE o."organizationId" = ${organizationId}
            AND o."orderDate" >= ${dateFrom}
            AND o."orderDate" <= ${dateTo}
            AND ${ordersValidWhere("o")}
            AND o."totalValue" > 0
            AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
            AND o.source IS DISTINCT FROM 'MELI'
            AND o.channel IS DISTINCT FROM 'marketplace'
            AND o."externalId" NOT LIKE 'FVG-%'
            AND o."externalId" NOT LIKE 'BPR-%'
        ),
        attributed_orders AS MATERIALIZED (
          SELECT pa."orderId" as order_id,
                 pa."visitorId" as visitor_id,
                 pa."conversionLag" as conversion_lag,
                 pa."attributedValue" as attributed_value
          FROM valid_orders vo
          JOIN pixel_attributions pa
            ON pa."orderId" = vo.id
           AND pa.model = CAST(${selectedModel} AS "AttributionModel")
          WHERE pa."organizationId" = ${organizationId}
        )
        SELECT 'source'::text as kind,
               COALESCE(fs.first_source, 'sin_clasificar')::text as dimension,
               COUNT(DISTINCT ao.order_id)::int as count,
               0::float as revenue
        FROM attributed_orders ao
        LEFT JOIN pixel_visitor_first_source fs
          ON fs."organizationId" = ${organizationId} AND fs."visitorId" = ao.visitor_id
        GROUP BY 2

        UNION ALL

        SELECT 'device'::text as kind,
               COALESCE(pv."deviceTypes"[1], 'unknown')::text as dimension,
               COUNT(DISTINCT ao.order_id)::int as count,
               COALESCE(SUM(ao.attributed_value), 0)::float as revenue
        FROM attributed_orders ao
        LEFT JOIN pixel_visitors pv
          ON pv.id = ao.visitor_id AND pv."organizationId" = ${organizationId}
        GROUP BY 2

        UNION ALL

        SELECT 'lag'::text as kind,
               CASE
                 WHEN ao.conversion_lag IS NULL THEN 'unknown'
                 WHEN ao.conversion_lag <= 0 THEN 'Mismo día'
                 WHEN ao.conversion_lag BETWEEN 1 AND 3 THEN '1-3 días'
                 WHEN ao.conversion_lag BETWEEN 4 AND 7 THEN '4-7 días'
                 WHEN ao.conversion_lag BETWEEN 8 AND 14 THEN '8-14 días'
                 WHEN ao.conversion_lag BETWEEN 15 AND 30 THEN '15-30 días'
                 ELSE '30+ días'
               END::text as dimension,
               COUNT(*)::int as count,
               COALESCE(SUM(ao.attributed_value), 0)::float as revenue
        FROM attributed_orders ao
        GROUP BY 2
      `,
    ]);

    const channelMap = new Map<string, { source: string; visitors: number; purchases: number; revenue: number }>();
    for (const row of sourceVisitors) {
      const source = canonicalMarketingSource(row.source || "sin_clasificar");
      const current = channelMap.get(source) || { source, visitors: 0, purchases: 0, revenue: 0 };
      current.visitors += row.visitors || 0;
      channelMap.set(source, current);
    }
    for (const row of attributionRows.filter((item) => item.kind === "source")) {
      const source = canonicalMarketingSource(row.dimension || "sin_clasificar");
      const current = channelMap.get(source) || { source, visitors: 0, purchases: 0, revenue: 0 };
      current.purchases += row.count || 0;
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
    const byDevice = attributionRows
      .filter((row) => row.kind === "device")
      .map((row) => {
        const device = row.dimension;
        const visitors = visitorByDevice.get(device?.toLowerCase()) || 0;
        const orders = row.count || 0;
        return {
          device,
          visitors,
          orders,
          revenue: row.revenue || 0,
          cr: visitors > 0 ? Math.round((orders / visitors) * 10_000) / 100 : 0,
        };
      })
      .sort((a, b) => b.orders - a.orders);

    const lagOrder = new Map([
      ["Mismo día", 0], ["1-3 días", 1], ["4-7 días", 2],
      ["8-14 días", 3], ["15-30 días", 4], ["30+ días", 5], ["unknown", 6],
    ]);
    const conversionLag = attributionRows
      .filter((row) => row.kind === "lag")
      .map((row) => ({ bucket: row.dimension, orders: row.count || 0, revenue: row.revenue || 0 }))
      .sort((a, b) => (lagOrder.get(a.bucket) ?? 99) - (lagOrder.get(b.bucket) ?? 99));

    const payload = {
      conversionRates: { byChannel, byDevice },
      conversionLag,
      meta: {
        dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString(),
        pixelInstalledAt: installedAt?.toISOString() ?? null,
        crDateFrom: crDateFrom.toISOString(),
        crDateAdjusted: !!installedAt && installedAt > dateFrom,
      },
    };
    await setSharedCache("pixel-rate-summary-v2", payload, ...cacheKey);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[pixel-rate-summary]", error);
    return NextResponse.json({ error: "No se pudo cargar el resumen de conversión" }, { status: 500 });
  }
}
