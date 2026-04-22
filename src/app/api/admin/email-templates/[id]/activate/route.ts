// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/email-templates/[id]/activate
// ══════════════════════════════════════════════════════════════
// Marca una variante como activa. Desactiva las otras del mismo
// templateKey (solo puede haber 1 activa por key).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "templateKey" FROM "email_templates" WHERE "id" = $1 LIMIT 1`,
      id
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Template no encontrado" }, { status: 404 });
    }
    const templateKey = rows[0].templateKey;

    // Desactivar todas las del mismo key
    await prisma.$executeRawUnsafe(
      `UPDATE "email_templates" SET "isActive" = false, "updatedAt" = NOW() WHERE "templateKey" = $1`,
      templateKey
    );
    // Activar esta
    await prisma.$executeRawUnsafe(
      `UPDATE "email_templates" SET "isActive" = true, "updatedAt" = NOW() WHERE "id" = $1`,
      id
    );

    return NextResponse.json({ ok: true, activated: id, templateKey });
  } catch (error: any) {
    console.error("[admin/email-templates/activate] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
