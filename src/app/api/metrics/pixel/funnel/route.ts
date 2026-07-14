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
import { ordersValidWebWhere, ordersValidWebSql } from "@/domains/orders";
import { getFunnelStages } from "@/lib/metrics/pixel-funnel";
import {
  FIRST_SOURCE_MARKETING_CASE_FILTERED,
  GOOGLE_UTM_SQL_IN,
  META_UTM_SQL_IN,
  WEBHOOK_SESSION_FILTER,
} from "@/lib/pixel/first-source-sql";

export const dynamic = "force-dynamic";
// PERF (2026-06-15, /pixel/analytics skeleton): red de seguridad de tiempo. El
// caso channel="all" ahora lee del rollup (sub-segundo); el caso channel-filtrado
// sigue escaneando pixel_events crudo (CTE por-visitante), que en ventanas grandes
// puede tardar — el cap evita que la función serverless quede colgada >timeout.
export const maxDuration = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AR_TZ = "America/Argentina/Buenos_Aires";

type FunnelStages = { pageView: number; viewProduct: number; addToCart: number; checkoutStart: number };

// Funnel por canal. Usa el rollup `pixel_daily_funnel_by_source` (HLL por
// paso × canal × día, sub-segundo) cuando cubre el rango pedido. Si el rango
// todavía NO está backfilleado en el rollup, cae a la query en vivo sobre
// pixel_events crudo, acotada con statement_timeout de 18s: rangos chicos
// funcionan; rangos pesados devuelven null → la UI muestra "no disponible" en
// vez de colgar 60s hasta que Vercel mata la función. Cuando el backfill masivo
// + el cron llenen el rollup, TODO rango usa el rollup y es instantáneo.
async function channelFunnelStages(
  orgId: string,
  dateFrom: Date,
  dateTo: Date,
  channel: string
): Promise<FunnelStages | null> {
  const cov = (await prisma.$queryRawUnsafe(
    `SELECT (MIN(day) <= ($2 AT TIME ZONE '${AR_TZ}')::date) AS covered
     FROM pixel_daily_funnel_by_source WHERE "organizationId" = $1`,
    orgId,
    dateFrom
  )) as Array<{ covered: boolean | null }>;

  if (cov[0]?.covered) {
    const r = (await prisma.$queryRawUnsafe(
      `SELECT
         COALESCE(hll_cardinality(hll_union_agg(pv_hll)), 0)::int as "pageView",
         COALESCE(hll_cardinality(hll_union_agg(vp_hll)), 0)::int as "viewProduct",
         COALESCE(hll_cardinality(hll_union_agg(atc_hll)), 0)::int as "addToCart",
         COALESCE(hll_cardinality(hll_union_agg(co_hll)), 0)::int as "checkoutStart"
       FROM pixel_daily_funnel_by_source
       WHERE "organizationId" = $1
         AND day >= ($2 AT TIME ZONE '${AR_TZ}')::date
         AND day <= ($3 AT TIME ZONE '${AR_TZ}')::date
         AND first_source = $4`,
      orgId,
      dateFrom,
      dateTo,
      channel
    )) as Array<FunnelStages>;
    return {
      pageView: r[0]?.pageView || 0,
      viewProduct: r[0]?.viewProduct || 0,
      addToCart: r[0]?.addToCart || 0,
      checkoutStart: r[0]?.checkoutStart || 0,
    };
  }

  // Fallback: query en vivo con statement_timeout server-side (18s).
  try {
    const r = (await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = 18000`);
        return tx.$queryRawUnsafe(
          `WITH event_sources AS (
             SELECT "visitorId", timestamp,
               (${FIRST_SOURCE_MARKETING_CASE_FILTERED}) AS first_source
             FROM pixel_events
             WHERE "organizationId" = $1
               AND timestamp >= $2::timestamptz
               AND timestamp <= $3::timestamptz
               AND ${WEBHOOK_SESSION_FILTER}
           ),
           visitor_first_source AS (
             SELECT DISTINCT ON ("visitorId") "visitorId", first_source
             FROM event_sources
             WHERE first_source IS NOT NULL
             ORDER BY "visitorId", timestamp ASC
           )
           SELECT
             COUNT(DISTINCT CASE WHEN pe.type = 'PAGE_VIEW' THEN pe."visitorId" END)::int as "pageView",
             COUNT(DISTINCT CASE WHEN pe.type = 'VIEW_PRODUCT' THEN pe."visitorId" END)::int as "viewProduct",
             COUNT(DISTINCT CASE WHEN pe.type = 'ADD_TO_CART' THEN pe."visitorId" END)::int as "addToCart",
             COUNT(DISTINCT CASE WHEN pe.type IN ('INITIATE_CHECKOUT', 'CHECKOUT_SHIPPING') THEN pe."visitorId" END)::int as "checkoutStart"
           FROM pixel_events pe
           INNER JOIN visitor_first_source vfs ON vfs."visitorId" = pe."visitorId"
           WHERE pe."organizationId" = $1
             AND pe.timestamp >= $2::timestamptz
             AND pe.timestamp <= $3::timestamptz
             AND ${WEBHOOK_SESSION_FILTER}
             AND vfs.first_source = $4`,
          orgId,
          dateFrom,
          dateTo,
          channel
        );
      },
      { timeout: 20000, maxWait: 5000 }
    )) as Array<FunnelStages>;
    return {
      pageView: r[0]?.pageView || 0,
      viewProduct: r[0]?.viewProduct || 0,
      addToCart: r[0]?.addToCart || 0,
      checkoutStart: r[0]?.checkoutStart || 0,
    };
  } catch (e: any) {
    console.warn("[funnel] canal muy pesado para el rango, no-disponible:", String(e?.message).slice(0, 80));
    return null;
  }
}

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
      ? (prisma.$queryRawUnsafe(
          `SELECT COUNT(DISTINCT o.id)::int as purchase
           FROM orders o
           JOIN pixel_attributions pa ON pa."orderId" = o.id
           WHERE pa."organizationId" = $1
             AND pa.model::text = $2
             AND o."orderDate" >= $3::timestamptz
             AND o."orderDate" <= $4::timestamptz
             AND ${ordersValidWebSql("o")}
             AND EXISTS (
               SELECT 1 FROM jsonb_array_elements(pa.touchpoints::jsonb) AS tp
               WHERE LOWER(COALESCE(tp->>'source', 'direct')) = $5
                  OR (LOWER(COALESCE(tp->>'source', 'direct')) IN (${GOOGLE_UTM_SQL_IN}) AND $5 = 'google')
                  OR (LOWER(COALESCE(tp->>'source', 'direct')) IN (${META_UTM_SQL_IN}) AND $5 = 'meta')
             )`,
          orgId,
          selectedModel,
          dateFrom,
          dateTo,
          channel
        ) as Promise<Array<{ purchase: number }>>)
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

    // Rollup pixel_daily_funnel_by_source si cubre el rango; si no, live guardado.
    const stagesPromise: Promise<FunnelStages | null> = channel
      ? channelFunnelStages(orgId, dateFrom, dateTo, channel)
      : getFunnelStages(orgId, dateFrom, dateTo);

    const [purchaseRows, stages] = await Promise.all([purchasePromise, stagesPromise]);
    const purchaseCount = purchaseRows[0]?.purchase || 0;

    if (!stages) {
      // Funnel por canal: rango demasiado pesado (sin rollup de canal aún). La UI
      // muestra "no disponible para este rango" en vez de romperse por timeout.
      return NextResponse.json({
        ok: true,
        from: dateFrom.toISOString(),
        to: dateTo.toISOString(),
        channel: channel || "all",
        model: selectedModel,
        funnel: null,
        channelUnavailable: true,
      });
    }

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
