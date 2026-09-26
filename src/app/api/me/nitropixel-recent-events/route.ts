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
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const orgId = await getOrganizationId();
    if (!orgId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    // No existe un índice (organizationId, timestamp). Tomar los últimos eventos
    // por cada tipo usa (organizationId, type, timestamp) y sólo ordena el conjunto
    // pequeño resultante. getOrganizationId también respeta la organización vista
    // por un admin, a diferencia de leer organizationId directo de la sesión.
    const events = await prisma.$queryRaw<Array<{
      id: string; type: string; pageUrl: string | null; deviceType: string | null;
      country: string | null; timestamp: Date;
    }>>`
      SELECT recent.id, recent.type, recent."pageUrl", recent."deviceType",
             recent.country, recent.timestamp
      FROM (
        SELECT DISTINCT type
        FROM pixel_daily_type
        WHERE "organizationId" = ${orgId}
      ) known_type
      CROSS JOIN LATERAL (
        SELECT pe.id, pe.type, pe."pageUrl", pe."deviceType", pe.country, pe.timestamp
        FROM pixel_events pe
        WHERE pe."organizationId" = ${orgId}
          AND pe.type = known_type.type
          AND pe.timestamp <= now()
        ORDER BY pe.timestamp DESC
        LIMIT 10
      ) recent
      ORDER BY recent.timestamp DESC
      LIMIT 10
    `;

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
