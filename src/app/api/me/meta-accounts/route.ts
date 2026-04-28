// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/me/meta-accounts
// ══════════════════════════════════════════════════════════════
// Devuelve la lista de Ad Accounts disponibles para el usuario
// logueado, leyendo de su Connection META_ADS.availableAdAccounts
// (poblada por el OAuth callback).
//
// Usado por el wizard para mostrar dropdown de selección post-OAuth.
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

    if (!orgId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "META_ADS" as any },
      select: { credentials: true, status: true },
    });

    if (!conn) {
      return NextResponse.json({ ok: true, connected: false, accounts: [] });
    }

    const creds = (conn.credentials as any) || {};
    const accounts = (creds.availableAdAccounts || []).map((a: any) => ({
      id: a.id,
      name: a.name || a.id,
      status: a.status,
    }));

    return NextResponse.json({
      ok: true,
      connected: !!creds.accessToken,
      currentAdAccountId: creds.adAccountId || null,
      accounts,
    });
  } catch (err: any) {
    console.error("[me/meta-accounts] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
