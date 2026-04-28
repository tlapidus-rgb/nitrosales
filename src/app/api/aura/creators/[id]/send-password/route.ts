export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Enviar contraseña del dashboard al creador por email
// ══════════════════════════════════════════════════════════════
// POST /api/aura/creators/:id/send-password
// body: { regenerate?: boolean }   // si true, genera password nueva
//
// Flujo:
//   1. Busca al creador
//   2. Si no tiene password (o regenerate=true), genera una nueva de 6 chars
//   3. Guarda hash + plain
//   4. Envía mail con las credenciales al email del creador
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { createHash, randomBytes } from "crypto";
import { sendEmail } from "@/lib/email/send";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function generatePassword(): string {
  return randomBytes(4).toString("base64url").substring(0, 6).toLowerCase();
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);
    const body = await req.json().catch(() => ({}));
    const regenerate = Boolean(body.regenerate);

    const influencer = await prisma.influencer.findFirst({
      where: { id: params.id, organizationId: org.id },
    });

    if (!influencer) {
      return NextResponse.json({ error: "Creador no encontrado" }, { status: 404 });
    }

    if (!influencer.email) {
      return NextResponse.json(
        { error: "El creador no tiene email configurado" },
        { status: 400 }
      );
    }

    // Decidir si usar la password existente o generar una nueva
    let plainPassword = influencer.dashboardPasswordPlain;
    let didRegenerate = false;

    if (!plainPassword || regenerate) {
      plainPassword = generatePassword();
      didRegenerate = true;
      await prisma.influencer.update({
        where: { id: influencer.id },
        data: {
          dashboardPassword: hashPassword(plainPassword),
          dashboardPasswordPlain: plainPassword,
        },
      });
    }

    // Construir link del dashboard (NitroSales app URL, NO la tienda del cliente)
    // Multi-tenant: no usar STORE_URL ni hardcodear slug de MdJ
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      "https://app.nitrosales.ai";
    const dashboardLink = `${baseUrl}/i/${org.slug}/${influencer.code}`;

    const subject = didRegenerate
      ? `Tu nueva contraseña para ${org.name}`
      : `Tu acceso al dashboard de ${org.name}`;

    const html = buildPasswordEmail({
      creatorName: influencer.name,
      orgName: org.name,
      dashboardLink,
      password: plainPassword,
      regenerated: didRegenerate,
    });

    const result = await sendEmail({
      to: influencer.email,
      subject,
      html,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "No se pudo enviar el email" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      regenerated: didRegenerate,
      email: influencer.email,
    });
  } catch (error: any) {
    console.error("[aura/creators/send-password]", error);
    return NextResponse.json(
      { error: error?.message || "Internal error" },
      { status: 500 }
    );
  }
}

function buildPasswordEmail(opts: {
  creatorName: string;
  orgName: string;
  dashboardLink: string;
  password: string;
  regenerated: boolean;
}): string {
  const { creatorName, orgName, dashboardLink, password, regenerated } = opts;
  const title = regenerated
    ? "Tu contraseña fue renovada"
    : "Tus credenciales de acceso";
  const intro = regenerated
    ? `Generamos una nueva contraseña para que puedas volver a entrar a tu dashboard.`
    : `Te reenviamos tus credenciales para que puedas entrar a tu dashboard cuando quieras.`;

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#0a0714;color:#fff;">
    <div style="background:linear-gradient(135deg,#ff0080 0%,#a855f7 50%,#00d4ff 100%);padding:1px;border-radius:16px;">
      <div style="background:#0a0714;border-radius:15px;padding:32px;">
        <h1 style="margin:0 0 8px;font-size:24px;background:linear-gradient(135deg,#ff0080,#a855f7,#00d4ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${title}</h1>
        <p style="margin:0 0 24px;color:rgba(255,255,255,0.7);font-size:14px;">Hola ${creatorName} 👋</p>
        <p style="margin:0 0 24px;color:rgba(255,255,255,0.85);font-size:15px;line-height:1.6;">${intro}</p>

        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin:0 0 24px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.5);margin-bottom:8px;">Tu contraseña</div>
          <div style="font-family:'SF Mono',Menlo,monospace;font-size:22px;font-weight:600;letter-spacing:0.1em;color:#fff;">${password}</div>
        </div>

        <a href="${dashboardLink}" style="display:inline-block;background:linear-gradient(135deg,#ff0080,#a855f7,#00d4ff);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;">Entrar al dashboard →</a>

        <p style="margin:32px 0 0;color:rgba(255,255,255,0.4);font-size:12px;line-height:1.6;">
          Si no solicitaste este email, podés ignorarlo. Tu acceso es privado y solo vos tenés la contraseña.
        </p>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.3);font-size:11px;">${orgName} · powered by NitroSales</p>
      </div>
    </div>
  </div>`;
}
