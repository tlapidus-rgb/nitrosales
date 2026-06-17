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
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { ordersValidWebWhere } from "@/lib/metrics/orders";
import { getFunnelStages } from "@/lib/metrics/pixel-funnel";

export const dynamic = "force-dynamic";
// PERF (2026-06-17): el caso channel="all" lee del rollup + live-merge (getFunnelStages,
// sub-segundo). El caso channel-filtrado YA NO recomputa el first-source por visitante
// con un DISTINCT ON sobre todo el rango (era el cuello de botella: >90s, no cargaba).
// Ahora lee first_source de la dimensión precomputada `pixel_visitor_first_source`
// (PK org+visitorId, hash join) y solo deriva en vivo el first-source de los
// visitantes brand-new que aún no están en la dimensión (NOT EXISTS → set chico).
// OJO: el filtro por canal sigue acotado por el scan crudo de pixel_events (no hay
// rollup de etapas por first_source) → ~segundos, NO sub-segundo. Para <2s haría
// falta extender pixel_daily_source con HLL por etapa/canal (diferido, no en esta PR).
// FIRST-CLICK (regla de negocio, solo funnel): tanto las etapas como la compra se
// atribuyen 100% al PRIMER canal que tocó al visitante (su first_source), no a un
// modelo multi-touch. NO toca el modelo de atribución general ni attribution.ts.
export const maxDuration = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Derivación canónica de first-source por evento. DEBE ser idéntica a la del cron que
// rellena `pixel_visitor_first_source` (setup-pixel-rollups → const SRC). Se usa SOLO
// en el fallback en vivo para visitantes que todavía no están en la dimensión; para el
// resto se lee first_source directo de la dimensión. Mantener en sync con esa const.
const FIRST_SOURCE_CASE = `CASE
  WHEN ("clickIds"->>'fbclid') IS NOT NULL AND ("clickIds"->>'fbclid') != '' THEN 'meta'
  WHEN ("clickIds"->>'gclid') IS NOT NULL AND ("clickIds"->>'gclid') != '' THEN 'google'
  WHEN ("clickIds"->>'ttclid') IS NOT NULL AND ("clickIds"->>'ttclid') != '' THEN 'tiktok'
  WHEN ("clickIds"->>'msclkid') IS NOT NULL AND ("clickIds"->>'msclkid') != '' THEN 'microsoft'
  WHEN ("clickIds"->>'li_fat_id') IS NOT NULL AND ("clickIds"->>'li_fat_id') != '' THEN 'linkedin'
  WHEN LOWER("utmParams"->>'source') IN ('adwords','google_ads','google-ads','googleads') THEN 'google'
  WHEN LOWER("utmParams"->>'source') IN ('meta_ads','meta-ads','metaads','fb_ads','fb-ads','fbads','facebook_ads','facebook-ads') THEN 'meta'
  WHEN LOWER("utmParams"->>'source') IN ('ig','instagram_ads','instagram-ads') THEN 'instagram'
  WHEN ("utmParams"->>'source') IS NOT NULL AND ("utmParams"->>'source') != '' THEN LOWER("utmParams"->>'source')
  WHEN referrer ~* 'l\\.instagram\\.com|instagram\\.com' THEN 'instagram'
  WHEN referrer ~* 'facebook\\.com|fb\\.com|m\\.facebook\\.com' THEN 'facebook'
  WHEN referrer ~* 'tiktok\\.com' THEN 'tiktok'
  WHEN referrer ~* 'twitter\\.com|x\\.com|t\\.co' THEN 'twitter'
  WHEN referrer ~* 'youtube\\.com|youtu\\.be' THEN 'youtube'
  WHEN referrer ~* 'linkedin\\.com|lnkd\\.in' THEN 'linkedin'
  WHEN referrer ~* 'pinterest\\.com' THEN 'pinterest'
  WHEN referrer ~* 'whatsapp\\.com|wa\\.me' THEN 'whatsapp'
  WHEN referrer ~* 't\\.me|telegram\\.org' THEN 'telegram'
  WHEN referrer ~* 'mail\\.google\\.com|gmail\\.com|outlook\\.com|yahoo\\.com/mail' THEN 'email'
  WHEN referrer ~* 'google\\.[a-z]{2,3}' THEN 'google_organic'
  WHEN referrer ~* 'bing\\.com' THEN 'bing_organic'
  WHEN referrer ~* 'yahoo\\.com' THEN 'yahoo_organic'
  WHEN referrer = '' OR referrer IS NULL THEN 'direct'
  ELSE 'referral'
END`;

// first-source canónico del PRIMER touchpoint de una atribución (fallback de compra
// para compradores aún ausentes de la dimensión). Normaliza aliases igual que la
// dimensión. `tp1` = pa.touchpoints->0 (primer touch, first-click).
const FIRST_TP_SOURCE_CASE = `CASE
  WHEN LOWER(pa.touchpoints->0->>'source') IN ('adwords','google_ads','google-ads','googleads') THEN 'google'
  WHEN LOWER(pa.touchpoints->0->>'source') IN ('meta_ads','meta-ads','metaads','fb_ads','fb-ads','fbads','facebook_ads','facebook-ads') THEN 'meta'
  WHEN LOWER(pa.touchpoints->0->>'source') IN ('ig','instagram_ads','instagram-ads') THEN 'instagram'
  ELSE LOWER(COALESCE(pa.touchpoints->0->>'source','direct'))
END`;

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

    // Ventana viva para el fallback de first-source: un visitante ausente de la
    // dimensión `pixel_visitor_first_source` tiene su PRIMER evento posterior al
    // último refresh del cron (1×/día). Así que los "nuevos" solo pueden estar en
    // los últimos ~2 días → acotar el scan del fallback a esa ventana (no a todo el
    // rango) mantiene el filtro por canal rápido en 30/90 días. Clamp a dateFrom.
    const liveLo = new Date(Math.max(dateFrom.getTime(), now.getTime() - 2 * MS_PER_DAY));

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
      ? // FIRST-CLICK: la compra cuenta 100% para el PRIMER canal que tocó al
        // comprador. `first_source` sale de la dimensión (común) o, si el comprador
        // aún no está en ella, del primer touchpoint de su atribución (fallback sin
        // escaneo). Cada orden cuenta para UN solo canal → no se reparte. model fija
        // una fila por orden (los touchpoints son iguales entre modelos).
        prisma.$queryRaw<Array<{ purchase: number }>>`
          SELECT COUNT(DISTINCT pa."orderId")::int as purchase
          FROM pixel_attributions pa
          JOIN orders o ON o.id = pa."orderId"
          LEFT JOIN pixel_visitor_first_source d
            ON d."organizationId" = pa."organizationId" AND d."visitorId" = pa."visitorId"
          WHERE pa."organizationId" = ${orgId}
            AND pa.model::text = ${selectedModel}
            AND o."orderDate" >= ${dateFrom}
            AND o."orderDate" <= ${dateTo}
            AND ${ordersValidWebWhere("o")}
            AND COALESCE(d.first_source, ${Prisma.raw(FIRST_TP_SOURCE_CASE)}) = ${channel}
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

    const stagesPromise: Promise<{ pageView: number; viewProduct: number; addToCart: number; checkoutStart: number }> = channel
      ? prisma.$queryRaw<Array<typeof funnelRow>>`
        WITH ch_visitors AS (
          -- Set de visitantes cuyo PRIMER canal (first-click) es el filtrado.
          -- Histórico: directo de la dimensión precomputada (sin recomputar nada).
          SELECT "visitorId" FROM pixel_visitor_first_source
          WHERE "organizationId" = ${orgId} AND first_source = ${channel}
          UNION
          -- Brand-new (aún no en la dimensión): su first-source derivado en vivo,
          -- acotado a la ventana viva (últimos ~2 días) → scan chico.
          SELECT nv."visitorId" FROM (
            SELECT DISTINCT ON (pe."visitorId") pe."visitorId",
              ${Prisma.raw(FIRST_SOURCE_CASE)} AS fs
            FROM pixel_events pe
            WHERE pe."organizationId" = ${orgId}
              AND pe.timestamp >= ${liveLo}
              AND pe.timestamp <= ${dateTo}
              AND (pe."sessionId" IS NULL OR pe."sessionId" NOT LIKE 'webhook-%')
              AND NOT EXISTS (
                SELECT 1 FROM pixel_visitor_first_source d
                WHERE d."organizationId" = ${orgId} AND d."visitorId" = pe."visitorId"
              )
            ORDER BY pe."visitorId", pe.timestamp ASC
          ) nv
          WHERE nv.fs = ${channel}
        )
        SELECT
          COUNT(DISTINCT CASE WHEN pe.type = 'PAGE_VIEW' THEN pe."visitorId" END)::int as "pageView",
          COUNT(DISTINCT CASE WHEN pe.type = 'VIEW_PRODUCT' THEN pe."visitorId" END)::int as "viewProduct",
          COUNT(DISTINCT CASE WHEN pe.type = 'ADD_TO_CART' THEN pe."visitorId" END)::int as "addToCart",
          COUNT(DISTINCT CASE WHEN pe.type IN ('INITIATE_CHECKOUT', 'CHECKOUT_SHIPPING') THEN pe."visitorId" END)::int as "checkoutStart",
          0::int as "purchase"
        FROM pixel_events pe
        JOIN ch_visitors cv ON cv."visitorId" = pe."visitorId"
        WHERE pe."organizationId" = ${orgId}
          AND pe.timestamp >= ${dateFrom}
          AND pe.timestamp <= ${dateTo}
          AND (pe."sessionId" IS NULL OR pe."sessionId" NOT LIKE 'webhook-%')
      `.then((r) => ({
          pageView: r[0]?.pageView || 0,
          viewProduct: r[0]?.viewProduct || 0,
          addToCart: r[0]?.addToCart || 0,
          checkoutStart: r[0]?.checkoutStart || 0,
        }))
      : // PERF (2026-06-16): sin filtro de canal, las etapas salen del rollup
        // `pixel_daily_aggregates` PERO mergeadas en vivo con los días recientes
        // faltantes/parciales (el rollup en prod queda stale y el día AR en curso
        // es siempre parcial → antes daba 0 en "Hoy"). Ver getFunnelStages. Sigue
        // siendo la misma definición que el funnel del card de /api/metrics/pixel
        // (que usa el mismo helper) → los números coinciden (objetivo PR #4). La
        // compra sigue saliendo de órdenes web atribuidas (purchasePromise, intacta).
        getFunnelStages(orgId, dateFrom, dateTo);

    const [purchaseRows, stages] = await Promise.all([purchasePromise, stagesPromise]);
    const purchaseCount = purchaseRows[0]?.purchase || 0;
    funnelRow = { ...stages, purchase: 0 };

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
