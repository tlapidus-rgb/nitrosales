// ══════════════════════════════════════════════════════════════
// Admin · Listado de Clientes (Organizations)
// ──────────────────────────────────────────────────────────────
// GET /api/admin/clientes
// Devuelve todas las organizations con stats lightweight para
// decidir a quién intervenir primero. Gateado por isInternalUser.
//
// Stats por org (queries lightweight, no recompute del NitroScore):
//   - users: cantidad de usuarios
//   - lastEventAt: último PixelEvent recibido
//   - events7d: eventos de los últimos 7 días
//   - identifiedVisitors: visitors con email
//   - totalVisitors: visitors totales
//   - health: derivado de lastEventAt + events7d (green/yellow/red)
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MS_DAY = 24 * 60 * 60 * 1000;

type Health = "green" | "yellow" | "red" | "gray";

interface OrgStats {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  users: number;
  lastEventAt: string | null;
  events7d: number;
  identifiedVisitors: number;
  totalVisitors: number;
  health: Health;
  healthLabel: string;
}

function deriveHealth(lastEventAt: Date | null, events7d: number): { health: Health; label: string } {
  if (!lastEventAt) return { health: "gray", label: "Sin eventos nunca" };
  const ageMs = Date.now() - lastEventAt.getTime();
  if (ageMs < 60 * 60 * 1000 && events7d > 0) return { health: "green", label: "Activo" };
  if (ageMs < 24 * 60 * 60 * 1000) return { health: "yellow", label: "Sin actividad reciente" };
  return { health: "red", label: "Caído (>24h)" };
}

export async function GET() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const since7d = new Date(Date.now() - 7 * MS_DAY);

    // 1. Todas las orgs base
    const orgs = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        createdAt: true,
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // 2. Stats por org en paralelo (read-only, lightweight)
    const stats: OrgStats[] = await Promise.all(
      orgs.map(async (org) => {
        const [lastEvent, events7d, identifiedVisitors, totalVisitors] = await Promise.all([
          prisma.pixelEvent.findFirst({
            where: { organizationId: org.id },
            orderBy: { receivedAt: "desc" },
            select: { receivedAt: true },
          }),
          prisma.pixelEvent.count({
            where: {
              organizationId: org.id,
              receivedAt: { gte: since7d },
            },
          }),
          prisma.pixelVisitor.count({
            where: {
              organizationId: org.id,
              email: { not: null },
            },
          }),
          prisma.pixelVisitor.count({
            where: { organizationId: org.id },
          }),
        ]);

        const health = deriveHealth(lastEvent?.receivedAt ?? null, events7d);

        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          plan: org.plan,
          createdAt: org.createdAt.toISOString(),
          users: org._count.users,
          lastEventAt: lastEvent?.receivedAt.toISOString() ?? null,
          events7d,
          identifiedVisitors,
          totalVisitors,
          health: health.health,
          healthLabel: health.label,
        };
      })
    );

    // Resumen agregado
    const summary = {
      totalOrgs: stats.length,
      green: stats.filter((s) => s.health === "green").length,
      yellow: stats.filter((s) => s.health === "yellow").length,
      red: stats.filter((s) => s.health === "red").length,
      gray: stats.filter((s) => s.health === "gray").length,
      totalEvents7d: stats.reduce((acc, s) => acc + s.events7d, 0),
      totalUsers: stats.reduce((acc, s) => acc + s.users, 0),
    };

    return NextResponse.json({
      ok: true,
      summary,
      clientes: stats,
      computedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[/api/admin/clientes]", e);
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
