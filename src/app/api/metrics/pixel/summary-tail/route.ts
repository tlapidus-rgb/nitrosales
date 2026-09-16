export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 200;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { ordersValidWhere } from "@/domains/orders";

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
    const periodMs = dateTo.getTime() - dateFrom.getTime();
    const prevFrom = new Date(dateFrom.getTime() - periodMs);
    const prevTo = new Date(dateFrom.getTime() - 1);

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

    const [popularPages, previousRows] = await Promise.all([
      prisma.$queryRaw<Array<{ url: string; visitors: number; pageViews: number }>>`
        SELECT
          url,
          COALESCE(hll_cardinality(hll_union_agg(visitors_hll)), 0)::int as visitors,
          COALESCE(SUM(page_views), 0)::int as "pageViews"
        FROM pixel_daily_page
        WHERE "organizationId" = ${organizationId}
          AND day >= (${dateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        GROUP BY 1
        ORDER BY visitors DESC
        LIMIT 10
      `,
      prisma.$queryRaw<Array<{ ordersAttributed: number; revenue: number }>>`
        SELECT
          COUNT(*)::int as "ordersAttributed",
          SUM(pa."attributedValue")::float as revenue
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${organizationId}
          AND o."orderDate" >= ${prevFrom}
          AND o."orderDate" <= ${prevTo}
          AND pa.model::text = ${selectedModel}
          AND ${ordersValidWhere("o")}
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
      `,
    ]);

    const previous = previousRows[0] || { ordersAttributed: 0, revenue: 0 };
    return NextResponse.json({ popularPages, previous });
  } catch (error) {
    console.error("[pixel-summary-tail]", error);
    return NextResponse.json({ error: "No se pudo cargar el detalle secundario" }, { status: 500 });
  }
}
