export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Pixel Metrics API — NitroPixel Dashboard
// ══════════════════════════════════════════════════════════════
// ⛔ CORE PROTEGIDO — NO MODIFICAR SIN AUTORIZACION DEL FUNDADOR
// Ver CORE-ATTRIBUTION.md para documentacion completa.
// Estabilizado: 26 de Marzo de 2026
// CRITICO: La query de "Ordenes en Vivo" (#15) usa LEFT JOIN para
// mostrar todas las ordenes, incluyendo las no atribuidas. NO cambiar
// a INNER JOIN — eso oculta ventas que el pixel no pudo vincular.
// ══════════════════════════════════════════════════════════════
// GET /api/metrics/pixel?from=2026-03-23&to=2026-03-30
// Timezone: Argentina (UTC-3)
// ══════════════════════════════════════════════════════════════

import { ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { getCachedSWR, setCache, tryAcquireRefreshLock, releaseRefreshLock } from "@/lib/api-cache";
import { waitUntil } from "@vercel/functions";
import { ordersValidWhere } from "@/domains/orders";
import { getFunnelStages } from "@/lib/metrics/pixel-funnel";
import { goldModelRevenueSql } from "@/lib/pixel/gold-attribution-sql";
import {
  filterMarketingTouchpoints,
  isNonMarketingChannelSource,
  canonicalMarketingSource,
  mergeChannelRolesByGroupKey,
} from "@/lib/pixel/source-classification";

export const revalidate = 0;
// Techo duro de Vercel: headroom para rangos anchos sin que la función se mate
// antes de tiempo. La red de seguridad GLOBAL_TIMEOUT_MS (25s) corta antes.
export const maxDuration = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ══════════════════════════════════════════════════════════════
// Cache del conteo all-time de eventos por org (ROOT CAUSE del crash).
// La query #1 hacía COUNT(*) sobre TODA la historia de la org (11M+ filas)
// en CADA request — ~60s server-side, independiente del rango. Eso solo
// ya tiraba el endpoint. Ahora se cachea por 1h y se refresca en background
// (no bloquea el response). Ver EXPLICACION_ERROR.txt.
const _allTimeEventsCount = new Map<string, { count: number; at: number }>();
// Guard de "refresh en vuelo" por org: el COUNT(*) all-time tarda y retiene una
// conexión del pool. Sin este guard, varios requests concurrentes disparan varios
// counts simultáneos y AGOTAN el pool (limit 24) → todo cae al mock. Con el guard,
// a lo sumo 1 refresh por org a la vez.
const _allTimeRefreshing = new Set<string>();
const ALLTIME_COUNT_TTL = 60 * 60 * 1000; // 1 hora

// Secret key para que el cron de warm-cache pueda llamar este endpoint
// sin sesion. Mismo KEY que otros endpoints admin (ensure-coherence-indexes,
// orders-truth, etc).
const WARM_CACHE_KEY = ADMIN_API_KEY;

// Red de seguridad: si el endpoint no responde en N ms, devuelve un mock vacío en
// vez de colgar la función (degradación graciosa, nunca un 500/cuelgue). Combinado
// con maxDuration como techo duro de Vercel. Con los rollups de Fase 2 todos los
// rangos responden muy por debajo de este techo; queda como red de seguridad.
const GLOBAL_TIMEOUT_MS = 25000;

// IMPORTANTE: este mock debe tener la MISMA FORMA que la respuesta real de
// realHandler(), pero en cero. Se devuelve en el cold-cache/timeout (primera
// carga, cuando el compute tarda) — si le faltan campos que /pixel/analytics
// lee (businessKpis, channelRoas, deviceBreakdown, liveStatus, pixelHealth,
// recentJourneys, channelRoles, dailyChannelBreakdown, funnel), la página
// crashea en la primera carga. La página ya renderiza bien los datos reales
// vacíos, así que con la forma correcta muestra "sin datos" sin romper.
function buildEmptyMockResponse() {
  const nowIso = new Date().toISOString();
  return {
    liveStatus: { status: "IDLE", lastEventAt: null, totalEvents: 0, lastHourEvents: 0 },
    kpis: {
      totalVisitors: 0, totalSessions: 0, totalPageViews: 0, identifiedVisitors: 0,
      cartVisitors: 0, purchaseVisitors: 0, pagesPerSession: 0, daysInPeriod: 1,
      changes: { visitors: 0, sessions: 0, pageViews: 0 },
    },
    businessKpis: {
      pixelRevenue: 0, projectedRevenue: 0, pixelRoas: 0, pixelRoasRaw: 0,
      ordersAttributed: 0, attributionRate: 0, aov: 0, totalAdSpend: 0,
      totalOrders: 0, webOrders: 0, webRevenue: 0, marketplaceOrders: 0, marketplaceRevenue: 0,
      changes: { pixelRevenue: 0, ordersAttributed: 0, pixelRoas: 0 },
    },
    channelRoas: [], channelRoles: [], deviceBreakdown: [], dailyChannelBreakdown: [],
    recentJourneys: [], perDayCoverage: [], popularPages: [],
    sources: [], sourcesPrev: [], devices: [], topCampaigns: [], topPages: [],
    dailyRevenue: [], dailyVisitors: [], recentEvents: [], recentOrders: [],
    funnel: { pageView: 0, viewProduct: 0, addToCart: 0, checkoutStart: 0, purchase: 0 },
    conversionRates: { byChannel: [], byDevice: [], byCategory: [], byBrand: [], byProduct: [] },
    attribution: { byModel: [], bySource: [], byModelChannel: [], conversionLag: [] },
    journeyIntelligence: {
      complexity: [], totalJourneys: 0, multiTouchPercent: 0,
      multiTouchRevenue: 0, singleTouchRevenue: 0, multiTouchAOV: 0,
      singleTouchAOV: 0, aovLift: 0, channelPairs: [], conversionLag: [], channelRoles: [],
    },
    pixelHealth: null,
    pagination: { page: 1, pageSize: 20, totalCount: 0, totalPages: 0 },
    meta: {
      dateFrom: nowIso, dateTo: nowIso, daysInPeriod: 1,
      timezone: "America/Argentina/Buenos_Aires", attributionModel: "NITRO",
      attributionWindowDays: 30, nitroWeights: { first: 30, last: 40, middle: 30 },
      pixelInstalledAt: null, crDateFrom: nowIso, crDateAdjusted: false,
    },
    _demoMode: true,
  };
}

export async function GET(request: NextRequest) {
  // Red de seguridad: corre el handler contra un timeout global; si el handler no
  // responde a tiempo, devuelve un mock vacío en vez de colgar (nunca 500/cuelgue).
  if (GLOBAL_TIMEOUT_MS > 0) {
    const realPromise = (async () => realHandler(request))();
    const timeoutPromise = new Promise<NextResponse>((resolve) =>
      setTimeout(() => resolve(NextResponse.json({ ...buildEmptyMockResponse(), _timeoutMs: GLOBAL_TIMEOUT_MS })), GLOBAL_TIMEOUT_MS)
    );
    return Promise.race([realPromise, timeoutPromise]);
  }
  return realHandler(request);
}

async function realHandler(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    // Si viene `orgId` + `key` correctos, bypass auth (warm cache cron).
    // Caso normal: getOrganizationId() lee de la sesion NextAuth.
    const queryOrgId = searchParams.get("orgId");
    const queryKey = searchParams.get("key");
    let orgId: string;
    if (queryOrgId && queryKey === WARM_CACHE_KEY) {
      orgId = queryOrgId;
    } else {
      orgId = await getOrganizationId();
    }
    const ORG_ID = orgId;

    // ── Parse date range (defaults to last 7 days, Argentina timezone UTC-3) ──
    const now = new Date();
    const toParam = searchParams.get("to");
    const fromParam = searchParams.get("from");

    // S60 EXT-2 BIS+++++++++++++++ — REVERT del SWR. El SWR + cron
    // warm-cache estaba saturando la DB (32 fetches paralelos × 29
    // queries c/u = 928 queries simultaneas cada 30 min). Volver al
    // cache simple `getCached` (fresh 5 min, despues miss).
    const cacheKey = [orgId, fromParam || "default", toParam || "default", "v9-attrgold"];

    // ── SWR real (2026-06-12, BP-PERF-DASHBOARD) ──────────────────────────────
    // El compute completo (29 queries) vive en computeAndCache(). Cache-miss =
    // bloqueante (SOLO la primera carga). Si hay data en cache (fresh O stale) se
    // devuelve INSTANT; si está stale se dispara un refresh en background con
    // waitUntil, protegido por lock anti-thundering-herd. Esto elimina la espera de
    // ~17s que sufría el primer request tras expirar el fresh window de 5 min (antes,
    // 'stale' caía al recompute BLOQUEANTE — el route nunca implementó el serve-stale).
    // El lock por-key evita el problema que motivó el revert previo del SWR: aquel
    // era el cron warm-cache disparando 32 fetches en paralelo; acá es 1 refresh por key.
    const computeAndCache = async () => {
    const dateTo = toParam
      ? new Date(toParam + "T23:59:59.999-03:00")
      : now;
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(now.getTime() - 7 * MS_PER_DAY);

    // ── Previous period for comparison ──
    const periodMs = dateTo.getTime() - dateFrom.getTime();
    const prevFrom = new Date(dateFrom.getTime() - periodMs);
    const prevTo = new Date(dateFrom.getTime() - 1);

    // ── Pagination ──
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));
    const offset = (page - 1) * pageSize;

    const daysInPeriod = Math.max(1, Math.round(periodMs / MS_PER_DAY));

    // ── Org settings (model, weights, windows) ──
    const org = await prisma.organization.findUnique({
      where: { id: ORG_ID },
      select: { settings: true },
    });
    const orgSettings = (org?.settings as Record<string, any>) || {};
    const nitroWeights = orgSettings.nitroWeights || { first: 30, last: 40, middle: 30 };
    const VALID_WINDOWS = [7, 14, 30, 60];
    const attributionWindowDays = VALID_WINDOWS.includes(orgSettings.attributionWindowDays)
      ? orgSettings.attributionWindowDays
      : 30;

    // ── Attribution model selector (S60 EXT-2 BIS++: default desde org settings) ──
    const validModels = ["LAST_CLICK", "FIRST_CLICK", "LINEAR", "NITRO"];
    const settingsModel = validModels.includes(orgSettings.attributionModel)
      ? orgSettings.attributionModel
      : "NITRO";
    const modelParam = (searchParams.get("model") || settingsModel).toUpperCase();
    const selectedModel = validModels.includes(modelParam) ? modelParam : settingsModel;
    const wFirst = nitroWeights.first;
    const wLast = nitroWeights.last;
    const wMiddle = nitroWeights.middle;

    // ── Gold-first para las 4 queries de atribución con JSONB (tanda 5) ──
    // #9/#20/#22/#29 desanidaban pa.touchpoints (~3s c/u, seq-scan) → leen el
    // rollup gold_attribution_source detrás de PIXEL_USE_GOLD (flag propio,
    // aislado de ORDERS_USE_GOLD). Fallback a las queries Bronze si el flag está
    // off. La reconstrucción de pesos usa goldModelRevenueSql (espejo del CASE).
    const usePixelGold = process.env.PIXEL_USE_GOLD === "true";
    const arDayStr = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(d);
    const goldDayFrom = arDayStr(dateFrom);
    const goldDayTo = arDayStr(dateTo);

    // ── Pixel install date: first event ever for this org ──
    // Used as floor for CR queries (pixel visitors vs orders).
    // Without this, orgs with orders pre-pixel would show 0 visitors for old sales.
    const pixelInstallResult = await prisma.$queryRaw`
      SELECT MIN(timestamp) as "installedAt"
      FROM pixel_events
      WHERE "organizationId" = ${ORG_ID}
    ` as Array<{ installedAt: Date | null }>;
    const pixelInstalledAt = pixelInstallResult[0]?.installedAt || null;

    // crDateFrom = effective start for Conversion Rate queries
    // MAX(user-selected dateFrom, pixel install date) — so we never compare
    // pixel visitors against orders from before the pixel existed
    const crDateFrom = pixelInstalledAt && pixelInstalledAt.getTime() > dateFrom.getTime()
      ? pixelInstalledAt
      : dateFrom;

    // ══════════════════════════════════════════════════════════
    // ALL QUERIES IN PARALLEL (10-second Vercel timeout)
    // ══════════════════════════════════════════════════════════
    const [
      liveStatusResult,
      visitorKpisResult,
      prevVisitorKpisResult,
      dailyVisitorsResult,
      deviceBreakdownResult,
      eventTypesResult,
      popularPagesResult,
      attributionByModelResult,
      attributionBySourceResult,
      conversionLagResult,
      recentEventsResult,
      eventCountResult,
      // ── NEW: 6 queries for redesigned dashboard ──
      totalOrdersResult,
      adSpendBySourceResult,
      recentJourneysResult,
      clickIdCoverageResult,
      dailyRevenueResult,
      prevAttrRevenueResult,
      // ── Per-day coverage for accurate ROAS scaling ──
      perDayCoverageResult,
      // ── Per-day per-source breakdown for daily trend table ──
      dailyChannelRevenueResult,
      dailyChannelSpendResult,
      // ── Channel role breakdown (first/assist/last touch per source) ──
      channelRolesResult,
      // ── Conversion Rates queries ──
      visitorsBySourceResult,
      ordersByDeviceResult,
      productViewersResult,
      productPurchasesResult,
      // ── Journey Intelligence queries ──
      journeyComplexityResult,
      channelPairsResult,
      // ── Comparacion de modelos: revenue por (model, source) ──
      attributionByModelChannelResult,
    ] = await Promise.all([
      // 1. Live status — solo agregados index-friendly. Dos subqueries separadas:
      //    - MAX(timestamp): index backward scan sobre (organizationId, timestamp) = instante.
      //    - lastHourEvents: index-range sobre la última hora = barato (no escanea toda la historia).
      //    El COUNT(*) all-time se removió de acá (contaba 11M+ filas = ~60s/request, root
      //    cause del crash). Ahora viene del cache _allTimeEventsCount (ver abajo).
      prisma.$queryRaw`
        SELECT
          (SELECT MAX(timestamp) FROM pixel_events WHERE "organizationId" = ${ORG_ID}) as "lastEventAt",
          (SELECT COUNT(*)::int FROM pixel_events WHERE "organizationId" = ${ORG_ID} AND timestamp > NOW() - INTERVAL '1 hour') as "lastHourEvents"
      ` as Promise<Array<{ lastEventAt: Date | null; lastHourEvents: number }>>,

      // 2. Visitor KPIs (current period) — FASE 2: lee del rollup pixel_daily_aggregates
      //    (HLL ~0.8% error, pageviews exacto). Antes: COUNT(DISTINCT) sobre millones (~73s).
      //    Nota: el rollup es webhook-filtrado (humanos), así que estos KPIs ahora excluyen
      //    eventos de webhook (mejora de correctitud vs la versión cruda).
      prisma.$queryRaw`
        SELECT
          COALESCE(hll_cardinality(hll_union_agg(visitors_hll)), 0)::int as "totalVisitors",
          COALESCE(hll_cardinality(hll_union_agg(sessions_hll)), 0)::int as "totalSessions",
          COALESCE(SUM(page_views), 0)::int as "totalPageViews",
          COALESCE(hll_cardinality(hll_union_agg(identify_visitors_hll)), 0)::int as "identifiedVisitors",
          COALESCE(hll_cardinality(hll_union_agg(cart_visitors_hll)), 0)::int as "cartVisitors",
          COALESCE(hll_cardinality(hll_union_agg(purchase_visitors_hll)), 0)::int as "purchaseVisitors"
        FROM pixel_daily_aggregates
        WHERE "organizationId" = ${ORG_ID}
          AND day >= (${dateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      ` as Promise<Array<{
        totalVisitors: number; totalSessions: number; totalPageViews: number;
        identifiedVisitors: number; cartVisitors: number; purchaseVisitors: number;
      }>>,

      // 3. Previous period KPIs (for comparison) — FASE 2: rollup
      prisma.$queryRaw`
        SELECT
          COALESCE(hll_cardinality(hll_union_agg(visitors_hll)), 0)::int as "totalVisitors",
          COALESCE(hll_cardinality(hll_union_agg(sessions_hll)), 0)::int as "totalSessions",
          COALESCE(SUM(page_views), 0)::int as "totalPageViews"
        FROM pixel_daily_aggregates
        WHERE "organizationId" = ${ORG_ID}
          AND day >= (${prevFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${prevTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      ` as Promise<Array<{ totalVisitors: number; totalSessions: number; totalPageViews: number }>>,

      // 4. Daily visitors trend — FASE 2: rollup (una fila por día, sin merge)
      prisma.$queryRaw`
        SELECT
          TO_CHAR(day, 'YYYY-MM-DD') as day,
          hll_cardinality(visitors_hll)::int as visitors,
          hll_cardinality(sessions_hll)::int as sessions,
          page_views::int as "pageViews"
        FROM pixel_daily_aggregates
        WHERE "organizationId" = ${ORG_ID}
          AND day >= (${dateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        ORDER BY 1
      ` as Promise<Array<{ day: string; visitors: number; sessions: number; pageViews: number }>>,

      // 5. Device breakdown — rollup pixel_daily_device (HLL de visitantes por device).
      prisma.$queryRaw`
        SELECT device, COALESCE(hll_cardinality(hll_union_agg(visitors_hll)), 0)::int as count
        FROM pixel_daily_device
        WHERE "organizationId" = ${ORG_ID}
          AND day >= (${dateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        GROUP BY 1
        ORDER BY count DESC
      ` as Promise<Array<{ device: string; count: number }>>,

      // 6. Event types breakdown — rollup pixel_daily_type (count aditivo exacto + HLL visitantes).
      prisma.$queryRaw`
        SELECT
          type,
          COALESCE(SUM(event_count), 0)::int as count,
          COALESCE(hll_cardinality(hll_union_agg(visitors_hll)), 0)::int as "uniqueVisitors"
        FROM pixel_daily_type
        WHERE "organizationId" = ${ORG_ID}
          AND day >= (${dateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        GROUP BY 1
        ORDER BY count DESC
      ` as Promise<Array<{ type: string; count: number; uniqueVisitors: number }>>,

      // 7. Popular pages — rollup pixel_daily_page (path limpio sin query params, excluye
      //    checkout; pageViews aditivo exacto + HLL visitantes). LIMIT 10 por visitantes.
      prisma.$queryRaw`
        SELECT
          url,
          COALESCE(hll_cardinality(hll_union_agg(visitors_hll)), 0)::int as visitors,
          COALESCE(SUM(page_views), 0)::int as "pageViews"
        FROM pixel_daily_page
        WHERE "organizationId" = ${ORG_ID}
          AND day >= (${dateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        GROUP BY 1
        ORDER BY visitors DESC
        LIMIT 10
      ` as Promise<Array<{ url: string; visitors: number; pageViews: number }>>,

      // 8. Attribution by model
      prisma.$queryRaw`
        SELECT
          pa.model,
          COUNT(*)::int as "ordersAttributed",
          SUM(pa."attributedValue")::float as revenue,
          AVG(pa."attributedValue")::float as "avgValue",
          AVG(pa."touchpointCount")::float as "avgTouchpoints"
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND ${ordersValidWhere("o")}
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1
        ORDER BY revenue DESC
      ` as Promise<Array<{
        model: string; ordersAttributed: number; revenue: number;
        avgValue: number; avgTouchpoints: number;
      }>>,

      // 9. Attribution by source (weighted for NITRO, simple for others)
      // NOTE: Filter by o."orderDate" (not pa."createdAt") so date filters work correctly
      (usePixelGold
        ? prisma.$queryRawUnsafe(`
            SELECT source,
              SUM(orders)::int as orders,
              ${goldModelRevenueSql(selectedModel, wFirst, wMiddle, wLast, (n) => `SUM(${n})`)}::float as revenue
            FROM gold_attribution_source
            WHERE organization_id = $1 AND day >= $2::date AND day <= $3::date
            GROUP BY source
            ORDER BY revenue DESC
            LIMIT 10
          `, ORG_ID, goldDayFrom, goldDayTo) as Promise<Array<{ source: string; orders: number; revenue: number }>>
      : selectedModel === "NITRO"
        ? prisma.$queryRaw`
            SELECT
              CASE
                WHEN LOWER(COALESCE(tp->>'medium','')) IN ('organic','social','referral')
                  AND LOWER(COALESCE(tp->>'source','direct')) IN ('google','bing','yahoo','duckduckgo')
                THEN LOWER(COALESCE(tp->>'source','direct')) || '_organic'
                ELSE LOWER(COALESCE(tp->>'source', 'direct'))
              END as source,
              COUNT(DISTINCT pa."orderId")::int as orders,
              SUM(
                CASE
                  WHEN pa."touchpointCount" = 1 THEN pa."attributedValue"
                  WHEN pa."touchpointCount" = 2 AND tp_ord = 1 THEN pa."attributedValue" * ${wFirst}::float / (${wFirst}::float + ${wLast}::float)
                  WHEN pa."touchpointCount" = 2 AND tp_ord = 2 THEN pa."attributedValue" * ${wLast}::float / (${wFirst}::float + ${wLast}::float)
                  WHEN tp_ord = 1 THEN pa."attributedValue" * ${wFirst} / 100.0
                  WHEN tp_ord = pa."touchpointCount" THEN pa."attributedValue" * ${wLast} / 100.0
                  ELSE pa."attributedValue" * ${wMiddle} / 100.0 / GREATEST(pa."touchpointCount" - 2, 1)
                END
              )::float as revenue
            FROM pixel_attributions pa
            JOIN orders o ON o.id = pa."orderId"
            , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
            WHERE pa."organizationId" = ${ORG_ID}
              AND o."orderDate" >= ${dateFrom}
              AND o."orderDate" <= ${dateTo}
              AND pa.model::text = 'NITRO'
              AND ${ordersValidWhere("o")}
              AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
              AND o.source IS DISTINCT FROM 'MELI'
              AND o.channel IS DISTINCT FROM 'marketplace'
              AND o."externalId" NOT LIKE 'FVG-%'
              AND o."externalId" NOT LIKE 'BPR-%'
            GROUP BY 1
            ORDER BY revenue DESC
            LIMIT 10
          `
        : selectedModel === "LAST_CLICK"
        ? prisma.$queryRaw`
            SELECT
              CASE
                WHEN LOWER(COALESCE(tp->>'medium','')) IN ('organic','social','referral')
                  AND LOWER(COALESCE(tp->>'source','direct')) IN ('google','bing','yahoo','duckduckgo')
                THEN LOWER(COALESCE(tp->>'source','direct')) || '_organic'
                ELSE LOWER(COALESCE(tp->>'source', 'direct'))
              END as source,
              COUNT(DISTINCT pa."orderId")::int as orders,
              SUM(CASE WHEN tp_ord = pa."touchpointCount" THEN pa."attributedValue" ELSE 0 END)::float as revenue
            FROM pixel_attributions pa
            JOIN orders o ON o.id = pa."orderId"
            , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
            WHERE pa."organizationId" = ${ORG_ID}
              AND o."orderDate" >= ${dateFrom}
              AND o."orderDate" <= ${dateTo}
              AND pa.model::text = ${selectedModel}
              AND ${ordersValidWhere("o")}
              AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
              AND o.source IS DISTINCT FROM 'MELI'
              AND o.channel IS DISTINCT FROM 'marketplace'
              AND o."externalId" NOT LIKE 'FVG-%'
              AND o."externalId" NOT LIKE 'BPR-%'
            GROUP BY 1
            ORDER BY revenue DESC
            LIMIT 10
          `
        : selectedModel === "FIRST_CLICK"
        ? prisma.$queryRaw`
            SELECT
              CASE
                WHEN LOWER(COALESCE(tp->>'medium','')) IN ('organic','social','referral')
                  AND LOWER(COALESCE(tp->>'source','direct')) IN ('google','bing','yahoo','duckduckgo')
                THEN LOWER(COALESCE(tp->>'source','direct')) || '_organic'
                ELSE LOWER(COALESCE(tp->>'source', 'direct'))
              END as source,
              COUNT(DISTINCT pa."orderId")::int as orders,
              SUM(CASE WHEN tp_ord = 1 THEN pa."attributedValue" ELSE 0 END)::float as revenue
            FROM pixel_attributions pa
            JOIN orders o ON o.id = pa."orderId"
            , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
            WHERE pa."organizationId" = ${ORG_ID}
              AND o."orderDate" >= ${dateFrom}
              AND o."orderDate" <= ${dateTo}
              AND pa.model::text = ${selectedModel}
              AND ${ordersValidWhere("o")}
              AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
              AND o.source IS DISTINCT FROM 'MELI'
              AND o.channel IS DISTINCT FROM 'marketplace'
              AND o."externalId" NOT LIKE 'FVG-%'
              AND o."externalId" NOT LIKE 'BPR-%'
            GROUP BY 1
            ORDER BY revenue DESC
            LIMIT 10
          `
        : prisma.$queryRaw`
            SELECT
              CASE
                WHEN LOWER(COALESCE(tp->>'medium','')) IN ('organic','social','referral')
                  AND LOWER(COALESCE(tp->>'source','direct')) IN ('google','bing','yahoo','duckduckgo')
                THEN LOWER(COALESCE(tp->>'source','direct')) || '_organic'
                ELSE LOWER(COALESCE(tp->>'source', 'direct'))
              END as source,
              COUNT(DISTINCT pa."orderId")::int as orders,
              SUM(pa."attributedValue" / GREATEST(pa."touchpointCount", 1))::float as revenue
            FROM pixel_attributions pa
            JOIN orders o ON o.id = pa."orderId"
            , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
            WHERE pa."organizationId" = ${ORG_ID}
              AND o."orderDate" >= ${dateFrom}
              AND o."orderDate" <= ${dateTo}
              AND pa.model::text = ${selectedModel}
              AND ${ordersValidWhere("o")}
              AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
              AND o.source IS DISTINCT FROM 'MELI'
              AND o.channel IS DISTINCT FROM 'marketplace'
              AND o."externalId" NOT LIKE 'FVG-%'
              AND o."externalId" NOT LIKE 'BPR-%'
            GROUP BY 1
            ORDER BY revenue DESC
            LIMIT 10
          `
      ) as Promise<Array<{ source: string; orders: number; revenue: number }>>,

      // 10. Conversion lag distribution
      // Negative lags are treated as 0 (same-session: pixel fires after VTEX order)
      prisma.$queryRaw`
        SELECT
          CASE
            WHEN pa."conversionLag" IS NULL THEN 'unknown'
            WHEN pa."conversionLag" <= 0 THEN 'Mismo día'
            WHEN pa."conversionLag" BETWEEN 1 AND 3 THEN '1-3 días'
            WHEN pa."conversionLag" BETWEEN 4 AND 7 THEN '4-7 días'
            WHEN pa."conversionLag" BETWEEN 8 AND 14 THEN '8-14 días'
            WHEN pa."conversionLag" BETWEEN 15 AND 30 THEN '15-30 días'
            ELSE '30+ días'
          END as bucket,
          COUNT(*)::int as orders,
          SUM(pa."attributedValue")::float as revenue
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
          AND ${ordersValidWhere("o")}
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1
        ORDER BY MIN(COALESCE(GREATEST(pa."conversionLag", 0), 999))
      ` as Promise<Array<{ bucket: string; orders: number; revenue: number }>>,

      // 11. Recent events
      prisma.$queryRaw`
        SELECT
          pe.id,
          pe.type,
          pe."visitorId",
          pe."pageUrl",
          pe."deviceType",
          pe.timestamp,
          pe."sessionId"
        FROM pixel_events pe
        WHERE pe."organizationId" = ${ORG_ID}
          AND pe.timestamp >= ${dateFrom}
          AND pe.timestamp <= ${dateTo}
        ORDER BY pe.timestamp DESC
        LIMIT ${pageSize}
        OFFSET ${offset}
      ` as Promise<Array<{
        id: string; type: string; visitorId: string; pageUrl: string | null;
        deviceType: string | null; timestamp: Date; sessionId: string;
      }>>,

      // 12. Total event count for pagination — rollup (SUM aditivo exacto).
      prisma.$queryRaw`
        SELECT COALESCE(SUM(total_events), 0)::int as total
        FROM pixel_daily_aggregates
        WHERE "organizationId" = ${ORG_ID}
          AND day >= (${dateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      ` as Promise<Array<{ total: number }>>,

      // ── NEW QUERIES FOR REDESIGNED DASHBOARD ──

      // 13. Total orders in period (for attribution rate)
      // Exclude cancelled/pending/zero-value AND marketplace orders (MercadoLibre)
      // Marketplace orders cannot be tracked by the pixel (checkout happens on ML)
      // NOTE: Marketplace detection uses trafficSource='Marketplace' OR source='MELI' OR channel='marketplace'
      //        because MELI-synced orders don't always have trafficSource set
      prisma.$queryRaw`
        SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE "trafficSource" = 'Marketplace' OR source = 'MELI' OR channel = 'marketplace' OR "externalId" LIKE 'FVG-%' OR "externalId" LIKE 'BPR-%')::int as "marketplaceOrders",
          SUM("totalValue") FILTER (WHERE "trafficSource" = 'Marketplace' OR source = 'MELI' OR channel = 'marketplace' OR "externalId" LIKE 'FVG-%' OR "externalId" LIKE 'BPR-%')::float as "marketplaceRevenue",
          COUNT(*) FILTER (WHERE "trafficSource" IS DISTINCT FROM 'Marketplace' AND source IS DISTINCT FROM 'MELI' AND channel IS DISTINCT FROM 'marketplace' AND "externalId" NOT LIKE 'FVG-%' AND "externalId" NOT LIKE 'BPR-%')::int as "webOrders",
          SUM("totalValue") FILTER (WHERE "trafficSource" IS DISTINCT FROM 'Marketplace' AND source IS DISTINCT FROM 'MELI' AND channel IS DISTINCT FROM 'marketplace' AND "externalId" NOT LIKE 'FVG-%' AND "externalId" NOT LIKE 'BPR-%')::float as "webRevenue"
        FROM orders
        WHERE "organizationId" = ${ORG_ID}
          AND "orderDate" >= ${dateFrom}
          AND "orderDate" <= ${dateTo}
          AND ${ordersValidWhere("")}
          AND "totalValue" > 0
      ` as Promise<Array<{ total: number; marketplaceOrders: number; marketplaceRevenue: number; webOrders: number; webRevenue: number }>>,

      // 14. Ad spend + platform metrics grouped by source (META/GOOGLE)
      prisma.$queryRaw`
        SELECT
          LOWER(amd.platform::text) as source,
          SUM(amd.spend)::float as spend,
          SUM(amd.conversions)::int as "platformConversions",
          SUM(amd."conversionValue")::float as "platformRevenue"
        FROM ad_metrics_daily amd
        WHERE amd."organizationId" = ${ORG_ID}
          AND amd.date >= ${dateFrom}::date
          AND amd.date <= ${dateTo}::date
        GROUP BY 1
      ` as Promise<Array<{ source: string; spend: number; platformConversions: number; platformRevenue: number }>>,

      // 15. Recent journeys (all orders — LEFT JOIN attribution so unmatched orders also appear)
      // S60 EXT: agregar filtro de prefijos VTEX marketplace (FVG-, BPR-) que escapan
      // a los flags channel/trafficSource si el enrichment no los marco.
      prisma.$queryRaw`
        SELECT
          o.id as "orderId",
          o."externalId" as "orderExternalId",
          COALESCE(pa."attributedValue", o."totalValue")::float as revenue,
          COALESCE(pa."touchpointCount", 0) as "touchpointCount",
          pa."conversionLag",
          pa.touchpoints,
          o."orderDate",
          o.status::text as "orderStatus",
          CASE WHEN pa.id IS NOT NULL THEN true ELSE false END as "isAttributed"
        FROM orders o
        LEFT JOIN pixel_attributions pa ON pa."orderId" = o.id AND pa.model::text = ${selectedModel}
        WHERE o."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND ${ordersValidWhere("o")}
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        ORDER BY o."orderDate" DESC, o."createdAt" DESC, o.id DESC
        LIMIT 50
      ` as Promise<Array<{
        orderId: string; orderExternalId: string; revenue: number;
        touchpointCount: number; conversionLag: number | null;
        touchpoints: any; orderDate: Date; orderStatus: string;
        isAttributed: boolean;
      }>>,

      // 16. Click ID coverage (pixel health) — rollup (SUM aditivo exacto de events_with_clickid).
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(events_with_clickid), 0)::int as "withClickId",
          COALESCE(SUM(total_events), 0)::int as total
        FROM pixel_daily_aggregates
        WHERE "organizationId" = ${ORG_ID}
          AND day >= (${dateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      ` as Promise<Array<{ withClickId: number; total: number }>>,

      // 17. Daily revenue from attributions (for revenue chart)
      prisma.$queryRaw`
        SELECT
          TO_CHAR(DATE(o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') as day,
          SUM(pa."attributedValue")::float as revenue,
          COUNT(*)::int as orders
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
          AND ${ordersValidWhere("o")}
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1
        ORDER BY 1
      ` as Promise<Array<{ day: string; revenue: number; orders: number }>>,

      // 18. Previous period attribution revenue (for business KPI changes)
      prisma.$queryRaw`
        SELECT
          COUNT(*)::int as "ordersAttributed",
          SUM(pa."attributedValue")::float as revenue
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${prevFrom}
          AND o."orderDate" <= ${prevTo}
          AND pa.model::text = ${selectedModel}
          AND ${ordersValidWhere("o")}
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
      ` as Promise<Array<{ ordersAttributed: number; revenue: number }>>,

      // 19. Per-day coverage: total orders vs attributed orders per day
      //     Used for accurate ROAS scaling instead of uniform coverage ratio
      //     Excludes marketplace orders which can't be pixel-tracked:
      //       - MercadoLibre (source = MELI)
      //       - Marketplace flag (channel/trafficSource)
      //       - VTEX marketplaces que el seller publica via VTEX (Fravega, Banco Provincia)
      //         se identifican por prefijo en externalId (FVG-, BPR-)
      prisma.$queryRaw`
        SELECT
          TO_CHAR(DATE(o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') as day,
          COUNT(*)::int as "totalOrders",
          COUNT(DISTINCT pa."orderId")::int as "attributedOrders"
        FROM orders o
        LEFT JOIN (
          SELECT DISTINCT "orderId"
          FROM pixel_attributions
          WHERE "organizationId" = ${ORG_ID}
            AND model::text = ${selectedModel}
        ) pa ON pa."orderId" = o.id
        WHERE o."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND ${ordersValidWhere("o")}
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1
        ORDER BY 1
      ` as Promise<Array<{ day: string; totalOrders: number; attributedOrders: number }>>,

      // 20. Per-day per-source pixel revenue (for daily trend table)
      // S60 EXT-2 BIS++: respeta el modelo seleccionado distribuyendo el revenue
      // segun la logica de cada modelo (last_click / first_click / linear / nitro).
      // Antes hardcodeaba LAST_CLICK lo cual hacia que cambiar de modelo no afecte
      // la tarjeta de revenue por canal por dia.
      (usePixelGold
        ? prisma.$queryRawUnsafe(`
            SELECT TO_CHAR(day, 'YYYY-MM-DD') as day, source, orders,
              ${goldModelRevenueSql(selectedModel, wFirst, wMiddle, wLast, (n) => n)}::float as revenue
            FROM gold_attribution_source
            WHERE organization_id = $1 AND day >= $2::date AND day <= $3::date
            ORDER BY day DESC, revenue DESC
          `, ORG_ID, goldDayFrom, goldDayTo) as Promise<Array<{ day: string; source: string; orders: number; revenue: number }>>
      : prisma.$queryRaw`
        SELECT
          TO_CHAR(DATE(o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') as day,
          CASE
            WHEN LOWER(COALESCE(tp->>'medium','')) IN ('organic','social','referral')
              AND LOWER(COALESCE(tp->>'source','direct')) IN ('google','bing','yahoo','duckduckgo')
            THEN LOWER(COALESCE(tp->>'source','direct')) || '_organic'
            ELSE LOWER(COALESCE(tp->>'source', 'direct'))
          END as source,
          COUNT(DISTINCT pa."orderId")::int as orders,
          SUM(
            pa."attributedValue" * (
              CASE
                WHEN pa."touchpointCount" = 1 THEN 1.0
                WHEN ${selectedModel} = 'LAST_CLICK' THEN
                  CASE WHEN tp_ord = pa."touchpointCount" THEN 1.0 ELSE 0.0 END
                WHEN ${selectedModel} = 'FIRST_CLICK' THEN
                  CASE WHEN tp_ord = 1 THEN 1.0 ELSE 0.0 END
                WHEN ${selectedModel} = 'LINEAR' THEN
                  1.0 / pa."touchpointCount"::float
                WHEN ${selectedModel} = 'NITRO' THEN
                  CASE
                    WHEN pa."touchpointCount" = 2 AND tp_ord = 1 THEN ${wFirst}::float / NULLIF((${wFirst} + ${wLast})::float, 0)
                    WHEN pa."touchpointCount" = 2 AND tp_ord = 2 THEN ${wLast}::float / NULLIF((${wFirst} + ${wLast})::float, 0)
                    WHEN tp_ord = 1 THEN ${wFirst}::float / 100.0
                    WHEN tp_ord = pa."touchpointCount" THEN ${wLast}::float / 100.0
                    ELSE (${wMiddle}::float / 100.0) / GREATEST(pa."touchpointCount" - 2, 1)::float
                  END
                ELSE 0.0
              END
            )
          )::float as revenue
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
          AND ${ordersValidWhere("o")}
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1, 2
        ORDER BY 1 DESC, revenue DESC
      ` as Promise<Array<{ day: string; source: string; orders: number; revenue: number }>>),

      // 21. Per-day per-platform ad spend (for daily trend table)
      prisma.$queryRaw`
        SELECT
          TO_CHAR(amd.date, 'YYYY-MM-DD') as day,
          LOWER(amd.platform::text) as source,
          SUM(amd.spend)::float as spend
        FROM ad_metrics_daily amd
        WHERE amd."organizationId" = ${ORG_ID}
          AND amd.date >= ${dateFrom}::date
          AND amd.date <= ${dateTo}::date
        GROUP BY 1, 2
      ` as Promise<Array<{ day: string; source: string; spend: number }>>,

      // 22. Channel roles — first/assist/last touch counts per source across ALL journeys
      (usePixelGold
        ? prisma.$queryRawUnsafe(`
            SELECT source,
              SUM(first_touch_count)::int as "firstTouch",
              SUM(assist_touch_count)::int as "assistTouch",
              SUM(last_touch_count)::int as "lastTouch",
              SUM(solo_touch_count)::int as "soloTouch"
            FROM gold_attribution_source
            WHERE organization_id = $1 AND day >= $2::date AND day <= $3::date
            GROUP BY source
            ORDER BY "firstTouch" DESC
          `, ORG_ID, goldDayFrom, goldDayTo) as Promise<Array<{ source: string; firstTouch: number; assistTouch: number; lastTouch: number; soloTouch: number }>>
      : prisma.$queryRaw`
        SELECT
          CASE
            WHEN LOWER(COALESCE(tp->>'medium','')) IN ('organic','social','referral')
              AND LOWER(COALESCE(tp->>'source','direct')) IN ('google','bing','yahoo','duckduckgo')
            THEN LOWER(COALESCE(tp->>'source','direct')) || '_organic'
            ELSE LOWER(COALESCE(tp->>'source', 'direct'))
          END as source,
          COUNT(*) FILTER (WHERE tp_ord = 1)::int as "firstTouch",
          COUNT(*) FILTER (WHERE tp_ord > 1 AND tp_ord < pa."touchpointCount")::int as "assistTouch",
          COUNT(*) FILTER (WHERE tp_ord = pa."touchpointCount" AND pa."touchpointCount" > 1)::int as "lastTouch",
          COUNT(*) FILTER (WHERE pa."touchpointCount" = 1)::int as "soloTouch"
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
          AND ${ordersValidWhere("o")}
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1
        ORDER BY "firstTouch" DESC
      ` as Promise<Array<{ source: string; firstTouch: number; assistTouch: number; lastTouch: number; soloTouch: number }>>),

      // 23. Visitors + Purchases per source — S60 EXT-2 BIS+++++++ FIX:
      // ANTES: purchases = distinct visitors con event PURCHASE → contaba eventos
      //        huerfanos (sin orden real) y duplicados → daba mas que las ordenes reales.
      // AHORA: purchases = ORDENES web validas atribuidas via pixel_attributions
      //        cuyo visitor tuvo first_touch = source. Single source of truth via
      //        ordersValidWebWhere() de lib/metrics/orders.ts.
      // Visitors sigue siendo distinct visitor con PAGE_VIEW (definicion de "trafico").
      // FASE 2: visitors desde el rollup pixel_daily_source (HLL union → distinct
      // visitantes con PAGE_VIEW cuyo first_touch GLOBAL = source, en la ventana; sin
      // sobre-conteo). purchases desde pixel_attributions (tabla chica) cruzado contra
      // la dimensión pixel_visitor_first_source (first_source inmutable por visitante).
      prisma.$queryRaw`
        WITH visitor_to_orders AS (
          SELECT DISTINCT pa."visitorId" as pv_id, o.id as order_id
          FROM orders o
          JOIN pixel_attributions pa ON pa."orderId" = o.id
          WHERE pa."organizationId" = ${ORG_ID}
            AND pa.model::text = ${selectedModel}
            AND o."orderDate" >= ${dateFrom}
            AND o."orderDate" <= ${dateTo}
            AND ${ordersValidWhere("o")}
            AND o."totalValue" > 0
            AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
            AND o.source IS DISTINCT FROM 'MELI'
            AND o.channel IS DISTINCT FROM 'marketplace'
            AND o."externalId" NOT LIKE 'FVG-%'
            AND o."externalId" NOT LIKE 'BPR-%'
        ),
        src_visitors AS (
          SELECT first_source as source,
            hll_cardinality(hll_union_agg(pv_visitors_hll))::int as visitors
          FROM pixel_daily_source
          WHERE "organizationId" = ${ORG_ID}
            AND day >= (${dateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
            AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          GROUP BY 1
        ),
        src_purchases AS (
          SELECT d.first_source as source, COUNT(DISTINCT vto.order_id)::int as purchases
          FROM visitor_to_orders vto
          JOIN pixel_visitor_first_source d
            ON d."organizationId" = ${ORG_ID} AND d."visitorId" = vto.pv_id
          GROUP BY 1
        )
        SELECT
          COALESCE(sv.source, sp.source) as source,
          COALESCE(sv.visitors, 0)::int as visitors,
          COALESCE(sp.purchases, 0)::int as purchases
        FROM src_visitors sv
        FULL OUTER JOIN src_purchases sp ON sv.source = sp.source
        ORDER BY visitors DESC
        LIMIT 10
      ` as Promise<Array<{ source: string; visitors: number; purchases: number }>>,

      // 24. Orders by device — device del visitante atribuido.
      // CRITICAL: pa."visitorId" guarda pv.id (cuid Prisma), NO pv.visitorId (UUID cookie).
      // Por eso JOIN debe ser pv.id = pa.visitorId.
      // PERF (2026-07-02): antes hacía un LATERAL a pixel_events (24M filas) POR CADA
      // orden atribuida → 33s+ en orgs con muchas atribuciones (Arredo, post-backfill)
      // → superaba el timeout de 25s y la página crasheaba en 30 días. Ahora usa
      // pv."deviceTypes"[1] (el device del visitante, que ya estaba como fallback) →
      // simple JOIN+agregación, sub-segundo. Uses crDateFrom (piso de cobertura del pixel).
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
          AND pa.model::text = ${selectedModel}
          AND ${ordersValidWhere("o")}
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1
        ORDER BY orders DESC
      ` as Promise<Array<{ device: string; orders: number; revenue: number }>>,

      // 25. Product viewers — rollup pixel_daily_product (HLL de visitantes por producto).
      // Usa crDateFrom (piso de cobertura del pixel) como límite inferior del rango.
      prisma.$queryRaw`
        SELECT
          product_id as "productExternalId",
          COALESCE(hll_cardinality(hll_union_agg(viewers_hll)), 0)::int as viewers
        FROM pixel_daily_product
        WHERE "organizationId" = ${ORG_ID}
          AND day >= (${crDateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        GROUP BY 1
        ORDER BY viewers DESC
        LIMIT 500
      ` as Promise<Array<{ productExternalId: string; viewers: number }>>,

      // 26. Product purchases with name/category/brand (for CR by product/category/brand)
      // Uses crDateFrom so purchases align with pixel visitor coverage period
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
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1, 2, 3, 4
        ORDER BY revenue DESC
        LIMIT 500
      ` as Promise<Array<{ productExternalId: string; productName: string; category: string; brand: string; orders: number; units: number; revenue: number }>>,

      // ── Journey Intelligence queries (use crDateFrom for pixel coverage) ──

      // 27. Journey complexity distribution (touchpoint count → journeys, revenue, AOV)
      prisma.$queryRaw`
        SELECT
          CASE
            WHEN pa."touchpointCount" = 1 THEN 1
            WHEN pa."touchpointCount" = 2 THEN 2
            WHEN pa."touchpointCount" = 3 THEN 3
            WHEN pa."touchpointCount" BETWEEN 4 AND 6 THEN 4
            ELSE 5
          END as bucket,
          COUNT(*)::int as journeys,
          SUM(pa."attributedValue")::float as revenue,
          AVG(pa."attributedValue")::float as aov
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${crDateFrom}
          AND o."orderDate" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
          AND ${ordersValidWhere("o")}
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
        GROUP BY 1
        ORDER BY 1
      ` as Promise<Array<{ bucket: number; journeys: number; revenue: number; aov: number }>>,

      // 28. Top channel pairs (first touch → last touch for multi-touch journeys)
      prisma.$queryRaw`
        SELECT
          CASE
            WHEN COALESCE(pa.touchpoints::jsonb->0->>'medium','') IN ('organic','social','referral')
              AND COALESCE(pa.touchpoints::jsonb->0->>'source','') IN ('google','bing','yahoo','duckduckgo')
            THEN COALESCE(pa.touchpoints::jsonb->0->>'source','') || '_organic'
            ELSE COALESCE(pa.touchpoints::jsonb->0->>'source', 'direct')
          END as first_channel,
          CASE
            WHEN COALESCE(pa.touchpoints::jsonb->(-1)->>'medium','') IN ('organic','social','referral')
              AND COALESCE(pa.touchpoints::jsonb->(-1)->>'source','') IN ('google','bing','yahoo','duckduckgo')
            THEN COALESCE(pa.touchpoints::jsonb->(-1)->>'source','') || '_organic'
            ELSE COALESCE(pa.touchpoints::jsonb->(-1)->>'source', 'direct')
          END as last_channel,
          COUNT(*)::int as journeys,
          SUM(pa."attributedValue")::float as revenue,
          AVG(pa."attributedValue")::float as aov
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        WHERE pa."organizationId" = ${ORG_ID}
          AND o."orderDate" >= ${crDateFrom}
          AND o."orderDate" <= ${dateTo}
          AND pa.model::text = ${selectedModel}
          AND pa."touchpointCount" >= 2
          AND ${ordersValidWhere("o")}
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
        GROUP BY 1, 2
        ORDER BY revenue DESC
        LIMIT 10
      ` as Promise<Array<{ first_channel: string; last_channel: string; journeys: number; revenue: number; aov: number }>>,

      // 29. Revenue por (modelo, canal) — para tarjeta "Comparacion de modelos"
      // Una sola pasada: descompone cada attribution en touchpoints y aplica
      // la formula de cada modelo para repartir el attributedValue por canal.
      // GROUP BY (model, source) → ~4 modelos × N canales rows.
      (usePixelGold
        ? prisma.$queryRawUnsafe(`
            WITH src AS (
              SELECT source,
                SUM(nitro_single) nitro_single, SUM(nitro_first2) nitro_first2,
                SUM(nitro_last2) nitro_last2, SUM(nitro_first_n) nitro_first_n,
                SUM(nitro_last_n) nitro_last_n, SUM(nitro_middle_n) nitro_middle_n,
                SUM(last_click_revenue) last_click_revenue,
                SUM(first_click_revenue) first_click_revenue,
                SUM(linear_revenue) linear_revenue
              FROM gold_attribution_source
              WHERE organization_id = $1 AND day >= $2::date AND day <= $3::date
              GROUP BY source
            )
            SELECT model, source, revenue FROM (
              SELECT m.model, s.source,
                (CASE m.model
                  WHEN 'LAST_CLICK'  THEN ${goldModelRevenueSql("LAST_CLICK", wFirst, wMiddle, wLast, (n) => `s.${n}`)}
                  WHEN 'FIRST_CLICK' THEN ${goldModelRevenueSql("FIRST_CLICK", wFirst, wMiddle, wLast, (n) => `s.${n}`)}
                  WHEN 'LINEAR'      THEN ${goldModelRevenueSql("LINEAR", wFirst, wMiddle, wLast, (n) => `s.${n}`)}
                  ELSE ${goldModelRevenueSql("NITRO", wFirst, wMiddle, wLast, (n) => `s.${n}`)}
                END)::float as revenue
              FROM src s
              CROSS JOIN (VALUES ('LAST_CLICK'),('FIRST_CLICK'),('LINEAR'),('NITRO')) m(model)
            ) t
            WHERE revenue > 0
            ORDER BY model, revenue DESC
          `, ORG_ID, goldDayFrom, goldDayTo) as Promise<Array<{ model: string; source: string; revenue: number }>>
      : prisma.$queryRaw`
        SELECT
          pa.model::text as model,
          CASE
            WHEN LOWER(COALESCE(tp->>'medium','')) IN ('organic','social','referral')
              AND LOWER(COALESCE(tp->>'source','direct')) IN ('google','bing','yahoo','duckduckgo')
            THEN LOWER(COALESCE(tp->>'source','direct')) || '_organic'
            ELSE LOWER(COALESCE(tp->>'source', 'direct'))
          END as source,
          SUM(
            pa."attributedValue" * (
              CASE
                WHEN pa."touchpointCount" = 1 THEN 1.0
                WHEN pa.model::text = 'LAST_CLICK' THEN
                  CASE WHEN tp_ord = pa."touchpointCount" THEN 1.0 ELSE 0.0 END
                WHEN pa.model::text = 'FIRST_CLICK' THEN
                  CASE WHEN tp_ord = 1 THEN 1.0 ELSE 0.0 END
                WHEN pa.model::text = 'LINEAR' THEN
                  1.0 / pa."touchpointCount"::float
                WHEN pa.model::text = 'NITRO' THEN
                  CASE
                    WHEN pa."touchpointCount" = 2 AND tp_ord = 1 THEN ${wFirst}::float / NULLIF((${wFirst} + ${wLast})::float, 0)
                    WHEN pa."touchpointCount" = 2 AND tp_ord = 2 THEN ${wLast}::float / NULLIF((${wFirst} + ${wLast})::float, 0)
                    WHEN tp_ord = 1 THEN ${wFirst}::float / 100.0
                    WHEN tp_ord = pa."touchpointCount" THEN ${wLast}::float / 100.0
                    ELSE (${wMiddle}::float / 100.0) / GREATEST(pa."touchpointCount" - 2, 1)::float
                  END
                ELSE 0.0
              END
            )
          )::float as revenue
        FROM pixel_attributions pa
        JOIN orders o ON o.id = pa."orderId"
        , jsonb_array_elements(pa.touchpoints::jsonb) WITH ORDINALITY AS t(tp, tp_ord)
        WHERE pa."organizationId" = ${ORG_ID}
          AND pa.model::text IN ('LAST_CLICK', 'FIRST_CLICK', 'LINEAR', 'NITRO')
          AND o."orderDate" >= ${dateFrom}
          AND o."orderDate" <= ${dateTo}
          AND ${ordersValidWhere("o")}
          AND o."totalValue" > 0
          AND o."trafficSource" IS DISTINCT FROM 'Marketplace'
          AND o.source IS DISTINCT FROM 'MELI'
          AND o.channel IS DISTINCT FROM 'marketplace'
          AND o."externalId" NOT LIKE 'FVG-%'
          AND o."externalId" NOT LIKE 'BPR-%'
        GROUP BY 1, 2
        HAVING SUM(
          pa."attributedValue" * (
            CASE
              WHEN pa."touchpointCount" = 1 THEN 1.0
              WHEN pa.model::text = 'LAST_CLICK' THEN
                CASE WHEN tp_ord = pa."touchpointCount" THEN 1.0 ELSE 0.0 END
              WHEN pa.model::text = 'FIRST_CLICK' THEN
                CASE WHEN tp_ord = 1 THEN 1.0 ELSE 0.0 END
              WHEN pa.model::text = 'LINEAR' THEN
                1.0 / pa."touchpointCount"::float
              WHEN pa.model::text = 'NITRO' THEN
                CASE
                  WHEN pa."touchpointCount" = 2 AND tp_ord = 1 THEN ${wFirst}::float / NULLIF((${wFirst} + ${wLast})::float, 0)
                  WHEN pa."touchpointCount" = 2 AND tp_ord = 2 THEN ${wLast}::float / NULLIF((${wFirst} + ${wLast})::float, 0)
                  WHEN tp_ord = 1 THEN ${wFirst}::float / 100.0
                  WHEN tp_ord = pa."touchpointCount" THEN ${wLast}::float / 100.0
                  ELSE (${wMiddle}::float / 100.0) / GREATEST(pa."touchpointCount" - 2, 1)::float
                END
              ELSE 0.0
            END
          )
        ) > 0
        ORDER BY 1, 3 DESC
      ` as Promise<Array<{ model: string; source: string; revenue: number }>>),
    ]);

    // ══════════════════════════════════════════════════════════
    // PROCESS RESULTS
    // ══════════════════════════════════════════════════════════

    const ls = liveStatusResult[0];
    const kpisCurr = visitorKpisResult[0];
    const kpisPrev = prevVisitorKpisResult[0];

    // Live status
    const lastEventAt = ls?.lastEventAt;
    let status: "LIVE" | "ACTIVE" | "INACTIVE" = "INACTIVE";
    if (lastEventAt) {
      const minutesAgo = (Date.now() - new Date(lastEventAt).getTime()) / 60000;
      if (minutesAgo < 60) status = "LIVE";
      else if (minutesAgo < 1440) status = "ACTIVE";
    }

    // ── Conteo all-time de eventos (cacheado, ver _allTimeEventsCount) ──
    // El COUNT(*) all-time costaba ~60s/request (root cause). Lo servimos del
    // cache; si está vencido o no existe, lo refrescamos en BACKGROUND (no bloquea
    // el response). Fallback primera vez: el conteo del período (eventCountResult).
    const allTimeCached = _allTimeEventsCount.get(ORG_ID);
    const allTimeFresh = allTimeCached && Date.now() - allTimeCached.at < ALLTIME_COUNT_TTL;
    if (!allTimeFresh && !_allTimeRefreshing.has(ORG_ID)) {
      _allTimeRefreshing.add(ORG_ID);
      // waitUntil: en Vercel, sin esto la función se congela al devolver el response
      // y el COUNT en background NO completa (cache nunca se llena) y el .finally
      // NO corre (el guard queda trabado). waitUntil mantiene viva la función hasta
      // que la promesa resuelve. Patrón ya usado en otros endpoints del repo.
      waitUntil(
        prisma.$queryRaw<Array<{ c: number }>>`
          SELECT COUNT(*)::int as c FROM pixel_events WHERE "organizationId" = ${ORG_ID}
        `
          .then((r) => { _allTimeEventsCount.set(ORG_ID, { count: r[0]?.c ?? 0, at: Date.now() }); })
          .catch(() => { /* no romper el dashboard si el refresh falla */ })
          .finally(() => { _allTimeRefreshing.delete(ORG_ID); })
      );
    }
    const totalEventsAllTime = allTimeCached?.count ?? (eventCountResult[0]?.total || 0);

    // Change calculations
    const pctChange = (curr: number, prev: number) =>
      prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

    // Device breakdown with percentages
    const totalDeviceCount = deviceBreakdownResult.reduce((sum, d) => sum + d.count, 0);
    const deviceBreakdown = deviceBreakdownResult.map((d) => ({
      ...d,
      percentage: totalDeviceCount > 0 ? Math.round((d.count / totalDeviceCount) * 100) : 0,
    }));

    // Event types with percentages
    const totalEventCount = eventTypesResult.reduce((sum, e) => sum + e.count, 0);
    const eventTypes = eventTypesResult.map((e) => ({
      ...e,
      percentage: totalEventCount > 0 ? Math.round((e.count / totalEventCount) * 100) : 0,
    }));

    const filteredAttrBySource = attributionBySourceResult.filter(
      (a) => !isNonMarketingChannelSource(a.source)
    );

    // Attribution source with percentages
    const totalAttrRevenue = filteredAttrBySource.reduce((sum, a) => sum + (a.revenue || 0), 0);
    const attributionBySource = filteredAttrBySource.map((a) => ({
      ...a,
      percentage: totalAttrRevenue > 0 ? Math.round(((a.revenue || 0) / totalAttrRevenue) * 100) : 0,
    }));

    // Pages/session calc
    const pagesPerSession =
      kpisCurr.totalSessions > 0
        ? Math.round((kpisCurr.totalPageViews / kpisCurr.totalSessions) * 10) / 10
        : 0;

    const totalEvents = eventCountResult[0]?.total || 0;

    // Channel roles: gateway filter + fold fb → meta only (Role Map + Journey Intelligence).
    const channelRolesMerged = mergeChannelRolesByGroupKey(
      (channelRolesResult as Array<{
        source: string;
        firstTouch: number;
        assistTouch: number;
        lastTouch: number;
        soloTouch: number;
      }>).filter((r) => !isNonMarketingChannelSource(r.source))
    );

    // ── NEW: Process business KPIs ──
    const selectedModelData = attributionByModelResult.find((m) => m.model === selectedModel);
    const pixelRevenue = selectedModelData?.revenue || 0;
    const ordersAttributed = selectedModelData?.ordersAttributed || 0;
    const totalOrders = totalOrdersResult[0]?.total || 0;
    const webOrders = totalOrdersResult[0]?.webOrders || 0;
    const webRevenue = totalOrdersResult[0]?.webRevenue || 0;
    const marketplaceOrders = totalOrdersResult[0]?.marketplaceOrders || 0;
    const marketplaceRevenue = totalOrdersResult[0]?.marketplaceRevenue || 0;
    const totalAdSpend = adSpendBySourceResult.reduce((sum, s) => sum + (s.spend || 0), 0);
    // Attribution rate uses web-only orders (marketplace orders can't be pixel-tracked)
    const attributionRate = webOrders > 0 ? Math.round((ordersAttributed / webOrders) * 100) : 0;
    const aov = ordersAttributed > 0 ? Math.round(pixelRevenue / ordersAttributed) : 0;

    // ── ROAS calculation: per-day coverage scaling ──
    // Instead of a single uniform coverage ratio (which is distorted when some
    // days have 0% and others 98% coverage), we compute an "effective coverage"
    // using only days where the pixel was active (attributedOrders > 0).
    // This avoids pre-pixel-deployment days from dragging down the ratio.
    const perDayCoverage = (perDayCoverageResult as Array<{ day: string; totalOrders: number; attributedOrders: number }>);
    const activeDays = perDayCoverage.filter(d => d.attributedOrders > 0);
    const effectiveTotalOrders = activeDays.reduce((s, d) => s + d.totalOrders, 0);
    const effectiveAttributedOrders = activeDays.reduce((s, d) => s + d.attributedOrders, 0);
    const coverageRatio = effectiveTotalOrders > 0 ? effectiveAttributedOrders / effectiveTotalOrders : 0;
    const projectedRevenue = coverageRatio > 0 ? pixelRevenue / coverageRatio : 0;
    const pixelRoasRaw = totalAdSpend > 0 ? Math.round((pixelRevenue / totalAdSpend) * 100) / 100 : 0;
    const pixelRoas = totalAdSpend > 0 ? Math.round((projectedRevenue / totalAdSpend) * 100) / 100 : 0;

    const prevAttr = prevAttrRevenueResult[0];
    const prevPixelRevenue = prevAttr?.revenue || 0;
    const prevOrdersAttr = prevAttr?.ordersAttributed || 0;
    const prevRoas = totalAdSpend > 0 ? (prevPixelRevenue / totalAdSpend) : 0;

    // ── Manual channel spend (S60) ──
    // Para canales sin integracion (TV, omnichannel, etc) el cliente puede
    // cargar inversion manual con un rango fromDate/toDate. Aca prorrateamos
    // el monto segun el overlap con el rango query del dashboard.
    const manualSpends = await prisma.manualChannelSpend.findMany({
      where: {
        organizationId: ORG_ID,
        fromDate: { lte: dateTo },
        toDate: { gte: dateFrom },
      },
    });
    const manualSpendByChannel = new Map<string, number>();
    for (const ms of manualSpends) {
      const totalDur = ms.toDate.getTime() - ms.fromDate.getTime();
      if (totalDur <= 0) continue;
      const overlapStart = Math.max(ms.fromDate.getTime(), dateFrom.getTime());
      const overlapEnd = Math.min(ms.toDate.getTime(), dateTo.getTime());
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const prorated = (overlap / totalDur) * Number(ms.amount);
      const current = manualSpendByChannel.get(ms.channel) || 0;
      manualSpendByChannel.set(ms.channel, current + prorated);
    }

    // ── NEW: Build channelRoas (merge pixel attribution + platform metrics + manual spend) ──
    const adSpendMap = new Map(adSpendBySourceResult.map((s) => [s.source, s]));
    const channelRoas = attributionBySource.map((ch) => {
      const platform = adSpendMap.get(ch.source) || { spend: 0, platformConversions: 0, platformRevenue: 0 };
      const manualSpend = manualSpendByChannel.get(ch.source) || 0;
      const chSpend = (platform.spend || 0) + manualSpend;
      // Scale channel revenue by overall attribution coverage
      const chProjectedRevenue = coverageRatio > 0 ? (ch.revenue || 0) / coverageRatio : 0;
      return {
        source: ch.source,
        orders: ch.orders,
        pixelRevenue: ch.revenue || 0,
        projectedRevenue: Math.round(chProjectedRevenue),
        platformRevenue: platform.platformRevenue || 0,
        spend: chSpend,
        platformSpend: platform.spend || 0,
        manualSpend: manualSpend,
        platformConversions: platform.platformConversions || 0,
        pixelRoas: chSpend > 0 ? Math.round((chProjectedRevenue / chSpend) * 100) / 100 : 0,
        pixelRoasRaw: chSpend > 0 ? Math.round(((ch.revenue || 0) / chSpend) * 100) / 100 : 0,
        platformRoas: chSpend > 0 ? Math.round(((platform.platformRevenue || 0) / chSpend) * 100) / 100 : 0,
        diffPercent: (platform.platformRevenue || 0) > 0 && chProjectedRevenue > 0
          ? Math.round(((chProjectedRevenue - (platform.platformRevenue || 0)) / (platform.platformRevenue || 0)) * 100)
          : null,
      };
    });

    // ── Funnel from NitroPixel (S60 EXT — decision producto) ──
    // Steps 1–4: visitors UNICOS por etapa desde rollup HLL (webhook-filtrado).
    //   Visitas       → PAGE_VIEW
    //   Vio Producto  → VIEW_PRODUCT
    //   Carrito       → ADD_TO_CART
    //   Checkout      → INITIATE_CHECKOUT o CHECKOUT_SHIPPING
    // Compra: órdenes web atribuidas (misma métrica que businessKpis.ordersAttributed).
    // Ver DATA_COHERENCE.md Regla 5 — nunca eventos PURCHASE sueltos en el último step.
    // PERF + FIX "Hoy" (2026-06-17): las etapas del funnel salían SOLO del rollup
    // `pixel_daily_aggregates`, que queda stale/parcial para el/los día(s) reciente(s)
    // (el cron de refresh corre cada 2h y el día AR en curso es SIEMPRE parcial).
    // Resultado: al filtrar por "Hoy" las etapas daban 0 mientras la compra (órdenes
    // web atribuidas, en vivo) daba >0 → "el funnel muestra solo las compras". El
    // endpoint dedicado /api/metrics/pixel/funnel ya usaba getFunnelStages (live-merge
    // rollup+crudo); este card (NitroPixel "Activo Vivo" + dashboard) había quedado
    // afuera. Ahora usa el MISMO helper → números coherentes entre ambas vistas.
    const fRow = await getFunnelStages(ORG_ID, dateFrom, dateTo);
    const funnel = {
      pageView: fRow.pageView || 0,
      viewProduct: fRow.viewProduct || 0,
      addToCart: fRow.addToCart || 0,
      checkoutStart: fRow.checkoutStart || 0,
      purchase: ordersAttributed,
    };

    // ── NEW: Daily revenue merged with daily spend ──
    const dailySpendResult = await prisma.$queryRaw`
      SELECT
        TO_CHAR(amd.date, 'YYYY-MM-DD') as day,
        SUM(amd.spend)::float as spend
      FROM ad_metrics_daily amd
      WHERE amd."organizationId" = ${ORG_ID}
        AND amd.date >= ${dateFrom}::date
        AND amd.date <= ${dateTo}::date
      GROUP BY 1
    ` as Array<{ day: string; spend: number }>;
    const spendByDay = new Map(dailySpendResult.map((d) => [d.day, d.spend]));
    const dailyRevenue = dailyRevenueResult.map((d) => {
      const daySpend = spendByDay.get(d.day) || 0;
      return {
        ...d,
        spend: daySpend,
        roas: daySpend > 0 ? Math.round((d.revenue / daySpend) * 100) / 100 : 0,
      };
    });

    // ── Daily channel breakdown (for trend table) ──
    const dailyChRevenue = dailyChannelRevenueResult as Array<{ day: string; source: string; orders: number; revenue: number }>;
    const dailyChSpend = dailyChannelSpendResult as Array<{ day: string; source: string; spend: number }>;
    const visitorsMap = new Map((dailyVisitorsResult as Array<{ day: string; visitors: number }>).map(d => [d.day, d.visitors]));

    // Build day → source → { revenue, orders, spend }
    const dayChannelMap = new Map<string, Map<string, { revenue: number; orders: number; spend: number }>>();
    for (const row of dailyChRevenue) {
      if (!dayChannelMap.has(row.day)) dayChannelMap.set(row.day, new Map());
      const ch = dayChannelMap.get(row.day)!;
      const existing = ch.get(row.source) || { revenue: 0, orders: 0, spend: 0 };
      existing.revenue += row.revenue || 0;
      existing.orders += row.orders || 0;
      ch.set(row.source, existing);
    }
    for (const row of dailyChSpend) {
      if (!dayChannelMap.has(row.day)) dayChannelMap.set(row.day, new Map());
      const ch = dayChannelMap.get(row.day)!;
      const existing = ch.get(row.source) || { revenue: 0, orders: 0, spend: 0 };
      existing.spend += row.spend || 0;
      ch.set(row.source, existing);
    }

    const dailyChannelBreakdown = Array.from(dayChannelMap.entries())
      .sort(([a], [b]) => b.localeCompare(a)) // newest first
      .map(([day, channelMap]) => {
        const channels = Array.from(channelMap.entries())
          .map(([source, data]) => ({
            source,
            revenue: Math.round(data.revenue * 100) / 100,
            orders: data.orders,
            spend: Math.round(data.spend * 100) / 100,
            roas: data.spend > 0 ? Math.round((data.revenue / data.spend) * 100) / 100 : 0,
          }))
          .sort((a, b) => b.revenue - a.revenue);

        const totalRevenue = channels.reduce((s, c) => s + c.revenue, 0);
        const totalSpend = channels.reduce((s, c) => s + c.spend, 0);
        return {
          day,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalOrders: channels.reduce((s, c) => s + c.orders, 0),
          totalSpend: Math.round(totalSpend * 100) / 100,
          totalRoas: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : 0,
          visitors: visitorsMap.get(day) || 0,
          channels,
        };
      });

    // ── NEW: Pixel health ──
    const clickCov = clickIdCoverageResult[0];
    // Pixel age: days since first event (for contextualizing conversion lag)
    const firstEventDate = ls?.lastEventAt ? new Date(ls.lastEventAt) : null;
    // Use the earliest event timestamp from the liveStatus query
    const pixelAgeDays = perDayCoverage.length > 0
      ? Math.floor((Date.now() - new Date(perDayCoverage.find(d => d.attributedOrders > 0)?.day || Date.now()).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const pixelHealth = {
      attributionRate,
      clickCoverage: {
        clickIdRate: (clickCov?.total || 0) > 0 ? Math.round(((clickCov?.withClickId || 0) / clickCov.total) * 100) : 0,
        total: clickCov?.total || 0,
        withClickId: clickCov?.withClickId || 0,
      },
      eventsInPeriod: totalEvents,
      pixelAgeDays,
    };

    // ── NEW: Recent journeys ──
    const recentJourneys = recentJourneysResult.map((j) => {
      const rawTouchpoints = Array.isArray(j.touchpoints)
        ? j.touchpoints
        : typeof j.touchpoints === "string"
          ? JSON.parse(j.touchpoints)
          : j.touchpoints || [];
      return {
        ...j,
        orderDate: new Date(j.orderDate).toISOString(),
        touchpoints: filterMarketingTouchpoints(rawTouchpoints),
      };
    });

    const response = {
      liveStatus: {
        status,
        lastEventAt: lastEventAt ? new Date(lastEventAt).toISOString() : null,
        totalEvents: totalEventsAllTime,
        lastHourEvents: ls?.lastHourEvents || 0,
      },

      kpis: {
        totalVisitors: kpisCurr.totalVisitors,
        totalSessions: kpisCurr.totalSessions,
        totalPageViews: kpisCurr.totalPageViews,
        identifiedVisitors: kpisCurr.identifiedVisitors,
        cartVisitors: kpisCurr.cartVisitors,
        purchaseVisitors: kpisCurr.purchaseVisitors,
        pagesPerSession,
        daysInPeriod,
        changes: {
          visitors: pctChange(kpisCurr.totalVisitors, kpisPrev.totalVisitors),
          sessions: pctChange(kpisCurr.totalSessions, kpisPrev.totalSessions),
          pageViews: pctChange(kpisCurr.totalPageViews, kpisPrev.totalPageViews),
        },
      },

      // ── NEW: Business-focused KPIs ──
      businessKpis: {
        pixelRevenue,
        projectedRevenue: Math.round(projectedRevenue),
        pixelRoas,
        pixelRoasRaw,
        ordersAttributed,
        attributionRate,
        aov,
        totalAdSpend,
        totalOrders,
        webOrders,
        webRevenue: Math.round(webRevenue),
        marketplaceOrders,
        marketplaceRevenue: Math.round(marketplaceRevenue),
        changes: {
          pixelRevenue: pctChange(pixelRevenue, prevPixelRevenue),
          ordersAttributed: pctChange(ordersAttributed, prevOrdersAttr),
          pixelRoas: pctChange(pixelRoas * 100, prevRoas * 100),
        },
      },
      channelRoas,
      perDayCoverage: perDayCoverage.map(d => ({
        ...d,
        coverage: d.totalOrders > 0 ? Math.round((d.attributedOrders / d.totalOrders) * 100) : 0,
      })),
      funnel,
      dailyRevenue,
      dailyChannelBreakdown,
      recentJourneys,
      channelRoles: channelRolesMerged,
      pixelHealth,

      // ── Existing fields (unchanged) ──
      dailyVisitors: dailyVisitorsResult,
      deviceBreakdown,
      eventTypes,
      popularPages: popularPagesResult,

      // ── Conversion Rates data (100% NitroPixel + VTEX orders) ──
      conversionRates: (() => {
        // CR by Channel — UNIFICADO con funnel (S60 EXT-2): same query, same first-touch logic.
        // S60 EXT-2 BIS: normalizar source canonical en ambos lados (CTE + attributionBySource)
        // para que el JOIN funcione. Filtrar sources con caracteres invalidos (clickIds mal).

        const pixelVisitorsBySource = visitorsBySourceResult as Array<{ source: string; visitors: number; purchases: number }>;

        const isValidConversionSource = (s: string): boolean => {
          if (!s || s.length === 0) return false;
          return /^[a-z0-9_\-\.]+$/i.test(s);
        };

        // Construir attrMap con keys canonicalizadas — sumar revenue si hay aliases
        const attrMap = new Map<string, { revenue: number; orders: number }>();
        for (const ch of attributionBySource) {
          const key = canonicalMarketingSource(ch.source);
          const existing = attrMap.get(key);
          attrMap.set(key, {
            revenue: (existing?.revenue || 0) + (ch.revenue || 0),
            orders: (existing?.orders || 0) + (ch.orders || 0),
          });
        }

        const channelMap = new Map<string, { source: string; visitors: number; purchases: number; revenue: number }>();
        for (const vs of pixelVisitorsBySource) {
          if (vs.visitors <= 5) continue; // skip tiny sources
          if (isNonMarketingChannelSource(vs.source)) continue;
          const key = canonicalMarketingSource(vs.source);
          if (isNonMarketingChannelSource(key)) continue;
          if (!isValidConversionSource(key)) continue;
          const existing = channelMap.get(key);
          const attr = attrMap.get(key);
          // Sumar visitors+purchases si hay aliases (ej: fb + meta → meta)
          if (existing) {
            existing.visitors += vs.visitors;
            existing.purchases += vs.purchases;
          } else {
            channelMap.set(key, {
              source: key,
              visitors: vs.visitors,
              purchases: vs.purchases,
              revenue: attr?.revenue || 0,
            });
          }
        }
        const byChannel = Array.from(channelMap.values())
          .map(ch => ({ ...ch, cr: ch.visitors > 0 ? Math.round((ch.purchases / ch.visitors) * 10000) / 100 : 0 }))
          .sort((a, b) => b.visitors - a.visitors);

        // CR by Device: pixel visitors (deviceBreakdown from query #5) + pixel-attributed orders by device (query #24)
        // Both use the same device naming from pixel (Mobile, Desktop, etc.)
        const deviceVisitorMap = new Map(deviceBreakdown.map(d => [(d as any).device?.toLowerCase(), (d as any).count || 0]));
        const byDevice = (ordersByDeviceResult as Array<{ device: string; orders: number; revenue: number }>).map(d => {
          const visitors = deviceVisitorMap.get(d.device?.toLowerCase()) || 0;
          return {
            device: d.device,
            visitors,
            orders: d.orders,
            revenue: d.revenue || 0,
            cr: visitors > 0 ? Math.round((d.orders / visitors) * 10000) / 100 : 0,
          };
        });

        // Merge product viewers (pixel) + product purchases (VTEX) by externalId
        const viewers = productViewersResult as Array<{ productExternalId: string; viewers: number }>;
        const purchases = productPurchasesResult as Array<{ productExternalId: string; productName: string; category: string; brand: string; orders: number; units: number; revenue: number }>;
        const viewerMap = new Map(viewers.map(v => [v.productExternalId, v.viewers]));

        // Sesion 22: excluir productos con 0 visitantes del pixel.
        // Si un producto tiene ventas pero 0 vistas del pixel, significa
        // que la compra vino de un canal no trackeado (directo al checkout,
        // link externo, etc.) — el ratio 0 visits / 1 sale es incoherente
        // como CR y distorsiona el promedio por categoria/marca.
        const products = purchases
          .map(p => {
            const pViewers = viewerMap.get(p.productExternalId) || 0;
            return {
              ...p,
              viewers: pViewers,
              cr: pViewers > 0 ? Math.round((p.orders / pViewers) * 10000) / 100 : 0,
            };
          })
          .filter(p => p.viewers > 0);

        // Aggregate by category
        const catMap = new Map<string, { category: string; viewers: number; buyers: number; revenue: number }>();
        for (const p of products) {
          const existing = catMap.get(p.category) || { category: p.category, viewers: 0, buyers: 0, revenue: 0 };
          existing.viewers += p.viewers;
          existing.buyers += p.orders;
          existing.revenue += p.revenue || 0;
          catMap.set(p.category, existing);
        }
        const byCategory = Array.from(catMap.values())
          .map(c => ({ ...c, cr: c.viewers > 0 ? Math.round((c.buyers / c.viewers) * 10000) / 100 : 0 }))
          .sort((a, b) => b.revenue - a.revenue);

        // Aggregate by brand
        const brandMap = new Map<string, { brand: string; viewers: number; buyers: number; revenue: number }>();
        for (const p of products) {
          const existing = brandMap.get(p.brand) || { brand: p.brand, viewers: 0, buyers: 0, revenue: 0 };
          existing.viewers += p.viewers;
          existing.buyers += p.orders;
          existing.revenue += p.revenue || 0;
          brandMap.set(p.brand, existing);
        }
        const byBrand = Array.from(brandMap.values())
          .map(b => ({ ...b, cr: b.viewers > 0 ? Math.round((b.buyers / b.viewers) * 10000) / 100 : 0 }))
          .sort((a, b) => b.revenue - a.revenue);

        return { byChannel, byDevice, byCategory, byBrand, byProduct: products };
      })(),

      attribution: {
        byModel: attributionByModelResult,
        bySource: attributionBySource,
        byModelChannel: attributionByModelChannelResult,
        conversionLag: conversionLagResult,
      },

      // ── Journey Intelligence ──
      journeyIntelligence: (() => {
        const BUCKET_LABELS: Record<number, string> = { 1: "1 toque", 2: "2 toques", 3: "3 toques", 4: "4-6 toques", 5: "7+ toques" };
        const complexity = (journeyComplexityResult as Array<{ bucket: number; journeys: number; revenue: number; aov: number }>)
          .map(b => ({ label: BUCKET_LABELS[b.bucket] || `${b.bucket}`, ...b }));

        const totalJourneys = complexity.reduce((s, c) => s + c.journeys, 0);
        const singleTouch = complexity.find(c => c.bucket === 1);
        const multiTouch = complexity.filter(c => c.bucket > 1);
        const multiTouchJourneys = multiTouch.reduce((s, c) => s + c.journeys, 0);
        const multiTouchRevenue = multiTouch.reduce((s, c) => s + c.revenue, 0);
        const singleTouchRevenue = singleTouch?.revenue || 0;
        const multiTouchAOV = multiTouchJourneys > 0 ? Math.round(multiTouchRevenue / multiTouchJourneys) : 0;
        const singleTouchAOV = singleTouch ? Math.round(singleTouch.revenue / singleTouch.journeys) : 0;

        const pairs = (channelPairsResult as Array<{ first_channel: string; last_channel: string; journeys: number; revenue: number; aov: number }>)
          .filter(p => !isNonMarketingChannelSource(p.first_channel) && !isNonMarketingChannelSource(p.last_channel));

        // Conversion lag (already have conversionLagResult)
        const lag = conversionLagResult as Array<{ bucket: string; orders: number; revenue: number }>;

        return {
          complexity,
          totalJourneys,
          multiTouchPercent: totalJourneys > 0 ? Math.round((multiTouchJourneys / totalJourneys) * 100) : 0,
          multiTouchRevenue: Math.round(multiTouchRevenue),
          singleTouchRevenue: Math.round(singleTouchRevenue),
          multiTouchAOV,
          singleTouchAOV,
          aovLift: singleTouchAOV > 0 ? Math.round(((multiTouchAOV - singleTouchAOV) / singleTouchAOV) * 100) : 0,
          channelPairs: pairs,
          conversionLag: lag,
          channelRoles: channelRolesMerged.slice(0, 8),
        };
      })(),

      recentEvents: recentEventsResult.map((e) => ({
        ...e,
        timestamp: new Date(e.timestamp).toISOString(),
      })),

      pagination: {
        page,
        pageSize,
        totalCount: totalEvents,
        totalPages: Math.ceil(totalEvents / pageSize),
      },

      meta: {
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        daysInPeriod,
        timezone: "America/Argentina/Buenos_Aires",
        attributionModel: selectedModel,
        attributionWindowDays,
        nitroWeights,
        pixelGold: usePixelGold, // debug tanda 5: ¿el serve está leyendo el rollup?
        // Pixel coverage: when the pixel was first installed + effective CR date range
        pixelInstalledAt: pixelInstalledAt ? pixelInstalledAt.toISOString() : null,
        crDateFrom: crDateFrom.toISOString(),
        crDateAdjusted: pixelInstalledAt ? pixelInstalledAt.getTime() > dateFrom.getTime() : false,
      },
    };

    setCache("pixel", response, ...cacheKey);
    return response;
    }; // ── fin computeAndCache ──

    // SWR serve: hit (fresh o stale) → instant; stale → refresh background con lock; miss → bloqueante.
    const cached = getCachedSWR("pixel", ...cacheKey);
    if (cached?.data) {
      if (cached.isStale && tryAcquireRefreshLock("pixel", ...cacheKey)) {
        waitUntil(
          computeAndCache()
            .catch((e) => { console.error("[pixel] background refresh failed:", e); })
            .finally(() => releaseRefreshLock("pixel", ...cacheKey))
        );
      }
      return NextResponse.json(cached.data);
    }
    const freshResponse = await computeAndCache();
    return NextResponse.json(freshResponse);
  } catch (error) {
    console.error("[Pixel Metrics API] Error:", error);

    // Degradación graciosa: ante un fallo del handler devolvemos el shape vacío
    // (no un 500 que rompe la UI con cartel rojo). El error queda logueado arriba
    // (console.error) y en _error para diagnóstico. Reusa buildEmptyMockResponse.
    return NextResponse.json(
      { ...buildEmptyMockResponse(), _error: String(error).slice(0, 200) },
      { status: 200 }
    );
  }
}
