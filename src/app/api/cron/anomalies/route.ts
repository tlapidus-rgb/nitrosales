import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { detectRuleBasedAnomalies, detectClaudeAnomalies, MetricSnapshot } from "@/lib/anomaly/detector";
import { sendEmail } from "@/lib/email/send";
import { anomalyAlertEmail, AnomalyForEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Anomaly Detection Cron
 *
 * Runs daily (via Vercel cron or manual trigger).
 * 1. Fetches metrics for current vs previous 7-day period
 * 2. Runs rule-based detection (fast, no API cost)
 * 3. Runs Claude-based detection (contextual analysis)
 * 4. Stores anomalies as Insights in DB
 * 5. Sends email alert if HIGH priority anomalies found
 *
 * Auth: syncKey query param or Authorization header
 */
export async function GET(req: NextRequest) {
  // Auth check
  const { searchParams } = req.nextUrl;
  const syncKey = searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (syncKey !== process.env.SYNC_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all active organizations
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true, users: { select: { email: true }, where: { role: { in: ["OWNER", "ADMIN"] } } } },
    });

    const results: { orgId: string; orgName: string; anomalies: number; emailed: boolean }[] = [];

    for (const org of orgs) {
      const ORG_ID = org.id;

      // ── Build metric snapshots ──
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const fromCurrent = new Date(`${sevenDaysAgo.toISOString().split("T")[0]}T00:00:00.000-03:00`);
      const toCurrent = new Date(`${now.toISOString().split("T")[0]}T23:59:59.999-03:00`);
      const fromPrev = new Date(`${fourteenDaysAgo.toISOString().split("T")[0]}T00:00:00.000-03:00`);
      const toPrev = new Date(`${sevenDaysAgo.toISOString().split("T")[0]}T00:00:00.000-03:00`);

      // Check COGS data coverage (what % of order items have cost data)
      const cogsCoverageResult = await prisma.$queryRaw<[{ total: string; with_cost: string }]>`
        SELECT
          COUNT(*)::text as total,
          COUNT(CASE WHEN COALESCE(oi."costPrice", p."costPrice") IS NOT NULL THEN 1 END)::text as with_cost
        FROM order_items oi
        INNER JOIN orders o ON oi."orderId" = o.id
        LEFT JOIN products p ON oi."productId" = p.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o."orderDate" >= ${fromCurrent}
          AND o."orderDate" <= ${toCurrent}
      `;
      const totalItems = parseInt(cogsCoverageResult[0].total) || 0;
      const itemsWithCost = parseInt(cogsCoverageResult[0].with_cost) || 0;
      const cogsCoverage = totalItems > 0 ? Math.round((itemsWithCost / totalItems) * 100) : 0;

      // Current period
      const [curRevResult, curCogsResult, curAdResult] = await Promise.all([
        prisma.$queryRaw<[{ revenue: string; orders: string; units: string }]>`
          SELECT
            COALESCE(SUM(o."totalValue"), 0)::text as revenue,
            COUNT(DISTINCT o.id)::text as orders,
            COALESCE(SUM(oi.quantity), 0)::text as units
          FROM orders o
          LEFT JOIN order_items oi ON o.id = oi."orderId"
          WHERE o."organizationId" = ${ORG_ID}
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."orderDate" >= ${fromCurrent}
            AND o."orderDate" <= ${toCurrent}
        `,
        prisma.$queryRaw<[{ cogs: string }]>`
          SELECT COALESCE(SUM(
            oi.quantity * COALESCE(oi."costPrice", p."costPrice", 0)
          ), 0)::text as cogs
          FROM order_items oi
          INNER JOIN orders o ON oi."orderId" = o.id
          LEFT JOIN products p ON oi."productId" = p.id
          WHERE o."organizationId" = ${ORG_ID}
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."orderDate" >= ${fromCurrent}
            AND o."orderDate" <= ${toCurrent}
        `,
        prisma.$queryRaw<[{ spend: string; meta_spend: string; google_spend: string; conversions: string; conversion_value: string }]>`
          SELECT
            COALESCE(SUM(m.spend), 0)::text as spend,
            COALESCE(SUM(CASE WHEN m.platform = 'META' THEN m.spend ELSE 0 END), 0)::text as meta_spend,
            COALESCE(SUM(CASE WHEN m.platform = 'GOOGLE' THEN m.spend ELSE 0 END), 0)::text as google_spend,
            COALESCE(SUM(m.conversions), 0)::text as conversions,
            COALESCE(SUM(m."conversionValue"), 0)::text as conversion_value
          FROM ad_metrics_daily m
          WHERE m."organizationId" = ${ORG_ID}
            AND m.date >= ${fromCurrent}::date
            AND m.date <= ${toCurrent}::date
        `,
      ]);

      // Previous period
      const [prevRevResult, prevCogsResult, prevAdResult] = await Promise.all([
        prisma.$queryRaw<[{ revenue: string; orders: string; units: string }]>`
          SELECT
            COALESCE(SUM(o."totalValue"), 0)::text as revenue,
            COUNT(DISTINCT o.id)::text as orders,
            COALESCE(SUM(oi.quantity), 0)::text as units
          FROM orders o
          LEFT JOIN order_items oi ON o.id = oi."orderId"
          WHERE o."organizationId" = ${ORG_ID}
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."orderDate" >= ${fromPrev}
            AND o."orderDate" < ${toPrev}
        `,
        prisma.$queryRaw<[{ cogs: string }]>`
          SELECT COALESCE(SUM(
            oi.quantity * COALESCE(oi."costPrice", p."costPrice", 0)
          ), 0)::text as cogs
          FROM order_items oi
          INNER JOIN orders o ON oi."orderId" = o.id
          LEFT JOIN products p ON oi."productId" = p.id
          WHERE o."organizationId" = ${ORG_ID}
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."orderDate" >= ${fromPrev}
            AND o."orderDate" < ${toPrev}
        `,
        prisma.$queryRaw<[{ spend: string; meta_spend: string; google_spend: string; conversions: string; conversion_value: string }]>`
          SELECT
            COALESCE(SUM(m.spend), 0)::text as spend,
            COALESCE(SUM(CASE WHEN m.platform = 'META' THEN m.spend ELSE 0 END), 0)::text as meta_spend,
            COALESCE(SUM(CASE WHEN m.platform = 'GOOGLE' THEN m.spend ELSE 0 END), 0)::text as google_spend,
            COALESCE(SUM(m.conversions), 0)::text as conversions,
            COALESCE(SUM(m."conversionValue"), 0)::text as conversion_value
          FROM ad_metrics_daily m
          WHERE m."organizationId" = ${ORG_ID}
            AND m.date >= ${fromPrev}::date
            AND m.date < ${toPrev}::date
        `,
      ]);

      // Parse current
      const curRevenue = parseFloat(curRevResult[0].revenue);
      const curOrders = parseInt(curRevResult[0].orders);
      const curCogs = parseFloat(curCogsResult[0].cogs);
      const curAdSpend = parseFloat(curAdResult[0].spend);
      const curConversions = parseInt(curAdResult[0].conversions);
      const curConvValue = parseFloat(curAdResult[0].conversion_value);

      const current: MetricSnapshot = {
        revenue: curRevenue,
        orders: curOrders,
        grossProfit: curRevenue - curCogs,
        grossMargin: curRevenue > 0 ? Math.round(((curRevenue - curCogs) / curRevenue) * 1000) / 10 : 0,
        adSpend: curAdSpend,
        metaSpend: parseFloat(curAdResult[0].meta_spend),
        googleSpend: parseFloat(curAdResult[0].google_spend),
        roas: curAdSpend > 0 ? Math.round((curConvValue / curAdSpend) * 100) / 100 : 0,
        cpa: curConversions > 0 ? Math.round((curAdSpend / curConversions) * 100) / 100 : 0,
        aov: curOrders > 0 ? Math.round(curRevenue / curOrders) : 0,
        cogsCoverage,
      };

      // Parse previous
      const prevRevenue = parseFloat(prevRevResult[0].revenue);
      const prevOrders = parseInt(prevRevResult[0].orders);
      const prevCogs = parseFloat(prevCogsResult[0].cogs);
      const prevAdSpend = parseFloat(prevAdResult[0].spend);
      const prevConversions = parseInt(prevAdResult[0].conversions);
      const prevConvValue = parseFloat(prevAdResult[0].conversion_value);

      const previous: MetricSnapshot = {
        revenue: prevRevenue,
        orders: prevOrders,
        grossProfit: prevRevenue - prevCogs,
        grossMargin: prevRevenue > 0 ? Math.round(((prevRevenue - prevCogs) / prevRevenue) * 1000) / 10 : 0,
        adSpend: prevAdSpend,
        metaSpend: parseFloat(prevAdResult[0].meta_spend),
        googleSpend: parseFloat(prevAdResult[0].google_spend),
        roas: prevAdSpend > 0 ? Math.round((prevConvValue / prevAdSpend) * 100) / 100 : 0,
        cpa: prevConversions > 0 ? Math.round((prevAdSpend / prevConversions) * 100) / 100 : 0,
        aov: prevOrders > 0 ? Math.round(prevRevenue / prevOrders) : 0,
      };

      // ── Detect anomalies ──
      const ruleAnomalies = detectRuleBasedAnomalies(current, previous);
      const claudeAnomalies = await detectClaudeAnomalies(current, previous, org.name);

      // Merge and deduplicate (prefer rule-based for same metric)
      const allAnomalies = [...ruleAnomalies];
      const ruleMetrics = new Set(ruleAnomalies.map(a => a.metric));
      for (const ca of claudeAnomalies) {
        if (!ruleMetrics.has(ca.metric)) {
          allAnomalies.push(ca);
        }
      }

      if (allAnomalies.length === 0) {
        results.push({ orgId: ORG_ID, orgName: org.name, anomalies: 0, emailed: false });
        continue;
      }

      // ── Store in DB as Insights ──
      const insightTypeMap: Record<string, "ALERT" | "OPPORTUNITY" | "TREND" | "RECOMMENDATION"> = {
        ALERT: "ALERT",
        OPPORTUNITY: "OPPORTUNITY",
        TREND: "TREND",
        RECOMMENDATION: "RECOMMENDATION",
      };
      const insightPriorityMap: Record<string, "HIGH" | "MEDIUM" | "LOW"> = {
        HIGH: "HIGH",
        MEDIUM: "MEDIUM",
        LOW: "LOW",
      };

      for (const anomaly of allAnomalies) {
        await prisma.insight.create({
          data: {
            organizationId: ORG_ID,
            type: insightTypeMap[anomaly.type] || "TREND",
            priority: insightPriorityMap[anomaly.priority] || "MEDIUM",
            title: anomaly.title,
            description: anomaly.description,
            action: anomaly.action,
            metric: anomaly.metric,
            metricValue: anomaly.metricValue,
            metricDelta: anomaly.metricDelta,
          },
        });
      }

      // ── Send email if HIGH priority anomalies ──
      const highPriority = allAnomalies.filter(a => a.priority === "HIGH");
      let emailed = false;
      if (highPriority.length > 0 && org.users.length > 0) {
        const emailAnomalies = allAnomalies.map(a => ({
          type: a.type,
          priority: a.priority,
          title: a.title,
          description: a.description,
          action: a.action,
          metric: a.metric,
          metricValue: a.metricValue,
          metricDelta: a.metricDelta,
        }));

        const { subject, html } = anomalyAlertEmail(org.name, emailAnomalies);
        const recipients = org.users.map(u => u.email);
        const result = await sendEmail({ to: recipients, subject, html });
        emailed = result.ok;
      }

      results.push({
        orgId: ORG_ID,
        orgName: org.name,
        anomalies: allAnomalies.length,
        emailed,
      });
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      organizations: results,
      totalAnomalies: results.reduce((s, r) => s + r.anomalies, 0),
    });
  } catch (error: any) {
    console.error("[cron/anomalies] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
