import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const org = await prisma.organization.findFirst({
      where: { slug: "elmundodeljuguete" },
    });
    if (!org)
      return NextResponse.json({ error: "Org not found" }, { status: 404 });

    // Get all customers with orders
    const customers = await prisma.customer.findMany({
      where: { organizationId: org.id },
      orderBy: { totalSpent: "desc" },
    });

    const totalCustomers = customers.length;
    const customersWithOrders = customers.filter((c) => c.totalOrders > 0);
    const repeatCustomers = customers.filter((c) => c.totalOrders > 1);
    const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);
    const totalOrders = customers.reduce((s, c) => s + c.totalOrders, 0);

    // Average metrics
    const avgOrdersPerCustomer =
      customersWithOrders.length > 0
        ? totalOrders / customersWithOrders.length
        : 0;
    const avgSpentPerCustomer =
      customersWithOrders.length > 0
        ? totalRevenue / customersWithOrders.length
        : 0;
    const repeatRate =
      customersWithOrders.length > 0
        ? Math.round(
            (repeatCustomers.length / customersWithOrders.length) * 10000
          ) / 100
        : 0;

    // Top customers by LTV
    const topCustomers = customers.slice(0, 20).map((c) => ({
      id: c.id,
      name:
        [c.firstName, c.lastName].filter(Boolean).join(" ") ||
        c.email ||
        "Sin nombre",
      email: c.email || "-",
      city: c.city || "-",
      state: c.state || "-",
      totalOrders: c.totalOrders,
      totalSpent: c.totalSpent,
      avgTicket: c.totalOrders > 0 ? c.totalSpent / c.totalOrders : 0,
      firstOrderAt: c.firstOrderAt,
      lastOrderAt: c.lastOrderAt,
    }));

    // Pareto analysis: top 20% of customers = ?% of revenue
    const top20Count = Math.max(1, Math.ceil(customersWithOrders.length * 0.2));
    const sortedBySpent = [...customersWithOrders].sort(
      (a, b) => b.totalSpent - a.totalSpent
    );
    const top20Revenue = sortedBySpent
      .slice(0, top20Count)
      .reduce((s, c) => s + c.totalSpent, 0);
    const paretoConcentration =
      totalRevenue > 0
        ? Math.round((top20Revenue / totalRevenue) * 100)
        : 0;

    // Frequency distribution
    const frequency = {
      oneOrder: customers.filter((c) => c.totalOrders === 1).length,
      twoToThree: customers.filter(
        (c) => c.totalOrders >= 2 && c.totalOrders <= 3
      ).length,
      fourToSix: customers.filter(
        (c) => c.totalOrders >= 4 && c.totalOrders <= 6
      ).length,
      sevenPlus: customers.filter((c) => c.totalOrders >= 7).length,
    };

    // Recent customers (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newCustomers = customers.filter(
      (c) => c.firstOrderAt && new Date(c.firstOrderAt) >= thirtyDaysAgo
    ).length;
    const activeCustomers = customers.filter(
      (c) => c.lastOrderAt && new Date(c.lastOrderAt) >= thirtyDaysAgo
    ).length;

    // Spending tiers
    const tiers = {
      vip: customers.filter((c) => c.totalSpent >= 200000).length,
      high: customers.filter(
        (c) => c.totalSpent >= 50000 && c.totalSpent < 200000
      ).length,
      medium: customers.filter(
        (c) => c.totalSpent >= 10000 && c.totalSpent < 50000
      ).length,
      low: customers.filter(
        (c) => c.totalSpent > 0 && c.totalSpent < 10000
      ).length,
    };

    // Cities summary
    const cityCounts: Record<string, number> = {};
    customers.forEach((c) => {
      const city = c.city || "Sin dato";
      cityCounts[city] = (cityCounts[city] || 0) + 1;
    });
    const topCities = Object.entries(cityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([city, count]) => ({ city, count }));

    return NextResponse.json({
      summary: {
        totalCustomers,
        customersWithOrders: customersWithOrders.length,
        repeatCustomers: repeatCustomers.length,
        repeatRate,
        totalRevenue,
        totalOrders,
        avgOrdersPerCustomer:
          Math.round(avgOrdersPerCustomer * 100) / 100,
        avgSpentPerCustomer: Math.round(avgSpentPerCustomer),
        paretoConcentration,
        newCustomers30d: newCustomers,
        activeCustomers30d: activeCustomers,
      },
      frequency,
      tiers,
      topCities,
      topCustomers,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
