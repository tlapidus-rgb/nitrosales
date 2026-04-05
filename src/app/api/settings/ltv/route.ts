export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Settings: LTV Thresholds API
// ══════════════════════════════════════════════════════════════
// GET  /api/settings/ltv → current thresholds + auto-suggested
// PUT  /api/settings/ltv → save custom thresholds
// ══════════════════════════════════════════════════════════════

// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

const DEFAULT_LOW = 25000;
const DEFAULT_MED = 100000;

export async function GET() {
  try {
    const orgId = await getOrganizationId();
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });

    const settings = (org?.settings as Record<string, any>) || {};
    const thresholds = settings.ltvThresholds || { low: DEFAULT_LOW, medium: DEFAULT_MED };

    // Auto-suggest based on real data percentiles
    const percentiles = await prisma.$queryRawUnsafe<
      Array<{ p25: string; p50: string; p75: string; p90: string; p95: string; total_customers: string }>
    >(
      `SELECT
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY total_spent)::int AS p25,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY total_spent)::int AS p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_spent)::int AS p75,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY total_spent)::int AS p90,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_spent)::int AS p95,
        COUNT(*)::int AS total_customers
      FROM (
        SELECT "customerId", SUM("totalValue") AS total_spent
        FROM orders
        WHERE "organizationId" = $1
          AND status NOT IN ('CANCELLED', 'RETURNED')
          AND "customerId" IS NOT NULL
          AND source != 'MELI'
        GROUP BY "customerId"
      ) sub`,
      orgId
    );

    const p = percentiles[0];
    const totalCustomers = Number(p?.total_customers || 0);

    // Suggest: low = median (p50), medium = p90
    // Round to nearest 5K for clean numbers
    const roundTo5K = (n: number) => Math.round(n / 5000) * 5000;
    const suggested = totalCustomers >= 100
      ? {
          low: roundTo5K(Number(p.p50)),
          medium: roundTo5K(Number(p.p90)),
          data: {
            p25: Number(p.p25),
            p50: Number(p.p50),
            p75: Number(p.p75),
            p90: Number(p.p90),
            p95: Number(p.p95),
            totalCustomers,
          },
        }
      : null;

    return NextResponse.json({ current: thresholds, suggested });
  } catch (error: any) {
    console.error("[Settings:LTV] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch LTV settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const body = await request.json();
    const { low, medium } = body;

    // Validate
    if (typeof low !== "number" || typeof medium !== "number") {
      return NextResponse.json(
        { error: "low y medium deben ser numeros" },
        { status: 400 }
      );
    }
    if (low <= 0 || medium <= 0) {
      return NextResponse.json(
        { error: "Los umbrales deben ser mayores a 0" },
        { status: 400 }
      );
    }
    if (medium <= low) {
      return NextResponse.json(
        { error: "El umbral medio debe ser mayor al bajo" },
        { status: 400 }
      );
    }

    // Read current settings and merge
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const currentSettings = (org?.settings as Record<string, any>) || {};

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        settings: {
          ...currentSettings,
          ltvThresholds: { low: Math.round(low), medium: Math.round(medium) },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      thresholds: { low: Math.round(low), medium: Math.round(medium) },
    });
  } catch (error: any) {
    console.error("[Settings:LTV] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to save LTV settings" },
      { status: 500 }
    );
  }
}
