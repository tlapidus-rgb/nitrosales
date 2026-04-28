// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/me/google-set-customer-id
// ══════════════════════════════════════════════════════════════
// Actualiza Connection.credentials.customerId de Google Ads.
// Body: { customerId: "1234567890" }
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions as any);
    const orgId = (session as any)?.user?.organizationId;
    if (!orgId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const customerId = String(body?.customerId || "").replace(/[^0-9]/g, "");
    const loginCustomerId = String(body?.loginCustomerId || "").replace(/[^0-9]/g, "");

    if (customerId && customerId.length !== 10) {
      return NextResponse.json({ error: "customerId debe tener 10 digitos" }, { status: 400 });
    }
    if (loginCustomerId && loginCustomerId.length !== 10) {
      return NextResponse.json({ error: "loginCustomerId debe tener 10 digitos" }, { status: 400 });
    }

    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "GOOGLE_ADS" as any },
    });
    if (!conn) return NextResponse.json({ error: "No hay Connection GOOGLE_ADS" }, { status: 404 });

    const creds = (conn.credentials as any) || {};
    const updates: any = { ...creds };
    if (customerId) updates.customerId = customerId;
    // loginCustomerId puede ser vaciado explicitamente.
    if (body.loginCustomerId !== undefined) {
      if (loginCustomerId) updates.loginCustomerId = loginCustomerId;
      else delete updates.loginCustomerId;
    }

    await prisma.connection.update({
      where: { id: conn.id },
      data: { credentials: updates },
    });

    return NextResponse.json({ ok: true, customerId, loginCustomerId: updates.loginCustomerId || null });
  } catch (err: any) {
    console.error("[me/google-set-customer-id] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
