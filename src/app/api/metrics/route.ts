import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function GET() {
  try {
    const org = await prisma.organization.findFirst({ where: { slug: "elmundodeljuguete" } });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Fetch all data in parallel
    const [orders, webMetrics, adMetrics] = await Promise.all([
      prisma.order.findMany({
        where: { organizationId: org.id, orderDate: { gte: thirtyDaysAgo } },
      }),
      prisma.webMetricDaily.findMany({
        where: { organizationId: org.id, date: { gte: thirtyDaysAgo } },
        orderBy: { date: "asc" },
      }),
      prisma.adMetricDaily.findMany({
        where: { organizationId: org.id, date: { gte: thirtyDaysAgo } },
        orderBy: { date: "asc" },
      }),
    ]);

    // CRITICAL: Only count INVOICED, SHIPPED, and DELIVERED as real revenue
    // CANCELLED, PENDING, APPROVED are NOT billable
    const billableStatuses = ["INVOICED", "SHIPPED", "DELIVERED"];
    const billableOrders = orders.filter(o => billableStatuses.includes(o.status));
    const cancelledOrders = orders.filter(o => o.status === "CANCELLED");

    const revenue = billableOrders.reduce((s, o) => s + o.totalValue, 0);
    const totalSessions = webMetrics.reduce((s, w) => s + w.sessions, 0);
    const adSpend = adMetrics.reduce((s, a) => s + a.spend, 0);
    const adConversionValue = adMetrics.reduce((s, a) => s + a.conversionValue, 0);
    const roas = adSpend > 0 ? Math.round((adConversionValue / adSpend) * 100) / 100 : 0;
    const conversionRate = totalSessions > 0 ? Math.round((billableOrders.length / totalSessions) * 10000) / 100 : 0;

    return NextResponse.json({
      summary: {
        revenue,
        orders: billableOrders.length,
        cancelledOrders: cancelledOrders.length,
        cancelledRevenue: cancelledOrders.reduce((s, o) => s + o.totalValue, 0),
        sessions: totalSessions,
        adSpend,
        roas,
        conversionRate,
        avgTicket: billableOrders.length > 0 ? Math.round(revenue / billableOrders.length) : 0,
      },
      charts: {
        orders: billableOrders,
        webMetrics,
        adMetrics,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
