import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

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

    const thirtyDaysAgo = from;

    const [orders, adMetrics, webMetrics] = await Promise.all([
      prisma.order.findMany({
        where: {
          organizationId: org.id,
          orderDate: { gte: thirtyDaysAgo },
          status: { in: ["INVOICED", "SHIPPED", "DELIVERED"] },
        },
        select: { orderDate: true, totalValue: true },
      }),
      prisma.adMetricDaily.findMany({
        where: {
          organizationId: org.id,
          date: { gte: thirtyDaysAgo },
        },
        select: {
          date: true,
          platform: true,
          spend: true,
          impressions: true,
          clicks: true,
          conversions: true,
          conversionValue: true,
        },
      }),
      prisma.webMetricDaily.findMany({
        where: {
          organizationId: org.id,
          date: { gte: thirtyDaysAgo },
        },
        select: { date: true, sessions: true, pageViews: true },
        orderBy: { date: "asc" },
      }),
    ]);

    // Group revenue by day
    const revenueByDay: Record<string, number> = {};
    const ordersByDay: Record<string, number> = {};
    for (const o of orders) {
      const key = o.orderDate.toISOString().split("T")[0];
      revenueByDay[key] = (revenueByDay[key] || 0) + o.totalValue;
      ordersByDay[key] = (ordersByDay[key] || 0) + 1;
    }

    // Group ad spend by day and platform
    const adByDay: Record<
      string,
      { google: number; meta: number; totalSpend: number; impressions: number; clicks: number; conversions: number; conversionValue: number }
    > = {};
    for (const a of adMetrics) {
      const key = a.date.toISOString().split("T")[0];
      if (!adByDay[key])
        adByDay[key] = {
          google: 0,
          meta: 0,
          totalSpend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          conversionValue: 0,
        };
      adByDay[key].totalSpend += a.spend;
      adByDay[key].impressions += a.impressions;
      adByDay[key].clicks += a.clicks;
      adByDay[key].conversions += a.conversions;
      adByDay[key].conversionValue += a.conversionValue;
      if (a.platform === "GOOGLE") adByDay[key].google += a.spend;
      else if (a.platform === "META") adByDay[key].meta += a.spend;
    }

    // Group sessions by day
    const sessionsByDay: Record<string, number> = {};
    for (const w of webMetrics) {
      const key = w.date.toISOString().split("T")[0];
      sessionsByDay[key] = (sessionsByDay[key] || 0) + w.sessions;
    }

    // Build unified daily array for the selected period
    const totalDays = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
    const days: any[] = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(to);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      const ad = adByDay[key] || {
        google: 0,
        meta: 0,
        totalSpend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        conversionValue: 0,
      };
      const revenue = revenueByDay[key] || 0;
      const spend = ad.totalSpend;
      days.push({
        date: key,
        revenue,
        orders: ordersByDay[key] || 0,
        sessions: sessionsByDay[key] || 0,
        adSpend: spend,
        googleSpend: ad.google,
        metaSpend: ad.meta,
        impressions: ad.impressions,
        clicks: ad.clicks,
        conversions: ad.conversions,
        roas: spend > 0 ? Math.round((ad.conversionValue / spend) * 100) / 100 : 0,
      });
    }

    return NextResponse.json({ days });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
