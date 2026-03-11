import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

function mapVtexStatus(vtexStatus: string): string {
  const s = (vtexStatus || "").toLowerCase();
  if (s.includes("cancel")) return "CANCELLED";
  if (s.includes("invoiced") || s.includes("invoice")) return "INVOICED";
  if (s.includes("shipped") || s.includes("handling")) return "SHIPPED";
  if (s.includes("delivered") || s.includes("ready-for-handling")) return "DELIVERED";
  if (s.includes("payment-approved") || s.includes("approve")) return "APPROVED";
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

    let allOrders: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) {
      const url = `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders?f_creationDate=creationDate:[${since} TO ${until}]&per_page=50&page=${page}`;
      const res = await fetch(url, {
        headers: {
          "X-VTEX-API-AppKey": appKey,
          "X-VTEX-API-AppToken": appToken,
          "Accept": "application/json",
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json({ error: "VTEX API error", status: res.status, detail: errText.substring(0, 200) });
      }

      const data = await res.json();
      const orders = data.list || [];
      allOrders = allOrders.concat(orders);
      hasMore = orders.length === 50;
      page++;
    }

    let synced = 0;
    let errors: string[] = [];

    for (const order of allOrders) {
      try {
        await prisma.order.upsert({
          where: { externalId: String(order.orderId) },
          update: {
            status: mapVtexStatus(order.status),
            totalValue: (order.totalValue || 0) / 100,
            itemCount: order.totalItems || 1,
          },
          create: {
            externalId: String(order.orderId),
            status: mapVtexStatus(order.status),
            totalValue: (order.totalValue || 0) / 100,
            itemCount: order.totalItems || 1,
            currency: "ARS",
            organizationId: org.id,
            orderDate: new Date(order.creationDate || Date.now()),
            paymentMethod: order.paymentNames || null,
            channel: order.salesChannel || null,
          },
        });
        synced++;
      } catch (e: any) {
        if (errors.length < 3) errors.push(e.message.substring(0, 100));
      }
    }

    return NextResponse.json({ ok: true, fetched: allOrders.length, synced, errors: errors.length > 0 ? errors : undefined });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
