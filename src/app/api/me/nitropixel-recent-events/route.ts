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

    const events = await prisma.pixelEvent.findMany({
      where: { organizationId: orgId },
      orderBy: { receivedAt: "desc" },
      take: 10,
      select: {
        id: true,
        type: true,
        pageUrl: true,
        deviceType: true,
        country: true,
        receivedAt: true,
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
        receivedAt: e.receivedAt?.toISOString() || null,
      })),
    });
  } catch (err: any) {
    console.error("[me/nitropixel-recent-events] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
