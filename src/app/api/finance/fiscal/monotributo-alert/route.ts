// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/finance/fiscal/monotributo-alert — Fase 6d
// ═══════════════════════════════════════════════════════════════════
// GET: analyze monotributo status con proyeccion de facturacion.
//
// Solo responde si fiscalProfile.taxRegime === "MONOTRIBUTO".
// Caso RI: devuelve { regime: "RI", alerts: [] } + sugerencia de si
//   le conviene pasar a Monotributo (downgrade — raro pero posible).
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import {
  analyzeMonotributo,
  type MonotributoAnalysisInput,
} from "@/lib/finanzas/fiscal-monotributo";
import { MONOTRIBUTO_LIMITS } from "@/lib/finanzas/fiscal-calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const orgId = await getOrganizationId();

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const settings = (org?.settings as Record<string, unknown>) || {};
    const profile = (settings.fiscalProfile as any) || null;

    if (!profile) {
      return NextResponse.json({
        regime: null,
        hasProfile: false,
        alerts: [],
      });
    }

    // ── Revenue mensual ultimos 12 meses ──
    const now = new Date();
    const from = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)
    );

    const rows = await prisma.$queryRawUnsafe<
      Array<{ month: string; revenue: string }>
    >(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "orderDate"), 'YYYY-MM') AS month,
        COALESCE(SUM("totalValue"), 0)::text AS revenue
      FROM "orders"
      WHERE "organizationId" = $1
        AND "orderDate" >= $2
      GROUP BY 1
      ORDER BY 1 ASC
    `, orgId, from);

    // Rellenar meses sin data con 0
    const monthlyMap = new Map(rows.map((r) => [r.month, Number(r.revenue ?? 0)]));
    const monthlyRevenueSeries: number[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      monthlyRevenueSeries.push(monthlyMap.get(key) ?? 0);
    }

    const actualRevenueLast12m = monthlyRevenueSeries.reduce((s, v) => s + v, 0);

    // Proyeccion simple: promedio ultimos 3 meses * 12
    const last3 = monthlyRevenueSeries.slice(-3);
    const monthlyPace = last3.length
      ? last3.reduce((s, v) => s + v, 0) / last3.length
      : 0;
    const projectedRevenue12m = Math.max(actualRevenueLast12m, monthlyPace * 12);

    // ── Caso RI: verificar si podria volver a Monotributo ──
    if (profile.taxRegime === "RESPONSABLE_INSCRIPTO") {
      const fitsInMonotributo = projectedRevenue12m <= MONOTRIBUTO_LIMITS.K;
      const suggestions: any[] = [];
      if (fitsInMonotributo && projectedRevenue12m > 0) {
        suggestions.push({
          id: "ri_could_downgrade",
          severity: "info",
          title: "Posible vuelta a Monotributo",
          body: `Tu facturación proyectada ($${Math.round(projectedRevenue12m / 1e6)}M) cabe en Monotributo K. En algunos casos conviene volver. Consultalo con tu contador — hay letra chica sobre cuando se puede volver.`,
          suggestion: "CONSIDER_MONOTRIBUTO_DOWNGRADE",
        });
      }
      return NextResponse.json({
        regime: "RESPONSABLE_INSCRIPTO",
        hasProfile: true,
        actualRevenueLast12m,
        projectedRevenue12m,
        monthlyPace,
        monthlyRevenueSeries,
        alerts: suggestions,
        headline:
          suggestions.length > 0
            ? "Responsable Inscripto — posible downgrade a Monotributo"
            : "Responsable Inscripto — régimen adecuado",
      });
    }

    // ── Caso Monotributo: análisis completo ──
    const input: MonotributoAnalysisInput = {
      currentCategory: profile.monotributoCategory ?? "A",
      projectedRevenue12m,
      actualRevenueLast12m,
      monthlyRevenueSeries,
    };

    const analysis = analyzeMonotributo(input);

    return NextResponse.json({
      regime: "MONOTRIBUTO",
      hasProfile: true,
      actualRevenueLast12m,
      projectedRevenue12m,
      monthlyPace,
      monthlyRevenueSeries,
      ...analysis,
    });
  } catch (error: any) {
    console.error("[finance/fiscal/monotributo-alert] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
