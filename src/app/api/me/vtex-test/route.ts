// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/me/vtex-test
// ══════════════════════════════════════════════════════════════
// Reusa testVtex de credential-tests.ts para validar credenciales
// VTEX antes de guardarlas. NO persiste nada.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { testCredentialsByPlatform } from "@/lib/onboarding/credential-tests";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions as any);
    if (!(session as any)?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const result = await testCredentialsByPlatform("VTEX", body);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[me/vtex-test] error:", err);
    return NextResponse.json({ ok: false, detail: err.message }, { status: 500 });
  }
}
