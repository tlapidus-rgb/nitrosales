export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Public Content Submission API (Influencer-facing)
// ══════════════════════════════════════════════════════════════
// GET  — Get briefings and submission history for this influencer
// POST — Submit new content
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { createHash } from "crypto";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

async function verifyInfluencer(slug: string, code: string, password: string | null) {
  const org = await prisma.organization.findFirst({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!org) return null;

  const influencer = await prisma.influencer.findFirst({
    where: { organizationId: org.id, code, status: "ACTIVE" },
    select: {
      id: true, name: true, code: true, dashboardPassword: true,
      isPublicDashboardEnabled: true, organizationId: true,
    },
  });
  if (!influencer || !influencer.isPublicDashboardEnabled) return null;

  // Check password if required
  if (influencer.dashboardPassword) {
    if (!password) return null;
    const hashed = hashPassword(password);
    if (hashed !== influencer.dashboardPassword) return null;
  }

  return { org, influencer };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; code: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const password = searchParams.get("password");

    const result = await verifyInfluencer(params.slug, params.code, password);
    if (!result) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { org, influencer } = result;

    // Get active briefings for this influencer (assigned to them OR to all)
    const briefings = await prisma.influencerBriefing.findMany({
      where: {
        organizationId: org.id,
        status: "ACTIVE",
        OR: [
          { influencerId: influencer.id },
          { influencerId: null },
        ],
      },
      select: {
        id: true, title: true, description: true, type: true, deadline: true,
        requirements: true, hashtags: true, mentions: true, dos: true, donts: true,
        referenceUrls: true,
        campaign: { select: { name: true } },
        _count: { select: { submissions: { where: { influencerId: influencer.id } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Get influencer's own submission history
    const submissions = await prisma.contentSubmission.findMany({
      where: {
        organizationId: org.id,
        influencerId: influencer.id,
      },
      select: {
        id: true, type: true, platform: true, contentUrl: true, caption: true,
        status: true, reviewNotes: true, publishedAt: true, createdAt: true,
        briefing: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Get product seedings for this influencer
    const seedings = await prisma.productSeeding.findMany({
      where: {
        organizationId: org.id,
        influencerId: influencer.id,
      },
      select: {
        id: true, status: true, shippedAt: true, deliveredAt: true,
        product: { select: { name: true, imageUrl: true } },
        briefing: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ briefings, submissions, seedings });
  } catch (error: any) {
    console.error("[Public Content GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; code: string } }
) {
  try {
    const body = await req.json();
    const result = await verifyInfluencer(params.slug, params.code, body.password || null);
    if (!result) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { org, influencer } = result;

    if (!body.contentUrl) {
      return NextResponse.json({ error: "Content URL is required" }, { status: 400 });
    }

    const submission = await prisma.contentSubmission.create({
      data: {
        type: body.type || "POST",
        platform: body.platform || "INSTAGRAM",
        contentUrl: body.contentUrl,
        caption: body.caption || null,
        thumbnailUrl: body.thumbnailUrl || null,
        notes: body.notes || null,
        publishedAt: body.publishedAt ? new Date(body.publishedAt) : new Date(),
        organizationId: org.id,
        influencerId: influencer.id,
        briefingId: body.briefingId || null,
      },
    });

    return NextResponse.json({ submission }, { status: 201 });
  } catch (error: any) {
    console.error("[Public Content POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
