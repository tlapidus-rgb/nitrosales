import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (key !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Count adMetricDaily by platform and organizationId status
  const allMetrics = await prisma.adMetricDaily.findMany({
    select: { platform: true, organizationId: true, spend: true, date: true },
  });

  const byPlatform: Record<string, { count: number; spend: number; withOrgId: number; withoutOrgId: number }> = {};
  for (const m of allMetrics) {
    const p = m.platform || "null";
    if (!byPlatform[p]) byPlatform[p] = { count: 0, spend: 0, withOrgId: 0, withoutOrgId: 0 };
    byPlatform[p].count++;
    byPlatform[p].spend += m.spend;
    if (m.organizationId) byPlatform[p].withOrgId++;
    else byPlatform[p].withoutOrgId++;
  }

  // Count campaigns by platform
  const allCampaigns = await prisma.adCampaign.findMany({
    select: { platform: true, organizationId: true, id: true },
  });

  const campaignsByPlatform: Record<string, number> = {};
  for (const c of allCampaigns) {
    const p = c.platform || "null";
    campaignsByPlatform[p] = (campaignsByPlatform[p] || 0) + 1;
  }

  // Check org
  const org = await prisma.organization.findFirst({ where: { slug: "elmundodeljuguete" } });

  return NextResponse.json({
    totalMetrics: allMetrics.length,
    byPlatform,
    campaignsByPlatform,
    totalCampaigns: allCampaigns.length,
    orgId: org?.id,
    sampleGoogle: allMetrics.filter(m => m.platform === "GOOGLE").slice(0, 3),
  });
}
