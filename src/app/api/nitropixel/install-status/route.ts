// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/nitropixel/install-status
// ══════════════════════════════════════════════════════════════
// Chequea si la org tiene eventos del pixel. Si 0 eventos en la DB,
// asumimos que el pixel no está instalado y mostramos un banner.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const orgId = await getOrganizationId();

    // Count pixel events for this org
    const eventsCount = await prisma.pixelEvent.count({
      where: { organizationId: orgId },
    });

    // Count visitors too (redundante pero informativo)
    const visitorsCount = await prisma.pixelVisitor.count({
      where: { organizationId: orgId },
    });

    // Último evento recibido
    const lastEvent = await prisma.pixelEvent.findFirst({
      where: { organizationId: orgId },
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    });

    const isInstalled = eventsCount > 0;

    return NextResponse.json({
      ok: true,
      isInstalled,
      eventsCount,
      visitorsCount,
      lastEventAt: lastEvent?.receivedAt?.toISOString() || null,
      orgId,
      snippetUrl: `${process.env.NEXTAUTH_URL || "https://nitrosales.vercel.app"}/api/pixel/script?org=${orgId}`,
    });
  } catch (error: any) {
    console.error("[nitropixel/install-status] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
