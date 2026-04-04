// ══════════════════════════════════════════════════════════════
// Dashboard Preferences API
// ══════════════════════════════════════════════════════════════
// GET  /api/dashboard/preferences → devuelve lista de widgets activos
// POST /api/dashboard/preferences → guarda lista de widgets
// Almacena en Organization.settings (JSON) → campo dashboardWidgets
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// Default widgets (same as the original dashboard layout)
const DEFAULT_WIDGETS = [
  "revenue", "orders", "ticket", "sessions", "adspend", "roas",
  "ctr", "cpc", "conversion",
  "revenue-chart", "spend-chart",
];

export async function GET() {
  try {
    const orgId = await getOrganizationId();
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });

    const settings = (org?.settings as Record<string, unknown>) || {};
    const widgets = (settings.dashboardWidgets as string[]) || DEFAULT_WIDGETS;

    return NextResponse.json({ widgets });
  } catch (error: any) {
    console.error("[Dashboard Preferences] GET error:", error);
    return NextResponse.json({ widgets: DEFAULT_WIDGETS });
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const body = await request.json();
    const widgets = body.widgets;

    if (!Array.isArray(widgets)) {
      return NextResponse.json({ error: "widgets must be an array" }, { status: 400 });
    }

    // Get existing settings to merge (don't overwrite other fields)
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });

    const existingSettings = (org?.settings as Record<string, unknown>) || {};
    const newSettings = { ...existingSettings, dashboardWidgets: widgets };

    await prisma.organization.update({
      where: { id: orgId },
      data: { settings: newSettings },
    });

    return NextResponse.json({ ok: true, widgets });
  } catch (error: any) {
    console.error("[Dashboard Preferences] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
