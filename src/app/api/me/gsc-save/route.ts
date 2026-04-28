// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/me/gsc-save
// ══════════════════════════════════════════════════════════════
// Guarda la propertyUrl de GSC del cliente.
// Body: { propertyUrl: "https://www.tutienda.com/" }
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
    const propertyUrl = String(body?.propertyUrl || "").trim();

    if (!propertyUrl) return NextResponse.json({ error: "propertyUrl requerida" }, { status: 400 });
    if (!/^https?:\/\/.+/.test(propertyUrl)) {
      return NextResponse.json({ error: "propertyUrl debe empezar con http:// o https://" }, { status: 400 });
    }

    const existing = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "GOOGLE_SEARCH_CONSOLE" as any },
    });
    const creds = { ...((existing?.credentials as any) || {}), propertyUrl };

    if (existing) {
      await prisma.connection.update({
        where: { id: existing.id },
        data: { credentials: creds },
      });
    } else {
      await prisma.connection.create({
        data: {
          organizationId: orgId,
          platform: "GOOGLE_SEARCH_CONSOLE" as any,
          status: "PENDING" as any,
          credentials: creds,
        },
      });
    }

    return NextResponse.json({ ok: true, propertyUrl });
  } catch (err: any) {
    console.error("[me/gsc-save] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
