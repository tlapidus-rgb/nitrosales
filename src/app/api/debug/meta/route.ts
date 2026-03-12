import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (key !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const metaToken = process.env.META_ADS_ACCESS_TOKEN || "";
  const metaAdAccount = process.env.META_ADS_AD_ACCOUNT_ID || "";

  const results: any = {
    hasToken: !!metaToken,
    hasAdAccount: !!metaAdAccount,
    adAccountId: metaAdAccount,
  };

  if (!metaToken || !metaAdAccount) {
    return NextResponse.json({ ...results, error: "Missing Meta credentials" });
  }

  // Test 1: Fetch campaigns
  try {
    const campaignsRes = await fetch(
      `https://graph.facebook.com/v19.0/${metaAdAccount}/campaigns?fields=id,name,status,objective&limit=100&access_token=${metaToken}`
    );
    const campaignsData = await campaignsRes.json();
    results.campaignsApiStatus = campaignsRes.status;
    results.campaignsCount = campaignsData.data?.length || 0;
    results.campaigns = campaignsData.data?.map((c: any) => ({
      id: c.id,
      name: c.name,
      status: c.status,
    }));
    results.campaignsError = campaignsData.error || null;
  } catch (e: any) {
    results.campaignsError = e.message;
  }

  // Test 2: Fetch insights at campaign level (just 1 day for quick test)
  try {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const insightsRes = await fetch(
      `https://graph.facebook.com/v19.0/${metaAdAccount}/insights?fields=campaign_id,campaign_name,spend,impressions,clicks&time_range={"since":"${yesterday}","until":"${today}"}&time_increment=1&level=campaign&limit=100&access_token=${metaToken}`
    );
    const insightsData = await insightsRes.json();
    results.insightsApiStatus = insightsRes.status;
    results.insightsCount = insightsData.data?.length || 0;
    results.insights = insightsData.data?.slice(0, 5);
    results.insightsError = insightsData.error || null;
  } catch (e: any) {
    results.insightsError = e.message;
  }

  // Test 3: Check DB campaigns for Meta
  const dbCampaigns = await prisma.adCampaign.findMany({
    where: { platform: "META" },
    select: { id: true, name: true, externalId: true, status: true },
  });
  results.dbMetaCampaigns = dbCampaigns;

  return NextResponse.json(results);
}
