// ══════════════════════════════════════════════
// Health Check Endpoint — NitroSales
// ══════════════════════════════════════════════
// [FASE 1.2] GET /api/health?key=...
// Reporta: ultimo sync exitoso, conexion a DB, lag de datos.
// Retorna 200 si todo OK, 503 si algo falla.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

const SYNC_KEY = process.env.NEXTAUTH_SECRET || '';

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (key !== SYNC_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Check DB connection
    const dbCheck = await prisma.$queryRaw`SELECT 1 as ok`;
    const dbOk = Array.isArray(dbCheck) && dbCheck.length > 0;

    // 2. Get last successful sync from Connection table
    const connections = await prisma.connection.findMany({
      select: {
        platform: true,
        status: true,
        lastSyncAt: true,
        lastSuccessfulSyncAt: true,
        lastSyncError: true,
      },
    });

    // 3. Calculate sync lag
    const vtexConnection = connections.find((c) => c.platform === 'VTEX');
    const lastSync = vtexConnection?.lastSuccessfulSyncAt || vtexConnection?.lastSyncAt;
    const syncLagMinutes = lastSync
      ? Math.round((Date.now() - new Date(lastSync).getTime()) / 60000)
      : null;

    // 4. Get order count for today (quick sanity check)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = await prisma.order.count({
      where: {
        orderDate: { gte: today },
        status: { notIn: ['CANCELLED', 'RETURNED'] },
      },
    });

    // 5. Determine overall health
    const syncStale = syncLagMinutes !== null && syncLagMinutes > 30;
    const syncDead = syncLagMinutes !== null && syncLagMinutes > 120;
    const healthy = dbOk && !syncDead;

    const response = {
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbOk ? 'ok' : 'error',
        sync: {
          lastSuccessfulSync: lastSync?.toISOString() || null,
          lagMinutes: syncLagMinutes,
          status: syncDead ? 'dead' : syncStale ? 'stale' : 'ok',
          lastError: vtexConnection?.lastSyncError || null,
        },
        todayOrders,
      },
      connections: connections.map((c) => ({
        platform: c.platform,
        status: c.status,
        lastSync: c.lastSyncAt?.toISOString() || null,
        lastSuccessfulSync: c.lastSuccessfulSyncAt?.toISOString() || null,
      })),
    };

    return NextResponse.json(response, { status: healthy ? 200 : 503 });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}
