// ══════════════════════════════════════════════════════════════
// Influencer Commission Tiers API
// ══════════════════════════════════════════════════════════════
// GET  — List tiers for an influencer
// POST — Set tiers for an influencer (replaces all)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);

    const influencer = await prisma.influencer.findFirst({
      where: { id: params.id, organizationId: org.id },
      select: { id: true, commissionPercent: true },
    });
    if (!influencer) {
      return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
    }

    const tiers = await prisma.influencerCommissionTier.findMany({
      where: { influencerId: params.id },
      orderBy: { minRevenue: "asc" },
    });

    // Calculate current month revenue to determine active tier
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthAgg = await prisma.influencerAttribution.aggregate({
      where: {
        influencerId: params.id,
        organizationId: org.id,
        createdAt: { gte: startOfMonth },
      },
      _sum: { attributedValue: true },
    });
    const monthRevenue = Number(monthAgg._sum.attributedValue || 0);

    // Find active tier
    let activeTierId: string | null = null;
    for (const tier of tiers) {
      const min = Number(tier.minRevenue);
      const max = tier.maxRevenue ? Number(tier.maxRevenue) : Infinity;
      if (monthRevenue >= min && monthRevenue < max) {
        activeTierId = tier.id;
        break;
      }
    }

    return NextResponse.json({
      tiers,
      monthRevenue,
      activeTierId,
      baseCommission: influencer.commissionPercent,
    });
  } catch (error: any) {
    console.error("[Influencer Tiers GET]", error);
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

    const influencer = await prisma.influencer.findFirst({
      where: { id: params.id, organizationId: org.id },
      select: { id: true },
    });
    if (!influencer) {
      return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
    }

    const tiersInput = body.tiers as Array<{
      minRevenue: number;
      maxRevenue?: number | null;
      commissionPercent: number;
      label?: string;
    }>;

    if (!Array.isArray(tiersInput) || tiersInput.length === 0) {
      return NextResponse.json({ error: "tiers array is required" }, { status: 400 });
    }

    // Replace all tiers — delete existing and create new
    await prisma.influencerCommissionTier.deleteMany({
      where: { influencerId: params.id },
    });

    const created = await Promise.all(
      tiersInput.map((t) =>
        prisma.influencerCommissionTier.create({
          data: {
            influencerId: params.id,
            minRevenue: t.minRevenue,
            maxRevenue: t.maxRevenue ?? null,
            commissionPercent: t.commissionPercent,
            label: t.label || null,
          },
        })
      )
    );

    return NextResponse.json({ tiers: created });
  } catch (error: any) {
    console.error("[Influencer Tiers POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
