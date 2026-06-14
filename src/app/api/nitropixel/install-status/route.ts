// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/nitropixel/install-status
// ══════════════════════════════════════════════════════════════
// Chequea si la org tiene eventos del pixel. Si 0 eventos en la DB,
// asumimos que el pixel no está instalado y mostramos un banner.
//
// PERF (2026-06-14, BP-PERF-INSTALL-STATUS): este endpoint se dispara en el
// LAYOUT (todas las páginas). Antes hacía dos `COUNT(*)` ALL-TIME sobre
// pixel_events (~6M EMDJ / 11,6M Arredo) + pixel_visitors → 60-131s medidos en
// prod, reteniendo conexiones del pool (Vercel no cancela la query cuando el
// cliente abandona) y degradando TODO el producto (mismo patrón #1 de
// ERRORES_CLAUDE_NO_REPETIR). `isInstalled` solo necesita saber si hay ≥1 evento
// → `findFirst` (LIMIT 1, usa el índice). Los conteos salen del rollup
// `pixel_daily_aggregates` (SUM + HLL, ~decenas de filas) igual que asset-stats
// y /pixel → consistentes entre páginas y baratos. Si el rollup no existe/está
// vacío, los conteos caen a 0 (NUNCA se reintroduce el COUNT(*) all-time).
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  try {
    const orgId = await getOrganizationId();

    // ¿Instalado? Solo necesitamos saber si existe ≥1 evento → findFirst (LIMIT 1,
    // índice (organizationId, timestamp)). NO COUNT(*) all-time.
    const firstEvent = await prisma.pixelEvent.findFirst({
      where: { organizationId: orgId },
      select: { id: true },
    });
    const isInstalled = !!firstEvent;

    // Conteos para mostrar (no críticos): desde el rollup, baratos y consistentes
    // con el resto del dashboard. Excluyen eventos sintéticos de webhook (como el
    // resto de la Fase 2). Si el rollup no está poblado, quedan en 0.
    let eventsCount = 0;
    let visitorsCount = 0;
    if (isInstalled) {
      try {
        const agg = await prisma.$queryRaw<
          Array<{ events: bigint; visitors: number }>
        >`
          SELECT
            COALESCE(SUM(total_events), 0)::bigint AS events,
            COALESCE(hll_cardinality(hll_union_agg(visitors_hll)), 0)::int AS visitors
          FROM pixel_daily_aggregates
          WHERE "organizationId" = ${orgId}
        `;
        eventsCount = Number(agg[0]?.events ?? 0);
        visitorsCount = Number(agg[0]?.visitors ?? 0);
      } catch {
        // rollup ausente/sin hll → conteos en 0 (no reintroducir COUNT(*) all-time).
      }
    }

    // Último evento por `timestamp` (indexado) — ~ms.
    const lastEvent = await prisma.pixelEvent.findFirst({
      where: { organizationId: orgId },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });

    return NextResponse.json({
      ok: true,
      isInstalled,
      eventsCount,
      visitorsCount,
      lastEventAt: lastEvent?.timestamp?.toISOString() || null,
      orgId,
      snippetUrl: `${process.env.NEXTAUTH_URL || "https://app.nitrosales.ai"}/api/pixel/script?org=${orgId}`,
    });
  } catch (error: any) {
    console.error("[nitropixel/install-status] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
