export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Inbox de submissions (contenido por aprobar)
// ══════════════════════════════════════════════════════════════
// GET /api/aura/submissions/list?status=&influencerId=&briefingId=&platform=&q=&sort=
//   status: PENDING | APPROVED | REVISION | REJECTED | all
//   sort:   recent | oldest
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "PENDING";
    const influencerId = searchParams.get("influencerId") || "";
    const briefingId = searchParams.get("briefingId") || "";
    const platform = searchParams.get("platform") || "";
    const q = searchParams.get("q")?.trim() || "";
    const sort = searchParams.get("sort") || "recent";

    const where: any = { organizationId: org.id };
    if (status !== "all") where.status = status;
    if (influencerId) where.influencerId = influencerId;
    if (briefingId) where.briefingId = briefingId;
    if (platform) where.platform = platform;
    if (q) {
      where.OR = [
        { caption: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
      ];
    }

    const orderBy: any =
      sort === "oldest"
        ? { createdAt: "asc" }
        : { createdAt: "desc" };

    const submissions = await prisma.contentSubmission.findMany({
      where,
      orderBy,
      include: {
        influencer: {
          select: { id: true, name: true, code: true, profileImage: true },
        },
        briefing: {
          select: { id: true, title: true, type: true },
        },
      },
    });

    const items = submissions.map((s) => ({
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
      updatedAt: s.updatedAt.toISOString(),
      influencer: s.influencer,
      briefing: s.briefing,
    }));

    // KPIs globales
    const [pending, approved, revision, rejected] = await Promise.all([
      prisma.contentSubmission.count({
        where: { organizationId: org.id, status: "PENDING" },
      }),
      prisma.contentSubmission.count({
        where: { organizationId: org.id, status: "APPROVED" },
      }),
      prisma.contentSubmission.count({
        where: { organizationId: org.id, status: "REVISION" },
      }),
      prisma.contentSubmission.count({
        where: { organizationId: org.id, status: "REJECTED" },
      }),
    ]);

    return NextResponse.json({
      items,
      totals: {
        count: items.length,
        pending,
        approved,
        revision,
        rejected,
      },
    });
  } catch (e: any) {
    console.error("[aura/submissions/list] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
