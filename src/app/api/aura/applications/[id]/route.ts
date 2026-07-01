export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Decidir sobre una aplicación
// ══════════════════════════════════════════════════════════════
// PATCH /api/aura/applications/[id]
// Body: { status: "APPROVED" | "REJECTED" | "PENDING", notes?: string, deal?: {...} }
//
// Lote 2B (Pieza 3): aprobar una postulación AHORA EXIGE comisión obligatoria.
// Crea creador + campaña Always-On + deal de comisión vía la lib compartida
// createCreatorWithCommission, atómico junto con el update de la application.
// El mismo flujo lo usa el alta manual (POST /api/aura/creators).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import {
  createCreatorWithCommission,
  validateCreatorCommissionInput,
  sendOnboardingEmail,
} from "@/lib/aura/create-creator";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const org = await getOrganization(req);
    const id = params.id;
    const body = await req.json();
    const status = body.status as string;
    const notes = typeof body.notes === "string" ? body.notes : undefined;

    if (!["APPROVED", "REJECTED", "PENDING"].includes(status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }

    const existing = await prisma.influencerApplication.findFirst({
      where: { id, organizationId: org.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isNewApproval = status === "APPROVED" && existing.status !== "APPROVED";

    let createdInfluencerId: string | null = null;
    let createdDealId: string | null = null;
    let createdCampaignId: string | null = null;
    let updated;

    if (isNewApproval) {
      // Comisión obligatoria: el deal debe venir y ser de un tipo que paga comisión.
      const check = validateCreatorCommissionInput({ name: existing.name, email: existing.email, deal: body.deal });
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }

      // Atómico: creador+campaña+deal Y el cambio de estado de la application juntos.
      const result = await prisma.$transaction(async (tx) => {
        const creator = await createCreatorWithCommission(tx, {
          organizationId: org.id,
          name: existing.name,
          email: existing.email,
          deal: body.deal,
        });
        const app = await tx.influencerApplication.update({
          // org en el where (no solo en el findFirst previo): cierra el TOCTOU de
          // aislamiento por org, consistente con el hardening D9 de Lote 1.
          where: { id, organizationId: org.id },
          data: {
            status,
            reviewedAt: new Date(),
            ...(notes !== undefined ? { notes } : {}),
          },
        });
        return { creator, app };
      });

      createdInfluencerId = result.creator.influencerId;
      createdDealId = result.creator.dealId;
      createdCampaignId = result.creator.campaignId;
      updated = result.app;

      // Onboarding: mail con el link de set-password, POST-commit, fire-and-forget visible.
      waitUntil(
        sendOnboardingEmail({
          influencerId: result.creator.influencerId,
          organizationId: org.id,
          name: existing.name,
          email: existing.email,
          code: result.creator.code,
          dashboardPassword: null,
          orgSlug: org.slug,
          orgName: org.name,
        }),
      );
    } else {
      // REJECTED / PENDING / re-aprobar algo ya aprobado: solo cambia el estado.
      updated = await prisma.influencerApplication.update({
        // org en el where (cierra TOCTOU, patrón D9).
        where: { id, organizationId: org.id },
        data: {
          status,
          reviewedAt: status !== "PENDING" ? new Date() : null,
          ...(notes !== undefined ? { notes } : {}),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      application: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
      },
      createdInfluencerId,
      createdDealId,
      createdCampaignId,
    });
  } catch (e: any) {
    console.error("[aura/applications/[id] PATCH] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
