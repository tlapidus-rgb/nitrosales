import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
export async function GET() {
  const org = await prisma.organization.findFirst({ where: { slug: "elmundodeljuguete" } });
  if (!org) return NextResponse.json({ error: "no org" });
  
  const start = new Date("2026-03-11T00:00:00.000Z");
  const end = new Date("2026-03-12T00:00:00.000Z");
  
  const orders = await prisma.order.findMany({
    where: { organizationId: org.id, orderDate: { gte: start, lt: end } },
    select: { status: true, totalValue: true },
  });
  
  const breakdown: Record<string, { count: number; revenue: number }> = {};
  for (const o of orders) {
    if (!breakdown[o.status]) breakdown[o.status] = { count: 0, revenue: 0 };
    breakdown[o.status].count++;
    breakdown[o.status].revenue += o.totalValue;
  }
  
  return NextResponse.json({ date: "2026-03-11", totalOrders: orders.length, breakdown });
}