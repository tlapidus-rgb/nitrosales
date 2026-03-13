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

    const billableStatuses = ["INVOICED", "SHIPPED", "DELIVERED"];

    // ── 1. Get ALL billable orders (source of truth) ──
    const orders = await prisma.order.findMany({
      where: {
        organizationId: org.id,
        status: { in: billableStatuses },
      },
      select: {
        id: true,
        customerId: true,
        totalValue: true,
        orderDate: true,
      },
      orderBy: { orderDate: "desc" },
    });

    // ── 2. Group orders by customerId ──
    const customerMap = new Map<
      string,
      {
        customerId: string | null;
        totalOrders: number;
        totalSpent: number;
        firstOrderAt: Date;
        lastOrderAt: Date;
      }
    >();

    for (const o of orders) {
      const key = o.customerId || `anon_${o.id}`;
      const existing = customerMap.get(key);
      if (existing) {
        existing.totalOrders += 1;
        existing.totalSpent += o.totalValue;
        if (o.orderDate < existing.firstOrderAt)
          existing.firstOrderAt = o.orderDate;
        if (o.orderDate > existing.lastOrderAt)
          existing.lastOrderAt = o.orderDate;
      } else {
        customerMap.set(key, {
          customerId: o.customerId,
          totalOrders: 1,
          totalSpent: o.totalValue,
          firstOrderAt: o.orderDate,
          lastOrderAt: o.orderDate,
        });
      }
    }

    // ── 3. Load Customer info for those with customerId ──
    const customerIds = [
      ...new Set(
        [...customerMap.values()]
          .map((c) => c.customerId)
          .filter(Boolean) as string[]
      ),
    ];

    const customerInfoMap = new Map<
      string,
      {
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        city: string | null;
        state: string | null;
      }
    >();

    if (customerIds.length > 0) {
      const customerRecords = await prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          city: true,
          state: true,
        },
      });
      for (const c of customerRecords) {
        customerInfoMap.set(c.id, {
          email: c.email,
          firstName: c.firstName,
          lastName: c.lastName,
          city: c.city,
          state: c.state,
        });
      }
    }

    // ── 4. Build unified customer list ──
    const allCustomers = [...customerMap.entries()].map(([key, data]) => {
      const info = data.customerId
        ? customerInfoMap.get(data.customerId)
        : null;
      return {
        key,
        customerId: data.customerId,
        name:
          info && (info.firstName || info.lastName)
            ? [info.firstName, info.lastName].filter(Boolean).join(" ")
            : null,
        email: info?.email || null,
        city: info?.city || null,
        state: info?.state || null,
        totalOrders: data.totalOrders,
        totalSpent: data.totalSpent,
        firstOrderAt: data.firstOrderAt,
        lastOrderAt: data.lastOrderAt,
        avgTicket:
          data.totalOrders > 0 ? data.totalSpent / data.totalOrders : 0,
      };
    });

    // ── 5. Summary stats ──
    const totalCustomers = allCustomers.length;
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((s, o) => s + o.totalValue, 0);
    const repeatCustomers = allCustomers.filter(
      (c) => c.totalOrders > 1
    );
    const repeatRate =
      totalCustomers > 0
        ? Math.round((repeatCustomers.length / totalCustomers) * 10000) /
          100
        : 0;
    const avgOrdersPerCustomer =
      totalCustomers > 0
        ? Math.round((totalOrders / totalCustomers) * 100) / 100
        : 0;
    const avgSpentPerCustomer =
      totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers) : 0;

    // Pareto: top 20% = ?% of revenue
    const sortedBySpent = [...allCustomers].sort(
      (a, b) => b.totalSpent - a.totalSpent
    );
    const top20Count = Math.max(
      1,
      Math.ceil(totalCustomers * 0.2)
    );
    const top20Revenue = sortedBySpent
      .slice(0, top20Count)
      .reduce((s, c) => s + c.totalSpent, 0);
    const paretoConcentration =
      totalRevenue > 0
        ? Math.round((top20Revenue / totalRevenue) * 100)
        : 0;

    // Recent 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newCustomers30d = allCustomers.filter(
      (c) => c.firstOrderAt >= thirtyDaysAgo
    ).length;
    const activeCustomers30d = allCustomers.filter(
      (c) => c.lastOrderAt >= thirtyDaysAgo
    ).length;

    // ── 6. Frequency distribution ──
    const frequency = {
      oneOrder: allCustomers.filter((c) => c.totalOrders === 1).length,
      twoToThree: allCustomers.filter(
        (c) => c.totalOrders >= 2 && c.totalOrders <= 3
      ).length,
      fourToSix: allCustomers.filter(
        (c) => c.totalOrders >= 4 && c.totalOrders <= 6
      ).length,
      sevenPlus: allCustomers.filter((c) => c.totalOrders >= 7).length,
    };

    // ── 7. Spending tiers ──
    const tiers = {
      vip: allCustomers.filter((c) => c.totalSpent >= 200000).length,
      high: allCustomers.filter(
        (c) => c.totalSpent >= 50000 && c.totalSpent < 200000
      ).length,
      medium: allCustomers.filter(
        (c) => c.totalSpent >= 10000 && c.totalSpent < 50000
      ).length,
      low: allCustomers.filter(
        (c) => c.totalSpent > 0 && c.totalSpent < 10000
      ).length,
    };

    // ── 8. Top cities (only for identified customers) ──
    const cityCounts: Record<string, number> = {};
    allCustomers.forEach((c) => {
      if (c.city) {
        cityCounts[c.city] = (cityCounts[c.city] || 0) + 1;
      }
    });
    const identifiedWithCity = allCustomers.filter((c) => c.city).length;
    const topCities = Object.entries(cityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([city, count]) => ({ city, count }));

    // ── 9. Top 20 customers by LTV ──
    const topCustomers = sortedBySpent.slice(0, 20).map((c) => ({
      id: c.customerId || c.key,
      name: c.name || "Cliente sin identificar",
      email: c.email || "-",
      city: c.city || "-",
      state: c.state || "-",
      totalOrders: c.totalOrders,
      totalSpent: c.totalSpent,
      avgTicket: Math.round(c.avgTicket),
      firstOrderAt: c.firstOrderAt,
      lastOrderAt: c.lastOrderAt,
    }));

    return NextResponse.json({
      summary: {
        totalCustomers,
        identifiedCustomers: customerIds.length,
        identifiedWithCity,
        repeatCustomers: repeatCustomers.length,
        repeatRate,
        totalRevenue: Math.round(totalRevenue),
        totalOrders,
        avgOrdersPerCustomer,
        avgSpentPerCustomer,
        paretoConcentration,
        newCustomers30d,
        activeCustomers30d,
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
