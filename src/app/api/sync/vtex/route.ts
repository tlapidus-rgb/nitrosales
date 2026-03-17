import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

function mapVtexStatus(vtexStatus: string): string {
  const map: Record<string, string> = {
    "order-completed": "DELIVERED",
    "handling": "APPROVED",
    "ready-for-handling": "APPROVED",
    "start-handling": "APPROVED",
    "waiting-for-sellers-confirmation": "PENDING",
    "payment-pending": "PENDING",
    "payment-approved": "APPROVED",
    "invoiced": "INVOICED",
    "canceled": "CANCELLED",
    "cancellation-requested": "PENDING",
    "replaced": "APPROVED",
    "window-to-cancel": "PENDING",
  };
  const status = (vtexStatus || "").toLowerCase();
  if (map[status]) return map[status];
  // Fallback: only exact "canceled" is CANCELLED, everything else PENDING
  if (status === "canceled") return "CANCELLED";
  console.warn(`[sync/vtex] Unknown VTEX status: "${vtexStatus}" -> defaulting to PENDING`);
  return "PENDING";
}

export async function POST(req: Request) {
  try {
    const { syncKey, page = 1, since, until } = await req.json();
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
    const sinceDate = since || thirtyDaysAgo.toISOString();
    const untilDate = until || now.toISOString();

    const url = `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders?f_creationDate=creationDate:[${sinceDate} TO ${untilDate}]&per_page=100&page=${page}`;
    const res = await fetch(url, {
      headers: {
        "X-VTEX-API-AppKey": appKey,
        "X-VTEX-API-AppToken": appToken,
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: "VTEX API error", status: res.status, detail: errText.substring(0, 300) });
    }

    const data = await res.json();
    const orders = data.list || [];
    const paging = data.paging || {};
    const totalPages = paging.pages || 1;
    const totalOrders = paging.total || orders.length;

    const orderIds = orders.map((o: any) => String(o.orderId));
    const existingOrders = await prisma.order.findMany({
      where: { externalId: { in: orderIds }, organizationId: org.id },
      select: { externalId: true },
    });
    const existingIds = new Set(existingOrders.map((o: any) => o.externalId));

    const newOrders = orders.filter((o: any) => !existingIds.has(String(o.orderId)));

    let created = 0;
    if (newOrders.length > 0) {
      const result = await prisma.order.createMany({
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
      created = result.count;
    }

    return NextResponse.json({
      ok: true,
      page,
      totalPages,
      totalOrders,
      fetched: orders.length,
      created,
      skipped: orders.length - created,
      hasMore: page < totalPages,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
