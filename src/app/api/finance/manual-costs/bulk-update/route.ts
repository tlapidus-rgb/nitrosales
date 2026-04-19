// ═══════════════════════════════════════════════════════════════════
// /api/finance/manual-costs/bulk-update
// ═══════════════════════════════════════════════════════════════════
// Fase 3d — Bulk edit de costos manuales.
//
// Permite aplicar la misma operacion a multiples costos en una sola
// llamada (updateMany scoped por organizationId + ids). Sirve para:
//   - Aplicar aumento porcentual a un set de costos (ej: +30% a todo
//     Equipo y RRHH por paritaria).
//   - Cambiar la taxonomia behavior en masa (ej: marcar 5 items como
//     SEMI_FIXED).
//   - Cambiar la fiscal type en masa.
//   - Activar/desactivar autoInflationAdjust en lote.
//
// Body shape:
//   {
//     ids: string[],                // IDs de ManualCost a afectar
//     operation: {
//       type: "percentage_increase" | "set_amount" | "set_behavior"
//           | "set_fiscal_type" | "set_auto_inflation",
//       value: number | string | boolean
//     }
//   }
//
// Todas las ops son idempotentes respecto al payload (mismo input ->
// misma salida). La unica excepcion es percentage_increase, que aplica
// sobre el amount actual — si se llama 2 veces con 10%, resulta
// multiplicado 1.10 * 1.10 = 1.21x.
//
// Seguridad:
//   - Auth por cookie (getOrganizationId)
//   - updateMany con scope { organizationId, id in ids } — imposible
//     que un usuario afecte costos de otra org aunque mande IDs de otra.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

const BEHAVIORS = ["FIXED", "VARIABLE", "SEMI_FIXED"] as const;
const FISCAL_TYPES = [
  "DEDUCTIBLE_WITH_IVA",
  "DEDUCTIBLE_NO_IVA",
  "NON_DEDUCTIBLE",
] as const;

type OperationType =
  | "percentage_increase"
  | "set_amount"
  | "set_behavior"
  | "set_fiscal_type"
  | "set_auto_inflation";

export async function POST(req: NextRequest) {
  try {
    const organizationId = await getOrganizationId();
    if (!organizationId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const { ids, operation } = body ?? {};

    // ── Validacion de inputs ──────────────────────────────
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids debe ser un array con al menos un ID" },
        { status: 400 }
      );
    }
    if (ids.length > 500) {
      return NextResponse.json(
        { error: "maximo 500 IDs por llamada" },
        { status: 400 }
      );
    }
    if (!operation || typeof operation !== "object") {
      return NextResponse.json(
        { error: "operation requerida" },
        { status: 400 }
      );
    }

    const opType = operation.type as OperationType;
    const opValue = operation.value;

    // ── Verificar que los IDs son de la org ──────────────
    // (updateMany ya scope-a, pero devolvemos count exacto)
    const matching = await prisma.manualCost.findMany({
      where: { organizationId, id: { in: ids } },
      select: { id: true, amount: true },
    });
    if (matching.length === 0) {
      return NextResponse.json(
        { error: "Ningun ID coincide con la organizacion" },
        { status: 404 }
      );
    }

    // ── Ejecutar operacion ────────────────────────────────
    switch (opType) {
      case "percentage_increase": {
        const pct = Number(opValue);
        if (!Number.isFinite(pct) || pct <= -100) {
          return NextResponse.json(
            { error: "percentage invalido (> -100)" },
            { status: 400 }
          );
        }
        const factor = 1 + pct / 100;
        // No hay updateMany con "set amount = amount * factor", entonces
        // hacemos un loop en una transaccion para mantener atomicidad.
        // Con 500 rows max y un factor simple, es aceptable.
        const updated = await prisma.$transaction(
          matching.map((m) =>
            prisma.manualCost.update({
              where: { id: m.id },
              data: {
                amount: Number((Number(m.amount) * factor).toFixed(2)),
              },
            })
          )
        );
        return NextResponse.json({
          ok: true,
          operation: opType,
          updated: updated.length,
          factor,
        });
      }

      case "set_amount": {
        const amt = Number(opValue);
        if (!Number.isFinite(amt) || amt < 0) {
          return NextResponse.json(
            { error: "amount invalido (>= 0)" },
            { status: 400 }
          );
        }
        const result = await prisma.manualCost.updateMany({
          where: { organizationId, id: { in: ids } },
          data: { amount: amt },
        });
        return NextResponse.json({
          ok: true,
          operation: opType,
          updated: result.count,
        });
      }

      case "set_behavior": {
        if (!BEHAVIORS.includes(opValue as any)) {
          return NextResponse.json(
            { error: `behavior invalido. Validos: ${BEHAVIORS.join(", ")}` },
            { status: 400 }
          );
        }
        const result = await prisma.manualCost.updateMany({
          where: { organizationId, id: { in: ids } },
          data: { behavior: opValue as string },
        });
        return NextResponse.json({
          ok: true,
          operation: opType,
          updated: result.count,
        });
      }

      case "set_fiscal_type": {
        if (!FISCAL_TYPES.includes(opValue as any)) {
          return NextResponse.json(
            { error: `fiscalType invalido. Validos: ${FISCAL_TYPES.join(", ")}` },
            { status: 400 }
          );
        }
        const result = await prisma.manualCost.updateMany({
          where: { organizationId, id: { in: ids } },
          data: { fiscalType: opValue as string },
        });
        return NextResponse.json({
          ok: true,
          operation: opType,
          updated: result.count,
        });
      }

      case "set_auto_inflation": {
        const flag = Boolean(opValue);
        const result = await prisma.manualCost.updateMany({
          where: { organizationId, id: { in: ids } },
          data: { autoInflationAdjust: flag },
        });
        return NextResponse.json({
          ok: true,
          operation: opType,
          updated: result.count,
        });
      }

      default:
        return NextResponse.json(
          { error: `operation.type desconocida: ${opType}` },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
