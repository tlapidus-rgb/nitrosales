import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const ORG_ID = "cmmmga1uq0000sb43w0krvvys";

export async function GET() {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get all order items from the last 30 days with product info
    const recentItems = await prisma.orderItem.findMany({
      where: {
        order: {
          organizationId: ORG_ID,
          orderDate: { gte: thirtyDaysAgo },
          status: { notIn: ["CANCELLED"] },
        },
      },
      include: {
        product: true,
      },
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
          avgPrice: 0,
        });
      }

      const p = productMap.get(key);
      p.unitsSold += item.quantity;
      p.revenue += item.totalPrice;
      p.orders.add(item.orderId);
    }

    // Convert to array and sort by revenue
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

    // Top 20 products
    const topProducts = products.slice(0, 20);

    // Summary stats
    const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
    const totalUnits = products.reduce((s, p) => s + p.unitsSold, 0);
    const uniqueProducts = products.length;

    // Category breakdown
    const categoryMap = new Map();
    for (const p of products) {
      const cat = p.category || "Sin categoria";
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { category: cat, revenue: 0, units: 0, products: 0 });
      }
      const c = categoryMap.get(cat);
      c.revenue += p.revenue;
      c.units += p.unitsSold;
      c.products++;
    }
    const categories = Array.from(categoryMap.values()).sort((a, b) => b.revenue - a.revenue);

    // Pareto: top 20% products = ?% of revenue
    const top20pctCount = Math.max(1, Math.ceil(products.length * 0.2));
    const top20pctRevenue = products.slice(0, top20pctCount).reduce((s, p) => s + p.revenue, 0);
    const paretoConcentration = totalRevenue > 0 ? Math.round((top20pctRevenue / totalRevenue) * 100) : 0;

    return NextResponse.json({
      topProducts,
      summary: {
        totalRevenue,
        totalUnits,
        uniqueProducts,
        paretoConcentration,
      },
      categories,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
