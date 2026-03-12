import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

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

async function queryGoogleAds(accessToken: string, customerId: string, gaql: string): Promise<any[]> {
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
  const batches = await response.json();
  const results: any[] = [];
  for (const batch of batches) {
    if (batch.results) {
      results.push(...batch.results);
    }
  }
  return results;
}

function microsToCurrency(micros: string | number): number {
  const val = typeof micros === "string" ? parseInt(micros) : micros;
  return val / 1_000_000;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const syncKey = url.searchParams.get("key");

    if (syncKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requiredVars = [
      "GOOGLE_ADS_CLIENT_ID",
      "GOOGLE_ADS_CLIENT_SECRET",
      "GOOGLE_ADS_REFRESH_TOKEN",
      "GOOGLE_ADS_DEVELOPER_TOKEN",
      "GOOGLE_ADS_CUSTOMER_ID",
    ];
    const missing = requiredVars.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing env vars: ${missing.join(", ")}` },
        { status: 500 }
      );
    }

    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "");
    const accessToken = await getAccessToken();

    const org = await prisma.organization.findFirst();
    if (!org) {
      return NextResponse.json({ error: "No organization found" }, { status: 500 });
    }

    // 1. Fetch campaigns
    const campaignResults = await queryGoogleAds(
      accessToken,
      customerId,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type
       FROM campaign
       WHERE campaign.status != 'REMOVED'`
    );

    let campaignsUpserted = 0;
    const campaignMap: Record<string, string> = {};

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
          status: c.status === "ENABLED" ? "ACTIVE" : c.status === "PAUSED" ? "PAUSED" : "ARCHIVED",
        },
        create: {
          organizationId: org.id,
          externalId,
          platform: "GOOGLE",
          name: c.name,
          status: c.status === "ENABLED" ? "ACTIVE" : c.status === "PAUSED" ? "PAUSED" : "ARCHIVED",
        },
      });
      campaignMap[externalId] = campaign.id;
      campaignsUpserted++;
    }

    // 2. Fetch 30 days of metrics
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split("T")[0];
    const endDate = today.toISOString().split("T")[0];

    const metricResults = await queryGoogleAds(
      accessToken,
      customerId,
      `SELECT campaign.id, segments.date, metrics.impressions, metrics.clicks,
              metrics.cost_micros, metrics.conversions, metrics.conversions_value,
              metrics.search_impression_share
       FROM campaign
       WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
         AND campaign.status != 'REMOVED'`
    );

    let metricsUpserted = 0;
    for (const row of metricResults) {
      const campaignExternalId = String(row.campaign.id);
      const dbCampaignId = campaignMap[campaignExternalId];
      if (!dbCampaignId) continue;

      const m = row.metrics;
      const date = new Date(row.segments.date + "T00:00:00Z");

      await prisma.adMetricDaily.upsert({
        where: {
          campaignId_date: {
            campaignId: dbCampaignId,
            date,
          },
        },
        update: {
          impressions: parseInt(m.impressions || "0"),
          clicks: parseInt(m.clicks || "0"),
          spend: microsToCurrency(m.costMicros || "0"),
          conversions: parseFloat(m.conversions || "0"),
          conversionValue: parseFloat(m.conversionsValue || "0"),
          impressionShare: m.searchImpressionShare ? parseFloat(m.searchImpressionShare) : null,
        },
        create: {
          campaignId: dbCampaignId,
          date,
          impressions: parseInt(m.impressions || "0"),
          clicks: parseInt(m.clicks || "0"),
          spend: microsToCurrency(m.costMicros || "0"),
          conversions: parseFloat(m.conversions || "0"),
          conversionValue: parseFloat(m.conversionsValue || "0"),
          impressionShare: m.searchImpressionShare ? parseFloat(m.searchImpressionShare) : null,
          platform: "GOOGLE",
        },
      });
      metricsUpserted++;
    }

    return NextResponse.json({
      success: true,
      campaignsUpserted,
      metricsUpserted,
      dateRange: { start: startDate, end: endDate },
    });
  } catch (error: any) {
    console.error("Google Ads sync error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
