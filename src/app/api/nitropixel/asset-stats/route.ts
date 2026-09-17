// ══════════════════════════════════════════════════════════════
// NitroPixel Asset Stats API — Read-Only
// ──────────────────────────────────────────────────────────────
// GET /api/nitropixel/asset-stats
// Devuelve métricas para mostrar el "valor del activo digital":
//   - totalEvents, totalVisitors, identifiedVisitors
//   - eventsLast24h, eventsLast7d
//   - attributedRevenue (suma de attributedValue del modelo NITRO)
//   - daysAlive (días desde el primer evento)
//   - level (1..100, basado en eventos+ingresos)
//   - estimatedAssetValueUsd (valoración heurística del activo)
//   - last10Events (timeline reciente)
//   - timeline (eventos por día últimos 30 días)
//   - topSources (top 5 fuentes UTM)
//
// Read-only — NO modifica ningún dato. Seguro para consultas frecuentes.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { getSharedCachedSWR, setSharedCacheWithTtl } from "@/lib/api-cache-shared";
import { ADMIN_API_KEY } from "@/lib/admin-key";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// PERF (2026-06-15, CR-4): red de seguridad de tiempo. Tras portar las 3 queries
// crudas residuales (eventsLast24h/7d + topSources) a rollups, el endpoint corre
// en <1s; el cap evita que una conexión quede colgada si algo se degrada.
export const maxDuration = 30;

const MS_DAY = 24 * 60 * 60 * 1000;

// ── Heurística de nivel: 0-100 ──
function computeLevel(events: number, identified: number, revenue: number): number {
  // Cada componente aporta hasta ~33 puntos
  const eventScore = Math.min(33, Math.log10(Math.max(1, events)) * 11);
  const identifiedScore = Math.min(33, Math.log10(Math.max(1, identified + 1)) * 14);
  const revenueScore = Math.min(34, Math.log10(Math.max(1, revenue + 1)) * 9);
  return Math.round(eventScore + identifiedScore + revenueScore);
}

// ── Stages sci-fi/techy ──
function computeStage(level: number): {
  key: string;
  name: string;
  tagline: string;
  index: number;
  total: number;
} {
  const stages = [
    { key: "GENESIS", name: "Génesis", tagline: "El núcleo despierta" },
    { key: "AWAKENING", name: "Awakening", tagline: "Sinapsis conectándose" },
    { key: "SENTIENT", name: "Sentient", tagline: "Conciencia activa" },
    { key: "EVOLVED", name: "Evolved", tagline: "Inteligencia distribuida" },
    { key: "SINGULARITY", name: "Singularity", tagline: "Activo soberano" },
  ];
  let idx = 0;
  if (level >= 80) idx = 4;
  else if (level >= 60) idx = 3;
  else if (level >= 40) idx = 2;
  else if (level >= 20) idx = 1;
  return { ...stages[idx], index: idx, total: stages.length };
}

// ── Valoración heurística del activo en USD ──
// Combina ingresos atribuidos + cantidad de visitantes identificados (lista propia)
// + eventos (riqueza de comportamiento)
function estimateAssetValue(events: number, identified: number, revenue: number): number {
  // Cada visitante identificado ≈ USD 4 (lista propia first-party)
  // Cada USD de revenue atribuido ≈ USD 0.60 valor capitalizado
  // Cada 1000 eventos ≈ USD 6 (datos de comportamiento)
  const identifiedValue = identified * 4;
  const revenueValue = revenue * 0.6;
  const behaviorValue = (events / 1000) * 6;
  return Math.round(identifiedValue + revenueValue + behaviorValue);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const warmOrgId = searchParams.get("orgId");
    const warmKey = searchParams.get("key");
    const isWarmCall = !!warmOrgId && warmKey === ADMIN_API_KEY;
    const orgId = isWarmCall
      ? warmOrgId!
      : await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const cached = await getSharedCachedSWR<Record<string, unknown>>("nitropixel-asset-v2", orgId);
    if (cached?.data && !(isWarmCall && cached.isStale)) return NextResponse.json(cached.data);

    const now = new Date();
    const ago30d = new Date(now.getTime() - 30 * MS_DAY);

    // FIX (2026-06-17): "Días vivo" daba 17.603 (≈48 años) porque existe al menos un
    // pixel_event con timestamp basura (1978). El MIN(timestamp) lo tomaba como
    // "primer evento". Piso = createdAt de la org: el pixel no puede ser más viejo que
    // el tenant. Cualquier evento previo a eso es corrupto y se ignora. Fallback 2024.
    const orgRow = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { createdAt: true },
    });
    const pixelFloor = orgRow?.createdAt ?? new Date("2024-01-01T00:00:00.000Z");

    // Conteos paralelos
    const [
      rollupAgg,
      windowAgg,
      attributedAgg,
      last10Events,
      timelineRows,
      topSourcesRows,
    ] = await Promise.all([
      // PERF (2026-06-12, BP-PERF-ASSET): los totales all-time hacían COUNT(*) sobre
      // ~11,6M pixel_events + COUNT sobre ~932K pixel_visitors → ~37s en orgs grandes,
      // colgaba la página /nitropixel. Ahora salen del rollup `pixel_daily_aggregates`
      // (Fase 2): SUM de eventos + HLL de visitantes/identificados únicos. Es una lectura
      // de ~decenas de filas en vez de millones. Bonus: usa los MISMOS rollups que el
      // dashboard /pixel → los números quedan CONSISTENTES entre páginas. Excluye eventos
      // sintéticos de webhook (mejora de correctitud, igual que la Fase 2 del pixel route).
      prisma.$queryRaw<Array<{ total_events: bigint; visitors: number; identified: number; first_day: Date | null }>>`
        SELECT
          COALESCE(SUM(total_events), 0)::bigint AS total_events,
          COALESCE(hll_cardinality(hll_union_agg(visitors_hll)), 0)::int AS visitors,
          COALESCE(hll_cardinality(hll_union_agg(identify_visitors_hll)), 0)::int AS identified,
          MIN(day)::timestamp AS first_day
        FROM pixel_daily_aggregates
        WHERE "organizationId" = ${orgId}
      `,
      // PERF (2026-06-15, CR-4): eventsLast24h/7d desde el rollup
      // `pixel_daily_aggregates` (SUM de total_events por día AR) en vez de dos
      // `pixelEvent.count` sobre `pixel_events`. El count de 7d escaneaba cientos
      // de miles de filas (1-3s) y contaba eventos sintéticos de webhook; el rollup
      // lee ~7 filas, excluye webhook (igual que la Fase 2) y deja los números
      // consistentes con el resto del dashboard.
      //   - last24h = total_events del día AR de hoy.
      //   - last7d  = SUM(total_events) de los últimos 7 días AR (hoy y los 6 previos).
      prisma.$queryRaw<Array<{ last24h: bigint; last7d: bigint }>>`
        SELECT
          COALESCE(SUM(total_events) FILTER (
            WHERE day = (${now} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          ), 0)::bigint AS last24h,
          COALESCE(SUM(total_events), 0)::bigint AS last7d
        FROM pixel_daily_aggregates
        WHERE "organizationId" = ${orgId}
          AND day >= ((${now} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - INTERVAL '6 days')
      `,
      // El SUM histórico sobre pixel_attributions crecía sin límite. Gold ya
      // contiene exactamente el mismo total por día/source; LAST_CLICK asigna
      // cada orden a una sola source, por eso su suma no duplica journeys.
      prisma.$queryRawUnsafe<Array<{ attributed_revenue: number }>>(
        `SELECT COALESCE(SUM(last_click_revenue), 0)::float AS attributed_revenue
         FROM gold_attribution_source
         WHERE organization_id = $1`,
        orgId
      ),
      // No existe un índice (organizationId, timestamp). Pedir los últimos diez
      // eventos de toda la organización obligaba a Postgres a ordenar millones
      // de filas en una carga fría. pixel_events sí tiene el índice
      // (organizationId, type, timestamp): tomamos hasta diez por tipo conocido
      // en el rollup y recién entonces ordenamos ese conjunto pequeño.
      prisma.$queryRaw<Array<{
        id: string;
        type: string;
        pageUrl: string | null;
        timestamp: Date;
        country: string | null;
        deviceType: string | null;
      }>>`
        SELECT recent.id,
               recent.type,
               recent."pageUrl",
               recent.timestamp,
               recent.country,
               recent."deviceType"
        FROM (
          SELECT DISTINCT type
          FROM pixel_daily_type
          WHERE "organizationId" = ${orgId}
        ) known_type
        CROSS JOIN LATERAL (
          SELECT pe.id,
                 pe.type,
                 pe."pageUrl",
                 pe.timestamp,
                 pe.country,
                 pe."deviceType"
          FROM pixel_events pe
          WHERE pe."organizationId" = ${orgId}
            AND pe.type = known_type.type
          ORDER BY pe.timestamp DESC
          LIMIT 10
        ) recent
        ORDER BY recent.timestamp DESC
        LIMIT 10
      `,
      // Eventos por día últimos 30 días — PERF (2026-06-12): desde el rollup
      // `pixel_daily_aggregates` (day, total_events) en vez de date_trunc+COUNT sobre
      // ~1-2M eventos crudos (2,6s → ~10ms). Grano diario AR, consistente con los totales.
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT day::timestamp AS day, total_events::bigint AS count
        FROM pixel_daily_aggregates
        WHERE "organizationId" = ${orgId}
          AND day >= (${ago30d} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        ORDER BY day ASC
      `,
      // PERF (2026-06-15, CR-4): top fuentes de los últimos 7 días desde el rollup
      // `pixel_daily_source` (visitantes únicos PV por first-source/día, HLL) en vez
      // de `GROUP BY "utmParams"->>'source'` sobre `pixel_events` crudo (sin índice
      // funcional → 3-28s medido en prod, era el cuello de botella de /nitropixel).
      // Cambia la semántica a "visitantes por canal de PRIMER TOQUE" (more meaningful
      // y consistente con el funnel/dashboard) en vez de "eventos por source del
      // evento". El conteo es la cardinalidad HLL (aprox ~2%).
      prisma.$queryRaw<Array<{ source: string; count: bigint }>>`
        SELECT first_source AS source,
               COALESCE(hll_cardinality(hll_union_agg(pv_visitors_hll)), 0)::bigint AS count
        FROM pixel_daily_source
        WHERE "organizationId" = ${orgId}
          AND day >= ((${now} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - INTERVAL '6 days')
        GROUP BY first_source
        ORDER BY count DESC
        LIMIT 5
      `,
    ]);

    // Totales all-time desde el rollup (ver nota PERF arriba).
    const totalEvents = Number(rollupAgg[0]?.total_events ?? 0);
    const totalVisitors = Number(rollupAgg[0]?.visitors ?? 0);
    const identifiedVisitors = Number(rollupAgg[0]?.identified ?? 0);

    // Ventanas 24h/7d desde el rollup (ver nota PERF arriba).
    const eventsLast24h = Number(windowAgg[0]?.last24h ?? 0);
    const eventsLast7d = Number(windowAgg[0]?.last7d ?? 0);

    const attributedRevenue = Number(attributedAgg[0]?.attributed_revenue ?? 0);

    // El primer día del rollup evita otro ORDER BY sobre pixel_events sin índice
    // (organizationId, timestamp). Conservamos el piso de creación de la org.
    const rollupFirstDay = rollupAgg[0]?.first_day ?? null;
    const firstSeenAt = rollupFirstDay && rollupFirstDay >= pixelFloor
      ? rollupFirstDay
      : pixelFloor;
    const daysAlive = rollupFirstDay
      ? Math.max(1, Math.floor((now.getTime() - firstSeenAt.getTime()) / MS_DAY))
      : 0;

    const level = computeLevel(totalEvents, identifiedVisitors, attributedRevenue);
    const stage = computeStage(level);
    const estimatedAssetValueUsd = estimateAssetValue(totalEvents, identifiedVisitors, attributedRevenue);

    // Normalizar timeline (rellenar días sin eventos con 0)
    const timeline: Array<{ day: string; count: number }> = [];
    const timelineMap = new Map<string, number>();
    for (const row of timelineRows) {
      const key = row.day.toISOString().slice(0, 10);
      timelineMap.set(key, Number(row.count));
    }
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * MS_DAY);
      const key = d.toISOString().slice(0, 10);
      timeline.push({ day: key, count: timelineMap.get(key) ?? 0 });
    }

    const topSources = topSourcesRows.map((r) => ({
      source: r.source || "direct",
      count: Number(r.count),
    }));

    const payload = {
      ok: true,
      asset: {
        totalEvents,
        totalVisitors,
        identifiedVisitors,
        eventsLast24h,
        eventsLast7d,
        attributedRevenue,
        daysAlive,
        level,
        stage,
        estimatedAssetValueUsd,
        firstSeenAt: rollupFirstDay ? firstSeenAt : null,
      },
      last10Events: last10Events.map((e) => ({
        id: e.id,
        type: e.type,
        pageUrl: e.pageUrl,
        // Mantiene la key `receivedAt` del response (el frontend la usa en timeAgo);
        // ahora la alimenta `timestamp` (indexado). Mismo significado práctico.
        receivedAt: e.timestamp,
        country: e.country,
        deviceType: e.deviceType,
      })),
      timeline,
      topSources,
    };

    // La página refresca cada 20s. Compartir la respuesta durante ese intervalo
    // evita repetir siete lecturas al mismo tiempo en cada instancia fría.
    await setSharedCacheWithTtl("nitropixel-asset-v2", payload, 20_000, 5 * 60_000, orgId);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[nitropixel/asset-stats] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
