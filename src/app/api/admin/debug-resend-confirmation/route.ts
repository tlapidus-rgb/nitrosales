// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/debug-resend-confirmation
// ══════════════════════════════════════════════════════════════
// Reenvía el email de confirmación de postulación para un onboarding
// request específico. Devuelve el resultado completo de Resend.
// Body: { onboardingRequestId: "..." }
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { sendEmail } from "@/lib/email/send";
import { onboardingConfirmationEmail } from "@/lib/onboarding/emails";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const id = String(body.onboardingRequestId || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Pasá 'onboardingRequestId' en el body" }, { status: 400 });
    }

    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "id", "companyName", "contactName", "contactEmail", "token" FROM "onboarding_requests" WHERE "id" = $1 LIMIT 1`,
      id
    );
    const ob = rows[0];
    if (!ob) {
      return NextResponse.json({ error: "Onboarding request no encontrado" }, { status: 404 });
    }

    const { subject, html } = onboardingConfirmationEmail({
      contactName: ob.contactName,
      companyName: ob.companyName,
      statusToken: ob.token,
    });

    const result = await sendEmail({ to: ob.contactEmail, subject, html });

    return NextResponse.json({
      ok: result.ok,
      resendResult: result,
      sentTo: ob.contactEmail,
      companyName: ob.companyName,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
