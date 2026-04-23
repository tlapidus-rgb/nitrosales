// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/email-log/for-email?email=X
// ══════════════════════════════════════════════════════════════
// Devuelve los ultimos emails enviados a un destinatario especifico.
// Usado por el drawer del onboarding para mostrar el estado de
// cada email (con su resendId, error si hubo, timestamp).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const email = url.searchParams.get("email");
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT "id","subject","context","ok","resendId","errorMessage","durationMs","createdAt"
       FROM "email_log"
       WHERE LOWER("toEmail") = LOWER($1)
       ORDER BY "createdAt" DESC
       LIMIT 50`,
      email
    );
    return NextResponse.json({ ok: true, rows });
  } catch (error: any) {
    // Tabla no existe aún
    if (String(error?.message || "").includes("email_log")) {
      return NextResponse.json({ ok: true, rows: [], hint: "Tabla email_log no migrada aún" });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
