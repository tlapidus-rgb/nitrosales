import { describe, it, expect } from "vitest";
import {
  allocateFifo,
  computeCreatorBalances,
  buildSettlePayoutLines,
} from "./campaign-balance";
import { toPeriodMonth } from "./payout-period";

const c = (id: string, pending: number) => ({ campaignId: id, name: id, pending });

// Mock mínimo de Prisma para computeCreatorBalances: el aggregate respeta el
// filtro createdAt {gte, lt} para simular las ventanas.
function makeDb(
  campaigns: Array<{ id: string; name: string; status: string; startDate: Date; endDate: Date | null }>,
  attributions: Array<{ createdAt: Date; commissionAmount: number }>,
  paid: Array<{ campaignId: string; amount: number }>,
  unlinkedPaid = 0, // pagos PAID SIN campaignId (card mensual / manual)
) {
  const sorted = [...campaigns].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  return {
    influencerCampaign: {
      findMany: async () => sorted.map((c) => ({ ...c, isAlwaysOn: false })),
    },
    payout: {
      groupBy: async () => paid.map((p) => ({ campaignId: p.campaignId, _sum: { amount: p.amount } })),
      aggregate: async () => ({ _sum: { amount: unlinkedPaid } }),
    },
    influencerAttribution: {
      aggregate: async ({ where }: any) => {
        const gte = where.createdAt?.gte as Date | undefined;
        const lt = where.createdAt?.lt as Date | undefined;
        const sum = attributions
          .filter((a) => (!gte || a.createdAt >= gte) && (!lt || a.createdAt < lt))
          .reduce((s, a) => s + a.commissionAmount, 0);
        return { _sum: { commissionAmount: sum } };
      },
    },
  } as any;
}

const D = (day: number) => new Date(2026, 0, day);

describe("computeCreatorBalances — ventanas contiguas (fix review #1/#2/#5)", () => {
  it("no pierde comisiones del hueco entre una campaña finalizada y la siguiente", async () => {
    const db = makeDb(
      [
        { id: "A", name: "A", status: "COMPLETED", startDate: D(1), endDate: D(5) },
        { id: "B", name: "B", status: "ACTIVE", startDate: D(8), endDate: null },
      ],
      [
        { createdAt: D(3), commissionAmount: 100 }, // dentro de A
        { createdAt: D(6), commissionAmount: 50 }, // "hueco" (día 6, entre A finalizada y B)
        { createdAt: D(10), commissionAmount: 30 }, // dentro de B
      ],
      [],
    );
    const r = await computeCreatorBalances(db, "org", "creator");
    // A posee [epoch, inicio de B) → 100 + 50; B posee [inicio B, now) → 30
    expect(r.campaigns.find((x) => x.campaignId === "A")!.earned).toBe(150);
    expect(r.campaigns.find((x) => x.campaignId === "B")!.earned).toBe(30);
    // El ganado ventaneado suma EXACTO el lifetime (no se pierde el hueco).
    expect(r.totalEarned).toBe(180);
  });

  it("no cuenta doble aunque las campañas se solapen (data legacy)", async () => {
    const db = makeDb(
      [
        { id: "A", name: "A", status: "ACTIVE", startDate: D(1), endDate: D(20) },
        { id: "B", name: "B", status: "ACTIVE", startDate: D(10), endDate: D(30) },
      ],
      [{ createdAt: D(15), commissionAmount: 100 }], // cae en el rango solapado
      [],
    );
    const r = await computeCreatorBalances(db, "org", "creator");
    // Ventanas contiguas por startDate: A [epoch, D10), B [D10, now). La comisión
    // del día 15 va SOLO a B, no se cuenta en ambas.
    expect(r.totalEarned).toBe(100);
    expect(r.campaigns.find((x) => x.campaignId === "B")!.earned).toBe(100);
  });

  it("pendiente = ganado − pagado por campaña", async () => {
    const db = makeDb(
      [{ id: "A", name: "A", status: "ACTIVE", startDate: D(1), endDate: null }],
      [{ createdAt: D(3), commissionAmount: 100 }],
      [{ campaignId: "A", amount: 40 }],
    );
    const r = await computeCreatorBalances(db, "org", "creator");
    expect(r.totalEarned).toBe(100);
    expect(r.totalPaid).toBe(40);
    expect(r.totalPending).toBe(60);
  });

  it("acredita pagos SIN campaña FIFO (antes se ignoraban → 'lo pagué y sigue pendiente')", async () => {
    const db = makeDb(
      [
        { id: "A", name: "A", status: "COMPLETED", startDate: D(1), endDate: D(5) },
        { id: "B", name: "B", status: "ACTIVE", startDate: D(8), endDate: null },
      ],
      [
        { createdAt: D(3), commissionAmount: 100 }, // A
        { createdAt: D(10), commissionAmount: 50 }, // B
      ],
      [], // sin pagos linkeados a campaña
      120, // pago SIN campaña (card mensual) de $120
    );
    const r = await computeCreatorBalances(db, "org", "creator");
    // $120 FIFO (más vieja primero): A ($100 → saldada), B ($20 de $50 → quedan $30).
    expect(r.campaigns.find((x) => x.campaignId === "A")!.pending).toBe(0);
    expect(r.campaigns.find((x) => x.campaignId === "B")!.pending).toBe(30);
    expect(r.totalEarned).toBe(150);
    expect(r.totalPaid).toBe(120);
    expect(r.totalPending).toBe(30);
  });

  it("un pago que cubre todo lo ganado deja pendiente en 0 (sin importar el tag de campaña)", async () => {
    const db = makeDb(
      [{ id: "A", name: "A", status: "ACTIVE", startDate: D(1), endDate: null }],
      [{ createdAt: D(3), commissionAmount: 100 }],
      [], // nada linkeado
      100, // pago sin campaña que cubre todo
    );
    const r = await computeCreatorBalances(db, "org", "creator");
    expect(r.totalPending).toBe(0);
    expect(r.totalPaid).toBe(100);
  });
});

describe("allocateFifo — asignación FIFO de pagos por campaña (Bloque D)", () => {
  it("ejemplo de Tomy: 2 campañas de $25, pago $40 → vieja $25, siguiente $15", () => {
    const r = allocateFifo([c("c1", 25), c("c2", 25)], 40);
    expect(r.allocations).toEqual([
      { campaignId: "c1", name: "c1", amount: 25 },
      { campaignId: "c2", name: "c2", amount: 15 },
    ]);
    expect(r.allocated).toBe(40);
    expect(r.leftover).toBe(0);
  });

  it("paga exacto una sola campaña", () => {
    const r = allocateFifo([c("c1", 25), c("c2", 25)], 25);
    expect(r.allocations).toEqual([{ campaignId: "c1", name: "c1", amount: 25 }]);
    expect(r.leftover).toBe(0);
  });

  it("respeta el orden viejo→nuevo (candidates ya vienen ordenados)", () => {
    const r = allocateFifo([c("vieja", 10), c("nueva", 100)], 50);
    expect(r.allocations).toEqual([
      { campaignId: "vieja", name: "vieja", amount: 10 },
      { campaignId: "nueva", name: "nueva", amount: 40 },
    ]);
  });

  it("saltea campañas sin saldo pendiente", () => {
    const r = allocateFifo([c("saldada", 0), c("c2", 30)], 20);
    expect(r.allocations).toEqual([{ campaignId: "c2", name: "c2", amount: 20 }]);
  });

  it("pago mayor al total pendiente → allocated = total, leftover = sobrante", () => {
    const r = allocateFifo([c("c1", 25), c("c2", 25)], 80);
    expect(r.allocated).toBe(50);
    expect(r.leftover).toBe(30);
  });

  it("onlyCampaignIds: solo salda las seleccionadas, en orden viejo→nuevo", () => {
    const r = allocateFifo([c("c1", 25), c("c2", 25), c("c3", 25)], 100, ["c2", "c3"]);
    expect(r.allocations).toEqual([
      { campaignId: "c2", name: "c2", amount: 25 },
      { campaignId: "c3", name: "c3", amount: 25 },
    ]);
    expect(r.leftover).toBe(50);
  });

  it("montos con decimales redondean a 2", () => {
    const r = allocateFifo([c("c1", 33.33), c("c2", 33.33)], 50);
    expect(r.allocations[0].amount).toBe(33.33);
    expect(r.allocations[1].amount).toBe(16.67);
    expect(r.leftover).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// buildSettlePayoutLines — REGRESIÓN de dos bugs de plata (auditoría 2026-07-22)
// ══════════════════════════════════════════════════════════════════════════
// 1. Los pagos por campaña (/settle) nacían con periodStart NULL → invisibles en
//    la card mensual del creador (mostraba "pagado: 0"). Ahora derivan el mes
//    del paidAt.
// 2. El sobrante (pagar más que el pendiente) se descartaba en silencio. Ahora
//    se registra como un pago SIN campaña (a cuenta).
const alloc = (id: string, amount: number) => ({ campaignId: id, name: id, amount });

describe("buildSettlePayoutLines — mes del pago + registro del sobrante", () => {
  const paidAt = new Date(2026, 4, 20, 15, 0); // 20-may-2026, hora local

  it("BUG 1: cada payout lleva el mes del paidAt, NO null", () => {
    const lines = buildSettlePayoutLines([alloc("c1", 60)], 0, paidAt);
    expect(lines).toHaveLength(1);
    expect(lines[0].periodStart).not.toBeNull();
    expect(toPeriodMonth(lines[0].periodStart)).toBe("2026-05");
    // periodEnd es el fin del mismo mes.
    expect(toPeriodMonth(lines[0].periodEnd)).toBe("2026-05");
    expect(lines[0].campaignId).toBe("c1");
  });

  it("BUG 2: el sobrante se registra como pago SIN campaña", () => {
    // Pendiente 60, pagó 100 → allocations 60, leftover 40.
    const lines = buildSettlePayoutLines([alloc("c1", 60)], 40, paidAt);
    expect(lines).toHaveLength(2);
    const residual = lines.find((l) => l.campaignId === null);
    expect(residual).toBeTruthy();
    expect(residual!.amount).toBe(40);
    expect(residual!.concept).toMatch(/a cuenta/i);
    // La plata total registrada = lo pagado (60 + 40), nada se pierde.
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(100);
  });

  it("pagar sin ningún pendiente registra TODO como pago a cuenta", () => {
    // Sin campañas con saldo: allocations vacío, leftover = monto entero.
    const lines = buildSettlePayoutLines([], 100, paidAt);
    expect(lines).toHaveLength(1);
    expect(lines[0].campaignId).toBeNull();
    expect(lines[0].amount).toBe(100);
  });

  it("sin sobrante no crea residual", () => {
    const lines = buildSettlePayoutLines([alloc("c1", 25), alloc("c2", 15)], 0, paidAt);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.campaignId !== null)).toBe(true);
  });

  it("un leftover de centavos redondea a 0 y no crea residual basura", () => {
    const lines = buildSettlePayoutLines([alloc("c1", 60)], 0.004, paidAt);
    expect(lines).toHaveLength(1);
  });
});
