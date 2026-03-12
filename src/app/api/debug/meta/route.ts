import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const [products, orderItems, customers, orders, itemsWithProduct, sampleItems] = await Promise.all([
      prisma.product.count(),
      prisma.orderItem.count(),
      prisma.customer.count(),
      prisma.order.count(),
      prisma.orderItem.count({ where: { productId: { not: null } } }),
      prisma.orderItem.findMany({ take: 3, include: { product: true } }),
    ]);
    return NextResponse.json({ products, orderItems, customers, orders, itemsWithProduct, sampleItems });
  } catch(e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}