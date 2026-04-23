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
    const probeOrderId = url.searchParams.get("probeOrder"); // opcional: consulta directo a ML
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

    // Simular la query REAL del dashboard (con DISTINCT pack)
    const dashboardQuery: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(DISTINCT COALESCE("packId", "externalId"))::int AS "count",
         COUNT(*)::int AS "rawRows",
         COALESCE(SUM("totalValue"), 0)::float AS revenue
       FROM "orders"
       WHERE "organizationId" = $1
         AND "source" = 'MELI'
         AND "orderDate" >= NOW() - INTERVAL '30 days'
         AND "status" NOT IN ('CANCELLED', 'RETURNED')`,
      orgId
    );

    // Pack stats globales
    const packStats: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(*)::int AS "totalRows",
         COUNT("packId")::int AS "rowsWithPackId",
         COUNT(DISTINCT "packId")::int AS "distinctPacks",
         COUNT(DISTINCT COALESCE("packId", "externalId"))::int AS "distinctCountAll"
       FROM "orders"
       WHERE "organizationId" = $1 AND "source" = 'MELI'`,
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
      packStats: packStats[0] || null,
      dashboardQuery30d: dashboardQuery[0] || null,
      sampleOrders,
      webhookEvents,
      watermarks,
      probe: await probeOrderFromMl(connection, probeOrderId),
      searchProbe: await probeOrdersSearch(connection),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack?.slice(0, 500) }, { status: 500 });
  }
}

// Consulta directa a MELI por un orderId con el access_token de la Connection.
// Devuelve el raw payload para ver qué campos tiene y cómo están los status.
// Consulta /orders/search con 4 variantes distintas para comparar resultados.
// Objetivo: descubrir por qué /orders/search no nos devuelve las paid.
async function probeOrdersSearch(connection: any) {
  if (!connection) return null;
  const creds = connection.credentials as any;
  const token = creds?.accessToken;
  const mlUserId = creds?.mlUserId;
  if (!token || !mlUserId) return { error: "No token/mlUserId" };

  const from = "2026-04-19T00:00:00.000-00:00";
  const to = "2026-04-22T23:59:59.000-00:00";

  async function fetchSearch(queryDesc: string, path: string) {
    try {
      const res = await fetch(`https://api.mercadolibre.com${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { queryDesc, error: `${res.status}: ${(await res.text()).slice(0, 200)}` };
      const data = await res.json();
      return {
        queryDesc,
        totalPaging: data.paging?.total || 0,
        returned: data.results?.length || 0,
        firstIds: (data.results || []).slice(0, 10).map((o: any) => ({
          id: o.id,
          status: o.status,
          tags: o.tags?.slice(0, 5),
          date_created: o.date_created,
          total_amount: o.total_amount,
        })),
      };
    } catch (err: any) {
      return { queryDesc, error: err.message };
    }
  }

  return {
    "1_seller_default": await fetchSearch(
      "seller=X sin filtros (actual del processor)",
      `/orders/search?seller=${mlUserId}&order.date_created.from=${encodeURIComponent(from)}&order.date_created.to=${encodeURIComponent(to)}&limit=50&sort=date_desc`
    ),
    "2_seller_paid": await fetchSearch(
      "seller=X con order.status=paid explicito",
      `/orders/search?seller=${mlUserId}&order.date_created.from=${encodeURIComponent(from)}&order.date_created.to=${encodeURIComponent(to)}&order.status=paid&limit=50&sort=date_desc`
    ),
    "3_seller_cancelled": await fetchSearch(
      "seller=X con order.status=cancelled",
      `/orders/search?seller=${mlUserId}&order.date_created.from=${encodeURIComponent(from)}&order.date_created.to=${encodeURIComponent(to)}&order.status=cancelled&limit=50&sort=date_desc`
    ),
    "4_recent_archived": await fetchSearch(
      "archived endpoint (por si las paid estan ahi)",
      `/orders/search/archived?seller=${mlUserId}&order.date_created.from=${encodeURIComponent(from)}&order.date_created.to=${encodeURIComponent(to)}&limit=50&sort=date_desc`
    ),
  };
}

async function probeOrderFromMl(connection: any, orderId: string | null) {
  if (!orderId || !connection) return null;
  const creds = connection.credentials as any;
  const token = creds?.accessToken;
  if (!token) return { error: "No access token" };

  try {
    const res = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      return { error: `ML ${res.status}: ${body.slice(0, 300)}` };
    }
    const data = await res.json();
    // Solo devolvemos los campos más importantes (no dumpear todo el payload)
    return {
      orderId,
      status: data.status,
      status_detail: data.status_detail,
      tags: data.tags,
      date_created: data.date_created,
      date_closed: data.date_closed,
      last_updated: data.last_updated,
      total_amount: data.total_amount,
      currency_id: data.currency_id,
      payments: (data.payments || []).map((p: any) => ({
        id: p.id,
        status: p.status,
        status_detail: p.status_detail,
        date_approved: p.date_approved,
        transaction_amount: p.transaction_amount,
      })),
      shipping_status: data.shipping?.status || null,
      order_items_count: data.order_items?.length || 0,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}
