// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/meta-status?email=...&key=...
// ══════════════════════════════════════════════════════════════
// Diagnostico: dado un email de user, devuelve el estado de su
// Connection de META_ADS — si tiene token, cuando expira, cuantas
// ad accounts disponibles, etc. NO devuelve el token completo (security).
//
// Util para confirmar que el OAuth flow funciono sin tener que ir a la
// DB directo.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const email = (url.searchParams.get("email") || "").toLowerCase().trim();
    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!email) return NextResponse.json({ error: "email requerido" }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, organizationId: true },
    });
    if (!user) return NextResponse.json({ error: `No existe user ${email}` }, { status: 404 });

    const conn = await prisma.connection.findFirst({
      where: { organizationId: user.organizationId, platform: "META_ADS" as any },
      select: {
        id: true,
        status: true,
        lastSyncAt: true,
        lastSyncError: true,
        credentials: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!conn) {
      return NextResponse.json({
        ok: true,
        user: { email, orgId: user.organizationId },
        meta: { connected: false, message: "No hay Connection META_ADS para esta org" },
      });
    }

    const creds = (conn.credentials as any) || {};
    const hasToken = !!creds.accessToken;
    const tokenLength = creds.accessToken?.length || 0;
    const expiresAt = creds.tokenExpiresAt ? new Date(creds.tokenExpiresAt) : null;
    const daysLeft = expiresAt
      ? Math.floor((expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000))
      : null;

    return NextResponse.json({
      ok: true,
      user: { email, orgId: user.organizationId },
      meta: {
        connected: hasToken,
        connectionId: conn.id,
        status: conn.status,
        lastSyncError: conn.lastSyncError,
        token: {
          present: hasToken,
          length: tokenLength,
          preview: hasToken ? `${creds.accessToken.slice(0, 8)}...${creds.accessToken.slice(-4)}` : null,
          expiresAt: expiresAt?.toISOString() || null,
          daysLeft,
        },
        adAccountId: creds.adAccountId || null,
        pixelId: creds.pixelId || null,
        availableAdAccounts: (creds.availableAdAccounts || []).length,
        availableAdAccountsSample: (creds.availableAdAccounts || []).slice(0, 5),
        connectedAt: conn.createdAt,
        updatedAt: conn.updatedAt,
      },
    });
  } catch (err: any) {
    console.error("[meta-status] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
