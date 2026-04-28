// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/me/meta-auth-request
// ══════════════════════════════════════════════════════════════
// El cliente solicita ser autorizado como tester de la app Meta de
// NitroSales. Pasa su email de Facebook (no el del trabajo).
//
// Flow:
//  1. Cliente ingresa email FB en el wizard.
//  2. Este endpoint crea/actualiza Connection META_ADS con:
//     - credentials.fbEmail
//     - credentials.authStatus = "PENDING"
//     - status = "PENDING"
//  3. Manda email a admin (Tomy) con datos + link al panel.
//  4. Cliente ve "Solicitud enviada, te avisamos por email".
//
// Body: { fbEmail: "user@gmail.com" }
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tlapidus@99media.com.ar";
const META_APP_ID = process.env.META_APP_ID || "";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions as any);
    const orgId = (session as any)?.user?.organizationId;
    const userEmail = (session as any)?.user?.email;
    const userName = (session as any)?.user?.name || userEmail || "Cliente";

    if (!orgId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const fbEmail = String(body?.fbEmail || "").trim().toLowerCase();
    if (!fbEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fbEmail)) {
      return NextResponse.json({ error: "Email FB invalido" }, { status: 400 });
    }

    // Org info para el email
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, slug: true },
    });

    // Upsert Connection META_ADS con estado PENDING.
    const existing = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "META_ADS" as any },
    });

    const credentials = {
      ...((existing?.credentials as any) || {}),
      fbEmail,
      authStatus: "PENDING",
      authRequestedAt: new Date().toISOString(),
    };

    if (existing) {
      await prisma.connection.update({
        where: { id: existing.id },
        data: {
          credentials,
          status: existing.credentials?.accessToken ? existing.status : ("PENDING" as any),
        },
      });
    } else {
      await prisma.connection.create({
        data: {
          organizationId: orgId,
          platform: "META_ADS" as any,
          status: "PENDING" as any,
          credentials,
        },
      });
    }

    // Email a admin con datos + link directo a Meta + endpoint de confirmacion
    const adminConfirmUrl = `https://app.nitrosales.ai/api/admin/meta-auth-confirm?orgId=${orgId}&key=nitrosales-secret-key-2024-production`;
    const metaTestersUrl = `https://developers.facebook.com/apps/${META_APP_ID}/roles/roles/`;

    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[NitroSales] Solicitud Meta Auth: ${org?.name || orgId}`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a1a; margin-top: 0;">Nueva solicitud de autorización Meta</h2>
          <div style="background: #f5f5f5; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
            <p style="margin: 0 0 8px;"><strong>Cliente:</strong> ${userName}</p>
            <p style="margin: 0 0 8px;"><strong>Org:</strong> ${org?.name || orgId} (${org?.slug || ""})</p>
            <p style="margin: 0 0 8px;"><strong>Email login:</strong> ${userEmail || "—"}</p>
            <p style="margin: 0; font-size: 16px;"><strong>📘 Email Facebook:</strong> <code style="background: #fff; padding: 4px 8px; border-radius: 4px;">${fbEmail}</code></p>
          </div>

          <h3 style="color: #1a1a1a;">Pasos:</h3>
          <ol style="line-height: 1.8;">
            <li>Andá a <a href="${metaTestersUrl}" style="color: #1877F2;">developers.facebook.com → Roles</a></li>
            <li>Click "Testers" → "Agregar testers"</li>
            <li>Pegá el email <strong>${fbEmail}</strong> y enviá</li>
            <li>Volvé acá y hacé click en el botón:</li>
          </ol>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${adminConfirmUrl}" style="display: inline-block; padding: 14px 28px; background: #16a34a; color: white; text-decoration: none; border-radius: 8px; font-weight: 700;">
              ✓ Marcar como autorizado
            </a>
          </div>

          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            Cuando hagas click, el cliente recibe un email diciendo que ya puede conectar Meta.
            La invitación de Meta puede tardar unos minutos en llegarle al cliente.
          </p>
        </div>
      `,
      context: { orgId, kind: "meta_auth_request" },
    }).catch((err) => {
      console.warn("[meta-auth-request] email admin fallo:", err?.message);
    });

    return NextResponse.json({
      ok: true,
      message: "Solicitud enviada. Te vamos a avisar por email cuando estes autorizado.",
      fbEmail,
    });
  } catch (err: any) {
    console.error("[meta-auth-request] error:", err);
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 });
  }
}
