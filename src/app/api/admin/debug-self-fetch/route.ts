// ══════════════════════════════════════════════════════════════════════════
// GET /api/admin/debug-self-fetch — diagnóstico TEMPORAL
// ══════════════════════════════════════════════════════════════════════════
// Existe para contestar una sola pregunta que no se puede responder por
// inferencia: cuando este deployment se llama a sí mismo, ¿a qué dominio le
// pega? Ver src/lib/self-fetch.ts y el incidente del 2026-09-06 (un preview
// escribió en producción).
//
// ⚠️ BORRAR cuando la pregunta esté contestada. No devuelve secretos: sólo si
// están presentes o no.
// ══════════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { isValidAdminKey } from "@/lib/admin-key";
import { selfFetchBaseUrl, selfFetchHeaders } from "@/lib/self-fetch";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isValidAdminKey(req.nextUrl.searchParams.get("key"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = req.nextUrl.origin;
  return NextResponse.json({
    // Lo que decide todo:
    VERCEL_ENV: process.env.VERCEL_ENV ?? "(no visible)",
    origin,
    baseUrlCalculado: selfFetchBaseUrl(origin),
    baseUrlSinOrigin: selfFetchBaseUrl(),
    // Contexto, sin revelar valores:
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "(no seteada)",
    VERCEL_URL: process.env.VERCEL_URL ?? "(no visible)",
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL ?? "(no visible)",
    tieneBypassSecret: !!process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    mandaHeaderBypass: !!selfFetchHeaders(),
  });
}
