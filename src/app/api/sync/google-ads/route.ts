// @ts-nocheck
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { GoogleAdsConnector } from "@/lib/connectors/google-ads";
import { classifyCreative } from "@/lib/classification/ad-classifier";
import { getOrganization } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ Google Ads OAuth: get access token from refresh token ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
async function getAccessToken(): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || "",
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN || "",
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google OAuth error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.access_token;
}

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ Execute GAQL query via searchStream ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
async function queryGoogleAds(accessToken: string, gaql: string): Promise<any[]> {
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "");
  const url = `https://googleads.googleapis.com/v20/customers/${customerId}/googleAds:searchStream`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
      "login-customer-id": (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/-/g, ""),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: gaql }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google Ads API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const results: any[] = [];
  for (const batch of data) {
    if (batch.results) {
      results.push(...batch.results);
    }
  }
  return results;
}

// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ Helper: cost_micros ÃÂ¢ÃÂÃÂ currency ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
function microsToCurrency(micros: string | number): number {
  const val = typeof micros === "string" ? parseInt(micros) : micros;
  return val / 1_000_000;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const syncKey = searchParams.get("key");

    if (syncKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate env vars
    const required = [
      "GOOGLE_ADS_CLIENT_ID",
      "GOOGLE_ADS_CLIENT_SECRET",
      "GOOGLE_ADS_REFRESH_TOKEN",
      "GOOGLE_ADS_DEVELOPER_TOKEN",
      "GOOGLE_ADS_CUSTOMER_ID",
    ];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      return NextResponse.json({
        status: "skipped",
        reason: `Missing env vars: ${missing.join(", ")}`,
      });
    }

    // Get org
    const org = await getOrganization();

    // Step 1: Get access token
    const accessToken = await getAccessToken();

    // Step 2: Fetch campaigns
    const campaignResults = await queryGoogleAds(
      accessToken,
      `SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      ORDER BY campaign.name`
    );

    // Step 3: Upsert campaigns into DB
    const campaignMap: Record<string, string> = {}; // externalId ÃÂ¢ÃÂÃÂ dbId
    for (const row of campaignResults) {
      const c = row.campaign;
      const externalId = String(c.id);
      const campaign = await prisma.adCampaign.upsert({
        where: {
          organizationId_externalId_platform: {
            organizationId: org.id,
            externalId,
            platform: "GOOGLE",
          },
        },
        update: {
          name: c.name,
          status: c.status || "UNKNOWN",
          objective: c.advertisingChannelType || null,
        },
        create: {
          organizationId: org.id,
          externalId,
          platform: "GOOGLE",
          name: c.name,
          status: c.status || "UNKNOWN",
          objective: c.advertisingChannelType || null,
        },
      });
      campaignMap[externalId] = campaign.id;
    }

    // Step 4: Fetch campaign metrics for last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    const metricsResults = await queryGoogleAds(
      accessToken,
      `SELECT
        campaign.id,
        campaign.name,
        segments.date,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.search_impression_share
      FROM campaign
      WHERE segments.date BETWEEN '${formatDate(startDate)}' AND '${formatDate(endDate)}'
        AND campaign.status != 'REMOVED'`
    );

    // Step 5: Upsert daily metrics
    let metricsUpserted = 0;
    let metricsErrors = 0;

    for (const row of metricsResults) {
      try {
        const campaignExternalId = String(row.campaign.id);
        const dbCampaignId = campaignMap[campaignExternalId];

        if (!dbCampaignId) {
          // Campaign was removed or not in our map, skip
          metricsErrors++;
          continue;
        }

        const dateStr = row.segments.date; // "2026-03-01"
        const metricDate = new Date(dateStr + "T00:00:00Z");

        const impressions = parseInt(row.metrics.impressions || "0");
        const clicks = parseInt(row.metrics.clicks || "0");
        const spend = microsToCurrency(row.metrics.costMicros || "0");
        const conversions = Math.round(parseFloat(row.metrics.conversions || "0"));
        const conversionValue = parseFloat(row.metrics.conversionsValue || "0");
        const impressionShare = row.metrics.searchImpressionShare
          ? parseFloat(row.metrics.searchImpressionShare)
          : null;

        await prisma.adMetricDaily.upsert({
          where: {
            campaignId_date: {
              campaignId: dbCampaignId,
              date: metricDate,
            },
          },
          update: {
            platform: "GOOGLE",
            impressions,
            clicks,
            spend,
            conversions,
            conversionValue,
            impressionShare,
            organizationId: org.id,
          },
          create: {
            campaignId: dbCampaignId,
            date: metricDate,
            platform: "GOOGLE",
            impressions,
            clicks,
            spend,
            conversions,
            conversionValue,
            impressionShare,
            organizationId: org.id,
          },
        });

        metricsUpserted++;
      } catch (e: any) {
        metricsErrors++;
        console.error("Google Ads metric upsert error:", e.message);
      }
    }

    // Step 5b: Sync Ad Groups
    let adGroupsUpserted = 0;
    let adGroupMetricsUpserted = 0;
    const adGroupMap: Record<string, string> = {}; // externalId -> dbId

    try {
      const adGroupResults = await queryGoogleAds(
        accessToken,
        `SELECT
          ad_group.id,
          ad_group.name,
          ad_group.status,
          ad_group.type,
          campaign.id
        FROM ad_group
        WHERE ad_group.status != 'REMOVED'
          AND campaign.status != 'REMOVED'`
      );

      for (const row of adGroupResults) {
        const ag = row.adGroup;
        const campaignExternalId = String(row.campaign?.id);
        const dbCampaignId = campaignMap[campaignExternalId];
        if (!ag || !dbCampaignId) continue;

        const externalId = String(ag.id);
        const adGroup = await prisma.adSet.upsert({
          where: {
            organizationId_externalId_platform: {
              organizationId: org.id,
              externalId,
              platform: "GOOGLE",
            },
          },
          update: {
            name: ag.name,
            status: ag.status || "UNKNOWN",
            optimizationGoal: ag.type || null,
            campaignId: dbCampaignId,
          },
          create: {
            organizationId: org.id,
            externalId,
            platform: "GOOGLE",
            name: ag.name,
            status: ag.status || "UNKNOWN",
            optimizationGoal: ag.type || null,
            campaignId: dbCampaignId,
          },
        });
        adGroupMap[externalId] = adGroup.id;
        adGroupsUpserted++;
      }

      // Fetch ad group level metrics
      const agMetricResults = await queryGoogleAds(
        accessToken,
        `SELECT
          ad_group.id,
          segments.date,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.conversions_value
        FROM ad_group
        WHERE segments.date BETWEEN '${formatDate(startDate)}' AND '${formatDate(endDate)}'
          AND ad_group.status != 'REMOVED'
          AND campaign.status != 'REMOVED'`
      );

      for (const row of agMetricResults) {
        try {
          const agExternalId = String(row.adGroup?.id);
          const dbAdGroupId = adGroupMap[agExternalId];
          if (!dbAdGroupId) continue;

          const dateStr = row.segments?.date;
          if (!dateStr) continue;

          await prisma.adSetMetricDaily.upsert({
            where: {
              adSetId_date: {
                adSetId: dbAdGroupId,
                date: new Date(dateStr + "T00:00:00Z"),
              },
            },
            update: {
              platform: "GOOGLE",
              impressions: parseInt(row.metrics?.impressions || "0"),
              clicks: parseInt(row.metrics?.clicks || "0"),
              spend: microsToCurrency(row.metrics?.costMicros || "0"),
              conversions: Math.round(parseFloat(row.metrics?.conversions || "0")),
              conversionValue: parseFloat(row.metrics?.conversionsValue || "0"),
              organizationId: org.id,
            },
            create: {
              adSetId: dbAdGroupId,
              date: new Date(dateStr + "T00:00:00Z"),
              platform: "GOOGLE",
              impressions: parseInt(row.metrics?.impressions || "0"),
              clicks: parseInt(row.metrics?.clicks || "0"),
              spend: microsToCurrency(row.metrics?.costMicros || "0"),
              conversions: Math.round(parseFloat(row.metrics?.conversions || "0")),
              conversionValue: parseFloat(row.metrics?.conversionsValue || "0"),
              organizationId: org.id,
            },
          });
          adGroupMetricsUpserted++;
        } catch (e: any) {
          console.error("Google ad group metric upsert error:", e.message);
        }
      }
    } catch (e: any) {
      console.error("Google ad group sync error (non-fatal):", e.message);
    }

    // Step 6: Sync individual ads
    let adsUpserted = 0;
    let adMetricsUpserted = 0;

    try {
      // Fetch ads (now also getting ad_group.id)
      const adResults = await queryGoogleAds(
        accessToken,
        `SELECT
          ad_group_ad.ad.id,
          ad_group_ad.ad.name,
          ad_group_ad.ad.type,
          ad_group_ad.ad.responsive_search_ad.headlines,
          ad_group_ad.ad.responsive_search_ad.descriptions,
          ad_group_ad.ad.responsive_display_ad.headlines,
          ad_group_ad.ad.responsive_display_ad.descriptions,
          ad_group_ad.status,
          ad_group.id,
          campaign.id,
          campaign.name
        FROM ad_group_ad
        WHERE ad_group_ad.status != 'REMOVED'
          AND campaign.status != 'REMOVED'`
      );

      for (const row of adResults) {
        const ad = row.adGroupAd?.ad;
        const campaignExternalId = String(row.campaign?.id);
        const adGroupExternalId = String(row.adGroup?.id);
        const dbCampaignId = campaignMap[campaignExternalId];
        const dbAdGroupId = adGroupExternalId ? adGroupMap[adGroupExternalId] : null;
        if (!ad || !dbCampaignId) continue;

        const adExternalId = String(ad.id);
        const adType = GoogleAdsConnector.detectAdType(ad.type || "");
        const headline = GoogleAdsConnector.extractHeadline(row);
        const description = GoogleAdsConnector.extractDescription(row);

        const classification = classifyCreative({
          adName: ad.name,
          campaignName: row.campaign?.name,
          adType,
          headline,
          description,
          platform: "GOOGLE",
        });

        await prisma.adCreative.upsert({
          where: {
            organizationId_externalId_platform: {
              organizationId: org.id,
              externalId: adExternalId,
              platform: "GOOGLE",
            },
          },
          update: {
            name: ad.name || null,
            status: row.adGroupAd?.status || "ACTIVE",
            type: adType,
            headline,
            description,
            classificationAuto: classification.type,
            classificationScore: classification.confidence,
            campaignId: dbCampaignId,
            adSetId: dbAdGroupId,
          },
          create: {
            organizationId: org.id,
            externalId: adExternalId,
            platform: "GOOGLE",
            name: ad.name || null,
            status: row.adGroupAd?.status || "ACTIVE",
            type: adType,
            headline,
            description,
            classificationAuto: classification.type,
            classificationScore: classification.confidence,
            adSetId: dbAdGroupId,
            campaignId: dbCampaignId,
          },
        });
        adsUpserted++;
      }

      // Fetch daily metrics per ad
      const adMetricResults = await queryGoogleAds(
        accessToken,
        `SELECT
          ad_group_ad.ad.id,
          campaign.id,
          segments.date,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.conversions_value
        FROM ad_group_ad
        WHERE segments.date BETWEEN '${formatDate(startDate)}' AND '${formatDate(endDate)}'
          AND ad_group_ad.status != 'REMOVED'
          AND campaign.status != 'REMOVED'`
      );

      for (const row of adMetricResults) {
        try {
          const adExternalId = String(row.adGroupAd?.ad?.id);
          const dbCreative = await prisma.adCreative.findFirst({
            where: {
              organizationId: org.id,
              externalId: adExternalId,
              platform: "GOOGLE",
            },
          });
          if (!dbCreative) continue;

          const dateStr = row.segments?.date;
          if (!dateStr) continue;

          await prisma.adCreativeMetricDaily.upsert({
            where: {
              creativeId_date: {
                creativeId: dbCreative.id,
                date: new Date(dateStr + "T00:00:00Z"),
              },
            },
            update: {
              platform: "GOOGLE",
              impressions: parseInt(row.metrics?.impressions || "0"),
              clicks: parseInt(row.metrics?.clicks || "0"),
              spend: microsToCurrency(row.metrics?.costMicros || "0"),
              conversions: Math.round(parseFloat(row.metrics?.conversions || "0")),
              conversionValue: parseFloat(row.metrics?.conversionsValue || "0"),
              organizationId: org.id,
            },
            create: {
              creativeId: dbCreative.id,
              date: new Date(dateStr + "T00:00:00Z"),
              platform: "GOOGLE",
              impressions: parseInt(row.metrics?.impressions || "0"),
              clicks: parseInt(row.metrics?.clicks || "0"),
              spend: microsToCurrency(row.metrics?.costMicros || "0"),
              conversions: Math.round(parseFloat(row.metrics?.conversions || "0")),
              conversionValue: parseFloat(row.metrics?.conversionsValue || "0"),
              organizationId: org.id,
            },
          });
          adMetricsUpserted++;
        } catch (e: any) {
          console.error("Google ad metric upsert error:", e.message);
        }
      }
    } catch (e: any) {
      console.error("Google ad sync error (non-fatal):", e.message);
    }

    // Update connection status to ACTIVE
    await prisma.connection.upsert({
      where: { organizationId_platform: { organizationId: org.id, platform: "GOOGLE_ADS" } },
      update: { status: "ACTIVE", lastSyncAt: new Date(), lastSyncError: null },
      create: { organizationId: org.id, platform: "GOOGLE_ADS", status: "ACTIVE", lastSyncAt: new Date(), lastSyncError: null, credentials: {} },
    });

    return NextResponse.json({
      status: "ok",
      campaigns: campaignResults.length,
      campaignsSynced: Object.keys(campaignMap).length,
      adGroupsUpserted,
      adGroupMetricsUpserted,
      metricsRows: metricsResults.length,
      metricsUpserted,
      metricsErrors,
      adsUpserted,
      adMetricsUpserted,
      dateRange: {
        from: formatDate(startDate),
        to: formatDate(endDate),
      },
    });
  } catch (error: any) {
    console.error("Google Ads sync error:", error);
    // Update connection status to ERROR
    try {
      const errOrg = await getOrganization();
      await prisma.connection.upsert({
        where: { organizationId_platform: { organizationId: errOrg.id, platform: "GOOGLE_ADS" } },
        update: { status: "ERROR", lastSyncAt: new Date(), lastSyncError: error.message },
        create: { organizationId: errOrg.id, platform: "GOOGLE_ADS", status: "ERROR", lastSyncAt: new Date(), lastSyncError: error.message, credentials: {} },
      });
    } catch (_) {}
    return NextResponse.json(
      {
        error: "Google Ads sync failed",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
