export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Crear campaña
// ══════════════════════════════════════════════════════════════
// POST: crea una nueva InfluencerCampaign con los datos enviados.
// Campos requeridos: name, influencerId, startDate.
// Opcionales: description, endDate, bonusAmount, bonusTarget.
// Status por defecto: ACTIVE.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json().catch(() => ({}));

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const influencerId =
      typeof body.influencerId === "string" ? body.influencerId.trim() : "";
    const startDate = body.startDate ? new Date(body.startDate) : null;

    if (!name) {
      return NextResponse.json(
        { error: "invalid", message: "Nombre requerido" },
        { status: 400 },
      );
    }
    if (!influencerId) {
      return NextResponse.json(
        { error: "invalid", message: "Creador requerido" },
        { status: 400 },
      );
    }
    if (!startDate || isNaN(startDate.getTime())) {
      return NextResponse.json(
        { error: "invalid", message: "Fecha de inicio requerida" },
        { status: 400 },
      );
    }

    const influencer = await prisma.influencer.findFirst({
      where: { organizationId: org.id, id: influencerId },
      select: { id: true, name: true },
    });
    if (!influencer) {
      return NextResponse.json(
        { error: "invalid", message: "Creador no encontrado" },
        { status: 400 },
      );
    }

    const endDate =
      body.endDate && !isNaN(new Date(body.endDate).getTime())
        ? new Date(body.endDate)
        : null;

    const bonusAmount =
      body.bonusAmount !== undefined &&
      body.bonusAmount !== null &&
      body.bonusAmount !== ""
        ? Number(body.bonusAmount)
        : null;
    const bonusTarget =
      body.bonusTarget !== undefined &&
      body.bonusTarget !== null &&
      body.bonusTarget !== ""
        ? Number(body.bonusTarget)
        : null;

    // ── Deal fields (opcional) ──
    const deal = body.deal && typeof body.deal === "object" ? body.deal : null;
    const ALLOWED_DEAL_TYPES = [
      "COMMISSION", "FLAT_FEE", "PERFORMANCE_BONUS",
      "TIERED_COMMISSION", "CPM", "GIFTING", "HYBRID",
    ];
    const COMMISSION_TYPES = ["COMMISSION", "TIERED_COMMISSION", "HYBRID"];

    // Validar uniqueness de comisión activa
    if (deal && COMMISSION_TYPES.includes(deal.type)) {
      const existingCommissionDeal = await prisma.influencerDeal.findFirst({
        where: {
          organizationId: org.id,
          influencerId: influencer.id,
          status: "ACTIVE",
          type: { in: COMMISSION_TYPES },
        },
        select: { id: true, name: true, type: true },
      });
      if (existingCommissionDeal) {
        return NextResponse.json(
          {
            error: "commission_conflict",
            message: `Este creador ya tiene un deal de comisión activo ("${existingCommissionDeal.name}"). Desactivá el existente antes de crear uno nuevo.`,
            existingDealId: existingCommissionDeal.id,
          },
          { status: 409 },
        );
      }
    }

    const created = await prisma.influencerCampaign.create({
      data: {
        organizationId: org.id,
        influencerId: influencer.id,
        name,
        description:
          typeof body.description === "string" && body.description.trim()
            ? body.description.trim()
            : null,
        startDate,
        endDate,
        bonusAmount,
        bonusTarget,
        status: "ACTIVE",
      },
      select: { id: true, name: true },
    });

    // Crear el deal dentro de la campaña si se pasaron datos
    let createdDealId: string | null = null;
    if (deal && deal.type && ALLOWED_DEAL_TYPES.includes(deal.type)) {
      const dealData: any = {
        organizationId: org.id,
        influencerId: influencer.id,
        campaignId: created.id,
        name: (deal.name || "").trim() || `${name} · ${influencer.name}`,
        type: deal.type,
        status: "ACTIVE",
        currency: deal.currency || "ARS",
        notes: deal.notes || null,
        startDate: startDate,
        endDate: endDate,
        // excludeFromCommission: !!deal.excludeFromCommission,  // TODO: habilitar post-migración migrate-aura-columns
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

      const d = await prisma.influencerDeal.create({
        data: dealData,
        select: { id: true },
      });
      createdDealId = d.id;
    }

    return NextResponse.json({ ok: true, campaign: created, createdDealId });
  } catch (error) {
    console.error("[aura/campaigns POST] error:", error);
    return NextResponse.json(
      { error: "internal", message: (error as Error).message },
      { status: 500 },
    );
  }
}
