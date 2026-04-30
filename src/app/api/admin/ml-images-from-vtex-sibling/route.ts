// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/ml-images-from-vtex-sibling?orgId=X&key=Y
// ══════════════════════════════════════════════════════════════
// One-shot reparativo: para productos ML sin imagen / brand de una org,
// busca producto hermano de VTEX con el mismo SKU y copia imagen + brand.
//
// Persiste en DB (no es runtime). Despues de correr, dashboard +
// health-check + cualquier query directa va a ver las imagenes bien.
//
// Idempotente: skip productos que ya tienen imagen.
//
// Esta logica complementa el fix en mercadolibre-enrichment.ts que ya
// hace cross-source matching para enrichments futuros. Este endpoint
// repara productos legacy que se crearon antes del fix.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    const dryRun = url.searchParams.get("dryRun") === "1";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    // Productos ML sin imagen o sin brand, con SKU presente.
    // El criterio "es de ML" es externalId que empieza con "ML" (formato MLA, MLB, etc).
    const mlProducts: any[] = await prisma.$queryRawUnsafe(
      `SELECT "id", "sku", "imageUrl", "brand"
       FROM "products"
       WHERE "organizationId" = $1
         AND "externalId" LIKE 'ML%'
         AND "sku" IS NOT NULL
         AND "sku" <> ''
         AND ("imageUrl" IS NULL OR "imageUrl" = '' OR "brand" IS NULL OR "brand" = '')`,
      orgId,
    );

    let updatedImage = 0;
    let updatedBrand = 0;
    let noSibling = 0;
    const sample: any[] = [];

    for (const p of mlProducts) {
      // Buscar hermano VTEX (cualquier producto NO-ML con mismo SKU) que tenga imagen o brand
      const siblings: any[] = await prisma.$queryRawUnsafe(
        `SELECT "imageUrl", "brand"
         FROM "products"
         WHERE "organizationId" = $1
           AND "sku" = $2
           AND "externalId" NOT LIKE 'ML%'
           AND ("imageUrl" IS NOT NULL OR "brand" IS NOT NULL)
         LIMIT 1`,
        orgId,
        p.sku,
      );

      if (siblings.length === 0) {
        noSibling++;
        continue;
      }

      const sib = siblings[0];
      const patch: any = {};
      const needsImage = (!p.imageUrl || p.imageUrl === "") && sib.imageUrl;
      const needsBrand = (!p.brand || p.brand === "") && sib.brand;

      if (needsImage) {
        patch.imageUrl = sib.imageUrl;
        updatedImage++;
      }
      if (needsBrand) {
        patch.brand = sib.brand;
        updatedBrand++;
      }

      if (Object.keys(patch).length === 0) continue;

      if (sample.length < 5) {
        sample.push({
          productId: p.id,
          sku: p.sku,
          before: { image: p.imageUrl, brand: p.brand },
          after: patch,
        });
      }

      if (!dryRun) {
        await prisma.product.update({
          where: { id: p.id },
          data: patch,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      orgId,
      dryRun,
      mlProductsScanned: mlProducts.length,
      updatedImage,
      updatedBrand,
      noSibling,
      sample,
      elapsedMs: Date.now() - startTime,
      note: dryRun
        ? "Modo dry-run: no se modifico nada. Repeti sin ?dryRun=1 para aplicar."
        : "Productos ML actualizados con imagen/brand de hermanos VTEX.",
    });
  } catch (err: any) {
    console.error("[ml-images-from-vtex-sibling] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
