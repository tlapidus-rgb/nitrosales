// ══════════════════════════════════════════════════════════════
// Influencer Report Export API — CSV
// ══════════════════════════════════════════════════════════════
// GET — Generates a CSV report of all influencers and their metrics
// Params: ?period=month|quarter|year|all
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    if (!org) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "month";

    // Date range
    const now = new Date();
    let dateFrom: Date;
    switch (period) {
      case "quarter":
        dateFrom = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        break;
      case "year":
        dateFrom = new Date(now.getFullYear(), 0, 1);
        break;
      case "all":
        dateFrom = new Date(2020, 0, 1);
        break;
      default:
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Get all influencers with aggregated metrics
    const influencers = await prisma.influencer.findMany({
      where: { organizationId: org.id },
      select: {
        name: true,
        code: true,
        email: true,
        commissionPercent: true,
        status: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });

    // Get aggregated metrics per influencer
    const metrics = await prisma.influencerAttribution.groupBy({
      by: ["influencerId"],
      where: {
        organizationId: org.id,
        createdAt: { gte: dateFrom },
      },
      _sum: { attributedValue: true, commissionAmount: true },
      _count: { id: true },
    });

    // Get all-time metrics
    const allTimeMetrics = await prisma.influencerAttribution.groupBy({
      by: ["influencerId"],
      where: { organizationId: org.id },
      _sum: { attributedValue: true, commissionAmount: true },
      _count: { id: true },
    });

    // Map by influencer code (need id -> code mapping)
    const allInfluencers = await prisma.influencer.findMany({
      where: { organizationId: org.id },
      select: { id: true, code: true },
    });
    const idToCode = new Map(allInfluencers.map((i) => [i.id, i.code]));

    const periodMetricsMap = new Map(
      metrics.map((m) => [
        idToCode.get(m.influencerId),
        {
          revenue: Number(m._sum.attributedValue || 0),
          commission: Number(m._sum.commissionAmount || 0),
          conversions: m._count.id || 0,
        },
      ])
    );

    const allTimeMap = new Map(
      allTimeMetrics.map((m) => [
        idToCode.get(m.influencerId),
        {
          revenue: Number(m._sum.attributedValue || 0),
          commission: Number(m._sum.commissionAmount || 0),
          conversions: m._count.id || 0,
        },
      ])
    );

    // Build CSV
    const headers = [
      "Nombre",
      "Código",
      "Email",
      "Comisión %",
      "Estado",
      "Fecha Alta",
      `Ventas (${period})`,
      `Comisión (${period})`,
      `Conversiones (${period})`,
      `Ticket Promedio (${period})`,
      "Ventas (total)",
      "Comisión (total)",
      "Conversiones (total)",
    ];

    const rows = influencers.map((inf) => {
      const pm = periodMetricsMap.get(inf.code) || { revenue: 0, commission: 0, conversions: 0 };
      const at = allTimeMap.get(inf.code) || { revenue: 0, commission: 0, conversions: 0 };
      const avgTicket = pm.conversions > 0 ? pm.revenue / pm.conversions : 0;

      return [
        inf.name,
        inf.code,
        inf.email || "",
        Number(inf.commissionPercent),
        inf.status,
        inf.createdAt.toISOString().slice(0, 10),
        pm.revenue.toFixed(2),
        pm.commission.toFixed(2),
        pm.conversions,
        avgTicket.toFixed(2),
        at.revenue.toFixed(2),
        at.commission.toFixed(2),
        at.conversions,
      ];
    });

    // Escape CSV values
    const escapeCsv = (val: string | number) => {
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csv = [
      headers.map(escapeCsv).join(","),
      ...rows.map((row) => row.map(escapeCsv).join(",")),
    ].join("\n");

    // Add BOM for Excel UTF-8 compatibility
    const bom = "\uFEFF";

    return new NextResponse(bom + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="influencers-${period}-${now.toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("[Export API]", error?.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
