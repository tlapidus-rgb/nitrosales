import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function runSync(syncKey: string) {
  if (syncKey !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const org = await prisma.organization.findFirst({
    where: { slug: "elmundodeljuguete" },
  });

  if (!org)
    return NextResponse.json({ error: "Org not found" }, { status: 404 });

  const baseUrl = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";

  const results: any = {
    vtex: null,
    vtexDetails: null,
    ga4: null,
    googleAds: null,
    metaAds: null,
  };

  // 1. Sync VTEX orders
  try {
    const vtexRes = await fetch(baseUrl + "/api/sync/vtex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncKey }),
    });
    results.vtex = await vtexRes.json();
  } catch (e: any) {
    results.vtex = { error: e.message };
  }

  // 1b. Fetch VTEX order details (products, items, customers)
  try {
    const vtexDetailsRes = await fetch(
      baseUrl + "/api/sync/vtex-details?key=" + encodeURIComponent(syncKey) + "&batch=5"
    );
    results.vtexDetails = await vtexDetailsRes.json();
  } catch (e: any) {
    results.vtexDetails = { error: e.message };
  }

  // 2. Sync GA4
  try {
    const ga4Res = await fetch(baseUrl + "/api/sync/ga4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncKey }),
    });
    results.ga4 = await ga4Res.json();
  } catch (e: any) {
    results.ga4 = { error: e.message };
  }

  // 3. Sync Google Ads
  try {
    const gadsRes = await fetch(
      baseUrl + `/api/sync/google-ads?key=${encodeURIComponent(syncKey)}`,
      { method: "GET" }
    );
    results.googleAds = await gadsRes.json();
  } catch (e: any) {
    results.googleAds = { error: e.message };
  }

  // 4. Sync Meta Ads (by individual campaign)
  try {
    const metaToken = process.env.META_ADS_ACCESS_TOKEN || "";
    const metaAdAccount = process.env.META_ADS_AD_ACCOUNT_ID || "";

    if (metaToken && metaAdAccount) {
      const now = new Date();
      const thirtyDaysAgo = new Date(
        now.getTime() - 30 * 24 * 60 * 60 * 1000
      );
      const since = thirtyDaysAgo.toISOString().split("T")[0];
      const until = now.toISOString().split("T")[0];

      // Step 1: Fetch all campaigns from Meta
      const campaignsRes = await fetch(
        `https://graph.facebook.com/v19.0/${metaAdAccount}/campaigns?fields=id,name,status,objective&limit=100&access_token=${metaToken}`
      );
      const campaignsData = await campaignsRes.json();

      let campaignsUpserted = 0;
      let metricsUpserted = 0;

      if (campaignsData.data && campaignsData.data.length > 0) {
        // Step 2: Upsert each campaign
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
              status:
                mc.status === "ACTIVE"
                  ? "ACTIVE"
                  : mc.status === "PAUSED"
                  ? "PAUSED"
                  : "ARCHIVED",
              objective: mc.objective || null,
            },
            create: {
              organizationId: org.id,
              externalId: mc.id,
              platform: "META",
              name: mc.name,
              status:
                mc.status === "ACTIVE"
                  ? "ACTIVE"
                  : mc.status === "PAUSED"
                  ? "PAUSED"
                  : "ARCHIVED",
              objective: mc.objective || null,
            },
          });
          campaignMap[mc.id] = campaign.id;
          campaignsUpserted++;
        }

        // Step 3: Fetch insights for all campaigns at once (by campaign breakdown)
        const insightsRes = await fetch(
          `https://graph.facebook.com/v19.0/${metaAdAccount}/insights?fields=campaign_id,spend,impressions,clicks,actions,action_values&time_range={"since":"${since}","until":"${until}"}&time_increment=1&level=campaign&limit=500&access_token=${metaToken}`
        );
        const insightsData = await insightsRes.json();

        if (insightsData.data) {
          for (const day of insightsData.data) {
            const campaignExternalId = day.campaign_id;
            const dbCampaignId = campaignMap[campaignExternalId];
            if (!dbCampaignId) continue;

            const purchases =
              day.actions?.find(
                (a: any) => a.action_type === "purchase"
              )?.value || 0;
            const purchaseValue =
              day.action_values?.find(
                (a: any) => a.action_type === "purchase"
              )?.value || 0;

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

          // Handle pagination if needed
          let nextPage = insightsData.paging?.next;
          while (nextPage) {
            const pageRes = await fetch(nextPage);
            const pageData = await pageRes.json();
            if (pageData.data) {
              for (const day of pageData.data) {
                const campaignExternalId = day.campaign_id;
                const dbCampaignId = campaignMap[campaignExternalId];
                if (!dbCampaignId) continue;

                const purchases =
                  day.actions?.find(
                    (a: any) => a.action_type === "purchase"
                  )?.value || 0;
                const purchaseValue =
                  day.action_values?.find(
                    (a: any) => a.action_type === "purchase"
                  )?.value || 0;

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

        results.metaAds = {
          ok: true,
          campaignsUpserted,
          metricsUpserted,
        };
      } else {
        // Fallback: fetch account-level if no campaigns found
        const metaRes = await fetch(
          `https://graph.facebook.com/v19.0/${metaAdAccount}/insights?fields=spend,impressions,clicks,actions,action_values&time_range={"since":"${since}","until":"${until}"}&time_increment=1&access_token=${metaToken}`
        );
        const metaData = await metaRes.json();

        if (metaData.data) {
          const campaign = await prisma.adCampaign.upsert({
            where: {
              organizationId_externalId_platform: {
                organizationId: org.id,
                externalId: "all",
                platform: "META",
              },
            },
            update: { name: "All Campaigns", status: "ACTIVE" },
            create: {
              organizationId: org.id,
              externalId: "all",
              platform: "META",
              name: "All Campaigns",
              status: "ACTIVE",
            },
          });

          let synced = 0;
          for (const day of metaData.data) {
            const purchases =
              day.actions?.find(
                (a: any) => a.action_type === "purchase"
              )?.value || 0;
            const purchaseValue =
              day.action_values?.find(
                (a: any) => a.action_type === "purchase"
              )?.value || 0;

            await prisma.adMetricDaily.upsert({
              where: {
                campaignId_date: {
                  campaignId: campaign.id,
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
                campaignId: campaign.id,
                date: new Date(day.date_start),
                spend: parseFloat(day.spend || "0"),
                impressions: parseInt(day.impressions || "0"),
                clicks: parseInt(day.clicks || "0"),
                conversions: parseInt(purchases),
                conversionValue: parseFloat(purchaseValue),
              },
            });
            synced++;
          }
          results.metaAds = {
            ok: true,
            fallback: "account-level",
            campaignsUpserted: 1,
            metricsUpserted: synced,
          };
        } else {
          results.metaAds = {
            error: "No data from Meta",
            raw: metaData.error?.message,
          };
        }
      }
    } else {
      results.metaAds = { status: "missing_token" };
    }
  } catch (e: any) {
    results.metaAds = { error: e.message };
  }

  return NextResponse.json({ ok: true, results });
}

// GET handler for Vercel Cron and manual triggers
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const syncKey = url.searchParams.get("key") || "";
    return await runSync(syncKey);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST handler for programmatic calls
export async function POST(req: Request) {
  try {
    const { syncKey } = await req.json();
    return await runSync(syncKey || "");
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
