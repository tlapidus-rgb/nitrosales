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
import { leadInviteEmail, leadFollowupEmail } from "@/lib/onboarding/emails";

export const dynamic = "force-dynamic";

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

    const tpl = variant === "followup"
      ? leadFollowupEmail({ contactName: lead.contactName, companyName: lead.companyName })
      : leadInviteEmail({ contactName: lead.contactName, companyName: lead.companyName });

    const r = await sendEmail({
      to: lead.contactEmail,
      subject: tpl.subject,
      html: tpl.html,
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
