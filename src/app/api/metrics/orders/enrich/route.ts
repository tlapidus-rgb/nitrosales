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

    // ══════════════════════════════════════════════════════════════
    // FAST PATH (Sesión 22): Si la orden ya tiene order_items con
    // products.externalId, traer thumbnails directo desde ML Items API
    // y actualizar products.imageUrl. Evita el costoso orders/search
    // que solo alcanza a las ~150 órdenes más recientes.
    // ══════════════════════════════════════════════════════════════
    const fastEnriched: Record<string, any[]> = {};
    const orderIdsNeedingSearch: string[] = [];
    try {
      const existingItems = await prisma.orderItem.findMany({
        where: { orderId: { in: orders.map(o => o.id) } },
        select: {
          orderId: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          product: {
            select: { id: true, name: true, externalId: true, imageUrl: true },
          },
        },
      });

      // Agrupar items por orderId
      const itemsByOrder = new Map<string, typeof existingItems>();
      for (const it of existingItems) {
        const list = itemsByOrder.get(it.orderId) || [];
        list.push(it);
        itemsByOrder.set(it.orderId, list);
      }

      // Coleccionar externalIds (MLA...) que necesitan thumbnail
      const missingMlItemIds = new Set<string>();
      for (const o of orders) {
        const items = itemsByOrder.get(o.id);
        if (!items || items.length === 0) {
          orderIdsNeedingSearch.push(o.id);
          continue;
        }
        const anyMissing = items.some(i => !i.product?.imageUrl);
        if (!anyMissing) continue;
        for (const it of items) {
          const extId = it.product?.externalId;
          if (extId && !it.product?.imageUrl) missingMlItemIds.add(extId);
        }
      }

      if (missingMlItemIds.size > 0) {
        const fastThumbs = await fetchThumbnails(Array.from(missingMlItemIds), token);
        if (fastThumbs.size > 0) {
          // Persistir thumbnails en products.imageUrl (batch)
          const updates: Promise<any>[] = [];
          for (const [mlItemId, imgUrl] of fastThumbs.entries()) {
            updates.push(
              prisma.product.updateMany({
                where: { organizationId: ORG_ID, externalId: mlItemId, imageUrl: null },
                data: { imageUrl: imgUrl },
              }).catch(() => {})
            );
          }
          await Promise.all(updates);
        }

        // Construir response con imagen (thumbs frescos + los que ya tenían)
        for (const o of orders) {
          const items = itemsByOrder.get(o.id);
          if (!items || items.length === 0) continue;
          const enriched = items.map(it => ({
            name: it.product?.name || "Producto",
            imageUrl:
              it.product?.imageUrl ||
              (it.product?.externalId ? fastThumbs.get(it.product.externalId) : null) ||
              null,
            quantity: it.quantity,
            unitPrice: Number(it.unitPrice),
            totalPrice: Number(it.totalPrice),
          }));
          // Solo devolver si al menos uno tiene imagen (sino dejar para search fallback)
          if (enriched.some(e => e.imageUrl)) {
            fastEnriched[o.id] = enriched;
          } else {
            orderIdsNeedingSearch.push(o.id);
          }
        }
      } else {
        // Todos los items tienen imagen (o no hay MLA id) — devolver lo que tenemos
        for (const o of orders) {
          const items = itemsByOrder.get(o.id);
          if (!items || items.length === 0) continue;
          const enriched = items.map(it => ({
            name: it.product?.name || "Producto",
            imageUrl: it.product?.imageUrl || null,
            quantity: it.quantity,
            unitPrice: Number(it.unitPrice),
            totalPrice: Number(it.totalPrice),
          }));
          if (enriched.some(e => e.imageUrl)) {
            fastEnriched[o.id] = enriched;
          }
        }
      }
    } catch (err: any) {
      console.error("[Enrich API] Fast path failed:", err.message);
      // Silent fallback — continúa con search path
    }

    // Si el fast path resolvió todo, devolver directo
    const unresolvedOrders = orders.filter(o => !fastEnriched[o.id]);
    if (unresolvedOrders.length === 0) {
      console.log(`[Enrich API] Fast path resolved ${Object.keys(fastEnriched).length} orders`);
      return NextResponse.json({ enriched: fastEnriched });
    }

    // Build lookup map: externalId → DB order (solo las no resueltas por fast path)
    const neededIds = new Set(unresolvedOrders.map(o => o.externalId).filter(Boolean));
    const orderByExtId = new Map(unresolvedOrders.map(o => [o.externalId, o]));

    // Fetch via ML direct-by-id API
    const enrichedMap: Record<string, any[]> = {};
    const allItemIds = new Set<string>(); // Collect item IDs for thumbnail fetch
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

    // Sesión 22: En vez de paginar orders/search (limitado a 150 recientes),
    // pegarle directo a GET /orders/{id} por cada order no resuelta.
    // Funciona para órdenes de CUALQUIER fecha.
    const CONCURRENCY = 5;
    const orderExtIds = Array.from(neededIds);

    async function fetchOneOrder(extId: string) {
      if (Date.now() - startTime > TIMEOUT_MS) return;
      try {
        const res = await fetch(`${ML_API_BASE}/orders/${extId}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          console.error(`[Enrich API] ML order ${extId} -> ${res.status}`);
          return;
        }
        const mlOrder = await res.json();
        const mlItems = mlOrder.order_items || [];
        if (mlItems.length === 0) return;
        const dbOrder = orderByExtId.get(extId);
        if (!dbOrder) return;

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
      } catch (err: any) {
        console.error(`[Enrich API] fetchOne ${extId} err:`, err.message);
      }
    }

    // Procesar en chunks concurrentes
    for (let i = 0; i < orderExtIds.length; i += CONCURRENCY) {
      if (Date.now() - startTime > TIMEOUT_MS) break;
      const chunk = orderExtIds.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(fetchOneOrder));
    }


    // Step 2: Fetch thumbnails from ML Items API (batch)
    const thumbnailMap = await fetchThumbnails(
      Array.from(allItemIds),
      token
    );

    console.log(`[Enrich API] Fetched ${thumbnailMap.size} thumbnails for ${allItemIds.size} items`);

    // Pre-contar items existentes para decidir si crear o no (evitar duplicados)
    const existingItemCount = await prisma.orderItem.groupBy({
      by: ["orderId"],
      where: { orderId: { in: Object.keys(rawItemsMap) } },
      _count: { _all: true },
    }).catch(() => [] as Array<{ orderId: string; _count: { _all: number } }>);
    const existingCountMap = new Map(
      (existingItemCount as any[]).map(x => [x.orderId, x._count._all])
    );

    // Step 3: Save to DB and build response with thumbnails
    for (const [dbOrderId, items] of Object.entries(rawItemsMap)) {
      const enrichedItems: any[] = [];
      const orderAlreadyHasItems = (existingCountMap.get(dbOrderId) || 0) > 0;

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

          // Solo crear order_item si la orden NO tenía items (evitar duplicar).
          // Si ya tiene items, solo actualizamos el producto (que es lo que importa
          // para la imagen, ya que order_items usa COALESCE(p.imageUrl, ml.thumbnailUrl)).
          if (!orderAlreadyHasItems) {
            await prisma.orderItem.create({
              data: {
                orderId: dbOrderId,
                productId: product.id,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.unitPrice * item.quantity,
              } as any,
            }).catch(() => {});
          }
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

    // Merge fast path + search path results
    const merged = { ...fastEnriched, ...enrichedMap };
    console.log(
      `[Enrich API] Enriched ${Object.keys(merged).length}/${orders.length} orders ` +
      `(fast: ${Object.keys(fastEnriched).length}, search: ${Object.keys(enrichedMap).length})`
    );

    return NextResponse.json({ enriched: merged });
  } catch (error: any) {
    console.error("[Enrich API] Error:", error.message);
    return NextResponse.json({ enriched: {}, error: error.message }, { status: 200 });
  }
}
