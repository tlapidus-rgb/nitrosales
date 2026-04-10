export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ══════════════════════════════════════════════════════════════
// Orders Enrich API — Non-blocking MELI product enrichment
// ══════════════════════════════════════════════════════════════
// POST /api/metrics/orders/enrich
// Body: { orderIds: string[] }  (DB order IDs with missing items)
//
// Called by the frontend AFTER the main orders API returns.
// Fetches product details from ML Search API, saves to DB,
// and returns enriched items for immediate display.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { getSellerToken } from "@/lib/connectors/mercadolibre-seller";

const ML_API_BASE = "https://api.mercadolibre.com";

interface EnrichRequest {
  orderIds: string[];
}

export async function POST(req: NextRequest) {
  try {
    const ORG_ID = await getOrganizationId();
    const body: EnrichRequest = await req.json();
    const { orderIds } = body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ enriched: {} });
    }

    // Limit to 50 orders per call
    const ids = orderIds.slice(0, 50);

    // Get the orders from DB to find their externalIds and dates
    const orders = await prisma.order.findMany({
      where: {
        id: { in: ids },
        organizationId: ORG_ID,
        source: "MELI",
      },
      select: {
        id: true,
        externalId: true,
        orderDate: true,
      },
    });

    if (orders.length === 0) {
      return NextResponse.json({ enriched: {} });
    }

    // Get ML token
    let token: string;
    let mlUserId: number;
    try {
      const tokenResult = await getSellerToken();
      token = tokenResult.token;
      mlUserId = tokenResult.mlUserId;
    } catch (err: any) {
      console.error("[Enrich API] getSellerToken failed:", err.message);
      return NextResponse.json({ enriched: {}, error: "ML token failed" }, { status: 200 });
    }

    // Find earliest order date to narrow search
    const sortedDates = orders
      .map(o => o.orderDate)
      .filter(Boolean)
      .sort((a, b) => a!.getTime() - b!.getTime());
    const earliestDate = sortedDates[0] || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const searchFrom = earliestDate.toISOString().slice(0, 10) + "T00:00:00.000-03:00";

    // Build lookup map: externalId → DB order
    const neededIds = new Set(orders.map(o => o.externalId).filter(Boolean));
    const orderByExtId = new Map(orders.map(o => [o.externalId, o]));

    // Fetch via ML Search API
    const enrichedMap: Record<string, any[]> = {};
    let offset = 0;
    const batchSize = 50;
    const maxPages = 3;
    let pagesScanned = 0;
    const startTime = Date.now();
    const TIMEOUT_MS = 20_000;

    while (Object.keys(enrichedMap).length < neededIds.size && pagesScanned < maxPages) {
      if (Date.now() - startTime > TIMEOUT_MS) break;

      const searchUrl = `${ML_API_BASE}/orders/search?seller=${mlUserId}&sort=date_desc&limit=${batchSize}&offset=${offset}&order.date_created.from=${encodeURIComponent(searchFrom)}`;

      let res: Response;
      try {
        res = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        break;
      }

      if (!res.ok) {
        console.error(`[Enrich API] ML search ${res.status}`);
        break;
      }

      const data = await res.json();
      const results = data.results || [];
      if (results.length === 0) break;

      for (const mlOrder of results) {
        const extId = String(mlOrder.id);
        if (!neededIds.has(extId)) continue;

        const mlItems = mlOrder.order_items || [];
        if (mlItems.length === 0) continue;

        const dbOrder = orderByExtId.get(extId);
        if (!dbOrder) continue;

        const items: any[] = [];

        for (const mlItem of mlItems) {
          const mlItemId = String(mlItem.item?.id || "");
          const itemTitle = mlItem.item?.title || "ML Item";
          const unitPrice = mlItem.unit_price || mlItem.full_unit_price || 0;
          const quantity = mlItem.quantity || 1;
          const thumbnailUrl = mlItem.item?.thumbnail || null;

          // Save to DB (best-effort)
          try {
            const product = await prisma.product.upsert({
              where: {
                organizationId_externalId: {
                  organizationId: ORG_ID,
                  externalId: mlItemId || `meli-${extId}-0`,
                },
              },
              create: {
                organizationId: ORG_ID,
                externalId: mlItemId || `meli-${extId}-0`,
                name: itemTitle,
                sku: mlItem.item?.seller_sku || mlItemId,
                price: unitPrice,
                imageUrl: thumbnailUrl,
                isActive: true,
              },
              update: {
                name: itemTitle,
                price: unitPrice,
                ...(thumbnailUrl ? { imageUrl: thumbnailUrl } : {}),
              },
            });

            await prisma.orderItem.create({
              data: {
                orderId: dbOrder.id,
                productId: product.id,
                quantity,
                unitPrice,
                totalPrice: unitPrice * quantity,
              } as any,
            }).catch(() => {}); // duplicate
          } catch {
            // DB save failed, still show inline
          }

          items.push({
            name: itemTitle,
            imageUrl: thumbnailUrl,
            quantity,
            unitPrice,
            totalPrice: unitPrice * quantity,
          });
        }

        enrichedMap[dbOrder.id] = items;
      }

      const total = data.paging?.total || 0;
      offset += batchSize;
      pagesScanned++;
      if (offset >= total) break;
    }

    console.log(`[Enrich API] Enriched ${Object.keys(enrichedMap).length}/${neededIds.size} orders`);

    return NextResponse.json({ enriched: enrichedMap });
  } catch (error: any) {
    console.error("[Enrich API] Error:", error.message);
    return NextResponse.json({ enriched: {}, error: error.message }, { status: 200 });
  }
}
