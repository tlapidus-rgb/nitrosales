export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Lista de briefings
// ══════════════════════════════════════════════════════════════
// GET /api/aura/briefings/list?q=&status=&campaignId=&influencerId=&sort=
//   status: ACTIVE | COMPLETED | CANCELLED | all
//   sort:   recent | deadline | pending
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";
    const status = searchParams.get("status") || "ACTIVE";
    const campaignId = searchParams.get("campaignId") || "";
    const influencerId = searchParams.get("influencerId") || "";
    const sort = searchParams.get("sort") || "recent";

    const where: any = { organizationId: org.id };
    if (status !== "all") where.status = status;
    if (campaignId) where.campaignId = campaignId;
    if (influencerId) where.influencerId = influencerId;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    let orderBy: any = { createdAt: "desc" };
    if (sort === "deadline") orderBy = [{ deadline: "asc" }, { createdAt: "desc" }];

    const briefings = await prisma.influencerBriefing.findMany({
      where,
      orderBy,
      include: {
        influencer: {
          select: { id: true, name: true, code: true, profileImage: true },
        },
        campaign: { select: { id: true, name: true, status: true } },
        _count: { select: { submissions: true } },
        submissions: {
          select: { id: true, status: true },
        },
      },
    });

    const enriched = briefings.map((b) => {
      const totalSubs = b.submissions.length;
      const pendingSubs = b.submissions.filter(
        (s) => s.status === "PENDING" || s.status === "REVISION"
      ).length;
      const approvedSubs = b.submissions.filter(
        (s) => s.status === "APPROVED"
      ).length;
      return {
        id: b.id,
        title: b.title,
        description: b.description,
        type: b.type,
        status: b.status,
        deadline: b.deadline ? b.deadline.toISOString() : null,
        hashtags: b.hashtags,
        mentions: b.mentions,
        dos: b.dos,
        donts: b.donts,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
        influencer: b.influencer
          ? {
              id: b.influencer.id,
              name: b.influencer.name,
              code: b.influencer.code,
              profileImage: b.influencer.profileImage,
            }
          : null,
        campaign: b.campaign
          ? { id: b.campaign.id, name: b.campaign.name, status: b.campaign.status }
          : null,
        totalSubmissions: totalSubs,
        pendingSubmissions: pendingSubs,
        approvedSubmissions: approvedSubs,
      };
    });

    // Sort "pending" = más submissions pendientes primero
    if (sort === "pending") {
      enriched.sort((a, b) => b.pendingSubmissions - a.pendingSubmissions);
    }

    // KPIs globales (de todos los briefings de la org, independiente de filtros)
    const [activeCount, completedCount, pendingSubsCount] = await Promise.all([
      prisma.influencerBriefing.count({
        where: { organizationId: org.id, status: "ACTIVE" },
      }),
      prisma.influencerBriefing.count({
        where: { organizationId: org.id, status: "COMPLETED" },
      }),
      prisma.contentSubmission.count({
        where: { organizationId: org.id, status: "PENDING" },
      }),
    ]);

    return NextResponse.json({
      briefings: enriched,
      totals: {
        count: enriched.length,
        active: activeCount,
        completed: completedCount,
        pendingSubmissions: pendingSubsCount,
      },
    });
  } catch (e: any) {
    console.error("[aura/briefings/list] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
