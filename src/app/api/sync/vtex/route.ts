import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

const VTEX_ACCOUNT = process.env.VTEX_ACCOUNT || "";
const VTEX_APP_KEY = process.env.VTEX_APP_KEY || "";
const VTEX_APP_TOKEN = process.env.VTEX_APP_TOKEN || "";

async function vtexFetch(endpoint: string) {
  const res = await fetch(
    `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br${endpoint}`,
    {
      headers: {
        "X-VTEX-API-AppKey": VTEX_APP_KEY,
        "X-VTEX-API-AppToken": VTEX_APP_TOKEN,
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) throw new Error(`VTEX API error: ${res.status}`);
  return res.json();
}

export async function POST(req: Request) {
  try {
    const { syncKey } = await req.json();
    if (syncKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const org = await prisma.organization.findFirst({ where: { slug: "elmundodeljuguete" } });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    // Fetch last 30 days of orders from VTEX OMS
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fromDate = thirtyDaysAgo.toISOString().split("T")[0];
    const toDate = now.toISOString().split("T")[0];

    let orders: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) {
      try {
        const data = await vtexFetch(
          `/api/oms/pvt/orders?f_creationDate=creationDate:[${fromDate}T00:00:00.000Z TO ${toDate}T23:59:59.999Z]&page=${page}&per_page=50`
        );
        if (data.list && data.list.length > 0) {
          orders = orders.concat(data.list);
          page++;
        } else {
          hasMore = false;
        }
      } catch {
        hasMore = false;
      }
    }

    let synced = 0;
    for (const order of orders) {
      try {
        await prisma.order.upsert({
          where: { externalId: String(order.orderId) },
          update: {
            status: order.status || "unknown",
            totalValue: (order.totalValue || 0) / 100,
            totalItems: order.totalItems || 0,
          },
          create: {
            externalId: String(order.orderId),
            status: order.status || "unknown",
            totalValue: (order.totalValue || 0) / 100,
            totalItems: order.totalItems || 0,
            currency: "ARS",
            organizationId: org.id,
            createdAt: new Date(order.creationDate || Date.now()),
          },
        });
        synced++;
      } catch {}
    }

    return NextResponse.json({ ok: true, fetched: orders.length, synced });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
