// ══════════════════════════════════════════════════════════════════════════
// GET /api/admin/backfill-category-names — puebla vtex_category
// ══════════════════════════════════════════════════════════════════════════
// Traduce los IDs de categoría de VTEX a nombres legibles. `products.category`
// guarda lo que manda el webhook de órdenes (`additionalInfo.categoriesIds`),
// que son IDs: "/1/11/" = categoría 1 > categoría 11. Sin esta dimensión, las
// tablas de CR muestran "/1/11/" en vez de "Sábanas".
//
// Fuente: `/api/catalog_system/pub/category/tree/{depth}` — devuelve el árbol
// completo con id, name e hijos. Es una sola llamada, el árbol es chico.
//
// Org EXPLÍCITA por parámetro (mismo motivo que backfill-sku-product-map:
// getOrganizationId() es ambiguo con 2+ orgs y las credenciales pueden caer a
// variables globales de otra cuenta).
//
// Uso: /api/admin/backfill-category-names?key=<ADMIN_API_KEY>&orgId=<id>
// ══════════════════════════════════════════════════════════════════════════

import { isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getVtexConfig } from "@/lib/vtex-credentials";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TREE_DEPTH = 10; // VTEX rara vez pasa de 4-5 niveles; 10 cubre de sobra

interface VtexCategoryNode {
  id: number;
  name: string;
  children?: VtexCategoryNode[] | null;
}

/** Aplana el árbol a (id, name, path completo separado por " > "). */
function flattenTree(
  nodes: VtexCategoryNode[],
  parentPath: string[] = []
): Array<{ id: string; name: string; fullPath: string }> {
  const out: Array<{ id: string; name: string; fullPath: string }> = [];
  for (const node of nodes ?? []) {
    if (node?.id == null) continue;
    const path = [...parentPath, node.name];
    out.push({
      id: String(node.id),
      name: node.name,
      fullPath: path.join(" > "),
    });
    if (node.children?.length) out.push(...flattenTree(node.children, path));
  }
  return out;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!isValidAdminKey(url.searchParams.get("key"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = url.searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "Falta orgId" }, { status: 400 });
  }

  const startedAt = Date.now();

  try {
    const vtexConfig = await getVtexConfig(orgId);
    const res = await fetch(
      `${vtexConfig.baseUrl}/api/catalog_system/pub/category/tree/${TREE_DEPTH}`,
      { headers: { ...vtexConfig.headers }, next: { revalidate: 0 } }
    );
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `VTEX ${res.status} al pedir el arbol de categorias` },
        { status: 502 }
      );
    }

    const tree = (await res.json()) as VtexCategoryNode[];
    const flat = flattenTree(tree);

    if (flat.length === 0) {
      return NextResponse.json({
        ok: true,
        orgId,
        categories: 0,
        note: "El arbol vino vacio",
        durationMs: Date.now() - startedAt,
      });
    }

    const ids = flat.map((c) => c.id);
    const names = flat.map((c) => c.name);
    const paths = flat.map((c) => c.fullPath);

    const upserted = await prisma.$executeRaw`
      INSERT INTO vtex_category ("organizationId", category_id, name, full_path, refreshed_at)
      SELECT ${orgId}, i, n, p, now()
      FROM unnest(${ids}::text[], ${names}::text[], ${paths}::text[]) AS t(i, n, p)
      ON CONFLICT ("organizationId", category_id) DO UPDATE SET
        name = EXCLUDED.name,
        full_path = EXCLUDED.full_path,
        refreshed_at = now()
    `;

    return NextResponse.json({
      ok: true,
      orgId,
      categories: flat.length,
      upserted,
      sample: flat.slice(0, 5),
      durationMs: Date.now() - startedAt,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message).slice(0, 300), durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}
