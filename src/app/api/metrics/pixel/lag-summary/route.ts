export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 200;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { ordersValidWhere } from "@/domains/orders";
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

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const settings = (org?.settings as Record<string, any>) || {};
    const validModels = ["LAST_CLICK", "FIRST_CLICK", "LINEAR", "NITRO"];
    const settingsModel = validModels.includes(settings.attributionModel)
      ? settings.attributionModel
      : "NITRO";
    const requestedModel = (searchParams.get("model") || settingsModel).toUpperCase();
    const selectedModel = validModels.includes(requestedModel) ? requestedModel : settingsModel;
    const cacheKey = [organizationId, dateFrom.toISOString(), dateTo.toISOString(), selectedModel];
    const cached = await getSharedCachedSWR<{ conversionLag: Array<{ bucket: string; orders: number; revenue: number }> }>(
      "pixel-lag-summary-v2",
      ...cacheKey
    );
    if (cached?.data) return NextResponse.json(cached.data);

    const conversionLag = await prisma.$queryRaw<Array<{ bucket: string; orders: number; revenue: number }>>`
      WITH valid_orders AS MATERIALIZED (
        SELECT o.id
        FROM orders o
        WHERE o."organizationId" = ${organizationId}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND ${ordersValidWhere("o")}
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
      )
      SELECT
        CASE
          WHEN pa."conversionLag" IS NULL THEN 'unknown'
          WHEN pa."conversionLag" <= 0 THEN 'Mismo día'
          WHEN pa."conversionLag" BETWEEN 1 AND 3 THEN '1-3 días'
          WHEN pa."conversionLag" BETWEEN 4 AND 7 THEN '4-7 días'
          WHEN pa."conversionLag" BETWEEN 8 AND 14 THEN '8-14 días'
          WHEN pa."conversionLag" BETWEEN 15 AND 30 THEN '15-30 días'
          ELSE '30+ días'
        END as bucket,
        COUNT(*)::int as orders,
        SUM(pa."attributedValue")::float as revenue
      FROM pixel_attributions pa
      JOIN valid_orders vo ON vo.id = pa."orderId"
      WHERE pa."organizationId" = ${organizationId}
        AND pa.model = CAST(${selectedModel} AS "AttributionModel")
      GROUP BY 1
      ORDER BY MIN(COALESCE(GREATEST(pa."conversionLag", 0), 999))
    `;

    const payload = { conversionLag };
    await setSharedCache("pixel-lag-summary-v2", payload, ...cacheKey);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[pixel-lag-summary]", error);
    return NextResponse.json({ error: "No se pudo cargar la velocidad de conversión" }, { status: 500 });
  }
}
