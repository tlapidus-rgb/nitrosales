// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/debug-email-flow
// ══════════════════════════════════════════════════════════════
// Diagnostica el flujo de email del onboarding SIN modificar nada.
// - Busca el ultimo onboarding_request creado
// - Intenta renderizar el email de confirmacion (con *Active async)
// - Intenta enviar a Resend y captura respuesta detallada
// - Devuelve un reporte granular de dónde falla
//
// Uso: POST /api/admin/debug-email-flow
//   - Sin body → diagnostica el último onboarding
//   - Body { onboardingRequestId } → diagnostica uno específico
//   - Body { dryRun: true } → solo renderiza, no llama Resend
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { sendEmail } from "@/lib/email/send";
import {
  onboardingConfirmationEmailActive,
  onboardingConfirmationEmail,
  onboardingActivationEmail,
  backfillStartedEmailActive,
  dataReadyEmailActive,
  leadInviteEmailActive,
} from "@/lib/onboarding/emails";

export const dynamic = "force-dynamic";

type Step = {
  step: string;
  ok: boolean;
  detail?: any;
  error?: string;
};

export async function POST(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const targetId = body?.onboardingRequestId;
    const dryRun = !!body?.dryRun;
    const which = (body?.which || "confirmation") as
      | "invite" | "confirmation" | "activation" | "backfill_started" | "data_ready";
    const steps: Step[] = [];

    // ── Step 1: Fetch onboarding_request ──────────────────────
    let ob: any = null;
    try {
      const rows = targetId
        ? await prisma.$queryRawUnsafe<Array<any>>(
            `SELECT * FROM "onboarding_requests" WHERE "id" = $1 LIMIT 1`,
            targetId
          )
        : await prisma.$queryRawUnsafe<Array<any>>(
            `SELECT * FROM "onboarding_requests" ORDER BY "createdAt" DESC LIMIT 1`
          );
      ob = rows[0];
      if (!ob) {
        steps.push({ step: "1.fetch-onboarding", ok: false, error: "No onboarding_request found" });
        return NextResponse.json({ ok: false, steps });
      }
      steps.push({
        step: "1.fetch-onboarding",
        ok: true,
        detail: {
          id: ob.id,
          companyName: ob.companyName,
          contactName: ob.contactName,
          contactEmail: ob.contactEmail,
          createdAt: ob.createdAt,
          status: ob.status,
        },
      });
    } catch (err: any) {
      steps.push({ step: "1.fetch-onboarding", ok: false, error: err.message });
      return NextResponse.json({ ok: false, steps });
    }

    // ── Step 2: Test DB templates table exists ─────────────────
    try {
      const check = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_templates') AS "exists"`
      );
      steps.push({
        step: "2.templates-table-check",
        ok: true,
        detail: { exists: check[0]?.exists, note: check[0]?.exists ? "Tabla existe — *Active intentará leer" : "Tabla NO existe — *Active debería fallback al hardcoded" },
      });
    } catch (err: any) {
      steps.push({ step: "2.templates-table-check", ok: false, error: err.message });
    }

    // ── Step 3: Render del email elegido (con *Active si aplica) ──
    let activeRender: any = null;
    try {
      if (which === "invite") {
        activeRender = await leadInviteEmailActive({
          contactName: ob.contactName,
          companyName: ob.companyName,
        });
      } else if (which === "activation") {
        activeRender = onboardingActivationEmail({
          contactName: ob.contactName,
          companyName: ob.companyName,
          loginEmail: ob.contactEmail,
          temporaryPassword: "DEBUG-ONLY-NOT-REAL",
          orgId: ob.createdOrgId || "debug-org-id",
        });
      } else if (which === "backfill_started") {
        activeRender = await backfillStartedEmailActive({
          contactName: ob.contactName,
          companyName: ob.companyName,
        });
      } else if (which === "data_ready") {
        activeRender = await dataReadyEmailActive({
          contactName: ob.contactName,
          companyName: ob.companyName,
        });
      } else {
        activeRender = await onboardingConfirmationEmailActive({
          contactName: ob.contactName,
          companyName: ob.companyName,
          statusToken: ob.token || "no-token",
        });
      }
      steps.push({
        step: `3.render-${which}`,
        ok: true,
        detail: {
          subject: activeRender.subject,
          htmlLength: activeRender.html?.length || 0,
          htmlPreview: activeRender.html?.slice(0, 300),
        },
      });
    } catch (err: any) {
      steps.push({ step: `3.render-${which}`, ok: false, error: err.message });
    }

    // ── Step 4: Render hardcoded (sanity check, solo para confirmation) ──
    if (which === "confirmation") {
      try {
        const hardcoded = onboardingConfirmationEmail({
          contactName: ob.contactName,
          companyName: ob.companyName,
          statusToken: ob.token || "no-token",
        });
        steps.push({
          step: "4.render-hardcoded",
          ok: true,
          detail: { subject: hardcoded.subject, htmlLength: hardcoded.html?.length || 0 },
        });
      } catch (err: any) {
        steps.push({ step: "4.render-hardcoded", ok: false, error: err.message });
      }
    }

    // ── Step 5: Environment check (Resend config) ──────────────
    const envCheck = {
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      RESEND_FROM: process.env.RESEND_FROM || "(default)",
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || "(missing)",
    };
    steps.push({
      step: "5.env-check",
      ok: envCheck.RESEND_API_KEY,
      detail: envCheck,
      error: envCheck.RESEND_API_KEY ? undefined : "RESEND_API_KEY falta en env",
    });

    // ── Step 6: Actual send (o skip si dryRun) ─────────────────
    if (dryRun) {
      steps.push({ step: "6.send-resend", ok: true, detail: { skipped: "dryRun=true" } });
    } else if (activeRender && ob.contactEmail) {
      try {
        const result = await sendEmail({
          to: ob.contactEmail,
          subject: activeRender.subject + " [DEBUG]",
          html: activeRender.html,
        });
        steps.push({
          step: "6.send-resend",
          ok: result.ok,
          detail: {
            resendResponse: result,
            sentTo: ob.contactEmail,
            subjectWithTag: activeRender.subject + " [DEBUG]",
          },
          error: result.ok ? undefined : (result.error || "Resend returned ok=false"),
        });
      } catch (err: any) {
        steps.push({
          step: "6.send-resend",
          ok: false,
          error: err.message,
          detail: { note: "Exception en sendEmail wrapper" },
        });
      }
    } else {
      steps.push({ step: "6.send-resend", ok: false, error: "No se pudo enviar: render falló o falta contactEmail" });
    }

    const allOk = steps.every((s) => s.ok);
    const firstFail = steps.find((s) => !s.ok);

    return NextResponse.json({
      ok: allOk,
      summary: allOk
        ? "Todos los pasos OK. Si el email aún no llega, es deliverability (spam/filtros)."
        : `Falló en: ${firstFail?.step}. Detalle: ${firstFail?.error}`,
      steps,
    });
  } catch (error: any) {
    console.error("[debug-email-flow] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
