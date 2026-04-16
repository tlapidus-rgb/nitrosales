// ═══════════════════════════════════════════════════════════════════
// /api/admin/backfill-always-on
// ═══════════════════════════════════════════════════════════════════
// Crea campañas "Always On" para creadores ACTIVOS que no tengan una.
// Idempotente: si ya tiene una campaña con isAlwaysOn=true, la saltea.
//
// Uso:
//   curl "https://nitrosales.vercel.app/api/admin/backfill-always-on?key=<NEXTAUTH_SECRET>"
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (!key || key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Todos los creadores activos
    const creators = await prisma.influencer.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        code: true,
        organizationId: true,
        commissionPercent: true,
        campaigns: {
          where: { isAlwaysOn: true },
          select: { id: true },
          take: 1,
        },
      },
    });

    const needsBackfill = creators.filter((c) => c.campaigns.length === 0);

    const results: { creatorId: string; name: string; campaignId: string }[] = [];

    for (const creator of needsBackfill) {
      // Crear campaña Always On + deal base con la comisión actual
      const campaign = await prisma.influencerCampaign.create({
        data: {
          organizationId: creator.organizationId,
          influencerId: creator.id,
          name: `Always On · ${creator.name}`,
          description: "Campaña base creada automáticamente (backfill).",
          startDate: new Date(),
          isAlwaysOn: true,
          status: "ACTIVE",
        },
        select: { id: true },
      });

      // Crear deal de comisión si tiene commissionPercent > 0
      const pct = Number(creator.commissionPercent);
      if (pct > 0) {
        await prisma.influencerDeal.create({
          data: {
            organizationId: creator.organizationId,
            influencerId: creator.id,
            campaignId: campaign.id,
            name: `Comisión ${pct}%`,
            type: "COMMISSION",
            status: "ACTIVE",
            currency: "ARS",
            commissionPercent: pct,
          },
        });
      }

      results.push({
        creatorId: creator.id,
        name: creator.name,
        campaignId: campaign.id,
      });
    }

    return NextResponse.json({
      ok: true,
      total: creators.length,
      alreadyHad: creators.length - needsBackfill.length,
      created: results.length,
      details: results,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
