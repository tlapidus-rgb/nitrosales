// ══════════════════════════════════════════════════════════════
// Influencer Metrics API
// ══════════════════════════════════════════════════════════════
// GET — Detailed metrics for a specific influencer
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    // Verify ownership
    const influencer = await prisma.influencer.findFirst({
      where: { id: params.id, organizationId: org.id },
    });
    if (!influencer) {
      return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
    }

    // Date filters
    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = to ? new Date(to) : new Date();

    // Aggregated totals
    const agg = await prisma.influencerAttribution.aggregate({
      where: {
        influencerId: params.id,
        organizationId: org.id,
        createdAt: { gte: dateFrom, lte: dateTo },
      },
      _sum: { attributedValue: true, commissionAmount: true },
      _count: { id: true },
    });

    // Daily metrics via raw SQL for performance
    const dailyMetrics = await prisma.$queryRaw<
      Array<{ date: string; sales: number; conversions: number; commission: number }>
    >(Prisma.sql`
      SELECT
        DATE("createdAt") as date,
        COALESCE(SUM("attributedValue"), 0)::float as sales,
        COUNT(*)::int as conversions,
        COALESCE(SUM("commissionAmount"), 0)::float as commission
      FROM "influencer_attributions"
      WHERE "influencerId" = ${params.id}
        AND "organizationId" = ${org.id}
        AND "createdAt" >= ${dateFrom}
        AND "createdAt" <= ${dateTo}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `);

    // Campaign breakdown
    const campaignBreakdown = await prisma.$queryRaw<
      Array<{ campaignId: string; campaignName: string; sales: number; conversions: number }>
    >(Prisma.sql`
      SELECT
        ia."campaignId",
        COALESCE(ic.name, 'Sin campaña') as "campaignName",
        COALESCE(SUM(ia."attributedValue"), 0)::float as sales,
        COUNT(*)::int as conversions
      FROM "influencer_attributions" ia
      LEFT JOIN "influencer_campaigns" ic ON ia."campaignId" = ic.id
      WHERE ia."influencerId" = ${params.id}
        AND ia."organizationId" = ${org.id}
        AND ia."createdAt" >= ${dateFrom}
        AND ia."createdAt" <= ${dateTo}
      GROUP BY ia."campaignId", ic.name
      ORDER BY sales DESC
    `);

    // Unique visitors from pixel events (influencer UTM source)
    const visitorCount = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(DISTINCT "visitorId")::int as count
      FROM "pixel_events"
      WHERE "organizationId" = ${org.id}
        AND "timestamp" >= ${dateFrom}
        AND "timestamp" <= ${dateTo}
        AND "utmParams"->>'source' = ${"inf_" + influencer.code}
    `);

    // Product breakdown: which products were sold via this influencer
    const productBreakdown = await prisma.$queryRaw<
      Array<{ productId: string; name: string; category: string | null; imageUrl: string | null; units: number; revenue: number }>
    >(Prisma.sql`
      SELECT
        p.id as "productId",
        p.name,
        p.category,
        p."imageUrl",
        SUM(oi.quantity)::int as units,
        SUM(oi."totalPrice")::float as revenue
      FROM "influencer_attributions" ia
      JOIN "orders" o ON ia."orderId" = o.id
      JOIN "order_items" oi ON oi."orderId" = o.id
      JOIN "products" p ON oi."productId" = p.id
      WHERE ia."influencerId" = ${params.id}
        AND ia."organizationId" = ${org.id}
        AND ia."createdAt" >= ${dateFrom}
        AND ia."createdAt" <= ${dateTo}
      GROUP BY p.id, p.name, p.category, p."imageUrl"
      ORDER BY revenue DESC
      LIMIT 20
    `);

    const totalRevenue = Number(agg._sum.attributedValue || 0);
    const totalConversions = agg._count.id || 0;
    const uniqueVisitors = visitorCount[0]?.count || 0;

    return NextResponse.json({
      totalRevenue,
      totalCommission: Number(agg._sum.commissionAmount || 0),
      totalConversions,
      avgOrderValue: totalConversions > 0 ? totalRevenue / totalConversions : 0,
      conversionRate: uniqueVisitors > 0 ? (totalConversions / uniqueVisitors) * 100 : 0,
      uniqueVisitors,
      dailyMetrics,
      campaignBreakdown,
      productBreakdown,
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
    });
  } catch (error: any) {
    console.error("[Influencer Metrics GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
