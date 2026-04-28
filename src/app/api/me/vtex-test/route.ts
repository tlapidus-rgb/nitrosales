// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/me/vtex-test
// ══════════════════════════════════════════════════════════════
// Reusa testVtex de credential-tests.ts para validar credenciales
// VTEX antes de guardarlas. NO persiste nada.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { testCredentialsByPlatform } from "@/lib/onboarding/credential-tests";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions as any);
    const orgId = (session as any)?.user?.organizationId;
    if (!orgId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // S58: si el cliente no manda appKey/appToken, los buscamos en la DB
    // (caso "probar credenciales actuales sin re-pegar el secret").
    let creds = { ...body };
    if (!creds.appKey || !creds.appToken) {
      const conn = await prisma.connection.findFirst({
        where: { organizationId: orgId, platform: "VTEX" as any },
      });
      const stored = (conn?.credentials as any) || {};
      if (!creds.appKey && stored.appKey) creds.appKey = stored.appKey;
      if (!creds.appToken && stored.appToken) creds.appToken = stored.appToken;
      if (!creds.accountName && stored.accountName) creds.accountName = stored.accountName;
    }

    const result = await testCredentialsByPlatform("VTEX", creds);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[me/vtex-test] error:", err);
    return NextResponse.json({ ok: false, detail: err.message }, { status: 500 });
  }
}
