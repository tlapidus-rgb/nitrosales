import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (key !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await prisma.organization.findFirst({
    where: { slug: "elmundodeljuguete" },
  });
  if (!org)
    return NextResponse.json({ error: "Org not found" }, { status: 404 });

  const metaToken = process.env.META_ADS_ACCESS_TOKEN || "";
  const metaAdAccount = process.env.META_ADS_AD_ACCOUNT_ID || "";

  if (!metaToken || !metaAdAccount) {
    return NextResponse.json({ error: "Missing Meta credentials" });
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since = thirtyDaysAgo.toISOString().split("T")[0];
  const until = now.toISOString().split("T")[0];

  // Step 1: Fetch all campaigns from Meta
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

  // Step 2: Upsert each campaign
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

  // Step 3: Fetch insights at campaign level
  const insightsRes = await fetch(
    `https://graph.facebook.com/v19.0/${metaAdAccount}/insights?fields=campaign_id,spend,impressions,clicks,actions,action_values&time_range={"since":"${since}","until":"${until}"}&time_increment=1&level=campaign&limit=500&access_token=${metaToken}`
  );
  const insightsData = await insightsRes.json();

  if (insightsData.data) {
    for (const day of insightsData.data) {
      const campaignExternalId = day.campaign_id;
      const dbCampaignId = campaignMap[campaignExternalId];
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

    // Handle pagination
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
      }
      nextPage = pageData.paging?.next;
    }
  }

  // Step 4: Clean up old "All Campaigns" entry and its metrics
  const oldCampaign = await prisma.adCampaign.findFirst({
    where: {
      organizationId: org.id,
      platform: "META",
      externalId: "all",
    },
  });

  let cleanedUp = false;
  if (oldCampaign) {
    await prisma.adMetricDaily.deleteMany({
      where: { campaignId: oldCampaign.id },
    });
    await prisma.adCampaign.delete({
      where: { id: oldCampaign.id },
    });
    cleanedUp = true;
  }

  return NextResponse.json({
    ok: true,
    campaignsUpserted,
    metricsUpserted,
    cleanedUpAllCampaigns: cleanedUp,
    campaigns: Object.keys(campaignMap).length,
  });
}
