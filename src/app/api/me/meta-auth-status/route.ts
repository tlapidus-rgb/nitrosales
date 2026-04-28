// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/me/meta-auth-status
// ══════════════════════════════════════════════════════════════
// Devuelve el estado de autorización Meta del cliente logueado:
//   - state: "NONE" → no hizo solicitud todavia
//   - state: "PENDING" → solicito, esperando que admin lo agregue como tester
//   - state: "APPROVED" → admin lo agrego como tester, puede conectar OAuth
//   - state: "CONNECTED" → ya conecto OAuth, todo listo
//
// Usado por el wizard para mostrar el bloque correcto.
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
      where: { organizationId: orgId, platform: "META_ADS" as any },
      select: { credentials: true, status: true },
    });

    if (!conn) {
      return NextResponse.json({ ok: true, state: "NONE" });
    }

    const creds = (conn.credentials as any) || {};
    const hasToken = !!creds.accessToken;

    if (hasToken) {
      return NextResponse.json({
        ok: true,
        state: "CONNECTED",
        fbEmail: creds.fbEmail || null,
        tokenExpiresAt: creds.tokenExpiresAt || null,
        adAccountId: creds.adAccountId || null,
        availableAdAccounts: (creds.availableAdAccounts || []).length,
        // S58: campos opcionales para gestion en /settings/integraciones/meta.
        businessId: creds.businessId || null,
        pixelId: creds.pixelId || null,
        hasPixelAccessToken: !!creds.pixelAccessToken,
      });
    }

    const authStatus = creds.authStatus || null;
    if (authStatus === "APPROVED") {
      return NextResponse.json({
        ok: true,
        state: "APPROVED",
        fbEmail: creds.fbEmail || null,
        approvedAt: creds.authApprovedAt || null,
      });
    }
    if (authStatus === "PENDING") {
      return NextResponse.json({
        ok: true,
        state: "PENDING",
        fbEmail: creds.fbEmail || null,
        requestedAt: creds.authRequestedAt || null,
      });
    }

    return NextResponse.json({ ok: true, state: "NONE" });
  } catch (err: any) {
    console.error("[me/meta-auth-status] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
