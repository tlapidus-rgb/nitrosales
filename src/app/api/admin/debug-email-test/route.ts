// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/debug-email-test
// ══════════════════════════════════════════════════════════════
// Endpoint de diagnostico: manda un email de prueba a la direccion
// indicada y devuelve el response completo de Resend (OK + id, o error).
// Util para debuggear por que emails no llegan.
// Solo isInternalUser.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { isInternalUser } from "@/lib/feature-flags";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const to = String(body.to || "").trim();
    if (!to) {
      return NextResponse.json({ error: "Pasá 'to' en el body" }, { status: 400 });
    }

    const result = await sendEmail({
      to,
      subject: "Test NitroSales — " + new Date().toISOString(),
      html: `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px;">
<h1>Test de email</h1>
<p>Si ves este email, Resend está funcionando bien.</p>
<p>Enviado a: <strong>${to}</strong></p>
<p>Timestamp: ${new Date().toISOString()}</p>
</body></html>`,
    });

    const env = {
      hasResendApiKey: !!process.env.RESEND_API_KEY,
      resendApiKeyPrefix: process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.slice(0, 8) + "..." : null,
      resendFrom: process.env.RESEND_FROM || "NitroSales <alertas@nitrosales.com> (default)",
      nextAuthUrl: process.env.NEXTAUTH_URL || null,
    };

    return NextResponse.json({
      ok: result.ok,
      resendResult: result,
      to,
      env,
      hint: result.ok
        ? "Email aceptado por Resend. Si no llega → revisar spam, o el FROM domain no tiene SPF/DKIM verificado."
        : "Resend rechazó el email. Ver error para detalles (comun: FROM no verificado, cuenta en trial que solo permite tu email registrado, API key invalida).",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
