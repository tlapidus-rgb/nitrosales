// Health Check — NitroSales [FASE 1.2]
// GET /api/health?key=... — reporta ultimo sync, conexion DB, lag
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const dbOk = await prisma.$queryRawUnsafe("SELECT 1 as ok").then(() => true).catch(() => false);
    const connections = await prisma.connection.findMany({
      select: { platform: true, status: true, lastSyncAt: true, lastSuccessfulSyncAt: true, lastSyncError: true },
    });
    const vtex = connections.find((c) => c.platform === "VTEX");
    const lastSync = vtex?.lastSuccessfulSyncAt || vtex?.lastSyncAt;
    const lagMin = lastSync ? Math.round((Date.now() - new Date(lastSync).getTime()) / 60000) : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayOrders = await prisma.order.count({ where: { orderDate: { gte: today }, status: { notIn: ["CANCELLED", "RETURNED"] } } });
    const syncDead = lagMin !== null && lagMin > 120;
    const syncStale = lagMin !== null && lagMin > 30;
    const healthy = dbOk && !syncDead;
    return NextResponse.json({
      status: healthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks: {
        database: dbOk ? "ok" : "error",
        sync: { lastSuccessfulSync: lastSync?.toISOString() || null, lagMinutes: lagMin, status: syncDead ? "dead" : syncStale ? "stale" : "ok", lastError: vtex?.lastSyncError || null },
        todayOrders,
      },
      connections: connections.map((c) => ({ platform: c.platform, status: c.status, lastSync: c.lastSyncAt?.toISOString() || null, lastSuccessfulSync: c.lastSuccessfulSyncAt?.toISOString() || null })),
    }, { status: healthy ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({ status: "error", timestamp: new Date().toISOString(), error: error instanceof Error ? error.message : "Unknown" }, { status: 503 });
  }
}
