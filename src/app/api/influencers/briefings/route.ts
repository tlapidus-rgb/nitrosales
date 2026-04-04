// ══════════════════════════════════════════════════════════════
// Influencer Briefings API
// ══════════════════════════════════════════════════════════════
// GET  — List all briefings
// POST — Create new briefing
// PUT  — Update briefing
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const influencerId = searchParams.get("influencerId");

    const briefings = await prisma.influencerBriefing.findMany({
      where: {
        organizationId: org.id,
        ...(status && { status }),
        ...(influencerId && { influencerId }),
      },
      include: {
        influencer: { select: { id: true, name: true, code: true } },
        campaign: { select: { id: true, name: true } },
        _count: { select: { submissions: true, seedings: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ briefings });
  } catch (error: any) {
    console.error("[Briefings GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    const briefing = await prisma.influencerBriefing.create({
      data: {
        title: body.title,
        description: body.description,
        type: body.type || "GENERAL",
        deadline: body.deadline ? new Date(body.deadline) : null,
        requirements: body.requirements || null,
        hashtags: body.hashtags || null,
        mentions: body.mentions || null,
        dos: body.dos || null,
        donts: body.donts || null,
        referenceUrls: body.referenceUrls || null,
        organizationId: org.id,
        influencerId: body.influencerId || null,
        campaignId: body.campaignId || null,
      },
    });

    return NextResponse.json({ briefing }, { status: 201 });
  } catch (error: any) {
    console.error("[Briefings POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: "Missing briefing id" }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.influencerBriefing.findFirst({
      where: { id: body.id, organizationId: org.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Briefing not found" }, { status: 404 });
    }

    const briefing = await prisma.influencerBriefing.update({
      where: { id: body.id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.deadline !== undefined && { deadline: body.deadline ? new Date(body.deadline) : null }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.requirements !== undefined && { requirements: body.requirements }),
        ...(body.hashtags !== undefined && { hashtags: body.hashtags }),
        ...(body.mentions !== undefined && { mentions: body.mentions }),
        ...(body.dos !== undefined && { dos: body.dos }),
        ...(body.donts !== undefined && { donts: body.donts }),
        ...(body.referenceUrls !== undefined && { referenceUrls: body.referenceUrls }),
        ...(body.influencerId !== undefined && { influencerId: body.influencerId || null }),
        ...(body.campaignId !== undefined && { campaignId: body.campaignId || null }),
      },
    });

    return NextResponse.json({ briefing });
  } catch (error: any) {
    console.error("[Briefings PUT]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
