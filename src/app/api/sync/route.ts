import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function POST(req: Request) {
  try {
    const { syncKey } = await req.json();
    if (syncKey !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const org = await prisma.organization.findFirst({ where: { slug: "elmundodeljuguete" } });
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    const results: any = { vtex: null, ga4: null, googleAds: null, metaAds: null };

    // 1. Sync VTEX orders
    try {
      const vtexRes = await fetch(process.env.NEXTAUTH_URL + "/api/sync/vtex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncKey }),
      });
      results.vtex = await vtexRes.json();
    } catch (e: any) {
      results.vtex = { error: e.message };
    }

    // 2. Sync GA4
    results.ga4 = { status: "needs_google_credentials" };

    // 3. Sync Google Ads
    results.googleAds = { status: "needs_google_credentials" };

    // 4. Sync Meta Ads
    try {
      const metaToken = process.env.META_ADS_ACCESS_TOKEN || "";
      const metaAdAccount = process.env.META_ADS_AD_ACCOUNT_ID || "";
      
      if (metaToken && metaAdAccount) {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const since = thirtyDaysAgo.toISOString().split("T")[0];
        const until = now.toISOString().split("T")[0];

        const metaRes = await fetch(
          `https://graph.facebook.com/v19.0/${metaAdAccount}/insights?fields=spend,impressions,clicks,actions,action_values&time_range={"since":"${since}","until":"${until}"}&time_increment=1&access_token=${metaToken}`
        );
        const metaData = await metaRes.json();

        if (metaData.data) {
          // First, ensure an AdCampaign record exists for "all campaigns"
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
            const purchases = day.actions?.find((a: any) => a.action_type === "purchase")?.value || 0;
            const purchaseValue = day.action_values?.find((a: any) => a.action_type === "purchase")?.value || 0;

            await prisma.adMetricDaily.upsert({
              where: {
                campaignId_date: {
                  campaignId: campaign.id,
                  date: new Date(day.date_start),
                },
              },
              update: {
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
          results.metaAds = { ok: true, days: metaData.data.length, synced };
        } else {
          results.metaAds = { error: "No data from Meta", raw: metaData.error?.message };
        }
      } else {
        results.metaAds = { status: "missing_token" };
      }
    } catch (e: any) {
      results.metaAds = { error: e.message };
    }

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
