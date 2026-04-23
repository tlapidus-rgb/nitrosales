// ══════════════════════════════════════════════════════════════
// ML Dashboard API — Reads from OUR DB only (never touches ML)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Multi-tenant safe: orgId viene de session, no findFirst global
    const orgId = await getOrganizationId();
    const connection = await prisma.connection.findFirst({
      where: { platform: "MERCADOLIBRE" as any, organizationId: orgId },
    });
    if (!connection) {
      return NextResponse.json({ error: "No ML connection for this org" }, { status: 404 });
    }

    // Date range — supports from/to params or legacy days param
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const days = parseInt(searchParams.get("days") || "30");
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00.000-03:00")
      : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const dateTo = toParam
      ? new Date(toParam + "T23:59:59.999-03:00")
      : new Date();

    // KPIs from orders (source=MELI)
    // IMPORTANTE: MELI divide 1 carrito en N ordenes con el mismo pack_id.
    // Contamos DISTINCT COALESCE(packId, externalId) para no inflar
    // (ej: 1 carrito con 3 items = 1 venta en UI de MELI, no 3).
    // Revenue y itemCount se suman sin distinct (cada suborder tiene su partial).
    const kpiRow: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(DISTINCT COALESCE("packId", "externalId"))::int AS "orders",
         COALESCE(SUM("totalValue"), 0)::float AS "revenue",
         COALESCE(SUM("itemCount"), 0)::int AS "items"
       FROM "orders"
       WHERE "organizationId" = $1
         AND "source" = 'MELI'
         AND "orderDate" >= $2 AND "orderDate" <= $3
         AND "status" NOT IN ('CANCELLED','RETURNED')`,
      orgId, dateFrom, dateTo
    );
    const cancelledRow: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT COALESCE("packId", "externalId"))::int AS "orders"
       FROM "orders"
       WHERE "organizationId" = $1
         AND "source" = 'MELI'
         AND "orderDate" >= $2 AND "orderDate" <= $3
         AND "status" = 'CANCELLED'`,
      orgId, dateFrom, dateTo
    );
    const totalOrders = Number(kpiRow[0]?.orders || 0);
    const totalRevenue = Number(kpiRow[0]?.revenue || 0);
    const totalItems = Number(kpiRow[0]?.items || 0);
    const cancelledCount = Number(cancelledRow[0]?.orders || 0);
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Listings stats
    const listingsActive = await prisma.mlListing.count({
      where: { organizationId: orgId, status: "active" },
    });
    const listingsTotal = await prisma.mlListing.count({
      where: { organizationId: orgId },
    });
    const listingsPaused = await prisma.mlListing.count({
      where: { organizationId: orgId, status: "paused" },
    });

    // Latest reputation
    const latestRep = await prisma.mlSellerMetricDaily.findFirst({
      where: { organizationId: orgId },
      orderBy: { date: "desc" },
    });

    // Unanswered questions
    const unansweredQuestions = await prisma.mlQuestion.count({
      where: { organizationId: orgId, status: "UNANSWERED" },
    });

    // Daily sales: DISTINCT COALESCE(packId, externalId) por dia para no inflar.
    const dailyRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         DATE_TRUNC('day', "orderDate")::date AS "day",
         COUNT(DISTINCT COALESCE("packId", "externalId"))::int AS "orders",
         COALESCE(SUM("totalValue"), 0)::float AS "revenue"
       FROM "orders"
       WHERE "organizationId" = $1
         AND "source" = 'MELI'
         AND "orderDate" >= $2 AND "orderDate" <= $3
         AND "status" NOT IN ('CANCELLED','RETURNED')
       GROUP BY DATE_TRUNC('day', "orderDate")
       ORDER BY "day" ASC`,
      orgId, dateFrom, dateTo
    );
    const dailySales = dailyRows.map((r: any) => ({
      day: new Date(r.day).toISOString().split("T")[0],
      revenue: Number(r.revenue) || 0,
      orders: Number(r.orders) || 0,
    }));

    // Orders by status
    const statusBreakdown = await prisma.order.groupBy({
      by: ["status"],
      where: { organizationId: orgId, source: "MELI", orderDate: { gte: dateFrom, lte: dateTo } },
      _count: { id: true },
    });

    // Payment methods
    const paymentMethods = await prisma.order.groupBy({
      by: ["paymentMethod"],
      where: { organizationId: orgId, source: "MELI", orderDate: { gte: dateFrom, lte: dateTo }, status: { notIn: ["CANCELLED", "RETURNED"] }, paymentMethod: { not: null } },
      _count: { id: true },
      _sum: { totalValue: true },
      orderBy: { _count: { id: "desc" } },
    });

    // Last sync info
    const lastSync = connection.lastSyncAt;

    return NextResponse.json({
      kpis: {
        totalOrders,
        totalRevenue: Math.round(totalRevenue),
        avgTicket: Math.round(avgTicket),
        totalItems,
        cancelledOrders: cancelledCount,
        cancellationRate: totalOrders > 0 ? ((cancelledCount / totalOrders) * 100).toFixed(1) : "0",
        listingsActive,
        listingsTotal,
        listingsPaused,
        unansweredQuestions,
      },
      reputation: latestRep ? {
        level: latestRep.reputationLevel,
        powerSeller: latestRep.reputationPower,
        totalSales: latestRep.totalSales,
        completedSales: latestRep.completedSales,
        claimsRate: latestRep.claimsRate,
        delayedRate: latestRep.delayedHandlingRate,
        cancellationRate: latestRep.cancellationRate,
        positiveRatings: latestRep.positiveRatings,
        negativeRatings: latestRep.negativeRatings,
        neutralRatings: latestRep.neutralRatings,
      } : null,
      dailySales,
      statusBreakdown: statusBreakdown.map((s) => ({
        status: s.status,
        count: s._count.id,
      })),
      paymentMethods: paymentMethods.map((pm) => ({
        method: pm.paymentMethod || "Desconocido",
        orders: pm._count.id,
        revenue: Math.round(Number(pm._sum.totalValue || 0)),
      })),
      lastSync,
      daysInPeriod: days,
    });
  } catch (err: any) {
    console.error("[ML Dashboard API] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
