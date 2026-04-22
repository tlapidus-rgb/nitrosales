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
import { leadInviteEmail } from "@/lib/onboarding/emails";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

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
        const { subject, html } = leadInviteEmail({ contactName, companyName });
        const r = await sendEmail({ to: contactEmail, subject, html });
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
