import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const revalidate = 300; // CDN cache 5 min

export async function GET() {
  try {
    const org = await prisma.organization.findFirst({
      where: { slug: "elmundodeljuguete" },
    });
    if (!org)
      return NextResponse.json({ error: "Org not found" }, { status: 404 });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const campaigns = await prisma.adCampaign.findMany({
      where: { organizationId: org.id },
      include: {
        dailyMetrics: {
          where: { date: { gte: thirtyDaysAgo } },
        },
      },
    });

    const result = campaigns
      .map((c) => {
        const spend = c.dailyMetrics.reduce((s, m) => s + m.spend, 0);
        const impressions = c.dailyMetrics.reduce((s, m) => s + m.impressions, 0);
        const clicks = c.dailyMetrics.reduce((s, m) => s + m.clicks, 0);
        const conversions = c.dailyMetrics.reduce((s, m) => s + m.conversions, 0);
        const conversionValue = c.dailyMetrics.reduce(
          (s, m) => s + m.conversionValue,
          0
        );

        return {
          id: c.id,
          name: c.name,
          platform: c.platform,
          status: c.status,
          objective: c.objective,
          spend,
          impressions,
          clicks,
          ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
          cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
          conversions,
          conversionValue,
          roas: spend > 0 ? Math.round((conversionValue / spend) * 100) / 100 : 0,
          daysWithData: c.dailyMetrics.length,
        };
      })
      .filter((c) => c.spend > 0 || c.impressions > 0)
      .sort((a, b) => b.spend - a.spend);

    return NextResponse.json({
      campaigns: result,
      totals: {
        spend: result.reduce((s, c) => s + c.spend, 0),
        impressions: result.reduce((s, c) => s + c.impressions, 0),
        clicks: result.reduce((s, c) => s + c.clicks, 0),
        conversions: result.reduce((s, c) => s + c.conversions, 0),
        conversionValue: result.reduce((s, c) => s + c.conversionValue, 0),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
