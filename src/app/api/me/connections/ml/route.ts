// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/me/connections/ml
// ══════════════════════════════════════════════════════════════
// Devuelve el estado de la conexión ML para el user logueado.
// Usado por el wizard de onboarding para mostrar "Conectado" después
// del OAuth sin reload completo.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { tryGetOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const orgId = await tryGetOrganizationId();
    if (!orgId) return NextResponse.json({ ok: false, connected: false });

    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "MERCADOLIBRE" as any },
      select: { credentials: true, status: true },
    });

    if (!conn) return NextResponse.json({ ok: true, connected: false });

    const creds = conn.credentials as any;
    const connected = !!(creds?.accessToken && creds?.mlUserId);

    return NextResponse.json({
      ok: true,
      connected,
      mlUserId: connected ? creds.mlUserId : null,
      status: conn.status,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
