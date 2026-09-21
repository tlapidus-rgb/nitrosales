export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { creatorPasswordMatches, limitCreatorPassword } from "@/lib/creator-password";

// Shared durable admission with metrics and content. SHA-256 hashes remain
// compatible with existing passwords; hash migration is a separate change.
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; code: string } }
) {
  try {
    const { slug, code } = params;
    const limited = await limitCreatorPassword(req, slug, code);
    if (limited.blocked) return limited.blocked;
    const { password } = await req.json();
    if (typeof password !== "string" || !password || password.length > 1024) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }
    const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (!org) return NextResponse.json({ valid: false }, { status: 404 });
    const influencer = await prisma.influencer.findUnique({
      where: { organizationId_code: { organizationId: org.id, code } },
      select: { dashboardPassword: true, status: true, isPublicDashboardEnabled: true },
    });
    if (!influencer || influencer.status !== "ACTIVE" || !influencer.isPublicDashboardEnabled ||
        !influencer.dashboardPassword) {
      return NextResponse.json({ valid: false }, { status: 404 });
    }
    const valid = creatorPasswordMatches(password, influencer.dashboardPassword);
    if (valid) await limited.success();
    return NextResponse.json({ valid },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}
