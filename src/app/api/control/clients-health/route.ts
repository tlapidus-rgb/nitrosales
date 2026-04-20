// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/control/clients-health
// ══════════════════════════════════════════════════════════════
// Devuelve el listado de clientes (organizations) con un resumen de
// salud por plataforma conectada + usage + alertas. Solo isInternalUser.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

// Umbrales (minutos) por plataforma — si lastSyncAt es más viejo que
// esto, la conexión se considera "degradada".
const THRESHOLDS_MIN: Record<string, number> = {
  VTEX: 60 * 24,          // 1 día (webhooks en real-time + cron diario 3am)
  MERCADOLIBRE: 60 * 24,  // 1 día (idem)
  META_ADS: 60 * 24,      // 1 día (on-demand)
  GOOGLE_ADS: 60 * 24,    // 1 día (on-demand)
  GA4: 60 * 36,           // 36hs (cron diario 3am)
  GSC: 60 * 36,           // 36hs (cron diario 9am)
};

function minsAgo(d: Date | null | undefined): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 60000);
}

function classifyConnection(platform: string, status: string, lastSyncAt: Date | null, lastSyncError: string | null): "ok" | "warn" | "error" | "pending" {
  if (status === "PENDING") return "pending";
  if (status === "ERROR") return "error";
  if (lastSyncError) return "warn";
  const mins = minsAgo(lastSyncAt);
  if (mins === null) return "warn"; // nunca syncó
  const threshold = THRESHOLDS_MIN[platform] || 60 * 24;
  if (mins > threshold * 2) return "error";   // >2x umbral = crítico
  if (mins > threshold) return "warn";
  return "ok";
}

export async function GET() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 1. Orgs activas
    const orgs = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        createdAt: true,
        connections: {
          select: {
            platform: true,
            status: true,
            lastSyncAt: true,
            lastSuccessfulSyncAt: true,
            lastSyncError: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // 2. Por cada org: actividad reciente + usage
    const results = await Promise.all(
      orgs.map(async (org) => {
        // Login más reciente
        const lastLoginRow = await prisma.$queryRawUnsafe<Array<any>>(
          `SELECT MAX("createdAt") as "lastLogin"
           FROM "login_events" le
           JOIN "users" u ON u.id = le."userId"
           WHERE u."organizationId" = $1 AND le."success" = true`,
          org.id
        );
        const lastLogin = lastLoginRow[0]?.lastLogin || null;

        // Orders últimas 24hs (actividad)
        const orders24h = await prisma.order.count({
          where: {
            organizationId: org.id,
            createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
          },
        });

        // Pixel events últimas 24hs
        const pixel24h = await prisma.pixelEvent.count({
          where: {
            organizationId: org.id,
            receivedAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
          },
        });

        // User count
        const usersCount = await prisma.user.count({
          where: { organizationId: org.id },
        });

        // Conexiones clasificadas
        const connections = org.connections.map((c) => ({
          platform: c.platform,
          status: c.status,
          lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
          lastSuccessfulSyncAt: c.lastSuccessfulSyncAt ? c.lastSuccessfulSyncAt.toISOString() : null,
          lastSyncError: c.lastSyncError,
          health: classifyConnection(c.platform, c.status, c.lastSyncAt, c.lastSyncError),
          minsSinceSync: minsAgo(c.lastSyncAt),
        }));

        // Health global de la org (el peor de sus conexiones)
        let overall: "ok" | "warn" | "error" | "pending" = "ok";
        for (const c of connections) {
          if (c.health === "error") overall = "error";
          else if (c.health === "warn" && overall !== "error") overall = "warn";
          else if (c.health === "pending" && overall === "ok") overall = "pending";
        }
        if (connections.length === 0) overall = "pending";

        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          plan: org.plan,
          createdAt: org.createdAt.toISOString(),
          connections,
          overall,
          activity: {
            lastLogin: lastLogin ? new Date(lastLogin).toISOString() : null,
            minsSinceLogin: minsAgo(lastLogin ? new Date(lastLogin) : null),
            orders24h,
            pixel24h,
            usersCount,
          },
        };
      })
    );

    // Global summary (para pantalla Inicio)
    const summary = {
      totalClients: results.length,
      clientsOk: results.filter((r) => r.overall === "ok").length,
      clientsWarn: results.filter((r) => r.overall === "warn").length,
      clientsError: results.filter((r) => r.overall === "error").length,
      clientsPending: results.filter((r) => r.overall === "pending").length,
      totalConnections: results.reduce((a, r) => a + r.connections.length, 0),
      connectionsOk: results.reduce(
        (a, r) => a + r.connections.filter((c) => c.health === "ok").length,
        0
      ),
      connectionsWarn: results.reduce(
        (a, r) => a + r.connections.filter((c) => c.health === "warn").length,
        0
      ),
      connectionsError: results.reduce(
        (a, r) => a + r.connections.filter((c) => c.health === "error").length,
        0
      ),
    };

    return NextResponse.json({ ok: true, summary, clients: results });
  } catch (error: any) {
    console.error("[control/clients-health] error:", error);
    return NextResponse.json(
      { error: error.message || "Error" },
      { status: 500 }
    );
  }
}
