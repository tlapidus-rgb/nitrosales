export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { passwordFingerprint, signPasswordResetToken } from "@/lib/password-reset-token";
import { sendEmail } from "@/lib/email/send";
import { normalizeEmailLocale, passwordResetEmail } from "@/lib/email/templates";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const locale = normalizeEmailLocale(body?.locale || req.headers.get("accept-language"));
    if (!email) {
      return NextResponse.json({ error: "email requerido" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, hashedPassword: true },
    });

    if (user) {
      const token = signPasswordResetToken({
        userId: user.id,
        email: user.email,
        pwFingerprint: passwordFingerprint(user.hashedPassword),
      });
      const resetLink = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}&locale=${locale}`;
      const displayName = user.name?.trim() || user.email.split("@")[0] || "hola";
      const { subject, html } = passwordResetEmail(displayName, resetLink, locale);
      const result = await sendEmail({
        to: user.email,
        subject,
        html,
        context: "auth.password-reset",
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error || "No se pudo enviar el email" }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Si el email existe, vas a recibir un link para cambiar la contraseña.",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[auth/forgot-password] error:", msg);
    return NextResponse.json({ error: msg || "Error interno" }, { status: 500 });
  }
}