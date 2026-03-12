import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const ORG_ID = "cmmmga1uq0000sb43w0krvvys";

export async function GET() {
  try {
    const connections = await prisma.connection.findMany({
      where: { organizationId: ORG_ID },
      select: {
        platform: true,
        status: true,
        lastSyncAt: true,
        lastSyncError: true,
      },
      orderBy: { platform: "asc" },
    });

    // Also check data freshness from actual tables
    const [latestOrder, latestWebMetric, latestGoogleAd, latestMetaAd] =
      await Promise.all([
        prisma.order.findFirst({
          where: { organizationId: ORG_ID },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        prisma.webMetricDaily.findFirst({
          where: { organizationId: ORG_ID },
          orderBy: { date: "desc" },
          select: { date: true },
        }),
        prisma.adMetricDaily.findFirst({
          where: {
            campaign: {
              organizationId: ORG_ID,
              platform: "GOOGLE",
            },
          },
          orderBy: { date: "desc" },
          select: { date: true },
        }),
        prisma.adMetricDaily.findFirst({
          where: {
            campaign: {
              organizationId: ORG_ID,
              platform: "META",
            },
          },
          orderBy: { date: "desc" },
          select: { date: true },
        }),
      ]);

    const platformLabels: Record<string, string> = {
      VTEX: "VTEX - Ecommerce",
      GA4: "Google Analytics 4",
      GOOGLE_ADS: "Google Ads",
      META_ADS: "Meta Ads",
    };

    const dataFreshness: Record<string, Date | null> = {
      VTEX: latestOrder?.createdAt || null,
      GA4: latestWebMetric?.date || null,
      GOOGLE_ADS: latestGoogleAd?.date || null,
      META_ADS: latestMetaAd?.date || null,
    };

    const connectors = ["VTEX", "GA4", "GOOGLE_ADS", "META_ADS"].map(
      (platform) => {
        const conn = connections.find((c) => c.platform === platform);
        return {
          platform,
          label: platformLabels[platform] || platform,
          status: conn?.status || "DISCONNECTED",
          lastSyncAt: conn?.lastSyncAt || null,
          lastSyncError: conn?.lastSyncError || null,
          latestDataAt: dataFreshness[platform] || null,
        };
      }
    );

    return NextResponse.json({ connectors });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
