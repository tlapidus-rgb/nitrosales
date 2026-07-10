export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Saldos por campaña de un creador (Bloque D · items 11/12/14)
// ══════════════════════════════════════════════════════════════
// GET /api/aura/creators/[id]/balance
//
// Devuelve el saldo por campaña (ganado por ventana − pagado) + los totales,
// incluyendo "Pendiente a pagar" (totalPending). Reemplaza al modelo por-mes
// del PaymentsCard viejo. Ver src/lib/aura/campaign-balance.ts.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { computeCreatorBalances } from "@/lib/aura/campaign-balance";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const org = await getOrganization(req);

    const creator = await prisma.influencer.findFirst({
      where: { id: params.id, organizationId: org.id },
      select: { id: true, status: true },
    });
    if (!creator) {
      return NextResponse.json({ error: "Creador no encontrado" }, { status: 404 });
    }

    const balances = await computeCreatorBalances(prisma, org.id, creator.id);
    return NextResponse.json({ ok: true, status: creator.status, ...balances });
  } catch (e: any) {
    console.error("[aura/creators/[id]/balance] error:", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
