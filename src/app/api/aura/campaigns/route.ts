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
      select: { id: true },
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

    return NextResponse.json({ ok: true, campaign: created });
  } catch (error) {
    console.error("[aura/campaigns POST] error:", error);
    return NextResponse.json(
      { error: "internal", message: (error as Error).message },
      { status: 500 },
    );
  }
}
