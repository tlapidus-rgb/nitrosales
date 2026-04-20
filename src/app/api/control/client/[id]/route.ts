// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/control/client/[id]
// ══════════════════════════════════════════════════════════════
// Drill-down de un cliente: detalle de conexiones, actividad, errores.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const org = await prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        settings: true,
        createdAt: true,
        connections: {
          select: {
            id: true,
            platform: true,
            status: true,
            lastSyncAt: true,
            lastSuccessfulSyncAt: true,
            lastSyncError: true,
            createdAt: true,
          },
        },
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });

    if (!org) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    // Login events últimos 30d
    const recentLogins = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT le."createdAt", le."email", le."success", u.name as "userName"
       FROM "login_events" le
       LEFT JOIN "users" u ON u.id = le."userId"
       WHERE u."organizationId" = $1
       ORDER BY le."createdAt" DESC
       LIMIT 20`,
      id
    );

    // Activity: orders / pixel / botchats ultimas 7d
    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const [orders7d, pixel7d, botchats7d] = await Promise.all([
      prisma.order.count({
        where: { organizationId: id, createdAt: { gte: since7d } },
      }),
      prisma.pixelEvent.count({
        where: { organizationId: id, receivedAt: { gte: since7d } },
      }),
      prisma.botChat.count({
        where: { organizationId: id, createdAt: { gte: since7d } },
      }),
    ]);

    // Orders/pixel/chats últimas 24h (para detectar si está "vivo")
    const since24h = new Date(Date.now() - 24 * 3600 * 1000);
    const [orders24h, pixel24h, botchats24h] = await Promise.all([
      prisma.order.count({
        where: { organizationId: id, createdAt: { gte: since24h } },
      }),
      prisma.pixelEvent.count({
        where: { organizationId: id, receivedAt: { gte: since24h } },
      }),
      prisma.botChat.count({
        where: { organizationId: id, createdAt: { gte: since24h } },
      }),
    ]);

    // Total lifetime
    const [totalOrders, totalPixel, totalChats] = await Promise.all([
      prisma.order.count({ where: { organizationId: id } }),
      prisma.pixelEvent.count({ where: { organizationId: id } }),
      prisma.botChat.count({ where: { organizationId: id } }),
    ]);

    return NextResponse.json({
      ok: true,
      client: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        settings: org.settings,
        createdAt: org.createdAt.toISOString(),
        connections: org.connections.map((c) => ({
          id: c.id,
          platform: c.platform,
          status: c.status,
          lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
          lastSuccessfulSyncAt: c.lastSuccessfulSyncAt
            ? c.lastSuccessfulSyncAt.toISOString()
            : null,
          lastSyncError: c.lastSyncError,
          createdAt: c.createdAt.toISOString(),
        })),
        users: org.users.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
        })),
        recentLogins: recentLogins.map((l) => ({
          createdAt: new Date(l.createdAt).toISOString(),
          email: l.email,
          success: l.success,
          userName: l.userName,
        })),
        activity: {
          last24h: { orders: orders24h, pixel: pixel24h, botchats: botchats24h },
          last7d: { orders: orders7d, pixel: pixel7d, botchats: botchats7d },
          total: { orders: totalOrders, pixel: totalPixel, botchats: totalChats },
        },
      },
    });
  } catch (error: any) {
    console.error("[control/client/[id]] error:", error);
    return NextResponse.json(
      { error: error.message || "Error" },
      { status: 500 }
    );
  }
}
