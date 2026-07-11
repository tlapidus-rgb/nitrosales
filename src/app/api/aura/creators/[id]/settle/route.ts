export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Registrar un pago con asignación FIFO (Bloque D · items 15/24)
// ══════════════════════════════════════════════════════════════
// POST /api/aura/creators/[id]/settle
// body: {
//   amount: number,               // monto pagado (obligatorio, > 0)
//   method?: string,              // TRANSFER | CASH | ...
//   reference?: string,
//   paidAt?: ISO,
//   campaignIds?: string[],       // si viene, solo salda esas campañas (igual FIFO)
// }
//
// Toma el monto y lo reparte sobre las campañas con saldo pendiente, de más
// vieja a más nueva (FIFO). Cada asignación crea un Payout PAID linkeado a la
// campaña. Atómico: recalcula el saldo DENTRO de la transacción para no pagar
// de más si hubo otro registro en el medio.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { computeCreatorBalances, allocateFifo } from "@/lib/aura/campaign-balance";

const ALLOWED_METHODS = ["TRANSFER", "CASH", "MERCADOPAGO", "CRYPTO", "PRODUCT", "OTHER"];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount debe ser > 0" }, { status: 400 });
    }
    const method: string | null = body.method || null;
    if (method && !ALLOWED_METHODS.includes(method)) {
      return NextResponse.json({ error: "method inválido" }, { status: 400 });
    }
    const reference: string | null = body.reference || null;
    const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
    const campaignIds: string[] | undefined = Array.isArray(body.campaignIds)
      ? body.campaignIds.filter((x: unknown) => typeof x === "string")
      : undefined;

    const creator = await prisma.influencer.findFirst({
      where: { id: params.id, organizationId: org.id },
      select: { id: true },
    });
    if (!creator) {
      return NextResponse.json({ error: "Creador no encontrado" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Recalcular DENTRO del tx: el saldo es la fuente de verdad al momento de pagar.
      const balances = await computeCreatorBalances(tx, org.id, creator.id);
      // (isolationLevel Serializable abajo — fix review #4: evita doble pago si
      //  dos registros concurrentes leen el mismo saldo.)
      const { allocations, allocated, leftover } = allocateFifo(
        balances.campaigns,
        amount,
        campaignIds,
      );

      if (allocations.length === 0) {
        return { created: 0, allocations, allocated, leftover, totalPendingBefore: balances.totalPending };
      }

      await tx.payout.createMany({
        data: allocations.map((a) => ({
          organizationId: org.id,
          influencerId: creator.id,
          campaignId: a.campaignId,
          concept: `Pago comisión — ${a.name}`,
          amount: a.amount,
          currency: "ARS",
          status: "PAID",
          method,
          reference,
          paidAt,
          periodStart: null,
          periodEnd: null,
        })),
      });

      return { created: allocations.length, allocations, allocated, leftover, totalPendingBefore: balances.totalPending };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[aura/creators/[id]/settle] error:", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
