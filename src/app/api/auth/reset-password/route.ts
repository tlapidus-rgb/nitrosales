export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { passwordFingerprint, verifyPasswordResetToken } from "@/lib/password-reset-token";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const newPassword = String(body?.newPassword || "").trim();

    if (!token) {
      return NextResponse.json({ error: "token requerido" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "La nueva contraseña debe tener al menos 8 caracteres" }, { status: 400 });
    }

    const payload = verifyPasswordResetToken(token);
    if (!payload) {
      return NextResponse.json({ error: "El link expiró o no es válido" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, hashedPassword: true },
    });
    if (!user || user.email.toLowerCase() !== payload.email.toLowerCase()) {
      return NextResponse.json({ error: "El link expiró o no es válido" }, { status: 400 });
    }
    if (passwordFingerprint(user.hashedPassword) !== payload.pwFingerprint) {
      return NextResponse.json({ error: "El link expiró o no es válido" }, { status: 400 });
    }

    const hashedPassword = await hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { hashedPassword },
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[auth/reset-password] error:", msg);
    return NextResponse.json({ error: msg || "Error interno" }, { status: 500 });
  }
}