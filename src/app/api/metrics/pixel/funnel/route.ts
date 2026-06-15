// ══════════════════════════════════════════════════════════════
// /api/metrics/pixel/funnel?from=&to=&channel=&model= (S60 EXT — multi-tenant)
// ══════════════════════════════════════════════════════════════
// Devuelve el funnel de conversion de NitroPixel filtrado por canal
// de PRIMER TOQUE (first-touch).
//
// Si channel esta seteado, filtra visitors cuyo primer evento del
// rango tenga ese source (calculado a partir de clickIds, utmParams
// y referrer del primer PAGE_VIEW).
//
// Si channel es "all" o vacio, devuelve el funnel sin filtro.
// Compra (purchase) = órdenes web atribuidas (DATA_COHERENCE Regla 5).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { ordersValidWebWhere } from "@/lib/metrics/orders";

export const dynamic = "force-dynamic";
// PERF (2026-06-15, /pixel/analytics skeleton): red de seguridad de tiempo. El
// caso channel="all" ahora lee del rollup (sub-segundo); el caso channel-filtrado
// sigue escaneando pixel_events crudo (CTE por-visitante), que en ventanas grandes
// puede tardar — el cap evita que la función serverless quede colgada >timeout.
export const maxDuration = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const url = new URL(req.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const channelRaw = (url.searchParams.get("channel") || "").trim().toLowerCase();
    const channel = channelRaw && channelRaw !== "all" ? channelRaw : null;

    const now = new Date();
    const dateTo = toParam ? new Date(toParam + "T23:59:59.999-03:00") : now;
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(now.getTime() - 7 * MS_PER_DAY);

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const orgSettings = (org?.settings as Record<string, any>) || {};
    const validModels = ["LAST_CLICK", "FIRST_CLICK", "LINEAR", "NITRO"];
    const settingsModel = validModels.includes(orgSettings.attributionModel)
      ? orgSettings.attributionModel
      : "NITRO";
    const modelParam = (url.searchParams.get("model") || settingsModel).toUpperCase();
    const selectedModel = validModels.includes(modelParam) ? modelParam : settingsModel;

    let funnelRow: { pageView: number; viewProduct: number; addToCart: number; checkoutStart: number; purchase: number };

    // Compra = órdenes web atribuidas (misma definición que businessKpis.ordersAttributed).
    const purchasePromise = channel
      ? prisma.$queryRaw<Array<{ purchase: number }>>`
          SELECT COUNT(DISTINCT o.id)::int as purchase
          FROM orders o
          JOIN pixel_attributions pa ON pa."orderId" = o.id
          WHERE pa."organizationId" = ${orgId}
            AND pa.model::text = ${selectedModel}
            AND o."orderDate" >= ${dateFrom}
            AND o."orderDate" <= ${dateTo}
            AND ${ordersValidWebWhere("o")}
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(pa.touchpoints::jsonb) AS tp
              WHERE LOWER(COALESCE(tp->>'source', 'direct')) = ${channel}
                 OR (LOWER(COALESCE(tp->>'source', 'direct')) IN ('adwords', 'google_ads', 'google-ads', 'googleads') AND ${channel} = 'google')
                 OR (LOWER(COALESCE(tp->>'source', 'direct')) IN ('meta_ads', 'meta-ads', 'metaads', 'fb_ads', 'fb-ads', 'fbads', 'facebook_ads', 'facebook-ads') AND ${channel} = 'meta')
            )
        `
      : prisma.$queryRaw<Array<{ purchase: number }>>`
          SELECT COUNT(*)::int as purchase
          FROM pixel_attributions pa
          JOIN orders o ON o.id = pa."orderId"
          WHERE pa."organizationId" = ${orgId}
            AND pa.model::text = ${selectedModel}
            AND o."orderDate" >= ${dateFrom}
            AND o."orderDate" <= ${dateTo}
            AND ${ordersValidWebWhere("o")}
        `;

    const funnelPromise = channel
      ? prisma.$queryRaw<Array<typeof funnelRow>>`
        WITH visitor_first_source AS (
          SELECT DISTINCT ON ("visitorId")
            "visitorId",
            CASE
              WHEN ("clickIds"->>'fbclid') IS NOT NULL AND ("clickIds"->>'fbclid') != '' THEN 'meta'
              WHEN ("clickIds"->>'gclid') IS NOT NULL AND ("clickIds"->>'gclid') != '' THEN 'google'
              WHEN ("clickIds"->>'ttclid') IS NOT NULL AND ("clickIds"->>'ttclid') != '' THEN 'tiktok'
              WHEN ("clickIds"->>'msclkid') IS NOT NULL AND ("clickIds"->>'msclkid') != '' THEN 'microsoft'
              WHEN ("clickIds"->>'li_fat_id') IS NOT NULL AND ("clickIds"->>'li_fat_id') != '' THEN 'linkedin'
              -- Normalizar aliases de utm_source a canonical (S60 EXT)
              WHEN LOWER("utmParams"->>'source') IN ('adwords', 'google_ads', 'google-ads', 'googleads') THEN 'google'
              WHEN LOWER("utmParams"->>'source') IN ('meta_ads', 'meta-ads', 'metaads', 'fb_ads', 'fb-ads', 'fbads', 'facebook_ads', 'facebook-ads') THEN 'meta'
              WHEN LOWER("utmParams"->>'source') IN ('ig', 'instagram_ads', 'instagram-ads') THEN 'instagram'
              WHEN ("utmParams"->>'source') IS NOT NULL AND ("utmParams"->>'source') != '' THEN LOWER("utmParams"->>'source')
              WHEN referrer ~* 'l\.instagram\.com|instagram\.com' THEN 'instagram'
              WHEN referrer ~* 'facebook\.com|fb\.com|m\.facebook\.com' THEN 'facebook'
              WHEN referrer ~* 'tiktok\.com' THEN 'tiktok'
              WHEN referrer ~* 'twitter\.com|x\.com|t\.co' THEN 'twitter'
              WHEN referrer ~* 'youtube\.com|youtu\.be' THEN 'youtube'
              WHEN referrer ~* 'linkedin\.com|lnkd\.in' THEN 'linkedin'
              WHEN referrer ~* 'pinterest\.com' THEN 'pinterest'
              WHEN referrer ~* 'whatsapp\.com|wa\.me' THEN 'whatsapp'
              WHEN referrer ~* 't\.me|telegram\.org' THEN 'telegram'
              WHEN referrer ~* 'mail\.google\.com|gmail\.com|outlook\.com|yahoo\.com/mail' THEN 'email'
              WHEN referrer ~* 'google\.[a-z]{2,3}' THEN 'google_organic'
              WHEN referrer ~* 'bing\.com' THEN 'bing_organic'
              WHEN referrer ~* 'yahoo\.com' THEN 'yahoo_organic'
              WHEN referrer = '' OR referrer IS NULL THEN 'direct'
              ELSE 'referral'
            END AS first_source
          FROM pixel_events
          WHERE "organizationId" = ${orgId}
            AND timestamp >= ${dateFrom}
            AND timestamp <= ${dateTo}
            AND ("sessionId" IS NULL OR "sessionId" NOT LIKE 'webhook-%')
          ORDER BY "visitorId", timestamp ASC
        )
        SELECT
          COUNT(DISTINCT CASE WHEN pe.type = 'PAGE_VIEW' THEN pe."visitorId" END)::int as "pageView",
          COUNT(DISTINCT CASE WHEN pe.type = 'VIEW_PRODUCT' THEN pe."visitorId" END)::int as "viewProduct",
          COUNT(DISTINCT CASE WHEN pe.type = 'ADD_TO_CART' THEN pe."visitorId" END)::int as "addToCart",
          COUNT(DISTINCT CASE WHEN pe.type IN ('INITIATE_CHECKOUT', 'CHECKOUT_SHIPPING') THEN pe."visitorId" END)::int as "checkoutStart",
          0::int as "purchase"
        FROM pixel_events pe
        INNER JOIN visitor_first_source vfs ON vfs."visitorId" = pe."visitorId"
        WHERE pe."organizationId" = ${orgId}
          AND pe.timestamp >= ${dateFrom}
          AND pe.timestamp <= ${dateTo}
          AND (pe."sessionId" IS NULL OR pe."sessionId" NOT LIKE 'webhook-%')
          AND vfs.first_source = ${channel}
      `
      : // PERF (2026-06-15): sin filtro de canal, el funnel sale del rollup
        // `pixel_daily_aggregates` (HLL por etapa, precisión 14,5) en vez de
        // `COUNT(DISTINCT visitorId)` sobre pixel_events crudo (full scan,
        // >30s timeout medido en prod). Misma query EXACTA que el funnel de
        // /api/metrics/pixel (route.ts ~L1244) → los números coinciden con el
        // card (consistencia, objetivo de PR #4). La compra sigue saliendo de
        // órdenes web atribuidas (purchasePromise, intacta).
        prisma.$queryRaw<Array<typeof funnelRow>>`
        SELECT
          COALESCE(hll_cardinality(hll_union_agg(pv_visitors_hll)), 0)::int as "pageView",
          COALESCE(hll_cardinality(hll_union_agg(product_visitors_hll)), 0)::int as "viewProduct",
          COALESCE(hll_cardinality(hll_union_agg(cart_visitors_hll)), 0)::int as "addToCart",
          COALESCE(hll_cardinality(hll_union_agg(checkout_visitors_hll)), 0)::int as "checkoutStart",
          0::int as "purchase"
        FROM pixel_daily_aggregates
        WHERE "organizationId" = ${orgId}
          AND day >= (${dateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      `;

    const [purchaseRows, funnelRows] = await Promise.all([purchasePromise, funnelPromise]);
    const purchaseCount = purchaseRows[0]?.purchase || 0;
    funnelRow = funnelRows[0] || { pageView: 0, viewProduct: 0, addToCart: 0, checkoutStart: 0, purchase: 0 };

    return NextResponse.json({
      ok: true,
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
      channel: channel || "all",
      model: selectedModel,
      funnel: {
        pageView: funnelRow.pageView || 0,
        viewProduct: funnelRow.viewProduct || 0,
        addToCart: funnelRow.addToCart || 0,
        checkoutStart: funnelRow.checkoutStart || 0,
        purchase: purchaseCount,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
