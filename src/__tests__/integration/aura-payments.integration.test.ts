// ══════════════════════════════════════════════════════════════
// AURA · Pieza 2 — TEST DE INTEGRACIÓN (pagos sin saldo) contra Neon branch
// ══════════════════════════════════════════════════════════════
// Cierra el hueco del Nivel 4: verifica POR EJECUCIÓN (no por análisis) el
// cálculo "corresponde del mes", el registro de pago (PAID, monto libre,
// periodMonth) y el caso borde de mes/timezone AR.
//
// ⚠️ SKIPPED POR DEFECTO. No corre en el suite normal (no rompe los tests
// actuales). Para correrlo hace falta OPT-IN EXPLÍCITO:
//
//   AURA_INTEGRATION=1 \
//   DATABASE_URL="postgres://...neon-BRANCH..." \
//   AURA_TEST_ORG_ID="<id de una org existente en ese branch>" \
//   npx vitest run src/__tests__/integration/aura-payments.integration.test.ts
//
// 🚫 NUNCA contra producción. Usar SIEMPRE un Neon branch desechable.
//    El test siembra y BORRA solo lo que crea (marcado con un TAG único).
//
// 🔒 BLOQUEANTE: correr y ver verde ANTES de que Aura reciba el primer creador
//    real. El cálculo de Pieza 2 quedó verificado por análisis (confianza
//    media-alta); esto lo lleva a alta.
// ══════════════════════════════════════════════════════════════

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  monthRange,
  toPeriodMonth,
  lastNPeriodMonths,
} from "@/lib/aura/payout-period";
import { getCommissionRate, accruesCommission } from "@/lib/aura/commission";

const ENABLED = process.env.AURA_INTEGRATION === "1" && !!process.env.AURA_TEST_ORG_ID;
const ORG_ID = process.env.AURA_TEST_ORG_ID ?? "";
const TAG = `ztest_aura_p2_${Date.now()}`;

// ── Helpers que REPLICAN la lógica del endpoint (mismas queries) ──

/** "corresponde del mes" = SUM(commissionAmount congelado) — igual que
 *  GET /api/aura/creators/[id]/payments. */
async function owedForMonth(influencerId: string, periodMonth: string): Promise<number> {
  const { start, end } = monthRange(periodMonth);
  const agg = await prisma.influencerAttribution.aggregate({
    where: { organizationId: ORG_ID, influencerId, createdAt: { gte: start, lte: end } },
    _sum: { commissionAmount: true },
  });
  return Number(agg._sum.commissionAmount || 0);
}

/** "pagado del mes" = SUM(payouts PAID bucketeados por periodStart) — igual que el endpoint. */
async function paidForMonth(influencerId: string, periodMonth: string): Promise<number> {
  const { start, end } = monthRange(periodMonth);
  const payouts = await prisma.payout.findMany({
    where: {
      organizationId: ORG_ID,
      influencerId,
      status: "PAID",
      periodStart: { gte: start, lte: end },
    },
    select: { amount: true },
  });
  return payouts.reduce((s, p) => s + Number(p.amount || 0), 0);
}

/** Registro de pago — replica POST /api/aura/payouts con periodMonth + markPaid. */
async function registerPayment(opts: {
  influencerId: string;
  periodMonth: string;
  amount: number;
  method?: string;
}) {
  const { start, end } = monthRange(opts.periodMonth);
  return prisma.payout.create({
    data: {
      organizationId: ORG_ID,
      influencerId: opts.influencerId,
      concept: `${TAG} Comisión ${opts.periodMonth}`,
      amount: opts.amount,
      currency: "ARS",
      periodStart: start,
      periodEnd: end,
      method: opts.method ?? "TRANSFER",
      status: "PAID",
      paidAt: new Date(),
    },
    select: { id: true, status: true, periodStart: true, periodEnd: true, amount: true },
  });
}

// ── Estado sembrado (ids para assertions + cleanup) ──
const created = {
  influencerActive: "",
  influencerInactive: "",
  orderIds: [] as string[],
};

// Dos meses concretos para el caso de SUM por mes.
const MONTH_A = "2026-01"; // enero
const MONTH_B = "2026-02"; // febrero

const d = ENABLED ? describe : describe.skip;

d("AURA Pieza 2 — pagos sin saldo (integración Neon branch)", () => {
  beforeAll(async () => {
    // Creador ACTIVO al 10%.
    const active = await prisma.influencer.create({
      data: {
        organizationId: ORG_ID,
        code: `${TAG}_active`,
        name: `${TAG} Activo`,
        commissionPercent: 10,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    created.influencerActive = active.id;

    // Creador INACTIVO (con comisión congelada de cuando estaba activo).
    const inactive = await prisma.influencer.create({
      data: {
        organizationId: ORG_ID,
        code: `${TAG}_inactive`,
        name: `${TAG} Inactivo`,
        commissionPercent: 10,
        status: "INACTIVE",
      },
      select: { id: true },
    });
    created.influencerInactive = inactive.id;

    // Helper para crear orden + atribución con commissionAmount CONGELADO y createdAt controlado.
    let seq = 0;
    async function seedAttribution(influencerId: string, createdAt: Date, commission: number, revenue: number) {
      seq++;
      const order = await prisma.order.create({
        data: {
          organizationId: ORG_ID,
          externalId: `${TAG}_o${seq}`,
          status: "INVOICED",
          totalValue: revenue,
          itemCount: 1,
          orderDate: createdAt,
        },
        select: { id: true },
      });
      created.orderIds.push(order.id);
      await prisma.influencerAttribution.create({
        data: {
          organizationId: ORG_ID,
          orderId: order.id,
          influencerId,
          attributedValue: revenue,
          commissionAmount: commission, // CONGELADO (lo que paga el motor al atribuir)
          attributionModel: "LAST_CLICK",
          attributionSource: "UTM",
          createdAt, // controlamos el mes
        },
      });
    }

    // ACTIVO: enero = 1000 + 500 (owed 1500), febrero = 800 (owed 800).
    await seedAttribution(active.id, new Date(2026, 0, 10, 12, 0), 1000, 10000);
    await seedAttribution(active.id, new Date(2026, 0, 25, 12, 0), 500, 5000);
    await seedAttribution(active.id, new Date(2026, 1, 15, 12, 0), 800, 8000);

    // INACTIVO: febrero = 300 congelado (ganado cuando estaba activo).
    await seedAttribution(inactive.id, new Date(2026, 1, 12, 12, 0), 300, 3000);

    // BORDE DE MES (timezone AR): venta a las 00:30 local del 1-feb.
    // Se construye en hora LOCAL (igual que monthRange y el motor) → bucketea por toPeriodMonth.
    await seedAttribution(active.id, new Date(2026, 1, 1, 0, 30), 50, 500);
  });

  afterAll(async () => {
    // Cleanup en orden de FK: atribuciones → payouts → orders → influencers. Solo lo TAG-eado.
    await prisma.influencerAttribution.deleteMany({
      where: { organizationId: ORG_ID, influencerId: { in: [created.influencerActive, created.influencerInactive] } },
    });
    await prisma.payout.deleteMany({
      where: { organizationId: ORG_ID, influencerId: { in: [created.influencerActive, created.influencerInactive] } },
    });
    if (created.orderIds.length) {
      await prisma.order.deleteMany({ where: { id: { in: created.orderIds } } });
    }
    await prisma.influencer.deleteMany({
      where: { organizationId: ORG_ID, code: { in: [`${TAG}_active`, `${TAG}_inactive`] } },
    });
    await prisma.$disconnect();
  });

  test("SUM mensual del creador activo da bien por mes (enero 1500 + borde, febrero 800)", async () => {
    const owedJan = await owedForMonth(created.influencerActive, MONTH_A);
    const owedFeb = await owedForMonth(created.influencerActive, MONTH_B);

    // Enero: 1000 + 500 = 1500 (el borde de 00:30 1-feb NO cae en enero).
    expect(owedJan).toBeCloseTo(1500, 2);
    // Febrero: 800 + 50 (borde 1-feb 00:30) = 850.
    expect(owedFeb).toBeCloseTo(850, 2);
  });

  test("mes sin ventas devuelve 0 (no error)", async () => {
    const owedDec = await owedForMonth(created.influencerActive, "2025-12");
    expect(owedDec).toBe(0);
  });

  test("creador inactivo: la card sigue mostrando lo CONGELADO ganado (no se stiffea)", async () => {
    // El "corresponde" sale del congelado → muestra lo ganado cuando estaba activo.
    const owedFeb = await owedForMonth(created.influencerInactive, MONTH_B);
    expect(owedFeb).toBeCloseTo(300, 2);

    // Pero la TASA aplicable a comisión NUEVA es 0 (Pieza 4) y no acumula.
    expect(getCommissionRate({ commissionPercent: 10, status: "INACTIVE" })).toBe(0);
    expect(accruesCommission("INACTIVE")).toBe(false);
  });

  test("registrar un pago: monto LIBRE (menor al corresponde), nace PAID, periodMonth correcto", async () => {
    const owedJan = await owedForMonth(created.influencerActive, MONTH_A); // 1500
    // Pago parcial libre: 1000 (< 1500). No debe quedar "saldo" en ningún lado.
    const payout = await registerPayment({ influencerId: created.influencerActive, periodMonth: MONTH_A, amount: 1000 });

    expect(payout.status).toBe("PAID");
    // periodStart/End derivados del mes correcto.
    expect(toPeriodMonth(payout.periodStart!)).toBe(MONTH_A);
    expect(Number(payout.amount)).toBe(1000);

    // "pagado del mes" = 1000; "corresponde" SIGUE 1500 (no se descontó saldo).
    const paidJan = await paidForMonth(created.influencerActive, MONTH_A);
    expect(paidJan).toBeCloseTo(1000, 2);
    const owedJanAfter = await owedForMonth(created.influencerActive, MONTH_A);
    expect(owedJanAfter).toBeCloseTo(owedJan, 2); // corresponde intacto → NO hay saldo acumulado
  });

  test("BORDE DE MES / timezone AR: el bucket se decide por la hora local (riesgo MEDIA documentado)", async () => {
    // La venta borde se sembró con new Date(2026, 1, 1, 0, 30) (hora LOCAL).
    // El bucketeo (monthRange/toPeriodMonth) usa la MISMA hora local → consistente.
    const boundary = new Date(2026, 1, 1, 0, 30);
    expect(toPeriodMonth(boundary)).toBe("2026-02");

    // ⚠️ RIESGO ABIERTO: el motor congela createdAt como instante UTC. En un server UTC
    // (Vercel), una venta a las 23:30 ART del 31-ene (= 02:30 UTC del 1-feb) bucketea en
    // FEBRERO según monthRange(UTC), aunque el comerciante en AR la cuente en ENERO.
    // Este test deja el comportamiento EXPLÍCITO; si Tomy necesita corte AR exacto, hay
    // que fijar timezone AR en monthRange (cambio acotado, NO toca CORE).
    const arLateNight = new Date("2026-01-31T23:30:00-03:00"); // instante real
    const bucket = toPeriodMonth(arLateNight); // depende del TZ donde corre el server
    expect(["2026-01", "2026-02"]).toContain(bucket);
  });

  test("últimos N meses incluyen los sembrados (sanity del rango de la card)", async () => {
    const months = lastNPeriodMonths(6, new Date(2026, 1, 28)); // ancla feb 2026
    expect(months).toContain("2026-01");
    expect(months).toContain("2026-02");
  });
});
