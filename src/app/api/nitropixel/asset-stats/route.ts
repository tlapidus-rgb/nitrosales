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

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export async function GET() {
  try {
    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const ago24h = new Date(now.getTime() - MS_DAY);
    const ago7d = new Date(now.getTime() - 7 * MS_DAY);
    const ago30d = new Date(now.getTime() - 30 * MS_DAY);

    // Conteos paralelos
    const [
      totalEvents,
      totalVisitors,
      identifiedVisitors,
      eventsLast24h,
      eventsLast7d,
      firstEvent,
      attributedAgg,
      last10Events,
      timelineRows,
      topSourcesRows,
    ] = await Promise.all([
      prisma.pixelEvent.count({ where: { organizationId: orgId } }),
      prisma.pixelVisitor.count({ where: { organizationId: orgId } }),
      prisma.pixelVisitor.count({
        where: { organizationId: orgId, email: { not: null } },
      }),
      prisma.pixelEvent.count({
        where: { organizationId: orgId, receivedAt: { gte: ago24h } },
      }),
      prisma.pixelEvent.count({
        where: { organizationId: orgId, receivedAt: { gte: ago7d } },
      }),
      prisma.pixelEvent.findFirst({
        where: { organizationId: orgId },
        orderBy: { receivedAt: "asc" },
        select: { receivedAt: true },
      }),
      prisma.pixelAttribution.aggregate({
        where: { organizationId: orgId, model: "NITRO" },
        _sum: { attributedValue: true },
      }),
      prisma.pixelEvent.findMany({
        where: { organizationId: orgId },
        orderBy: { receivedAt: "desc" },
        take: 10,
        select: {
          id: true,
          type: true,
          pageUrl: true,
          receivedAt: true,
          country: true,
          deviceType: true,
        },
      }),
      // Eventos por día últimos 30 días (raw query para agrupar por fecha)
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "receivedAt") AS day, COUNT(*)::bigint AS count
        FROM pixel_events
        WHERE "organizationId" = ${orgId}
          AND "receivedAt" >= ${ago30d}
        GROUP BY day
        ORDER BY day ASC
      `,
      // Top sources de los últimos 7 días desde utmParams.source
      prisma.$queryRaw<Array<{ source: string; count: bigint }>>`
        SELECT COALESCE("utmParams"->>'source', 'direct') AS source, COUNT(*)::bigint AS count
        FROM pixel_events
        WHERE "organizationId" = ${orgId}
          AND "receivedAt" >= ${ago7d}
        GROUP BY source
        ORDER BY count DESC
        LIMIT 5
      `,
    ]);

    const attributedRevenue = Number(attributedAgg._sum.attributedValue ?? 0);

    const daysAlive = firstEvent
      ? Math.max(1, Math.floor((now.getTime() - firstEvent.receivedAt.getTime()) / MS_DAY))
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

    return NextResponse.json({
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
        firstSeenAt: firstEvent?.receivedAt ?? null,
      },
      last10Events: last10Events.map((e) => ({
        id: e.id,
        type: e.type,
        pageUrl: e.pageUrl,
        receivedAt: e.receivedAt,
        country: e.country,
        deviceType: e.deviceType,
      })),
      timeline,
      topSources,
    });
  } catch (err) {
    console.error("[nitropixel/asset-stats] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
