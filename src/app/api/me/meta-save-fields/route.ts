// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/me/meta-save-fields
// ══════════════════════════════════════════════════════════════
// Guarda campos Meta editables desde /settings/integraciones/meta.
// Solo persiste lo que vino en el body — campos vacios se preservan.
//
// Body: { adAccountId?, businessId?, pixelId?, pixelAccessToken? }
//
// pixelAccessToken: secreto. Solo se guarda si vino. Si no vino,
// preservamos el existente. Vacio explicito = "borrar el secret"
// (no soportado todavia, pasamos null si no quieren tener uno).
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

    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "META_ADS" as any },
    });
    if (!conn) return NextResponse.json({ error: "No hay Connection META_ADS" }, { status: 404 });

    const existingCreds = (conn.credentials as any) || {};
    const updates: any = {};

    // adAccountId: 10+ digitos sin "act_" prefix.
    if (body.adAccountId !== undefined) {
      const cleaned = String(body.adAccountId || "").replace(/^act_/, "").replace(/[^0-9]/g, "");
      if (cleaned) updates.adAccountId = cleaned;
    }

    // businessId: 15-16 digitos.
    if (body.businessId !== undefined) {
      const cleaned = String(body.businessId || "").replace(/[^0-9]/g, "");
      if (cleaned) updates.businessId = cleaned;
      else if (body.businessId === "") delete existingCreds.businessId; // explicit clear
    }

    // pixelId: 15-16 digitos.
    if (body.pixelId !== undefined) {
      const cleaned = String(body.pixelId || "").replace(/[^0-9]/g, "");
      if (cleaned) updates.pixelId = cleaned;
      else if (body.pixelId === "") delete existingCreds.pixelId; // explicit clear
    }

    // pixelAccessToken: secreto, solo guardar si vino con valor.
    if (body.pixelAccessToken !== undefined) {
      const cleaned = String(body.pixelAccessToken || "").trim();
      if (cleaned) {
        if (cleaned.length < 20) {
          return NextResponse.json({ error: `Pixel Access Token muy corto (${cleaned.length} chars)` }, { status: 400 });
        }
        updates.pixelAccessToken = cleaned;
      }
    }

    const credentials = { ...existingCreds, ...updates };

    await prisma.connection.update({
      where: { id: conn.id },
      data: { credentials },
    });

    return NextResponse.json({
      ok: true,
      saved: Object.keys(updates),
    });
  } catch (err: any) {
    console.error("[me/meta-save-fields] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
