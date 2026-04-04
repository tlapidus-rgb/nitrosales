import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const revalidate = 300; // CDN cache 5 min

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

export async function GET(request: Request) {
  try {
    const org = await getOrganization();

    const { searchParams } = new URL(request.url);
    const now = new Date();

    // Accept from/to params; default to last 30 days
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const to = toParam ? new Date(toParam + "T23:59:59.999-03:00") : now;
    const from = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Previous period = same duration before 'from'
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

    return NextResponse.json({
      summary: current,
      previousPeriod: previous,
      changes,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
