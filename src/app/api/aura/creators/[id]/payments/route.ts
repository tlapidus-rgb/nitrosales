export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Pagos por mes de un creador (Lote 2B · Pieza 2)
// ══════════════════════════════════════════════════════════════
// GET /api/aura/creators/[id]/payments?months=6
//
// Devuelve, por mes, SIN saldo acumulado:
//   - corresponde: comisión del mes (SUM del commissionAmount YA congelado por el
//     motor en InfluencerAttribution = ventas × % vigente de ese mes por construcción).
//   - pagado: SUM de payouts PAID asociados a ese mes (registro libre, monto libre).
//   - payouts: los registros del mes.
//
// Cada mes es independiente. Registrar un pago NO descuenta ningún saldo (no hay).
// El % se lee vía el seam getCommissionRate (sólo para mostrar la tasa vigente);
// el "corresponde" sale del monto congelado, no de re-multiplicar (correcto ante
// cambios de % y períodos inactivos).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { getCommissionRate } from "@/lib/aura/commission";
import { lastNPeriodMonths, monthRange, periodMonthLabel } from "@/lib/aura/payout-period";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const org = await getOrganization(req);

    const creator = await prisma.influencer.findFirst({
      where: { id: params.id, organizationId: org.id },
      select: { id: true, commissionPercent: true, status: true },
    });
    if (!creator) {
      return NextResponse.json({ error: "Creador no encontrado" }, { status: 404 });
    }

    const monthsParam = Number(new URL(req.url).searchParams.get("months"));
    const monthsCount = Number.isFinite(monthsParam) && monthsParam > 0 && monthsParam <= 24
      ? Math.floor(monthsParam)
      : 6;

    const periodMonths = lastNPeriodMonths(monthsCount);
    const oldest = monthRange(periodMonths[periodMonths.length - 1]).start;

    // Todos los payouts PAID del creador desde el mes más viejo del rango (1 query).
    const paidPayouts = await prisma.payout.findMany({
      where: {
        organizationId: org.id,
        influencerId: creator.id,
        status: "PAID",
        periodStart: { gte: oldest },
      },
      select: {
        id: true,
        amount: true,
        concept: true,
        method: true,
        reference: true,
        paidAt: true,
        periodStart: true,
      },
      orderBy: { paidAt: "desc" },
    });

    // Comisión congelada por mes (1 aggregate por mes; rango chico, creador único).
    const months = await Promise.all(
      periodMonths.map(async (pm) => {
        const { start, end } = monthRange(pm);
        const agg = await prisma.influencerAttribution.aggregate({
          where: {
            organizationId: org.id,
            influencerId: creator.id,
            createdAt: { gte: start, lte: end },
          },
          _sum: { commissionAmount: true, attributedValue: true },
          _count: { _all: true },
        });
        const owed = Number(agg._sum.commissionAmount || 0);
        const revenue = Number(agg._sum.attributedValue || 0);

        const monthPayouts = paidPayouts.filter(
          (p) => p.periodStart && p.periodStart.getTime() >= start.getTime() && p.periodStart.getTime() <= end.getTime(),
        );
        const paid = monthPayouts.reduce((s, p) => s + Number(p.amount || 0), 0);

        return {
          periodMonth: pm,
          label: periodMonthLabel(pm),
          owed: Math.round(owed * 100) / 100,
          revenue: Math.round(revenue * 100) / 100,
          orders: agg._count._all,
          paid: Math.round(paid * 100) / 100,
          payouts: monthPayouts.map((p) => ({
            id: p.id,
            amount: Number(p.amount || 0),
            concept: p.concept,
            method: p.method,
            reference: p.reference,
            paidAt: p.paidAt ? p.paidAt.toISOString() : null,
          })),
        };
      }),
    );

    return NextResponse.json({
      ok: true,
      // tasa vigente SÓLO informativa (seam de Pieza 1); el corresponde sale del congelado.
      currentRate: getCommissionRate({ commissionPercent: Number(creator.commissionPercent), status: creator.status }),
      status: creator.status,
      months,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
