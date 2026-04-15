export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Submission review (approve / reject / revision / publish)
// ══════════════════════════════════════════════════════════════
// GET   /api/aura/submissions/[id]    → detalle
// PATCH /api/aura/submissions/[id]    → body: { status, reviewNotes?, publishedAt?, metrics? }
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

    const s = await prisma.contentSubmission.findFirst({
      where: { id, organizationId: org.id },
      include: {
        influencer: {
          select: {
            id: true,
            name: true,
            code: true,
            profileImage: true,
            email: true,
          },
        },
        briefing: {
          select: {
            id: true,
            title: true,
            description: true,
            type: true,
            hashtags: true,
            mentions: true,
            dos: true,
            donts: true,
            deadline: true,
            campaign: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!s) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      submission: {
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
        briefing: s.briefing
          ? {
              ...s.briefing,
              deadline: s.briefing.deadline
                ? s.briefing.deadline.toISOString()
                : null,
            }
          : null,
      },
    });
  } catch (e: any) {
    console.error("[aura/submissions/[id] GET]:", e);
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

    const existing = await prisma.contentSubmission.findFirst({
      where: { id, organizationId: org.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (
      body.status &&
      !["PENDING", "APPROVED", "REVISION", "REJECTED"].includes(body.status)
    ) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }

    const data: any = {};
    if (typeof body.status === "string") {
      data.status = body.status;
      // si es review terminal (APPROVED/REJECTED/REVISION), marcar reviewedAt
      if (["APPROVED", "REJECTED", "REVISION"].includes(body.status)) {
        data.reviewedAt = new Date();
      }
    }
    if (body.reviewNotes !== undefined)
      data.reviewNotes = body.reviewNotes?.trim() || null;
    if (body.publishedAt !== undefined)
      data.publishedAt = body.publishedAt ? new Date(body.publishedAt) : null;
    if (body.metrics !== undefined) data.metrics = body.metrics;
    if (body.caption !== undefined) data.caption = body.caption?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    if (typeof body.isUGC === "boolean") data.isUGC = body.isUGC;

    const submission = await prisma.contentSubmission.update({
      where: { id },
      data,
    });

    return NextResponse.json({ ok: true, submission });
  } catch (e: any) {
    console.error("[aura/submissions/[id] PATCH]:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
