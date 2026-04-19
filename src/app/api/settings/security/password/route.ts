// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/settings/security/password — Fase 7 QA
// ═══════════════════════════════════════════════════════════════════
// POST: cambiar password del user actual. Requiere currentPassword.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const currentPassword = body?.currentPassword;
    const newPassword = body?.newPassword;

    if (!currentPassword || typeof currentPassword !== "string") {
      return NextResponse.json(
        { error: "Password actual requerido" },
        { status: 400 }
      );
    }
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json(
        { error: "Password nuevo debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "El password nuevo debe ser distinto al actual" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, hashedPassword: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const valid = await bcrypt.compare(currentPassword, user.hashedPassword);
    if (!valid) {
      // Registrar intento fallido
      await prisma.loginEvent.create({
        data: {
          userId: user.id,
          email,
          success: false,
          failureReason: "Password actual invalido (en cambio de password)",
          ip: req.headers.get("x-forwarded-for") ?? null,
          userAgent: req.headers.get("user-agent") ?? null,
        },
      });
      return NextResponse.json(
        { error: "El password actual no coincide" },
        { status: 403 }
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { hashedPassword: hashed },
    });

    // Registrar cambio exitoso
    await prisma.loginEvent.create({
      data: {
        userId: user.id,
        email,
        success: true,
        failureReason: "Password cambiado",
        ip: req.headers.get("x-forwarded-for") ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
      },
    });

    return NextResponse.json({ ok: true, message: "Password actualizado" });
  } catch (error: any) {
    console.error("[security/password POST] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
