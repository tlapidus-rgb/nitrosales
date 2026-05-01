// ══════════════════════════════════════════════════════════════
// /api/me/manual-spend — Manual Channel Spend (S60)
// ══════════════════════════════════════════════════════════════
// GET  → lista de spends manuales de la org del user logueado
// POST → crear nuevo (body: { channel, fromDate, toDate, amount, note? })
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const orgId = await getOrganizationId();
    const list = await prisma.manualChannelSpend.findMany({
      where: { organizationId: orgId },
      orderBy: [{ channel: "asc" }, { fromDate: "desc" }],
    });
    return NextResponse.json({
      ok: true,
      list: list.map((m) => ({
        id: m.id,
        channel: m.channel,
        fromDate: m.fromDate.toISOString(),
        toDate: m.toDate.toISOString(),
        amount: Number(m.amount),
        note: m.note || null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const orgId = await getOrganizationId();
    const body = await req.json();
    const channel = String(body.channel || "").trim().toLowerCase();
    const fromDate = body.fromDate ? new Date(body.fromDate) : null;
    const toDate = body.toDate ? new Date(body.toDate) : null;
    const amount = Number(body.amount);
    const note = body.note ? String(body.note).slice(0, 500) : null;

    if (!channel) return NextResponse.json({ error: "channel requerido" }, { status: 400 });
    if (!fromDate || isNaN(fromDate.getTime())) return NextResponse.json({ error: "fromDate invalido" }, { status: 400 });
    if (!toDate || isNaN(toDate.getTime())) return NextResponse.json({ error: "toDate invalido" }, { status: 400 });
    if (toDate < fromDate) return NextResponse.json({ error: "toDate debe ser >= fromDate" }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "amount debe ser > 0" }, { status: 400 });

    const created = await prisma.manualChannelSpend.create({
      data: {
        organizationId: orgId,
        channel,
        fromDate,
        toDate,
        amount,
        note,
      },
    });

    return NextResponse.json({
      ok: true,
      item: {
        id: created.id,
        channel: created.channel,
        fromDate: created.fromDate.toISOString(),
        toDate: created.toDate.toISOString(),
        amount: Number(created.amount),
        note: created.note,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
