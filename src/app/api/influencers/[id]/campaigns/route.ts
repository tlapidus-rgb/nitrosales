export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Influencer Campaigns API
// ══════════════════════════════════════════════════════════════
// GET  — List campaigns for an influencer
// POST — Create a new campaign
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);

    const campaigns = await prisma.influencerCampaign.findMany({
      where: { influencerId: params.id, organizationId: org.id },
      include: {
        _count: { select: { attributions: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Enrich with revenue
    const enriched = await Promise.all(
      campaigns.map(async (c) => {
        const agg = await prisma.influencerAttribution.aggregate({
          where: { campaignId: c.id, organizationId: org.id },
          _sum: { attributedValue: true, commissionAmount: true },
        });
        return {
          ...c,
          totalRevenue: agg._sum.attributedValue || 0,
          totalCommission: agg._sum.commissionAmount || 0,
        };
      })
    );

    return NextResponse.json({ campaigns: enriched });
  } catch (error: any) {
    console.error("[Influencer Campaigns GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    if (!body.name || !body.startDate) {
      return NextResponse.json(
        { error: "name and startDate are required" },
        { status: 400 }
      );
    }

    // Verify influencer ownership
    const influencer = await prisma.influencer.findFirst({
      where: { id: params.id, organizationId: org.id },
    });
    if (!influencer) {
      return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
    }

    const campaign = await prisma.influencerCampaign.create({
      data: {
        organizationId: org.id,
        influencerId: params.id,
        name: body.name,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        description: body.description || null,
        bonusTarget: body.bonusTarget ?? null,
        bonusAmount: body.bonusAmount ?? null,
      },
    });

    // Build tracking link with campaign
    const baseUrl = process.env.STORE_URL || "";
    const campaignSlug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 30);
    const trackingLink = `${baseUrl}/?utm_source=inf_${influencer.code}&utm_medium=influencer&utm_campaign=${campaignSlug}`;

    return NextResponse.json({ campaign, trackingLink });
  } catch (error: any) {
    console.error("[Influencer Campaigns POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
