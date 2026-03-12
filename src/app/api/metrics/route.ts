import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

async function getPeriodMetrics(orgId: string, from: Date, to: Date) {
  const [orders, webMetrics, adMetrics] = await Promise.all([
    prisma.order.findMany({
      where: {
        organizationId: orgId,
        orderDate: { gte: from, lt: to },
      },
    }),
    prisma.webMetricDaily.findMany({
      where: {
        organizationId: orgId,
        date: { gte: from, lt: to },
      },
    }),
    prisma.adMetricDaily.findMany({
      where: {
        organizationId: orgId,
        date: { gte: from, lt: to },
      },
    }),
  ]);

  const billableStatuses = ["INVOICED", "SHIPPED", "DELIVERED"];
  const billableOrders = orders.filter((o) =>
    billableStatuses.includes(o.status)
  );
  const cancelledOrders = orders.filter((o) => o.status === "CANCELLED");

  const revenue = billableOrders.reduce((s, o) => s + o.totalValue, 0);
  const totalSessions = webMetrics.reduce((s, w) => s + w.sessions, 0);
  const adSpend = adMetrics.reduce((s, a) => s + a.spend, 0);
  const adConversionValue = adMetrics.reduce(
    (s, a) => s + a.conversionValue,
    0
  );
  const totalImpressions = adMetrics.reduce((s, a) => s + a.impressions, 0);
  const totalClicks = adMetrics.reduce((s, a) => s + a.clicks, 0);

  // Platform breakdown
  const googleMetrics = adMetrics.filter((a) => a.platform === "GOOGLE");
  const metaMetrics = adMetrics.filter((a) => a.platform === "META");
  const googleSpend = googleMetrics.reduce((s, a) => s + a.spend, 0);
  const metaSpend = metaMetrics.reduce((s, a) => s + a.spend, 0);

  return {
    revenue,
    orders: billableOrders.length,
    cancelledOrders: cancelledOrders.length,
    cancelledRevenue: cancelledOrders.reduce((s, o) => s + o.totalValue, 0),
    sessions: totalSessions,
    adSpend,
    googleSpend,
    metaSpend,
    roas:
      adSpend > 0
        ? Math.round((adConversionValue / adSpend) * 100) / 100
        : 0,
    conversionRate:
      totalSessions > 0
        ? Math.round((billableOrders.length / totalSessions) * 10000) / 100
        : 0,
    avgTicket:
      billableOrders.length > 0
        ? Math.round(revenue / billableOrders.length)
        : 0,
    impressions: totalImpressions,
    clicks: totalClicks,
    ctr:
      totalImpressions > 0
        ? Math.round((totalClicks / totalImpressions) * 10000) / 100
        : 0,
    cpc: totalClicks > 0 ? Math.round((adSpend / totalClicks) * 100) / 100 : 0,
  };
}

function calcChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export async function GET() {
  try {
    const org = await prisma.organization.findFirst({
      where: { slug: "elmundodeljuguete" },
    });
    if (!org)
      return NextResponse.json({ error: "Org not found" }, { status: 404 });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [current, previous] = await Promise.all([
      getPeriodMetrics(org.id, thirtyDaysAgo, now),
      getPeriodMetrics(org.id, sixtyDaysAgo, thirtyDaysAgo),
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

    return NextResponse.json({
      summary: current,
      previousPeriod: previous,
      changes,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
