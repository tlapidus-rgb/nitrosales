// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/me/nitropixel-recent-events
// ══════════════════════════════════════════════════════════════
// Devuelve los últimos 10 eventos del pixel del cliente logueado.
// Usado por /settings/integraciones/nitropixel para mostrar tabla de
// "eventos recientes" como verificación visual de instalación.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions as any);
    const orgId = (session as any)?.user?.organizationId;
    if (!orgId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    // PERF: ordenar por `timestamp` (indexado) en vez de `receivedAt` (SIN índice).
    // Sobre orgs con millones de eventos, orderBy receivedAt hace full scan+sort (~60-76s)
    // y cuelga la tabla de eventos recientes. timestamp usa el índice. Mismo fix que
    // install-status / asset-stats (commit c8bfb3d). La key `receivedAt` del response se
    // mantiene (el frontend la usa); ahora la alimenta `timestamp` (mismo significado práctico).
    const events = await prisma.pixelEvent.findMany({
      // lte: now → no flota al tope un evento con `timestamp` futuro basura (data corrupta conocida).
      where: { organizationId: orgId, timestamp: { lte: new Date() } },
      orderBy: { timestamp: "desc" },
      take: 10,
      select: {
        id: true,
        type: true,
        pageUrl: true,
        deviceType: true,
        country: true,
        timestamp: true,
      },
    });

    return NextResponse.json({
      ok: true,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        pageUrl: e.pageUrl,
        deviceType: e.deviceType,
        country: e.country,
        receivedAt: e.timestamp?.toISOString() || null,
      })),
    });
  } catch (err: any) {
    console.error("[me/nitropixel-recent-events] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
