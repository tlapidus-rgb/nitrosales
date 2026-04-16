export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Lista de creadores
// ══════════════════════════════════════════════════════════════
// Devuelve la lista completa de creadores con agregados calculados:
//   - revenue (suma attributedValue en período)
//   - orders (cantidad de attributions en período)
//   - aov (revenue / orders)
//   - commission earned (suma commissionAmount en período)
//   - lastSaleAt (última attribution createdAt)
//   - activeCampaigns (count de InfluencerCampaign status=ACTIVE)
//   - contentPieces (count ContentSubmission approved en período)
//   - state derivado: "champion" | "active" | "new" | "silent" | "paused"
//
// Query params:
//   from, to        → rango ISO
//   q               → búsqueda fulltext (name/code/email)
//   state           → filtro por estado derivado
//   sort            → "revenue" | "recent" | "name" | "orders"
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

const DAY = 24 * 60 * 60 * 1000;

type CreatorRow = {
  id: string;
  name: string;
  code: string;
  email: string | null;
  profileImage: string | null;
  status: string;
  dashboardPasswordPlain: string | null;
  commissionPercent: number;
  revenue: number;
  orders: number;
  aov: number;
  commissionEarned: number;
  lastSaleAt: string | null;
  activeCampaigns: number;
  contentPieces: number;
  state: "champion" | "active" | "new" | "silent" | "paused";
  daysSinceLastSale: number | null;
  createdAt: string;
};

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const stateFilter = searchParams.get("state") || "all";
    const sort = searchParams.get("sort") || "revenue";

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * DAY);
    const from = fromParam ? new Date(fromParam) : defaultFrom;
    const to = toParam ? new Date(toParam) : now;
    const since14days = new Date(now.getTime() - 14 * DAY);

    // 1) traer todos los creadores de la org
    const influencers = await prisma.influencer.findMany({
      where: { organizationId: org.id },
      select: {
        id: true,
        name: true,
        code: true,
        email: true,
        profileImage: true,
        status: true,
        commissionPercent: true,
        dashboardPasswordPlain: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (influencers.length === 0) {
      return NextResponse.json({
        creators: [] as CreatorRow[],
        totals: { count: 0, revenue: 0, orders: 0, commissionEarned: 0 },
        period: { from: from.toISOString(), to: to.toISOString() },
      });
    }

    const ids = influencers.map((i) => i.id);

    // 2) agregados paralelos
    const [
      attrAgg,
      lastSales,
      activeCampaignsByCreator,
      approvedContentByCreator,
    ] = await Promise.all([
      prisma.influencerAttribution.groupBy({
        by: ["influencerId"],
        where: {
          organizationId: org.id,
          influencerId: { in: ids },
          createdAt: { gte: from, lte: to },
        },
        _sum: { attributedValue: true, commissionAmount: true },
        _count: { _all: true },
      }),
      prisma.influencerAttribution.groupBy({
        by: ["influencerId"],
        where: { organizationId: org.id, influencerId: { in: ids } },
        _max: { createdAt: true },
      }),
      prisma.influencerCampaign.groupBy({
        by: ["influencerId"],
        where: {
          organizationId: org.id,
          influencerId: { in: ids },
          status: "ACTIVE",
        },
        _count: { _all: true },
      }),
      prisma.contentSubmission.groupBy({
        by: ["influencerId"],
        where: {
          organizationId: org.id,
          influencerId: { in: ids },
          status: "APPROVED",
          createdAt: { gte: from, lte: to },
        },
        _count: { _all: true },
      }),
    ]);

    // 3) mapear a Map por influencerId
    const attrMap = new Map(
      attrAgg.map((a) => [
        a.influencerId,
        {
          revenue: Number(a._sum.attributedValue ?? 0),
          orders: a._count._all,
          commissionEarned: Number(a._sum.commissionAmount ?? 0),
        },
      ])
    );
    const lastSaleMap = new Map(
      lastSales.map((l) => [l.influencerId, l._max.createdAt])
    );
    const campMap = new Map(
      activeCampaignsByCreator.map((c) => [c.influencerId, c._count._all])
    );
    const contentMap = new Map(
      approvedContentByCreator.map((c) => [c.influencerId, c._count._all])
    );

    // 4) armar filas con state derivado
    const createdSinceMs = 30 * DAY;
    let rows: CreatorRow[] = influencers.map((inf) => {
      const a = attrMap.get(inf.id) ?? { revenue: 0, orders: 0, commissionEarned: 0 };
      const lastSale = lastSaleMap.get(inf.id) ?? null;
      const daysSince = lastSale
        ? Math.floor((now.getTime() - lastSale.getTime()) / DAY)
        : null;
      const isPaused = inf.status !== "ACTIVE";
      const isNew = !lastSale && now.getTime() - inf.createdAt.getTime() < createdSinceMs;
      const isSilent =
        !isPaused &&
        lastSale !== null &&
        lastSale < since14days;
      const isChampion = a.revenue > 0 && a.orders >= 5;
      const state: CreatorRow["state"] = isPaused
        ? "paused"
        : isChampion
          ? "champion"
          : isSilent
            ? "silent"
            : isNew
              ? "new"
              : "active";
      return {
        id: inf.id,
        name: inf.name,
        code: inf.code,
        email: inf.email,
        profileImage: inf.profileImage,
        status: inf.status,
        dashboardPasswordPlain: inf.dashboardPasswordPlain ?? null,
        commissionPercent: Number(inf.commissionPercent),
        revenue: a.revenue,
        orders: a.orders,
        aov: a.orders > 0 ? a.revenue / a.orders : 0,
        commissionEarned: a.commissionEarned,
        lastSaleAt: lastSale ? lastSale.toISOString() : null,
        activeCampaigns: campMap.get(inf.id) ?? 0,
        contentPieces: contentMap.get(inf.id) ?? 0,
        state,
        daysSinceLastSale: daysSince,
        createdAt: inf.createdAt.toISOString(),
      };
    });

    // 5) filtros
    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.code.toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q)
      );
    }
    if (stateFilter !== "all") {
      rows = rows.filter((r) => r.state === stateFilter);
    }

    // 6) sort
    if (sort === "revenue") {
      rows.sort((a, b) => b.revenue - a.revenue);
    } else if (sort === "recent") {
      rows.sort((a, b) => {
        const aD = a.lastSaleAt ? new Date(a.lastSaleAt).getTime() : 0;
        const bD = b.lastSaleAt ? new Date(b.lastSaleAt).getTime() : 0;
        return bD - aD;
      });
    } else if (sort === "name") {
      rows.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "orders") {
      rows.sort((a, b) => b.orders - a.orders);
    }

    const totals = rows.reduce(
      (acc, r) => ({
        count: acc.count + 1,
        revenue: acc.revenue + r.revenue,
        orders: acc.orders + r.orders,
        commissionEarned: acc.commissionEarned + r.commissionEarned,
      }),
      { count: 0, revenue: 0, orders: 0, commissionEarned: 0 }
    );

    // counts por state (para los chips de filtro, sobre TODAS las filas antes del filter)
    const stateCounts = influencers.reduce(
      (acc, inf) => {
        const a = attrMap.get(inf.id) ?? { revenue: 0, orders: 0, commissionEarned: 0 };
        const lastSale = lastSaleMap.get(inf.id) ?? null;
        const isPaused = inf.status !== "ACTIVE";
        const isNew = !lastSale && now.getTime() - inf.createdAt.getTime() < createdSinceMs;
        const isSilent = !isPaused && lastSale !== null && lastSale < since14days;
        const isChampion = a.revenue > 0 && a.orders >= 5;
        const s = isPaused
          ? "paused"
          : isChampion
            ? "champion"
            : isSilent
              ? "silent"
              : isNew
                ? "new"
                : "active";
        acc.all++;
        (acc as any)[s]++;
        return acc;
      },
      { all: 0, champion: 0, active: 0, new: 0, silent: 0, paused: 0 } as Record<string, number>
    );

    return NextResponse.json({
      creators: rows,
      totals,
      stateCounts,
      period: { from: from.toISOString(), to: to.toISOString() },
    });
  } catch (e: any) {
    console.error("[aura/creators/list] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
