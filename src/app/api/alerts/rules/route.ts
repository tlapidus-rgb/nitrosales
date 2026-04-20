// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/alerts/rules — Fase 8g-1
// ═══════════════════════════════════════════════════════════════════
// GET    list rules del user
// POST   { primitiveKey, name, params, channels, cooldownMinutes, severity, schedule }
//        -> create
// PATCH  { id, updates }  -> update (toggle, edit)
// DELETE ?id=X            -> delete
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { randomUUID } from "crypto";
import { getSessionUserId } from "@/lib/alerts/get-user-id";
import { getOrganizationId } from "@/lib/auth-guard";
import { getPrimitive, listPrimitives } from "@/lib/alerts/primitives";
import { computeNextFireAt } from "@/lib/alerts/engine";

export const dynamic = "force-dynamic";

// GET: lista las rules del user logueado + catalog de primitivas disponibles
export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    const orgId = await getOrganizationId();
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const includeCatalog = url.searchParams.get("includeCatalog") === "1";

    const rules = await prisma
      .$queryRawUnsafe<any[]>(
        `SELECT * FROM "alert_rules"
         WHERE "organizationId" = $1 AND "userId" = $2
         ORDER BY "createdAt" DESC`,
        orgId,
        userId
      )
      .catch(() => []);

    const response: any = { rules };

    if (includeCatalog) {
      const catalog = listPrimitives().map((p) => ({
        key: p.key,
        type: p.type,
        module: p.module,
        submodule: p.submodule,
        label: p.label,
        description: p.description,
        defaultSeverity: p.defaultSeverity,
        defaultChannels: p.defaultChannels,
        defaultCooldownMinutes: p.defaultCooldownMinutes,
        paramsSchema: p.paramsSchema,
        naturalExamples: p.naturalExamples,
      }));
      response.catalog = catalog;
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[/api/alerts/rules GET] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

// POST: crea una nueva rule
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    const orgId = await getOrganizationId();
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const primitiveKey = String(body.primitiveKey ?? "").trim();
    if (!primitiveKey) {
      return NextResponse.json({ error: "primitiveKey requerido" }, { status: 400 });
    }

    const primitive = getPrimitive(primitiveKey);
    if (!primitive) {
      return NextResponse.json(
        { error: `Primitiva desconocida: ${primitiveKey}` },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const name = String(body.name ?? primitive.label);
    const type = primitive.type;
    const params = body.params ?? {};
    const operator = body.operator ?? null;
    const schedule = body.schedule ?? null;
    const channels = Array.isArray(body.channels) ? body.channels : primitive.defaultChannels;
    const cooldown = Number(body.cooldownMinutes ?? primitive.defaultCooldownMinutes);
    const severity = String(body.severity ?? primitive.defaultSeverity);
    const nextFireAt = type === "schedule" ? computeNextFireAt(schedule) : null;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "alert_rules"
        ("id", "organizationId", "userId", "name", "type", "primitiveKey",
         "params", "operator", "schedule", "channels", "cooldownMinutes",
         "severity", "enabled", "nextFireAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb,
               $10, $11, $12, TRUE, $13, NOW(), NOW())`,
      id,
      orgId,
      userId,
      name,
      type,
      primitiveKey,
      JSON.stringify(params),
      operator ? JSON.stringify(operator) : null,
      schedule ? JSON.stringify(schedule) : null,
      channels,
      cooldown,
      severity,
      nextFireAt
    );

    return NextResponse.json({ ok: true, id });
  } catch (error: any) {
    console.error("[/api/alerts/rules POST] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

// PATCH: update rule (toggle enabled, edit params, etc.)
export async function PATCH(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    const orgId = await getOrganizationId();
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const fields = [
      "name",
      "params",
      "operator",
      "schedule",
      "channels",
      "cooldownMinutes",
      "severity",
      "enabled",
    ] as const;

    for (const f of fields) {
      if (body[f] !== undefined) {
        if (f === "params" || f === "operator" || f === "schedule") {
          updates.push(`"${f}" = $${idx}::jsonb`);
          values.push(JSON.stringify(body[f]));
        } else {
          updates.push(`"${f}" = $${idx}`);
          values.push(body[f]);
        }
        idx++;
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ ok: true, noChange: true });
    }

    updates.push(`"updatedAt" = NOW()`);
    values.push(id, orgId, userId);

    await prisma.$executeRawUnsafe(
      `UPDATE "alert_rules" SET ${updates.join(", ")}
       WHERE "id" = $${idx} AND "organizationId" = $${idx + 1} AND "userId" = $${idx + 2}`,
      ...values
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[/api/alerts/rules PATCH] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

// DELETE: elimina rule
export async function DELETE(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    const orgId = await getOrganizationId();
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }
    await prisma.$executeRawUnsafe(
      `DELETE FROM "alert_rules"
       WHERE "id" = $1 AND "organizationId" = $2 AND "userId" = $3`,
      id,
      orgId,
      userId
    );
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[/api/alerts/rules DELETE] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
