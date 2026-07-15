// ══════════════════════════════════════════════════════════════════════
// Bondly — Pulse API
// ──────────────────────────────────────────────────────────────────────
// GET /api/bondly/pulse
//
// Devuelve el "pulso" de Bondly: las 2 barras de timeline del overview
// (commerce data + behavioral data del NitroPixel) + stats live para
// el preview de señales.
//
// Response shape:
// {
//   ok: true,
//   commerce: {
//     firstOrderAt: ISO string | null,     // fecha primera orden registrada
//     lastOrderAt: ISO string | null,      // última orden recibida
//     daysCovered: number,                 // días entre first y now
//     totalOrders: number,
//     ordersLast24h: number,
//     ordersLast60min: number,
//     lastOrderMinutesAgo: number | null,
//     timeline30d: Array<{ day: string; count: number }>
//   },
//   pixel: {
//     firstEventAt: ISO string | null,     // primer evento trackeado
//     lastEventAt: ISO string | null,      // último evento
//     daysCovered: number,
//     totalEvents: number,
//     eventsLast24h: number,
//     eventsLast5min: number,              // "activity live"
//     activeVisitors5min: number,          // visitors distintos últimos 5 min
//     lastEventSecondsAgo: number | null,
//     timeline30d: Array<{ day: string; count: number }>
//   },
//   signalsPreview: Array<{                // top 3-5 señales live
//     id: string;
//     type: string;                        // PAGE_VIEW, ADD_TO_CART, etc.
//     visitorLabel: string;                // email abreviado o "Anónimo"
//     identified: boolean;
//     country: string | null;
//     deviceType: string | null;
//     pageUrl: string | null;
//     receivedAt: ISO string
//   }>
// }
// ══════════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import { ordersValidWhere } from "@/domains/orders";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60; // guard anti-504 (queries de LTV/cohortes pesadas)

const MS_MIN = 60 * 1000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

function obfuscateEmail(email: string | null): string {
  if (!email) return "Anónimo";
  const [local, domain] = email.split("@");
  if (!local || !domain) return "Anónimo";
  const visible = local.slice(0, Math.min(3, local.length));
  const dots = local.length > 3 ? "···" : "";
  return `${visible}${dots}@${domain}`;
}

export async function GET() {
  try {
    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const ago5m = new Date(now.getTime() - 5 * MS_MIN);
    const ago60m = new Date(now.getTime() - 60 * MS_MIN);
    const ago24h = new Date(now.getTime() - MS_DAY);
    const ago30d = new Date(now.getTime() - 30 * MS_DAY);
    // Guard anti-timestamps-basura: pixel_events tiene `timestamp` (event-time, client)
    // con datos corruptos (1978 / fechas futuras). Al filtrar por timestamp (indexado)
    // en vez de receivedAt, hay que acotar a una ventana sana: no antes de que existiera
    // el pixel (PIXEL_FLOOR) ni después de ahora (un evento no puede ocurrir en el futuro).
    // Sin esto, el Pulso mostraría "evento hace 0s" y "48 años de datos" por filas basura.
    const PIXEL_FLOOR = new Date("2024-01-01T00:00:00Z");

    // ═══ COMMERCE: primera orden, última, counts, timeline ═══
    // ═══ PIXEL:    primer evento, último, activity live ═══
    const [
      firstOrderRow,
      lastOrderRow,
      totalOrdersRow,
      ordersLast24hRow,
      ordersLast60mRow,
      commerceTimelineRows,
      firstEventRow,
      lastEventRow,
      totalEventsCount,
      eventsLast24hCount,
      eventsLast5mCount,
      activeVisitors5mRow,
      pixelTimelineRows,
      liveSignalsRaw,
    ] = await Promise.all([
      // Primera orden registrada (solo VTEX: MELI no trae info de cliente para Bondly)
      prisma.$queryRaw<Array<{ first_at: Date | null }>>`
        SELECT MIN("orderDate") AS first_at FROM orders
        WHERE "organizationId" = ${orgId}
          AND ${ordersValidWhere("")}
          AND "source" = 'VTEX'
          AND "customerId" IS NOT NULL
      `,
      // Última orden registrada
      prisma.$queryRaw<Array<{ last_at: Date | null }>>`
        SELECT MAX("orderDate") AS last_at FROM orders
        WHERE "organizationId" = ${orgId}
          AND ${ordersValidWhere("")}
          AND "source" = 'VTEX'
          AND "customerId" IS NOT NULL
      `,
      // Total órdenes válidas
      prisma.$queryRaw<Array<{ cnt: bigint }>>`
        SELECT COUNT(*)::bigint AS cnt FROM orders
        WHERE "organizationId" = ${orgId}
          AND ${ordersValidWhere("")}
          AND "source" = 'VTEX'
          AND "customerId" IS NOT NULL
      `,
      // Órdenes últimas 24h
      prisma.$queryRaw<Array<{ cnt: bigint }>>`
        SELECT COUNT(*)::bigint AS cnt FROM orders
        WHERE "organizationId" = ${orgId}
          AND ${ordersValidWhere("")}
          AND "source" = 'VTEX'
          AND "customerId" IS NOT NULL
          AND "orderDate" >= ${ago24h}
      `,
      // Órdenes últimos 60min
      prisma.$queryRaw<Array<{ cnt: bigint }>>`
        SELECT COUNT(*)::bigint AS cnt FROM orders
        WHERE "organizationId" = ${orgId}
          AND ${ordersValidWhere("")}
          AND "source" = 'VTEX'
          AND "customerId" IS NOT NULL
          AND "orderDate" >= ${ago60m}
      `,
      // Commerce timeline 30d
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "orderDate") AS day, COUNT(*)::bigint AS count
        FROM orders
        WHERE "organizationId" = ${orgId}
          AND ${ordersValidWhere("")}
          AND "source" = 'VTEX'
          AND "customerId" IS NOT NULL
          AND "orderDate" >= ${ago30d}
        GROUP BY day
        ORDER BY day ASC
      `,
      // PERF (todas las queries de pixel_events de abajo): filtrar/ordenar por `timestamp`
      // (indexado) en vez de `receivedAt` (SIN índice → full scan ~60-76s en orgs grandes,
      // colgaba el Pulso). timestamp ≈ receivedAt en operación normal (segundos) y es la
      // columna canónica de event-time del resto del dashboard. Mismo fix que install-status/
      // asset-stats (commit c8bfb3d). Las keys `receivedAt` del response se mantienen.
      // Primer evento pixel (acotado a PIXEL_FLOOR para no devolver basura de 1978)
      prisma.pixelEvent.findFirst({
        where: { organizationId: orgId, timestamp: { gte: PIXEL_FLOOR } },
        orderBy: { timestamp: "asc" },
        select: { timestamp: true },
      }),
      // Último evento pixel (acotado a <= now para no devolver fechas futuras basura)
      prisma.pixelEvent.findFirst({
        where: { organizationId: orgId, timestamp: { gte: PIXEL_FLOOR, lte: now } },
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
      }),
      // Total eventos pixel
      prisma.pixelEvent.count({ where: { organizationId: orgId } }),
      // Eventos 24h
      prisma.pixelEvent.count({
        where: { organizationId: orgId, timestamp: { gte: ago24h, lte: now } },
      }),
      // Eventos últimos 5 min (pulso vivo)
      prisma.pixelEvent.count({
        where: { organizationId: orgId, timestamp: { gte: ago5m, lte: now } },
      }),
      // Visitors distintos últimos 5 min
      prisma.$queryRaw<Array<{ cnt: bigint }>>`
        SELECT COUNT(DISTINCT "visitorId")::bigint AS cnt FROM pixel_events
        WHERE "organizationId" = ${orgId}
          AND "timestamp" >= ${ago5m} AND "timestamp" <= ${now}
      `,
      // Pixel timeline 30d
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "timestamp") AS day, COUNT(*)::bigint AS count
        FROM pixel_events
        WHERE "organizationId" = ${orgId}
          AND "timestamp" >= ${ago30d} AND "timestamp" <= ${now}
        GROUP BY day
        ORDER BY day ASC
      `,
      // Live signals: últimos 5 eventos de tipos "ricos" (no PAGE_VIEW plano)
      // que ocurrieron en última hora. Incluye VIEW_PRODUCT/ADD_TO_CART/IDENTIFY.
      prisma.pixelEvent.findMany({
        where: {
          organizationId: orgId,
          timestamp: { gte: ago60m, lte: now },
          type: { in: ["ADD_TO_CART", "VIEW_PRODUCT", "IDENTIFY", "PURCHASE", "PAGE_VIEW"] },
        },
        orderBy: { timestamp: "desc" },
        take: 5,
        select: {
          id: true,
          type: true,
          pageUrl: true,
          country: true,
          deviceType: true,
          timestamp: true,
          visitor: {
            select: { email: true },
          },
        },
      }),
    ]);

    // ═══ COMMERCE shaping ═══
    const firstOrderAt = firstOrderRow?.[0]?.first_at ?? null;
    const lastOrderAt = lastOrderRow?.[0]?.last_at ?? null;
    const totalOrders = Number(totalOrdersRow?.[0]?.cnt ?? 0);
    const ordersLast24h = Number(ordersLast24hRow?.[0]?.cnt ?? 0);
    const ordersLast60min = Number(ordersLast60mRow?.[0]?.cnt ?? 0);
    const commerceDaysCovered = firstOrderAt
      ? Math.max(1, Math.floor((now.getTime() - firstOrderAt.getTime()) / MS_DAY))
      : 0;
    const lastOrderMinutesAgo = lastOrderAt
      ? Math.max(0, Math.floor((now.getTime() - lastOrderAt.getTime()) / MS_MIN))
      : null;

    const commerceTimeline: Array<{ day: string; count: number }> = [];
    const commerceMap = new Map<string, number>();
    for (const row of commerceTimelineRows) {
      const key = row.day.toISOString().slice(0, 10);
      commerceMap.set(key, Number(row.count));
    }
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * MS_DAY);
      const key = d.toISOString().slice(0, 10);
      commerceTimeline.push({ day: key, count: commerceMap.get(key) ?? 0 });
    }

    // ═══ PIXEL shaping ═══
    const firstEventAt = firstEventRow?.timestamp ?? null;
    const lastEventAt = lastEventRow?.timestamp ?? null;
    const pixelDaysCovered = firstEventAt
      ? Math.max(1, Math.floor((now.getTime() - firstEventAt.getTime()) / MS_DAY))
      : 0;
    const lastEventSecondsAgo = lastEventAt
      ? Math.max(0, Math.floor((now.getTime() - lastEventAt.getTime()) / 1000))
      : null;
    const activeVisitors5min = Number(activeVisitors5mRow?.[0]?.cnt ?? 0);

    const pixelTimeline: Array<{ day: string; count: number }> = [];
    const pixelMap = new Map<string, number>();
    for (const row of pixelTimelineRows) {
      const key = row.day.toISOString().slice(0, 10);
      pixelMap.set(key, Number(row.count));
    }
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * MS_DAY);
      const key = d.toISOString().slice(0, 10);
      pixelTimeline.push({ day: key, count: pixelMap.get(key) ?? 0 });
    }

    // ═══ SIGNALS PREVIEW ═══
    const signalsPreview = liveSignalsRaw.map((e) => {
      const email = e.visitor?.email ?? null;
      return {
        id: e.id,
        type: e.type,
        visitorLabel: obfuscateEmail(email),
        identified: !!email,
        country: e.country,
        deviceType: e.deviceType,
        pageUrl: e.pageUrl,
        receivedAt: e.timestamp.toISOString(),
      };
    });

    return NextResponse.json({
      ok: true,
      commerce: {
        firstOrderAt: firstOrderAt?.toISOString() ?? null,
        lastOrderAt: lastOrderAt?.toISOString() ?? null,
        daysCovered: commerceDaysCovered,
        totalOrders,
        ordersLast24h,
        ordersLast60min,
        lastOrderMinutesAgo,
        timeline30d: commerceTimeline,
      },
      pixel: {
        firstEventAt: firstEventAt?.toISOString() ?? null,
        lastEventAt: lastEventAt?.toISOString() ?? null,
        daysCovered: pixelDaysCovered,
        totalEvents: totalEventsCount,
        eventsLast24h: eventsLast24hCount,
        eventsLast5min: eventsLast5mCount,
        activeVisitors5min,
        lastEventSecondsAgo,
        timeline30d: pixelTimeline,
      },
      signalsPreview,
    });
  } catch (err) {
    console.error("[bondly/pulse] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
