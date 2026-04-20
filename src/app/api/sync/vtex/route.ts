export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { mapVtexStatus, isValidVtexStatus } from "@/lib/vtex-status";
import { getVtexConfig } from "@/lib/vtex-credentials";
import { getOrganization } from "@/lib/auth-guard";
import { upsertProductBySku } from "@/lib/products/upsert-by-sku";

// -- Helper: Extract real email from VTEX masked format --
function extractRealEmail(vtexEmail: string): string {
  if (!vtexEmail) return vtexEmail;
  const vtexAnonPattern = /^[a-f0-9]{20,}@ct\.vtex\.com\.br$/i;
  if (vtexAnonPattern.test(vtexEmail)) return "";
  const vtexMaskPattern = /-[0-9a-z]+b?\.ct\.vtex\.com\.br$/i;
  if (vtexMaskPattern.test(vtexEmail)) {
    return vtexEmail.replace(vtexMaskPattern, "").toLowerCase().trim();
  }
  return vtexEmail.toLowerCase().trim();
}

// -- Helper: Enrich a DB order with customer + items from VTEX detail --
// Called when an order exists in DB but is missing customer/products data.
// Returns { customerCreated, itemsCreated } or null on error.
async function enrichOrderFromVtex(
  dbOrderId: string,
  orgId: string,
  vData: any,
): Promise<{ customerCreated: boolean; itemsCreated: number } | null> {
  try {
    let customerCreated = false;
    let itemsCreated = 0;

    // -- Customer --
    const profile = vData.clientProfileData;
    if (profile) {
      const rawEmail = profile.email || "";
      const realEmail = rawEmail ? extractRealEmail(rawEmail) : "";
      const firstName = profile.firstName || null;
      const lastName = profile.lastName || null;
      const customerExtId = profile.userProfileId || rawEmail || `vtex-anon-${vData.orderId}`;

      // Only create customer if we have meaningful data (name or real email)
      if (firstName || lastName || realEmail) {
        const customer = await prisma.customer.upsert({
          where: {
            organizationId_externalId: {
              organizationId: orgId,
              externalId: customerExtId,
            },
          },
          create: {
            organizationId: orgId,
            externalId: customerExtId,
            email: realEmail || null,
            firstName,
            lastName,
            city: vData.shippingData?.address?.city || null,
            state: vData.shippingData?.address?.state || null,
            country: vData.shippingData?.address?.country || null,
            firstOrderAt: new Date(vData.creationDate),
            lastOrderAt: new Date(vData.creationDate),
            totalOrders: 1,
            totalSpent: (vData.value || 0) / 100,
          },
          update: {
            ...(realEmail ? { email: realEmail } : {}),
            ...(firstName ? { firstName } : {}),
            ...(lastName ? { lastName } : {}),
            city: vData.shippingData?.address?.city || undefined,
            state: vData.shippingData?.address?.state || undefined,
            lastOrderAt: new Date(vData.creationDate),
          },
        });

        await prisma.order.update({
          where: { id: dbOrderId },
          data: { customerId: customer.id },
        });
        customerCreated = true;
      }
    }

    // -- Products + OrderItems --
    const items = vData.items || [];
    if (items.length > 0) {
      // Check if items already exist to avoid duplicates
      const existingItems = await prisma.orderItem.count({ where: { orderId: dbOrderId } });
      if (existingItems === 0) {
        for (const item of items) {
          const productExtId = String(item.id || item.productId);
          // Sesion 21: SKU-first. refId o sellerSku es el SKU real;
          // productExtId es fallback solo cuando VTEX no provee SKU real.
          const realSku = (item.refId || item.sellerSku || "").trim() || null;
          const product = await upsertProductBySku({
            organizationId: orgId,
            externalId: productExtId,
            sku: realSku,
            create: {
              name: item.name || `SKU ${productExtId}`,
              brand: item.additionalInfo?.brandName || null,
              category: item.additionalInfo?.categoriesIds || null,
              price: (item.sellingPrice || item.price) / 100,
              imageUrl: item.imageUrl || null,
              isActive: true,
            },
            update: {
              name: item.name || undefined,
              price: (item.sellingPrice || item.price) / 100,
              imageUrl: item.imageUrl || undefined,
            },
          });

          await prisma.orderItem.create({
            data: {
              orderId: dbOrderId,
              productId: product.id,
              quantity: item.quantity,
              unitPrice: (item.sellingPrice || item.price) / 100,
              totalPrice: ((item.sellingPrice || item.price) * item.quantity) / 100,
              costPrice: (product as any).costPrice ?? null,
            } as any,
          });
          itemsCreated++;
        }
      }
    }

    // -- Also enrich order fields that sync POST doesn't set --
    const shippingCost = (vData.totals?.find((t: any) => t.id === "Shipping")?.value || 0) / 100;
    const discountValue = Math.abs(vData.totals?.find((t: any) => t.id === "Discounts")?.value || 0) / 100;
    const promoNames = (Array.isArray(vData.ratesAndBenefitsData) ? vData.ratesAndBenefitsData : [])
      .map((r: any) => r.name).filter(Boolean).join(", ") || null;
    const couponCode = vData.marketingData?.coupon || null;

    await prisma.order.update({
      where: { id: dbOrderId },
      data: {
        ...(shippingCost > 0 ? { shippingCost } : {}),
        ...(discountValue > 0 ? { discountValue } : {}),
        ...(promoNames ? { promotionNames: promoNames } : {}),
        ...(couponCode ? { couponCode } : {}),
      },
    });

    return { customerCreated, itemsCreated };
  } catch (e: any) {
    console.error(`[sync/vtex] enrichOrderFromVtex error for order ${dbOrderId}: ${e.message}`);
    return null;
  }
}


// -- GET: cleanup-cancelled / fix-all-statuses / enrich-missing phases --
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const phase = searchParams.get("phase");
    const syncKey = searchParams.get("syncKey");

    if (syncKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const validPhases = ["cleanup-cancelled", "fix-all-statuses", "enrich-missing"];
    if (!validPhases.includes(phase || "")) {
      return NextResponse.json({ error: `Use phase=${validPhases.join("|")}` }, { status: 400 });
    }

    // Multi-tenant: ?org=<orgId> override; si no, getOrganization() (fallback condicional)
    const orgParam = searchParams.get("org");
    const org = orgParam
      ? await prisma.organization.findUnique({ where: { id: orgParam } })
      : await getOrganization();
    if (!org) return NextResponse.json({ error: "Org no encontrada" }, { status: 404 });

    const vtexConfig = await getVtexConfig(org.id);
    const account = vtexConfig.creds.accountName;
    const appKey = vtexConfig.creds.appKey;
    const appToken = vtexConfig.creds.appToken;

    const batchSize = parseInt(searchParams.get("limit") || "50");
    const startSkip = parseInt(searchParams.get("skip") || "0");
    const maxSeconds = 55;
    const startTime = Date.now();

    let totalChecked = 0;
    let fixed = 0;
    let alreadyCorrect = 0;
    let errors = 0;
    let enriched = 0;
    let currentSkip = startSkip;
    const details: any[] = [];
    let timedOut = false;

    // == Phase: enrich-missing — finds VTEX orders with NULL customerId and fills them ==
    if (phase === "enrich-missing") {
      while (true) {
        if ((Date.now() - startTime) / 1000 > maxSeconds) { timedOut = true; break; }

        const ordersToEnrich = await prisma.order.findMany({
          where: {
            organizationId: org.id,
            customerId: null,
            source: { not: "MELI" }, // Only VTEX orders (source is null or 'VTEX')
          },
          select: { id: true, externalId: true },
          orderBy: { orderDate: "desc" },
          take: batchSize,
          skip: currentSkip,
        });

        if (ordersToEnrich.length === 0) break;

        for (const order of ordersToEnrich) {
          if ((Date.now() - startTime) / 1000 > maxSeconds) { timedOut = true; break; }
          totalChecked++;

          try {
            const vResp = await fetch(
              `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders/${order.externalId}`,
              { headers: { "X-VTEX-API-AppKey": appKey, "X-VTEX-API-AppToken": appToken } }
            );

            if (!vResp.ok) { errors++; continue; }

            const vData = await vResp.json();
            const result = await enrichOrderFromVtex(order.id, org.id, vData);
            if (result?.customerCreated || (result?.itemsCreated ?? 0) > 0) {
              enriched++;
              details.push({
                id: order.externalId,
                action: "enriched",
                customer: result!.customerCreated,
                items: result!.itemsCreated,
              });
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
        enriched,
        alreadyCorrect,
        errors,
        timedOut,
        nextSkip: timedOut ? currentSkip : null,
        elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
        details: details.slice(0, 100),
      });
    }

    // == Phases: cleanup-cancelled / fix-all-statuses ==
    while (true) {
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
        select: { id: true, externalId: true, status: true, customerId: true },
        orderBy: { orderDate: "desc" },
        take: batchSize,
        skip: currentSkip,
      });

      if (ordersToCheck.length === 0) break;

      for (const order of ordersToCheck) {
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

          // -- Opportunistic enrichment: if order has no customer, fill it now --
          if (!order.customerId) {
            const enrichResult = await enrichOrderFromVtex(order.id, org.id, vData);
            if (enrichResult?.customerCreated || (enrichResult?.itemsCreated ?? 0) > 0) {
              enriched++;
            }
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
      enriched,
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
    const body = await req.json();
    const { syncKey, page = 1, since, until, orgId: bodyOrgId } = body;
    if (syncKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Multi-tenant: orgId desde body O ?org= query O fallback
    const reqUrl = new URL(req.url);
    const orgParam = bodyOrgId || reqUrl.searchParams.get("org");
    const org = orgParam
      ? await prisma.organization.findUnique({ where: { id: orgParam } })
      : await getOrganization();
    if (!org) return NextResponse.json({ error: "Org no encontrada" }, { status: 404 });

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

    // Enrich newly created orders by fetching full VTEX detail
    // This fills in customer, products, shipping, discounts, etc.
    let enrichedCount = 0;
    if (created > 0) {
      const newOrderIds = newOrders.map((o: any) => String(o.orderId));
      const dbNewOrders = await prisma.order.findMany({
        where: { externalId: { in: newOrderIds }, organizationId: org.id },
        select: { id: true, externalId: true },
      });

      for (const dbOrder of dbNewOrders) {
        try {
          const detailRes = await fetch(
            `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders/${dbOrder.externalId}`,
            { headers: { ...vtexConfig.headers, Accept: "application/json" } }
          );
          if (!detailRes.ok) continue;

          const vData = await detailRes.json();
          const result = await enrichOrderFromVtex(dbOrder.id, org.id, vData);
          if (result?.customerCreated || (result?.itemsCreated ?? 0) > 0) {
            enrichedCount++;
          }
        } catch (e: any) {
          console.warn(`[sync/vtex] Failed to enrich order ${dbOrder.externalId}: ${e.message}`);
        }
      }
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
      enriched: enrichedCount,
      updated,
      unchanged: existingToUpdate.length - updated,
      hasMore: page < totalPages,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
