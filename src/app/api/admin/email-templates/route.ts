// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/email-templates
// ══════════════════════════════════════════════════════════════
// Lista todos los templates agrupados por flowStage y stageOrder.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "email_templates" ORDER BY "flowStage", "stageOrder", "templateKey", "variant"`
    );

    return NextResponse.json({ ok: true, templates: rows });
  } catch (error: any) {
    console.error("[admin/email-templates GET] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
