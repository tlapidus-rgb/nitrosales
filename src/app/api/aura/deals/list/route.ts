export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Lista de deals (acuerdos de compensación)
// ══════════════════════════════════════════════════════════════
// GET /api/aura/deals/list?influencerId=&campaignId=&type=&status=
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const { searchParams } = new URL(req.url);
    const influencerId = searchParams.get("influencerId") || "";
    const campaignId = searchParams.get("campaignId") || "";
    const type = searchParams.get("type") || "";
    const status = searchParams.get("status") || "all";

    const where: any = { organizationId: org.id };
    if (influencerId) where.influencerId = influencerId;
    if (campaignId) where.campaignId = campaignId;
    if (type) where.type = type;
    if (status !== "all") where.status = status;

    const items = await prisma.influencerDeal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        influencer: { select: { id: true, name: true, code: true, profileImage: true } },
        campaign: { select: { id: true, name: true } },
        _count: { select: { payouts: true } },
      },
    });

    return NextResponse.json({ items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
