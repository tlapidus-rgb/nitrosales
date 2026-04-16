export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Decidir sobre una aplicación
// ══════════════════════════════════════════════════════════════
// PATCH /api/aura/applications/[id]
// Body: { status: "APPROVED" | "REJECTED" | "PENDING", notes?: string }
//
// Si se aprueba: crea un Influencer con código auto-generado a partir
// del nombre (kebab) y commissionPercent 10% por defecto.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

function slugifyCode(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
}

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

    let createdInfluencerId: string | null = null;
    let createdDealId: string | null = null;
    let createdCampaignId: string | null = null;
    if (status === "APPROVED" && existing.status !== "APPROVED") {
      // generar código único a partir del nombre
      const base = slugifyCode(existing.name) || "creator";
      let code = base;
      let tries = 0;
      while (tries < 20) {
        const clash = await prisma.influencer.findUnique({
          where: {
            organizationId_code: { organizationId: org.id, code },
          },
          select: { id: true },
        });
        if (!clash) break;
        tries++;
        code = `${base}${tries}`;
      }

      // Si viene un deal, la commissionPercent del influencer la dejamos
      // alineada con la del deal (si es COMMISSION/HYBRID); si no, 10%.
      const deal = body.deal;
      const infCommission =
        deal && (deal.type === "COMMISSION" || deal.type === "HYBRID") && deal.commissionPercent != null
          ? Number(deal.commissionPercent)
          : 10;

      const created = await prisma.influencer.create({
        data: {
          organizationId: org.id,
          name: existing.name,
          code,
          email: existing.email,
          commissionPercent: infCommission,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      createdInfluencerId = created.id;

      // Crear campaña "Always On" + deal principal atado a esa campaña
      if (deal && typeof deal === "object") {
        const ALLOWED_DEAL_TYPES = [
          "COMMISSION",
          "FLAT_FEE",
          "PERFORMANCE_BONUS",
          "TIERED_COMMISSION",
          "CPM",
          "GIFTING",
          "HYBRID",
        ];
        if (deal.type && ALLOWED_DEAL_TYPES.includes(deal.type)) {
          // 1. Crear la campaña Always On
          const campaign = await prisma.influencerCampaign.create({
            data: {
              organizationId: org.id,
              influencerId: created.id,
              name: `Always On · ${existing.name}`,
              description: "Campaña base creada automáticamente al aprobar al creador.",
              startDate: new Date(),
              isAlwaysOn: true,
              status: "ACTIVE",
            },
            select: { id: true },
          });
          createdCampaignId = campaign.id;

          // 2. Crear el deal principal dentro de esa campaña
          const dealData: any = {
            organizationId: org.id,
            influencerId: created.id,
            campaignId: campaign.id,
            name: (deal.name || "").trim() || `Deal inicial · ${existing.name}`,
            type: deal.type,
            status: "ACTIVE",
            currency: deal.currency || "ARS",
            notes: deal.notes || null,
            startDate: deal.startDate ? new Date(deal.startDate) : new Date(),
            endDate: deal.endDate ? new Date(deal.endDate) : null,
          };
          if (deal.commissionPercent != null) dealData.commissionPercent = Number(deal.commissionPercent);
          if (deal.flatAmount != null) dealData.flatAmount = Number(deal.flatAmount);
          if (deal.flatUnit) dealData.flatUnit = deal.flatUnit;
          if (deal.bonusAmount != null) dealData.bonusAmount = Number(deal.bonusAmount);
          if (deal.bonusMetric) dealData.bonusMetric = deal.bonusMetric;
          if (deal.bonusTarget != null) dealData.bonusTarget = Number(deal.bonusTarget);
          if (deal.tiers) dealData.tiers = deal.tiers;
          if (deal.cpmRate != null) dealData.cpmRate = Number(deal.cpmRate);
          if (deal.productValue != null) dealData.productValue = Number(deal.productValue);
          if (deal.productDescription) dealData.productDescription = deal.productDescription;

          const createdDeal = await prisma.influencerDeal.create({
            data: dealData,
            select: { id: true },
          });
          createdDealId = createdDeal.id;
        }
      }
    }

    const updated = await prisma.influencerApplication.update({
      where: { id },
      data: {
        status,
        reviewedAt: status !== "PENDING" ? new Date() : null,
        ...(notes !== undefined ? { notes } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      application: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
      },
      createdInfluencerId,
      createdDealId,
      createdCampaignId: createdCampaignId ?? null,
    });
  } catch (e: any) {
    console.error("[aura/applications/[id] PATCH] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
