export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════
// Aura — Payout detail / update / delete
// ══════════════════════════════════════════════════════════════
// GET    /api/aura/payouts/[id]
// PATCH  /api/aura/payouts/[id]   → cambios de estado y campos
//   body: { status?, method?, reference?, proofUrl?, paidAt?,
//           amount?, concept?, notes?, periodStart?, periodEnd? }
// DELETE /api/aura/payouts/[id]   → solo si PENDING o CANCELLED
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/auth-guard";
import { prisma } from "@/lib/db/client";

const ALLOWED_STATUS = ["PENDING", "PAID", "CANCELLED"];
const ALLOWED_METHODS = ["TRANSFER", "CASH", "MERCADOPAGO", "CRYPTO", "PRODUCT", "OTHER"];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const org = await getOrganization(req);
    const payout = await prisma.payout.findFirst({
      where: { id: params.id, organizationId: org.id },
      include: {
        influencer: { select: { id: true, name: true, code: true, email: true, profileImage: true } },
        deal: { select: { id: true, name: true, type: true } },
        campaign: { select: { id: true, name: true } },
      },
    });
    if (!payout) return NextResponse.json({ error: "Payout no encontrado" }, { status: 404 });
    return NextResponse.json({ payout });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const org = await getOrganization(req);
    const existing = await prisma.payout.findFirst({
      where: { id: params.id, organizationId: org.id },
      select: { id: true, status: true },
    });
    if (!existing) return NextResponse.json({ error: "Payout no encontrado" }, { status: 404 });

    const body = await req.json();
    const data: any = {};

    if (body.status !== undefined) {
      if (!ALLOWED_STATUS.includes(body.status)) {
        return NextResponse.json({ error: "status inválido" }, { status: 400 });
      }
      data.status = body.status;
      // Si pasa a PAID y no mandaron paidAt, lo seteamos ahora
      if (body.status === "PAID") {
        data.paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
      }
      if (body.status === "PENDING") {
        // volver a pendiente limpia paidAt
        data.paidAt = null;
      }
    }
    if (body.method !== undefined) {
      if (body.method && !ALLOWED_METHODS.includes(body.method)) {
        return NextResponse.json({ error: "method inválido" }, { status: 400 });
      }
      data.method = body.method || null;
    }
    if (body.reference !== undefined) data.reference = body.reference || null;
    if (body.proofUrl !== undefined) data.proofUrl = body.proofUrl || null;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.concept !== undefined && typeof body.concept === "string" && body.concept.trim()) {
      data.concept = body.concept.trim();
    }
    if (body.amount !== undefined) {
      const n = Number(body.amount);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ error: "amount inválido" }, { status: 400 });
      }
      data.amount = n;
    }
    if (body.periodStart !== undefined) data.periodStart = body.periodStart ? new Date(body.periodStart) : null;
    if (body.periodEnd !== undefined) data.periodEnd = body.periodEnd ? new Date(body.periodEnd) : null;

    const updated = await prisma.payout.update({
      where: { id: params.id },
      data,
      include: {
        influencer: { select: { id: true, name: true, code: true } },
        deal: { select: { id: true, name: true, type: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ ok: true, payout: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const org = await getOrganization(req);
    const existing = await prisma.payout.findFirst({
      where: { id: params.id, organizationId: org.id },
      select: { status: true },
    });
    if (!existing) return NextResponse.json({ error: "Payout no encontrado" }, { status: 404 });
    if (existing.status === "PAID") {
      return NextResponse.json({ error: "No se puede eliminar un payout ya pagado. Cancelalo en su lugar." }, { status: 400 });
    }
    await prisma.payout.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
