// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/alerts — Fase 8b (actualizado 8e)
// ═══════════════════════════════════════════════════════════════════
// GET: alertas unificadas de todas las fuentes con filtros opcionales +
// favoritas del user logueado.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrganizationId } from "@/lib/auth-guard";
import { buildUnifiedAlerts } from "@/lib/alerts/alert-hub";

export const dynamic = "force-dynamic";

function getBaseUrl(req: NextRequest): string {
  const envUrl = process.env.NEXTAUTH_URL;
  if (envUrl) return envUrl;
  const protocol = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host");
  return host ? `${protocol}://${host}` : "https://nitrosales.vercel.app";
}

export async function GET(req: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id ?? null;

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
    });
  } catch (error: any) {
    console.error("[/api/alerts GET] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
