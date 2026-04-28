// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/me/vtex-save
// ══════════════════════════════════════════════════════════════
// Guarda credenciales VTEX (accountName, appKey, appToken + opcionales).
// Body: { accountName, appKey, appToken, storeUrl, salesChannelId }
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
    const accountName = String(body?.accountName || "").trim().replace(/[^a-zA-Z0-9-]/g, "");
    const appKey = String(body?.appKey || "").trim();
    const appToken = String(body?.appToken || "").trim();
    const storeUrl = String(body?.storeUrl || "").trim();
    const salesChannelId = String(body?.salesChannelId || "1").trim();

    if (!accountName) return NextResponse.json({ error: "accountName requerido" }, { status: 400 });
    if (!appKey || appKey.length < 20) {
      return NextResponse.json({ error: `appKey muy corta (${appKey.length} chars). Debería tener 30+.` }, { status: 400 });
    }
    if (!appToken || appToken.length < 40) {
      return NextResponse.json({ error: `appToken muy corto (${appToken.length} chars). Debería tener 60+. Volvé al admin VTEX y copialo COMPLETO.` }, { status: 400 });
    }

    const existing = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "VTEX" as any },
    });

    const credentials = {
      ...((existing?.credentials as any) || {}),
      accountName,
      appKey,
      appToken,
      ...(storeUrl ? { storeUrl } : {}),
      salesChannelId,
    };

    if (existing) {
      await prisma.connection.update({
        where: { id: existing.id },
        data: { credentials, status: "ACTIVE" as any, lastSyncError: null },
      });
    } else {
      await prisma.connection.create({
        data: {
          organizationId: orgId,
          platform: "VTEX" as any,
          status: "ACTIVE" as any,
          credentials,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[me/vtex-save] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
