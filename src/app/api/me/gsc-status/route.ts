// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/me/gsc-status
// ══════════════════════════════════════════════════════════════
// Devuelve estado de GSC del cliente logueado.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions as any);
    const orgId = (session as any)?.user?.organizationId;
    if (!orgId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "GOOGLE_SEARCH_CONSOLE" as any },
      select: { credentials: true, status: true, lastSyncAt: true, lastSyncError: true },
    });

    // Contar dias sincronizados (proxy de "conectado y funcionando")
    let daysWithData = 0;
    try {
      daysWithData = await prisma.webMetricDaily.count({
        where: { organizationId: orgId, source: "GSC" as any },
      });
    } catch {}

    if (!conn) {
      return NextResponse.json({
        ok: true,
        connected: false,
        propertyUrl: null,
        daysWithData,
        status: "DISCONNECTED",
        lastSyncAt: null,
        lastSyncError: null,
        serviceAccountEmail: process.env.GSC_SERVICE_ACCOUNT_EMAIL || null,
      });
    }

    const creds = (conn.credentials as any) || {};

    return NextResponse.json({
      ok: true,
      connected: !!creds.propertyUrl && (conn.status === "ACTIVE" || daysWithData > 0),
      propertyUrl: creds.propertyUrl || null,
      daysWithData,
      status: conn.status,
      lastSyncAt: conn.lastSyncAt?.toISOString() || null,
      lastSyncError: conn.lastSyncError,
      serviceAccountEmail: process.env.GSC_SERVICE_ACCOUNT_EMAIL || null,
    });
  } catch (err: any) {
    console.error("[me/gsc-status] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
