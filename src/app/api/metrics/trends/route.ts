import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";
import { getCached, setCache } from "@/lib/api-cache";

export const dynamic = "force-dynamic";

// ── Optimized: all aggregation done in SQL, no full-table loads ──

export async function GET(request: Request) {
  try {
    const org = await getOrganization();

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    // Cache check
    const cacheKey = [org.id, fromParam || "default", toParam || "default"];
    const cached = getCached("trends", ...cacheKey);
    if (cached) return NextResponse.json(cached);

    const to = toParam ? new Date(toParam + "T23:59:59.999-03:00") : now;
    const from = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 3 lightweight SQL aggregation queries instead of 3 full-table findMany
    const [ordersByDay, adByDay, sessionsByDay] = await Promise.all([
      // Orders: group by day, already filtered by billable status
      prisma.$queryRawUnsafe<
        Array<{ day: string; revenue: string; orders: string }>
      >(
        `SELECT
          TO_CHAR("orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') AS day,
          COALESCE(SUM("totalValue"), 0)::text AS revenue,
          COUNT(*)::text AS orders
        FROM orders
        WHERE "organizationId" = $1
          AND "orderDate" >= $2 AND "orderDate" < $3
          AND status IN ('INVOICED', 'SHIPPED', 'DELIVERED')
        GROUP BY day ORDER BY day`,
        org.id,
        from,
        to
      ),

      // Ad metrics: group by day with platform breakdown
      prisma.$queryRawUnsafe<
        Array<{
          day: string;
          total_spend: string;
          google_spend: string;
          meta_spend: string;
          impressions: string;
          clicks: string;
          conversions: string;
          conversion_value: string;
        }>
      >(
        `SELECT
          TO_CHAR(date, 'YYYY-MM-DD') AS day,
          COALESCE(SUM(spend), 0)::text AS total_spend,
          COALESCE(SUM(CASE WHEN platform = 'GOOGLE' THEN spend ELSE 0 END), 0)::text AS google_spend,
          COALESCE(SUM(CASE WHEN platform = 'META' THEN spend ELSE 0 END), 0)::text AS meta_spend,
          COALESCE(SUM(impressions), 0)::text AS impressions,
          COALESCE(SUM(clicks), 0)::text AS clicks,
          COALESCE(SUM(conversions), 0)::text AS conversions,
          COALESCE(SUM("conversionValue"), 0)::text AS conversion_value
        FROM ad_metric_daily
        WHERE "organizationId" = $1
          AND date >= $2 AND date < $3
        GROUP BY day ORDER BY day`,
        org.id,
        from,
        to
      ),

      // Sessions: group by day
      prisma.$queryRawUnsafe<
        Array<{ day: string; sessions: string }>
      >(
        `SELECT
          TO_CHAR(date, 'YYYY-MM-DD') AS day,
          COALESCE(SUM(sessions), 0)::text AS sessions
        FROM web_metric_daily
        WHERE "organizationId" = $1
          AND date >= $2 AND date < $3
        GROUP BY day ORDER BY day`,
        org.id,
        from,
        to
      ),
    ]);

    // Build lookup maps from aggregated results (O(n) each, n = days not rows)
    const revenueMap = new Map(ordersByDay.map((r) => [r.day, r]));
    const adMap = new Map(adByDay.map((r) => [r.day, r]));
    const sessMap = new Map(sessionsByDay.map((r) => [r.day, r]));

    // Build unified daily array
    const totalDays = Math.ceil(
      (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)
    );
    const days: unknown[] = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(to);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];

      const ord = revenueMap.get(key);
      const ad = adMap.get(key);
      const sess = sessMap.get(key);

      const revenue = ord ? Number(ord.revenue) : 0;
      const spend = ad ? Number(ad.total_spend) : 0;
      const convValue = ad ? Number(ad.conversion_value) : 0;

      days.push({
        date: key,
        revenue,
        orders: ord ? Number(ord.orders) : 0,
        sessions: sess ? Number(sess.sessions) : 0,
        adSpend: spend,
        googleSpend: ad ? Number(ad.google_spend) : 0,
        metaSpend: ad ? Number(ad.meta_spend) : 0,
        impressions: ad ? Number(ad.impressions) : 0,
        clicks: ad ? Number(ad.clicks) : 0,
        conversions: ad ? Number(ad.conversions) : 0,
        roas:
          spend > 0
            ? Math.round((convValue / spend) * 100) / 100
            : 0,
      });
    }

    const response = { days };
    setCache("trends", response, ...cacheKey);
    return NextResponse.json(response);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
