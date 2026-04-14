export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ══════════════════════════════════════════════════════════════
// Orders Enrich API — Non-blocking MELI product enrichment
// ══════════════════════════════════════════════════════════════
// POST /api/metrics/orders/enrich
// Body: { orderIds: string[] }  (DB order IDs needing enrichment)
//
// Called by the frontend AFTER the main orders API returns.
// Fetches product details from ML Search API + thumbnails from
// ML Items API, saves to DB, and returns enriched items.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { getSellerToken } from "@/lib/connectors/mercadolibre-seller";
import { upsertProductBySku } from "@/lib/products/upsert-by-sku";

const ML_API_BASE = "https://api.mercadolibre.com";

interface EnrichRequest {
  orderIds: string[];
}

// Fetch thumbnails from ML Items API (multi-get, up to 20 per call)
async function fetchThumbnails(
  itemIds: string[],
  token: string
): Promise<Map<string, string>> {
  const thumbnailMap = new Map<string, string>();
  if (itemIds.length === 0) return thumbnailMap;

  // ML multi-get supports up to 20 items per call
  const chunks: string[][] = [];
  for (let i = 0; i < itemIds.length; i += 20) {
    chunks.push(itemIds.slice(i, i + 20));
  }

  for (const chunk of chunks) {
    try {
      const url = `${ML_API_BASE}/items?ids=${chunk.join(",")}&attributes=id,thumbnail,pictures`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();

      for (const item of data) {
        if (item.code === 200 && item.body) {
          const id = item.body.id;
          // Prefer first picture, fall back to thumbnail
          let imgUrl = item.body.thumbnail || null;
          if (item.body.pictures && item.body.pictures.length > 0) {
            imgUrl = item.body.pictures[0].secure_url || item.body.pictures[0].url || imgUrl;
          }
          // Ensure https
          if (imgUrl && imgUrl.startsWith("http://")) {
            imgUrl = imgUrl.replace("http://", "https://");
          }
          if (id && imgUrl) {
            thumbnailMap.set(id, imgUrl);
          }
        }
      }
    } catch {
      // Continue with next chunk
    }
  }

  return thumbnailMap;
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
    const allItemIds = new Set<string>(); // Collect item IDs for thumbnail fetch
    let offset = 0;
    const batchSize = 50;
    const maxPages = 3;
    let pagesScanned = 0;
    const startTime = Date.now();
    const TIMEOUT_MS = 25_000;

    // Intermediate storage: orderId → items (without thumbnails yet)
    const rawItemsMap: Record<string, Array<{
      mlItemId: string;
      title: string;
      unitPrice: number;
      quantity: number;
      orderThumbnail: string | null; // thumbnail from order API (may be null)
      sellerSku: string;
      dbOrderId: string;
      extId: string;
    }>> = {};

    while (Object.keys(rawItemsMap).length < neededIds.size && pagesScanned < maxPages) {
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

        const items: typeof rawItemsMap[string] = [];
        for (const mlItem of mlItems) {
          const mlItemId = String(mlItem.item?.id || "");
          if (mlItemId) allItemIds.add(mlItemId);

          items.push({
            mlItemId,
            title: mlItem.item?.title || "ML Item",
            unitPrice: mlItem.unit_price || mlItem.full_unit_price || 0,
            quantity: mlItem.quantity || 1,
            orderThumbnail: mlItem.item?.thumbnail || null,
            sellerSku: mlItem.item?.seller_sku || mlItemId,
            dbOrderId: dbOrder.id,
            extId,
          });
        }

        rawItemsMap[dbOrder.id] = items;
      }

      const total = data.paging?.total || 0;
      offset += batchSize;
      pagesScanned++;
      if (offset >= total) break;
    }

    // Step 2: Fetch thumbnails from ML Items API (batch)
    const thumbnailMap = await fetchThumbnails(
      Array.from(allItemIds),
      token
    );

    console.log(`[Enrich API] Fetched ${thumbnailMap.size} thumbnails for ${allItemIds.size} items`);

    // Step 3: Save to DB and build response with thumbnails
    for (const [dbOrderId, items] of Object.entries(rawItemsMap)) {
      const enrichedItems: any[] = [];

      for (const item of items) {
        // Best image: Items API > order API thumbnail
        let imageUrl = thumbnailMap.get(item.mlItemId) || item.orderThumbnail || null;
        if (imageUrl && imageUrl.startsWith("http://")) {
          imageUrl = imageUrl.replace("http://", "https://");
        }

        // Save to DB (best-effort) — Sesion 21: SKU-first upsert
        try {
          // Solo usar sellerSku real, no el MLA listing id como fallback
          const realSku =
            item.sellerSku && item.sellerSku !== item.mlItemId
              ? item.sellerSku
              : null;
          const product = await upsertProductBySku({
            organizationId: ORG_ID,
            externalId: item.mlItemId || `meli-${item.extId}-0`,
            sku: realSku,
            create: {
              name: item.title,
              price: item.unitPrice,
              imageUrl,
              isActive: true,
            },
            update: {
              name: item.title,
              price: item.unitPrice,
              ...(imageUrl ? { imageUrl } : {}),
            },
          });

          await prisma.orderItem.create({
            data: {
              orderId: dbOrderId,
              productId: product.id,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.unitPrice * item.quantity,
            } as any,
          }).catch(() => {}); // duplicate
        } catch {
          // DB save failed, still show inline
        }

        enrichedItems.push({
          name: item.title,
          imageUrl,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.unitPrice * item.quantity,
        });
      }

      enrichedMap[dbOrderId] = enrichedItems;
    }

    console.log(`[Enrich API] Enriched ${Object.keys(enrichedMap).length}/${neededIds.size} orders`);

    return NextResponse.json({ enriched: enrichedMap });
  } catch (error: any) {
    console.error("[Enrich API] Error:", error.message);
    return NextResponse.json({ enriched: {}, error: error.message }, { status: 200 });
  }
}
