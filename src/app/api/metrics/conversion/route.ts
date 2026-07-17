export const dynamic = "force-dynamic";
export const revalidate = 0;

// ══════════════════════════════════════════════════════════════
// Conversion Rates API (lightweight)
// ══════════════════════════════════════════════════════════════
// Sesion 22: split del endpoint /api/metrics/pixel para las tablas de
// Conversion Rate (hoy en /pixel/analytics via ConversionRateTables).
// El endpoint pixel corre ~25 queries para todo el dashboard NitroPixel;
// aca corren solo las 2 queries (+1 de meta) que alimentan las tablas
// byCategory/byBrand/byProduct. Los viewers salen de rollups HLL.
//
// Gana tiempo de carga y permite aplicar reglas especificas sin
// tocar el endpoint CORE de pixel.
//
// Reglas:
//   - Floor por fecha de instalacion del pixel (crDateFrom).
//   - La tabla de productos incluye CUALQUIER producto que haya sido
//     visto por el pixel en el periodo (tenga 0 o N ventas), no solo
//     los que tuvieron ventas.
//   - Productos con 0 visitas y ventas > 0 se excluyen (ratio incoherente).
//
// GET /api/metrics/conversion?from=YYYY-MM-DD&to=YYYY-MM-DD
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { ordersValidWhere } from "@/domains/orders";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const ORG_ID = await getOrganizationId();
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const toParam = searchParams.get("to");
    const fromParam = searchParams.get("from");
    const dateTo = toParam ? new Date(toParam + "T23:59:59.999-03:00") : now;
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(now.getTime() - 7 * MS_PER_DAY);

    // ── Pixel install date floor + freshness ──
    // PERF 2026-07 (review D1): antes era MIN(timestamp) sobre pixel_events
    // completo (sin índice (org, timestamp) → index-range scan de toda la org
    // en cada request). El rollup pixel_daily_source cubre desde el primer día
    // con datos, así que MIN(day) da el mismo floor a granularidad día.
    // MAX(refreshed_at) alimenta el badge de frescura en la UI (D4b).
    const rollupMetaResult = (await prisma.$queryRaw`
      SELECT MIN(day)::text as min_day, MAX(refreshed_at) as refreshed_at
      FROM pixel_daily_source
      WHERE "organizationId" = ${ORG_ID}
    `) as Array<{ min_day: string | null; refreshed_at: Date | null }>;
    const pixelInstalledAt = rollupMetaResult[0]?.min_day
      ? new Date(rollupMetaResult[0].min_day + "T00:00:00.000-03:00")
      : null;
    const rollupRefreshedAt = rollupMetaResult[0]?.refreshed_at ?? null;
    const crDateFrom =
      pixelInstalledAt && pixelInstalledAt.getTime() > dateFrom.getTime()
        ? pixelInstalledAt
        : dateFrom;

    // ══════════════════════════════════════════════════════════
    // 2 queries en paralelo
    // ══════════════════════════════════════════════════════════
    // Review D1 (2026-07): se eliminaron las queries de byChannel/byDevice
    // (visitors/orders por source y por device). NADIE las consumía: el único
    // consumidor de este endpoint es ConversionRateTables (byCategory/byBrand/
    // byProduct), y pixel/analytics tiene su propio byChannel/byDevice vía
    // /api/metrics/pixel. Eran ~la mitad del costo del endpoint.
    const [
      productViewersResult,
      productPurchasesResult,
    ] = await Promise.all([
      // 5. Product viewers — PERF 2026-07: lee el rollup pixel_daily_product (HLL,
      // VIEW_PRODUCT por producto/día) en vez de escanear pixel_events crudo.
      prisma.$queryRaw`
        SELECT
          dp.product_id as "productExternalId",
          COALESCE(hll_cardinality(hll_union_agg(dp.viewers_hll)), 0)::int as viewers
        FROM pixel_daily_product dp
        WHERE dp."organizationId" = ${ORG_ID}
          AND dp.day >= (${crDateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND dp.day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        GROUP BY dp.product_id
        ORDER BY viewers DESC
        LIMIT 500
      ` as Promise<Array<{ productExternalId: string; viewers: number }>>,

      // 6. Product purchases (VTEX only)
      prisma.$queryRaw`
        SELECT
          COALESCE(p."externalId", oi."productId") as "productExternalId",
          COALESCE(p.name, 'Producto desconocido') as "productName",
          COALESCE(p.category, 'Sin categoría') as category,
          COALESCE(p.brand, 'Sin marca') as brand,
          COUNT(DISTINCT oi."orderId")::int as orders,
          SUM(oi.quantity)::int as units,
          SUM(oi."totalPrice")::float as revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        LEFT JOIN products p ON p.id = oi."productId"
        WHERE o."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${crDateFrom}
          AND o."orderDate" <= ${dateTo}
          AND ${ordersValidWhere("o")}
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
        GROUP BY 1, 2, 3, 4
        ORDER BY revenue DESC
        LIMIT 500
      ` as Promise<
        Array<{
          productExternalId: string;
          productName: string;
          category: string;
          brand: string;
          orders: number;
          units: number;
          revenue: number;
        }>
      >,
    ]);

    // ══════════════════════════════════════════════════════════
    // Merge + aggregate
    // ══════════════════════════════════════════════════════════

    // byChannel/byDevice: eliminados (review D1) — sin consumidores.

    // byProduct: UNION de vistos + comprados
    // Sesion 22: antes solo mostrabamos los que tenian venta. Ahora todo
    // producto con al menos 1 visita entra (con 0 o N ventas). Los que
    // no tienen visitas ni ventas directamente no aparecen. Si tiene venta
    // pero 0 visitas, lo excluimos por incoherencia.
    const viewerMap = new Map(
      productViewersResult.map((v) => [v.productExternalId, v.viewers])
    );
    const purchaseMap = new Map(
      productPurchasesResult.map((p) => [p.productExternalId, p])
    );

    // Para productos sólo vistos (sin compras), necesitamos enriquecer con
    // name/category/brand desde la tabla products.
    const viewedOnlyIds = [...viewerMap.keys()].filter(
      (id) => !purchaseMap.has(id)
    );

    let viewedOnlyProducts: Array<{
      externalId: string;
      name: string;
      category: string;
      brand: string;
    }> = [];
    if (viewedOnlyIds.length > 0) {
      viewedOnlyProducts = (await prisma.$queryRawUnsafe(
        `SELECT "externalId", name, COALESCE(category, 'Sin categoría') as category, COALESCE(brand, 'Sin marca') as brand
         FROM products
         WHERE "organizationId" = $1
           AND "externalId" = ANY($2::text[])`,
        ORG_ID,
        viewedOnlyIds
      )) as any[];
    }
    const viewedOnlyMap = new Map(
      viewedOnlyProducts.map((p) => [p.externalId, p])
    );

    const byProductRaw: Array<{
      productExternalId: string;
      productName: string;
      category: string;
      brand: string;
      viewers: number;
      orders: number;
      units: number;
      revenue: number;
      cr: number;
    }> = [];

    // CR con techo en 100%: los viewers ahora vienen de HLL (~2% de error),
    // así que en filas chicas pueden quedar por debajo de las compras exactas.
    const crPct = (buyers: number, viewers: number) =>
      viewers > 0 ? Math.min(100, Math.round((buyers / viewers) * 10000) / 100) : 0;

    // Productos comprados (con o sin vistas → filtramos 0 vistas después)
    for (const p of productPurchasesResult) {
      const viewers = viewerMap.get(p.productExternalId) || 0;
      if (viewers === 0) continue; // incoherente, excluir
      byProductRaw.push({
        ...p,
        viewers,
        cr: crPct(p.orders, viewers),
      });
    }
    // Productos sólo vistos (sin compras) → CR = 0
    for (const id of viewedOnlyIds) {
      const viewers = viewerMap.get(id) || 0;
      if (viewers === 0) continue;
      const meta = viewedOnlyMap.get(id);
      byProductRaw.push({
        productExternalId: id,
        productName: meta?.name || "Producto desconocido",
        category: meta?.category || "Sin categoría",
        brand: meta?.brand || "Sin marca",
        viewers,
        orders: 0,
        units: 0,
        revenue: 0,
        cr: 0,
      });
    }
    const byProduct = byProductRaw
      .filter((p) => p.productName !== "Producto desconocido")
      .sort((a, b) => b.viewers - a.viewers);

    // byCategory + byBrand: agregación sobre byProduct (ya incluye vistos-solo)
    const catMap = new Map<
      string,
      { category: string; viewers: number; buyers: number; revenue: number }
    >();
    const brandMap = new Map<
      string,
      { brand: string; viewers: number; buyers: number; revenue: number }
    >();
    for (const p of byProduct) {
      const c = catMap.get(p.category) || {
        category: p.category,
        viewers: 0,
        buyers: 0,
        revenue: 0,
      };
      c.viewers += p.viewers;
      c.buyers += p.orders;
      c.revenue += p.revenue;
      catMap.set(p.category, c);

      const b = brandMap.get(p.brand) || {
        brand: p.brand,
        viewers: 0,
        buyers: 0,
        revenue: 0,
      };
      b.viewers += p.viewers;
      b.buyers += p.orders;
      b.revenue += p.revenue;
      brandMap.set(p.brand, b);
    }
    const byCategory = Array.from(catMap.values())
      .map((c) => ({ ...c, cr: crPct(c.buyers, c.viewers) }))
      .sort((a, b) => b.viewers - a.viewers);
    const byBrand = Array.from(brandMap.values())
      .map((b) => ({ ...b, cr: crPct(b.buyers, b.viewers) }))
      .sort((a, b) => b.viewers - a.viewers);

    return NextResponse.json({
      conversionRates: {
        byCategory,
        byBrand,
        byProduct,
      },
      meta: {
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        pixelInstalledAt: pixelInstalledAt
          ? pixelInstalledAt.toISOString()
          : null,
        crDateFrom: crDateFrom.toISOString(),
        crDateAdjusted: pixelInstalledAt
          ? pixelInstalledAt.getTime() > dateFrom.getTime()
          : false,
        // D4b: frescura de los rollups HLL que alimentan los "viewers" —
        // la UI muestra un badge cuando esto viene atrasado.
        rollupRefreshedAt: rollupRefreshedAt
          ? rollupRefreshedAt.toISOString()
          : null,
        totalProducts: byProduct.length,
        productsWithSales: byProduct.filter((p) => p.orders > 0).length,
        productsViewedOnly: byProduct.filter((p) => p.orders === 0).length,
      },
    });
  } catch (err: any) {
    console.error("[Conversion API] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
