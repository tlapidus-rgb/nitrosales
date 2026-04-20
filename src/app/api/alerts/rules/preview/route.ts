// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/alerts/rules/preview — Fase 8g-2
// ═══════════════════════════════════════════════════════════════════
// GET ?id=<ruleId>
// Ejecuta la primitiva de una regla AHORA MISMO ignorando cooldown y
// nextFireAt, y devuelve el resultado de la evaluación (cómo se vería
// la alerta) sin actualizar ningún timestamp en la DB.
//
// Útil para:
//   - Probar reglas tipo "schedule" sin esperar al horario configurado
//   - Validar que la primitiva levanta los datos correctos
//   - Que Tomy pueda ver el reporte sin esperar al cron de mañana
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/alerts/get-user-id";
import { getOrganizationId } from "@/lib/auth-guard";
import { getPrimitive } from "@/lib/alerts/primitives";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    const orgId = await getOrganizationId();
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id requerido (query param)" }, { status: 400 });
    }

    // Cargar la regla y verificar ownership
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "alert_rules"
        WHERE "id" = $1 AND "organizationId" = $2 AND "userId" = $3
        LIMIT 1`,
      id,
      orgId,
      userId
    );
    const rule = rows[0];
    if (!rule) {
      return NextResponse.json({ error: `Regla no encontrada o no es tuya: ${id}` }, { status: 404 });
    }

    const primitive = getPrimitive(rule.primitiveKey);
    if (!primitive) {
      return NextResponse.json(
        { error: `Primitiva desconocida: ${rule.primitiveKey}` },
        { status: 400 }
      );
    }

    // Evaluar AHORA MISMO sin tocar timestamps
    const result = await primitive.evaluate({
      orgId,
      userId,
      params: rule.params ?? {},
      now: new Date(),
      lastFiredAt: null, // ignorar cooldown para preview
    });

    return NextResponse.json({
      ok: true,
      rule: {
        id: rule.id,
        name: rule.name,
        primitiveKey: rule.primitiveKey,
        type: rule.type,
        schedule: rule.schedule,
        params: rule.params,
      },
      preview: {
        triggered: result.triggered,
        severity: result.severity ?? primitive.defaultSeverity,
        title: result.title ?? primitive.label,
        body: result.body ?? "(sin cuerpo)",
        metadata: result.metadata ?? {},
        ctaHref: result.ctaHref ?? null,
        cta: result.cta ?? null,
      },
      nota: result.triggered
        ? "✓ La regla SÍ dispararía ahora con estos datos."
        : "⚠ La regla NO dispararía ahora (la condición no se cumple, o no hay datos suficientes).",
    });
  } catch (error: any) {
    console.error("[/api/alerts/rules/preview] error:", error);
    return NextResponse.json(
      { error: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
