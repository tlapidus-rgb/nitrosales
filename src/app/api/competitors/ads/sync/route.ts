export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Competitor Ads Sync API
// ══════════════════════════════════════════════════════════════
// POST — Sync ads from Meta Ad Library for ALL competitors
// Uses AI-style auto-discovery: searches by competitor name
// so the user doesn't need to configure Page IDs manually.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { fetchMetaAdLibrary, ParsedCompetitorAd } from "@/lib/connectors/meta-ad-library";

export const revalidate = 0;
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json().catch(() => ({}));
    const targetCompetitorId = body.competitorId; // optional: sync only one

    const accessToken = process.env.META_ADS_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { error: "META_ADS_ACCESS_TOKEN not configured" },
        { status: 500 }
      );
    }

    // Get ALL active competitor stores (no longer require metaPageId)
    const whereStore: any = {
      organizationId: org.id,
      isActive: true,
    };
    if (targetCompetitorId) whereStore.id = targetCompetitorId;

    const stores = await prisma.competitorStore.findMany({
      where: whereStore,
      select: { id: true, name: true, website: true, metaPageId: true, googleAdsDomain: true },
    });

    if (stores.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No hay competidores configurados",
        synced: 0,
      });
    }

    const results: Array<{
      store: string;
      platform: string;
      searchMethod: string;
      fetched: number;
      created: number;
      updated: number;
      deactivated: number;
      error?: string;
    }> = [];

    for (const store of stores) {
      // ── Meta Ad Library sync ──
      // Priority: use metaPageId if configured, otherwise search by name
      const searchMethod = store.metaPageId ? "page_id" : "search_terms";

      try {
        const ads = await fetchMetaAdLibrary(accessToken, {
          pageId: store.metaPageId || undefined,
          searchTerms: !store.metaPageId ? store.name : undefined,
          limit: 200,
          activeOnly: false, // Get all to track deactivations
        });

        let created = 0;
        let updated = 0;

        // Get existing ads for this competitor
        const existingAds = await prisma.competitorAd.findMany({
          where: {
            competitorId: store.id,
            platform: "meta",
          },
          select: { id: true, adId: true, isActive: true },
        });
        const existingMap = new Map(existingAds.map((a) => [a.adId, a]));
        const fetchedAdIds = new Set(ads.map((a) => a.adId));

        // Upsert fetched ads
        for (const ad of ads) {
          const existing = existingMap.get(ad.adId);
          if (existing) {
            // Update existing
            await prisma.competitorAd.update({
              where: { id: existing.id },
              data: {
                adBody: ad.adBody,
                adTitle: ad.adTitle,
                adImageUrl: ad.adImageUrl,
                adSnapshotUrl: ad.adSnapshotUrl,
                adUrl: ad.adUrl,
                isActive: ad.isActive,
                endDate: ad.endDate,
                impressionsRange: ad.impressionsRange,
                rawData: ad.rawData,
                lastSeenAt: new Date(),
              },
            });
            updated++;
          } else {
            // Create new
            await prisma.competitorAd.create({
              data: {
                organizationId: org.id,
                competitorId: store.id,
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
                rawData: ad.rawData,
              },
            });
            created++;
          }
        }

        // Deactivate ads that no longer appear in Meta
        const toDeactivate = existingAds.filter(
          (a) => a.isActive && !fetchedAdIds.has(a.adId)
        );
        let deactivated = 0;
        if (toDeactivate.length > 0) {
          await prisma.competitorAd.updateMany({
            where: { id: { in: toDeactivate.map((a) => a.id) } },
            data: { isActive: false, endDate: new Date() },
          });
          deactivated = toDeactivate.length;
        }

        results.push({
          store: store.name,
          platform: "meta",
          searchMethod,
          fetched: ads.length,
          created,
          updated,
          deactivated,
        });
      } catch (err: any) {
        console.error(`[Ads Sync] Meta error for ${store.name}:`, err.message);
        results.push({
          store: store.name,
          platform: "meta",
          searchMethod,
          fetched: 0,
          created: 0,
          updated: 0,
          deactivated: 0,
          error: err.message,
        });
      }

      // ── Google: for MVP we don't scrape, just auto-generate links from website domain ──
      // Google Ads Transparency Center doesn't have a public API
      // We auto-extract the domain from the store's website URL
    }

    const totalCreated = results.reduce((s, r) => s + r.created, 0);
    const totalUpdated = results.reduce((s, r) => s + r.updated, 0);

    return NextResponse.json({
      success: true,
      synced: results.length,
      totalCreated,
      totalUpdated,
      results,
    });
  } catch (error: any) {
    console.error("[Ads Sync]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
