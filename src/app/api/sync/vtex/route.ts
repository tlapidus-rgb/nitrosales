import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { mapVtexStatus, isValidVtexStatus } from "@/lib/vtex-status";
import { getVtexConfig } from "@/lib/vtex-credentials";


// Ã¢ÂÂÃ¢ÂÂ GET: cleanup-cancelled phase Ã¢ÂÂÃ¢ÂÂ
// Fetches all CANCELLED orders from DB, checks each against VTEX, updates if needed
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const phase = searchParams.get("phase");
    const syncKey = searchParams.get("syncKey");
    
    if (syncKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    
    if (!["cleanup-cancelled", "fix-all-statuses"].includes(phase || "")) {
      return NextResponse.json({ error: "Use phase=cleanup-cancelled or phase=fix-all-statuses" }, { status: 400 });
    }

    const org = await prisma.organization.findFirst({ where: { slug: "elmundodeljuguete" } });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    const vtexConfig = await getVtexConfig(org.id);
    const account = vtexConfig.creds.accountName;
    const appKey = vtexConfig.creds.appKey;
    const appToken = vtexConfig.creds.appToken;

    const batchSize = parseInt(searchParams.get("limit") || "50");
    const startSkip = parseInt(searchParams.get("skip") || "0");
    const maxSeconds = 55; // Vercel Pro timeout is 60s, leave 5s margin
    const startTime = Date.now();

    let totalChecked = 0;
    let fixed = 0;
    let alreadyCorrect = 0;
    let errors = 0;
    let currentSkip = startSkip;
    const details: any[] = [];
    let timedOut = false;

    // Auto-loop through all orders in batches
    while (true) {
      // Check time limit
      if ((Date.now() - startTime) / 1000 > maxSeconds) {
        timedOut = true;
        break;
      }

      const ordersToCheck = await prisma.order.findMany({
        where: {
          organizationId: org.id,
          ...(phase === "cleanup-cancelled"
            ? { status: { in: ["CANCELLED", "PENDING"] } }
            : {}),
        },
        select: { id: true, externalId: true, status: true },
        orderBy: { orderDate: "desc" },
        take: batchSize,
        skip: currentSkip,
      });

      if (ordersToCheck.length === 0) break; // No more orders

      for (const order of ordersToCheck) {
        // Check time limit per order
        if ((Date.now() - startTime) / 1000 > maxSeconds) {
          timedOut = true;
          break;
        }

        totalChecked++;
        try {
          const vResp = await fetch(
            `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders/${order.externalId}`,
            { headers: { "X-VTEX-API-AppKey": appKey, "X-VTEX-API-AppToken": appToken } }
          );

          if (!vResp.ok) {
            if (vResp.status === 404) {
              await prisma.order.delete({ where: { id: order.id } });
              details.push({ id: order.externalId, action: "deleted-ghost" });
              fixed++;
            } else {
              errors++;
            }
            continue;
          }

          const vData = await vResp.json();
          const vtexStatus = (vData.status || "").toLowerCase();
          const realStatus = mapVtexStatus(vtexStatus);

          if (!vtexStatus || vtexStatus === "") {
            await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
            await prisma.order.delete({ where: { id: order.id } });
            details.push({ id: order.externalId, action: "deleted-empty-status" });
            fixed++;
          } else if (realStatus !== order.status) {
            await prisma.order.update({
              where: { id: order.id },
              data: { status: realStatus as any }
            });
            details.push({ id: order.externalId, from: order.status, to: realStatus, vtex: vtexStatus });
            fixed++;
          } else {
            alreadyCorrect++;
          }
        } catch (e: any) {
          errors++;
        }
      }

      if (timedOut) break;
      currentSkip += batchSize;
    }

    return NextResponse.json({
      ok: true,
      phase,
      totalChecked,
      fixed,
      alreadyCorrect,
      errors,
      timedOut,
      nextSkip: timedOut ? currentSkip : null,
      elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
      details: details.slice(0, 100)
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { syncKey, page = 1, since, until } = await req.json();
    if (syncKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const org = await prisma.organization.findFirst({ where: { slug: "elmundodeljuguete" } });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    const vtexConfig = await getVtexConfig(org.id);
    const account = vtexConfig.creds.accountName;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sinceDate = since || thirtyDaysAgo.toISOString();
    const untilDate = until || now.toISOString();

    const url = `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders?f_creationDate=creationDate:[${sinceDate} TO ${untilDate}]&f_status=payment-pending,payment-approved,ready-for-handling,handling,invoiced,canceled,window-to-cancel,cancellation-requested&per_page=100&page=${page}`;
    const res = await fetch(url, {
      headers: {
        ...vtexConfig.headers,
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

    // Separate new orders from existing ones
    const orderIds = orders.map((o: any) => String(o.orderId));
    const existingOrders = await prisma.order.findMany({
      where: { externalId: { in: orderIds }, organizationId: org.id },
      select: { externalId: true, status: true },
    });
    const existingMap = new Map(existingOrders.map((o: any) => [o.externalId, o.status]));

    // Filter valid orders (non-ghost, non-zero-value)
    const validOrders = orders.filter((o: any) => {
      const status = (o.status || "").toLowerCase().trim();
      if (!status || status === "" || status === "null" || status === "undefined") {
        console.warn(`[sync/vtex] Skipping incomplete order ${o.orderId} (no status)`);
        return false;
      }
      if (!o.totalValue || o.totalValue === 0) {
        console.warn(`[sync/vtex] Skipping order ${o.orderId} (zero value)`);
        return false;
      }
      return true;
    });

    const newOrders = validOrders.filter((o: any) => !existingMap.has(String(o.orderId)));
    const existingToUpdate = validOrders.filter((o: any) => existingMap.has(String(o.orderId)));

    // Create new orders
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

    // Update statuses for existing orders that changed
    let updated = 0;
    for (const order of existingToUpdate) {
      const eid = String(order.orderId);
      const currentStatus = existingMap.get(eid);
      const newStatus = mapVtexStatus(order.status);
      if (newStatus && newStatus !== currentStatus) {
        await prisma.order.updateMany({
          where: { externalId: eid, organizationId: org.id },
          data: { status: newStatus as any },
        });
        updated++;
      }
    }

    return NextResponse.json({
      ok: true,
      page,
      totalPages,
      totalOrders,
      fetched: orders.length,
      created,
      updated,
      unchanged: existingToUpdate.length - updated,
      hasMore: page < totalPages,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
