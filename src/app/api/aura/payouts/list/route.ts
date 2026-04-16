export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Lista de pagos (Payouts)
// ══════════════════════════════════════════════════════════════
// GET /api/aura/payouts/list?status=&influencerId=&campaignId=&q=&sort=
//   status: PENDING | PAID | CANCELLED | all
//   sort:   recent | oldest | amount_desc | amount_asc
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "all";
    const influencerId = searchParams.get("influencerId") || "";
    const campaignId = searchParams.get("campaignId") || "";
    const q = searchParams.get("q")?.trim() || "";
    const sort = searchParams.get("sort") || "recent";

    const where: any = { organizationId: org.id };
    if (status !== "all") where.status = status;
    if (influencerId) where.influencerId = influencerId;
    if (campaignId) where.campaignId = campaignId;
    if (q) {
      where.OR = [
        { concept: { contains: q, mode: "insensitive" } },
        { reference: { contains: q, mode: "insensitive" } },
        { influencer: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const orderBy =
      sort === "oldest"
        ? { createdAt: "asc" as const }
        : sort === "amount_desc"
        ? { amount: "desc" as const }
        : sort === "amount_asc"
        ? { amount: "asc" as const }
        : { createdAt: "desc" as const };

    const [items, pendingAgg, paidAgg, cancelledCount] = await Promise.all([
      prisma.payout.findMany({
        where,
        orderBy,
        take: 300,
        include: {
          influencer: { select: { id: true, name: true, code: true, profileImage: true } },
          deal: { select: { id: true, name: true, type: true } },
          campaign: { select: { id: true, name: true } },
        },
      }),
      prisma.payout.aggregate({
        where: { organizationId: org.id, status: "PENDING" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payout.aggregate({
        where: { organizationId: org.id, status: "PAID" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payout.count({ where: { organizationId: org.id, status: "CANCELLED" } }),
    ]);

    return NextResponse.json({
      items,
      totals: {
        pendingCount: pendingAgg._count,
        pendingAmount: Number(pendingAgg._sum.amount ?? 0),
        paidCount: paidAgg._count,
        paidAmount: Number(paidAgg._sum.amount ?? 0),
        cancelledCount,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
