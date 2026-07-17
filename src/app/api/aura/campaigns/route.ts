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
    // Bloque D5 (reunión Tomy 08/07/26): "Comenzar campaña" es el flujo central del
    // nuevo modelo (el afiliado se crea SIN comisión y se le asigna por campaña), así
    // que la creación de campañas vuelve a estar habilitada.
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

    // ── Ventana de atribución por campaña (feedback 2026-07) ──
    // Opcional: 1-180 días. null = hereda la ventana del creador.
    let attributionWindowDays: number | null = null;
    if (
      body.attributionWindowDays !== undefined &&
      body.attributionWindowDays !== null &&
      body.attributionWindowDays !== ""
    ) {
      const w = Math.round(Number(body.attributionWindowDays));
      if (!Number.isFinite(w) || w < 1 || w > 180) {
        return NextResponse.json(
          // Mismo envelope {error, message} que el resto de los 400 de esta ruta
          { error: "invalid", message: "Ventana de atribución inválida (1 a 180 días)" },
          { status: 400 },
        );
      }
      attributionWindowDays = w;
    }

    // ── Deal fields (opcional) ──
    const deal = body.deal && typeof body.deal === "object" ? body.deal : null;
    const ALLOWED_DEAL_TYPES = [
      "COMMISSION", "FLAT_FEE", "PERFORMANCE_BONUS",
      "TIERED_COMMISSION", "CPM", "GIFTING", "HYBRID",
    ];
    const COMMISSION_TYPES = ["COMMISSION", "TIERED_COMMISSION", "HYBRID"];

    void COMMISSION_TYPES;
    // Bloque D5: una sola campaña activa a la vez. Si ya hay una ACTIVE, hay que
    // finalizarla antes de comenzar otra (item 12). Reemplaza el viejo chequeo de
    // "deal de comisión activo".
    const existingActive = await prisma.influencerCampaign.findFirst({
      where: { organizationId: org.id, influencerId: influencer.id, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    if (existingActive) {
      return NextResponse.json(
        {
          error: "active_campaign_exists",
          message: `Este creador ya tiene una campaña activa ("${existingActive.name}"). Finalizala antes de comenzar otra.`,
          existingCampaignId: existingActive.id,
        },
        { status: 409 },
      );
    }

    // Comisión de la campaña → se aplica al creador (el motor de atribución lee
    // influencer.commissionPercent). Así "asignar comisión por campaña" (item 9)
    // afecta de verdad las comisiones que se generan durante la campaña.
    // Fix review #3: si la campaña NO es de comisión (flat fee, CPM, bonus), se
    // resetea a 0 para no arrastrar el % de una campaña anterior.
    const rawPct =
      deal && deal.type === "COMMISSION" && deal.commissionPercent != null
        ? Number(deal.commissionPercent)
        : 0;
    const campaignCommission = Number.isFinite(rawPct) ? Math.max(0, Math.min(100, rawPct)) : 0;

    const { created, createdDealId } = await prisma.$transaction(async (tx) => {
      const created = await tx.influencerCampaign.create({
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
          attributionWindowDays,
          status: "ACTIVE",
        },
        select: { id: true, name: true },
      });

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
          excludeFromCommission: !!deal.excludeFromCommission,
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

        const d = await tx.influencerDeal.create({ data: dealData, select: { id: true } });
        createdDealId = d.id;
      }

      // Aplicar la comisión de la campaña al creador (motor CORE). Siempre se
      // setea (0 si la campaña no es de comisión) para no arrastrar % previos.
      await tx.influencer.update({
        where: { id: influencer.id, organizationId: org.id },
        data: { commissionPercent: campaignCommission },
      });

      return { created, createdDealId };
    });

    return NextResponse.json({ ok: true, campaign: created, createdDealId });
  } catch (error) {
    console.error("[aura/campaigns POST] error:", error);
    return NextResponse.json(
      { error: "internal", message: (error as Error).message },
      { status: 500 },
    );
  }
}
