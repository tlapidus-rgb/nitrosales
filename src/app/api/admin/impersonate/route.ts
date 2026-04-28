// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/impersonate
// ══════════════════════════════════════════════════════════════
// Genera un magic link de 60s para que Tomy entre como otro user.
// Body: { targetUserId } o { orgId } (busca primer OWNER de la org).
//
// Returns: { ok: true, url: "/api/auth/impersonate?token=..." }
// Tomy abre esa URL en una pestaña nueva. La pestaña hace signIn con
// el provider "impersonate" (auth.ts) → sesión nueva como target user
// con flag `impersonatedBy: tomyUserId`.
//
// Audit log: se registra en LoginEvent con failureReason="impersonate
// by [tomyEmail]".
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createHmac } from "crypto";

export const dynamic = "force-dynamic";

function signImpersonateToken(payload: any): string {
  const secret = process.env.NEXTAUTH_SECRET || "fallback-secret";
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac = createHmac("sha256", secret);
  hmac.update(data);
  const sig = hmac.digest("base64url").slice(0, 32);
  return `${data}.${sig}`;
}

export async function POST(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const session = await getServerSession(authOptions as any);
    const impersonatorUserId = (session as any)?.user?.id;
    const impersonatorEmail = (session as any)?.user?.email;
    if (!impersonatorUserId) {
      return NextResponse.json({ error: "No hay sesion admin" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    let targetUserId: string | null = body?.targetUserId || null;
    const orgId: string | null = body?.orgId || null;

    if (!targetUserId && orgId) {
      // Buscar primer OWNER de esa org.
      const owner = await prisma.user.findFirst({
        where: { organizationId: orgId, role: "OWNER" as any },
        select: { id: true },
      });
      if (!owner) {
        return NextResponse.json({ error: `No hay OWNER en org ${orgId}` }, { status: 404 });
      }
      targetUserId = owner.id;
    }

    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId u orgId requerido" }, { status: 400 });
    }

    // Validar que existe
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, name: true, organizationId: true },
    });
    if (!targetUser) {
      return NextResponse.json({ error: "User target no existe" }, { status: 404 });
    }

    // Anti-loop: no impersonar al mismo usuario admin
    if (targetUserId === impersonatorUserId) {
      return NextResponse.json({ error: "No tiene sentido impersonar tu propia cuenta" }, { status: 400 });
    }

    const expiresAt = Date.now() + 60_000; // 60s
    const token = signImpersonateToken({
      targetUserId,
      impersonatorUserId,
      impersonatorEmail,
      exp: expiresAt,
    });

    // Audit log
    try {
      await prisma.loginEvent.create({
        data: {
          userId: targetUserId,
          email: targetUser.email,
          success: true,
          failureReason: `Impersonated by ${impersonatorEmail}`,
        },
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      url: `/auth/impersonate?token=${encodeURIComponent(token)}`,
      target: { id: targetUser.id, email: targetUser.email, name: targetUser.name },
      expiresInSec: 60,
    });
  } catch (err: any) {
    console.error("[impersonate] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
