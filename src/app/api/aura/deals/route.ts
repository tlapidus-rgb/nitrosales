export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Crear un deal (acuerdo de compensación)
// ══════════════════════════════════════════════════════════════
// POST /api/aura/deals
// body: { name, type, influencerId, campaignId?, currency?,
//         commissionPercent?, flatAmount?, flatUnit?,
//         bonusAmount?, bonusMetric?, bonusTarget?,
//         tiers?, cpmRate?, productValue?, productDescription?,
//         startDate?, endDate?, notes? }
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

const ALLOWED_TYPES = [
  "COMMISSION",
  "FLAT_FEE",
  "PERFORMANCE_BONUS",
  "TIERED_COMMISSION",
  "CPM",
  "GIFTING",
  "HYBRID",
];

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    const name: string = (body.name || "").trim();
    const type: string = body.type;
    const influencerId: string = body.influencerId;
    const campaignId: string | null = body.campaignId || null;

    if (!name) return NextResponse.json({ error: "name requerido" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(type)) {
      return NextResponse.json({ error: "type inválido" }, { status: 400 });
    }
    if (!influencerId) return NextResponse.json({ error: "influencerId requerido" }, { status: 400 });

    const inf = await prisma.influencer.findFirst({
      where: { id: influencerId, organizationId: org.id },
      select: { id: true },
    });
    if (!inf) return NextResponse.json({ error: "Influencer no encontrado" }, { status: 404 });

    if (campaignId) {
      const camp = await prisma.influencerCampaign.findFirst({
        where: { id: campaignId, organizationId: org.id },
        select: { id: true },
      });
      if (!camp) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
    }

    const data: any = {
      organizationId: org.id,
      influencerId,
      campaignId,
      name,
      type,
      status: "ACTIVE",
      currency: body.currency || "ARS",
      notes: body.notes || null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
    };

    // Campos específicos según type (todos opcionales; cada deal puede usar varios si es HYBRID)
    if (body.commissionPercent != null) data.commissionPercent = Number(body.commissionPercent);
    if (body.flatAmount != null) data.flatAmount = Number(body.flatAmount);
    if (body.flatUnit) data.flatUnit = body.flatUnit;
    if (body.bonusAmount != null) data.bonusAmount = Number(body.bonusAmount);
    if (body.bonusMetric) data.bonusMetric = body.bonusMetric;
    if (body.bonusTarget != null) data.bonusTarget = Number(body.bonusTarget);
    if (body.tiers) data.tiers = body.tiers;
    if (body.cpmRate != null) data.cpmRate = Number(body.cpmRate);
    if (body.productValue != null) data.productValue = Number(body.productValue);
    if (body.productDescription) data.productDescription = body.productDescription;

    const created = await prisma.influencerDeal.create({
      data,
      include: {
        influencer: { select: { id: true, name: true, code: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ ok: true, deal: created });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
