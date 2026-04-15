export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Crear briefing
// ══════════════════════════════════════════════════════════════
// POST /api/aura/briefings
//   body: { title, description, type, deadline, influencerId?, campaignId?,
//           hashtags?, mentions?, dos?, donts?, requirements?, referenceUrls? }
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }
    if (!body.description || typeof body.description !== "string") {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 }
      );
    }

    // Validar que el influencer (si viene) pertenezca a la org
    if (body.influencerId) {
      const inf = await prisma.influencer.findFirst({
        where: { id: body.influencerId, organizationId: org.id },
        select: { id: true },
      });
      if (!inf) {
        return NextResponse.json(
          { error: "influencer not found" },
          { status: 400 }
        );
      }
    }

    // Validar campaign (si viene)
    if (body.campaignId) {
      const c = await prisma.influencerCampaign.findFirst({
        where: { id: body.campaignId, organizationId: org.id },
        select: { id: true },
      });
      if (!c) {
        return NextResponse.json(
          { error: "campaign not found" },
          { status: 400 }
        );
      }
    }

    const briefing = await prisma.influencerBriefing.create({
      data: {
        title: body.title.trim(),
        description: body.description.trim(),
        type: body.type || "GENERAL",
        deadline: body.deadline ? new Date(body.deadline) : null,
        requirements: body.requirements?.trim() || null,
        hashtags: body.hashtags?.trim() || null,
        mentions: body.mentions?.trim() || null,
        dos: body.dos?.trim() || null,
        donts: body.donts?.trim() || null,
        referenceUrls: body.referenceUrls?.trim() || null,
        organizationId: org.id,
        influencerId: body.influencerId || null,
        campaignId: body.campaignId || null,
      },
    });

    return NextResponse.json({ briefing }, { status: 201 });
  } catch (e: any) {
    console.error("[aura/briefings POST]:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
