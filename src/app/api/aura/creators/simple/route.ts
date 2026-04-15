export const dynamic = "force-dynamic";

// Lista ligera de creadores para dropdowns/selectores.
// Solo ACTIVE por default, con id/name/code/profileImage.

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const { searchParams } = new URL(req.url);
    const includeAll = searchParams.get("all") === "1";

    const where: any = { organizationId: org.id };
    if (!includeAll) where.status = "ACTIVE";

    const influencers = await prisma.influencer.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        profileImage: true,
        status: true,
        commissionPercent: true,
      },
    });

    return NextResponse.json({
      rows: influencers.map((i) => ({
        id: i.id,
        name: i.name,
        code: i.code,
        avatarUrl: i.profileImage,
        status: i.status,
        commissionPercent: Number(i.commissionPercent),
      })),
    });
  } catch (error) {
    console.error("[aura/creators/simple] error:", error);
    return NextResponse.json(
      { error: "internal", message: (error as Error).message },
      { status: 500 },
    );
  }
}
