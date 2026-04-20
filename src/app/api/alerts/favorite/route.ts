// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/alerts/favorite — Fase 8e
// ═══════════════════════════════════════════════════════════════════
// POST  { alertId }  -> marca alerta como favorita
// DELETE ?alertId=X  -> quita favorita
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { randomUUID } from "crypto";
import { getSessionUserId } from "@/lib/alerts/get-user-id";

export const dynamic = "force-dynamic";

const getUserId = getSessionUserId;

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const alertId = String(body?.alertId ?? "").trim();
    if (!alertId) {
      return NextResponse.json({ error: "alertId requerido" }, { status: 400 });
    }

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "user_alert_favorites" ("id", "userId", "alertId", "createdAt")
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT ("userId", "alertId") DO NOTHING`,
      id,
      userId,
      alertId
    );

    return NextResponse.json({ ok: true, favorited: true });
  } catch (error: any) {
    console.error("[/api/alerts/favorite POST] error:", error);
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
      `DELETE FROM "user_alert_favorites" WHERE "userId" = $1 AND "alertId" = $2`,
      userId,
      alertId
    );

    return NextResponse.json({ ok: true, favorited: false });
  } catch (error: any) {
    console.error("[/api/alerts/favorite DELETE] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
