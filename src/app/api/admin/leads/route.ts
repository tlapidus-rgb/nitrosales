// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/leads — crear lead manual
// GET  /api/admin/leads — listar
// ══════════════════════════════════════════════════════════════
// POST acepta body:
//   - companyName: string (opcional, default "Sin nombre")
//   - contactEmail: string (recomendado para auto-send)
//   - contactName, contactPhone, industry, etc (opcionales)
//   - sendInvite: boolean — si true Y hay email, manda automaticamente
//     el email con el link al form /onboarding y marca como CONTACTADO
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { sendEmail } from "@/lib/email/send";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app";
const ONBOARDING_URL = `${APP_URL}/onboarding`;

function buildInviteEmailHtml(contactName: string | null, companyName: string): string {
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

export async function POST(req: Request) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const contactEmail = (body?.contactEmail || "").trim().toLowerCase();
    const contactName = (body?.contactName || "").trim() || null;
    const companyName = (body?.companyName || "").trim() || (contactEmail ? contactEmail.split("@")[0] : "Sin nombre");
    const sendInvite = !!body?.sendInvite;

    // Si se pidio sendInvite, validar email
    if (sendInvite && !contactEmail) {
      return NextResponse.json({ error: "Email requerido para enviar invitación" }, { status: 400 });
    }

    // Email format basico
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    const id = randomUUID();
    const status = sendInvite ? "CONTACTADO" : "LEAD";
    const lastContactedAt = sendInvite ? new Date() : null;
    const lastEmailSentAt = sendInvite ? new Date() : null;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "leads"
       ("id", "companyName", "contactName", "contactEmail", "contactPhone",
        "industry", "estimatedMonthlyOrders", "source", "notes", "status",
        "lastContactedAt", "lastEmailSentAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
      id,
      companyName,
      contactName,
      contactEmail || null,
      (body?.contactPhone || "").trim() || null,
      (body?.industry || "").trim() || null,
      body?.estimatedMonthlyOrders ? Number(body.estimatedMonthlyOrders) : null,
      (body?.source || "").trim() || null,
      (body?.notes || "").trim() || null,
      status,
      lastContactedAt,
      lastEmailSentAt
    );

    // Enviar email si se pidio
    let emailResult: any = null;
    if (sendInvite && contactEmail) {
      try {
        const r = await sendEmail({
          to: contactEmail,
          subject: "Te dejo el acceso a NitroSales 🚀",
          html: buildInviteEmailHtml(contactName, companyName),
        });
        emailResult = { ok: r.ok, error: r.error };
      } catch (err: any) {
        emailResult = { ok: false, error: err?.message };
      }
    }

    return NextResponse.json({ ok: true, id, status, emailResult });
  } catch (error: any) {
    console.error("[admin/leads POST] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "leads" ORDER BY "createdAt" DESC`
    );
    return NextResponse.json({ ok: true, leads: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
