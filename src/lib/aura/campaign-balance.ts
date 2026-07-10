// ══════════════════════════════════════════════════════════════
// Aura — Saldos por campaña + asignación FIFO de pagos (Bloque D)
// ══════════════════════════════════════════════════════════════
// Rediseño pedido por Tomy (reunión 08/07/26): los pagos dejan de ser
// "por mes sin saldo" y pasan a ser POR CAMPAÑA con saldo pendiente y
// asignación FIFO (de campaña más vieja a más nueva).
//
// Por qué por VENTANA DE FECHAS y no por campaignId:
//   El motor de atribución (src/lib/pixel/influencer-attribution.ts) casi
//   nunca setea campaignId en la InfluencerAttribution (solo si la UTM trae
//   el slug de una campaña activa que matchee por nombre). Entonces el
//   "ganado por campaña" NO se puede sacar por campaignId. Como el modelo de
//   Tomy es "una sola campaña activa a la vez" (Comenzar/Finalizar), las
//   ventanas [startDate, endDate] no se solapan y cada comisión cae en la
//   campaña vigente en su fecha. earned(campaña) = SUM(commissionAmount de
//   las atribuciones del creador con createdAt en [startDate, endDate ?? now]).
//
//   paid(campaña) = SUM(amount de payouts PAID con campaignId = campaña.id).
//   Los pagos registrados vía FIFO SÍ quedan linkeados por campaignId, así
//   que "pagado" es exacto.
// ══════════════════════════════════════════════════════════════

import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type CampaignBalance = {
  campaignId: string;
  name: string;
  status: string; // ACTIVE | COMPLETED | PAUSED
  isAlwaysOn: boolean;
  startDate: string; // ISO
  endDate: string | null; // ISO — null si sigue activa
  earned: number; // comisión ganada en la ventana
  paid: number; // pagos PAID linkeados a la campaña
  pending: number; // max(0, earned - paid)
};

export type CreatorBalances = {
  campaigns: CampaignBalance[]; // ordenadas por startDate asc (más vieja primero)
  totalEarned: number;
  totalPaid: number;
  totalPending: number; // "Pendiente a pagar" (item 14)
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Saldo por campaña de un creador. Ganado por ventana de fechas, pagado por
 * campaignId. Ordena de más vieja a más nueva (orden del FIFO).
 */
export async function computeCreatorBalances(
  db: Db,
  organizationId: string,
  creatorId: string,
): Promise<CreatorBalances> {
  const campaigns = await db.influencerCampaign.findMany({
    where: { organizationId, influencerId: creatorId },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true, status: true, isAlwaysOn: true, startDate: true, endDate: true },
  });

  // Pagos PAID del creador agrupados por campaña (una query).
  const paidByCampaign = await db.payout.groupBy({
    by: ["campaignId"],
    where: { organizationId, influencerId: creatorId, status: "PAID", campaignId: { not: null } },
    _sum: { amount: true },
  });
  const paidMap = new Map<string, number>();
  for (const row of paidByCampaign) {
    if (row.campaignId) paidMap.set(row.campaignId, Number(row._sum.amount || 0));
  }

  const now = new Date();
  const balances: CampaignBalance[] = [];
  for (const c of campaigns) {
    const windowEnd = c.endDate ?? now;
    const agg = await db.influencerAttribution.aggregate({
      where: {
        organizationId,
        influencerId: creatorId,
        createdAt: { gte: c.startDate, lte: windowEnd },
      },
      _sum: { commissionAmount: true },
    });
    const earned = round2(Number(agg._sum.commissionAmount || 0));
    const paid = round2(paidMap.get(c.id) || 0);
    const pending = round2(Math.max(0, earned - paid));
    balances.push({
      campaignId: c.id,
      name: c.name,
      status: c.status,
      isAlwaysOn: c.isAlwaysOn ?? false,
      startDate: c.startDate.toISOString(),
      endDate: c.endDate ? c.endDate.toISOString() : null,
      earned,
      paid,
      pending,
    });
  }

  const totalEarned = round2(balances.reduce((s, b) => s + b.earned, 0));
  const totalPaid = round2(balances.reduce((s, b) => s + b.paid, 0));
  const totalPending = round2(balances.reduce((s, b) => s + b.pending, 0));

  return { campaigns: balances, totalEarned, totalPaid, totalPending };
}

export type FifoAllocation = { campaignId: string; name: string; amount: number };

/**
 * Reparte `amount` sobre las campañas con saldo pendiente, de más vieja a más
 * nueva (FIFO). `candidates` debe venir ordenado por startDate asc. Si se pasan
 * `onlyCampaignIds`, solo se saldan esas (igual respetando el orden viejo→nuevo).
 *
 * Ej (pedido de Tomy): 2 campañas de $25, pago $40 → la más vieja queda $0 y la
 * siguiente $10 restante. Devuelve [{c1,25},{c2,15}].
 *
 * Pura y sin DB → testeable. `leftover` = plata que sobró (pagó de más).
 */
export function allocateFifo(
  candidates: Array<Pick<CampaignBalance, "campaignId" | "name" | "pending">>,
  amount: number,
  onlyCampaignIds?: string[],
): { allocations: FifoAllocation[]; allocated: number; leftover: number } {
  const only = onlyCampaignIds && onlyCampaignIds.length > 0 ? new Set(onlyCampaignIds) : null;
  let remaining = round2(amount);
  const allocations: FifoAllocation[] = [];
  for (const c of candidates) {
    if (remaining <= 0) break;
    if (only && !only.has(c.campaignId)) continue;
    const pend = round2(c.pending);
    if (pend <= 0) continue;
    const take = round2(Math.min(pend, remaining));
    if (take > 0) {
      allocations.push({ campaignId: c.campaignId, name: c.name, amount: take });
      remaining = round2(remaining - take);
    }
  }
  return {
    allocations,
    allocated: round2(amount - remaining),
    leftover: round2(Math.max(0, remaining)),
  };
}
