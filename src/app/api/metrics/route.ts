import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";
import { getCached, setCache } from "@/lib/api-cache";

// ── Optimized: all aggregation done in PostgreSQL, no full-table loads ──

async function getPeriodMetrics(orgId: string, from: Date, to: Date) {
  const [orderStats, cancelledStats, webStats, adStats, adByPlatform] =
    await Promise.all([
      // 1) Billable orders aggregation (single query, no row fetching)
      prisma.$queryRawUnsafe<
        [{ cnt: string; revenue: string; avg_ticket: string }]
      >(
        `SELECT
          COUNT(*)::text AS cnt,
          COALESCE(SUM("totalValue"), 0)::text AS revenue,
          COALESCE(AVG("totalValue"), 0)::text AS avg_ticket
        FROM orders
        WHERE "organizationId" = $1
          AND "orderDate" >= $2 AND "orderDate" < $3
          AND status IN ('INVOICED', 'SHIPPED', 'DELIVERED')`,
        orgId,
        from,
        to
      ),

      // 2) Cancelled orders aggregation
      prisma.$queryRawUnsafe<[{ cnt: string; revenue: string }]>(
        `SELECT
          COUNT(*)::text AS cnt,
          COALESCE(SUM("totalValue"), 0)::text AS revenue
        FROM orders
        WHERE "organizationId" = $1
          AND "orderDate" >= $2 AND "orderDate" < $3
          AND status = 'CANCELLED'`,
        orgId,
        from,
        to
      ),

      // 3) Web metrics aggregation
      prisma.$queryRawUnsafe<[{ sessions: string }]>(
        `SELECT COALESCE(SUM(sessions), 0)::text AS sessions
        FROM web_metrics_daily
        WHERE "organizationId" = $1
          AND date >= $2 AND date < $3`,
        orgId,
        from,
        to
      ),

      // 4) Ad metrics aggregation (totals)
      prisma.$queryRawUnsafe<
        [{ spend: string; conversion_value: string; impressions: string; clicks: string }]
      >(
        `SELECT
          COALESCE(SUM(spend), 0)::text AS spend,
          COALESCE(SUM("conversionValue"), 0)::text AS conversion_value,
          COALESCE(SUM(impressions), 0)::text AS impressions,
          COALESCE(SUM(clicks), 0)::text AS clicks
        FROM ad_metrics_daily
        WHERE "organizationId" = $1
          AND date >= $2 AND date < $3`,
        orgId,
        from,
        to
      ),

      // 5) Ad spend by platform
      prisma.$queryRawUnsafe<Array<{ platform: string; spend: string }>>(
        `SELECT platform, COALESCE(SUM(spend), 0)::text AS spend
        FROM ad_metrics_daily
        WHERE "organizationId" = $1
          AND date >= $2 AND date < $3
        GROUP BY platform`,
        orgId,
        from,
        to
      ),
    ]);

  const orders = Number(orderStats[0].cnt);
  const revenue = Number(orderStats[0].revenue);
  const totalSessions = Number(webStats[0].sessions);
  const adSpend = Number(adStats[0].spend);
  const adConversionValue = Number(adStats[0].conversion_value);
  const totalImpressions = Number(adStats[0].impressions);
  const totalClicks = Number(adStats[0].clicks);

  const platformMap = Object.fromEntries(
    adByPlatform.map((p) => [p.platform, Number(p.spend)])
  );

  return {
    revenue,
    orders,
    cancelledOrders: Number(cancelledStats[0].cnt),
    cancelledRevenue: Number(cancelledStats[0].revenue),
    sessions: totalSessions,
    adSpend,
    googleSpend: platformMap["GOOGLE"] || 0,
    metaSpend: platformMap["META"] || 0,
    roas:
      adSpend > 0
        ? Math.round((adConversionValue / adSpend) * 100) / 100
        : 0,
    conversionRate:
      totalSessions > 0
        ? Math.round((orders / totalSessions) * 10000) / 100
        : 0,
    avgTicket: orders > 0 ? Math.round(revenue / orders) : 0,
    impressions: totalImpressions,
    clicks: totalClicks,
    ctr:
      totalImpressions > 0
        ? Math.round((totalClicks / totalImpressions) * 10000) / 100
        : 0,
    cpc:
      totalClicks > 0
        ? Math.round((adSpend / totalClicks) * 100) / 100
        : 0,
  };
}

function calcChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export async function GET(request: Request) {
  try {
    const org = await getOrganization();

    const { searchParams } = new URL(request.url);
    const now = new Date();

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const to = toParam ? new Date(toParam + "T23:59:59.999-03:00") : now;
    const from = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ── Cache: return cached response if fresh (60s TTL) ──
    const cacheKey = [org.id, fromParam || "default", toParam || "default"];
    const cached = getCached("metrics", ...cacheKey);
    if (cached) return NextResponse.json(cached);

    const periodMs = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - periodMs);
    const previousTo = from;

    const [current, previous] = await Promise.all([
      getPeriodMetrics(org.id, from, to),
      getPeriodMetrics(org.id, previousFrom, previousTo),
    ]);

    const changes = {
      revenue: calcChange(current.revenue, previous.revenue),
      orders: calcChange(current.orders, previous.orders),
      sessions: calcChange(current.sessions, previous.sessions),
      adSpend: calcChange(current.adSpend, previous.adSpend),
      roas: calcChange(current.roas, previous.roas),
      avgTicket: calcChange(current.avgTicket, previous.avgTicket),
      conversionRate: calcChange(
        current.conversionRate,
        previous.conversionRate
      ),
      ctr: calcChange(current.ctr, previous.ctr),
      cpc: calcChange(current.cpc, previous.cpc),
    };

    const response = { summary: current, previousPeriod: previous, changes };
    setCache("metrics", response, ...cacheKey);
    return NextResponse.json(response);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
