export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Admin — Reenviar el link de set-password a creadores sin clave
// ══════════════════════════════════════════════════════════════
// POST /api/admin/aura-resend-onboarding
// body: { dryRun?: boolean (default TRUE), onlyMissingPassword?: boolean (default TRUE) }
//
// ⚠️ ACCIÓN MANUAL Y EXPLÍCITA. NO corre solo en el deploy — solo cuando se la dispara.
// Por seguridad nace en dryRun (lista a quién le mandaría, sin mandar). Para enviar de
// verdad: { dryRun: false }. Scoped a la org de la sesión (multi-tenant).
//
// Caso de uso: los creadores creados por el flujo viejo quedaron con dashboardPassword=NULL
// (dashboard bloqueado hasta que definan su clave). Esto les manda el link.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { sendOnboardingEmail } from "@/lib/aura/create-creator";

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // default true (seguro)
    const onlyMissingPassword = body.onlyMissingPassword !== false; // default true

    const creators = await prisma.influencer.findMany({
      where: {
        organizationId: org.id,
        ...(onlyMissingPassword ? { dashboardPassword: null } : {}),
      },
      select: { id: true, name: true, email: true, code: true, dashboardPassword: true },
    });

    const results: Array<{ id: string; name: string; email: string | null; sent: boolean; note?: string }> = [];

    for (const c of creators) {
      if (!c.email) {
        results.push({ id: c.id, name: c.name, email: null, sent: false, note: "sin email" });
        continue;
      }
      if (dryRun) {
        results.push({ id: c.id, name: c.name, email: c.email, sent: false, note: "dryRun (no enviado)" });
        continue;
      }
      const r = await sendOnboardingEmail({
        influencerId: c.id,
        organizationId: org.id,
        name: c.name,
        email: c.email,
        code: c.code,
        dashboardPassword: c.dashboardPassword,
        orgSlug: org.slug,
        orgName: org.name,
      });
      results.push({ id: c.id, name: c.name, email: c.email, sent: r.ok, note: r.ok ? undefined : r.error });
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      org: org.name,
      candidates: creators.length,
      sent: results.filter((x) => x.sent).length,
      results,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[aura-resend-onboarding]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
