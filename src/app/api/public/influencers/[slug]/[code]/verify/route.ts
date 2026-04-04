// ══════════════════════════════════════════════════════════════
// Public Dashboard Password Verification
// ══════════════════════════════════════════════════════════════
// POST — Verify password for a protected influencer dashboard
// Returns { valid: true/false }
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; code: string } }
) {
  try {
    const { slug, code } = params;
    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    const org = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!org) {
      return NextResponse.json({ valid: false }, { status: 404 });
    }

    const influencer = await prisma.influencer.findUnique({
      where: { organizationId_code: { organizationId: org.id, code } },
      select: { dashboardPassword: true },
    });
    if (!influencer || !influencer.dashboardPassword) {
      return NextResponse.json({ valid: false }, { status: 404 });
    }

    const valid = influencer.dashboardPassword === hashPassword(password);

    return NextResponse.json({ valid });
  } catch (error: any) {
    console.error("[Verify Password]", error);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}
