// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/me/ml-status
// ══════════════════════════════════════════════════════════════
// Devuelve estado de la Connection MERCADOLIBRE del cliente logueado.
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
      where: { organizationId: orgId, platform: "MERCADOLIBRE" as any },
      select: { credentials: true, status: true, lastSyncAt: true, lastSyncError: true },
    });

    if (!conn) {
      return NextResponse.json({ ok: true, connected: false, status: "DISCONNECTED" });
    }

    const creds = (conn.credentials as any) || {};

    return NextResponse.json({
      ok: true,
      connected: !!(creds.accessToken && creds.mlUserId),
      status: conn.status,
      mlUserId: creds.mlUserId || null,
      nickname: creds.nickname || null,
      siteId: creds.siteId || null,
      tokenExpiresAt: creds.tokenExpiresAt || null,
      lastSyncAt: conn.lastSyncAt?.toISOString() || null,
      lastSyncError: conn.lastSyncError,
    });
  } catch (err: any) {
    console.error("[me/ml-status] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
