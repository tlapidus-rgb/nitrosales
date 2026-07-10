export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Alta MANUAL de creador (Lote 2B · Pieza 3)
// ══════════════════════════════════════════════════════════════
// POST /api/aura/creators
// body: { name, email?, deal: { type, commissionPercent?, ... } }
//
// Crea creador + campaña Always-On + deal de comisión OBLIGATORIA, atómico,
// vía la misma lib que usa aprobar-postulación (createCreatorWithCommission).
// Un creador nunca queda sin campaña ni sin comisión.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import {
  createCreatorSimple,
  validateCreatorSimpleInput,
  sendOnboardingEmail,
} from "@/lib/aura/create-creator";

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json().catch(() => ({}));

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;

    // Item 9 (reunión Tomy 08/07/26): el afiliado se crea SIN comisión. Solo se
    // pide nombre + email; la comisión se asigna después por campaña.
    const check = validateCreatorSimpleInput({ name, email });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const result = await prisma.$transaction((tx) =>
      createCreatorSimple(tx, { organizationId: org.id, name, email }),
    );

    // Onboarding: mail con el link de set-password, POST-commit, fire-and-forget visible.
    // email es no-null acá (validateCreatorCommissionInput lo exige).
    waitUntil(
      sendOnboardingEmail({
        influencerId: result.influencerId,
        organizationId: org.id,
        name,
        email: email as string,
        code: result.code,
        dashboardPassword: null,
        orgSlug: org.slug,
        orgName: org.name,
      }),
    );

    return NextResponse.json({
      ok: true,
      creator: {
        id: result.influencerId,
        code: result.code,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[aura/creators POST] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
