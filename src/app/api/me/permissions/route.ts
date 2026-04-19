// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/me/permissions — Fase 7 QA enforcement
// ═══════════════════════════════════════════════════════════════════
// GET: devuelve permisos efectivos del user logueado. El cliente lo
// usa para hide/show de tabs en la sidebar + permissionGate en UI.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getCurrentUserPermissions } from "@/lib/permission-guard";
import { SECTIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getCurrentUserPermissions();
    return NextResponse.json({
      ...result,
      sections: SECTIONS,
    });
  } catch (error: any) {
    console.error("[me/permissions GET] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
