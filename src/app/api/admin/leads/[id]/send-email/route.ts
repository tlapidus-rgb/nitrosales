// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/leads/[id]/send-email
// ══════════════════════════════════════════════════════════════
// Envia (o reenvia) el email de invitacion al lead con el link al
// form /onboarding. Marca lastEmailSentAt + lastContactedAt + status=CONTACTADO.
//
// Body opcional:
//   - variant: "invite" (default) | "followup" — cual template usar
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";
const ONBOARDING_URL = `${APP_URL}/onboarding`;

function buildInviteHtml(contactName: string | null): string {
  const greeting = contactName ? `Hola ${contactName}` : "Hola";
  return `<!DOCTYPE html><html><body style="background:#0A0A0F;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:40px 20px;margin:0;">
<div style="max-width:520px;margin:0 auto;background:#141419;border-radius:16px;padding:36px 32px;border:1px solid #1F1F2E;">
  <div style="font-size:11px;color:#FF5E1A;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:10px;">NitroSales</div>
  <h1 style="margin:0 0 14px;font-size:22px;color:#fff;letter-spacing:-0.01em;line-height:1.3;">${greeting}, te dejo el acceso a NitroSales</h1>
  <p style="color:#A1A1AA;font-size:14px;line-height:1.65;margin:0 0 20px;">
    Hacé click en el botón y completás un form rápido (2 minutos). Después yo apruebo la cuenta y te llega un segundo email para que conectes tus plataformas (VTEX, MercadoLibre, Meta Ads, Google Ads). Todo el proceso toma menos de 10 minutos.
  </p>
  <div style="margin:24px 0;">
    <a href="${ONBOARDING_URL}" style="display:inline-block;background:linear-gradient(135deg,#FF5E1A,#FF8C4A);color:#fff;padding:14px 28px;border-radius:9px;text-decoration:none;font-weight:600;font-size:14px;box-shadow:0 4px 16px rgba(255,94,26,0.3);">Empezar onboarding →</a>
  </div>
  <p style="color:#71717A;font-size:12px;line-height:1.6;margin:24px 0 0;border-top:1px solid #1F1F2E;padding-top:18px;">
    Si tenés alguna duda, respondé este email y te contesto.<br/>
    Tomy · NitroSales
  </p>
</div>
</body></html>`;
}

function buildFollowupHtml(contactName: string | null): string {
  const greeting = contactName ? `Hola ${contactName}` : "Hola";
  return `<!DOCTYPE html><html><body style="background:#0A0A0F;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:40px 20px;margin:0;">
<div style="max-width:520px;margin:0 auto;background:#141419;border-radius:16px;padding:36px 32px;border:1px solid #1F1F2E;">
  <div style="font-size:11px;color:#A855F7;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:10px;">NitroSales · Recordatorio</div>
  <h1 style="margin:0 0 14px;font-size:22px;color:#fff;letter-spacing:-0.01em;line-height:1.3;">${greeting}, ¿pudiste ver el link?</h1>
  <p style="color:#A1A1AA;font-size:14px;line-height:1.65;margin:0 0 20px;">
    Te dejo nuevamente el acceso por si se te perdió en el email anterior. Es un form rápido para que arranquemos:
  </p>
  <div style="margin:24px 0;">
    <a href="${ONBOARDING_URL}" style="display:inline-block;background:linear-gradient(135deg,#FF5E1A,#FF8C4A);color:#fff;padding:14px 28px;border-radius:9px;text-decoration:none;font-weight:600;font-size:14px;box-shadow:0 4px 16px rgba(255,94,26,0.3);">Empezar onboarding →</a>
  </div>
  <p style="color:#71717A;font-size:12px;line-height:1.6;margin:24px 0 0;border-top:1px solid #1F1F2E;padding-top:18px;">
    Si hay algo que no te quedó claro o querés que charlemos antes, respondé este email.<br/>
    Tomy · NitroSales
  </p>
</div>
</body></html>`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const variant = body?.variant === "followup" ? "followup" : "invite";

    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "leads" WHERE "id" = $1 LIMIT 1`,
      id
    );
    const lead = rows[0];
    if (!lead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
    }
    if (!lead.contactEmail) {
      return NextResponse.json({ error: "El lead no tiene email cargado" }, { status: 400 });
    }

    const html = variant === "followup"
      ? buildFollowupHtml(lead.contactName)
      : buildInviteHtml(lead.contactName);

    const subject = variant === "followup"
      ? `Recordatorio: te espera tu acceso a NitroSales`
      : `Te dejo el acceso a NitroSales 🚀`;

    const r = await sendEmail({
      to: lead.contactEmail,
      subject,
      html,
    });

    if (!r.ok) {
      return NextResponse.json({ error: r.error || "Email failed" }, { status: 500 });
    }

    // Marcar tracking
    await prisma.$executeRawUnsafe(
      `UPDATE "leads"
       SET "status" = 'CONTACTADO',
           "lastEmailSentAt" = NOW(),
           "lastContactedAt" = NOW(),
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      id
    );

    return NextResponse.json({ ok: true, variant, sentTo: lead.contactEmail });
  } catch (error: any) {
    console.error("[admin/leads/send-email] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
