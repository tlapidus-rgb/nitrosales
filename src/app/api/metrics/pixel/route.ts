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

import { Prisma } from "@prisma/client";
import { createPixelTrace } from "@/lib/pixel/performance-trace";
import { ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { tryAcquireRefreshLock, releaseRefreshLock } from "@/lib/api-cache";
import { getSharedCachedSWR, setSharedCache } from "@/lib/api-cache-shared";
import { waitUntil } from "@vercel/functions";
import { ordersValidWhere } from "@/domains/orders";
import { goldModelRevenueSql } from "@/lib/pixel/gold-attribution-sql";
import { touchpointSourceSql } from "@/lib/pixel/touchpoint-source-sql";
import { touchpointChannelSql } from "@/lib/pixel/touchpoint-channel-sql";
import { LOAD_CHANNEL_RULES_SQL, rowToChannelRule, type ChannelRuleRow } from "@/lib/pixel/channel-rules-store";
import type { ChannelRule } from "@/lib/pixel/channel-rules";
import { buildPixelCacheKey } from "@/lib/pixel/cache-key";
import {
  filterMarketingTouchpoints,
  isNonMarketingChannelSource,
  mergeChannelRolesByGroupKey,
} from "@/lib/pixel/source-classification";

export const revalidate = 0;
// Techo duro de Vercel: headroom para rangos anchos sin que la función se mate
// antes de tiempo. La red de seguridad GLOBAL_TIMEOUT_MS (50s) corta antes.
// Subido 60→90 (2026-08-18, BP-PIXEL-TIMEOUT): con GLOBAL_TIMEOUT_MS a 50s la
// función necesita headroom sobre la race para serializar la respuesta (~878KB en
// 30d) sin que Vercel la mate. 90 < 300 (cap del proyecto) → se respeta.
export const maxDuration = 200;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PIXEL_CACHE_PREFIX = "pixel-v4";

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
// con maxDuration como techo duro de Vercel.
// Subido 25s→50s (2026-08-18, BP-PIXEL-TIMEOUT): para la org grande (El Mundo del
// Juguete) el compute de 7d/14d queda pegado a ~21-25s — varias queries desanidan
// pa.touchpoints EN VIVO (sólo 4 van por gold detrás de PIXEL_USE_GOLD). A 25s la
// race mataba el compute ANTES de terminar → devolvía el mock vacío → el warm-cache
// cacheaba ESE mock → analytics en 0 para TODO rango multi-día. A 50s (bajo
// maxDuration=90) el compute termina y devuelve data real, que el warm-cache sí
// cachea. 30d (~3-4x el trabajo) puede seguir sobre 50s → FOLLOW-UP: gatear esas
// queries unnest detrás de gold/rollup (BP-PIXEL-TIMEOUT #2). REQUIERE
// statement_timeout=50000 en client.ts (si no, PG mata la query a los 25s igual).
const GLOBAL_TIMEOUT_MS = 85000;

// Techo de seguridad, NO un recorte de producto — mismo criterio y mismo valor
// que en metrics/conversion (las dos pantallas tienen que coincidir). Estaba en
// 500 y recortaba en silencio: Arredo tiene 848 productos visitados en 30 días,
// así que la tabla mostraba 499 y parecía completa mientras tiraba 348.

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
  const trace = createPixelTrace();
  // Warm-cache: SIN race (BP-PIXEL-TIMEOUT, 2026-08-18). El cron warm-cache pre-siembra
  // el shared cache llamando este endpoint por cada org/rango, SECUENCIALMENTE. Si lo
  // raceáramos a 85s, para las orgs grandes (compute >85s) devolvería el mock y —peor—
  // el warm seguiría al próximo rango disparando otro compute en background → N computes
  // paralelos = thundering-herd que satura la DB (justo lo que el diseño secuencial del
  // warm-cache evita). Sin race, el warm ESPERA cada compute (~120s), lo escribe en el
  // cache y recién ahí sigue → secuencial, sin solaparse. Corre bajo maxDuration (<300s
  // cap real). Los clientes leen el cache ya sembrado → instantáneo. Sólo aplica al warm
  // (key interna WARM_CACHE_KEY), nunca a usuarios (que mantienen la red de 85s).
  const { searchParams } = new URL(request.url);
  const isWarm = !!searchParams.get("orgId") && searchParams.get("key") === WARM_CACHE_KEY;

  // Red de seguridad: corre el handler contra un timeout global; si el handler no
  // responde a tiempo, devuelve un mock vacío en vez de colgar (nunca 500/cuelgue).
  if (!isWarm && GLOBAL_TIMEOUT_MS > 0) {
    const realPromise = (async () => realHandler(request, trace))();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<NextResponse>((resolve) =>
      timer = setTimeout(() => {
        trace.snapshot("response_timeout");
        resolve(NextResponse.json({ ...buildEmptyMockResponse(), _timeoutMs: GLOBAL_TIMEOUT_MS }));
      }, GLOBAL_TIMEOUT_MS)
    );
    try {
      return await Promise.race([realPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
      trace.snapshot("response_finished");
    }
  }
  return realHandler(request, trace);
}

async function realHandler(request: NextRequest, trace: ReturnType<typeof createPixelTrace>): Promise<NextResponse> {
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
      orgId = await trace.run("getOrganizationId:L177", () => getOrganizationId());
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
    // ── Params que CAMBIAN la respuesta y por lo tanto son parte de la key ──
    // La regla y el porqué viven en src/lib/pixel/cache-key.ts (testeada).
    const modelParamRaw = (searchParams.get("model") || "").toUpperCase();
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));
    const cacheKey = buildPixelCacheKey({
      orgId,
      from: fromParam,
      to: toParam,
      model: modelParamRaw,
      page,
      pageSize,
    });

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
    // `page`/`pageSize` se calculan ARRIBA (son parte de la cache key); acá solo
    // se deriva el offset. No re-leer searchParams: si los dos lugares
    // divergieran, la key dejaría de describir la respuesta.
    const offset = (page - 1) * pageSize;

    const daysInPeriod = Math.max(1, Math.round(periodMs / MS_PER_DAY));

    // ── Org settings (model, weights, windows) ──
    const org = await trace.run("organization.findUnique:L235", () => prisma.organization.findUnique({
      where: { id: ORG_ID },
      select: { settings: true, createdAt: true },
    }));
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
    // `modelParamRaw` se lee arriba (es parte de la cache key). Si viene vacío
    // manda el default de la org, que en la key quedó como "orgdefault".
    const modelParam = modelParamRaw || settingsModel.toUpperCase();
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
    const isTodayRange = goldDayFrom === arDayStr(now) && goldDayTo === arDayStr(now);

    // ── Pixel install date: first rollup day for this org ──
    // pixel_events no tiene índice (organizationId, timestamp). El ORDER BY que
    // vivía acá ordenaba millones de filas antes de empezar las demás queries
    // (Arredo Hoy: ~9,5s hasta pintar datos). El rollup tiene PK por org/día y
    // representa el mismo inicio útil para las métricas de conversión.
    const pixelInstallResult = await trace.run("$queryRaw:L273", () => prisma.$queryRaw`
      SELECT MIN(day)::timestamp as "installedAt"
      FROM pixel_daily_aggregates
      WHERE "organizationId" = ${ORG_ID}
    `) as Array<{ installedAt: Date | null }>;
    const rollupInstalledAt = pixelInstallResult[0]?.installedAt || null;
    const pixelInstalledAt = rollupInstalledAt && org?.createdAt && rollupInstalledAt < org.createdAt
      ? org.createdAt
      : rollupInstalledAt;

    // crDateFrom = effective start for Conversion Rate queries
    // MAX(user-selected dateFrom, pixel install date) — so we never compare
    // pixel visitors against orders from before the pixel existed
    const crDateFrom = pixelInstalledAt && pixelInstalledAt.getTime() > dateFrom.getTime()
      ? pixelInstalledAt
      : dateFrom;

    // ── Canales en el serve (F4), detrás de flag propio, OFF por default ──
    // Con el flag OFF el comportamiento es IDÉNTICO (agrupa por source, como
    // siempre). Con el flag ON agrupa por el CANAL resuelto por channel_rule
    // (mismas reglas que el panel /pixel/canales). Es SOLO lectura: re-agrupa la
    // misma plata ya atribuida — NO toca attribution.ts. Resiliente: si
    // channel_rule no existe, cae a passthrough (source). Ver
    // canales-serve-integration.local.md.
    const usePixelChannels = process.env.PIXEL_USE_CHANNELS === "true";
    let channelRules: ChannelRule[] = [];
    if (usePixelChannels) {
      try {
        const rows = (await trace.run("$queryRawUnsafe:L301", () => prisma.$queryRawUnsafe(LOAD_CHANNEL_RULES_SQL, ORG_ID))) as ChannelRuleRow[];
        channelRules = rows.map(rowToChannelRule);
      } catch {
        channelRules = []; // tabla ausente → passthrough, no rompe el serve
      }
    }
    // source (default) o canal (flag ON) para un touchpoint. Misma firma → drop-in.
    const tpSourceOrChannel = (tp: string) =>
      usePixelChannels ? touchpointChannelSql(channelRules, tp) : touchpointSourceSql(tp);

    // Las 4 queries de atribución tienen una rama Gold que lee gold_attribution_source
    // (grain por SOURCE, sin medium → no se puede resolver el canal ahí). Cuando los
    // canales están ON, se PREFIERE la rama Bronze (touchpoint, que sí tiene
    // source/medium/campaign) para resolver el canal fiel al panel. Trade-off: esas
    // 4 queries pierden la perf del rollup Gold mientras los canales estén ON (el fix
    // "de fondo" perf+canal sería un rollup Gold por CANAL — pendiente).
    const useGoldSource = usePixelGold && !usePixelChannels;
    // FIX perf+canal (2026-08-23): rollup Gold POR CANAL. Con canales ON + Gold ON
    // las 4 queries de atribución leen gold_attribution_channel (materializado por
    // el cron refresh-gold-attribution-channel) en vez de escanear pa.touchpoints en
    // vivo (Bronze), que en 30d de la org grande se pasaba del timeout → mock en 0.
    // El total es idéntico (test de paridad). Gateado detrás de su PROPIO flag
    // (default OFF) para poder deployar el código ANTES de crear+backfillear la tabla
    // en prod, y prenderlo recién cuando el rollup ya tenga datos → cero riesgo de
    // leer una tabla vacía. Cuando esté todo, `PIXEL_USE_GOLD_CHANNEL=true`.
    const useGoldChannel =
      usePixelGold && usePixelChannels && process.env.PIXEL_USE_GOLD_CHANNEL === "true";

    type DailyRevenueRow = { day: string; revenue: number; orders: number };
    const loadDailyRevenue = async (): Promise<DailyRevenueRow[]> => {
      let goldRows: DailyRevenueRow[] | null = null;
      if (useGoldChannel) {
        goldRows = await trace.run("$queryRawUnsafe:dailyRevenueGoldChannel", () => prisma.$queryRawUnsafe(`
          SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day,
            ${goldModelRevenueSql(selectedModel, wFirst, wMiddle, wLast, (n) => `SUM(${n})`)}::float AS revenue,
            0::int AS orders
          FROM gold_attribution_channel
          WHERE organization_id = $1 AND day >= $2::date AND day <= $3::date
          GROUP BY day
          ORDER BY day
        `, ORG_ID, goldDayFrom, goldDayTo)) as DailyRevenueRow[];
      } else if (useGoldSource) {
        goldRows = await trace.run("$queryRawUnsafe:dailyRevenueGoldSource", () => prisma.$queryRawUnsafe(`
          SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day,
            ${goldModelRevenueSql(selectedModel, wFirst, wMiddle, wLast, (n) => `SUM(${n})`)}::float AS revenue,
            0::int AS orders
          FROM gold_attribution_source
          WHERE organization_id = $1 AND day >= $2::date AND day <= $3::date
          GROUP BY day
          ORDER BY day
        `, ORG_ID, goldDayFrom, goldDayTo)) as DailyRevenueRow[];
      }

      // Gold puede estar parcial durante el día aunque ya tenga alguna fila. Para
      // Hoy conservamos el cálculo live exacto; para rangos cerrados usamos Gold.
      if (goldRows && !isTodayRange) {
        return goldRows;
      }

      return trace.run("$queryRaw:dailyRevenueLive", () => prisma.$queryRaw`
        WITH selected_orders AS MATERIALIZED (
          SELECT o.id, o."orderDate"
          FROM orders o
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
        )
        SELECT
          TO_CHAR(DATE(o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') as day,
          SUM(pa."attributedValue")::float as revenue,
          COUNT(*)::int as orders
        FROM selected_orders o
        JOIN pixel_attributions pa
          ON pa."orderId" = o.id
          AND pa.model::text = ${selectedModel}
        GROUP BY 1
        ORDER BY 1
      `) as Promise<DailyRevenueRow[]>;
    };

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
      // ── Deferred dashboard queries ──
      visitorsBySourceResult,
      ordersByDeviceResult,
      productViewersResult,
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
      trace.run("$queryRaw:L374", () => prisma.$queryRaw`
        SELECT
          (SELECT MAX(timestamp) FROM pixel_events WHERE "organizationId" = ${ORG_ID}) as "lastEventAt",
          (SELECT COUNT(*)::int FROM pixel_events WHERE "organizationId" = ${ORG_ID} AND timestamp > NOW() - INTERVAL '1 hour') as "lastHourEvents"
      `) as Promise<Array<{ lastEventAt: Date | null; lastHourEvents: number }>>,

      // 2. Visitor KPIs (current period) — FASE 2: lee del rollup pixel_daily_aggregates
      //    (HLL ~0.8% error, pageviews exacto). Antes: COUNT(DISTINCT) sobre millones (~73s).
      //    Nota: el rollup es webhook-filtrado (humanos), así que estos KPIs ahora excluyen
      //    eventos de webhook (mejora de correctitud vs la versión cruda).
      trace.run("$queryRaw:L384", () => prisma.$queryRaw`
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
      `) as Promise<Array<{
        totalVisitors: number; totalSessions: number; totalPageViews: number;
        identifiedVisitors: number; cartVisitors: number; purchaseVisitors: number;
      }>>,

      // 3. Previous period KPIs (for comparison) — FASE 2: rollup
      trace.run("$queryRaw:L402", () => prisma.$queryRaw`
        SELECT
          COALESCE(hll_cardinality(hll_union_agg(visitors_hll)), 0)::int as "totalVisitors",
          COALESCE(hll_cardinality(hll_union_agg(sessions_hll)), 0)::int as "totalSessions",
          COALESCE(SUM(page_views), 0)::int as "totalPageViews"
        FROM pixel_daily_aggregates
        WHERE "organizationId" = ${ORG_ID}
          AND day >= (${prevFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${prevTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      `) as Promise<Array<{ totalVisitors: number; totalSessions: number; totalPageViews: number }>>,

      // 4. Daily visitors trend — FASE 2: rollup (una fila por día, sin merge)
      trace.run("$queryRaw:L414", () => prisma.$queryRaw`
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
      `) as Promise<Array<{ day: string; visitors: number; sessions: number; pageViews: number }>>,

      // 5. Device breakdown — rollup pixel_daily_device (HLL de visitantes por device).
      trace.run("$queryRaw:L428", () => prisma.$queryRaw`
        SELECT device, COALESCE(hll_cardinality(hll_union_agg(visitors_hll)), 0)::int as count
        FROM pixel_daily_device
        WHERE "organizationId" = ${ORG_ID}
          AND day >= (${dateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        GROUP BY 1
        ORDER BY count DESC
      `) as Promise<Array<{ device: string; count: number }>>,

      // 6. Event types breakdown — rollup pixel_daily_type (count aditivo exacto + HLL visitantes).
      trace.run("$queryRaw:L439", () => prisma.$queryRaw`
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
      `) as Promise<Array<{ type: string; count: number; uniqueVisitors: number }>>,

      // 7. Popular pages are loaded by /summary-tail after the KPI response.
      Promise.resolve([]) as Promise<Array<{ url: string; visitors: number; pageViews: number }>>,

      // 8. Attribution by model used to scan the same attributed orders again.
      // Analytics only needs the selected model for its KPI strip, which is derived
      // below from dailyRevenueResult (same contract, already in this batch).
      Promise.resolve([]) as Promise<Array<{
        model: string; ordersAttributed: number; revenue: number;
        avgValue: number; avgTouchpoints: number;
      }>>,

      // 9. Attribution by source (weighted for NITRO, simple for others)
      // NOTE: Filter by o."orderDate" (not pa."createdAt") so date filters work correctly
      (useGoldChannel
        ? trace.run("$queryRawUnsafe:L498", () => prisma.$queryRawUnsafe(`
            SELECT channel AS source,
              SUM(orders)::int as orders,
              ${goldModelRevenueSql(selectedModel, wFirst, wMiddle, wLast, (n) => `SUM(${n})`)}::float as revenue
            FROM gold_attribution_channel
            WHERE organization_id = $1 AND day >= $2::date AND day <= $3::date
            GROUP BY channel
            ORDER BY revenue DESC
            LIMIT 10
          `, ORG_ID, goldDayFrom, goldDayTo)) as Promise<Array<{ source: string; orders: number; revenue: number }>>
      : useGoldSource
        ? trace.run("$queryRawUnsafe:L509", () => prisma.$queryRawUnsafe(`
            SELECT source,
              SUM(orders)::int as orders,
              ${goldModelRevenueSql(selectedModel, wFirst, wMiddle, wLast, (n) => `SUM(${n})`)}::float as revenue
            FROM gold_attribution_source
            WHERE organization_id = $1 AND day >= $2::date AND day <= $3::date
            GROUP BY source
            ORDER BY revenue DESC
            LIMIT 10
          `, ORG_ID, goldDayFrom, goldDayTo)) as Promise<Array<{ source: string; orders: number; revenue: number }>>
      : selectedModel === "NITRO"
        ? trace.run("$queryRaw:L520", () => prisma.$queryRaw`
            SELECT
              ${tpSourceOrChannel("tp")} as source,
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
          `)
        : selectedModel === "LAST_CLICK"
        ? trace.run("$queryRaw:L552", () => prisma.$queryRaw`
            SELECT
              ${tpSourceOrChannel("tp")} as source,
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
          `)
        : selectedModel === "FIRST_CLICK"
        ? trace.run("$queryRaw:L575", () => prisma.$queryRaw`
            SELECT
              ${tpSourceOrChannel("tp")} as source,
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
          `)
        : trace.run("$queryRaw:L597", () => prisma.$queryRaw`
            SELECT
              ${tpSourceOrChannel("tp")} as source,
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
          `)
      ) as Promise<Array<{ source: string; orders: number; revenue: number }>>,

      // 10. Conversion lag is loaded after the KPI response from /lag-summary.
      // Negative lags are treated as 0 (same-session: pixel fires after VTEX order)
      Promise.resolve([]) as Promise<Array<{ bucket: string; orders: number; revenue: number }>>,

      // 11. Recent events
      trace.run("$queryRaw:L653", () => prisma.$queryRaw`
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
      `) as Promise<Array<{
        id: string; type: string; visitorId: string; pageUrl: string | null;
        deviceType: string | null; timestamp: Date; sessionId: string;
      }>>,

      // 12. Total event count for pagination — rollup (SUM aditivo exacto).
      trace.run("$queryRaw:L675", () => prisma.$queryRaw`
        SELECT COALESCE(SUM(total_events), 0)::int as total
        FROM pixel_daily_aggregates
        WHERE "organizationId" = ${ORG_ID}
          AND day >= (${dateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      `) as Promise<Array<{ total: number }>>,

      // ── NEW QUERIES FOR REDESIGNED DASHBOARD ──

      // 13. Total orders in period (for attribution rate)
      // Exclude cancelled/pending/zero-value AND marketplace orders (MercadoLibre)
      // Marketplace orders cannot be tracked by the pixel (checkout happens on ML)
      // NOTE: Marketplace detection uses trafficSource='Marketplace' OR source='MELI' OR channel='marketplace'
      //        because MELI-synced orders don't always have trafficSource set
      trace.run("$queryRaw:L690", () => prisma.$queryRaw`
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
      `) as Promise<Array<{ total: number; marketplaceOrders: number; marketplaceRevenue: number; webOrders: number; webRevenue: number }>>,

      // 14. Ad spend + platform metrics grouped by source (META/GOOGLE)
      trace.run("$queryRaw:L706", () => prisma.$queryRaw`
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
      `) as Promise<Array<{ source: string; spend: number; platformConversions: number; platformRevenue: number }>>,

      // 15. Recent journeys (all orders — LEFT JOIN attribution so unmatched orders also appear)
      // S60 EXT: agregar filtro de prefijos VTEX marketplace (FVG-, BPR-) que escapan
      // a los flags channel/trafficSource si el enrichment no los marco.
      trace.run("$queryRaw:L722", () => prisma.$queryRaw`
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
      `) as Promise<Array<{
        orderId: string; orderExternalId: string; revenue: number;
        touchpointCount: number; conversionLag: number | null;
        touchpoints: any; orderDate: Date; orderStatus: string;
        isAttributed: boolean;
      }>>,

      // 16. Click ID coverage (pixel health) — rollup (SUM aditivo exacto de events_with_clickid).
      trace.run("$queryRaw:L755", () => prisma.$queryRaw`
        SELECT
          COALESCE(SUM(events_with_clickid), 0)::int as "withClickId",
          COALESCE(SUM(total_events), 0)::int as total
        FROM pixel_daily_aggregates
        WHERE "organizationId" = ${ORG_ID}
          AND day >= (${dateFrom} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND day <= (${dateTo} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      `) as Promise<Array<{ withClickId: number; total: number }>>,

      // 17. Daily revenue from attributions (for revenue chart + KPI strip).
      // Gold already contains the same model components at org/day/channel grain.
      // Reading those few rows avoids re-joining the full attribution/order history
      // on every cold range change (Arredo 30d: ~11s for the Bronze query).
      // Order counts are filled from perDayCoverage below because a multi-touch
      // order can be present in more than one Gold channel bucket.
      loadDailyRevenue(),

      // 18. Previous-period comparisons are loaded by /summary-tail after KPIs.
      Promise.resolve([]) as Promise<Array<{ ordersAttributed: number; revenue: number }>>,

      // 19. Per-day coverage: total orders vs attributed orders per day
      //     Used for accurate ROAS scaling instead of uniform coverage ratio
      //     Excludes marketplace orders which can't be pixel-tracked:
      //       - MercadoLibre (source = MELI)
      //       - Marketplace flag (channel/trafficSource)
      //       - VTEX marketplaces que el seller publica via VTEX (Fravega, Banco Provincia)
      //         se identifican por prefijo en externalId (FVG-, BPR-)
      trace.run("$queryRaw:L814", () => prisma.$queryRaw`
        SELECT
          TO_CHAR(DATE(o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') as day,
          COUNT(DISTINCT o.id)::int as "totalOrders",
          COUNT(DISTINCT pa."orderId")::int as "attributedOrders"
        FROM orders o
        LEFT JOIN pixel_attributions pa
          ON pa."orderId" = o.id
         AND pa."organizationId" = ${ORG_ID}
         AND pa.model = CAST(${selectedModel} AS "AttributionModel")
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
      `) as Promise<Array<{ day: string; totalOrders: number; attributedOrders: number }>>,

      // 20. Per-day per-source pixel revenue (for daily trend table)
      // S60 EXT-2 BIS++: respeta el modelo seleccionado distribuyendo el revenue
      // segun la logica de cada modelo (last_click / first_click / linear / nitro).
      // Antes hardcodeaba LAST_CLICK lo cual hacia que cambiar de modelo no afecte
      // la tarjeta de revenue por canal por dia.
      (useGoldChannel
        ? trace.run("$queryRawUnsafe:L846", () => prisma.$queryRawUnsafe(`
            SELECT TO_CHAR(day, 'YYYY-MM-DD') as day, channel AS source, orders,
              ${goldModelRevenueSql(selectedModel, wFirst, wMiddle, wLast, (n) => n)}::float as revenue
            FROM gold_attribution_channel
            WHERE organization_id = $1 AND day >= $2::date AND day <= $3::date
            ORDER BY day DESC, revenue DESC
          `, ORG_ID, goldDayFrom, goldDayTo)) as Promise<Array<{ day: string; source: string; orders: number; revenue: number }>>
      : useGoldSource
        ? trace.run("$queryRawUnsafe:L854", () => prisma.$queryRawUnsafe(`
            SELECT TO_CHAR(day, 'YYYY-MM-DD') as day, source, orders,
              ${goldModelRevenueSql(selectedModel, wFirst, wMiddle, wLast, (n) => n)}::float as revenue
            FROM gold_attribution_source
            WHERE organization_id = $1 AND day >= $2::date AND day <= $3::date
            ORDER BY day DESC, revenue DESC
          `, ORG_ID, goldDayFrom, goldDayTo)) as Promise<Array<{ day: string; source: string; orders: number; revenue: number }>>
      : trace.run("$queryRaw:L861", () => prisma.$queryRaw`
        SELECT
          TO_CHAR(DATE(o."orderDate" AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') as day,
          ${tpSourceOrChannel("tp")} as source,
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
      `) as Promise<Array<{ day: string; source: string; orders: number; revenue: number }>>),

      // 21. Per-day per-platform ad spend (for daily trend table)
      trace.run("$queryRaw:L907", () => prisma.$queryRaw`
        SELECT
          TO_CHAR(amd.date, 'YYYY-MM-DD') as day,
          LOWER(amd.platform::text) as source,
          SUM(amd.spend)::float as spend
        FROM ad_metrics_daily amd
        WHERE amd."organizationId" = ${ORG_ID}
          AND amd.date >= ${dateFrom}::date
          AND amd.date <= ${dateTo}::date
        GROUP BY 1, 2
      `) as Promise<Array<{ day: string; source: string; spend: number }>>,

      // 22. Channel roles — first/assist/last touch counts per source across ALL journeys
      (useGoldChannel
        ? trace.run("$queryRawUnsafe:L921", () => prisma.$queryRawUnsafe(`
            SELECT channel AS source,
              SUM(first_touch_count)::int as "firstTouch",
              SUM(assist_touch_count)::int as "assistTouch",
              SUM(last_touch_count)::int as "lastTouch",
              SUM(solo_touch_count)::int as "soloTouch"
            FROM gold_attribution_channel
            WHERE organization_id = $1 AND day >= $2::date AND day <= $3::date
            GROUP BY channel
            ORDER BY "firstTouch" DESC
          `, ORG_ID, goldDayFrom, goldDayTo)) as Promise<Array<{ source: string; firstTouch: number; assistTouch: number; lastTouch: number; soloTouch: number }>>
      : useGoldSource
        ? trace.run("$queryRawUnsafe:L933", () => prisma.$queryRawUnsafe(`
            SELECT source,
              SUM(first_touch_count)::int as "firstTouch",
              SUM(assist_touch_count)::int as "assistTouch",
              SUM(last_touch_count)::int as "lastTouch",
              SUM(solo_touch_count)::int as "soloTouch"
            FROM gold_attribution_source
            WHERE organization_id = $1 AND day >= $2::date AND day <= $3::date
            GROUP BY source
            ORDER BY "firstTouch" DESC
          `, ORG_ID, goldDayFrom, goldDayTo)) as Promise<Array<{ source: string; firstTouch: number; assistTouch: number; lastTouch: number; soloTouch: number }>>
      : trace.run("$queryRaw:L944", () => prisma.$queryRaw`
        SELECT
          ${tpSourceOrChannel("tp")} as source,
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
      `) as Promise<Array<{ source: string; firstTouch: number; assistTouch: number; lastTouch: number; soloTouch: number }>>),

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
      // Se carga después del dashboard desde /api/metrics/pixel/rate-summary.
      // En 30 días este join tardaba 75s y bloqueaba todos los KPI aunque la tabla
      // de conversión está al final de la página.
      Promise.resolve([]) as Promise<Array<{ source: string; visitors: number; purchases: number }>>,

      // 24. Orders by device — device del visitante atribuido.
      // CRITICAL: pa."visitorId" guarda pv.id (cuid Prisma), NO pv.visitorId (UUID cookie).
      // Por eso JOIN debe ser pv.id = pa.visitorId.
      // PERF (2026-07-02): antes hacía un LATERAL a pixel_events (24M filas) POR CADA
      // orden atribuida → 33s+ en orgs con muchas atribuciones (Arredo, post-backfill)
      // → superaba el timeout de 25s y la página crasheaba en 30 días. Ahora usa
      // pv."deviceTypes"[1] (el device del visitante, que ya estaba como fallback) →
      // simple JOIN+agregación, sub-segundo. Uses crDateFrom (piso de cobertura del pixel).
      Promise.resolve([]) as Promise<Array<{ device: string; orders: number; revenue: number }>>,

      // Product conversion has its own endpoint (/api/metrics/conversion).
      Promise.resolve([]) as Promise<Array<{ productExternalId: string; viewers: number }>>,

      // (26. Product purchases se movió DESPUÉS del batch: ahora depende del
      //  mapa skuId⇄productId, que a su vez depende de los viewers. Ver abajo.)

      // ── Journey Intelligence queries (use crDateFrom for pixel coverage) ──

      // Journey Intelligence is disabled in the UI; do not pay two full JSONB scans.
      Promise.resolve([]) as Promise<Array<{ bucket: number; journeys: number; revenue: number; aov: number }>>,

      // 28. Top channel pairs (first touch → last touch for multi-touch journeys)
      Promise.resolve([]) as Promise<Array<{ first_channel: string; last_channel: string; journeys: number; revenue: number; aov: number }>>,

      // 29. Revenue por (modelo, canal) — para tarjeta "Comparacion de modelos"
      // Una sola pasada: descompone cada attribution en touchpoints y aplica
      // la formula de cada modelo para repartir el attributedValue por canal.
      // GROUP BY (model, source) → ~4 modelos × N canales rows.
      (useGoldChannel
        ? trace.run("$queryRawUnsafe:L1153", () => prisma.$queryRawUnsafe(`
            WITH src AS (
              SELECT channel AS source,
                SUM(nitro_single) nitro_single, SUM(nitro_first2) nitro_first2,
                SUM(nitro_last2) nitro_last2, SUM(nitro_first_n) nitro_first_n,
                SUM(nitro_last_n) nitro_last_n, SUM(nitro_middle_n) nitro_middle_n,
                SUM(last_click_revenue) last_click_revenue,
                SUM(first_click_revenue) first_click_revenue,
                SUM(linear_revenue) linear_revenue
              FROM gold_attribution_channel
              WHERE organization_id = $1 AND day >= $2::date AND day <= $3::date
              GROUP BY channel
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
          `, ORG_ID, goldDayFrom, goldDayTo)) as Promise<Array<{ model: string; source: string; revenue: number }>>
      : useGoldSource
        ? trace.run("$queryRawUnsafe:L1181", () => prisma.$queryRawUnsafe(`
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
          `, ORG_ID, goldDayFrom, goldDayTo)) as Promise<Array<{ model: string; source: string; revenue: number }>>
      : trace.run("$queryRaw:L1208", () => prisma.$queryRaw`
        SELECT
          pa.model::text as model,
          ${tpSourceOrChannel("tp")} as source,
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
      `) as Promise<Array<{ model: string; source: string; revenue: number }>>),
    ]);

    // Secondary panels use dedicated endpoints. Keep only the two reads required
    // to assemble the KPI response after the main parallel batch.
    const [manualSpends, dailySpendResult] = await Promise.all([
      (async () => {
        const manualSpends = await trace.run("manualChannelSpend.findMany:L1337", () => prisma.manualChannelSpend.findMany({
          where: {
            organizationId: ORG_ID,
            fromDate: { lte: dateTo },
            toDate: { gte: dateFrom },
          },
        }));
        return manualSpends;
      })(),
      (async () => {
        const dailySpendResult = await trace.run("$queryRaw:L1348", () => prisma.$queryRaw`
          SELECT
            TO_CHAR(amd.date, 'YYYY-MM-DD') as day,
            SUM(amd.spend)::float as spend
          FROM ad_metrics_daily amd
          WHERE amd."organizationId" = ${ORG_ID}
            AND amd.date >= ${dateFrom}::date
            AND amd.date <= ${dateTo}::date
          GROUP BY 1
        `) as Array<{ day: string; spend: number }>;
        return dailySpendResult;
      })(),
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
        trace.run("allTimeEventsCount", () => prisma.$queryRaw<Array<{ c: number }>>`
          SELECT COUNT(*)::int as c FROM pixel_events WHERE "organizationId" = ${ORG_ID}
        `
          .then((r) => { _allTimeEventsCount.set(ORG_ID, { count: r[0]?.c ?? 0, at: Date.now() }); })
          .catch(() => { /* no romper el dashboard si el refresh falla */ })
          .finally(() => { _allTimeRefreshing.delete(ORG_ID); }))
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

    // El rollup del día actual puede todavía no existir. Nunca mostrar "0 eventos"
    // si el status vivo ya contó actividad en la última hora; ese conteo indexado
    // es un piso correcto hasta el próximo refresh del rollup.
    const rolledUpEvents = eventCountResult[0]?.total || 0;
    const totalEvents = isTodayRange
      ? Math.max(rolledUpEvents, Number(ls?.lastHourEvents) || 0)
      : rolledUpEvents;

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
    // Gold is at day/channel grain, so its `orders` values are participations and
    // cannot be added across channels. Coverage has the exact distinct order count
    // at day grain; merge that count into the revenue series before computing KPIs.
    const perDayCoverage = (perDayCoverageResult as Array<{ day: string; totalOrders: number; attributedOrders: number }>);
    const attributedOrdersByDay = new Map(perDayCoverage.map((d) => [d.day, d.attributedOrders]));
    const dailyRevenueRows = dailyRevenueResult.map((row) => ({
      ...row,
      orders: attributedOrdersByDay.get(row.day) ?? row.orders,
    }));
    const pixelRevenue = dailyRevenueRows.reduce((sum, row) => sum + (row.revenue || 0), 0);
    const ordersAttributed = perDayCoverage.reduce((sum, row) => sum + (row.attributedOrders || 0), 0);
    const attributionByModel = [{
      model: selectedModel,
      ordersAttributed,
      revenue: pixelRevenue,
      avgValue: ordersAttributed > 0 ? pixelRevenue / ordersAttributed : 0,
      avgTouchpoints: 0,
    }];
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

    // The funnel has a dedicated endpoint and is loaded after the KPI response.
    const funnel = {
      pageView: 0,
      viewProduct: 0,
      addToCart: 0,
      checkoutStart: 0,
      purchase: ordersAttributed,
    };

    // ── NEW: Daily revenue merged with daily spend ──
    const spendByDay = new Map(dailySpendResult.map((d) => [d.day, d.spend]));
    const dailyRevenue = dailyRevenueRows.map((d) => {
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

      // Heavy conversion tables are fetched independently after the KPI response.
      conversionRates: { byChannel: [], byDevice: [], byCategory: [], byBrand: [], byProduct: [] },

      attribution: {
        byModel: attributionByModel,
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
        // Pixel coverage: when the pixel was first installed + effective CR date range
        pixelInstalledAt: pixelInstalledAt ? pixelInstalledAt.toISOString() : null,
        crDateFrom: crDateFrom.toISOString(),
        crDateAdjusted: pixelInstalledAt ? pixelInstalledAt.getTime() > dateFrom.getTime() : false,
      },
    };

    // Escribe en memoria Y en el caché compartido de Postgres. Sin esto, el
    // warm-cache calienta una instancia y el usuario cae en otra: la primera
    // carga del día paga los ~25s completos. Ver src/lib/api-cache-shared.ts.
    // Keep the seed promise alive until the shared write finishes, including
    // when waitUntil continues this computation after the request timeout.
    await trace.run("setSharedCache:L1959", () => setSharedCache(PIXEL_CACHE_PREFIX, response, ...cacheKey));
    return response;
    }; // ── fin computeAndCache ──

    // SWR serve: hit (fresh o stale) → instant; stale → refresh background con lock; miss → bloqueante.
    // Dos niveles: memoria de esta instancia, y si no, el caché compartido.
    // Warm-cache: NO servir stale (dispararía refresh en bg y el warm seguiría al
    // próximo rango → N refresh en paralelo = herd que satura la DB). En stale/miss el
    // warm cae al compute SÍNCRONO de abajo (isWarm ⇒ sin race) y mantiene su
    // secuencialidad. Usuarios: SWR normal (sirve stale al toque + refresh en bg).
    const isWarmCall = !!queryOrgId && queryKey === WARM_CACHE_KEY;
    const cached = await trace.run("getSharedCachedSWR:L1970", () => getSharedCachedSWR(PIXEL_CACHE_PREFIX, ...cacheKey));
    if (cached?.data && !(isWarmCall && cached.isStale)) {
      if (cached.isStale && tryAcquireRefreshLock(PIXEL_CACHE_PREFIX, ...cacheKey)) {
        waitUntil(
          computeAndCache()
            .catch((e) => { console.error("[pixel] background refresh failed:", e); })
            .finally(() => releaseRefreshLock(PIXEL_CACHE_PREFIX, ...cacheKey))
        );
      }
      return NextResponse.json(cached.data);
    }
    // ── CACHE MISS ────────────────────────────────────────────────────────────
    // BP-PIXEL-TIMEOUT (2026-08-18): el compute de las orgs grandes (El Mundo del
    // Juguete, Arredo) tarda >85s — más que la red de seguridad GLOBAL_TIMEOUT_MS.
    // Antes esto era `await computeAndCache()` a secas: la race global devolvía el
    // mock a los 85s y el compute quedaba COLGADO sin waitUntil → Vercel congelaba
    // la función al responder → setSharedCache NUNCA corría → cold-miss eterno (el
    // cache jamás se sembraba y cada request pagaba el timeout completo).
    // Ahora el compute se registra en waitUntil: aunque la race global devuelva el
    // mock antes, Fluid Compute mantiene viva la función post-response y el compute
    // termina (~120s) y ESCRIBE el cache compartido → el request siguiente (y el
    // warm-cache) leen data real instantánea. En orgs chicas (compute <85s) el
    // `await` devuelve data real directo, como antes. El lock evita thundering-herd:
    // si otro request ya está sembrando esta key, este devuelve el mock sin recomputar.
    if (tryAcquireRefreshLock(PIXEL_CACHE_PREFIX, ...cacheKey)) {
      const missCompute = computeAndCache()
        .catch((e) => {
          console.error("[pixel] cache-miss seed failed:", e);
          return buildEmptyMockResponse();
        })
        .finally(() => releaseRefreshLock(PIXEL_CACHE_PREFIX, ...cacheKey));
      waitUntil(missCompute);
      const freshResponse = await missCompute;
      return NextResponse.json(freshResponse);
    }
    return NextResponse.json(buildEmptyMockResponse());
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
