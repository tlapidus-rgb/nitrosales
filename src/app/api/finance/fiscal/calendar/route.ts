// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/finance/fiscal/calendar — Fase 6 Fiscal
// ═══════════════════════════════════════════════════════════════════
// GET: devuelve los proximos `monthsAhead` meses de obligaciones
//      fiscales derivadas del fiscalProfile + overrides per-org.
//
// Query params:
//   from           YYYY-MM-DD (default: hoy)
//   monthsAhead    1..24 (default 12)
//
// Response:
//   {
//     profile: FiscalProfileInput | null,
//     obligations: ExpandedObligation[],       // expanded a fechas
//     baseObligations: MergedObligation[],     // la plantilla merged
//     overridesCount: number
//   }
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";
import {
  buildDefaultObligations,
  expandObligations,
  applyOverrides,
  type FiscalProfileInput,
  type OverrideRow,
} from "@/lib/finanzas/fiscal-calendar";

export const dynamic = "force-dynamic";

function parseDate(s: string | null): Date {
  if (!s) return new Date();
  const d = new Date(s);
  if (isNaN(d.getTime())) return new Date();
  return d;
}

function clampMonths(v: string | null): number {
  const n = parseInt(v ?? "12", 10);
  if (!Number.isFinite(n) || n < 1) return 12;
  return Math.min(24, n);
}

export async function GET(req: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const url = new URL(req.url);
    const from = parseDate(url.searchParams.get("from"));
    const monthsAhead = clampMonths(url.searchParams.get("monthsAhead"));

    // 1. Fiscal profile del org
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const settings = (org?.settings as Record<string, unknown>) || {};
    const profile = (settings.fiscalProfile as FiscalProfileInput) || null;

    // 2. Overrides
    const overrideRows = await prisma.fiscalObligationOverride.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
    });

    const overrides: OverrideRow[] = overrideRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      defaultKey: r.defaultKey,
      name: r.name,
      category: r.category,
      dueDay: r.dueDay,
      frequency: r.frequency,
      yearlyMonth: r.yearlyMonth,
      amount: r.amount ? Number(r.amount) : null,
      amountSource: r.amountSource,
      isActive: r.isActive,
      hideDefault: r.hideDefault,
      note: r.note,
      startMonth: r.startMonth,
      endMonth: r.endMonth,
    }));

    // 3. Defaults + merge + expand
    const defaults = buildDefaultObligations(profile);
    const merged = applyOverrides(defaults, overrides);
    const expanded = expandObligations(merged, from, monthsAhead);

    return NextResponse.json({
      profile,
      obligations: expanded,
      baseObligations: merged,
      overridesCount: overrides.length,
      from: from.toISOString().slice(0, 10),
      monthsAhead,
    });
  } catch (error: any) {
    console.error("[finance/fiscal/calendar] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
