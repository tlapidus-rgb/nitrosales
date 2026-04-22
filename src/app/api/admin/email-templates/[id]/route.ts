// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// PUT /api/admin/email-templates/[id]
// ══════════════════════════════════════════════════════════════
// Edita un template. Fields editables: subject, preheader, eyebrow,
// heroTop, heroAccent, subParagraphs, ctaLabel, finePrint.
// Los no-editables (id, templateKey, variant, label, flowStage,
// stageOrder, trigger, isActive) se ignoran si vienen.
//
// POST /api/admin/email-templates/[id]/activate
// ══════════════════════════════════════════════════════════════
// Marca una variante como activa. Desactiva las otras del mismo
// templateKey (solo puede haber 1 activa por key).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();

    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "id" FROM "email_templates" WHERE "id" = $1 LIMIT 1`,
      id
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Template no encontrado" }, { status: 404 });
    }

    // Solo estos campos son editables
    const updates: Record<string, any> = {};
    if (typeof body.subject === "string") updates.subject = body.subject;
    if (typeof body.preheader === "string") updates.preheader = body.preheader;
    if ("eyebrow" in body) updates.eyebrow = body.eyebrow || null;
    if ("heroTop" in body) updates.heroTop = body.heroTop || null;
    if ("heroAccent" in body) updates.heroAccent = body.heroAccent || null;
    if (Array.isArray(body.subParagraphs)) {
      updates.subParagraphs = body.subParagraphs.filter((p: any) => typeof p === "string" && p.trim());
    }
    if ("ctaLabel" in body) updates.ctaLabel = body.ctaLabel || null;
    if ("finePrint" in body) updates.finePrint = body.finePrint || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Ningún campo editable en el body" }, { status: 400 });
    }

    // Build dynamic SET clause
    const setParts: string[] = [];
    const values: any[] = [];
    let i = 1;
    for (const [key, val] of Object.entries(updates)) {
      if (key === "subParagraphs") {
        setParts.push(`"${key}" = $${i}::jsonb`);
        values.push(JSON.stringify(val));
      } else {
        setParts.push(`"${key}" = $${i}`);
        values.push(val);
      }
      i++;
    }
    setParts.push(`"updatedAt" = NOW()`);
    values.push(id);

    await prisma.$executeRawUnsafe(
      `UPDATE "email_templates" SET ${setParts.join(", ")} WHERE "id" = $${i}`,
      ...values
    );

    return NextResponse.json({ ok: true, updated: Object.keys(updates) });
  } catch (error: any) {
    console.error("[admin/email-templates PUT] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
