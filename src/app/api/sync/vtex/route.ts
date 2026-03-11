import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

function mapVtexStatus(vtexStatus: string): string {
  const s = (vtexStatus || "").toLowerCase();
  if (s.includes("cancel")) return "CANCELLED";
  if (s.includes("invoiced") || s.includes("invoice")) return "INVOICED";
  if (s.includes("shipped") || s.includes("handling")) return "SHIPPED";
  if (s.includes("delivered")) return "DELIVERED";
  if (s.includes("approve")) return "APPROVED";
  if (s.includes("return")) return "RETURNED";
  return "PENDING";
}

export async function POST(req: Request) {
  try {
    const { syncKey } = await req.json();
    if (syncKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const account = process.env.VTEX_ACCOUNT || "";
    const appKey = process.env.VTEX_APP_KEY || "";
    const appToken = process.env.VTEX_APP_TOKEN || "";

    if (!account || !appKey || !appToken) {
      return NextResponse.json({ error: "Missing VTEX credentials" }, { status: 400 });
    }

    const org = await prisma.organization.findFirst({ where: { slug: "elmundodeljuguete" } });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const since = thirtyDaysAgo.toISOString();
    const until = now.toISOString();

    // Fetch first 2 pages (100 orders max) to stay within timeout
    let allOrders: any[] = [];
    for (let page = 1; page <= 2; page++) {
      const url = `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders?f_creationDate=creationDate:[${since} TO ${until}]&per_page=50&page=${page}`;
      const res = await fetch(url, {
        headers: {
          "X-VTEX-API-AppKey": appKey,
          "X-VTEX-API-AppToken": appToken,
          "Accept": "application/json",
        },
      });
      if (!res.ok) {
        return NextResponse.json({ error: "VTEX API error", status: res.status });
      }
      const data = await res.json();
      const orders = data.list || [];
      allOrders = allOrders.concat(orders);
      if (orders.length < 50) break;
    }

    // Get existing order IDs to skip them
    const existingOrders = await prisma.order.findMany({
      where: { organizationId: org.id },
      select: { externalId: true },
    });
    const existingIds = new Set(existingOrders.map((o: any) => o.externalId));

    // Filter only new orders
    const newOrders = allOrders.filter((o: any) => !existingIds.has(String(o.orderId)));

    if (newOrders.length > 0) {
      await prisma.order.createMany({
        data: newOrders.map((order: any) => ({
          externalId: String(order.orderId),
          status: mapVtexStatus(order.status) as any,
          totalValue: (order.totalValue || 0) / 100,
          itemCount: order.totalItems || 1,
          currency: "ARS",
          organizationId: org.id,
          orderDate: new Date(order.creationDate || Date.now()),
          paymentMethod: order.paymentNames || null,
          channel: order.salesChannel || null,
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({ ok: true, fetched: allOrders.length, new: newOrders.length, skipped: allOrders.length - newOrders.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
