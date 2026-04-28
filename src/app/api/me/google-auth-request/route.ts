// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/me/google-auth-request
// ══════════════════════════════════════════════════════════════
// Mismo patron que meta-auth-request pero para Google Ads.
// El cliente solicita ser autorizado como test user de la app
// OAuth de NitroSales en Google Cloud Console.
//
// Body: { googleEmail: "user@gmail.com" }
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tlapidus@99media.com.ar";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions as any);
    const orgId = (session as any)?.user?.organizationId;
    const userEmail = (session as any)?.user?.email;
    const userName = (session as any)?.user?.name || userEmail || "Cliente";

    if (!orgId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const googleEmail = String(body?.googleEmail || "").trim().toLowerCase();
    if (!googleEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(googleEmail)) {
      return NextResponse.json({ error: "Email Google inválido" }, { status: 400 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, slug: true },
    });

    const existing = await prisma.connection.findFirst({
      where: { organizationId: orgId, platform: "GOOGLE_ADS" as any },
    });

    const credentials = {
      ...((existing?.credentials as any) || {}),
      googleEmail,
      authStatus: "PENDING",
      authRequestedAt: new Date().toISOString(),
    };

    if (existing) {
      await prisma.connection.update({
        where: { id: existing.id },
        data: {
          credentials,
          status: existing.credentials?.refreshToken ? existing.status : ("PENDING" as any),
        },
      });
    } else {
      await prisma.connection.create({
        data: {
          organizationId: orgId,
          platform: "GOOGLE_ADS" as any,
          status: "PENDING" as any,
          credentials,
        },
      });
    }

    const adminConfirmUrl = `https://app.nitrosales.ai/api/admin/google-auth-confirm?orgId=${orgId}&key=nitrosales-secret-key-2024-production`;
    // Google Cloud Console: hay que ir a OAuth Consent Screen → Test Users.
    const gcloudTestUsersUrl = `https://console.cloud.google.com/apis/credentials/consent`;

    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[NitroSales] Solicitud Google Auth: ${org?.name || orgId}`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a1a; margin-top: 0;">Nueva solicitud de autorización Google Ads</h2>
          <div style="background: #f5f5f5; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
            <p style="margin: 0 0 8px;"><strong>Cliente:</strong> ${userName}</p>
            <p style="margin: 0 0 8px;"><strong>Org:</strong> ${org?.name || orgId} (${org?.slug || ""})</p>
            <p style="margin: 0 0 8px;"><strong>Email login:</strong> ${userEmail || "—"}</p>
            <p style="margin: 0; font-size: 16px;"><strong>📧 Email Google:</strong> <code style="background: #fff; padding: 4px 8px; border-radius: 4px;">${googleEmail}</code></p>
          </div>

          <h3 style="color: #1a1a1a;">Pasos:</h3>
          <ol style="line-height: 1.8;">
            <li>Andá a <a href="${gcloudTestUsersUrl}" style="color: #4285F4;">Google Cloud Console → OAuth Consent Screen</a></li>
            <li>Bajá hasta "Test users" → click "+ Add Users"</li>
            <li>Pegá el email <strong>${googleEmail}</strong> y enviá</li>
            <li>Volvé acá y hacé click en el botón:</li>
          </ol>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${adminConfirmUrl}" style="display: inline-block; padding: 14px 28px; background: #16a34a; color: white; text-decoration: none; border-radius: 8px; font-weight: 700;">
              ✓ Marcar como autorizado
            </a>
          </div>

          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            Cuando hagas click, el cliente recibe un email diciendo que ya puede conectar Google Ads.
          </p>
        </div>
      `,
      context: { orgId, kind: "google_auth_request" },
    }).catch((err) => {
      console.warn("[google-auth-request] email admin fallo:", err?.message);
    });

    return NextResponse.json({
      ok: true,
      message: "Solicitud enviada. Te vamos a avisar por email cuando estes autorizado.",
      googleEmail,
    });
  } catch (err: any) {
    console.error("[google-auth-request] error:", err);
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 });
  }
}
