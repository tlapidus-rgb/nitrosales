import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db/client";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [orders, webMetrics, adMetrics, funnelData] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.webMetricDaily.findMany({
        where: { date: { gte: thirtyDaysAgo } },
        orderBy: { date: "asc" },
      }),
      prisma.adMetricDaily.findMany({
        where: { date: { gte: thirtyDaysAgo } },
        orderBy: { date: "asc" },
      }),
      prisma.funnelDaily.findMany({
        where: { date: { gte: thirtyDaysAgo } },
        orderBy: { date: "asc" },
      }),
    ]);

    const totalRevenue = orders.reduce((sum: number, o: any) => sum + (o.totalValue || 0), 0);
    const totalOrders = orders.length;
    const totalSessions = webMetrics.reduce((sum: number, w: any) => sum + (w.sessions || 0), 0);
    const totalAdSpend = adMetrics.reduce((sum: number, a: any) => sum + (a.spend || 0), 0);
    const totalAdRevenue = adMetrics.reduce((sum: number, a: any) => sum + (a.revenue || 0), 0);
    const roas = totalAdSpend > 0 ? totalAdRevenue / totalAdSpend : 0;
    const conversionRate = totalSessions > 0 ? (totalOrders / totalSessions) * 100 : 0;

    return NextResponse.json({
      summary: {
        revenue: totalRevenue,
        orders: totalOrders,
        sessions: totalSessions,
        adSpend: totalAdSpend,
        roas: Math.round(roas * 100) / 100,
        conversionRate: Math.round(conversionRate * 100) / 100,
      },
      charts: {
        orders,
        webMetrics,
        adMetrics,
        funnelData,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
