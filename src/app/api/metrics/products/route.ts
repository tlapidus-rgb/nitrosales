import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const ORG_ID = "cmmmga1uq0000sb43w0krvvys";

export async function GET() {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get estimated totals from ALL orders (using itemCount from order list sync)
    const allOrders = await prisma.order.findMany({
      where: {
        organizationId: ORG_ID,
        orderDate: { gte: thirtyDaysAgo },
        status: { notIn: ["CANCELLED"] },
      },
      select: { id: true, itemCount: true, totalValue: true },
    });

    const estimatedTotalUnits = allOrders.reduce((s, o) => s + (o.itemCount || 1), 0);
    const estimatedTotalRevenue = allOrders.reduce((s, o) => s + o.totalValue, 0);

    // Count how many orders have detailed items
    const ordersWithItems = await prisma.order.count({
      where: {
        organizationId: ORG_ID,
        orderDate: { gte: thirtyDaysAgo },
        status: { notIn: ["CANCELLED"] },
        items: { some: {} },
      },
    });

    const totalOrders = allOrders.length;
    const processedPct = totalOrders > 0 ? Math.round((ordersWithItems / totalOrders) * 100) : 0;

    // Get detailed product breakdown from processed orders
    const recentItems = await prisma.orderItem.findMany({
      where: {
        order: {
          organizationId: ORG_ID,
          orderDate: { gte: thirtyDaysAgo },
          status: { notIn: ["CANCELLED"] },
        },
      },
      include: { product: true },
    });

    // Aggregate by product
    const productMap = new Map();
    for (const item of recentItems) {
      const name = item.product?.name || "Sin nombre";
      const productId = item.productId || "unknown";
      const key = productId;

      if (!productMap.has(key)) {
        productMap.set(key, {
          id: productId,
          name: name,
          sku: item.product?.sku || null,
          imageUrl: item.product?.imageUrl || null,
          category: item.product?.category || null,
          unitsSold: 0,
          revenue: 0,
          orders: new Set(),
        });
      }

      const p = productMap.get(key);
      p.unitsSold += item.quantity;
      p.revenue += item.totalPrice;
      p.orders.add(item.orderId);
    }

    const products = Array.from(productMap.values())
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        imageUrl: p.imageUrl,
        category: p.category,
        unitsSold: p.unitsSold,
        revenue: Math.round(p.revenue),
        orders: p.orders.size,
        avgPrice: p.unitsSold > 0 ? Math.round(p.revenue / p.unitsSold) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const topProducts = products.slice(0, 20);

    const detailedRevenue = products.reduce((s, p) => s + p.revenue, 0);
    const detailedUnits = products.reduce((s, p) => s + p.unitsSold, 0);
    const uniqueProducts = products.length;

    // Pareto
    const top20pctCount = Math.max(1, Math.ceil(products.length * 0.2));
    const top20pctRevenue = products.slice(0, top20pctCount).reduce((s, p) => s + p.revenue, 0);
    const paretoConcentration = detailedRevenue > 0 ? Math.round((top20pctRevenue / detailedRevenue) * 100) : 0;

    return NextResponse.json({
      topProducts,
      summary: {
        estimatedTotalUnits,
        estimatedTotalRevenue: Math.round(estimatedTotalRevenue),
        totalOrders,
        detailedUnits,
        detailedRevenue: Math.round(detailedRevenue),
        uniqueProducts,
        paretoConcentration,
        ordersWithItems,
        processedPct,
        isComplete: processedPct >= 99,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
