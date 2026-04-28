// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/me/vtex-status
// ══════════════════════════════════════════════════════════════
// Devuelve estado de la Connection VTEX del cliente logueado.
// NO devuelve appKey/appToken completos (solo flag de presencia).
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
      where: { organizationId: orgId, platform: "VTEX" as any },
      select: { credentials: true, status: true, lastSyncAt: true, lastSyncError: true },
    });

    if (!conn) {
      return NextResponse.json({ ok: true, connected: false, status: "DISCONNECTED" });
    }

    const creds = (conn.credentials as any) || {};

    return NextResponse.json({
      ok: true,
      connected: !!(creds.accountName && creds.appKey && creds.appToken),
      status: conn.status,
      accountName: creds.accountName || null,
      hasKey: !!creds.appKey,
      hasToken: !!creds.appToken,
      storeUrl: creds.storeUrl || null,
      salesChannelId: creds.salesChannelId || "1",
      lastSyncAt: conn.lastSyncAt?.toISOString() || null,
      lastSyncError: conn.lastSyncError,
    });
  } catch (err: any) {
    console.error("[me/vtex-status] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
