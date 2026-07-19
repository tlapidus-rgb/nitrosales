// ══════════════════════════════════════════════════════════════════════════
// Etiqueta legible de categoría — traduce "/1/11/" → "Sábanas"
// ══════════════════════════════════════════════════════════════════════════
// `products.category` guarda `additionalInfo.categoriesIds` del webhook de
// órdenes (webhooks/vtex/orders:396): una RUTA DE IDs, no un nombre.
// "/1/11/" significa categoría 1 > categoría 11. La hoja (el último id) es la
// categoría real del producto.
//
// La traducción vive en la dimensión `vtex_category`. Si no hay traducción
// disponible se devuelve el valor crudo: preferimos mostrar "/1/11/" antes que
// inventar un nombre o dejar la celda vacía.
// ══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";

/**
 * Extrae el id HOJA de una ruta de categorías de VTEX.
 * "/1/11/" → "11" · "/25/28/" → "28" · "12" → "12" · "" → null
 *
 * Pura y testeable: es la parte con más formas raras de entrada.
 */
export function leafCategoryId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split("/").filter((p) => p.trim() !== "");
  if (parts.length === 0) return null;
  const leaf = parts[parts.length - 1].trim();
  return leaf === "" ? null : leaf;
}

/**
 * Construye el mapa <valor crudo> → <etiqueta legible> para un conjunto de
 * categorías tal como vienen en `products.category`.
 *
 * Resiliente: si `vtex_category` no existe todavía, devuelve un mapa vacío y el
 * caller sigue mostrando los valores crudos. Nunca rompe la pantalla.
 */
export async function loadCategoryLabels(
  organizationId: string,
  rawCategories: string[]
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (rawCategories.length === 0) return labels;

  // <id hoja> → [valores crudos que apuntan a esa hoja]
  const rawsByLeaf = new Map<string, string[]>();
  for (const raw of rawCategories) {
    const leaf = leafCategoryId(raw);
    if (!leaf) continue;
    const list = rawsByLeaf.get(leaf);
    if (list) list.push(raw);
    else rawsByLeaf.set(leaf, [raw]);
  }
  if (rawsByLeaf.size === 0) return labels;

  let rows: Array<{ category_id: string; name: string }>;
  try {
    rows = (await prisma.$queryRaw`
      SELECT category_id, name
      FROM vtex_category
      WHERE "organizationId" = ${organizationId}
        AND category_id = ANY(${[...rawsByLeaf.keys()]})
    `) as Array<{ category_id: string; name: string }>;
  } catch {
    return labels; // dimensión inexistente → se muestran los ids crudos
  }

  for (const row of rows) {
    for (const raw of rawsByLeaf.get(row.category_id) ?? []) {
      labels.set(raw, row.name);
    }
  }
  return labels;
}
