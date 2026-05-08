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
// 30 dias — antes era 8h. Tomy reporto que despues de F5 / refresh la
// seleccion de org se perdia y volvia a EMDJ. Causa: la cookie expiraba.
// Con 30d la seleccion persiste hasta que el admin la cambie o haga DELETE.
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 dias

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

    // S60 EXT-2 BIS++++++++++: tambien devolver realOrg (la del user actual,
    // sin override). El frontend lo necesita para mostrar el orgId correcto
    // como "current" cuando NO hay cookie y para el "Volver a mi cuenta".
    const { getServerSession } = await import("next-auth");
    const { authOptions } = await import("@/lib/auth");
    const session = await getServerSession(authOptions as any);
    const sessionUser = (session as any)?.user;
    // Si la sesion esta overrideada por la cookie, realOrganizationId tiene la real;
    // si no, organizationId es la real.
    const realOrgId = sessionUser?.realOrganizationId || sessionUser?.organizationId || null;
    const realOrgName = sessionUser?.realOrganizationName || sessionUser?.organizationName || null;

    const c = await cookies();
    const orgId = c.get(COOKIE_NAME)?.value || null;

    let viewingAs: { id: string; name: string } | null = null;
    if (orgId) {
      viewingAs = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true, name: true },
      });
    }

    return NextResponse.json({
      ok: true,
      viewingAs,
      realOrg: realOrgId ? { id: realOrgId, name: realOrgName } : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
