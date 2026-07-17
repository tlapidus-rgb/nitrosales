export const dynamic = "force-dynamic";
export const revalidate = 0;

// ══════════════════════════════════════════════════════════════
// Conversion Rates API (lightweight)
// ══════════════════════════════════════════════════════════════
// Sesion 22: split del endpoint /api/metrics/pixel para la pestana
// "Conversion" en /products. El endpoint pixel corre ~25 queries para
// todo el dashboard NitroPixel; aca corremos solo las 6 queries que
// realmente alimentan las tablas de Conversion Rate.
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

    // ── Pixel install date floor ──
    const pixelInstallResult = (await prisma.$queryRaw`
      SELECT MIN(timestamp) as "installedAt"
      FROM pixel_events
      WHERE "organizationId" = ${ORG_ID}
    `) as Array<{ installedAt: Date | null }>;
    const pixelInstalledAt = pixelInstallResult[0]?.installedAt || null;
    const crDateFrom =
      pixelInstalledAt && pixelInstalledAt.getTime() > dateFrom.getTime()
        ? pixelInstalledAt
        : dateFrom;

    // ══════════════════════════════════════════════════════════
    // 6 queries en paralelo
    // ══════════════════════════════════════════════════════════
    const [
      visitorsBySourceResult,
      ordersBySourceResult,
      deviceVisitorsResult,
      ordersByDeviceResult,
      productViewersResult,
      productPurchasesResult,
    ] = await Promise.all([
      // 1. Visitors per source (primer touch) — PERF 2026-07: lee el rollup
      // pixel_daily_source (HLL, first-touch canónico unificado con el funnel)
      // en vez del DISTINCT ON sobre pixel_events crudo (era EL cuello del endpoint).
      prisma.$queryRaw`
        SELECT
          dp.first_source as source,
          COALESCE(hll_cardinality(hll_union_agg(dp.pv_visitors_hll)), 0)::int as visitors
        FROM pixel_daily_source dp
        WHERE dp."organizationId" = ${ORG_ID}
          AND dp.day >= (${crDateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND dp.day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        GROUP BY dp.first_source
        ORDER BY visitors DESC
        LIMIT 20
      ` as Promise<Array<{ source: string; visitors: number }>>,

      // 2. Orders by source (last-click via pixel_attributions)
      prisma.$queryRaw`
        SELECT
          COALESCE(pa.touchpoints::jsonb -> -1 ->> 'source', 'direct') as source,
          COUNT(DISTINCT pa."orderId")::int as orders,
          SUM(pa."attributedValue")::float as revenue
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${crDateFrom}
          AND o."orderDate" <= ${dateTo}
          AND pa.model::text = 'LAST_CLICK'
          AND ${ordersValidWhere("o")}
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
        GROUP BY 1
        ORDER BY orders DESC
        LIMIT 20
      ` as Promise<Array<{ source: string; orders: number; revenue: number }>>,

      // 3. Device visitors — PERF 2026-07: lee el rollup pixel_daily_device (HLL)
      // en vez del COUNT(DISTINCT) sobre pixel_events crudo.
      prisma.$queryRaw`
        SELECT
          dd.device,
          COALESCE(hll_cardinality(hll_union_agg(dd.visitors_hll)), 0)::int as visitors
        FROM pixel_daily_device dd
        WHERE dd."organizationId" = ${ORG_ID}
          AND dd.day >= (${crDateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND dd.day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        GROUP BY dd.device
        ORDER BY visitors DESC
      ` as Promise<Array<{ device: string; visitors: number }>>,

      // 4. Orders by device (via pixel_attributions → pixel_visitors)
      // CRITICAL: pa."visitorId" guarda pv.id (cuid), NO pv.visitorId (UUID cookie). JOIN debe ser por id.
      prisma.$queryRaw`
        SELECT
          COALESCE(pv."deviceTypes"[1], 'unknown') as device,
          COUNT(DISTINCT pa."orderId")::int as orders,
          SUM(pa."attributedValue")::float as revenue
        FROM pixel_attributions pa
        JOIN pixel_visitors pv ON pv.id = pa."visitorId" AND pv."organizationId" = pa."organizationId"
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${crDateFrom}
          AND o."orderDate" <= ${dateTo}
          AND pa.model::text = 'LAST_CLICK'
          AND ${ordersValidWhere("o")}
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
        GROUP BY 1
        ORDER BY orders DESC
      ` as Promise<Array<{ device: string; orders: number; revenue: number }>>,

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

    // byChannel: union de visitors + orders
    const chMap = new Map<
      string,
      { source: string; visitors: number; purchases: number; revenue: number }
    >();
    for (const v of visitorsBySourceResult) {
      chMap.set(v.source.toLowerCase(), {
        source: v.source,
        visitors: v.visitors,
        purchases: 0,
        revenue: 0,
      });
    }
    for (const o of ordersBySourceResult) {
      const key = o.source.toLowerCase();
      const existing = chMap.get(key);
      if (existing) {
        existing.purchases = o.orders;
        existing.revenue = o.revenue || 0;
      } else {
        chMap.set(key, {
          source: o.source,
          visitors: 0,
          purchases: o.orders,
          revenue: o.revenue || 0,
        });
      }
    }
    const byChannel = Array.from(chMap.values())
      .filter((ch) => ch.visitors > 5 || ch.purchases > 0) // filtrar ruido
      .map((ch) => ({
        ...ch,
        cr:
          ch.visitors > 0
            ? Math.round((ch.purchases / ch.visitors) * 10000) / 100
            : 0,
      }))
      .sort((a, b) => b.visitors - a.visitors);

    // byDevice
    const devMap = new Map<string, { device: string; visitors: number; orders: number; revenue: number }>();
    for (const v of deviceVisitorsResult) {
      devMap.set(v.device.toLowerCase(), {
        device: v.device,
        visitors: v.visitors,
        orders: 0,
        revenue: 0,
      });
    }
    for (const o of ordersByDeviceResult) {
      const key = o.device.toLowerCase();
      const existing = devMap.get(key);
      if (existing) {
        existing.orders = o.orders;
        existing.revenue = o.revenue || 0;
      } else {
        devMap.set(key, {
          device: o.device,
          visitors: 0,
          orders: o.orders,
          revenue: o.revenue || 0,
        });
      }
    }
    const byDevice = Array.from(devMap.values())
      .map((d) => ({
        ...d,
        cr:
          d.visitors > 0 ? Math.round((d.orders / d.visitors) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.visitors - a.visitors);

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
        byChannel,
        byDevice,
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
