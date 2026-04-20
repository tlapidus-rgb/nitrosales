// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/alerts/favorite — Fase 8e + Multi-tenant S53 BP-MT-002
// ═══════════════════════════════════════════════════════════════════
// POST  { alertId }  -> marca alerta como favorita (scopeado a org)
// DELETE ?alertId=X  -> quita favorita
//
// Multi-tenant safe: la tabla user_alert_favorites ahora tiene columna
// organizationId. El UNIQUE es (userId, alertId, organizationId). Esto
// garantiza que un user de Org A no pueda marcar como favorita una
// alerta de Org B aunque conozca el alertId.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { randomUUID } from "crypto";
import { getSessionUserId } from "@/lib/alerts/get-user-id";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

const getUserId = getSessionUserId;

// Verifica ownership del alertId en base al prefijo:
// - "rule.<ruleId>.*": valida que la rule sea de la org/user
// - otros prefijos (fiscal, finanzas, ml, system, etc): son nativos del hub,
//   inherentemente scoped a la org del user que hace GET /api/alerts.
async function validateAlertOwnership(
  alertId: string,
  userId: string,
  orgId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
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
        if (!rule || rule.length === 0) {
          return { ok: false, status: 403, error: "Alert rule no pertenece a tu organización" };
        }
      } catch {
        return { ok: false, status: 500, error: "Error validando ownership" };
      }
    }
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const orgId = await getOrganizationId();

    const body = await req.json().catch(() => ({}));
    const alertId = String(body?.alertId ?? "").trim();
    if (!alertId) {
      return NextResponse.json({ error: "alertId requerido" }, { status: 400 });
    }

    // Ownership check (defense in depth para rule-based alerts)
    const own = await validateAlertOwnership(alertId, userId, orgId);
    if (!own.ok) {
      return NextResponse.json({ error: own.error }, { status: own.status });
    }

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "user_alert_favorites" ("id", "userId", "alertId", "organizationId", "createdAt")
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT ("userId", "alertId", "organizationId") DO NOTHING`,
      id,
      userId,
      alertId,
      orgId
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
    const orgId = await getOrganizationId();

    const url = new URL(req.url);
    const alertId = url.searchParams.get("alertId")?.trim();
    if (!alertId) {
      return NextResponse.json({ error: "alertId requerido" }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `DELETE FROM "user_alert_favorites" WHERE "userId" = $1 AND "alertId" = $2 AND "organizationId" = $3`,
      userId,
      alertId,
      orgId
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
