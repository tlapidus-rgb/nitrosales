// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/alerts/read — Fase 8e fix
// ═══════════════════════════════════════════════════════════════════
// POST   { alertId }       -> marca una alerta como leida por el user
// POST   { alertIds: [] }  -> marca varias (bulk)
// DELETE ?alertId=X        -> vuelve a marcar como no leida
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { randomUUID } from "crypto";
import { getSessionUserId } from "@/lib/alerts/get-user-id";

export const dynamic = "force-dynamic";

const getUserId = getSessionUserId;

// GET: diagnostico — cuantas filas tiene el user en user_alert_reads
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "No autenticado", userId: null }, { status: 401 });
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "user_alert_reads" WHERE "userId" = $1`,
      userId
    );
    const count = Number(rows?.[0]?.count ?? 0);

    // Primeras 5 filas como muestra
    const sample = await prisma.$queryRawUnsafe<Array<{ alertId: string; readAt: Date }>>(
      `SELECT "alertId", "readAt" FROM "user_alert_reads" WHERE "userId" = $1 ORDER BY "readAt" DESC LIMIT 5`,
      userId
    );

    return NextResponse.json({
      ok: true,
      userId,
      totalReads: count,
      recentReads: sample,
    });
  } catch (error: any) {
    console.error("[/api/alerts/read GET] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.alertIds)
      ? body.alertIds
      : body?.alertId
      ? [body.alertId]
      : [];

    const clean = ids.map((s) => String(s).trim()).filter(Boolean);
    if (clean.length === 0) {
      return NextResponse.json(
        { error: "alertId o alertIds requerido" },
        { status: 400 }
      );
    }

    // Bulk insert con ON CONFLICT DO NOTHING
    for (const alertId of clean) {
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "user_alert_reads" ("id", "userId", "alertId", "readAt")
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT ("userId", "alertId") DO NOTHING`,
        id,
        userId,
        alertId
      );
    }

    return NextResponse.json({ ok: true, count: clean.length });
  } catch (error: any) {
    console.error("[/api/alerts/read POST] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const alertId = url.searchParams.get("alertId")?.trim();
    if (!alertId) {
      return NextResponse.json({ error: "alertId requerido" }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `DELETE FROM "user_alert_reads" WHERE "userId" = $1 AND "alertId" = $2`,
      userId,
      alertId
    );

    return NextResponse.json({ ok: true, read: false });
  } catch (error: any) {
    console.error("[/api/alerts/read DELETE] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
