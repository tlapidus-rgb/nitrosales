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
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import {
  createCreatorWithCommission,
  validateCreatorCommissionInput,
} from "@/lib/aura/create-creator";

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json().catch(() => ({}));

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;

    // Comisión obligatoria: nombre + deal de un tipo que paga comisión, forma coherente.
    const check = validateCreatorCommissionInput({ name, deal: body.deal });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const result = await prisma.$transaction((tx) =>
      createCreatorWithCommission(tx, {
        organizationId: org.id,
        name,
        email,
        deal: body.deal,
      }),
    );

    return NextResponse.json({
      ok: true,
      creator: {
        id: result.influencerId,
        code: result.code,
        campaignId: result.campaignId,
        dealId: result.dealId,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[aura/creators POST] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
