// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// /api/admin/view-as-org
// ══════════════════════════════════════════════════════════════
// "View as Org" para internal users (Tomy, etc).
//   POST { orgId } → setea cookie "nitro-view-org" con el orgId.
//   DELETE → borra la cookie.
//
// El session callback en auth.ts lee esa cookie y, si el user es
// internal, OVERRIDE el organizationId/organizationName del JWT.
// Asi vos seguis siendo Tomy (audit trail correcto) pero ves la
// data de la org elegida.
//
// Solo afecta lectura de data (los queries usan session.organizationId).
// La identidad (user.id, user.email) NO cambia.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { isInternalUser } from "@/lib/feature-flags";
import { prisma } from "@/lib/db/client";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "nitro-view-org";
const COOKIE_MAX_AGE = 8 * 60 * 60; // 8 horas

export async function POST(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const orgId = body?.orgId;
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    // Validar que la org existe
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });
    if (!org) return NextResponse.json({ error: "Org no existe" }, { status: 404 });

    const c = await cookies();
    c.set(COOKIE_NAME, orgId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });

    return NextResponse.json({ ok: true, org });
  } catch (err: any) {
    console.error("[view-as-org POST] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const c = await cookies();
    c.delete(COOKIE_NAME);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[view-as-org DELETE] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const c = await cookies();
    const orgId = c.get(COOKIE_NAME)?.value || null;
    if (!orgId) return NextResponse.json({ ok: true, viewingAs: null });

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });
    return NextResponse.json({ ok: true, viewingAs: org });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
