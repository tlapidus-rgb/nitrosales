export const dynamic = "force-dynamic";

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
    const widgetFilters =
      (settings.dashboardWidgetFilters as Record<string, Record<string, string>>) || {};

    return NextResponse.json({ widgets, widgetFilters });
  } catch (error: any) {
    console.error("[Dashboard Preferences] GET error:", error);
    return NextResponse.json({ widgets: DEFAULT_WIDGETS, widgetFilters: {} });
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const body = await request.json();
    const widgets = body.widgets;
    const widgetFilters = body.widgetFilters;

    if (!Array.isArray(widgets)) {
      return NextResponse.json({ error: "widgets must be an array" }, { status: 400 });
    }

    // Validate widgetFilters shape if provided (object of objects of strings)
    let safeFilters: Record<string, Record<string, string>> = {};
    if (widgetFilters && typeof widgetFilters === "object" && !Array.isArray(widgetFilters)) {
      for (const [wId, raw] of Object.entries(widgetFilters)) {
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          const inner: Record<string, string> = {};
          for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            if (typeof v === "string" && v.length > 0 && v !== "all") {
              inner[k] = v;
            }
          }
          if (Object.keys(inner).length > 0) safeFilters[wId] = inner;
        }
      }
    }

    // Get existing settings to merge (don't overwrite other fields)
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });

    const existingSettings = (org?.settings as Record<string, unknown>) || {};
    const newSettings = {
      ...existingSettings,
      dashboardWidgets: widgets,
      dashboardWidgetFilters: safeFilters,
    };

    await prisma.organization.update({
      where: { id: orgId },
      data: { settings: newSettings },
    });

    return NextResponse.json({ ok: true, widgets, widgetFilters: safeFilters });
  } catch (error: any) {
    console.error("[Dashboard Preferences] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
