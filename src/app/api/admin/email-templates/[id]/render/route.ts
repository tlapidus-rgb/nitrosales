// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/email-templates/[id]/render
// ══════════════════════════════════════════════════════════════
// Renderiza el template con datos sample y devuelve el HTML listo
// para embeber en un iframe srcDoc (para preview en vivo).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { renderTemplateFromRow } from "@/lib/onboarding/template-renderer";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const url = new URL(req.url);
    const contactName = url.searchParams.get("contactName") || "Juan";
    const companyName = url.searchParams.get("companyName") || "Arredo";

    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "email_templates" WHERE "id" = $1 LIMIT 1`,
      id
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Template no encontrado" }, { status: 404 });
    }

    const { subject, html } = renderTemplateFromRow(rows[0], { contactName, companyName });

    return NextResponse.json({ ok: true, subject, html });
  } catch (error: any) {
    console.error("[admin/email-templates/render] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
