// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/me/google-auth-status
// ══════════════════════════════════════════════════════════════
// Mismo patron que meta-auth-status pero para Google.
// Estados: NONE / PENDING / APPROVED / CONNECTED.
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
      where: { organizationId: orgId, platform: "GOOGLE_ADS" as any },
      select: { credentials: true, status: true },
    });

    if (!conn) return NextResponse.json({ ok: true, state: "NONE" });

    const creds = (conn.credentials as any) || {};
    const hasToken = !!(creds.refreshToken || creds.refresh_token);

    if (hasToken) {
      return NextResponse.json({
        ok: true,
        state: "CONNECTED",
        googleEmail: creds.googleEmail || null,
        customerId: creds.customerId || null,
      });
    }

    const authStatus = creds.authStatus || null;
    if (authStatus === "APPROVED") {
      return NextResponse.json({
        ok: true,
        state: "APPROVED",
        googleEmail: creds.googleEmail || null,
        approvedAt: creds.authApprovedAt || null,
      });
    }
    if (authStatus === "PENDING") {
      return NextResponse.json({
        ok: true,
        state: "PENDING",
        googleEmail: creds.googleEmail || null,
        requestedAt: creds.authRequestedAt || null,
      });
    }

    return NextResponse.json({ ok: true, state: "NONE" });
  } catch (err: any) {
    console.error("[me/google-auth-status] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
