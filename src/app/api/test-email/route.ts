// ══════════════════════════════════════════════════════════════
// Test Email: Verify Resend configuration works
// ══════════════════════════════════════════════════════════════
// GET /api/test-email?key=<NEXTAUTH_SECRET>&to=email@example.com
// Sends a test email to verify Resend is properly configured.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const to = req.nextUrl.searchParams.get("to");
  if (!to) {
    return NextResponse.json({ error: "Falta parámetro 'to' (email destino)" }, { status: 400 });
  }

  // Check if RESEND_API_KEY is configured
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({
      ok: false,
      error: "RESEND_API_KEY no está configurado en las variables de entorno",
      instructions: [
        "1. Ir a https://resend.com/signup y crear cuenta gratuita",
        "2. En Resend dashboard → API Keys → Create API Key",
        "3. En Vercel → Settings → Environment Variables → Agregar RESEND_API_KEY",
        "4. Redeploy la app",
        "5. Llamar este endpoint de nuevo",
      ],
    });
  }

  const result = await sendEmail({
    to,
    subject: "🟢 NitroSales — Test de Email OK",
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #10b981;">✅ Email configurado correctamente</h2>
        <p>Si estás leyendo esto, Resend está funcionando bien con NitroSales.</p>
        <p>Las alertas diarias y el digest semanal se enviarán automáticamente.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="color: #6b7280; font-size: 12px;">
          NitroSales — ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
        </p>
      </div>
    `,
  });

  return NextResponse.json({
    ok: result.ok,
    ...(result.id ? { emailId: result.id } : {}),
    ...(result.error ? { error: result.error } : {}),
    sentTo: to,
  });
}
