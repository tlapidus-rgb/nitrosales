// ══════════════════════════════════════════════════════════════
// Influencer Detail API
// ══════════════════════════════════════════════════════════════
// GET    — Get single influencer detail
// PUT    — Update influencer
// DELETE — Soft delete (set INACTIVE)
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

    const influencer = await prisma.influencer.findFirst({
      where: { id: params.id, organizationId: org.id },
      include: {
        campaigns: { orderBy: { createdAt: "desc" } },
        coupons: true,
        _count: { select: { attributions: true } },
      },
    });

    if (!influencer) {
      return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
    }

    // Aggregated metrics
    const agg = await prisma.influencerAttribution.aggregate({
      where: { influencerId: influencer.id, organizationId: org.id },
      _sum: { attributedValue: true, commissionAmount: true },
      _count: { id: true },
    });

    // Build tracking link
    const baseUrl = process.env.STORE_URL || "https://elmundodeljuguete.com.ar";
    const trackingLink = `${baseUrl}/?utm_source=inf_${influencer.code}&utm_medium=influencer`;

    return NextResponse.json({
      influencer: {
        ...influencer,
        totalRevenue: agg._sum.attributedValue || 0,
        totalCommission: agg._sum.commissionAmount || 0,
        totalConversions: agg._count.id || 0,
        trackingLink,
      },
    });
  } catch (error: any) {
    console.error("[Influencer GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    // Verify ownership
    const existing = await prisma.influencer.findFirst({
      where: { id: params.id, organizationId: org.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
    }

    const influencer = await prisma.influencer.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.commissionPercent !== undefined && { commissionPercent: body.commissionPercent }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.publicName !== undefined && { publicName: body.publicName }),
        ...(body.profileImage !== undefined && { profileImage: body.profileImage }),
        ...(body.isPublicDashboardEnabled !== undefined && {
          isPublicDashboardEnabled: body.isPublicDashboardEnabled,
        }),
      },
    });

    return NextResponse.json({ influencer });
  } catch (error: any) {
    console.error("[Influencer PUT]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);

    // Verify ownership
    const existing = await prisma.influencer.findFirst({
      where: { id: params.id, organizationId: org.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
    }

    // Soft delete — set to INACTIVE instead of destroying data
    await prisma.influencer.update({
      where: { id: params.id },
      data: { status: "INACTIVE" },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Influencer DELETE]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
