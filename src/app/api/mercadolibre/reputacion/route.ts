// ══════════════════════════════════════════════════════════════
// ML Reputación API
// ══════════════════════════════════════════════════════════════
// Read-only sobre MELI. Lee histórico de DB + hace fetch live a MELI
// para traer los thresholds (umbrales de exclusión) actuales por métrica.
// Los thresholds vienen frescos en cada llamada, así no se desactualizan
// si MELI los cambia. Si MELI no responde, devuelve thresholds=null y la
// página los renderiza con un mensaje "no disponibles ahora".
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSellerToken, fetchSellerReputation } from "@/lib/connectors/mercadolibre-seller";

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

    // Historical metrics (DB)
    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const metrics = await prisma.mlSellerMetricDaily.findMany({
      where: { organizationId: orgId, date: { gte: dateFrom } },
      orderBy: { date: "asc" },
    });

    const latest = metrics.length > 0 ? metrics[metrics.length - 1] : null;

    const levelMap: Record<string, { label: string; color: string }> = {
      "5_green": { label: "Excelente", color: "#10b981" },
      "4_light_green": { label: "Muy bueno", color: "#34d399" },
      "3_yellow": { label: "Bueno", color: "#f59e0b" },
      "2_orange": { label: "Regular", color: "#f97316" },
      "1_red": { label: "Malo", color: "#ef4444" },
    };
    const levelInfo = latest?.reputationLevel
      ? levelMap[latest.reputationLevel] || { label: latest.reputationLevel, color: "#94a3b8" }
      : null;
    const totalRatings = latest ? latest.positiveRatings + latest.negativeRatings + latest.neutralRatings : 0;

    // ── FETCH LIVE de thresholds desde MELI (fail-safe) ──
    let thresholds: {
      claims: { percentage: number | null; fixed: number | null } | null;
      delayed: { percentage: number | null; fixed: number | null } | null;
      cancellations: { percentage: number | null; fixed: number | null } | null;
    } | null = null;
    let thresholdsError: string | null = null;
    try {
      const tokenInfo = await getSellerToken(orgId);
      if (tokenInfo?.token && tokenInfo?.mlUserId) {
        const liveRep = await fetchSellerReputation(tokenInfo.token, tokenInfo.mlUserId);
        thresholds = {
          claims: {
            percentage: liveRep.metrics.claims.thresholdPercentage ?? null,
            fixed: liveRep.metrics.claims.thresholdFixed ?? null,
          },
          delayed: {
            percentage: liveRep.metrics.delayed.thresholdPercentage ?? null,
            fixed: liveRep.metrics.delayed.thresholdFixed ?? null,
          },
          cancellations: {
            percentage: liveRep.metrics.cancellations.thresholdPercentage ?? null,
            fixed: liveRep.metrics.cancellations.thresholdFixed ?? null,
          },
        };
      } else {
        thresholdsError = "No hay token MELI activo";
      }
    } catch (err: any) {
      thresholdsError = `MELI no respondió: ${err?.message ?? String(err)}`;
      console.warn("[ML Reputacion] live thresholds fetch failed:", thresholdsError);
    }

    return NextResponse.json({
      current: latest
        ? {
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
            thresholds,
            thresholdsError,
          }
        : null,
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
