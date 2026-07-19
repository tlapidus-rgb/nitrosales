// ══════════════════════════════════════════════════════════════════════════
// GET /api/admin/backfill-sku-product-map — puebla vtex_sku_product
// ══════════════════════════════════════════════════════════════════════════
// Construye el mapa skuId ⇄ productId de VTEX, que es lo único que permite
// cruzar el pixel (emite productId del PADRE) con el catálogo y los order_items
// (keyed by skuId de la VARIANTE). Ver src/data/dim/vtex-sku-product.schema.sql.
//
// ENDPOINT DE VTEX: `catalog_system/pvt/products/GetProductAndSkuIds`.
//   Devuelve exactamente `{ data: { "<productId>": [skuId, ...] } }` — ES el mapa.
//   ⚠️ NO usar `catalog_system/pub/products/search` (el que usa sync/catalog):
//   es el público de storefront, pagina hasta ~2500 y SOLO devuelve productos
//   visibles → los descontinuados que igual se vendieron nunca se mapearían.
//
// ORG EXPLÍCITA POR PARÁMETRO, a propósito: `getOrganizationId()` tira
// AmbiguousOrgError con 2+ orgs en prod, y `getVtexCredentials` cae a variables
// de entorno globales si la org no tiene credenciales propias — la combinación
// puede terminar escribiendo el catálogo de un cliente en otro. Acá la org se
// pide siempre y las credenciales se leen de ESA org.
//
// REANUDABLE (patrón de sync/inventory): procesa una ventana por invocación con
// presupuesto de tiempo y devuelve `nextFrom`. Re-correrlo continúa; correrlo de
// nuevo entero es idempotente (ON CONFLICT DO UPDATE).
//
// Uso:
//   /api/admin/backfill-sku-product-map?key=<ADMIN_API_KEY>&orgId=<id>
//   /api/admin/backfill-sku-product-map?key=...&orgId=...&from=1500
// ══════════════════════════════════════════════════════════════════════════

import { isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getVtexConfig } from "@/lib/vtex-credentials";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PAGE_SIZE = 250; // GetProductAndSkuIds acepta ventanas grandes; es liviano
const TIME_BUDGET_MS = 240_000; // corte limpio antes del maxDuration de 300s

interface GetProductAndSkuIdsResponse {
  data: Record<string, number[]>;
  range?: { total?: number; from?: number; to?: number };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!isValidAdminKey(url.searchParams.get("key"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = url.searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json(
      { error: "Falta orgId. Es obligatorio: sin él las credenciales podrían resolver a otra org." },
      { status: 400 }
    );
  }

  const startedAt = Date.now();
  let from = Number(url.searchParams.get("from") ?? 0);
  if (!Number.isFinite(from) || from < 0) from = 0;

  let vtexConfig;
  try {
    vtexConfig = await getVtexConfig(orgId);
  } catch (e: any) {
    return NextResponse.json(
      { error: `Sin credenciales VTEX para la org: ${String(e?.message).slice(0, 200)}` },
      { status: 400 }
    );
  }

  let productsSeen = 0;
  let pairsUpserted = 0;
  let reachedEnd = false;
  let total: number | null = null;

  try {
    while (Date.now() - startedAt < TIME_BUDGET_MS) {
      const to = from + PAGE_SIZE - 1;
      const res = await fetch(
        `${vtexConfig.baseUrl}/api/catalog_system/pvt/products/GetProductAndSkuIds?_from=${from}&_to=${to}`,
        { headers: { ...vtexConfig.headers }, next: { revalidate: 0 } }
      );

      if (res.status === 429) {
        // VTEX nos frenó: cortamos limpio y devolvemos desde dónde seguir.
        return NextResponse.json({
          ok: true,
          rateLimited: true,
          orgId,
          productsSeen,
          pairsUpserted,
          nextFrom: from,
          durationMs: Date.now() - startedAt,
        });
      }
      if (!res.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: `VTEX ${res.status} en _from=${from}`,
            productsSeen,
            pairsUpserted,
            nextFrom: from,
          },
          { status: 502 }
        );
      }

      const body = (await res.json()) as GetProductAndSkuIdsResponse;
      const entries = Object.entries(body?.data ?? {});
      if (body?.range?.total != null) total = body.range.total;

      if (entries.length === 0) {
        reachedEnd = true;
        break;
      }

      // Aplanar a pares (sku_id, product_id). Un producto aporta N filas: una
      // por variante. Es el grano correcto de la dimensión.
      const skuIds: string[] = [];
      const productIds: string[] = [];
      for (const [productId, skus] of entries) {
        productsSeen++;
        for (const skuId of skus ?? []) {
          skuIds.push(String(skuId));
          productIds.push(String(productId));
        }
      }

      if (skuIds.length > 0) {
        // UNNEST: un solo INSERT por página en vez de N statements.
        pairsUpserted += await prisma.$executeRaw`
          INSERT INTO vtex_sku_product ("organizationId", sku_id, product_id, refreshed_at)
          SELECT ${orgId}, s, p, now()
          FROM unnest(${skuIds}::text[], ${productIds}::text[]) AS t(s, p)
          ON CONFLICT ("organizationId", sku_id) DO UPDATE SET
            product_id = EXCLUDED.product_id,
            refreshed_at = now()
        `;
      }

      from += PAGE_SIZE;
      if (total != null && from >= total) {
        reachedEnd = true;
        break;
      }
    }
  } catch (e: any) {
    // Falla de red a mitad: devolvemos desde dónde retomar en vez de perder todo.
    return NextResponse.json(
      {
        ok: false,
        error: String(e?.message).slice(0, 300),
        productsSeen,
        pairsUpserted,
        nextFrom: from,
        durationMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    orgId,
    productsSeen,
    pairsUpserted,
    total,
    reachedEnd,
    // null cuando terminó; si viene un número, volver a llamar con ?from=<n>.
    nextFrom: reachedEnd ? null : from,
    durationMs: Date.now() - startedAt,
  });
}
