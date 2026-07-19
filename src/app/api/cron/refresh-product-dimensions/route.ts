// ══════════════════════════════════════════════════════════════════════════
// GET /api/cron/refresh-product-dimensions — mantiene las dims de producto
// ══════════════════════════════════════════════════════════════════════════
// Refresca, para TODAS las orgs con conexión VTEX:
//   · vtex_sku_product — mapa skuId ⇄ productId (sin él, las tablas de CR no
//     pueden atribuir ninguna venta)
//   · vtex_category    — id de categoría → nombre legible
//
// POR QUÉ ES NECESARIO (y no un backfill de una vez):
//   Los dos son dimensiones EXTERNAS que llegan tarde. Cada producto o
//   categoría que se cree en VTEX después del backfill no existe en nuestras
//   tablas, y su CR queda en blanco para siempre. Es exactamente cómo se
//   degradó el catálogo: se pobló una vez y nadie lo mantuvo.
//
// DISEÑO:
//   · Org por org, SECUENCIAL. El warm-cache viejo hacía Promise.all sobre las
//     orgs y saturaba el pool de Neon (24 conexiones); no repetimos eso.
//   · Una org que falla NO frena a las demás (credenciales vencidas, VTEX caído).
//   · Presupuesto de tiempo: corta limpio y la próxima corrida sigue.
//   · Idempotente: ON CONFLICT DO UPDATE en las dos dims.
//
// Auth: user-agent vercel-cron, o ?key=<ADMIN_API_KEY>.
// ══════════════════════════════════════════════════════════════════════════

import { isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getVtexConfig } from "@/lib/vtex-credentials";


export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SKU_PAGE_SIZE = 250;
const CATEGORY_TREE_DEPTH = 10;
const TIME_BUDGET_MS = 250_000;

interface CategoryNode {
  id: number;
  name: string;
  children?: CategoryNode[] | null;
}

function flattenTree(
  nodes: CategoryNode[],
  parentPath: string[] = []
): Array<{ id: string; name: string; fullPath: string }> {
  const out: Array<{ id: string; name: string; fullPath: string }> = [];
  for (const node of nodes ?? []) {
    if (node?.id == null) continue;
    const path = [...parentPath, node.name];
    out.push({ id: String(node.id), name: node.name, fullPath: path.join(" > ") });
    if (node.children?.length) out.push(...flattenTree(node.children, path));
  }
  return out;
}

/** Mapa skuId→productId de una org. Devuelve cuántos pares escribió. */
async function refreshSkuMap(
  orgId: string,
  baseUrl: string,
  headers: Record<string, string>,
  deadline: number
): Promise<{ pairs: number; complete: boolean }> {
  let from = 0;
  let pairs = 0;
  let total: number | null = null;

  while (Date.now() < deadline) {
    const res = await fetch(
      `${baseUrl}/api/catalog_system/pvt/products/GetProductAndSkuIds?_from=${from}&_to=${from + SKU_PAGE_SIZE - 1}`,
      { headers, next: { revalidate: 0 } }
    );
    if (res.status === 429) return { pairs, complete: false }; // rate limit: seguimos la próxima
    if (!res.ok) throw new Error(`VTEX ${res.status} en GetProductAndSkuIds`);

    const body = (await res.json()) as {
      data: Record<string, number[]>;
      range?: { total?: number };
    };
    const entries = Object.entries(body?.data ?? {});
    if (body?.range?.total != null) total = body.range.total;
    if (entries.length === 0) return { pairs, complete: true };

    const skuIds: string[] = [];
    const productIds: string[] = [];
    for (const [productId, skus] of entries) {
      for (const skuId of skus ?? []) {
        skuIds.push(String(skuId));
        productIds.push(String(productId));
      }
    }

    if (skuIds.length > 0) {
      pairs += await prisma.$executeRaw`
        INSERT INTO vtex_sku_product ("organizationId", sku_id, product_id, refreshed_at)
        SELECT ${orgId}, s, p, now()
        FROM unnest(${skuIds}::text[], ${productIds}::text[]) AS t(s, p)
        ON CONFLICT ("organizationId", sku_id) DO UPDATE SET
          product_id = EXCLUDED.product_id,
          refreshed_at = now()
      `;
    }

    from += SKU_PAGE_SIZE;
    if (total != null && from >= total) return { pairs, complete: true };
  }
  return { pairs, complete: false };
}

/** Árbol de categorías de una org. Una sola llamada. */
async function refreshCategories(
  orgId: string,
  baseUrl: string,
  headers: Record<string, string>
): Promise<number> {
  const res = await fetch(
    `${baseUrl}/api/catalog_system/pub/category/tree/${CATEGORY_TREE_DEPTH}`,
    { headers, next: { revalidate: 0 } }
  );
  if (!res.ok) throw new Error(`VTEX ${res.status} en category/tree`);

  const flat = flattenTree((await res.json()) as CategoryNode[]);
  if (flat.length === 0) return 0;

  await prisma.$executeRaw`
    INSERT INTO vtex_category ("organizationId", category_id, name, full_path, refreshed_at)
    SELECT ${orgId}, i, n, p, now()
    FROM unnest(${flat.map((c) => c.id)}::text[], ${flat.map((c) => c.name)}::text[], ${flat.map((c) => c.fullPath)}::text[]) AS t(i, n, p)
    ON CONFLICT ("organizationId", category_id) DO UPDATE SET
      name = EXCLUDED.name,
      full_path = EXCLUDED.full_path,
      refreshed_at = now()
  `;
  return flat.length;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const isVercelCron = req.headers.get("user-agent")?.includes("vercel-cron");
  if (!isVercelCron && !isValidAdminKey(url.searchParams.get("key"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const startedAt = Date.now();
  const deadline = startedAt + TIME_BUDGET_MS;

  // El diccionario nombre→productId vive en su propio cron
  // (refresh-pixel-name-dict). Estuvieron juntos y el diccionario consumió los
  // 271s enteros, dejando esta fase sin tiempo para NINGUNA org (okCount: 0).
  // Dos trabajos pesados en un mismo cron se matan entre sí.

  // Todas las orgs con conexión VTEX. Una org sin conexión no tiene de dónde
  // leer el mapa y se saltea sin ruido.
  const connections = await prisma.connection.findMany({
    where: { platform: "VTEX" },
    select: { organizationId: true },
  });

  // Reanudable: una org refrescada hace poco se saltea, así llamar el endpoint
  // varias veces seguidas completa las que faltan en vez de rehacer las hechas.
  const force = url.searchParams.get("force") === "1";
  const freshness = (await prisma.$queryRaw`
    SELECT "organizationId", MAX(refreshed_at) AS last
    FROM vtex_sku_product GROUP BY "organizationId"
  `) as Array<{ organizationId: string; last: Date | null }>;
  const lastByOrg = new Map(freshness.map((f) => [f.organizationId, f.last]));
  const SKIP_IF_FRESHER_THAN_H = 20;

  const results: Array<{
    orgId: string;
    ok: boolean;
    skipped?: boolean;
    pairs?: number;
    categories?: number;
    complete?: boolean;
    error?: string;
  }> = [];

  // SECUENCIAL a propósito: en paralelo saturamos el pool de Neon (pool 24).
  for (const { organizationId: orgId } of connections) {
    if (Date.now() >= deadline) {
      results.push({ orgId, ok: false, error: "sin tiempo, volver a llamar" });
      continue;
    }
    const last = lastByOrg.get(orgId);
    if (
      !force &&
      last &&
      Date.now() - new Date(last).getTime() < SKIP_IF_FRESHER_THAN_H * 3600_000
    ) {
      results.push({ orgId, ok: true, skipped: true });
      continue;
    }
    try {
      // Credenciales PROPIAS de la org, obligatorias. `getVtexCredentials` cae a
      // las variables de entorno globales cuando la org no tiene conexión
      // configurada: en un script manual de una sola org eso es cómodo, pero en
      // un job que recorre TODAS convierte "esta org no está configurada" en
      // "esta org se lleva el catálogo de otra". Preferimos que falle.
      const conn = await prisma.connection.findFirst({
        where: { organizationId: orgId, platform: "VTEX" },
        select: { credentials: true },
      });
      if (!conn?.credentials) {
        throw new Error(
          "la org no tiene credenciales VTEX propias; se saltea para no leer las de otra cuenta"
        );
      }
      const cfg = await getVtexConfig(orgId);
      const headers = { ...cfg.headers };
      const skus = await refreshSkuMap(orgId, cfg.baseUrl, headers, deadline);
      const categories = await refreshCategories(orgId, cfg.baseUrl, headers);
      results.push({
        orgId,
        ok: true,
        pairs: skus.pairs,
        complete: skus.complete,
        categories,
      });
    } catch (e: any) {
      // Una org caída no frena a las demás.
      results.push({ orgId, ok: false, error: String(e?.message).slice(0, 200) });
    }
  }

  const pending = results.filter((r) => !r.ok).length;
  return NextResponse.json({
    ok: true,
    orgs: results.length,
    done: results.filter((r) => r.ok && !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
    pending,
    // Si queda alguna pendiente, volver a llamar: retoma donde quedó.
    callAgain: pending > 0,
    results,
    durationMs: Date.now() - startedAt,
  });
}
