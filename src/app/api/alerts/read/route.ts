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
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

const getUserId = getSessionUserId;

// Valida ownership de un alertId (ver /api/alerts/favorite para detalles)
async function validateAlertOwnership(
  alertId: string,
  userId: string,
  orgId: string
): Promise<boolean> {
  if (alertId.startsWith("rule.")) {
    const parts = alertId.split(".");
    if (parts.length >= 2) {
      const ruleId = parts[1];
      try {
        const rule = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id" FROM "alert_rules" WHERE "id" = $1 AND "organizationId" = $2 AND "userId" = $3 LIMIT 1`,
          ruleId,
          orgId,
          userId
        );
        return rule && rule.length > 0;
      } catch {
        return false;
      }
    }
  }
  return true; // Prefijos nativos — scoped en el hub GET
}

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
    const orgId = await getOrganizationId();

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

    // Bulk insert con ON CONFLICT DO NOTHING + ownership check
    let skipped = 0;
    for (const alertId of clean) {
      const owns = await validateAlertOwnership(alertId, userId, orgId);
      if (!owns) {
        skipped++;
        continue;
      }
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

    return NextResponse.json({ ok: true, count: clean.length - skipped, skipped });
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
