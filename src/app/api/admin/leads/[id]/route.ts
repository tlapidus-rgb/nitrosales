// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// PATCH /api/admin/leads/[id] — actualizar lead
// DELETE /api/admin/leads/[id] — borrar lead
// ══════════════════════════════════════════════════════════════
// Acciones soportadas en PATCH (campos opcionales):
//   - markContacted: bool → setea status=CONTACTADO + lastContactedAt=now
//   - markEmailSent: bool → setea lastEmailSentAt=now
//   - notes, contactName, contactEmail, contactPhone, etc → update directo
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();

    const sets: string[] = [`"updatedAt" = NOW()`];
    const values: any[] = [id];
    let idx = 2;

    if (body.markContacted) {
      sets.push(`"status" = 'CONTACTADO'`);
      sets.push(`"lastContactedAt" = NOW()`);
    }
    if (body.markEmailSent) {
      sets.push(`"lastEmailSentAt" = NOW()`);
    }

    const editableFields = ["companyName", "contactName", "contactEmail", "contactPhone", "industry", "source", "notes"];
    for (const f of editableFields) {
      if (body[f] !== undefined) {
        sets.push(`"${f}" = $${idx++}`);
        values.push(body[f] === null || body[f] === "" ? null : String(body[f]).trim());
      }
    }
    if (body.estimatedMonthlyOrders !== undefined) {
      sets.push(`"estimatedMonthlyOrders" = $${idx++}`);
      values.push(body.estimatedMonthlyOrders ? Number(body.estimatedMonthlyOrders) : null);
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "leads" SET ${sets.join(", ")} WHERE "id" = $1`,
      ...values
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[admin/leads PATCH] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    await prisma.$executeRawUnsafe(`DELETE FROM "leads" WHERE "id" = $1`, id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
