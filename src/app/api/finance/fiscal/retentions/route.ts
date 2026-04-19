// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/finance/fiscal/retentions — Fase 6 Fiscal
// ═══════════════════════════════════════════════════════════════════
// GET: retenciones recibidas en los ultimos N meses.
// Fuente primaria hoy: MlCommission.taxWithholdings (agregado por mes).
// Futuro: sumar tambien retenciones de VTEX, payment gateways, etc.
//
// Query params:
//   months   1..24 (default 12)
//
// Response:
//   {
//     monthly: [{ month: "2026-04", total: 142000, orders: 420 }, ...],
//     total12m: 1_750_000,
//     totalLifetime: 3_200_000
//   }
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

function clampMonths(v: string | null): number {
  const n = parseInt(v ?? "12", 10);
  if (!Number.isFinite(n) || n < 1) return 12;
  return Math.min(24, n);
}

export async function GET(req: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const url = new URL(req.url);
    const months = clampMonths(url.searchParams.get("months"));

    const now = new Date();
    const from = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)
    );

    // Agregado mensual desde ml_commissions
    const rows = await prisma.$queryRawUnsafe<
      Array<{ month: string; total: string | number; orders: bigint }>
    >(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "orderDate"), 'YYYY-MM') AS month,
        COALESCE(SUM("taxWithholdings"), 0)::text AS total,
        COUNT(*)::bigint AS orders
      FROM "ml_commissions"
      WHERE "organizationId" = $1
        AND "orderDate" >= $2
      GROUP BY 1
      ORDER BY 1 ASC
    `, orgId, from);

    const monthly = rows.map((r) => ({
      month: r.month,
      total: Number(r.total ?? 0),
      orders: Number(r.orders ?? 0),
    }));

    // Completar los meses sin datos con 0
    const filled: { month: string; total: number; orders: number }[] = [];
    const present = new Map(monthly.map((r) => [r.month, r]));
    for (let i = 0; i < months; i++) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1) + i, 1)
      );
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      filled.push(present.get(key) ?? { month: key, total: 0, orders: 0 });
    }

    const total12m = filled.reduce((s, r) => s + r.total, 0);

    // Total lifetime (menos caro que parece — solo una agregacion)
    const lifetimeRows = await prisma.$queryRawUnsafe<
      Array<{ total: string | number }>
    >(`
      SELECT COALESCE(SUM("taxWithholdings"), 0)::text AS total
      FROM "ml_commissions"
      WHERE "organizationId" = $1
    `, orgId);
    const totalLifetime = Number(lifetimeRows?.[0]?.total ?? 0);

    return NextResponse.json({
      monthly: filled,
      total12m,
      totalLifetime,
      months,
    });
  } catch (error: any) {
    console.error("[finance/fiscal/retentions] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
