export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ══════════════════════════════════════════════════════════════
// MELI SKU + Image Backfill (Sesion 22)
// ══════════════════════════════════════════════════════════════
// GET /api/sync/mercadolibre/backfill-sku?limit=500&dry=0
//
// Objetivo: Backfill products.sku y products.imageUrl para productos
// MELI historicos que fueron creados antes de Sesion 21 (SKU-first)
// o sin imagen.
//
// Sin SKU en productos MELI:
//   - La UI no muestra chip "SKU …"
//   - El fallback SQL por "hermano con mismo SKU" no puede matchear
//     con el catalogo VTEX → ordenes MELI sin foto.
//
// Qué hace:
//   1. Busca products donde externalId matches pattern MLA[0-9]+
//      y (sku IS NULL OR imageUrl IS NULL).
//   2. Multi-get a ML Items API (20 por batch) con attributes:
//      id, seller_sku, thumbnail, pictures.
//   3. UPDATE products SET sku = ..., imageUrl = ...
//   4. Respeta uniqueness: no pisa si otro producto ya tiene ese SKU
//      (evita conflicto con catalogo VTEX).
//
// Params:
//   limit  — cuantos procesar (default 500, max 2000)
//   dry    — "1" para solo reportar (no escribir)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSellerToken } from "@/lib/connectors/mercadolibre-seller";

const ML_API_BASE = "https://api.mercadolibre.com";

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);
  const limit = Math.min(2000, Math.max(1, parseInt(searchParams.get("limit") || "500")));
  const dry = searchParams.get("dry") === "1";

  try {
    const { token } = await getSellerToken();

    // Buscar productos MELI que necesitan backfill
    const candidates: Array<{
      id: string;
      organizationId: string;
      externalId: string;
      sku: string | null;
      imageUrl: string | null;
    }> = await prisma.$queryRawUnsafe(`
      SELECT id, "organizationId", "externalId", sku, "imageUrl"
      FROM products
      WHERE "externalId" ~ '^MLA[0-9]+$'
        AND (sku IS NULL OR sku = '' OR "imageUrl" IS NULL OR "imageUrl" = '')
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `);

    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Nothing to backfill",
        elapsed: `${((Date.now() - t0) / 1000).toFixed(1)}s`,
      });
    }

    const byExtId = new Map(candidates.map(c => [c.externalId, c]));
    const allIds = candidates.map(c => c.externalId);

    // Chunk into batches of 20 (ML multi-get limit)
    const chunks: string[][] = [];
    for (let i = 0; i < allIds.length; i += 20) {
      chunks.push(allIds.slice(i, i + 20));
    }

    const updates: Array<{
      id: string;
      extId: string;
      sku: string | null;
      imageUrl: string | null;
      prevSku: string | null;
      prevImg: string | null;
      skipReason?: string;
    }> = [];

    let fetched = 0;
    let failed = 0;

    for (const chunk of chunks) {
      try {
        const url = `${ML_API_BASE}/items?ids=${chunk.join(",")}&attributes=id,seller_sku,thumbnail,pictures,attributes`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          failed += chunk.length;
          continue;
        }
        const data = await res.json();

        for (const entry of data) {
          if (entry.code !== 200 || !entry.body) {
            failed++;
            continue;
          }
          fetched++;
          const body = entry.body;
          const extId = body.id;
          const product = byExtId.get(extId);
          if (!product) continue;

          // Extract seller_sku — puede venir en seller_sku direct o en attributes
          let sku: string | null = body.seller_sku || null;
          if (!sku && Array.isArray(body.attributes)) {
            const attr = body.attributes.find((a: any) =>
              a.id === "SELLER_SKU" || a.name === "SKU"
            );
            if (attr) sku = attr.value_name || attr.values?.[0]?.name || null;
          }
          sku = sku?.trim() || null;

          // Extract best image
          let imgUrl: string | null = null;
          if (Array.isArray(body.pictures) && body.pictures.length > 0) {
            imgUrl = body.pictures[0].secure_url || body.pictures[0].url || null;
          }
          if (!imgUrl) imgUrl = body.thumbnail || null;
          if (imgUrl && imgUrl.startsWith("http://")) {
            imgUrl = imgUrl.replace("http://", "https://");
          }

          updates.push({
            id: product.id,
            extId,
            sku,
            imageUrl: imgUrl,
            prevSku: product.sku,
            prevImg: product.imageUrl,
          });
        }
      } catch {
        failed += chunk.length;
      }
    }

    // Apply updates (skip if sku conflicts with another product in same org)
    let updatedSku = 0;
    let updatedImg = 0;
    let skippedSkuConflict = 0;

    if (!dry) {
      for (const u of updates) {
        const product = byExtId.get(u.extId)!;

        // Determinar qué setear
        const shouldSetSku = u.sku && !product.sku;
        const shouldSetImg = u.imageUrl && !product.imageUrl;

        if (!shouldSetSku && !shouldSetImg) continue;

        // Chequear conflicto de SKU antes de pisar
        let finalSku = shouldSetSku ? u.sku : null;
        if (shouldSetSku) {
          const conflict = await prisma.product.findFirst({
            where: {
              organizationId: product.organizationId,
              sku: u.sku!,
              id: { not: product.id },
            },
            select: { id: true },
          });
          if (conflict) {
            finalSku = null;
            skippedSkuConflict++;
            u.skipReason = "sku_exists_on_other_product";
          }
        }

        const data: any = {};
        if (finalSku) data.sku = finalSku;
        if (shouldSetImg) data.imageUrl = u.imageUrl;

        if (Object.keys(data).length === 0) continue;

        try {
          await prisma.product.update({
            where: { id: product.id },
            data,
          });
          if (data.sku) updatedSku++;
          if (data.imageUrl) updatedImg++;
        } catch (err: any) {
          // Si falla por unique constraint (race), skip
          console.error(`[Backfill SKU] update fail ${u.extId}: ${err.message}`);
        }
      }
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    return NextResponse.json({
      ok: true,
      dry,
      candidates: candidates.length,
      fetchedFromML: fetched,
      failed,
      skuUpdated: updatedSku,
      imgUpdated: updatedImg,
      skippedSkuConflict,
      sample: updates.slice(0, 10).map(u => ({
        extId: u.extId,
        sku: u.sku,
        hasImg: !!u.imageUrl,
        prevSku: u.prevSku,
        hadImg: !!u.prevImg,
        skipReason: u.skipReason,
      })),
      elapsed: `${elapsed}s`,
    });
  } catch (err: any) {
    console.error("[Backfill SKU] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
