// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/debug-ml-backfill?email=X
// ══════════════════════════════════════════════════════════════
// Diagnostico completo del estado del backfill ML para una org.
// Devuelve: connection status, backfill job, ordenes en DB, etc.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const email = url.searchParams.get("email");
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    // Find user + org
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      select: { id: true, organizationId: true },
    });
    if (!user) return NextResponse.json({ error: "User not found", email });

    const orgId = user.organizationId;

    // Connection ML
    const connection = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "MERCADOLIBRE" as any },
    });

    const connInfo = connection ? {
      id: connection.id,
      status: connection.status,
      lastSyncAt: connection.lastSyncAt,
      lastSyncError: connection.lastSyncError,
      hasAccessToken: !!(connection.credentials as any)?.accessToken,
      hasRefreshToken: !!(connection.credentials as any)?.refreshToken,
      mlUserId: (connection.credentials as any)?.mlUserId || null,
      tokenExpiresAt: (connection.credentials as any)?.tokenExpiresAt || null,
    } : null;

    // Backfill jobs
    const backfillJobs: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM "backfill_jobs"
       WHERE "organizationId" = $1 AND "platform" = 'MERCADOLIBRE'
       ORDER BY "createdAt" DESC
       LIMIT 5`,
      orgId
    );

    // Orders count by source=MELI
    const ordersCount: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total,
              MIN("orderDate") AS oldest,
              MAX("orderDate") AS newest,
              COUNT(CASE WHEN "orderDate" >= NOW() - INTERVAL '30 days' THEN 1 END)::int AS last30d,
              COUNT(CASE WHEN "orderDate" >= NOW() - INTERVAL '90 days' THEN 1 END)::int AS last90d
       FROM "orders"
       WHERE "organizationId" = $1 AND "source" = 'MELI'`,
      orgId
    );

    // Breakdown por status (para detectar si todas están en CANCELLED o algo)
    const statusBreakdown: any[] = await prisma.$queryRawUnsafe(
      `SELECT "status"::text AS status, COUNT(*)::int AS count
       FROM "orders"
       WHERE "organizationId" = $1 AND "source" = 'MELI'
       GROUP BY "status"
       ORDER BY count DESC`,
      orgId
    );

    // Simular exactamente la query del dashboard
    const dashboardQuery: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM("totalValue"), 0)::float AS revenue
       FROM "orders"
       WHERE "organizationId" = $1
         AND "source" = 'MELI'
         AND "orderDate" >= NOW() - INTERVAL '30 days'
         AND "status" NOT IN ('CANCELLED', 'RETURNED')`,
      orgId
    );

    // 5 ejemplos de órdenes para ver su shape
    const sampleOrders: any[] = await prisma.$queryRawUnsafe(
      `SELECT "externalId","status"::text,"totalValue","orderDate","source"
       FROM "orders"
       WHERE "organizationId" = $1 AND "source" = 'MELI'
       ORDER BY "orderDate" DESC LIMIT 5`,
      orgId
    );

    // ML webhook events
    let webhookEvents: any = null;
    try {
      const we: any[] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS total,
                COUNT(CASE WHEN "processed" THEN 1 END)::int AS processed,
                COUNT(CASE WHEN NOT "processed" THEN 1 END)::int AS pending
         FROM "meli_webhook_events"
         WHERE "organizationId" = $1`,
        orgId
      );
      webhookEvents = we[0] || null;
    } catch {}

    // Sync watermarks
    let watermarks: any[] = [];
    try {
      watermarks = await prisma.$queryRawUnsafe(
        `SELECT * FROM "sync_watermarks" WHERE "organizationId" = $1 AND "platform" = 'MERCADOLIBRE'`,
        orgId
      );
    } catch {}

    // Onboarding request
    const obReq: any[] = await prisma.$queryRawUnsafe(
      `SELECT "id","companyName","status","progressStage","historyMlMonths","updatedAt"
       FROM "onboarding_requests"
       WHERE "createdOrgId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      orgId
    );

    return NextResponse.json({
      ok: true,
      orgId,
      userId: user.id,
      connection: connInfo,
      onboarding: obReq[0] || null,
      backfillJobs: backfillJobs.map((j: any) => ({
        id: j.id,
        status: j.status,
        monthsRequested: j.monthsRequested,
        processedCount: j.processedCount,
        totalEstimate: j.totalEstimate,
        progressPct: j.progressPct,
        lastError: j.lastError,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
        lastChunkAt: j.lastChunkAt,
        cursor: j.cursor,
      })),
      ordersStats: ordersCount[0] || null,
      statusBreakdown,
      dashboardQuery30d: dashboardQuery[0] || null,
      sampleOrders,
      webhookEvents,
      watermarks,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack?.slice(0, 500) }, { status: 500 });
  }
}
