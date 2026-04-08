export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Dashboard Preferences API
// ══════════════════════════════════════════════════════════════
// GET  /api/dashboard/preferences → devuelve layout + filtros
// POST /api/dashboard/preferences → guarda layout + filtros
//
// Persistencia en Organization.settings (JSON):
//   - dashboardLayout: { rows: [...] }  ← forma nueva (v3)
//   - dashboardWidgets: [...]           ← forma legacy (v2, widgets planos)
//
// El cliente hidrata ambas formas, así que mantenemos los dos
// campos durante la transición. Cuando el cliente guarda un layout
// nuevo, escribimos ambos para garantizar rollback sin romper.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

// Default widgets (forma legacy — el cliente los hidrata a layout de filas)
const DEFAULT_WIDGETS = [
  "revenue", "orders", "ticket", "sessions", "adspend", "roas",
  "ctr", "cpc", "conversion",
  "revenue-chart", "spend-chart",
];

// Valida que un widget entry legacy sea una string o {id, format}
function sanitizeWidgetEntry(raw: unknown): string | { id: string; format: string } | null {
  if (typeof raw === "string" && raw.length > 0) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.id === "string" && obj.id.length > 0) {
      const out: { id: string; format?: string } = { id: obj.id };
      if (typeof obj.format === "string" && obj.format.length > 0) {
        out.format = obj.format;
      }
      return out as { id: string; format: string };
    }
  }
  return null;
}

// Sanitiza un layout {rows: [...]} recibido del cliente.
// Valida shape básico — la validación profunda (template existe,
// formato compatible con size) se hace del lado del cliente en
// hydrateLayout() cuando se vuelva a cargar.
function sanitizeLayout(raw: unknown): { rows: any[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.rows)) return null;

  const rows: any[] = [];
  for (const rawRow of obj.rows) {
    if (!rawRow || typeof rawRow !== "object") continue;
    const r = rawRow as Record<string, unknown>;
    if (typeof r.templateId !== "string" || r.templateId.length === 0) continue;
    if (!Array.isArray(r.slots)) continue;

    const slots: any[] = [];
    for (const rawSlot of r.slots) {
      if (!rawSlot || typeof rawSlot !== "object") {
        slots.push({ size: "xs", widgetId: null, format: null });
        continue;
      }
      const s = rawSlot as Record<string, unknown>;
      const size = typeof s.size === "string" ? s.size : "xs";
      const widgetId = typeof s.widgetId === "string" && s.widgetId.length > 0 ? s.widgetId : null;
      const format = typeof s.format === "string" && s.format.length > 0 ? s.format : null;
      slots.push({ size, widgetId, format });
    }

    rows.push({
      id: typeof r.id === "string" ? r.id : undefined,
      templateId: r.templateId,
      title: typeof r.title === "string" && r.title.trim().length > 0 ? r.title : undefined,
      slots,
    });
  }

  return { rows };
}

export async function GET() {
  try {
    const orgId = await getOrganizationId();
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });

    const settings = (org?.settings as Record<string, unknown>) || {};

    // Forma nueva (v3) — layout de filas
    const rawLayout = settings.dashboardLayout;
    const layout = sanitizeLayout(rawLayout);

    // Forma legacy (v2) — lista plana de widgets. El cliente la
    // migra a layout si no encuentra `layout`.
    const rawWidgets = (settings.dashboardWidgets as unknown[]) || DEFAULT_WIDGETS;
    const widgets = Array.isArray(rawWidgets)
      ? rawWidgets.map(sanitizeWidgetEntry).filter((x) => x !== null)
      : DEFAULT_WIDGETS;

    const widgetFilters =
      (settings.dashboardWidgetFilters as Record<string, Record<string, string>>) || {};

    return NextResponse.json({ layout, widgets, widgetFilters });
  } catch (error: any) {
    console.error("[Dashboard Preferences] GET error:", error);
    return NextResponse.json({
      layout: null,
      widgets: DEFAULT_WIDGETS,
      widgetFilters: {},
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const body = await request.json();
    const rawLayout = body.layout;
    const rawWidgets = body.widgets;
    const widgetFilters = body.widgetFilters;

    // El cliente puede mandar `layout` (forma nueva), `widgets` (legacy),
    // o ambos. Priorizamos layout, pero persistimos widgets derivados
    // para backward-compat si el cliente los manda.
    const layout = sanitizeLayout(rawLayout);

    let widgets: Array<string | { id: string; format: string }> = [];
    if (Array.isArray(rawWidgets)) {
      widgets = rawWidgets
        .map(sanitizeWidgetEntry)
        .filter((x): x is string | { id: string; format: string } => x !== null);
    }

    if (!layout && widgets.length === 0) {
      return NextResponse.json(
        { error: "layout or widgets must be provided" },
        { status: 400 }
      );
    }

    // Validate widgetFilters shape (object of objects of strings)
    const safeFilters: Record<string, Record<string, string>> = {};
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

    // Merge con settings existentes
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const existingSettings = (org?.settings as Record<string, unknown>) || {};

    const newSettings: Record<string, unknown> = {
      ...existingSettings,
      dashboardWidgetFilters: safeFilters,
    };

    if (layout) newSettings.dashboardLayout = layout;
    if (widgets.length > 0) newSettings.dashboardWidgets = widgets;

    await prisma.organization.update({
      where: { id: orgId },
      data: { settings: newSettings as any },
    });

    return NextResponse.json({
      ok: true,
      layout,
      widgets,
      widgetFilters: safeFilters,
    });
  } catch (error: any) {
    console.error("[Dashboard Preferences] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
