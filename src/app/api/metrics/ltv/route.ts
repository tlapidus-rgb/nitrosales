export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const revalidate = 0;
export const maxDuration = 60; // Vercel Pro: allow up to 60s
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const ORG_ID = await getOrganizationId();
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const toParam = searchParams.get("to");
    const fromParam = searchParams.get("from");
    const dateTo = toParam ? new Date(toParam + "T23:59:59.999-03:00") : now;
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(now.getTime() - 365 * MS_PER_DAY);
    // LTV analysis only works with VTEX (tienda propia) because MercadoLibre
    // does NOT share customer identity (no email, no name, no customerId).
    // Without customer identification, LTV tracking is impossible.
    const MELI_EXCLUDE = `AND o."source" != 'MELI'`;
    const srcWhere = MELI_EXCLUDE;

    // Period for comparison
    const periodMs = dateTo.getTime() - dateFrom.getTime();
    const prevFrom = new Date(dateFrom.getTime() - periodMs);
    const prevTo = new Date(dateFrom.getTime() - 1);

    // ─────────────────────────────────────────────
    // ALL QUERIES ARE SELECT-ONLY (read-only)
    // ─────────────────────────────────────────────
    const [
      ltvSummary,
      prevLtvSummary,
      ltvByChannel,
      cohortRetention,
      repurchasePattern,
      adSpendByPlatform,
      topCustomers,
    ] = await Promise.all([
      // 1. LTV Summary — current period
      // Customers whose first order is within the date range
      prisma.$queryRawUnsafe<
        [
          {
            total_customers: string;
            repeat_customers: string;
            avg_ltv: string;
            median_ltv: string;
            avg_orders: string;
            avg_ticket: string;
            avg_days_to_repurchase: string;
            total_revenue: string;
          },
        ]
      >(
        `
        WITH customer_stats AS (
          SELECT
            o."customerId",
            COUNT(*)::int AS order_count,
            SUM(o."totalValue") AS total_spent,
            AVG(o."totalValue") AS avg_ticket,
            MIN(o."orderDate") AS first_order,
            MAX(o."orderDate") AS last_order
          FROM orders o
          WHERE o."organizationId" = '${ORG_ID}'
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."customerId" IS NOT NULL
            ${srcWhere}
          GROUP BY o."customerId"
          HAVING MIN(o."orderDate") >= $1 AND MIN(o."orderDate") <= $2
        ),
        repurchase_days AS (
          SELECT AVG(EXTRACT(DAY FROM last_order - first_order))::float AS avg_days
          FROM customer_stats
          WHERE order_count >= 2
        )
        SELECT
          COUNT(*)::text AS total_customers,
          COUNT(*) FILTER (WHERE order_count >= 2)::text AS repeat_customers,
          COALESCE(AVG(total_spent), 0)::text AS avg_ltv,
          COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_spent), 0)::text AS median_ltv,
          COALESCE(AVG(order_count), 0)::text AS avg_orders,
          COALESCE(AVG(avg_ticket), 0)::text AS avg_ticket,
          COALESCE((SELECT avg_days FROM repurchase_days), 0)::text AS avg_days_to_repurchase,
          COALESCE(SUM(total_spent), 0)::text AS total_revenue
        FROM customer_stats
      `,
        dateFrom,
        dateTo
      ),

      // 2. LTV Summary — previous period (for comparison)
      prisma.$queryRawUnsafe<
        [{ total_customers: string; avg_ltv: string; repeat_customers: string }]
      >(
        `
        WITH customer_stats AS (
          SELECT
            o."customerId",
            COUNT(*)::int AS order_count,
            SUM(o."totalValue") AS total_spent
          FROM orders o
          WHERE o."organizationId" = '${ORG_ID}'
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."customerId" IS NOT NULL
            ${srcWhere}
          GROUP BY o."customerId"
          HAVING MIN(o."orderDate") >= $1 AND MIN(o."orderDate") <= $2
        )
        SELECT
          COUNT(*)::text AS total_customers,
          COALESCE(AVG(total_spent), 0)::text AS avg_ltv,
          COUNT(*) FILTER (WHERE order_count >= 2)::text AS repeat_customers
        FROM customer_stats
      `,
        prevFrom,
        prevTo
      ),

      // 3. LTV by acquisition channel
      // Uses pixel_attributions (LAST_CLICK) on the FIRST order to determine acquisition channel
      // Falls back to orders.trafficSource if no pixel attribution
      prisma.$queryRawUnsafe<
        Array<{
          channel: string;
          customers: string;
          avg_ltv: string;
          repeat_rate: string;
          total_revenue: string;
          avg_orders: string;
        }>
      >(
        `
        WITH first_orders AS (
          SELECT
            o."customerId",
            MIN(o.id) AS first_order_id,
            MIN(o."orderDate") AS first_order_date
          FROM orders o
          WHERE o."organizationId" = '${ORG_ID}'
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."customerId" IS NOT NULL
            ${srcWhere}
          GROUP BY o."customerId"
          HAVING MIN(o."orderDate") >= $1 AND MIN(o."orderDate") <= $2
        ),
        acquisition_channel AS (
          SELECT
            fo."customerId",
            COALESCE(
              CASE
                WHEN pa.touchpoints IS NOT NULL THEN
                  CASE
                    WHEN pa.touchpoints::text ILIKE '%google%' AND pa.touchpoints::text ILIKE '%cpc%' THEN 'Google Ads'
                    WHEN pa.touchpoints::text ILIKE '%facebook%' OR pa.touchpoints::text ILIKE '%meta%' OR pa.touchpoints::text ILIKE '%instagram%' THEN 'Meta Ads'
                    WHEN pa.touchpoints::text ILIKE '%google%' AND pa.touchpoints::text ILIKE '%organic%' THEN 'Google Organic'
                    WHEN pa.touchpoints::text ILIKE '%tiktok%' THEN 'TikTok'
                    ELSE NULL
                  END
                ELSE NULL
              END,
              CASE
                WHEN o."trafficSource" ILIKE '%paid%' OR o."trafficSource" ILIKE '%cpc%' THEN
                  CASE WHEN o."trafficSource" ILIKE '%google%' THEN 'Google Ads'
                       WHEN o."trafficSource" ILIKE '%facebook%' OR o."trafficSource" ILIKE '%meta%' THEN 'Meta Ads'
                       ELSE 'Paid Otro' END
                WHEN o."trafficSource" ILIKE '%organic%' THEN 'Google Organic'
                WHEN o."trafficSource" ILIKE '%direct%' THEN 'Directo'
                ELSE COALESCE(o."trafficSource", 'Sin datos')
              END
            ) AS channel
          FROM first_orders fo
          JOIN orders o ON o.id = fo.first_order_id
          LEFT JOIN pixel_attributions pa ON pa."orderId" = fo.first_order_id AND pa.model = 'LAST_CLICK'
        ),
        customer_lifetime AS (
          SELECT
            ac.channel,
            ac."customerId",
            COUNT(o2.id)::int AS order_count,
            SUM(o2."totalValue") AS total_spent
          FROM acquisition_channel ac
          JOIN orders o2 ON o2."customerId" = ac."customerId"
            AND o2."organizationId" = '${ORG_ID}'
            AND o2.status NOT IN ('CANCELLED', 'RETURNED')
          GROUP BY ac.channel, ac."customerId"
        )
        SELECT
          channel,
          COUNT(*)::text AS customers,
          COALESCE(AVG(total_spent), 0)::text AS avg_ltv,
          (COUNT(*) FILTER (WHERE order_count >= 2) * 100.0 / NULLIF(COUNT(*), 0))::text AS repeat_rate,
          COALESCE(SUM(total_spent), 0)::text AS total_revenue,
          COALESCE(AVG(order_count), 0)::text AS avg_orders
        FROM customer_lifetime
        GROUP BY channel
        ORDER BY AVG(total_spent) DESC
      `,
        dateFrom,
        dateTo
      ),

      // 4. Cohort retention table
      // Groups customers by month of first purchase, then tracks % who reorder in months 1-12
      prisma.$queryRawUnsafe<
        Array<{
          cohort_month: string;
          cohort_size: string;
          month_0_revenue: string;
          m1: string; m2: string; m3: string; m4: string; m5: string; m6: string;
          m7: string; m8: string; m9: string; m10: string; m11: string; m12: string;
        }>
      >(
        `
        WITH customer_first AS (
          SELECT
            o."customerId",
            MIN(o."orderDate") AS first_order_date,
            TO_CHAR(MIN(o."orderDate") AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM') AS cohort_month
          FROM orders o
          WHERE o."organizationId" = '${ORG_ID}'
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."customerId" IS NOT NULL
            ${srcWhere}
          GROUP BY o."customerId"
          HAVING MIN(o."orderDate") >= $1 AND MIN(o."orderDate") <= $2
        ),
        all_orders AS (
          SELECT
            cf."customerId",
            cf.cohort_month,
            cf.first_order_date,
            o."orderDate",
            o."totalValue",
            EXTRACT(MONTH FROM AGE(o."orderDate", cf.first_order_date))::int
              + EXTRACT(YEAR FROM AGE(o."orderDate", cf.first_order_date))::int * 12
              AS months_since_first
          FROM customer_first cf
          JOIN orders o ON o."customerId" = cf."customerId"
            AND o."organizationId" = '${ORG_ID}'
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
        )
        SELECT
          cohort_month,
          COUNT(DISTINCT "customerId")::text AS cohort_size,
          COALESCE(SUM(CASE WHEN months_since_first = 0 THEN "totalValue" END), 0)::text AS month_0_revenue,
          (COUNT(DISTINCT CASE WHEN months_since_first = 1 THEN "customerId" END) * 100.0 / NULLIF(COUNT(DISTINCT "customerId"), 0))::text AS m1,
          (COUNT(DISTINCT CASE WHEN months_since_first = 2 THEN "customerId" END) * 100.0 / NULLIF(COUNT(DISTINCT "customerId"), 0))::text AS m2,
          (COUNT(DISTINCT CASE WHEN months_since_first = 3 THEN "customerId" END) * 100.0 / NULLIF(COUNT(DISTINCT "customerId"), 0))::text AS m3,
          (COUNT(DISTINCT CASE WHEN months_since_first = 4 THEN "customerId" END) * 100.0 / NULLIF(COUNT(DISTINCT "customerId"), 0))::text AS m4,
          (COUNT(DISTINCT CASE WHEN months_since_first = 5 THEN "customerId" END) * 100.0 / NULLIF(COUNT(DISTINCT "customerId"), 0))::text AS m5,
          (COUNT(DISTINCT CASE WHEN months_since_first = 6 THEN "customerId" END) * 100.0 / NULLIF(COUNT(DISTINCT "customerId"), 0))::text AS m6,
          (COUNT(DISTINCT CASE WHEN months_since_first = 7 THEN "customerId" END) * 100.0 / NULLIF(COUNT(DISTINCT "customerId"), 0))::text AS m7,
          (COUNT(DISTINCT CASE WHEN months_since_first = 8 THEN "customerId" END) * 100.0 / NULLIF(COUNT(DISTINCT "customerId"), 0))::text AS m8,
          (COUNT(DISTINCT CASE WHEN months_since_first = 9 THEN "customerId" END) * 100.0 / NULLIF(COUNT(DISTINCT "customerId"), 0))::text AS m9,
          (COUNT(DISTINCT CASE WHEN months_since_first = 10 THEN "customerId" END) * 100.0 / NULLIF(COUNT(DISTINCT "customerId"), 0))::text AS m10,
          (COUNT(DISTINCT CASE WHEN months_since_first = 11 THEN "customerId" END) * 100.0 / NULLIF(COUNT(DISTINCT "customerId"), 0))::text AS m11,
          (COUNT(DISTINCT CASE WHEN months_since_first = 12 THEN "customerId" END) * 100.0 / NULLIF(COUNT(DISTINCT "customerId"), 0))::text AS m12
        FROM all_orders
        GROUP BY cohort_month
        ORDER BY cohort_month
      `,
        dateFrom,
        dateTo
      ),

      // 5. Repurchase pattern — days between 1st and 2nd order
      prisma.$queryRawUnsafe<
        Array<{ bucket: string; customers: string; pct: string }>
      >(
        `
        WITH ordered AS (
          SELECT
            o."customerId",
            o."orderDate",
            ROW_NUMBER() OVER (PARTITION BY o."customerId" ORDER BY o."orderDate") AS rn
          FROM orders o
          WHERE o."organizationId" = '${ORG_ID}'
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."customerId" IS NOT NULL
            ${srcWhere}
        ),
        first_purchase_in_period AS (
          SELECT "customerId"
          FROM ordered
          WHERE rn = 1 AND "orderDate" >= $1 AND "orderDate" <= $2
        ),
        gaps AS (
          SELECT
            o1."customerId",
            EXTRACT(DAY FROM o2."orderDate" - o1."orderDate")::int AS days_gap
          FROM ordered o1
          JOIN ordered o2 ON o2."customerId" = o1."customerId" AND o2.rn = 2
          WHERE o1.rn = 1 AND o1."customerId" IN (SELECT "customerId" FROM first_purchase_in_period)
        ),
        total_first AS (
          SELECT COUNT(*) AS cnt FROM first_purchase_in_period
        ),
        never_repurchased AS (
          SELECT COUNT(*) AS cnt
          FROM first_purchase_in_period fp
          WHERE NOT EXISTS (
            SELECT 1 FROM ordered o WHERE o."customerId" = fp."customerId" AND o.rn = 2
          )
        )
        SELECT bucket, customers, pct FROM (
          SELECT
            CASE
              WHEN days_gap BETWEEN 0 AND 7 THEN '0-7 dias'
              WHEN days_gap BETWEEN 8 AND 15 THEN '8-15 dias'
              WHEN days_gap BETWEEN 16 AND 30 THEN '16-30 dias'
              WHEN days_gap BETWEEN 31 AND 60 THEN '31-60 dias'
              WHEN days_gap BETWEEN 61 AND 90 THEN '61-90 dias'
              ELSE '90+ dias'
            END AS bucket,
            COUNT(*)::text AS customers,
            (COUNT(*) * 100.0 / NULLIF((SELECT cnt FROM total_first), 0))::text AS pct,
            MIN(days_gap) AS sort_order
          FROM gaps
          GROUP BY 1
          UNION ALL
          SELECT
            'Nunca recompro' AS bucket,
            (SELECT cnt FROM never_repurchased)::text AS customers,
            ((SELECT cnt FROM never_repurchased) * 100.0 / NULLIF((SELECT cnt FROM total_first), 0))::text AS pct,
            999 AS sort_order
        ) sub
        ORDER BY sort_order
      `,
        dateFrom,
        dateTo
      ),

      // 6. Ad spend by platform (for LTV:CAC calculation)
      prisma.$queryRawUnsafe<
        Array<{ platform: string; spend: string }>
      >(
        `
        SELECT
          amd.platform::text AS platform,
          COALESCE(SUM(amd.spend), 0)::text AS spend
        FROM ad_metrics_daily amd
        WHERE amd."organizationId" = '${ORG_ID}'
          AND amd.date >= $1::date
          AND amd.date <= $2::date
        GROUP BY amd.platform
      `,
        dateFrom,
        dateTo
      ),

      // 7. Top 20 customers by LTV
      prisma.$queryRawUnsafe<
        Array<{
          id: string; name: string; email: string;
          channel: string; orders: string; total_spent: string;
          first_order: string; last_order: string; days_as_customer: string;
        }>
      >(
        `
        WITH customer_totals AS (
          SELECT
            o."customerId",
            COUNT(*)::int AS order_count,
            SUM(o."totalValue") AS total_spent,
            MIN(o."orderDate") AS first_order,
            MAX(o."orderDate") AS last_order,
            EXTRACT(DAY FROM NOW() - MIN(o."orderDate"))::int AS days_as_customer
          FROM orders o
          WHERE o."organizationId" = '${ORG_ID}'
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."customerId" IS NOT NULL
            ${srcWhere}
          GROUP BY o."customerId"
          HAVING MIN(o."orderDate") >= $1 AND MIN(o."orderDate") <= $2
        ),
        with_channel AS (
          SELECT
            ct.*,
            COALESCE(
              CASE
                WHEN pa.touchpoints::text ILIKE '%google%' AND pa.touchpoints::text ILIKE '%cpc%' THEN 'Google Ads'
                WHEN pa.touchpoints::text ILIKE '%facebook%' OR pa.touchpoints::text ILIKE '%meta%' OR pa.touchpoints::text ILIKE '%instagram%' THEN 'Meta Ads'
                WHEN pa.touchpoints::text ILIKE '%google%' AND pa.touchpoints::text ILIKE '%organic%' THEN 'Google Organic'
                ELSE NULL
              END,
              CASE
                WHEN fo."trafficSource" ILIKE '%paid%' OR fo."trafficSource" ILIKE '%cpc%' THEN 'Paid'
                WHEN fo."trafficSource" ILIKE '%organic%' THEN 'Organic'
                WHEN fo."trafficSource" ILIKE '%direct%' THEN 'Directo'
                ELSE COALESCE(fo."trafficSource", 'Sin datos')
              END
            ) AS channel
          FROM customer_totals ct
          JOIN orders fo ON fo."customerId" = ct."customerId"
            AND fo."orderDate" = ct.first_order
            AND fo."organizationId" = '${ORG_ID}'
          LEFT JOIN pixel_attributions pa ON pa."orderId" = fo.id AND pa.model = 'LAST_CLICK'
        )
        SELECT
          c.id,
          TRIM(CONCAT(COALESCE(c."firstName", ''), ' ', COALESCE(c."lastName", ''))) AS name,
          COALESCE(c.email, '') AS email,
          wc.channel,
          wc.order_count::text AS orders,
          wc.total_spent::text AS total_spent,
          TO_CHAR(wc.first_order - INTERVAL '3 hours', 'YYYY-MM-DD') AS first_order,
          TO_CHAR(wc.last_order - INTERVAL '3 hours', 'YYYY-MM-DD') AS last_order,
          wc.days_as_customer::text AS days_as_customer
        FROM with_channel wc
        JOIN customers c ON c.id = wc."customerId"
        ORDER BY wc.total_spent DESC
        LIMIT 20
      `,
        dateFrom,
        dateTo
      ),
    ]);

    // ─────────────────────────────────────────────
    // Process results
    // ─────────────────────────────────────────────
    const summary = ltvSummary[0];
    const prevSummary = prevLtvSummary[0];

    const totalCustomers = Number(summary.total_customers);
    const repeatCustomers = Number(summary.repeat_customers);
    const avgLtv = Math.round(Number(summary.avg_ltv));
    const prevAvgLtv = Math.round(Number(prevSummary.avg_ltv));
    const prevTotalCustomers = Number(prevSummary.total_customers);
    const prevRepeatCustomers = Number(prevSummary.repeat_customers);
    const repeatRate =
      totalCustomers > 0
        ? Math.round((repeatCustomers / totalCustomers) * 1000) / 10
        : 0;
    const prevRepeatRate =
      prevTotalCustomers > 0
        ? Math.round((prevRepeatCustomers / prevTotalCustomers) * 1000) / 10
        : 0;

    const pctChange = (c: number, p: number) =>
      p > 0 ? Math.round(((c - p) / p) * 1000) / 10 : c > 0 ? 100 : 0;

    // Build LTV:CAC per channel
    const spendMap: Record<string, number> = {};
    for (const row of adSpendByPlatform) {
      // Map platform enum to channel name
      if (row.platform === "META") spendMap["Meta Ads"] = Number(row.spend);
      if (row.platform === "GOOGLE") spendMap["Google Ads"] = Number(row.spend);
    }

    const channelData = ltvByChannel.map((ch) => {
      const customers = Number(ch.customers);
      const channelAvgLtv = Math.round(Number(ch.avg_ltv));
      const spend = spendMap[ch.channel] || 0;
      const cac = customers > 0 && spend > 0 ? Math.round(spend / customers) : 0;
      const ltvCac = cac > 0 ? Math.round((channelAvgLtv / cac) * 10) / 10 : 0;
      return {
        channel: ch.channel,
        customers,
        avgLtv: channelAvgLtv,
        repeatRate: Math.round(Number(ch.repeat_rate) * 10) / 10,
        totalRevenue: Math.round(Number(ch.total_revenue)),
        avgOrders: Math.round(Number(ch.avg_orders) * 10) / 10,
        spend: Math.round(spend),
        cac,
        ltvCac,
      };
    });

    // Global LTV:CAC
    const totalSpend = Object.values(spendMap).reduce((a, b) => a + b, 0);
    const globalCac =
      totalCustomers > 0 && totalSpend > 0
        ? Math.round(totalSpend / totalCustomers)
        : 0;
    const globalLtvCac =
      globalCac > 0 ? Math.round((avgLtv / globalCac) * 10) / 10 : 0;

    return NextResponse.json({
      summary: {
        totalCustomers,
        repeatCustomers,
        repeatRate,
        avgLtv,
        medianLtv: Math.round(Number(summary.median_ltv)),
        avgOrders: Math.round(Number(summary.avg_orders) * 10) / 10,
        avgTicket: Math.round(Number(summary.avg_ticket)),
        avgDaysToRepurchase: Math.round(Number(summary.avg_days_to_repurchase)),
        totalRevenue: Math.round(Number(summary.total_revenue)),
        globalCac,
        globalLtvCac,
        changes: {
          customers: pctChange(totalCustomers, prevTotalCustomers),
          avgLtv: pctChange(avgLtv, prevAvgLtv),
          repeatRate: Math.round((repeatRate - prevRepeatRate) * 10) / 10, // pp change
        },
      },
      byChannel: channelData,
      cohorts: cohortRetention.map((c) => ({
        month: c.cohort_month,
        size: Number(c.cohort_size),
        revenue: Math.round(Number(c.month_0_revenue)),
        retention: [
          Number(c.m1), Number(c.m2), Number(c.m3), Number(c.m4),
          Number(c.m5), Number(c.m6), Number(c.m7), Number(c.m8),
          Number(c.m9), Number(c.m10), Number(c.m11), Number(c.m12),
        ].map((v) => Math.round(v * 10) / 10),
      })),
      repurchasePattern: repurchasePattern.map((r) => ({
        bucket: r.bucket,
        customers: Number(r.customers),
        pct: Math.round(Number(r.pct) * 10) / 10,
      })),
      topCustomers: topCustomers.map((c) => ({
        id: c.id,
        name: c.name || "Sin nombre",
        email: c.email,
        channel: c.channel,
        orders: Number(c.orders),
        totalSpent: Math.round(Number(c.total_spent)),
        firstOrder: c.first_order,
        lastOrder: c.last_order,
        daysAsCustomer: Number(c.days_as_customer),
      })),
      meta: {
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        source: "VTEX", // LTV only works with tienda propia (VTEX) — ML has no customer identity
      },
    });
  } catch (error: any) {
    console.error("[LTV API] Error:", error);
    return NextResponse.json(
      { error: "Error fetching LTV metrics", detail: error.message },
      { status: 500 }
    );
  }
}
