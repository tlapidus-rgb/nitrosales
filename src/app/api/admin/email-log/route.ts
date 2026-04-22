// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/email-log
// ══════════════════════════════════════════════════════════════
// Lista los últimos 100 intentos de envío de email (ok + fail).
// Query params opcionales:
//   ?only=failed → solo fallos
//   ?to=email@... → filtrar por destinatario
//   ?limit=50
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
    const only = url.searchParams.get("only");
    const to = url.searchParams.get("to");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);

    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (only === "failed") {
      conditions.push(`"ok" = false`);
    }
    if (to) {
      conditions.push(`"toEmail" ILIKE $${i++}`);
      params.push(`%${to}%`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(limit);
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM "email_log" ${whereClause}
       ORDER BY "createdAt" DESC
       LIMIT $${i}`,
      ...params
    );

    // Stats básicas
    const stats: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         COUNT(*)::int AS "total",
         SUM(CASE WHEN "ok" THEN 1 ELSE 0 END)::int AS "ok",
         SUM(CASE WHEN NOT "ok" THEN 1 ELSE 0 END)::int AS "failed"
       FROM "email_log"
       WHERE "createdAt" > NOW() - INTERVAL '7 days'`
    );

    return NextResponse.json({
      ok: true,
      rows,
      stats7d: stats[0] || { total: 0, ok: 0, failed: 0 },
    });
  } catch (error: any) {
    // Si la tabla no existe → devolver estado vacío con hint
    if (String(error?.message || "").includes("email_log")) {
      return NextResponse.json({
        ok: true,
        rows: [],
        stats7d: { total: 0, ok: 0, failed: 0 },
        hint: "Tabla email_log no existe aún. Ejecutá POST /api/admin/migrate-email-log desde el banner en /control/onboardings.",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
