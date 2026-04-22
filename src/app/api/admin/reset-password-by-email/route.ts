// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/reset-password-by-email
// ══════════════════════════════════════════════════════════════
// Atajo para resetear password por email cuando no tenes el userId
// a mano. Util para resetear users de prueba rapido. Internamente
// usa la misma logica que /api/admin/users/[userId]/reset-password.
//
// Body: { email: "user@dominio.com" }
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[buf[i] % chars.length];
  return out;
}

export async function POST(req: Request) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const email = (body?.email || "").toString().trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "email requerido" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, organizationId: true },
    });
    if (!user) {
      return NextResponse.json({ error: `No existe user con email ${email}` }, { status: 404 });
    }

    const newPassword = generateTempPassword();
    const hashed = await hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { hashedPassword: hashed },
    });

    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, organizationId: user.organizationId },
      newPassword,
    });
  } catch (error: any) {
    console.error("[admin/reset-password-by-email] error:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
