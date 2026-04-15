export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Briefing detail / update / delete
// ══════════════════════════════════════════════════════════════
// GET    /api/aura/briefings/[id]   → detalle + submissions
// PATCH  /api/aura/briefings/[id]   → actualizar campos
// DELETE /api/aura/briefings/[id]   → borrar (solo si no tiene submissions)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);
    const id = params.id;

    const briefing = await prisma.influencerBriefing.findFirst({
      where: { id, organizationId: org.id },
      include: {
        influencer: {
          select: { id: true, name: true, code: true, profileImage: true, email: true },
        },
        campaign: { select: { id: true, name: true, status: true } },
        submissions: {
          orderBy: { createdAt: "desc" },
          include: {
            influencer: {
              select: { id: true, name: true, code: true, profileImage: true },
            },
          },
        },
      },
    });

    if (!briefing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      briefing: {
        id: briefing.id,
        title: briefing.title,
        description: briefing.description,
        type: briefing.type,
        status: briefing.status,
        deadline: briefing.deadline ? briefing.deadline.toISOString() : null,
        requirements: briefing.requirements,
        hashtags: briefing.hashtags,
        mentions: briefing.mentions,
        dos: briefing.dos,
        donts: briefing.donts,
        referenceUrls: briefing.referenceUrls,
        createdAt: briefing.createdAt.toISOString(),
        updatedAt: briefing.updatedAt.toISOString(),
        influencer: briefing.influencer,
        campaign: briefing.campaign,
        submissions: briefing.submissions.map((s) => ({
          id: s.id,
          type: s.type,
          platform: s.platform,
          contentUrl: s.contentUrl,
          thumbnailUrl: s.thumbnailUrl,
          caption: s.caption,
          notes: s.notes,
          status: s.status,
          reviewNotes: s.reviewNotes,
          reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
          publishedAt: s.publishedAt ? s.publishedAt.toISOString() : null,
          metrics: s.metrics,
          isUGC: s.isUGC,
          createdAt: s.createdAt.toISOString(),
          influencer: s.influencer,
        })),
      },
    });
  } catch (e: any) {
    console.error("[aura/briefings/[id] GET]:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);
    const id = params.id;
    const body = await req.json();

    const existing = await prisma.influencerBriefing.findFirst({
      where: { id, organizationId: org.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Validar influencerId / campaignId si vienen
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

    if (body.status && !["ACTIVE", "COMPLETED", "CANCELLED"].includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }

    const data: any = {};
    if (typeof body.title === "string") data.title = body.title.trim();
    if (typeof body.description === "string")
      data.description = body.description.trim();
    if (typeof body.type === "string") data.type = body.type;
    if (body.deadline !== undefined)
      data.deadline = body.deadline ? new Date(body.deadline) : null;
    if (typeof body.status === "string") data.status = body.status;
    if (body.requirements !== undefined)
      data.requirements = body.requirements?.trim() || null;
    if (body.hashtags !== undefined)
      data.hashtags = body.hashtags?.trim() || null;
    if (body.mentions !== undefined)
      data.mentions = body.mentions?.trim() || null;
    if (body.dos !== undefined) data.dos = body.dos?.trim() || null;
    if (body.donts !== undefined) data.donts = body.donts?.trim() || null;
    if (body.referenceUrls !== undefined)
      data.referenceUrls = body.referenceUrls?.trim() || null;
    if (body.influencerId !== undefined)
      data.influencerId = body.influencerId || null;
    if (body.campaignId !== undefined)
      data.campaignId = body.campaignId || null;

    const briefing = await prisma.influencerBriefing.update({
      where: { id },
      data,
    });

    return NextResponse.json({ ok: true, briefing });
  } catch (e: any) {
    console.error("[aura/briefings/[id] PATCH]:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);
    const id = params.id;

    const existing = await prisma.influencerBriefing.findFirst({
      where: { id, organizationId: org.id },
      select: { id: true, _count: { select: { submissions: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing._count.submissions > 0) {
      return NextResponse.json(
        {
          error:
            "No se puede borrar un briefing con submissions. Cancelalo en su lugar.",
        },
        { status: 400 }
      );
    }

    await prisma.influencerBriefing.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[aura/briefings/[id] DELETE]:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
