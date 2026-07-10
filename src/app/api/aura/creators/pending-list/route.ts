export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Afiliados con saldo pendiente (Bloque D3 · items 24/20)
// ══════════════════════════════════════════════════════════════
// GET /api/aura/creators/pending-list
//
// Lista los creadores con su "pendiente a pagar" (comisión ganada − pagado),
// para el selector de afiliado de la página de Pagos y para reencuadrar el
// KPI "Pendiente" (antes salía de payouts PENDING, que en el modelo nuevo no
// se crean → siempre daba 0; ese era el bug del item 20).
//
// Resumen eficiente: earned = SUM(commissionAmount) de TODAS las atribuciones
// del creador; paid = SUM(amount) de payouts PAID. pending = max(0, earned−paid).
// El monto exacto por campaña (FIFO) se recalcula al registrar el pago vía
// /api/aura/creators/[id]/balance + /settle.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function GET(req: NextRequest) {
  try {
    const org = await getOrganization(req);

    const [creators, earnedByCreator, paidByCreator] = await Promise.all([
      prisma.influencer.findMany({
        where: { organizationId: org.id },
        select: { id: true, name: true, code: true, profileImage: true, status: true },
      }),
      prisma.influencerAttribution.groupBy({
        by: ["influencerId"],
        where: { organizationId: org.id },
        _sum: { commissionAmount: true },
      }),
      prisma.payout.groupBy({
        by: ["influencerId"],
        where: { organizationId: org.id, status: "PAID" },
        _sum: { amount: true },
      }),
    ]);

    const earnedMap = new Map<string, number>();
    for (const r of earnedByCreator) earnedMap.set(r.influencerId, Number(r._sum.commissionAmount || 0));
    const paidMap = new Map<string, number>();
    for (const r of paidByCreator) paidMap.set(r.influencerId, Number(r._sum.amount || 0));

    const items = creators
      .map((c) => {
        const earned = round2(earnedMap.get(c.id) || 0);
        const paid = round2(paidMap.get(c.id) || 0);
        const pending = round2(Math.max(0, earned - paid));
        return { id: c.id, name: c.name, code: c.code, profileImage: c.profileImage, status: c.status, earned, paid, pending };
      })
      .sort((a, b) => b.pending - a.pending);

    const totalPending = round2(items.reduce((s, i) => s + i.pending, 0));

    return NextResponse.json({ ok: true, items, totalPending });
  } catch (e: any) {
    console.error("[aura/creators/pending-list] error:", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
