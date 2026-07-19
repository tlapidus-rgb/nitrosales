// ══════════════════════════════════════════════════════════════════════════
// Mapa productId (pixel) → skuIds (catálogo) — dimensión vtex_sku_product
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE (bug 2026-07-18):
//   `products.externalId` guarda DOS identificadores distintos de VTEX según qué
//   código creó la fila:
//     · sync/catalog        → p.productId  (producto PADRE)
//     · webhooks/vtex/orders → item.id     (skuId, la VARIANTE)
//   El NitroPixel emite el productId del padre. Los dos son numéricos de ~5
//   dígitos, así que un ~24% COLISIONA POR AZAR: para el id 14444 el pixel dice
//   "Juego de Sábanas Postal playa" y el catálogo dice "Alfombra de Baño Rayas
//   Verticales Color Ocre". El JOIN parecía funcionar mientras emparejaba
//   productos DISTINTOS → las tablas de CR mostraban el CR de otro producto.
//
//   Verificado en Neon (Arredo, 30d): de 853 ids del pixel, 210 "matcheaban" y
//   NINGUNO de una muestra de 15 coincidía en nombre.
//
// REGLA: un cruce pixel⇄catálogo solo es válido si pasa por esta dimensión.
// Nunca volver a unir `products."externalId" = pixel_daily_product.product_id`.
//
// Mientras `vtex_sku_product` no exista o esté vacía, este módulo devuelve un
// mapa VACÍO a propósito: preferimos no atribuir ninguna venta antes que
// atribuir la venta equivocada. Las columnas de ventas y CR quedan en blanco
// hasta que el backfill corra, y se encienden solas cuando corre.
// ══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";

/** Un producto padre y los skuIds de sus variantes (grano PRODUCTO, D3). */
export interface ProductSkuMap {
  /** pixel product_id (productId de VTEX) → skuIds del catálogo. */
  skuIdsByProductId: Map<string, string[]>;
  /** skuId → productId. Para plegar las compras de vuelta al grano producto. */
  productIdBySkuId: Map<string, string>;
  /** false cuando la dimensión todavía no existe o no tiene datos para la org. */
  available: boolean;
}

const EMPTY: ProductSkuMap = {
  skuIdsByProductId: new Map(),
  productIdBySkuId: new Map(),
  available: false,
};

/**
 * Carga el mapa para un conjunto de productIds del pixel.
 *
 * Resiliente por diseño: si `vtex_sku_product` no existe todavía (42P01) o la
 * org no tiene filas, devuelve `available: false` con mapas vacíos. El caller
 * NO debe atribuir ninguna venta en ese caso.
 */
export async function loadProductSkuMap(
  organizationId: string,
  pixelProductIds: string[]
): Promise<ProductSkuMap> {
  if (pixelProductIds.length === 0) return EMPTY;

  let rows: Array<{ sku_id: string; product_id: string }>;
  try {
    rows = (await prisma.$queryRaw`
      SELECT sku_id, product_id
      FROM vtex_sku_product
      WHERE "organizationId" = ${organizationId}
        AND product_id = ANY(${pixelProductIds})
    `) as Array<{ sku_id: string; product_id: string }>;
  } catch {
    // Tabla inexistente o inaccesible → sin mapa. Nunca rompe la pantalla.
    return EMPTY;
  }

  if (rows.length === 0) return EMPTY;

  const skuIdsByProductId = new Map<string, string[]>();
  const productIdBySkuId = new Map<string, string>();
  for (const r of rows) {
    const list = skuIdsByProductId.get(r.product_id);
    if (list) list.push(r.sku_id);
    else skuIdsByProductId.set(r.product_id, [r.sku_id]);
    productIdBySkuId.set(r.sku_id, r.product_id);
  }

  return { skuIdsByProductId, productIdBySkuId, available: true };
}

/** Fila de compras tal como sale de la query, a grano SKU. */
export interface PurchaseRow {
  productExternalId: string; // skuId
  productName: string;
  category: string;
  brand: string;
  orders: number;
  units: number;
  revenue: number;
}

/**
 * Pliega las compras de grano SKU a grano PRODUCTO (D3).
 *
 * POR QUÉ ES CRÍTICO: un producto padre tiene N variantes, y las visitas del
 * pixel son de UNA ficha. Si las compras no se pliegan, un JOIN por productId
 * devuelve N filas y **el revenue se multiplica por N** sin que ninguna
 * verificación de conteo lo note. Esta función es el único lugar donde ocurre
 * el plegado, para que el invariante se pueda testear en un solo sitio.
 *
 * Las filas cuyo skuId no está en el mapa se DESCARTAN: sin cruce verificado no
 * se atribuye venta (mejor vacío que atribuido al producto equivocado).
 */
export function foldPurchasesToProductGrain(
  rows: PurchaseRow[],
  productIdBySkuId: Map<string, string>
): Map<string, PurchaseRow> {
  const byProduct = new Map<string, PurchaseRow>();
  for (const row of rows) {
    const productId = productIdBySkuId.get(row.productExternalId);
    if (!productId) continue;
    const acc = byProduct.get(productId);
    if (acc) {
      acc.orders += row.orders;
      acc.units += row.units;
      acc.revenue += row.revenue;
    } else {
      byProduct.set(productId, { ...row, productExternalId: productId });
    }
  }
  return byProduct;
}
