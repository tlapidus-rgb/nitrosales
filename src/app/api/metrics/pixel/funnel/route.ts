// ══════════════════════════════════════════════════════════════
// /api/metrics/pixel/funnel?from=&to=&channel= (S60 EXT — multi-tenant)
// ══════════════════════════════════════════════════════════════
// Devuelve el funnel de conversion de NitroPixel filtrado por canal
// de PRIMER TOQUE (first-touch).
//
// Si channel esta seteado, filtra visitors cuyo primer evento del
// rango tenga ese source (calculado a partir de clickIds, utmParams
// y referrer del primer PAGE_VIEW).
//
// Si channel es "all" o vacio, devuelve el funnel sin filtro.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
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

    let funnelRow: { pageView: number; viewProduct: number; addToCart: number; checkoutStart: number; purchase: number };

    if (channel) {
      // Con filtro: usar CTE para calcular first_source de cada visitor en el rango,
      // y filtrar el funnel solo a visitors que matchean el channel.
      const rows = await prisma.$queryRaw<Array<typeof funnelRow>>`
        WITH visitor_first_source AS (
          SELECT DISTINCT ON ("visitorId")
            "visitorId",
            CASE
              WHEN ("clickIds"->>'fbclid') IS NOT NULL AND ("clickIds"->>'fbclid') != '' THEN 'meta'
              WHEN ("clickIds"->>'gclid') IS NOT NULL AND ("clickIds"->>'gclid') != '' THEN 'google'
              WHEN ("clickIds"->>'ttclid') IS NOT NULL AND ("clickIds"->>'ttclid') != '' THEN 'tiktok'
              WHEN ("clickIds"->>'msclkid') IS NOT NULL AND ("clickIds"->>'msclkid') != '' THEN 'microsoft'
              WHEN ("clickIds"->>'li_fat_id') IS NOT NULL AND ("clickIds"->>'li_fat_id') != '' THEN 'linkedin'
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
          COUNT(DISTINCT CASE WHEN pe.type = 'PURCHASE' THEN pe."visitorId" END)::int as "purchase"
        FROM pixel_events pe
        INNER JOIN visitor_first_source vfs ON vfs."visitorId" = pe."visitorId"
        WHERE pe."organizationId" = ${orgId}
          AND pe.timestamp >= ${dateFrom}
          AND pe.timestamp <= ${dateTo}
          AND (pe."sessionId" IS NULL OR pe."sessionId" NOT LIKE 'webhook-%')
          AND vfs.first_source = ${channel}
      `;
      funnelRow = rows[0] || { pageView: 0, viewProduct: 0, addToCart: 0, checkoutStart: 0, purchase: 0 };
    } else {
      // Sin filtro
      const rows = await prisma.$queryRaw<Array<typeof funnelRow>>`
        SELECT
          COUNT(DISTINCT CASE WHEN pe.type = 'PAGE_VIEW' THEN pe."visitorId" END)::int as "pageView",
          COUNT(DISTINCT CASE WHEN pe.type = 'VIEW_PRODUCT' THEN pe."visitorId" END)::int as "viewProduct",
          COUNT(DISTINCT CASE WHEN pe.type = 'ADD_TO_CART' THEN pe."visitorId" END)::int as "addToCart",
          COUNT(DISTINCT CASE WHEN pe.type IN ('INITIATE_CHECKOUT', 'CHECKOUT_SHIPPING') THEN pe."visitorId" END)::int as "checkoutStart",
          COUNT(DISTINCT CASE WHEN pe.type = 'PURCHASE' THEN pe."visitorId" END)::int as "purchase"
        FROM pixel_events pe
        WHERE pe."organizationId" = ${orgId}
          AND pe.timestamp >= ${dateFrom}
          AND pe.timestamp <= ${dateTo}
          AND (pe."sessionId" IS NULL OR pe."sessionId" NOT LIKE 'webhook-%')
      `;
      funnelRow = rows[0] || { pageView: 0, viewProduct: 0, addToCart: 0, checkoutStart: 0, purchase: 0 };
    }

    return NextResponse.json({
      ok: true,
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
      channel: channel || "all",
      funnel: {
        pageView: funnelRow.pageView || 0,
        viewProduct: funnelRow.viewProduct || 0,
        addToCart: funnelRow.addToCart || 0,
        checkoutStart: funnelRow.checkoutStart || 0,
        purchase: funnelRow.purchase || 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
