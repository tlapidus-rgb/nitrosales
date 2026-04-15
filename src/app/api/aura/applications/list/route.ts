export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Pipeline de aplicaciones
// ══════════════════════════════════════════════════════════════
// GET /api/aura/applications/list
// Lista todas las aplicaciones agrupadas por estado (PENDING / APPROVED
// / REJECTED) para el pipeline kanban.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const apps = await prisma.influencerApplication.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        instagram: true,
        tiktok: true,
        youtube: true,
        followers: true,
        message: true,
        status: true,
        reviewedAt: true,
        notes: true,
        createdAt: true,
      },
    });

    const groups = {
      PENDING: [] as any[],
      APPROVED: [] as any[],
      REJECTED: [] as any[],
    };
    for (const a of apps) {
      const item = {
        ...a,
        createdAt: a.createdAt.toISOString(),
        reviewedAt: a.reviewedAt ? a.reviewedAt.toISOString() : null,
      };
      if (a.status === "PENDING") groups.PENDING.push(item);
      else if (a.status === "APPROVED") groups.APPROVED.push(item);
      else if (a.status === "REJECTED") groups.REJECTED.push(item);
    }

    return NextResponse.json({
      groups,
      totals: {
        pending: groups.PENDING.length,
        approved: groups.APPROVED.length,
        rejected: groups.REJECTED.length,
      },
    });
  } catch (e: any) {
    console.error("[aura/applications/list] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
