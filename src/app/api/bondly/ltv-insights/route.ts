export const dynamic = "force-dynamic";
export const revalidate = 0;

// ═══════════════════════════════════════════════════════════════════
// /api/bondly/ltv-insights — Cards accionables para Bondly LTV
// ═══════════════════════════════════════════════════════════════════
//
// Ejecuta el insight-engine sobre agregados computados en tiempo real:
//   - Canales con LTV:CAC en rojo
//   - Sweet spot de recompra
//   - Cohorte estrella
//   - Behavioral alert (visitantes anónimos con perfil VIP)
//   - Whales en riesgo (churn score ≥70)
//
// READ-ONLY. Cache 5 min (desde la respuesta, no server-side cache).
// CLAUDE.md §REGLA #3b: max 3 queries por batch, sin JOIN costosos,
// sin CASTs riesgosos.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import {
  generateInsights,
  type ChannelLtvStat,
  type RepurchaseBucket,
  type CohortStat,
  type BehavioralSummary,
  type WhaleAtRiskStat,
} from "@/lib/bondly/insight-engine";
import { computeChurnScore } from "@/lib/bondly/churn-score";
import { computeBehavioralScore } from "@/lib/bondly/behavioral-score";

interface ChannelRow {
  channel: string;
  customers: number;
  avg_ltv: number;
}
interface SpendRow {
  platform: string;
  total_spend: number;
}
interface RepurchaseRow {
  days_between: number;
  customers: number;
}
interface CohortRow {
  cohort_month: string;
  m3_retention: number;
  customers: number;
}
interface WhaleRow {
  customer_id: string;
  display_name: string;
  total_ltv: number;
  days_since_last: number;
  median_days_between: number | null;
  orders_last_90d: number;
  orders_prev_90d: number | null;
  aov_last_90d: number | null;
  aov_prev_90d: number | null;
}
interface BehavioralVisitorRow {
  id: string;
  total_sessions: number;
  total_page_views: number;
  device_types_count: number;
  last_seen_at: Date;
  cart_adds_30d: number;
  unique_products: number;
  has_purchase: boolean;
  first_source: string | null;
  has_customer: boolean;
  is_identified: boolean;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
}

export async function GET(_req: NextRequest) {
  try {
    const organizationId = await getOrganizationId();

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);
    const oneEightyDaysAgo = new Date(now.getTime() - 180 * 86400000);

    // ─── Batch 1: channels (3 queries, §REGLA #3b max 3) ───────────
    const [channelsRawRes, spendByPlatformRes, repurchaseRawRes] =
      await Promise.allSettled([
        prisma.$queryRaw<ChannelRow[]>`
          WITH customer_first_source AS (
            SELECT DISTINCT ON (o."customerId")
              o."customerId" as customer_id,
              COALESCE(o."trafficSource", 'direct') as channel
            FROM orders o
            WHERE o."organizationId" = ${organizationId}
              AND o.source = 'VTEX'
              AND o."customerId" IS NOT NULL
            ORDER BY o."customerId", o."orderDate" ASC
          ),
          customer_ltv_inner AS (
            SELECT
              o."customerId" as customer_id,
              SUM(o."totalValue") as ltv
            FROM orders o
            WHERE o."organizationId" = ${organizationId}
              AND o.source = 'VTEX'
              AND o."customerId" IS NOT NULL
              AND o.status NOT IN ('CANCELLED', 'RETURNED')
            GROUP BY o."customerId"
          )
          SELECT
            cfs.channel,
            COUNT(*)::int as customers,
            ROUND(AVG(COALESCE(cl.ltv, 0))::numeric, 2)::float as avg_ltv
          FROM customer_first_source cfs
          LEFT JOIN customer_ltv_inner cl ON cl.customer_id = cfs.customer_id
          GROUP BY cfs.channel
          HAVING COUNT(*) >= 10
          ORDER BY COUNT(*) DESC
        `,
        prisma.$queryRaw<SpendRow[]>`
          SELECT
            m.platform::text as platform,
            COALESCE(SUM(m.spend), 0)::float as total_spend
          FROM ad_set_metrics_daily m
          WHERE m."organizationId" = ${organizationId}
            AND m.date >= ${oneEightyDaysAgo}
          GROUP BY m.platform
        `,
        prisma.$queryRaw<RepurchaseRow[]>`
          WITH ordered_orders AS (
            SELECT
              o."customerId" as customer_id,
              o."orderDate" as order_date,
              LAG(o."orderDate") OVER (
                PARTITION BY o."customerId"
                ORDER BY o."orderDate"
              ) as prev_date
            FROM orders o
            WHERE o."organizationId" = ${organizationId}
              AND o.source = 'VTEX'
              AND o."customerId" IS NOT NULL
              AND o.status NOT IN ('CANCELLED', 'RETURNED')
              AND o."orderDate" >= ${oneEightyDaysAgo}
          ),
          gaps AS (
            SELECT
              EXTRACT(DAY FROM (order_date - prev_date))::int as days_between
            FROM ordered_orders
            WHERE prev_date IS NOT NULL
          )
          SELECT
            CASE
              WHEN days_between <= 7 THEN 4
              WHEN days_between <= 14 THEN 11
              WHEN days_between <= 21 THEN 18
              WHEN days_between <= 28 THEN 25
              WHEN days_between <= 45 THEN 37
              WHEN days_between <= 60 THEN 53
              WHEN days_between <= 90 THEN 75
              WHEN days_between <= 120 THEN 105
              ELSE 150
            END as days_between,
            COUNT(*)::int as customers
          FROM gaps
          WHERE days_between > 0 AND days_between <= 180
          GROUP BY 1
          ORDER BY 1
        `,
      ]);

    const channelsRaw =
      channelsRawRes.status === "fulfilled" ? channelsRawRes.value : [];
    const spendByPlatform =
      spendByPlatformRes.status === "fulfilled" ? spendByPlatformRes.value : [];
    const repurchaseRaw =
      repurchaseRawRes.status === "fulfilled" ? repurchaseRawRes.value : [];

    // ─── Batch 2: cohorts + whales + pixel visitors ───────────────
    const [cohortRowsRes, whalesRawRes, behavioralVisitorsRes] =
      await Promise.allSettled([
        prisma.$queryRaw<CohortRow[]>`
          WITH first_orders AS (
            SELECT
              o."customerId" as customer_id,
              MIN(o."orderDate") as first_order
            FROM orders o
            WHERE o."organizationId" = ${organizationId}
              AND o.source = 'VTEX'
              AND o."customerId" IS NOT NULL
              AND o.status NOT IN ('CANCELLED', 'RETURNED')
            GROUP BY o."customerId"
          ),
          cohort_customers AS (
            SELECT
              TO_CHAR(DATE_TRUNC('month', first_order), 'YYYY-MM') as cohort_month,
              customer_id,
              first_order
            FROM first_orders
            WHERE first_order >= ${new Date(now.getTime() - 365 * 86400000)}
              AND first_order < ${new Date(now.getTime() - 90 * 86400000)}
          ),
          m3_active AS (
            SELECT DISTINCT
              cc.cohort_month,
              cc.customer_id
            FROM cohort_customers cc
            JOIN orders o ON o."customerId" = cc.customer_id
              AND o."organizationId" = ${organizationId}
              AND o.source = 'VTEX'
              AND o.status NOT IN ('CANCELLED', 'RETURNED')
              AND o."orderDate" > cc.first_order
              AND o."orderDate" <= cc.first_order + INTERVAL '120 days'
              AND o."orderDate" >= cc.first_order + INTERVAL '60 days'
          )
          SELECT
            cc.cohort_month,
            COUNT(DISTINCT cc.customer_id)::int as customers,
            COALESCE(
              COUNT(DISTINCT m3.customer_id)::numeric /
              NULLIF(COUNT(DISTINCT cc.customer_id), 0)::numeric,
              0
            )::float as m3_retention
          FROM cohort_customers cc
          LEFT JOIN m3_active m3 ON m3.cohort_month = cc.cohort_month
            AND m3.customer_id = cc.customer_id
          GROUP BY cc.cohort_month
          ORDER BY cc.cohort_month DESC
          LIMIT 12
        `,
        prisma.$queryRaw<WhaleRow[]>`
          WITH customer_ltv_local AS (
            SELECT
              o."customerId" as cid,
              SUM(o."totalValue")::float as total_ltv,
              MAX(o."orderDate") as last_order,
              COUNT(*)::int as total_orders,
              COUNT(*) FILTER (WHERE o."orderDate" >= ${ninetyDaysAgo})::int as orders_last_90d,
              COUNT(*) FILTER (
                WHERE o."orderDate" >= ${oneEightyDaysAgo}
                  AND o."orderDate" < ${ninetyDaysAgo}
              )::int as orders_prev_90d,
              COALESCE(AVG(o."totalValue") FILTER (WHERE o."orderDate" >= ${ninetyDaysAgo}), 0)::float as aov_last_90d,
              COALESCE(AVG(o."totalValue") FILTER (
                WHERE o."orderDate" >= ${oneEightyDaysAgo}
                  AND o."orderDate" < ${ninetyDaysAgo}
              ), 0)::float as aov_prev_90d,
              MIN(o."orderDate") as first_order
            FROM orders o
            WHERE o."organizationId" = ${organizationId}
              AND o.source = 'VTEX'
              AND o."customerId" IS NOT NULL
              AND o.status NOT IN ('CANCELLED', 'RETURNED')
            GROUP BY o."customerId"
          ),
          top_whales AS (
            SELECT * FROM customer_ltv_local
            WHERE total_orders >= 2
            ORDER BY total_ltv DESC
            LIMIT 50
          )
          SELECT
            tw.cid as customer_id,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c."firstName", c."lastName")), ''), c.email, 'Cliente ' || SUBSTRING(tw.cid, 1, 6)) as display_name,
            tw.total_ltv,
            EXTRACT(DAY FROM (${now}::timestamptz - tw.last_order))::int as days_since_last,
            CASE
              WHEN tw.total_orders >= 3
              THEN (EXTRACT(DAY FROM (tw.last_order - tw.first_order)) / NULLIF(tw.total_orders - 1, 0))::float
              ELSE NULL
            END as median_days_between,
            tw.orders_last_90d,
            tw.orders_prev_90d,
            tw.aov_last_90d,
            tw.aov_prev_90d
          FROM top_whales tw
          LEFT JOIN customers c ON c.id = tw.cid
          ORDER BY tw.total_ltv DESC
        `,
        prisma.$queryRaw<BehavioralVisitorRow[]>`
          WITH recent_visitors AS (
            SELECT
              v.id,
              v."totalSessions" as total_sessions,
              v."totalPageViews" as total_page_views,
              COALESCE(array_length(v."deviceTypes", 1), 0) as device_types_count,
              v."lastSeenAt" as last_seen_at,
              v."customerId" as customer_id,
              (v.email IS NOT NULL OR v.phone IS NOT NULL) as is_identified
            FROM pixel_visitors v
            WHERE v."organizationId" = ${organizationId}
            ORDER BY v."lastSeenAt" DESC
            LIMIT 500
          ),
          cart_adds AS (
            SELECT e."visitorId" as vid, COUNT(*)::int as cnt
            FROM pixel_events e
            JOIN recent_visitors rv ON rv.id = e."visitorId"
            WHERE e."organizationId" = ${organizationId}
              AND e.type = 'ADD_TO_CART'
              AND e.timestamp >= ${new Date(now.getTime() - 30 * 86400000)}
            GROUP BY e."visitorId"
          ),
          unique_products AS (
            SELECT e."visitorId" as vid, COUNT(DISTINCT (e.props->>'item_id'))::int as cnt
            FROM pixel_events e
            JOIN recent_visitors rv ON rv.id = e."visitorId"
            WHERE e."organizationId" = ${organizationId}
              AND e.type = 'VIEW_PRODUCT'
              AND e.props->>'item_id' IS NOT NULL
            GROUP BY e."visitorId"
          ),
          purchases AS (
            SELECT e."visitorId" as vid, COUNT(*)::int as cnt
            FROM pixel_events e
            JOIN recent_visitors rv ON rv.id = e."visitorId"
            WHERE e."organizationId" = ${organizationId}
              AND e.type = 'PURCHASE'
            GROUP BY e."visitorId"
          ),
          first_sources AS (
            SELECT DISTINCT ON (e."visitorId")
              e."visitorId" as vid,
              e."utmParams"->>'utm_source' as source
            FROM pixel_events e
            JOIN recent_visitors rv ON rv.id = e."visitorId"
            WHERE e."organizationId" = ${organizationId}
              AND e."utmParams"->>'utm_source' IS NOT NULL
            ORDER BY e."visitorId", e.timestamp ASC
          )
          SELECT
            rv.id,
            rv.total_sessions,
            rv.total_page_views,
            rv.device_types_count,
            rv.last_seen_at,
            COALESCE(ca.cnt, 0) as cart_adds_30d,
            COALESCE(up.cnt, 0) as unique_products,
            (COALESCE(p.cnt, 0) > 0) as has_purchase,
            fs.source as first_source,
            (rv.customer_id IS NOT NULL) as has_customer,
            rv.is_identified
          FROM recent_visitors rv
          LEFT JOIN cart_adds ca ON ca.vid = rv.id
          LEFT JOIN unique_products up ON up.vid = rv.id
          LEFT JOIN purchases p ON p.vid = rv.id
          LEFT JOIN first_sources fs ON fs.vid = rv.id
        `,
      ]);

    const cohortRows =
      cohortRowsRes.status === "fulfilled" ? cohortRowsRes.value : [];
    const whalesRaw =
      whalesRawRes.status === "fulfilled" ? whalesRawRes.value : [];
    const behavioralVisitors =
      behavioralVisitorsRes.status === "fulfilled"
        ? behavioralVisitorsRes.value
        : [];

    // ─── Armado de inputs para el engine ───────────────────────────

    // Map spend por platform a channel string
    const spendMap = new Map<string, number>();
    for (const s of spendByPlatform) {
      const platform = s.platform.toUpperCase();
      if (platform === "META") {
        spendMap.set("paid-meta", Number(s.total_spend) || 0);
        spendMap.set("meta", Number(s.total_spend) || 0);
      } else if (platform === "GOOGLE") {
        spendMap.set("paid-google", Number(s.total_spend) || 0);
        spendMap.set("google", Number(s.total_spend) || 0);
      }
    }

    const channels: ChannelLtvStat[] = channelsRaw.map((c) => {
      const lower = c.channel.toLowerCase();
      const spend = spendMap.get(lower) ?? null;
      return {
        channel: c.channel,
        customers: Number(c.customers) || 0,
        avgLtv: Number(c.avg_ltv) || 0,
        cac:
          spend != null && c.customers > 0
            ? Number((spend / c.customers).toFixed(2))
            : null,
      };
    });

    // Repurchase buckets: agrupamos en rangos fijos
    const bucketDefs: Array<[number, number]> = [
      [1, 7],
      [8, 14],
      [15, 21],
      [22, 28],
      [29, 45],
      [46, 60],
      [61, 90],
      [91, 120],
      [121, 180],
    ];
    const bucketMap = new Map<string, number>();
    for (const r of repurchaseRaw) {
      const days = Number(r.days_between) || 0;
      const def = bucketDefs.find((d) => days >= d[0] && days <= d[1]);
      if (!def) continue;
      const key = `${def[0]}-${def[1]}`;
      bucketMap.set(
        key,
        (bucketMap.get(key) ?? 0) + (Number(r.customers) || 0)
      );
    }
    const repurchaseBuckets: RepurchaseBucket[] = bucketDefs
      .map(([lo, hi]) => ({
        daysRange: [lo, hi] as [number, number],
        customers: bucketMap.get(`${lo}-${hi}`) ?? 0,
      }))
      .filter((b) => b.customers > 0);

    // Cohorts
    const cohorts: CohortStat[] = cohortRows.map((c) => ({
      cohortMonth: c.cohort_month,
      m3Retention: Number(c.m3_retention) || 0,
      customers: Number(c.customers) || 0,
    }));
    const avgCohortM3Retention =
      cohorts.length > 0
        ? cohorts.reduce((acc, c) => acc + c.m3Retention, 0) / cohorts.length
        : null;

    // Behavioral summary
    let anonymousHighScore = 0;
    let identifiedNoPurchase = 0;
    let totalHighScore = 0;
    for (const v of behavioralVisitors) {
      const daysSince = daysBetween(new Date(v.last_seen_at), now);
      const s = computeBehavioralScore({
        totalSessions: Number(v.total_sessions) || 0,
        totalPageViews: Number(v.total_page_views) || 0,
        cartAddsLast30d: Number(v.cart_adds_30d) || 0,
        uniqueProductsViewed: Number(v.unique_products) || 0,
        source: v.first_source,
        deviceTypesCount: Number(v.device_types_count) || 0,
        daysSinceLastSeen: daysSince,
        hasPurchase: Boolean(v.has_purchase),
      });
      if (s.score >= 70) {
        totalHighScore++;
        if (!v.is_identified && !v.has_customer) anonymousHighScore++;
      }
      if (v.is_identified && !v.has_customer) identifiedNoPurchase++;
    }
    const behavioral: BehavioralSummary = {
      anonymousHighScore,
      identifiedNoPurchase,
      totalHighScore,
    };

    // Whales at risk
    const whalesAtRisk: WhaleAtRiskStat[] = whalesRaw
      .map((w) => {
        const churn = computeChurnScore({
          daysSinceLastOrder: Number(w.days_since_last) || 0,
          medianDaysBetweenOrders: w.median_days_between
            ? Number(w.median_days_between)
            : null,
          ordersLast90d: Number(w.orders_last_90d) || 0,
          ordersPrev90d:
            w.orders_prev_90d != null ? Number(w.orders_prev_90d) : null,
          aovLast90d: w.aov_last_90d != null ? Number(w.aov_last_90d) : null,
          aovPrev90d: w.aov_prev_90d != null ? Number(w.aov_prev_90d) : null,
          pixelSessionsLast30d: null,
          pixelSessionsPrev30d: null,
        });
        return {
          customerId: w.customer_id,
          displayName: w.display_name,
          churnScore: churn.score,
          ltv: Number(w.total_ltv) || 0,
        };
      })
      .filter((w) => w.churnScore >= 70)
      .slice(0, 20);

    // ─── Ejecutar engine ───────────────────────────────────────────
    const insights = generateInsights({
      channels,
      repurchaseBuckets,
      cohorts,
      avgCohortM3Retention,
      behavioral,
      whalesAtRisk,
    });

    return NextResponse.json({
      insights,
      inputs: {
        channelsCount: channels.length,
        repurchaseBucketsCount: repurchaseBuckets.length,
        cohortsCount: cohorts.length,
        behavioral,
        whalesAtRiskCount: whalesAtRisk.length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/bondly/ltv-insights] error:", err);
    return NextResponse.json(
      {
        error: "Failed to generate insights",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
