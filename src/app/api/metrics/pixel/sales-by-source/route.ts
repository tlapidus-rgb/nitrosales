// ══════════════════════════════════════════════════════════════
// Pixel Metrics — Sales by Source (Ventas por Anuncio)
// ══════════════════════════════════════════════════════════════
// GET /api/metrics/pixel/sales-by-source?from=...&to=...&model=LAST_CLICK
//
// Returns attributed orders grouped by source/channel, with
// product-level detail (name, image, units, revenue) per source.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
      : new Date(now.getTime() - 7 * 86400000);

    const validModels = ["LAST_CLICK", "FIRST_CLICK", "LINEAR", "NITRO"];
    const modelParam = (searchParams.get("model") || "LAST_CLICK").toUpperCase();
    const selectedModel = validModels.includes(modelParam) ? modelParam : "LAST_CLICK";

    // ── Step 1: Get attributed orders with their source (last-click touchpoint) ──
    // For each order, extract the source from the touchpoints array based on model
    const attributedOrders: Array<{
      orderId: string;
      externalId: string;
      source: string;
      campaign: string | null;
      medium: string | null;
      attributedValue: number;
      orderDate: Date;
    }> = await prisma.$queryRaw`
      SELECT
        pa."orderId",
        o."externalId",
        COALESCE(
          CASE
            WHEN ${selectedModel} = 'LAST_CLICK' THEN
              (pa.touchpoints::jsonb -> (pa."touchpointCount" - 1) ->> 'source')
            WHEN ${selectedModel} = 'FIRST_CLICK' THEN
              (pa.touchpoints::jsonb -> 0 ->> 'source')
            ELSE
              (pa.touchpoints::jsonb -> (pa."touchpointCount" - 1) ->> 'source')
          END,
          'direct'
        ) as source,
        CASE
          WHEN ${selectedModel} = 'LAST_CLICK' THEN
            (pa.touchpoints::jsonb -> (pa."touchpointCount" - 1) ->> 'campaign')
          WHEN ${selectedModel} = 'FIRST_CLICK' THEN
            (pa.touchpoints::jsonb -> 0 ->> 'campaign')
          ELSE
            (pa.touchpoints::jsonb -> (pa."touchpointCount" - 1) ->> 'campaign')
        END as campaign,
        CASE
          WHEN ${selectedModel} = 'LAST_CLICK' THEN
            (pa.touchpoints::jsonb -> (pa."touchpointCount" - 1) ->> 'medium')
          WHEN ${selectedModel} = 'FIRST_CLICK' THEN
            (pa.touchpoints::jsonb -> 0 ->> 'medium')
          ELSE
            (pa.touchpoints::jsonb -> (pa."touchpointCount" - 1) ->> 'medium')
        END as medium,
        pa."attributedValue"::float as "attributedValue",
        o."orderDate"
      FROM pixel_attributions pa
      JOIN orders o ON o.id = pa."orderId"
      WHERE pa."organizationId" = ${ORG_ID}
        AND pa.model::text = ${selectedModel}
        AND pa."createdAt" >= ${dateFrom}
        AND pa."createdAt" <= ${dateTo}
      ORDER BY pa."attributedValue" DESC
    `;

    if (attributedOrders.length === 0) {
      return NextResponse.json({ sources: [] });
    }

    // ── Step 2: Get order items for all attributed orders ──
    const orderIds = attributedOrders.map(o => o.orderId);

    const orderItems: Array<{
      orderId: string;
      productName: string;
      productImage: string | null;
      productSku: string | null;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }> = await prisma.$queryRaw`
      SELECT
        oi."orderId",
        p.name as "productName",
        p."imageUrl" as "productImage",
        p.sku as "productSku",
        oi.quantity::int,
        oi."unitPrice"::float,
        oi."totalPrice"::float
      FROM order_items oi
      JOIN products p ON p.id = oi."productId"
      WHERE oi."orderId" = ANY(${orderIds})
      ORDER BY oi."totalPrice" DESC
    `;

    // ── Step 3: Normalize related sources into canonical channels ──
    // facebook, instagram, fb → meta | google, youtube → google | etc.
    const SOURCE_NORMALIZATION: Record<string, string> = {
      facebook: 'meta',
      fb: 'meta',
      instagram: 'meta',
      ig: 'meta',
      meta: 'meta',
      google: 'google',
      youtube: 'google',
      yt: 'google',
    };

    function normalizeSource(raw: string): string {
      const lower = (raw || 'direct').toLowerCase().trim();
      return SOURCE_NORMALIZATION[lower] || lower;
    }

    // ── Step 4: Build the response grouped by source (channel only) ──
    // Group by source only — campaign detail belongs in the campaigns section
    interface SourceGroup {
      source: string;
      revenue: number;
      orders: number;
      units: number;
      avgTicket: number;
      products: Array<{
        name: string;
        image: string | null;
        sku: string | null;
        units: number;
        revenue: number;
        avgPrice: number;
      }>;
    }

    // Map orderId → items
    const itemsByOrder = new Map<string, typeof orderItems>();
    for (const item of orderItems) {
      if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
      itemsByOrder.get(item.orderId)!.push(item);
    }

    // Group by source key (channel only, no campaign)
    const sourceMap = new Map<string, {
      source: string;
      revenue: number;
      orderIds: Set<string>;
      productMap: Map<string, { name: string; image: string | null; sku: string | null; units: number; revenue: number; priceSum: number; priceCount: number }>;
    }>();

    for (const order of attributedOrders) {
      // Group by normalized source (channel level)
      const key = normalizeSource(order.source);

      if (!sourceMap.has(key)) {
        sourceMap.set(key, {
          source: key,
          revenue: 0,
          orderIds: new Set(),
          productMap: new Map(),
        });
      }

      const group = sourceMap.get(key)!;
      group.revenue += order.attributedValue;
      group.orderIds.add(order.orderId);

      // Add products from this order
      const items = itemsByOrder.get(order.orderId) || [];
      for (const item of items) {
        const prodKey = item.productName;
        if (!group.productMap.has(prodKey)) {
          group.productMap.set(prodKey, {
            name: item.productName,
            image: item.productImage,
            sku: item.productSku,
            units: 0,
            revenue: 0,
            priceSum: 0,
            priceCount: 0,
          });
        }
        const prod = group.productMap.get(prodKey)!;
        prod.units += item.quantity;
        prod.revenue += item.totalPrice;
        prod.priceSum += item.unitPrice;
        prod.priceCount += 1;
        // Keep the first non-null image
        if (!prod.image && item.productImage) prod.image = item.productImage;
      }
    }

    // Build final response
    const sources: SourceGroup[] = Array.from(sourceMap.values())
      .map(g => {
        const totalUnits = Array.from(g.productMap.values()).reduce((s, p) => s + p.units, 0);
        return {
          source: g.source,
          revenue: Math.round(g.revenue),
          orders: g.orderIds.size,
          units: totalUnits,
          avgTicket: g.orderIds.size > 0 ? Math.round(g.revenue / g.orderIds.size) : 0,
          products: Array.from(g.productMap.values())
            .map(p => ({
              name: p.name,
              image: p.image,
              sku: p.sku,
              units: p.units,
              revenue: Math.round(p.revenue),
              avgPrice: p.priceCount > 0 ? Math.round(p.priceSum / p.priceCount) : 0,
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 20), // Top 20 products per source
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      sources,
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
      model: selectedModel,
      totalAttributedOrders: attributedOrders.length,
    });
  } catch (error) {
    console.error("[API] sales-by-source error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
