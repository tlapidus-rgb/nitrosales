// ══════════════════════════════════════════════════════════════
// Public Influencer Dashboard API (NO AUTH)
// ══════════════════════════════════════════════════════════════
// GET — Returns aggregated metrics for the influencer's public
//       dashboard. No PII, no customer data.
//
// URL: /api/public/influencers/[org_slug]/[influencer_code]
// Cache: 30 seconds
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_WINDOW = 1000; // 1 second

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const lastRequest = rateLimitMap.get(ip);
  if (lastRequest && now - lastRequest < RATE_LIMIT_WINDOW) {
    return true;
  }
  rateLimitMap.set(ip, now);
  // Clean up old entries every 100 requests
  if (rateLimitMap.size > 1000) {
    const cutoff = now - RATE_LIMIT_WINDOW * 10;
    for (const [key, time] of rateLimitMap) {
      if (time < cutoff) rateLimitMap.delete(key);
    }
  }
  return false;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; code: string } }
) {
  try {
    // Rate limiting
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }

    const { slug, code } = params;

    // Find organization by slug
    const org = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Find influencer
    const influencer = await prisma.influencer.findUnique({
      where: { organizationId_code: { organizationId: org.id, code } },
    });
    if (!influencer || influencer.status === "INACTIVE" || !influencer.isPublicDashboardEnabled) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Password protection check
    if (influencer.dashboardPassword) {
      const url = new URL(req.url);
      const password = url.searchParams.get("password");
      if (!password || hashPassword(password) !== influencer.dashboardPassword) {
        return NextResponse.json({
          requiresPassword: true,
          influencer: {
            name: influencer.publicName || influencer.name,
            profileImage: influencer.profileImage,
          },
          organization: { name: org.name },
        });
      }
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Today's metrics
    const todayAgg = await prisma.influencerAttribution.aggregate({
      where: {
        influencerId: influencer.id,
        organizationId: org.id,
        createdAt: { gte: todayStart },
      },
      _sum: { attributedValue: true, commissionAmount: true },
      _count: { id: true },
    });

    // This month's metrics
    const monthAgg = await prisma.influencerAttribution.aggregate({
      where: {
        influencerId: influencer.id,
        organizationId: org.id,
        createdAt: { gte: monthStart },
      },
      _sum: { attributedValue: true, commissionAmount: true },
      _count: { id: true },
    });

    // All-time metrics
    const allTimeAgg = await prisma.influencerAttribution.aggregate({
      where: {
        influencerId: influencer.id,
        organizationId: org.id,
      },
      _sum: { attributedValue: true, commissionAmount: true },
      _count: { id: true },
    });

    // Recent sales (last 20, only timestamp + amount, NO customer info)
    const recentSales = await prisma.influencerAttribution.findMany({
      where: { influencerId: influencer.id, organizationId: org.id },
      select: {
        createdAt: true,
        attributedValue: true,
        commissionAmount: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Daily chart (last 30 days)
    const dailyChart = await prisma.$queryRaw<
      Array<{ date: string; sales: number; conversions: number }>
    >(Prisma.sql`
      SELECT
        DATE("createdAt") as date,
        COALESCE(SUM("attributedValue"), 0)::float as sales,
        COUNT(*)::int as conversions
      FROM "influencer_attributions"
      WHERE "influencerId" = ${influencer.id}
        AND "organizationId" = ${org.id}
        AND "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `);

    // Unique visitors (from pixel events with this influencer's UTM)
    const visitorCount = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(DISTINCT "visitorId")::int as count
      FROM "pixel_events"
      WHERE "organizationId" = ${org.id}
        AND "timestamp" >= ${monthStart}
        AND "utmParams"->>'source' = ${"inf_" + influencer.code}
    `);

    const monthRevenue = Number(monthAgg._sum.attributedValue || 0);
    const monthConversions = monthAgg._count.id || 0;
    const uniqueVisitors = visitorCount[0]?.count || 0;

    const response = {
      influencer: {
        name: influencer.publicName || influencer.name,
        profileImage: influencer.profileImage,
        commissionPercent: Number(influencer.commissionPercent),
      },
      organization: {
        name: org.name,
      },
      today: {
        sales: Number(todayAgg._sum.attributedValue || 0),
        conversions: todayAgg._count.id || 0,
        commission: Number(todayAgg._sum.commissionAmount || 0),
      },
      thisMonth: {
        sales: monthRevenue,
        conversions: monthConversions,
        commission: Number(monthAgg._sum.commissionAmount || 0),
      },
      allTime: {
        sales: Number(allTimeAgg._sum.attributedValue || 0),
        conversions: allTimeAgg._count.id || 0,
        commission: Number(allTimeAgg._sum.commissionAmount || 0),
      },
      stats: {
        conversionRate: uniqueVisitors > 0 ? ((monthConversions / uniqueVisitors) * 100) : 0,
        avgOrderValue: monthConversions > 0 ? monthRevenue / monthConversions : 0,
        uniqueVisitors,
      },
      recentSales: recentSales.map((s) => ({
        timestamp: s.createdAt.toISOString(),
        amount: Number(s.attributedValue),
        commission: Number(s.commissionAmount),
      })),
      dailyChart,
      updatedAt: now.toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error: any) {
    console.error("[Public Influencer API]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
