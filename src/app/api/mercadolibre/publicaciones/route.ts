// ══════════════════════════════════════════════════════════════
// ML Publicaciones API — Reads from OUR DB only (never touches ML)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const connection = await prisma.connection.findFirst({
      where: { platform: "MERCADOLIBRE" as any },
    });
    if (!connection) {
      return NextResponse.json({ error: "No ML connection" }, { status: 404 });
    }
    const orgId = connection.organizationId;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = 50;

    // Build where clause
    const where: any = { organizationId: orgId };
    if (status !== "all") where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { mlItemId: { contains: search, mode: "insensitive" } },
      ];
    }

    // KPIs
    const [totalCount, activeCount, pausedCount, closedCount] = await Promise.all([
      prisma.mlListing.count({ where: { organizationId: orgId } }),
      prisma.mlListing.count({ where: { organizationId: orgId, status: "active" } }),
      prisma.mlListing.count({ where: { organizationId: orgId, status: "paused" } }),
      prisma.mlListing.count({ where: { organizationId: orgId, status: "closed" } }),
    ]);

    // Aggregates for active listings
    const priceAgg = await prisma.mlListing.aggregate({
      where: { organizationId: orgId, status: "active" },
      _avg: { price: true },
      _sum: { availableQty: true, soldQty: true },
    });

    const freeShippingCount = await prisma.mlListing.count({
      where: { organizationId: orgId, status: "active", freeShipping: true },
    });

    const catalogCount = await prisma.mlListing.count({
      where: { organizationId: orgId, status: "active", catalogListing: true },
    });

    const fulfillmentCount = await prisma.mlListing.count({
      where: { organizationId: orgId, status: "active", fulfillment: "fulfillment" },
    });

    // Listing type breakdown
    const listingTypes = await prisma.mlListing.groupBy({
      by: ["listingType"],
      where: { organizationId: orgId, status: "active" },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    // Paginated listings
    const filteredCount = await prisma.mlListing.count({ where });
    const listings = await prisma.mlListing.findMany({
      where,
      orderBy: { soldQty: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        mlItemId: true,
        title: true,
        status: true,
        price: true,
        originalPrice: true,
        currencyId: true,
        availableQty: true,
        soldQty: true,
        listingType: true,
        condition: true,
        permalink: true,
        thumbnailUrl: true,
        freeShipping: true,
        fulfillment: true,
        catalogListing: true,
        lastSyncAt: true,
      },
    });

    return NextResponse.json({
      kpis: {
        total: totalCount,
        active: activeCount,
        paused: pausedCount,
        closed: closedCount,
        avgPrice: Math.round(Number(priceAgg._avg.price || 0)),
        totalStock: Number(priceAgg._sum.availableQty || 0),
        totalSold: Number(priceAgg._sum.soldQty || 0),
        freeShipping: freeShippingCount,
        freeShippingPct: activeCount > 0 ? ((freeShippingCount / activeCount) * 100).toFixed(1) : "0",
        catalog: catalogCount,
        catalogPct: activeCount > 0 ? ((catalogCount / activeCount) * 100).toFixed(1) : "0",
        fulfillment: fulfillmentCount,
        fulfillmentPct: activeCount > 0 ? ((fulfillmentCount / activeCount) * 100).toFixed(1) : "0",
      },
      listingTypes: listingTypes.map((lt) => ({
        type: lt.listingType || "Sin tipo",
        count: lt._count.id,
      })),
      listings: listings.map((l) => ({
        ...l,
        price: Number(l.price),
        originalPrice: l.originalPrice ? Number(l.originalPrice) : null,
      })),
      pagination: {
        page,
        pageSize,
        totalCount: filteredCount,
        totalPages: Math.ceil(filteredCount / pageSize),
      },
    });
  } catch (err: any) {
    console.error("[ML Publicaciones API] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
