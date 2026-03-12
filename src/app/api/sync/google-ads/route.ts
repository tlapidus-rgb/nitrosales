import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// ── Google Ads OAuth: get access token from refresh token ──
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

// ── Execute GAQL query via searchStream ──
async function queryGoogleAds(accessToken: string, gaql: string): Promise<any[]> {
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "");
  const url = `https://googleads.googleapis.com/v16/customers/${customerId}/googleAds:searchStream`;

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

// ── Helper: cost_micros → currency ──
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
    const org = await prisma.organization.findFirst({
      where: { slug: "elmundodeljuguete" },
    });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

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
    const campaignMap: Record<string, string> = {}; // externalId → dbId
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

    return NextResponse.json({
      status: "ok",
      campaigns: campaignResults.length,
      campaignsSynced: Object.keys(campaignMap).length,
      metricsRows: metricsResults.length,
      metricsUpserted,
      metricsErrors,
      dateRange: {
        from: formatDate(startDate),
        to: formatDate(endDate),
      },
    });
  } catch (error: any) {
    console.error("Google Ads sync error:", error);
    return NextResponse.json(
      {
        error: "Google Ads sync failed",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
