// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/meta-auth-confirm?orgId=X&key=Y
// ══════════════════════════════════════════════════════════════
// Tomy hace click en este link desde el email de solicitud despues
// de agregar al cliente como tester en developers.facebook.com.
//
// Marca Connection.credentials.authStatus = "APPROVED" y manda email
// al cliente avisando que ya puede conectar.
//
// GET friendly-browser para que Tomy solo tenga que click sin curl.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

const KEY = "nitrosales-secret-key-2024-production";

function successPage(message: string, clientEmail: string): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>NitroSales — Autorización confirmada</title>
    <style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#fff;margin:0;padding:40px 20px;}
    .card{max-width:560px;margin:60px auto;background:#1a1a1a;border-radius:16px;padding:32px;border:1px solid #2a2a2a;}
    h1{color:#22c55e;margin-top:0;}
    a{display:inline-block;margin-top:20px;padding:10px 20px;background:#3b82f6;color:white;text-decoration:none;border-radius:8px;}
    </style></head><body>
    <div class="card">
      <h1>✓ Autorización confirmada</h1>
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
    </style></head><body>
    <div class="card">
      <h1>${title}</h1>
      <p>${message}</p>
    </div></body></html>`,
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
      where: { organizationId: orgId, platform: "META_ADS" as any },
    });

    if (!conn) {
      return errorPage("Connection no existe", `No hay Connection META_ADS para org ${orgId}.`);
    }

    const creds = (conn.credentials as any) || {};
    const fbEmail = creds.fbEmail || "(sin email)";

    // Buscar email del cliente para notificarle.
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, users: { select: { email: true, name: true }, take: 1 } },
    });
    const clientEmail = org?.users?.[0]?.email || "";

    // Marcar como aprobado.
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

    // Email al cliente
    if (clientEmail) {
      await sendEmail({
        to: clientEmail,
        subject: "Listo, podés conectar Meta Ads en NitroSales",
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1a1a1a; margin-top: 0;">Tu acceso a Meta está listo ✓</h2>
            <p>Ya te autorizamos como tester de la app de NitroSales.</p>
            <p>Tenés 2 cosas que hacer ahora:</p>
            <ol style="line-height: 1.8;">
              <li><strong>Aceptar la invitación de Meta:</strong> revisá tu Facebook (campanita de notificaciones) o tu mail. Te llegó algo tipo "Tomás Lapidus te invitó a probar la app NitroSales". Click "Aceptar".</li>
              <li><strong>Conectar Meta en NitroSales:</strong> volvé a la app, andá al wizard de onboarding y click "Conectar con Meta".</li>
            </ol>
            <div style="text-align: center; margin: 28px 0;">
              <a href="https://app.nitrosales.ai/onboarding" style="display: inline-block; padding: 14px 28px; background: #1877F2; color: white; text-decoration: none; border-radius: 8px; font-weight: 700;">
                Ir al wizard
              </a>
            </div>
            <p style="color: #666; font-size: 12px;">
              Si no encontrás la invitación de Meta, fijate en facebook.com → notificaciones (campanita arriba).
              También puede haberte llegado al mail asociado a Facebook (${fbEmail}).
            </p>
          </div>
        `,
        context: { orgId, kind: "meta_auth_approved" },
      }).catch((err) => {
        console.warn("[meta-auth-confirm] email cliente fallo:", err?.message);
      });
    }

    return successPage(
      `La org "${org?.name || orgId}" quedó marcada como autorizada para Meta. ${clientEmail ? "Email enviado al cliente." : "(No se encontró email de cliente para notificar.)"}`,
      clientEmail || "—",
    );
  } catch (err: any) {
    console.error("[meta-auth-confirm] error:", err);
    return errorPage("Error inesperado", err.message || "Unknown");
  }
}
