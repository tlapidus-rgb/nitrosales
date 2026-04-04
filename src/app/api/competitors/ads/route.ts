// ══════════════════════════════════════════════════════════════
// Competitor Ads API — List & Query
// ══════════════════════════════════════════════════════════════
// GET  — List competitor ads with filters
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const url = new URL(req.url);

    // Filters
    const competitorId = url.searchParams.get("competitorId");
    const platform = url.searchParams.get("platform"); // "meta" | "google"
    const status = url.searchParams.get("status"); // "active" | "inactive" | "all"
    const search = url.searchParams.get("search");
    const sortBy = url.searchParams.get("sortBy") || "recent"; // "recent" | "oldest" | "longest"
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "50");

    // Build where clause
    const where: any = { organizationId: org.id };
    if (competitorId) where.competitorId = competitorId;
    if (platform) where.platform = platform;
    if (status === "active") where.isActive = true;
    else if (status === "inactive") where.isActive = false;
    // "all" = no filter on isActive

    if (search) {
      where.OR = [
        { adBody: { contains: search, mode: "insensitive" } },
        { adTitle: { contains: search, mode: "insensitive" } },
      ];
    }

    // Sort
    let orderBy: any = { firstSeenAt: "desc" }; // default: recent
    if (sortBy === "oldest") orderBy = { firstSeenAt: "asc" };
    if (sortBy === "longest") orderBy = { startDate: "asc" };

    // Query
    const [ads, total, stores] = await Promise.all([
      prisma.competitorAd.findMany({
        where,
        include: {
          competitor: { select: { id: true, name: true, website: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.competitorAd.count({ where }),
      prisma.competitorStore.findMany({
        where: { organizationId: org.id, isActive: true },
        select: {
          id: true,
          name: true,
          website: true,
          metaPageId: true,
          googleAdsDomain: true,
          _count: { select: { ads: true } },
        },
      }),
    ]);

    // KPIs
    const activeAds = await prisma.competitorAd.findMany({
      where: { organizationId: org.id, isActive: true },
      select: { platform: true, competitorId: true, startDate: true },
    });

    const totalActive = activeAds.length;
    const metaActive = activeAds.filter((a) => a.platform === "meta").length;
    const googleActive = activeAds.filter((a) => a.platform === "google").length;

    // Competitor with most active ads
    const adsByCompetitor: Record<string, number> = {};
    for (const ad of activeAds) {
      adsByCompetitor[ad.competitorId] = (adsByCompetitor[ad.competitorId] || 0) + 1;
    }
    const topCompetitorId = Object.entries(adsByCompetitor).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topCompetitor = topCompetitorId
      ? stores.find((s) => s.id === topCompetitorId)
      : null;

    // Longest running active ad
    const longestAd = activeAds
      .filter((a) => a.startDate)
      .sort((a, b) => (a.startDate!.getTime() - b.startDate!.getTime()))[0];
    const longestRunningDays = longestAd?.startDate
      ? Math.floor((Date.now() - longestAd.startDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return NextResponse.json({
      kpis: {
        totalActive,
        metaActive,
        googleActive,
        topCompetitor: topCompetitor
          ? { name: topCompetitor.name, count: adsByCompetitor[topCompetitorId!] }
          : null,
        longestRunningDays,
      },
      ads: ads.map((ad) => ({
        id: ad.id,
        platform: ad.platform,
        adId: ad.adId,
        adBody: ad.adBody,
        adTitle: ad.adTitle,
        adImageUrl: ad.adImageUrl,
        adSnapshotUrl: ad.adSnapshotUrl,
        adUrl: ad.adUrl,
        startDate: ad.startDate,
        endDate: ad.endDate,
        isActive: ad.isActive,
        adType: ad.adType,
        impressionsRange: ad.impressionsRange,
        firstSeenAt: ad.firstSeenAt,
        lastSeenAt: ad.lastSeenAt,
        competitor: ad.competitor,
        daysRunning: ad.startDate
          ? Math.floor((Date.now() - ad.startDate.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      })),
      stores: stores.map((s) => ({
        id: s.id,
        name: s.name,
        website: s.website,
        metaPageId: s.metaPageId,
        googleAdsDomain: s.googleAdsDomain,
        adCount: s._count.ads,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("[Competitor Ads]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
