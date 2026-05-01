// ══════════════════════════════════════════════════════════════
// /api/me/manual-spend/[id] — Editar / Borrar (S60)
// ══════════════════════════════════════════════════════════════
// PATCH  → editar campos { channel?, fromDate?, toDate?, amount?, note? }
// DELETE → borrar
// Solo permite operar sobre spends de la org del user logueado.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

async function loadOwn(id: string, orgId: string) {
  return prisma.manualChannelSpend.findFirst({
    where: { id, organizationId: orgId },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const orgId = await getOrganizationId();
    const existing = await loadOwn(id, orgId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const data: any = {};

    if (body.channel !== undefined) {
      const ch = String(body.channel).trim().toLowerCase();
      if (!ch) return NextResponse.json({ error: "channel invalido" }, { status: 400 });
      data.channel = ch;
    }
    if (body.fromDate !== undefined) {
      const d = new Date(body.fromDate);
      if (isNaN(d.getTime())) return NextResponse.json({ error: "fromDate invalido" }, { status: 400 });
      data.fromDate = d;
    }
    if (body.toDate !== undefined) {
      const d = new Date(body.toDate);
      if (isNaN(d.getTime())) return NextResponse.json({ error: "toDate invalido" }, { status: 400 });
      data.toDate = d;
    }
    if (body.amount !== undefined) {
      const n = Number(body.amount);
      if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: "amount debe ser > 0" }, { status: 400 });
      data.amount = n;
    }
    if (body.note !== undefined) {
      data.note = body.note ? String(body.note).slice(0, 500) : null;
    }

    // Validacion cruzada de fechas si ambas cambian o si una solo
    const newFrom = data.fromDate ?? existing.fromDate;
    const newTo = data.toDate ?? existing.toDate;
    if (newTo < newFrom) return NextResponse.json({ error: "toDate debe ser >= fromDate" }, { status: 400 });

    const updated = await prisma.manualChannelSpend.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      ok: true,
      item: {
        id: updated.id,
        channel: updated.channel,
        fromDate: updated.fromDate.toISOString(),
        toDate: updated.toDate.toISOString(),
        amount: Number(updated.amount),
        note: updated.note,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const orgId = await getOrganizationId();
    const existing = await loadOwn(id, orgId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.manualChannelSpend.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
