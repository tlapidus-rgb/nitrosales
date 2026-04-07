import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/send";
import { weeklyDigestEmail, DigestMetrics } from "@/lib/email/templates";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly Digest Cron
 *
 * Runs once per week (Sunday night or Monday morning).
 * 1. Fetches 7-day metrics vs previous 7 days
 * 2. Gets top products and campaigns
 * 3. Generates narrative with Claude
 * 4. Sends digest email to OWNER/ADMIN users
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const syncKey = searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (syncKey !== process.env.SYNC_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orgs = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        users: { select: { email: true }, where: { role: { in: ["OWNER", "ADMIN"] } } },
      },
    });

    const results: { orgId: string; orgName: string; emailed: boolean }[] = [];

    for (const org of orgs) {
      const ORG_ID = org.id;
      if (org.users.length === 0) continue;

      const now = new Date();
      const sevenAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fourteenAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const fromCur = new Date(`${sevenAgo.toISOString().split("T")[0]}T00:00:00.000-03:00`);
      const toCur = new Date(`${now.toISOString().split("T")[0]}T23:59:59.999-03:00`);
      const fromPrev = new Date(`${fourteenAgo.toISOString().split("T")[0]}T00:00:00.000-03:00`);
      const toPrev = new Date(`${sevenAgo.toISOString().split("T")[0]}T00:00:00.000-03:00`);

      // Current period metrics
      const [revCur, cogsCur, adCur, topProds, topCamps] = await Promise.all([
        prisma.$queryRaw<[{ revenue: string; orders: string }]>`
          SELECT COALESCE(SUM(o."totalValue"), 0)::text as revenue, COUNT(DISTINCT o.id)::text as orders
          FROM orders o
          WHERE o."organizationId" = ${ORG_ID} AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."orderDate" >= ${fromCur} AND o."orderDate" <= ${toCur}
        `,
        prisma.$queryRaw<[{ cogs: string }]>`
          SELECT COALESCE(SUM(oi.quantity * COALESCE(oi."costPrice", p."costPrice", 0)), 0)::text as cogs
          FROM order_items oi
          INNER JOIN orders o ON oi."orderId" = o.id
          LEFT JOIN products p ON oi."productId" = p.id
          WHERE o."organizationId" = ${ORG_ID} AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."orderDate" >= ${fromCur} AND o."orderDate" <= ${toCur}
        `,
        prisma.$queryRaw<[{ spend: string; conversions: string; conversion_value: string }]>`
          SELECT COALESCE(SUM(m.spend), 0)::text as spend,
                 COALESCE(SUM(m.conversions), 0)::text as conversions,
                 COALESCE(SUM(m."conversionValue"), 0)::text as conversion_value
          FROM ad_metrics_daily m
          WHERE m."organizationId" = ${ORG_ID}
            AND m.date >= ${fromCur}::date AND m.date <= ${toCur}::date
        `,
        // Top products by revenue
        prisma.$queryRaw<{ name: string; revenue: string; units: string }[]>`
          SELECT p.name, COALESCE(SUM(oi."totalPrice"), 0)::text as revenue, COALESCE(SUM(oi.quantity), 0)::text as units
          FROM order_items oi
          INNER JOIN orders o ON oi."orderId" = o.id
          LEFT JOIN products p ON oi."productId" = p.id
          WHERE o."organizationId" = ${ORG_ID} AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."orderDate" >= ${fromCur} AND o."orderDate" <= ${toCur}
            AND p.name IS NOT NULL
          GROUP BY p.name
          ORDER BY SUM(oi."totalPrice") DESC
          LIMIT 5
        `,
        // Top campaigns by ROAS
        prisma.$queryRaw<{ name: string; platform: string; spend: string; conversion_value: string }[]>`
          SELECT c.name, c.platform::text, COALESCE(SUM(m.spend), 0)::text as spend,
                 COALESCE(SUM(m."conversionValue"), 0)::text as conversion_value
          FROM ad_metrics_daily m
          INNER JOIN ad_campaigns c ON m."campaignId" = c.id
          WHERE m."organizationId" = ${ORG_ID}
            AND m.date >= ${fromCur}::date AND m.date <= ${toCur}::date
            AND m.spend > 0
          GROUP BY c.name, c.platform
          ORDER BY CASE WHEN SUM(m.spend) > 0 THEN SUM(m."conversionValue") / SUM(m.spend) ELSE 0 END DESC
          LIMIT 5
        `,
      ]);

      // Previous period
      const [revPrev, cogsPrev, adPrev] = await Promise.all([
        prisma.$queryRaw<[{ revenue: string; orders: string }]>`
          SELECT COALESCE(SUM(o."totalValue"), 0)::text as revenue, COUNT(DISTINCT o.id)::text as orders
          FROM orders o
          WHERE o."organizationId" = ${ORG_ID} AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."orderDate" >= ${fromPrev} AND o."orderDate" < ${toPrev}
        `,
        prisma.$queryRaw<[{ cogs: string }]>`
          SELECT COALESCE(SUM(oi.quantity * COALESCE(oi."costPrice", p."costPrice", 0)), 0)::text as cogs
          FROM order_items oi
          INNER JOIN orders o ON oi."orderId" = o.id
          LEFT JOIN products p ON oi."productId" = p.id
          WHERE o."organizationId" = ${ORG_ID} AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o."orderDate" >= ${fromPrev} AND o."orderDate" < ${toPrev}
        `,
        prisma.$queryRaw<[{ spend: string; conversions: string; conversion_value: string }]>`
          SELECT COALESCE(SUM(m.spend), 0)::text as spend,
                 COALESCE(SUM(m.conversions), 0)::text as conversions,
                 COALESCE(SUM(m."conversionValue"), 0)::text as conversion_value
          FROM ad_metrics_daily m
          WHERE m."organizationId" = ${ORG_ID}
            AND m.date >= ${fromPrev}::date AND m.date < ${toPrev}::date
        `,
      ]);

      // Parse numbers
      const curRevenue = parseFloat(revCur[0].revenue);
      const curOrders = parseInt(revCur[0].orders);
      const curCogs = parseFloat(cogsCur[0].cogs);
      const curSpend = parseFloat(adCur[0].spend);
      const curConvValue = parseFloat(adCur[0].conversion_value);

      const prevRevenue = parseFloat(revPrev[0].revenue);
      const prevOrders = parseInt(revPrev[0].orders);
      const prevCogs = parseFloat(cogsPrev[0].cogs);
      const prevSpend = parseFloat(adPrev[0].spend);
      const prevConvValue = parseFloat(adPrev[0].conversion_value);

      function pctChange(c: number, p: number): number | null {
        if (p === 0) return c > 0 ? 100 : null;
        return Math.round(((c - p) / Math.abs(p)) * 100);
      }

      const grossProfit = curRevenue - curCogs;
      const prevGrossProfit = prevRevenue - prevCogs;
      const roas = curSpend > 0 ? Math.round((curConvValue / curSpend) * 100) / 100 : 0;
      const prevRoas = prevSpend > 0 ? Math.round((prevConvValue / prevSpend) * 100) / 100 : 0;

      const digestMetrics: DigestMetrics = {
        revenue: curRevenue,
        revenueChange: pctChange(curRevenue, prevRevenue),
        orders: curOrders,
        ordersChange: pctChange(curOrders, prevOrders),
        grossProfit,
        grossProfitChange: pctChange(grossProfit, prevGrossProfit),
        grossMargin: curRevenue > 0 ? Math.round(((curRevenue - curCogs) / curRevenue) * 1000) / 10 : 0,
        adSpend: curSpend,
        adSpendChange: pctChange(curSpend, prevSpend),
        roas,
        roasChange: pctChange(roas, prevRoas),
        aov: curOrders > 0 ? Math.round(curRevenue / curOrders) : 0,
        topProducts: topProds.map(p => ({
          name: p.name,
          revenue: parseFloat(p.revenue),
          units: parseInt(p.units),
        })),
        topCampaigns: topCamps.map(c => {
          const sp = parseFloat(c.spend);
          const cv = parseFloat(c.conversion_value);
          return {
            name: c.name,
            platform: c.platform,
            roas: sp > 0 ? Math.round((cv / sp) * 100) / 100 : 0,
            spend: sp,
          };
        }),
      };

      // Generate narrative with Claude
      let narrative = `Facturacion de $${Math.round(curRevenue).toLocaleString("es-AR")} con ${curOrders} pedidos esta semana.`;
      try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (apiKey) {
          const anthropic = new Anthropic({ apiKey });
          const response = await anthropic.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
            max_tokens: 300,
            system: "Sos Aurum. Genera un parrafo de 2-3 oraciones resumiendo la semana de negocio. Usa espanol rioplatense. Se concreto con datos. No uses bullet points. Solo texto plano, sin markdown.",
            messages: [{
              role: "user",
              content: `Resumi la semana de "${org.name}":
Revenue: $${Math.round(curRevenue).toLocaleString("es-AR")} (${pctChange(curRevenue, prevRevenue) ?? 0}% vs anterior)
Pedidos: ${curOrders} (${pctChange(curOrders, prevOrders) ?? 0}%)
Ganancia Bruta: $${Math.round(grossProfit).toLocaleString("es-AR")} (margen ${digestMetrics.grossMargin}%)
Inversion Ads: $${Math.round(curSpend).toLocaleString("es-AR")} (ROAS ${roas}x)
Top producto: ${topProds[0]?.name || "N/A"}`,
            }],
          });
          const text = response.content[0].type === "text" ? response.content[0].text : "";
          if (text.length > 20) narrative = text;
        }
      } catch (e) {
        console.warn("[digest] Claude narrative failed, using fallback");
      }

      const { subject, html } = weeklyDigestEmail(org.name, digestMetrics, narrative);
      const recipients = org.users.map(u => u.email);
      const emailResult = await sendEmail({ to: recipients, subject, html });

      results.push({ orgId: ORG_ID, orgName: org.name, emailed: emailResult.ok });
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      digests: results,
    });
  } catch (error: any) {
    console.error("[cron/digest] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
