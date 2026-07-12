// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/alerts — Fase 8b (actualizado 8e)
// ═══════════════════════════════════════════════════════════════════
// GET: alertas unificadas de todas las fuentes con filtros opcionales +
// favoritas del user logueado.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { tryGetOrganizationId } from "@/lib/auth-guard";
import { buildUnifiedAlerts } from "@/lib/alerts/alert-hub";
import { getSessionUserId } from "@/lib/alerts/get-user-id";

export const dynamic = "force-dynamic";

function getBaseUrl(req: NextRequest): string {
  const envUrl = process.env.NEXTAUTH_URL;
  if (envUrl) return envUrl;
  const protocol = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host");
  return host ? `${protocol}://${host}` : "https://app.nitrosales.ai";
}

// Payload vacío (misma forma que el OK) para cuando no hay org resoluble.
const EMPTY_ALERTS = {
  alerts: [],
  total: 0,
  countsBySource: {},
  countsBySeverity: {},
  countsByCategory: {},
  favoriteCount: 0,
  unreadCount: 0,
  unreadCountBySeverity: {},
  needsOrgSelection: true,
};

export async function GET(req: NextRequest) {
  try {
    // Variante que NO tira: devuelve null si no hay org resoluble (usuario staff
    // sin org seleccionada, o sesión sin organizationId). Con 2+ orgs activas,
    // getOrganizationId() tiraba AmbiguousOrgError → 500 en el badge de alertas
    // (pollea con ?limit=1). Ahora degradamos: alertas vacías (200) + flag, sin
    // romper la UI. El front puede usar needsOrgSelection para pedir elegir org.
    const orgId = await tryGetOrganizationId();
    if (!orgId) {
      return NextResponse.json(EMPTY_ALERTS);
    }
    const userId = await getSessionUserId();

    const url = new URL(req.url);
    const source = url.searchParams.get("source");
    const severity = url.searchParams.get("severity");
    const category = url.searchParams.get("category");
    const limit = Math.min(
      200,
      Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50)
    );

    const hdrs = await headers();
    const cookie = hdrs.get("cookie") ?? "";
    const baseUrl = getBaseUrl(req);

    const {
      alerts,
      countsBySource,
      countsBySeverity,
      countsByCategory,
      favoriteCount,
      unreadCount,
      unreadCountBySeverity,
    } = await buildUnifiedAlerts({
      orgId,
      userId,
      baseUrl,
      cookie,
    });

    let filtered = alerts;
    if (source) filtered = filtered.filter((a) => a.source === source);
    if (severity) filtered = filtered.filter((a) => a.severity === severity);
    if (category) filtered = filtered.filter((a) => a.category === category);

    return NextResponse.json({
      alerts: filtered.slice(0, limit),
      total: filtered.length,
      countsBySource,
      countsBySeverity,
      countsByCategory,
      favoriteCount,
      unreadCount,
      unreadCountBySeverity,
    });
  } catch (error: any) {
    console.error("[/api/alerts GET] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
