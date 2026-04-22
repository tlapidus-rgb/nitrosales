// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/onboarding/test-credentials
// ══════════════════════════════════════════════════════════════
// NOTA: este endpoint NO se usa en el wizard del cliente (se removio
// el boton "Probar conexion" del UI por decision de UX — el cliente
// no debe ver fallas, las valida el admin antes de aprobar el backfill).
//
// Lo dejamos disponible por si en el futuro lo necesitamos (ej:
// debugging, scripts internos). La logica real esta en
// src/lib/onboarding/credential-tests.ts y se reusa desde el
// endpoint admin /api/admin/onboardings/[id]/test-credentials.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { testCredentialsByPlatform } from "@/lib/onboarding/credential-tests";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ ok: false, detail: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const platform = (body?.platform || "").toUpperCase();
    const credentials = body?.credentials || {};

    const result = await testCredentialsByPlatform(platform, credentials);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[onboarding/test-credentials] error:", error);
    return NextResponse.json({ ok: false, detail: error?.message || "Error interno" }, { status: 500 });
  }
}
