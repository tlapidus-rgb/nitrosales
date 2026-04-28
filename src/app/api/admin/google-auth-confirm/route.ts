// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/google-auth-confirm?orgId=X&key=Y
// ══════════════════════════════════════════════════════════════
// Mismo patron que meta-auth-confirm pero para Google.
// Tomy click desde el email despues de agregar al cliente como
// test user en Google Cloud Console.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

const KEY = "nitrosales-secret-key-2024-production";

function successPage(message: string, clientEmail: string): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>NitroSales — Google Auth confirmado</title>
    <style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#fff;margin:0;padding:40px 20px;}
    .card{max-width:560px;margin:60px auto;background:#1a1a1a;border-radius:16px;padding:32px;border:1px solid #2a2a2a;}
    h1{color:#22c55e;margin-top:0;}
    a{display:inline-block;margin-top:20px;padding:10px 20px;background:#3b82f6;color:white;text-decoration:none;border-radius:8px;}
    </style></head><body>
    <div class="card">
      <h1>✓ Autorización Google confirmada</h1>
      <p>${message}</p>
      <p style="color:#999;font-size:13px;">Email enviado al cliente: ${clientEmail}</p>
      <a href="/control/onboardings">Volver al panel</a>
    </div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function errorPage(title: string, message: string): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>NitroSales — Error</title>
    <style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#fff;margin:0;padding:40px 20px;}
    .card{max-width:560px;margin:60px auto;background:#1a1a1a;border-radius:16px;padding:32px;border:1px solid #2a2a2a;}
    h1{color:#ef4444;margin-top:0;}
    </style></head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return errorPage("Forbidden", "No autorizado");
    if (!orgId) return errorPage("Falta orgId", "Pasá ?orgId=...");

    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "GOOGLE_ADS" as any },
    });

    if (!conn) {
      return errorPage("Connection no existe", `No hay Connection GOOGLE_ADS para org ${orgId}.`);
    }

    const creds = (conn.credentials as any) || {};
    const googleEmail = creds.googleEmail || "(sin email)";

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, users: { select: { email: true, name: true }, take: 1 } },
    });
    const clientEmail = org?.users?.[0]?.email || "";

    await prisma.connection.update({
      where: { id: conn.id },
      data: {
        credentials: {
          ...creds,
          authStatus: "APPROVED",
          authApprovedAt: new Date().toISOString(),
        },
      },
    });

    if (clientEmail) {
      await sendEmail({
        to: clientEmail,
        subject: "Listo, podés conectar Google Ads en NitroSales",
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1a1a1a; margin-top: 0;">Tu acceso a Google Ads está listo ✓</h2>
            <p>Ya te autorizamos como usuario de prueba de la app de NitroSales en Google Cloud.</p>
            <p>Volvé al wizard y click en "Conectar con Google" para autorizar los permisos de tu cuenta.</p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="https://app.nitrosales.ai/onboarding" style="display: inline-block; padding: 14px 28px; background: #4285F4; color: white; text-decoration: none; border-radius: 8px; font-weight: 700;">
                Ir al wizard
              </a>
            </div>
            <p style="color: #666; font-size: 12px;">
              Cuando hagas click "Conectar con Google", Google va a abrir su login oficial con tu cuenta ${googleEmail}.
            </p>
          </div>
        `,
        context: { orgId, kind: "google_auth_approved" },
      }).catch((err) => {
        console.warn("[google-auth-confirm] email cliente fallo:", err?.message);
      });
    }

    return successPage(
      `La org "${org?.name || orgId}" quedó marcada como autorizada para Google Ads. ${clientEmail ? "Email enviado al cliente." : "(No se encontró email de cliente.)"}`,
      clientEmail || "—",
    );
  } catch (err: any) {
    console.error("[google-auth-confirm] error:", err);
    return errorPage("Error inesperado", err.message || "Unknown");
  }
}
