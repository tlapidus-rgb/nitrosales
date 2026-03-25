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

/** Format utm_content into a readable name: "video-preventa-mochila" → "Video Preventa Mochila" */
function formatContentName(content: string): string {
  return content
    .replace(/[=_-]+/g, " ")
    .replace(/%3[dD]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Build a human-readable display name for an ad group */
function buildDisplayName(opts: {
  source: string;
  medium: string | null;
  campaign: string | null;
  adContent: string | null;
  creativeName: string | null;
}): string {
  // Priority 1: matched creative name from ad_creatives table
  if (opts.creativeName) return opts.creativeName;

  // Priority 2: formatted utm_content
  if (opts.adContent) return formatContentName(opts.adContent);

  // Priority 3: campaign name
  if (opts.campaign) return opts.campaign;

  // Priority 4: source + medium based label
  const s = opts.source;
  const m = (opts.medium || "").toLowerCase();

  if (s === "direct") return "Tráfico Directo";
  if (s === "google" && m === "cpc") return "Google Ads (CPC)";
  if (s === "google" && m === "organic") return "Google (Orgánico)";
  if (s === "google") return "Google";
  if (s === "meta" && m === "social-paid") return "Meta Ads (Paid)";
  if (s === "meta") return "Meta";
  if (m === "referral") return `${s} (Referral)`;
  if (m === "email") return `${s} (Email)`;

  return s.charAt(0).toUpperCase() + s.slice(1);
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

    // ── Step 1: Get attributed orders with source + campaign + medium from touchpoints ──
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
    const contentByVisitor = new Map<string, { content: string; campaign: string | null }>();

    try {
      const visitorUtmContent: Array<{
        visitorId: string;
        content: string;
        campaign: string | null;
      }> = await prisma.$queryRaw`
        SELECT DISTINCT ON (sub."visitorId")
          sub."visitorId", sub.content, sub.campaign
        FROM (
          SELECT
            pe."visitorId",
            pe."utmParams" ->> 'content' as content,
            pe."utmParams" ->> 'campaign' as campaign,
            pe.timestamp
          FROM pixel_events pe
          WHERE pe."organizationId" = ${ORG_ID}
            AND pe."utmParams" IS NOT NULL
            AND pe."utmParams" ->> 'content' IS NOT NULL
            AND pe."utmParams" ->> 'content' != ''
            AND pe."visitorId" IN (
              SELECT DISTINCT pa2."visitorId"
              FROM pixel_attributions pa2
              WHERE pa2."organizationId" = ${ORG_ID}
                AND pa2.model::text = ${selectedModel}
                AND pa2."createdAt" >= ${dateFrom}
                AND pa2."createdAt" <= ${dateTo}
            )
        ) sub
        ORDER BY sub."visitorId", sub.timestamp DESC
      `;

      for (const row of visitorUtmContent) {
        contentByVisitor.set(row.visitorId, { content: row.content, campaign: row.campaign });
      }
    } catch (e) {
      console.error("[sales-by-ad] utm_content query error:", e);
    }

    // ── Step 3: Get order items for all attributed orders ──
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
      WHERE oi."orderId" IN (
        SELECT pa3."orderId"
        FROM pixel_attributions pa3
        WHERE pa3."organizationId" = ${ORG_ID}
          AND pa3.model::text = ${selectedModel}
          AND pa3."createdAt" >= ${dateFrom}
          AND pa3."createdAt" <= ${dateTo}
      )
      ORDER BY oi."totalPrice" DESC
    `;

    // Map orderId → items
    const itemsByOrder = new Map<string, typeof orderItems>();
    for (const item of orderItems) {
      if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
      itemsByOrder.get(item.orderId)!.push(item);
    }

    // ── Step 4: Try to match utm_content values with ad_creatives ──
    const allContentValues = [...new Set(
      Array.from(contentByVisitor.values()).map((v) => v.content).filter(Boolean)
    )];

    let creativesByExternalId = new Map<string, { name: string; thumbnailUrl: string | null }>();

    if (allContentValues.length > 0) {
      try {
        const matchedCreatives: Array<{
          externalId: string;
          name: string;
          thumbnailUrl: string | null;
        }> = await prisma.$queryRaw`
          SELECT
            ac."externalId",
            ac.name,
            CASE
              WHEN ac."mediaUrls" IS NOT NULL AND jsonb_array_length(ac."mediaUrls"::jsonb) > 0
              THEN ac."mediaUrls"::jsonb ->> 0
              ELSE NULL
            END as "thumbnailUrl"
          FROM ad_creatives ac
          WHERE ac."organizationId" = ${ORG_ID}
            AND ac."externalId" IN (
              SELECT unnest(${allContentValues}::text[])
            )
        `;

        for (const c of matchedCreatives) {
          creativesByExternalId.set(c.externalId, { name: c.name, thumbnailUrl: c.thumbnailUrl });
        }
      } catch (e) {
        console.error("[sales-by-ad] creative matching error:", e);
      }
    }

    // ── Step 5: Group orders by ad (source + campaign + medium + content) ──
    interface AdGroup {
      adKey: string;
      source: string;
      campaign: string | null;
      medium: string | null;
      adContent: string | null;
      adName: string;
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
      const medium = order.medium || null;

      // Get utm_content for this visitor (if available)
      const visitorContent = contentByVisitor.get(order.visitorId);
      const adContent = visitorContent?.content || null;

      // Build a unique key per ad: source + campaign + medium + content
      const adKey = [
        source,
        campaign || "",
        medium || "",
        adContent || "",
      ].join("|");

      // Try to get creative info
      const creativeInfo = adContent ? creativesByExternalId.get(adContent) : null;

      if (!adMap.has(adKey)) {
        adMap.set(adKey, {
          adKey,
          source,
          campaign,
          medium,
          adContent,
          adName: buildDisplayName({
            source,
            medium,
            campaign,
            adContent,
            creativeName: creativeInfo?.name || null,
          }),
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
          medium: g.medium,
          adContent: g.adContent,
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
