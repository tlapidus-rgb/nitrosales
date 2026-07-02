export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { passwordFingerprint, signPasswordResetToken } from "@/lib/password-reset-token";
import { sendEmail } from "@/lib/email/send";
import { normalizeEmailLocale, passwordResetEmail } from "@/lib/email/templates";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";
}

// Rate limit best-effort (in-memory, por instancia): evita bombardear de mails a
// una víctima y quemar quota de Resend. NOTA: en serverless es per-instancia →
// migrar a store compartido (Redis/Upstash). Ver BP-DASH-SEC.
const rlHits = new Map<string, { count: number; resetAt: number }>();
const RL_WINDOW_MS = 15 * 60 * 1000;
function rateLimited(key: string, max: number): boolean {
  const now = Date.now();
  const rec = rlHits.get(key);
  if (!rec || now > rec.resetAt) {
    rlHits.set(key, { count: 1, resetAt: now + RL_WINDOW_MS });
    return false;
  }
  rec.count++;
  return rec.count > max;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const locale = normalizeEmailLocale(body?.locale || req.headers.get("accept-language"));
    if (!email) {
      return NextResponse.json({ error: "email requerido" }, { status: 400 });
    }

    // Respuesta SIEMPRE genérica: no revelar si el email existe (anti-enumeración).
    const generic = () =>
      NextResponse.json({
        ok: true,
        message: "Si el email existe, vas a recibir un link para cambiar la contraseña.",
      });

    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    if (rateLimited(`ip:${ip}`, 10) || rateLimited(`email:${email}`, 5)) {
      return generic();
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
        // No filtrar existencia por un fallo de envío: log server-side, respuesta genérica.
        console.error("[auth/forgot-password] envío falló:", result.error);
      }
    }

    return generic();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[auth/forgot-password] error:", msg);
    return NextResponse.json({ error: msg || "Error interno" }, { status: 500 });
  }
}