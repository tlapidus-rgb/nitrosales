// @ts-nocheck
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { MetaAdsConnector } from "@/lib/connectors/meta-ads";
import { classifyCreative } from "@/lib/classification/ad-classifier";
import { getOrganization } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  // Timer PER REQUEST para evitar timeout de Vercel
  const syncStart = Date.now();
  const MAX_RUNTIME_MS = 100000; // 100 segundos (maxDuration=120, margen de 20s)
  function shouldStop() { return (Date.now() - syncStart) > MAX_RUNTIME_MS; }

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (key !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await getOrganization();
  let stoppedEarly = false;

  const metaToken = process.env.META_ADS_ACCESS_TOKEN || "";
  const metaAdAccount = process.env.META_ADS_AD_ACCOUNT_ID || "";

  if (!metaToken || !metaAdAccount) {
    return NextResponse.json({ error: "Missing Meta credentials" });
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since = thirtyDaysAgo.toISOString().split("T")[0];
  const until = now.toISOString().split("T")[0];

  // ═══════════════════════════════════════════
  // STEP 1: Campaigns (rapido, ~2s)
  // ═══════════════════════════════════════════
  const campaignsRes = await fetch(
    `https://graph.facebook.com/v19.0/${metaAdAccount}/campaigns?fields=id,name,status,objective&limit=100&access_token=${metaToken}`
  );
  const campaignsData = await campaignsRes.json();

  if (!campaignsData.data || campaignsData.data.length === 0) {
    return NextResponse.json({ error: "No campaigns from Meta API", raw: campaignsData.error });
  }

  let campaignsUpserted = 0;
  let metricsUpserted = 0;
  const campaignMap: Record<string, string> = {};

  for (const mc of campaignsData.data) {
    const campaign = await prisma.adCampaign.upsert({
      where: {
        organizationId_externalId_platform: {
          organizationId: org.id,
          externalId: mc.id,
          platform: "META",
        },
      },
      update: {
        name: mc.name,
        status: mc.status === "ACTIVE" ? "ACTIVE" : mc.status === "PAUSED" ? "PAUSED" : "ARCHIVED",
        objective: mc.objective || null,
      },
      create: {
        organizationId: org.id,
        externalId: mc.id,
        platform: "META",
        name: mc.name,
        status: mc.status === "ACTIVE" ? "ACTIVE" : mc.status === "PAUSED" ? "PAUSED" : "ARCHIVED",
        objective: mc.objective || null,
      },
    });
    campaignMap[mc.id] = campaign.id;
    campaignsUpserted++;
  }

  // ═══════════════════════════════════════════
  // STEP 2: Campaign insights (medio, ~10s)
  // ═══════════════════════════════════════════
  const insightsRes = await fetch(
    `https://graph.facebook.com/v19.0/${metaAdAccount}/insights?fields=campaign_id,spend,impressions,clicks,actions,action_values&time_range={"since":"${since}","until":"${until}"}&time_increment=1&level=campaign&limit=500&access_token=${metaToken}`
  );
  const insightsData = await insightsRes.json();

  if (insightsData.data) {
    for (const day of insightsData.data) {
      const dbCampaignId = campaignMap[day.campaign_id];
      if (!dbCampaignId) continue;

      const purchases = day.actions?.find((a: any) => a.action_type === "purchase")?.value || 0;
      const purchaseValue = day.action_values?.find((a: any) => a.action_type === "purchase")?.value || 0;

      await prisma.adMetricDaily.upsert({
        where: {
          campaignId_date: {
            campaignId: dbCampaignId,
            date: new Date(day.date_start),
          },
        },
        update: {
          organizationId: org.id,
          spend: parseFloat(day.spend || "0"),
          impressions: parseInt(day.impressions || "0"),
          clicks: parseInt(day.clicks || "0"),
          conversions: parseInt(purchases),
          conversionValue: parseFloat(purchaseValue),
        },
        create: {
          organizationId: org.id,
          platform: "META",
          campaignId: dbCampaignId,
          date: new Date(day.date_start),
          spend: parseFloat(day.spend || "0"),
          impressions: parseInt(day.impressions || "0"),
          clicks: parseInt(day.clicks || "0"),
          conversions: parseInt(purchases),
          conversionValue: parseFloat(purchaseValue),
        },
      });
      metricsUpserted++;
    }

    let nextPage = insightsData.paging?.next;
    while (nextPage) {
      const pageRes = await fetch(nextPage);
      const pageData = await pageRes.json();
      if (pageData.data) {
        for (const day of pageData.data) {
          const dbCampaignId = campaignMap[day.campaign_id];
          if (!dbCampaignId) continue;
          const purchases = day.actions?.find((a: any) => a.action_type === "purchase")?.value || 0;
          const purchaseValue = day.action_values?.find((a: any) => a.action_type === "purchase")?.value || 0;
          await prisma.adMetricDaily.upsert({
            where: { campaignId_date: { campaignId: dbCampaignId, date: new Date(day.date_start) } },
            update: { organizationId: org.id, spend: parseFloat(day.spend || "0"), impressions: parseInt(day.impressions || "0"), clicks: parseInt(day.clicks || "0"), conversions: parseInt(purchases), conversionValue: parseFloat(purchaseValue) },
            create: { organizationId: org.id, platform: "META", campaignId: dbCampaignId, date: new Date(day.date_start), spend: parseFloat(day.spend || "0"), impressions: parseInt(day.impressions || "0"), clicks: parseInt(day.clicks || "0"), conversions: parseInt(purchases), conversionValue: parseFloat(purchaseValue) },
          });
          metricsUpserted++;
        }
      }
      nextPage = pageData.paging?.next;
    }
  }

  // ═══════════════════════════════════════════
  // STEP 3: Ads + Ad Insights con video (PRIORIDAD)
  // ═══════════════════════════════════════════
  let adsUpserted = 0;
  let adMetricsUpserted = 0;

  const connector = new MetaAdsConnector({
    accessToken: metaToken,
    adAccountId: metaAdAccount,
  });

  try {
    // 3a: Fetch and upsert all ads
    const allAds = await connector.fetchAllAds();

    for (const ad of allAds) {
      if (shouldStop()) { stoppedEarly = true; break; }
      const adCampaignId = (ad as any).campaign_id;
      const adAdSetId = (ad as any).adset_id;
      const dbCampaignId = adCampaignId ? campaignMap[adCampaignId] : null;
      if (!dbCampaignId) continue;

      const adType = MetaAdsConnector.detectAdType(ad);
      const mediaUrls = MetaAdsConnector.extractMediaUrls(ad);
      const creative = ad.adcreatives?.data?.[0];

      const classification = classifyCreative({
        adName: ad.name,
        campaignName: campaignsData.data?.find((c: any) => c.id === adCampaignId)?.name,
        adType,
        headline: creative?.title || creative?.name,
        description: creative?.body,
        ctaType: creative?.call_to_action_type,
        mediaUrls,
        platform: "META",
      });

      await prisma.adCreative.upsert({
        where: {
          organizationId_externalId_platform: {
            organizationId: org.id,
            externalId: ad.id,
            platform: "META",
          },
        },
        update: {
          name: ad.name || null,
          status: ad.status || "ACTIVE",
          type: adType,
          mediaUrls,
          headline: creative?.title || creative?.name || null,
          description: creative?.body || null,
          ctaType: creative?.call_to_action_type || null,
          classificationAuto: classification.type,
          classificationScore: classification.confidence,
          campaignId: dbCampaignId,
          // adSetId se actualiza en Step 4 cuando ya tenemos el adSetMap
        },
        create: {
          organizationId: org.id,
          externalId: ad.id,
          platform: "META",
          name: ad.name || null,
          status: ad.status || "ACTIVE",
          type: adType,
          mediaUrls,
          headline: creative?.title || creative?.name || null,
          description: creative?.body || null,
          ctaType: creative?.call_to_action_type || null,
          classificationAuto: classification.type,
          classificationScore: classification.confidence,
          campaignId: dbCampaignId,
        },
      });
      adsUpserted++;
    }

    // 3b: Pre-build externalId -> dbId map (1 query, no N+1)
    const creativeMap: Record<string, string> = {};
    const allCreatives = await prisma.adCreative.findMany({
      where: { organizationId: org.id, platform: "META" },
      select: { id: true, externalId: true },
    });
    for (const c of allCreatives) {
      creativeMap[c.externalId] = c.id;
    }

    // 3c: Fetch ad-level insights (con video metrics)
    if (!shouldStop()) {
      const adInsights = await connector.fetchAdInsights({
        startDate: since,
        endDate: until,
      });

      for (const insight of adInsights) {
        if (shouldStop()) { stoppedEarly = true; break; }
        const dbCreativeId = creativeMap[insight.ad_id];
        if (!dbCreativeId) continue;

        const conversions = MetaAdsConnector.extractAdConversions(insight);
        const conversionValue = MetaAdsConnector.extractAdConversionValue(insight);

        const videoPlays = MetaAdsConnector.extractVideoPlays(insight);
        const videoP25 = MetaAdsConnector.extractVideoWatched(insight, 25);
        const videoP50 = MetaAdsConnector.extractVideoWatched(insight, 50);
        const videoP75 = MetaAdsConnector.extractVideoWatched(insight, 75);
        const videoP100 = MetaAdsConnector.extractVideoWatched(insight, 100);

        await prisma.adCreativeMetricDaily.upsert({
          where: {
            creativeId_date: {
              creativeId: dbCreativeId,
              date: new Date(insight.date_start),
            },
          },
          update: {
            platform: "META",
            impressions: parseInt(insight.impressions || "0"),
            clicks: parseInt(insight.clicks || "0"),
            spend: parseFloat(insight.spend || "0"),
            conversions,
            conversionValue,
            reach: insight.reach ? parseInt(insight.reach) : null,
            frequency: insight.frequency ? parseFloat(insight.frequency) : null,
            videoPlays,
            videoP25Watched: videoP25,
            videoP50Watched: videoP50,
            videoP75Watched: videoP75,
            videoP100Watched: videoP100,
            organizationId: org.id,
          } as any,
          create: {
            creativeId: dbCreativeId,
            date: new Date(insight.date_start),
            platform: "META",
            impressions: parseInt(insight.impressions || "0"),
            clicks: parseInt(insight.clicks || "0"),
            spend: parseFloat(insight.spend || "0"),
            conversions,
            conversionValue,
            reach: insight.reach ? parseInt(insight.reach) : null,
            frequency: insight.frequency ? parseFloat(insight.frequency) : null,
            videoPlays,
            videoP25Watched: videoP25,
            videoP50Watched: videoP50,
            videoP75Watched: videoP75,
            videoP100Watched: videoP100,
            organizationId: org.id,
          } as any,
        });
        adMetricsUpserted++;
      }
    } else {
      stoppedEarly = true;
    }
  } catch (e: any) {
    console.error("Meta ad sync error (non-fatal):", e.message);
  }

  // ═══════════════════════════════════════════
  // STEP 4: Ad Sets (BAJA PRIORIDAD - solo si hay tiempo)
  // ═══════════════════════════════════════════
  let adSetsUpserted = 0;
  let adSetMetricsUpserted = 0;
  const adSetMap: Record<string, string> = {};

  if (!shouldStop()) {
    try {
      const adSetsRes = await fetch(
        `https://graph.facebook.com/v19.0/${metaAdAccount}/adsets?fields=id,name,status,campaign_id,daily_budget,bid_strategy,optimization_goal,targeting&limit=500&access_token=${metaToken}`
      );
      const adSetsData = await adSetsRes.json();

      if (adSetsData.data) {
        for (const as of adSetsData.data) {
          if (shouldStop()) { stoppedEarly = true; break; }
          const dbCampaignId = campaignMap[as.campaign_id];
          if (!dbCampaignId) continue;

          const targeting = as.targeting;
          let targetingInfo = null;
          if (targeting) {
            const parts = [];
            if (targeting.age_min || targeting.age_max) parts.push(`${targeting.age_min || 18}-${targeting.age_max || 65}+`);
            if (targeting.genders?.length) parts.push(targeting.genders.includes(1) ? "M" : targeting.genders.includes(2) ? "F" : "All");
            if (targeting.geo_locations?.countries?.length) parts.push(targeting.geo_locations.countries.join(","));
            if (targeting.interests?.length) parts.push(`${targeting.interests.length} interests`);
            if (targeting.custom_audiences?.length) parts.push(`${targeting.custom_audiences.length} custom audiences`);
            targetingInfo = parts.join(" | ");
          }

          const adSet = await prisma.adSet.upsert({
            where: {
              organizationId_externalId_platform: {
                organizationId: org.id,
                externalId: as.id,
                platform: "META",
              },
            },
            update: {
              name: as.name,
              status: as.status === "ACTIVE" ? "ACTIVE" : as.status === "PAUSED" ? "PAUSED" : "ARCHIVED",
              dailyBudget: as.daily_budget ? parseFloat(as.daily_budget) / 100 : null,
              bidStrategy: as.bid_strategy || null,
              optimizationGoal: as.optimization_goal || null,
              targetingInfo,
              campaignId: dbCampaignId,
            },
            create: {
              organizationId: org.id,
              externalId: as.id,
              platform: "META",
              name: as.name,
              status: as.status === "ACTIVE" ? "ACTIVE" : as.status === "PAUSED" ? "PAUSED" : "ARCHIVED",
              dailyBudget: as.daily_budget ? parseFloat(as.daily_budget) / 100 : null,
              bidStrategy: as.bid_strategy || null,
              optimizationGoal: as.optimization_goal || null,
              targetingInfo,
              campaignId: dbCampaignId,
            },
          });
          adSetMap[as.id] = adSet.id;
          adSetsUpserted++;
        }
      }

      // Ad set insights solo si sobra tiempo
      if (!shouldStop()) {
        const adSetInsightsRes = await fetch(
          `https://graph.facebook.com/v19.0/${metaAdAccount}/insights?fields=adset_id,spend,impressions,clicks,actions,action_values,reach,frequency&time_range={"since":"${since}","until":"${until}"}&time_increment=1&level=adset&limit=500&access_token=${metaToken}`
        );
        const adSetInsightsData = await adSetInsightsRes.json();

        if (adSetInsightsData.data) {
          for (const day of adSetInsightsData.data) {
            if (shouldStop()) { stoppedEarly = true; break; }
            const dbAdSetId = adSetMap[day.adset_id];
            if (!dbAdSetId) continue;

            const purchases = day.actions?.find((a: any) => a.action_type === "purchase")?.value || 0;
            const purchaseValue = day.action_values?.find((a: any) => a.action_type === "purchase")?.value || 0;

            await prisma.adSetMetricDaily.upsert({
              where: { adSetId_date: { adSetId: dbAdSetId, date: new Date(day.date_start) } },
              update: { platform: "META", spend: parseFloat(day.spend || "0"), impressions: parseInt(day.impressions || "0"), clicks: parseInt(day.clicks || "0"), conversions: parseInt(purchases), conversionValue: parseFloat(purchaseValue), reach: day.reach ? parseInt(day.reach) : null, frequency: day.frequency ? parseFloat(day.frequency) : null, organizationId: org.id },
              create: { adSetId: dbAdSetId, date: new Date(day.date_start), platform: "META", spend: parseFloat(day.spend || "0"), impressions: parseInt(day.impressions || "0"), clicks: parseInt(day.clicks || "0"), conversions: parseInt(purchases), conversionValue: parseFloat(purchaseValue), reach: day.reach ? parseInt(day.reach) : null, frequency: day.frequency ? parseFloat(day.frequency) : null, organizationId: org.id },
            });
            adSetMetricsUpserted++;
          }

          let nextAdSetPage = adSetInsightsData.paging?.next;
          while (nextAdSetPage && !shouldStop()) {
            const pageRes = await fetch(nextAdSetPage);
            const pageData = await pageRes.json();
            if (pageData.data) {
              for (const day of pageData.data) {
                if (shouldStop()) { stoppedEarly = true; break; }
                const dbAdSetId = adSetMap[day.adset_id];
                if (!dbAdSetId) continue;
                const purchases = day.actions?.find((a: any) => a.action_type === "purchase")?.value || 0;
                const purchaseValue = day.action_values?.find((a: any) => a.action_type === "purchase")?.value || 0;
                await prisma.adSetMetricDaily.upsert({
                  where: { adSetId_date: { adSetId: dbAdSetId, date: new Date(day.date_start) } },
                  update: { platform: "META", spend: parseFloat(day.spend || "0"), impressions: parseInt(day.impressions || "0"), clicks: parseInt(day.clicks || "0"), conversions: parseInt(purchases), conversionValue: parseFloat(purchaseValue), organizationId: org.id },
                  create: { adSetId: dbAdSetId, date: new Date(day.date_start), platform: "META", spend: parseFloat(day.spend || "0"), impressions: parseInt(day.impressions || "0"), clicks: parseInt(day.clicks || "0"), conversions: parseInt(purchases), conversionValue: parseFloat(purchaseValue), organizationId: org.id },
                });
                adSetMetricsUpserted++;
              }
            }
            nextAdSetPage = pageData.paging?.next;
          }
        }
      } else {
        stoppedEarly = true;
      }
    } catch (e: any) {
      console.error("Meta ad set sync error (non-fatal):", e.message);
    }
  } else {
    stoppedEarly = true;
  }

  // ═══════════════════════════════════════════
  // STEP 5: Cleanup + connection status
  // ═══════════════════════════════════════════
  const oldCampaign = await prisma.adCampaign.findFirst({
    where: { organizationId: org.id, platform: "META", externalId: "all" },
  });

  let cleanedUp = false;
  if (oldCampaign) {
    await prisma.adMetricDaily.deleteMany({ where: { campaignId: oldCampaign.id } });
    await prisma.adCampaign.delete({ where: { id: oldCampaign.id } });
    cleanedUp = true;
  }

  await prisma.connection.upsert({
    where: { organizationId_platform: { organizationId: org.id, platform: "META_ADS" } },
    update: { status: "ACTIVE", lastSyncAt: new Date(), lastSyncError: null },
    create: { organizationId: org.id, platform: "META_ADS", status: "ACTIVE", lastSyncAt: new Date(), lastSyncError: null, credentials: {} },
  });

  return NextResponse.json({
    ok: true,
    campaignsUpserted,
    metricsUpserted,
    adsUpserted,
    adMetricsUpserted,
    adSetsUpserted,
    adSetMetricsUpserted,
    cleanedUpAllCampaigns: cleanedUp,
    campaigns: Object.keys(campaignMap).length,
    adSets: Object.keys(adSetMap).length,
    stoppedEarly,
    runtimeMs: Date.now() - syncStart,
  });
}
