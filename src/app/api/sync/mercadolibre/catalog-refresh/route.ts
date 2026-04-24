// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/sync/mercadolibre/catalog-refresh?orgId=X&key=Y
// ══════════════════════════════════════════════════════════════
// Refresh de imagenes + stock + status para todos los Products ML
// de una org que fueron creados durante el backfill sin imagen.
//
// El endpoint /orders/search de ML NO devuelve thumbnail en el
// payload de order_items, por eso los Products quedan con imageUrl
// null despues del backfill. Este endpoint los completa llamando
// /items?ids=X,Y,Z... (hasta 20 IDs por request) que SI devuelve
// pictures + thumbnail + stock actualizado.
//
// Similar al /api/sync/vtex/catalog-refresh pero adaptado a ML.
// Se llama desde el backfill-runner con waitUntil al completar un
// job ML, como ultimo paso del backfill (el cliente ve 1 sola
// barra de progreso; este step entra adentro).
//
// Multi-tenant safe: orgId explicito + credenciales del seller.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSellerToken } from "@/lib/connectors/mercadolibre-seller";
import { withConcurrency } from "@/lib/sync/concurrency";
import { retryWithBackoff, isRetryableStatus } from "@/lib/sync/retry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const REFRESH_KEY = "nitrosales-secret-key-2024-production";
const CONCURRENCY = 5;          // batches /items en paralelo
const BATCH_SIZE = 20;          // ML acepta hasta 20 ids por request
const MAX_PRODUCTS = 5000;      // techo por corrida (chunk defensive)

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    if (key !== REFRESH_KEY) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

    // Token del seller (refrescado si hiciera falta)
    let token: string;
    try {
      const auth = await getSellerToken(orgId);
      token = auth.token;
    } catch (err: any) {
      return NextResponse.json({ error: `ML credentials error: ${err.message}` }, { status: 400 });
    }

    // Traer products ML (externalId empieza con "ML") sin imagen.
    // Si corre de nuevo sobre productos que ya tienen imagen, los skipea.
    const products: any[] = await prisma.$queryRawUnsafe(
      `
      SELECT "id", "externalId"
      FROM "products"
      WHERE "organizationId" = $1
        AND "externalId" LIKE 'ML%'
        AND ("imageUrl" IS NULL OR "imageUrl" = '')
      LIMIT ${MAX_PRODUCTS}
      `,
      orgId,
    );

    if (products.length === 0) {
      return NextResponse.json({
        ok: true,
        orgId,
        totalProducts: 0,
        updated: 0,
        note: "No hay productos ML sin imagen para refrescar",
        elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      });
    }

    // Agrupar en batches de 20 (limite de ML para /items?ids=)
    const batches: Array<string[]> = [];
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      batches.push(products.slice(i, i + BATCH_SIZE).map((p) => p.externalId));
    }

    // Mapa externalId → Product.id local para update
    const idMap = new Map<string, string>();
    for (const p of products) idMap.set(p.externalId, p.id);

    let updated = 0;
    let failed = 0;
    let withImage = 0;
    let withStock = 0;

    async function mlFetch(path: string): Promise<any | null> {
      try {
        return await retryWithBackoff(
          async () => {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 15_000);
            try {
              const r = await fetch(`https://api.mercadolibre.com${path}`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: ctrl.signal,
              });
              if (!r.ok) {
                const err: any = new Error(`ML ${r.status}`);
                err.status = r.status;
                if (r.status === 404) return null;
                throw err;
              }
              return await r.json();
            } finally {
              clearTimeout(t);
            }
          },
          { attempts: 3, baseMs: 400, capMs: 5000, shouldRetry: (err: any) => !err.status || isRetryableStatus(err.status) },
        );
      } catch {
        return null;
      }
    }

    // Por cada batch: GET /items?ids=... → procesar cada item del response
    const tasks = batches.map((batchIds) => async () => {
      const ids = batchIds.join(",");
      const attrs = "id,title,thumbnail,pictures,available_quantity,status,condition,category_id";
      const data = await mlFetch(`/items?ids=${ids}&attributes=${attrs}`);
      if (!Array.isArray(data)) return;

      for (const entry of data) {
        // La response es un array de objetos {code, body} donde body es el item
        // real. Si code != 200 el body puede ser null o con error.
        if (entry?.code !== 200 || !entry?.body) continue;
        const item = entry.body;
        const mlId = String(item.id || "");
        const productId = idMap.get(mlId);
        if (!productId) continue;

        // Imagen: preferimos pictures[0].secure_url (calidad full) sobre
        // thumbnail (160x160). Forzar https por si ML devuelve http legacy.
        let imageUrl: string | null = null;
        const pics = Array.isArray(item.pictures) ? item.pictures : [];
        if (pics.length > 0) {
          const raw = (pics[0].secure_url || pics[0].url || "").toString().trim();
          if (raw) imageUrl = raw.replace(/^http:\/\//, "https://");
        }
        if (!imageUrl && item.thumbnail) {
          imageUrl = String(item.thumbnail).replace(/^http:\/\//, "https://");
        }

        // Stock y status
        const stock = typeof item.available_quantity === "number" ? item.available_quantity : null;
        const isActive = item.status === "active";

        // Update solo los campos que vinieron
        const patch: any = { stockUpdatedAt: new Date() };
        if (imageUrl) { patch.imageUrl = imageUrl; withImage++; }
        if (stock != null) { patch.stock = stock; withStock++; }
        if (item.status) patch.isActive = isActive;
        if (item.title) patch.name = item.title;
        if (item.category_id) patch.category = item.category_id;

        try {
          await prisma.product.update({ where: { id: productId }, data: patch });
          updated++;
        } catch (err: any) {
          failed++;
          console.error(`[ml-catalog-refresh] update ${mlId}: ${err.message}`);
        }
      }
    });

    await withConcurrency(CONCURRENCY, tasks);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return NextResponse.json({
      ok: true,
      orgId,
      totalProducts: products.length,
      batches: batches.length,
      updated,
      failed,
      stats: { withImage, withStock },
      elapsed: `${elapsed}s`,
    });
  } catch (err: any) {
    console.error("[ml-catalog-refresh] fatal:", err);
    return NextResponse.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}
