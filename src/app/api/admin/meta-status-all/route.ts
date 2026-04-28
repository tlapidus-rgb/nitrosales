// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/meta-status-all?key=...
// ══════════════════════════════════════════════════════════════
// Lista TODAS las Connections META_ADS con presencia/ausencia de
// token. Util para encontrar conexiones huerfanas o donde se haya
// guardado un token a un orgId equivocado durante OAuth.
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
    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const conns = await prisma.connection.findMany({
      where: { platform: "META_ADS" as any },
      select: {
        id: true,
        organizationId: true,
        status: true,
        credentials: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const result = conns.map((c) => {
      const creds = (c.credentials as any) || {};
      const hasToken = !!creds.accessToken;
      return {
        id: c.id,
        orgId: c.organizationId,
        status: c.status,
        hasToken,
        tokenPreview: hasToken ? `${creds.accessToken.slice(0, 8)}...${creds.accessToken.slice(-4)}` : null,
        tokenExpiresAt: creds.tokenExpiresAt || null,
        availableAdAccounts: (creds.availableAdAccounts || []).length,
        adAccountId: creds.adAccountId || null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });

    return NextResponse.json({
      ok: true,
      total: result.length,
      withToken: result.filter((c) => c.hasToken).length,
      withoutToken: result.filter((c) => !c.hasToken).length,
      connections: result,
    });
  } catch (err: any) {
    console.error("[meta-status-all] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
