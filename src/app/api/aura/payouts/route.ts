export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Crear un payout
// ══════════════════════════════════════════════════════════════
// POST /api/aura/payouts
// body: { influencerId, concept, amount, currency?, dealId?, campaignId?,
//         periodStart?, periodEnd?, notes? }
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";
import { isValidPeriodMonth, monthRange } from "@/lib/aura/payout-period";

const ALLOWED_METHODS = ["TRANSFER", "CASH", "MERCADOPAGO", "CRYPTO", "PRODUCT", "OTHER"];

export async function POST(req: NextRequest) {
  try {
    const org = await getOrganization(req);
    const body = await req.json();

    const influencerId: string = body.influencerId;
    const concept: string = (body.concept || "").trim();
    const amount = Number(body.amount);
    const currency: string = body.currency || "ARS";
    const dealId: string | null = body.dealId || null;
    const campaignId: string | null = body.campaignId || null;
    const notes: string | null = body.notes || null;

    // Lote 2B (Pieza 2): un pago se REGISTRA (nace PAID), atado a un mes, monto libre.
    // periodMonth ("YYYY-MM") deriva periodStart/periodEnd → no requiere columna nueva.
    // markPaid (o status PAID / paidAt presente) = es un registro de pago ya hecho.
    const periodMonth: string | null = isValidPeriodMonth(body.periodMonth) ? body.periodMonth : null;
    let periodStartDate: Date | null = body.periodStart ? new Date(body.periodStart) : null;
    let periodEndDate: Date | null = body.periodEnd ? new Date(body.periodEnd) : null;
    if (periodMonth) {
      const r = monthRange(periodMonth);
      periodStartDate = r.start;
      periodEndDate = r.end;
    }

    const markPaid = body.markPaid === true || body.status === "PAID" || body.paidAt != null;
    const method: string | null = body.method || null;
    if (method && !ALLOWED_METHODS.includes(method)) {
      return NextResponse.json({ error: "method inválido" }, { status: 400 });
    }
    const reference: string | null = body.reference || null;

    if (!influencerId) return NextResponse.json({ error: "influencerId requerido" }, { status: 400 });
    if (!concept) return NextResponse.json({ error: "concept requerido" }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount debe ser > 0" }, { status: 400 });
    }

    // Validar ownership del influencer
    const inf = await prisma.influencer.findFirst({
      where: { id: influencerId, organizationId: org.id },
      select: { id: true },
    });
    if (!inf) return NextResponse.json({ error: "Influencer no encontrado" }, { status: 404 });

    // Validar deal/campaign si vienen
    if (dealId) {
      const deal = await prisma.influencerDeal.findFirst({
        where: { id: dealId, organizationId: org.id },
        select: { id: true },
      });
      if (!deal) return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });
    }
    if (campaignId) {
      const camp = await prisma.influencerCampaign.findFirst({
        where: { id: campaignId, organizationId: org.id },
        select: { id: true },
      });
      if (!camp) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
    }

    const created = await prisma.payout.create({
      data: {
        organizationId: org.id,
        influencerId,
        concept,
        amount,
        currency,
        dealId,
        campaignId,
        periodStart: periodStartDate,
        periodEnd: periodEndDate,
        notes,
        method,
        reference,
        // Registro de pago → nace PAID con paidAt. Sin registro → PENDING (compat).
        status: markPaid ? "PAID" : "PENDING",
        paidAt: markPaid ? (body.paidAt ? new Date(body.paidAt) : new Date()) : null,
      },
      include: {
        influencer: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json({ ok: true, payout: created });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
