// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/me/meta-set-ad-account
// ══════════════════════════════════════════════════════════════
// Actualiza Connection.credentials.adAccountId de la org del cliente
// logueado. Usado por /settings/integraciones/meta cuando el cliente
// elige una cuenta del dropdown.
//
// Body: { adAccountId: "act_123456789" | "123456789" }
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
    const raw = String(body?.adAccountId || "").trim();
    // Aceptar tanto "act_123" como "123" — guardamos sin prefijo.
    const adAccountId = raw.replace(/^act_/, "").replace(/[^0-9]/g, "");
    if (!adAccountId) return NextResponse.json({ error: "adAccountId invalido" }, { status: 400 });

    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "META_ADS" as any },
    });
    if (!conn) return NextResponse.json({ error: "No hay Connection META_ADS" }, { status: 404 });

    const creds = (conn.credentials as any) || {};
    await prisma.connection.update({
      where: { id: conn.id },
      data: {
        credentials: { ...creds, adAccountId },
      },
    });

    return NextResponse.json({ ok: true, adAccountId });
  } catch (err: any) {
    console.error("[me/meta-set-ad-account] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
