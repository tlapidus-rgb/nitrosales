export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Lista de campañas
// ══════════════════════════════════════════════════════════════
// Lista todas las campañas de la org con agregados:
//   - revenue (suma attributedValue)
//   - conversions (count attributions)
//   - bonusTarget + bonusAmount + % progreso
//   - time progress (día X de Y, days remaining)
//   - status computed: unlocked | ahead | on_track | behind | at_risk | no_target | no_time_limit
//   - creator resumido
//
// Query params:
//   q       → búsqueda por nombre de campaña / creador
//   status  → filtro por status DB (ACTIVE/PAUSED/COMPLETED) o "all"
//   sort    → "urgency" | "revenue" | "recent" | "name"
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

const DAY = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const statusFilter = searchParams.get("status") || "all";
    const sort = searchParams.get("sort") || "urgency";

    const where: any = { organizationId: org.id };
    if (statusFilter !== "all") {
      where.status = statusFilter.toUpperCase();
    }

    const campaigns = await prisma.influencerCampaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        description: true,
        bonusAmount: true,
        bonusTarget: true,
        createdAt: true,
        influencer: {
          select: {
            id: true,
            name: true,
            code: true,
            profileImage: true,
          },
        },
      },
    });

    const ids = campaigns.map((c) => c.id);
    const now = new Date();

    // Agregados de attributions por campaña
    const attrGrouped = ids.length
      ? await prisma.influencerAttribution.groupBy({
          by: ["campaignId"],
          where: {
            organizationId: org.id,
            campaignId: { in: ids },
          },
          _sum: { attributedValue: true, commissionAmount: true },
          _count: { id: true },
        })
      : [];
    const revMap = new Map<
      string,
      { revenue: number; commission: number; conversions: number }
    >();
    for (const r of attrGrouped) {
      if (!r.campaignId) continue;
      revMap.set(r.campaignId, {
        revenue: Number(r._sum.attributedValue || 0),
        commission: Number(r._sum.commissionAmount || 0),
        conversions: r._count.id || 0,
      });
    }

    // Count briefings y submissions por campaña
    const briefCountsByCampaign = ids.length
      ? await prisma.influencerBriefing.groupBy({
          by: ["campaignId"],
          where: { organizationId: org.id, campaignId: { in: ids } },
          _count: { id: true },
        })
      : [];
    const briefMap = new Map<string, number>();
    for (const b of briefCountsByCampaign) {
      if (b.campaignId) briefMap.set(b.campaignId, b._count.id);
    }

    const rows = campaigns.map((c) => {
      const stats = revMap.get(c.id) || {
        revenue: 0,
        commission: 0,
        conversions: 0,
      };
      const target = c.bonusTarget ? Number(c.bonusTarget) : null;
      const bonus = c.bonusAmount ? Number(c.bonusAmount) : null;

      const start = c.startDate.getTime();
      const end = c.endDate ? c.endDate.getTime() : null;
      const nowMs = now.getTime();

      const totalDays = end
        ? Math.max(1, Math.round((end - start) / DAY))
        : null;
      const daysElapsed = Math.max(0, Math.round((nowMs - start) / DAY));
      const daysRemaining = end
        ? Math.max(0, Math.round((end - nowMs) / DAY))
        : null;

      const revenuePct =
        target && target > 0 ? Math.min(1, stats.revenue / target) : null;
      const timePct = totalDays
        ? Math.min(1, daysElapsed / totalDays)
        : null;

      let progressStatus:
        | "unlocked"
        | "ahead"
        | "on_track"
        | "behind"
        | "at_risk"
        | "no_target"
        | "no_time_limit";
      if (target === null && end === null) {
        progressStatus = "no_time_limit";
      } else if (target === null) {
        progressStatus = "no_target";
      } else if (revenuePct !== null && revenuePct >= 1) {
        progressStatus = "unlocked";
      } else if (timePct === null) {
        progressStatus =
          (revenuePct || 0) >= 0.75
            ? "ahead"
            : (revenuePct || 0) >= 0.4
              ? "on_track"
              : "behind";
      } else {
        const delta = (revenuePct || 0) - timePct;
        if (delta >= 0.08) progressStatus = "ahead";
        else if (delta >= -0.08) progressStatus = "on_track";
        else if (delta >= -0.25) progressStatus = "behind";
        else progressStatus = "at_risk";
      }

      return {
        id: c.id,
        name: c.name,
        status: c.status,
        description: c.description,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate ? c.endDate.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
        revenue: stats.revenue,
        commission: stats.commission,
        conversions: stats.conversions,
        bonusTarget: target,
        bonusAmount: bonus,
        revenuePct,
        timePct,
        totalDays,
        daysElapsed,
        daysRemaining,
        progressStatus,
        briefings: briefMap.get(c.id) || 0,
        creator: c.influencer
          ? {
              id: c.influencer.id,
              name: c.influencer.name,
              code: c.influencer.code,
              avatarUrl: c.influencer.profileImage,
            }
          : null,
      };
    });

    // Filter q
    const filtered = q
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            (r.creator?.name || "").toLowerCase().includes(q) ||
            (r.creator?.code || "").toLowerCase().includes(q),
        )
      : rows;

    // Sort
    const urgencyRank: Record<string, number> = {
      at_risk: 0,
      behind: 1,
      on_track: 2,
      ahead: 3,
      no_target: 4,
      no_time_limit: 5,
      unlocked: 6,
    };
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "revenue") return b.revenue - a.revenue;
      if (sort === "recent")
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === "name") return a.name.localeCompare(b.name, "es");
      // urgency (default): active first, then at_risk → ahead
      if (a.status !== b.status) {
        const statusOrder: Record<string, number> = {
          ACTIVE: 0,
          PAUSED: 1,
          COMPLETED: 2,
        };
        return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      }
      const u =
        (urgencyRank[a.progressStatus] ?? 9) -
        (urgencyRank[b.progressStatus] ?? 9);
      if (u !== 0) return u;
      if (a.daysRemaining !== null && b.daysRemaining !== null)
        return a.daysRemaining - b.daysRemaining;
      return b.revenue - a.revenue;
    });

    const totals = {
      count: rows.length,
      active: rows.filter((r) => r.status === "ACTIVE").length,
      paused: rows.filter((r) => r.status === "PAUSED").length,
      completed: rows.filter((r) => r.status === "COMPLETED").length,
      totalRevenue: rows.reduce((s, r) => s + r.revenue, 0),
      totalCommission: rows.reduce((s, r) => s + r.commission, 0),
      totalConversions: rows.reduce((s, r) => s + r.conversions, 0),
      unlocked: rows.filter((r) => r.progressStatus === "unlocked").length,
      atRisk: rows.filter(
        (r) => r.progressStatus === "at_risk" || r.progressStatus === "behind",
      ).length,
    };

    return NextResponse.json({
      generatedAt: now.toISOString(),
      totals,
      rows: sorted,
    });
  } catch (error) {
    console.error("[aura/campaigns/list] error:", error);
    return NextResponse.json(
      { error: "internal", message: (error as Error).message },
      { status: 500 },
    );
  }
}
