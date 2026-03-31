// ══════════════════════════════════════════════════════════════
// ML Reputación API — Reads from OUR DB only (never touches ML)
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const connection = await prisma.connection.findFirst({
      where: { platform: "MERCADOLIBRE" as any },
    });
    if (!connection) {
      return NextResponse.json({ error: "No ML connection" }, { status: 404 });
    }
    const orgId = connection.organizationId;

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "90");

    // Historical metrics
    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const metrics = await prisma.mlSellerMetricDaily.findMany({
      where: { organizationId: orgId, date: { gte: dateFrom } },
      orderBy: { date: "asc" },
    });

    // Latest snapshot
    const latest = metrics.length > 0 ? metrics[metrics.length - 1] : null;

    // Format reputation level for display
    const levelMap: Record<string, { label: string; color: string }> = {
      "5_green": { label: "Excelente", color: "#10b981" },
      "4_light_green": { label: "Muy bueno", color: "#34d399" },
      "3_yellow": { label: "Bueno", color: "#f59e0b" },
      "2_orange": { label: "Regular", color: "#f97316" },
      "1_red": { label: "Malo", color: "#ef4444" },
    };

    const levelInfo = latest?.reputationLevel ? levelMap[latest.reputationLevel] || { label: latest.reputationLevel, color: "#94a3b8" } : null;

    // Total ratings
    const totalRatings = latest ? latest.positiveRatings + latest.negativeRatings + latest.neutralRatings : 0;

    return NextResponse.json({
      current: latest ? {
        level: latest.reputationLevel,
        levelLabel: levelInfo?.label || "Desconocido",
        levelColor: levelInfo?.color || "#94a3b8",
        powerSeller: latest.reputationPower,
        totalSales: latest.totalSales,
        completedSales: latest.completedSales,
        cancelledSales: latest.cancelledSales,
        claimsRate: latest.claimsRate,
        delayedRate: latest.delayedHandlingRate,
        cancellationRate: latest.cancellationRate,
        positiveRatings: latest.positiveRatings,
        negativeRatings: latest.negativeRatings,
        neutralRatings: latest.neutralRatings,
        totalRatings,
        positiveRate: totalRatings > 0 ? ((latest.positiveRatings / totalRatings) * 100).toFixed(1) : "0",
        date: latest.date,
      } : null,
      history: metrics.map((m) => ({
        date: m.date,
        level: m.reputationLevel,
        totalSales: m.totalSales,
        claimsRate: m.claimsRate,
        delayedRate: m.delayedHandlingRate,
        cancellationRate: m.cancellationRate,
        positiveRatings: m.positiveRatings,
        negativeRatings: m.negativeRatings,
        neutralRatings: m.neutralRatings,
      })),
    });
  } catch (err: any) {
    console.error("[ML Reputacion API] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
