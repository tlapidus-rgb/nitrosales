export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Content Submissions API (Admin)
// ══════════════════════════════════════════════════════════════
// GET  — List all content submissions (filterable)
// PUT  — Review/approve/reject submission
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
    const isUGC = searchParams.get("ugc");

    const submissions = await prisma.contentSubmission.findMany({
      where: {
        organizationId: org.id,
        ...(status && { status }),
        ...(influencerId && { influencerId }),
        ...(isUGC === "true" && { isUGC: true, status: "APPROVED" }),
      },
      include: {
        influencer: { select: { id: true, name: true, code: true, profileImage: true } },
        briefing: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ submissions });
  } catch (error: any) {
    console.error("[Content GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: "Missing submission id" }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.contentSubmission.findFirst({
      where: { id: body.id, organizationId: org.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const submission = await prisma.contentSubmission.update({
      where: { id: body.id },
      data: {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.reviewNotes !== undefined && { reviewNotes: body.reviewNotes }),
        ...(body.isUGC !== undefined && {
          isUGC: body.isUGC,
          ugcApprovedAt: body.isUGC ? new Date() : null,
        }),
        ...(body.metrics !== undefined && { metrics: body.metrics }),
        ...((body.status === "APPROVED" || body.status === "REJECTED") && {
          reviewedAt: new Date(),
        }),
      },
    });

    return NextResponse.json({ submission });
  } catch (error: any) {
    console.error("[Content PUT]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
