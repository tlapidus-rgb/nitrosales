import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const org = await prisma.organization.findFirst({ where: { slug: "elmundodeljuguete" } });
  if (!org) return NextResponse.json({ error: "Org not found" });

  const orders = await prisma.order.findMany({
    where: { organizationId: org.id },
    select: { status: true, totalValue: true },
  });

  const breakdown: Record<string, { count: number; revenue: number }> = {};
  for (const o of orders) {
    if (!breakdown[o.status]) breakdown[o.status] = { count: 0, revenue: 0 };
    breakdown[o.status].count++;
    breakdown[o.status].revenue += o.totalValue;
  }

  return NextResponse.json({
    totalOrders: orders.length,
    totalRevenue: orders.reduce((s, o) => s + o.totalValue, 0),
    breakdown,
  });
}
