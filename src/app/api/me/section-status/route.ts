// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/me/section-status
// ══════════════════════════════════════════════════════════════
// Devuelve el status de TODAS las secciones para el cliente logueado.
// Combina:
//  1. Integraciones conectadas (de Connection table) → bloqueo automático
//  2. Override global (de system_setting tabla — TODO migration)
//  3. Override por org (Organization.settings.sectionOverrides JSON)
//
// Response:
// {
//   ok: true,
//   sections: {
//     "orders": { status: "ACTIVE", missing: [] },
//     "campaigns_meta": { status: "LOCKED_INTEGRATION", missing: ["META_ADS"] },
//     "aura": { status: "MAINTENANCE", missing: [] },
//   }
// }
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SECTIONS, computeSectionStatus, getMissingIntegrations } from "@/lib/sections/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions as any);
    const orgId = (session as any)?.user?.organizationId;
    if (!orgId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    // 1. Integraciones conectadas: tienen creds + status ACTIVE en Connection.
    const connections = await prisma.connection.findMany({
      where: { organizationId: orgId },
      select: { platform: true, status: true, credentials: true },
    });

    const connected = new Set<string>();
    for (const c of connections) {
      const creds = (c.credentials as any) || {};
      // Reglas por plataforma — cuándo se considera "conectada".
      switch (c.platform) {
        case "VTEX":
          if (creds.accountName && creds.appKey && creds.appToken) connected.add("VTEX");
          break;
        case "MERCADOLIBRE":
          if (creds.accessToken && creds.mlUserId) connected.add("MERCADOLIBRE");
          break;
        case "META_ADS":
          if (creds.accessToken) connected.add("META_ADS");
          break;
        case "GOOGLE_ADS":
          if (creds.refreshToken || creds.refresh_token) connected.add("GOOGLE_ADS");
          break;
        case "GOOGLE_SEARCH_CONSOLE":
          if (creds.propertyUrl) connected.add("GOOGLE_SEARCH_CONSOLE");
          break;
      }
    }

    // NitroPixel: detectamos por presencia de eventos en pixel_events.
    try {
      const hasPixelEvents = await prisma.pixelEvent.count({
        where: { organizationId: orgId },
        take: 1,
      });
      if (hasPixelEvents > 0) connected.add("NITROPIXEL");
    } catch {}

    // 2. Override global: tabla system_setting key="section_overrides_global"
    let globalOverrides: Record<string, "ACTIVE" | "MAINTENANCE"> = {};
    try {
      const gRow = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "value" FROM "system_setting" WHERE "key" = $1 LIMIT 1`,
        "section_overrides_global",
      );
      if (gRow?.[0]?.value) {
        globalOverrides = gRow[0].value as any;
      }
    } catch {
      // Tabla no existe todavía → ignoramos.
    }

    // 3. Override por org: Organization.settings.sectionOverrides
    let orgOverrides: Record<string, "ACTIVE" | "MAINTENANCE"> = {};
    try {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { settings: true },
      });
      const settings = (org?.settings as any) || {};
      orgOverrides = settings.sectionOverrides || {};
    } catch {}

    // 4. Calcular status por cada sección.
    const sections: Record<string, { status: string; missing: string[] }> = {};
    for (const cfg of SECTIONS) {
      const status = computeSectionStatus(cfg, connected, {
        global: globalOverrides,
        org: orgOverrides,
      });
      const missing = status === "LOCKED_INTEGRATION" ? getMissingIntegrations(cfg, connected) : [];
      sections[cfg.key] = { status, missing };
    }

    return NextResponse.json({
      ok: true,
      orgId,
      sections,
      connected: Array.from(connected),
    });
  } catch (err: any) {
    console.error("[me/section-status] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
