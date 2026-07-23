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
//
//   ADEMÁS: los pagos PAID SIN campaignId (card mensual del perfil, pago manual
//   sin tag) se acreditan FIFO sobre el pendiente restante. Antes se IGNORABAN
//   (el pendiente solo miraba payouts con campaignId) → un pago no tagueado NUNCA
//   saldaba nada y quedaba "lo pagué y sigue pendiente". Así, totalPending ==
//   ganado − TODO lo pagado, y coincide con /creators/pending-list (Pagos).
// ══════════════════════════════════════════════════════════════

import type { Prisma, PrismaClient } from "@prisma/client";
import { monthRange, toPeriodMonth } from "@/lib/aura/payout-period";

type Db = PrismaClient | Prisma.TransactionClient;

export type CampaignBalance = {
  campaignId: string;
  name: string;
  status: string; // ACTIVE | COMPLETED | PAUSED
  isAlwaysOn: boolean;
  startDate: string; // ISO
  endDate: string | null; // ISO — null si sigue activa
  // Ventana propia de la campaña (días). null = hereda la del creador.
  // La expone el panel del creador para poder editarla sin finalizar la campaña.
  attributionWindowDays: number | null;
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
    select: { id: true, name: true, status: true, isAlwaysOn: true, startDate: true, endDate: true, attributionWindowDays: true },
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

  // Ventanas CONTIGUAS por startDate (fix review #1/#2/#5): cada campaña posee
  // las comisiones desde su inicio hasta el inicio de la SIGUIENTE campaña (o
  // ahora, si es la última). Así no hay huecos (comisiones del día de finalización
  // o entre campañas no se pierden), ni doble-conteo por ventanas solapadas, y la
  // suma del ganado por campaña == comisión lifetime (coincide con pending-list).
  // La primera campaña arranca en epoch para capturar cualquier comisión previa a
  // su startDate. NO se usa endDate para el corte (era fecha-sola y perdía el día).
  const balances: CampaignBalance[] = await Promise.all(
    campaigns.map(async (c, i) => {
      const windowStart = i === 0 ? new Date(0) : campaigns[i].startDate;
      const nextStart = i < campaigns.length - 1 ? campaigns[i + 1].startDate : null;
      const agg = await db.influencerAttribution.aggregate({
        where: {
          organizationId,
          influencerId: creatorId,
          createdAt: nextStart ? { gte: windowStart, lt: nextStart } : { gte: windowStart },
        },
        _sum: { commissionAmount: true },
      });
      const earned = round2(Number(agg._sum.commissionAmount || 0));
      const paid = round2(paidMap.get(c.id) || 0);
      const pending = round2(Math.max(0, earned - paid));
      return {
        campaignId: c.id,
        name: c.name,
        status: c.status,
        isAlwaysOn: c.isAlwaysOn ?? false,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate ? c.endDate.toISOString() : null,
        attributionWindowDays: c.attributionWindowDays ?? null,
        earned,
        paid,
        pending,
      };
    }),
  );

  // Acreditar pagos PAID SIN campaña (card mensual / manual sin tag) FIFO sobre el
  // pendiente restante (campaña más vieja primero — `balances` ya viene ordenado por
  // startDate asc). Antes se ignoraban → un pago no linkeado no saldaba nada. Ahora
  // ningún pago queda sin aplicar y el total == ganado − TODO lo pagado.
  const unlinkedAgg = await db.payout.aggregate({
    where: { organizationId, influencerId: creatorId, status: "PAID", campaignId: null },
    _sum: { amount: true },
  });
  let unlinked = round2(Number(unlinkedAgg._sum.amount || 0));
  for (const b of balances) {
    if (unlinked <= 0) break;
    const take = round2(Math.min(b.pending, unlinked));
    if (take > 0) {
      b.paid = round2(b.paid + take);
      b.pending = round2(b.pending - take);
      unlinked = round2(unlinked - take);
    }
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

export type SettlePayoutLine = {
  campaignId: string | null;
  concept: string;
  amount: number;
  periodStart: Date;
  periodEnd: Date;
};

/**
 * Arma las FILAS de payout a crear al registrar un pago (settle), con la parte
 * que tiene LÓGICA. El route completa lo constante (org, creador, método, etc.).
 *
 * ⚠️ DOS FIXES DE PLATA (auditoría 2026-07-22):
 *
 *  1. periodStart/periodEnd derivan del MES del `paidAt`. Antes se creaban en
 *     NULL, y la card mensual del creador (GET .../payments) filtra y bucketea
 *     por periodStart → un pago por campaña quedaba INVISIBLE ahí (mostraba
 *     "pagado: 0") mientras el saldo por campaña sí lo contaba. Dos pantallas
 *     del mismo creador, dos respuestas de "cuánto le pagué". Setear el mes NO
 *     afecta el saldo por campaña (computeCreatorBalances agrupa por campaignId,
 *     no por período).
 *
 *  2. La plata que SOBRA (leftover, cuando se paga más que el pendiente) se
 *     registra como un payout SIN campaña ("pago a cuenta"), en vez de
 *     descartarse en silencio. Ese pago se acredita FIFO sobre comisiones
 *     FUTURAS (computeCreatorBalances ya lo hace con los payouts campaignId=null)
 *     → es exactamente un pago por adelantado, y la plata nunca desaparece.
 */
export function buildSettlePayoutLines(
  allocations: FifoAllocation[],
  leftover: number,
  paidAt: Date,
): SettlePayoutLine[] {
  const { start: periodStart, end: periodEnd } = monthRange(toPeriodMonth(paidAt));
  const lines: SettlePayoutLine[] = allocations.map((a) => ({
    campaignId: a.campaignId,
    concept: `Pago comisión — ${a.name}`,
    amount: a.amount,
    periodStart,
    periodEnd,
  }));
  if (round2(leftover) > 0) {
    lines.push({
      campaignId: null,
      concept: "Pago a cuenta (saldo a favor)",
      amount: round2(leftover),
      periodStart,
      periodEnd,
    });
  }
  return lines;
}
