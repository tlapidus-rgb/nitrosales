// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// Pixel Metrics — Sales by Ad (Ventas por Anuncio)
// ══════════════════════════════════════════════════════════════
// GET /api/metrics/pixel/sales-by-ad?from=...&to=...&model=LAST_CLICK
//
// Returns attributed orders grouped by ad (campaign + content),
// with product-level detail per ad. Crosses pixel attribution
// data with ad_creatives for thumbnails and names.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const revalidate = 0;

// Normalize related sources into canonical channels
const SOURCE_NORMALIZATION: Record<string, string> = {
  facebook: "meta",
  fb: "meta",
  instagram: "meta",
  ig: "meta",
  meta: "meta",
  google: "google",
  youtube: "google",
  yt: "google",
};

function normalizeSource(raw: string): string {
  const lower = (raw || "direct").toLowerCase().trim();
  return SOURCE_NORMALIZATION[lower] || lower;
}

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
      : new Date(now.getTime() - 30 * 86400000);

    const validModels = ["LAST_CLICK", "FIRST_CLICK", "LINEAR", "NITRO"];
    const modelParam = (searchParams.get("model") || "LAST_CLICK").toUpperCase();
    const selectedModel = validModels.includes(modelParam) ? modelParam : "LAST_CLICK";

    // ── Step 1: Get attributed orders with source + campaign from touchpoints ──
    // Also extract the visitorId so we can look up utm_content from their events
    const attributedOrders: Array<{
      orderId: string;
      externalId: string;
      visitorId: string;
      source: string;
      campaign: string | null;
      medium: string | null;
      attributedValue: number;
      orderDate: Date;
    }> = await prisma.$queryRaw`
      SELECT
        pa."orderId",
        o."externalId",
        pa."visitorId",
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
      return NextResponse.json({ ads: [] });
    }

    // ── Step 2: For paid-source orders, find utm_content from visitor events ──
    // utm_content typically maps to the ad ID or ad name
    const visitorIds = [...new Set(attributedOrders.map((o) => o.visitorId))];

    // Query events that have utmParams.content for these visitors
    const visitorUtmContent: Array<{
      visitorId: string;
      content: string;
      campaign: string | null;
    }> = await prisma.$queryRaw`
      SELECT DISTINCT ON (pe."visitorId")
        pe."visitorId",
        pe."utmParams"::jsonb ->> 'content' as content,
        pe."utmParams"::jsonb ->> 'campaign' as campaign
      FROM pixel_events pe
      WHERE pe."visitorId" = ANY(${visitorIds})
        AND pe."utmParams" IS NOT NULL
        AND pe."utmParams"::jsonb ->> 'content' IS NOT NULL
        AND pe."utmParams"::jsonb ->> 'content' != ''
      ORDER BY pe."visitorId", pe.timestamp DESC
    `;

    const contentByVisitor = new Map<string, { content: string; campaign: string | null }>();
    for (const row of visitorUtmContent) {
      contentByVisitor.set(row.visitorId, { content: row.content, campaign: row.campaign });
    }

    // ── Step 3: Get order items for all attributed orders ──
    const orderIds = attributedOrders.map((o) => o.orderId);

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

    // Map orderId → items
    const itemsByOrder = new Map<string, typeof orderItems>();
    for (const item of orderItems) {
      if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
      itemsByOrder.get(item.orderId)!.push(item);
    }

    // ── Step 4: Try to match utm_content values with ad_creatives for names/thumbnails ──
    const allContentValues = [...new Set(
      Array.from(contentByVisitor.values()).map((v) => v.content).filter(Boolean)
    )];

    let creativesByExternalId = new Map<string, { name: string; thumbnailUrl: string | null }>();

    if (allContentValues.length > 0) {
      // Try matching utm_content against ad_creative externalId or name
      const matchedCreatives: Array<{
        externalId: string;
        name: string;
        thumbnailUrl: string | null;
      }> = await prisma.$queryRaw`
        SELECT
          ac."externalId",
          ac.name,
          ac."mediaUrls"::jsonb ->> 0 as "thumbnailUrl"
        FROM ad_creatives ac
        WHERE ac."organizationId" = ${ORG_ID}
          AND (ac."externalId" = ANY(${allContentValues}) OR ac.name = ANY(${allContentValues}))
      `;

      for (const c of matchedCreatives) {
        creativesByExternalId.set(c.externalId, { name: c.name, thumbnailUrl: c.thumbnailUrl });
        creativesByExternalId.set(c.name, { name: c.name, thumbnailUrl: c.thumbnailUrl });
      }
    }

    // ── Step 5: Group orders by ad (source + campaign + content) ──
    interface AdGroup {
      adKey: string;
      source: string;
      campaign: string | null;
      adContent: string | null; // utm_content
      adName: string | null; // from ad_creatives or utm_content
      thumbnailUrl: string | null;
      revenue: number;
      orderIds: Set<string>;
      productMap: Map<string, {
        name: string;
        image: string | null;
        sku: string | null;
        units: number;
        revenue: number;
      }>;
    }

    const adMap = new Map<string, AdGroup>();

    for (const order of attributedOrders) {
      const source = normalizeSource(order.source);
      const campaign = order.campaign || null;

      // Get utm_content for this visitor (if available)
      const visitorContent = contentByVisitor.get(order.visitorId);
      const adContent = visitorContent?.content || null;

      // Build a unique key per ad
      // If we have utm_content, use source + campaign + content
      // Otherwise, use source + campaign (grouped at campaign level)
      const adKey = adContent
        ? `${source}|${campaign || ""}|${adContent}`
        : `${source}|${campaign || ""}`;

      // Try to get creative info
      const creativeInfo = adContent ? creativesByExternalId.get(adContent) : null;

      if (!adMap.has(adKey)) {
        adMap.set(adKey, {
          adKey,
          source,
          campaign,
          adContent,
          adName: creativeInfo?.name || adContent || null,
          thumbnailUrl: creativeInfo?.thumbnailUrl || null,
          revenue: 0,
          orderIds: new Set(),
          productMap: new Map(),
        });
      }

      const group = adMap.get(adKey)!;
      group.revenue += order.attributedValue;
      group.orderIds.add(order.orderId);

      // Update creative info if we found a match and the group doesn't have one yet
      if (creativeInfo && !group.thumbnailUrl) {
        group.thumbnailUrl = creativeInfo.thumbnailUrl;
        group.adName = creativeInfo.name;
      }

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
          });
        }
        const prod = group.productMap.get(prodKey)!;
        prod.units += item.quantity;
        prod.revenue += item.totalPrice;
        if (!prod.image && item.productImage) prod.image = item.productImage;
      }
    }

    // ── Step 6: Build final response ──
    const ads = Array.from(adMap.values())
      .map((g) => {
        const totalUnits = Array.from(g.productMap.values()).reduce((s, p) => s + p.units, 0);
        return {
          adKey: g.adKey,
          source: g.source,
          campaign: g.campaign,
          adName: g.adName,
          thumbnailUrl: g.thumbnailUrl,
          revenue: Math.round(g.revenue),
          orders: g.orderIds.size,
          units: totalUnits,
          products: Array.from(g.productMap.values())
            .map((p) => ({
              name: p.name,
              imageUrl: p.image,
              sku: p.sku,
              units: p.units,
              revenue: Math.round(p.revenue),
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 20),
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      ads,
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
      model: selectedModel,
      totalAttributedOrders: attributedOrders.length,
    });
  } catch (error) {
    console.error("[API] sales-by-ad error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
