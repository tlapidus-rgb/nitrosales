import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
export async function GET() {
  const org = await prisma.organization.findFirst({ where: { slug: "elmundodeljuguete" } });
  if (!org) return NextResponse.json({ error: "no org" });
  
  // Argentina timezone: UTC-3
  const startUTC = new Date("2026-03-11T03:00:00.000Z"); // Mar 11 00:00 ART
  const endUTC = new Date("2026-03-12T03:00:00.000Z");   // Mar 12 00:00 ART
  
  const orders = await prisma.order.findMany({
    where: { organizationId: org.id, orderDate: { gte: startUTC, lt: endUTC } },
    select: { status: true, totalValue: true },
  });
  
  const breakdown: Record<string, { count: number; revenue: number }> = {};
  for (const o of orders) {
    if (!breakdown[o.status]) breakdown[o.status] = { count: 0, revenue: 0 };
    breakdown[o.status].count++;
    breakdown[o.status].revenue += o.totalValue;
  }
  
  // Also check with pure UTC for comparison
  const startPureUTC = new Date("2026-03-11T00:00:00.000Z");
  const endPureUTC = new Date("2026-03-12T00:00:00.000Z");
  const ordersUTC = await prisma.order.count({
    where: { organizationId: org.id, orderDate: { gte: startPureUTC, lt: endPureUTC } },
  });
  
  return NextResponse.json({ 
    date: "2026-03-11 (ART)", 
    totalOrders: orders.length,
    totalOrdersUTC: ordersUTC,
    breakdown 
  });
}