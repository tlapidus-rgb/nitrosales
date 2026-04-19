import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * Manual Costs CRUD API
 *
 * GET    ?month=2025-03          → list costs for a month
 * POST   { category, name, amount, type, month, notes? }  → create
 * PUT    { id, amount?, name?, notes?, category? }         → update
 * DELETE ?id=xxx                 → delete
 *
 * Optional: POST with copyFrom=2025-02 copies all FIXED costs from that month
 *
 * Fase 3 — campos nuevos expuestos:
 *   - fiscalType           ("DEDUCTIBLE_WITH_IVA" | "DEDUCTIBLE_NO_IVA" | "NON_DEDUCTIBLE")
 *   - behavior             ("FIXED" | "VARIABLE" | "SEMI_FIXED" | null)
 *   - driverFormula        (JSON DSL para rate type DRIVER_BASED)
 *   - autoInflationAdjust  (boolean)
 */

// ── Fase 3 — valores válidos para nuevos campos ────────
const FISCAL_TYPES = [
  "DEDUCTIBLE_WITH_IVA",
  "DEDUCTIBLE_NO_IVA",
  "NON_DEDUCTIBLE",
] as const;

const BEHAVIORS = ["FIXED", "VARIABLE", "SEMI_FIXED"] as const;

const RATE_TYPES = [
  "FIXED_MONTHLY",
  "PER_SHIPMENT",
  "PERCENTAGE",
  "DRIVER_BASED",
] as const;

// Valida estructura mínima del DSL del driverFormula.
// Shape: { drivers: [{key,label,value,unit?}], formula, lastComputedAmount?, lastComputedAt? }
function validateDriverFormula(raw: unknown): {
  ok: boolean;
  error?: string;
  value?: Record<string, unknown>;
} {
  if (raw === null || raw === undefined) return { ok: true, value: undefined };
  if (typeof raw !== "object") {
    return { ok: false, error: "driverFormula debe ser un objeto JSON" };
  }
  const obj = raw as Record<string, unknown>;
  const drivers = obj.drivers;
  if (!Array.isArray(drivers) || drivers.length === 0) {
    return { ok: false, error: "driverFormula.drivers debe ser un array no vacío" };
  }
  for (const d of drivers) {
    if (!d || typeof d !== "object") {
      return { ok: false, error: "cada driver debe ser objeto" };
    }
    const dd = d as Record<string, unknown>;
    if (typeof dd.key !== "string" || !dd.key.trim()) {
      return { ok: false, error: "driver.key requerido (string)" };
    }
    if (typeof dd.label !== "string") {
      return { ok: false, error: "driver.label requerido (string)" };
    }
    if (typeof dd.value !== "number" || !Number.isFinite(dd.value)) {
      return { ok: false, error: `driver.value inválido para ${dd.key}` };
    }
  }
  if (typeof obj.formula !== "string" || !obj.formula.trim()) {
    return { ok: false, error: "driverFormula.formula requerida (string)" };
  }
  return { ok: true, value: obj };
}

// ── Valid categories ──────────────────────────
const CATEGORIES = [
  "LOGISTICA",
  "EQUIPO",
  "PLATAFORMAS",
  "FISCAL",
  "INFRAESTRUCTURA",
  "MARKETING",
  "MERMA",
  "OTROS",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  LOGISTICA: "Logistica y Envios",
  EQUIPO: "Equipo y RRHH",
  PLATAFORMAS: "Plataformas y Herramientas",
  FISCAL: "Fiscal e Impuestos",
  INFRAESTRUCTURA: "Infraestructura",
  MARKETING: "Marketing y Contenido",
  MERMA: "Merma y Perdidas",
  OTROS: "Otros",
};

// ── GET: List costs for a month ───────────────
export async function GET(req: NextRequest) {
  const orgId = await getOrganizationId();
  const { searchParams } = req.nextUrl;
  const month = searchParams.get("month");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: "month param required (format: YYYY-MM)" },
      { status: 400 }
    );
  }

  try {
    // Optional category filter
    const categoryFilter = searchParams.get("category");

    const costs = await prisma.manualCost.findMany({
      where: {
        organizationId: orgId,
        month,
        ...(categoryFilter && { category: categoryFilter }),
      },
      orderBy: [{ category: "asc" }, { subcategory: "asc" }, { name: "asc" }],
    });

    // Group by category
    const grouped: Record<string, typeof costs> = {};
    for (const cat of CATEGORIES) {
      grouped[cat] = [];
    }
    for (const cost of costs) {
      if (!grouped[cost.category]) grouped[cost.category] = [];
      grouped[cost.category].push(cost);
    }

    // Calculate totals (for EQUIPO: amount × (1 + socialCharges/100))
    const categoryTotals = Object.entries(grouped).map(([cat, items]) => ({
      category: cat,
      label: CATEGORY_LABELS[cat] || cat,
      total: items.reduce((sum, c) => {
        const base = Number(c.amount);
        if (c.socialCharges) return sum + base * (1 + c.socialCharges / 100);
        return sum + base;
      }, 0),
      items,
    }));

    const grandTotal = categoryTotals.reduce((sum, c) => sum + c.total, 0);

    // Fase 3 — resumen Fijo vs Variable vs SEMI_FIXED para el header
    // Prioridad: behavior (nuevo) > type legacy (si behavior null).
    // SEMI_FIXED cae al bucket "variable" para el ratio simple.
    const summary = { fixed: 0, variable: 0, semiFixed: 0 };
    for (const cat of categoryTotals) {
      for (const c of cat.items) {
        const base = Number(c.amount);
        const effectiveAmount = c.socialCharges
          ? base * (1 + c.socialCharges / 100)
          : base;
        const eff = (c as any).behavior ?? c.type ?? "FIXED";
        if (eff === "VARIABLE") summary.variable += effectiveAmount;
        else if (eff === "SEMI_FIXED") summary.semiFixed += effectiveAmount;
        else summary.fixed += effectiveAmount;
      }
    }

    return NextResponse.json({
      month,
      categories: categoryTotals,
      grandTotal: Math.round(grandTotal),
      categoryLabels: CATEGORY_LABELS,
      summary: {
        fixed: Math.round(summary.fixed),
        variable: Math.round(summary.variable),
        semiFixed: Math.round(summary.semiFixed),
      },
    });
  } catch (error: any) {
    console.error("Manual costs GET error:", error);
    return NextResponse.json(
      { error: "Error fetching costs", details: error.message },
      { status: 500 }
    );
  }
}

// ── POST: Create a cost (or copy from previous month) ──
export async function POST(req: NextRequest) {
  const orgId = await getOrganizationId();
  const body = await req.json();

  try {
    // Copy from previous month
    if (body.copyFrom && body.targetMonth) {
      const sourceCosts = await prisma.manualCost.findMany({
        where: {
          organizationId: orgId,
          month: body.copyFrom,
          type: "FIXED", // Only copy fixed/recurring costs
        },
      });

      if (sourceCosts.length === 0) {
        return NextResponse.json(
          { error: `No hay costos fijos en ${body.copyFrom}` },
          { status: 404 }
        );
      }

      // ── Fase 3e — Ajuste por IPC opcional ────────────────
      // Si `adjustByInflation: true` viene en el body, solo afecta a los
      // items que tienen autoInflationAdjust=true. Factor:
      //   factor = ipcAcumulado(targetMonth) / ipcAcumulado(sourceMonth)
      // Si faltan datos de IPC o el factor es <= 0, hacemos copy plano y
      // devolvemos ipcAdjusted: 0 con una nota.
      let ipcFactor = 1;
      let ipcApplied = false;
      let ipcMessage: string | null = null;
      if (body.adjustByInflation) {
        try {
          const sourceDate = new Date(`${body.copyFrom}-01T00:00:00Z`);
          const targetDate = new Date(`${body.targetMonth}-01T00:00:00Z`);
          const [src, tgt] = await Promise.all([
            prisma.inflationIndexMonthly.findFirst({
              where: { month: sourceDate },
            }),
            prisma.inflationIndexMonthly.findFirst({
              where: { month: targetDate },
            }),
          ]);
          const srcAcc = src?.ipcAcumulado ? Number(src.ipcAcumulado) : null;
          const tgtAcc = tgt?.ipcAcumulado ? Number(tgt.ipcAcumulado) : null;
          if (srcAcc && tgtAcc && srcAcc > 0 && tgtAcc >= srcAcc) {
            ipcFactor = tgtAcc / srcAcc;
            ipcApplied = true;
          } else {
            ipcMessage = "Sin datos de IPC suficientes — copy sin ajuste";
          }
        } catch (e) {
          ipcMessage = "Error consultando IPC — copy sin ajuste";
        }
      }

      let ipcAdjustedCount = 0;

      const created = await prisma.$transaction(
        sourceCosts.map((c) => {
          const shouldAdjust = ipcApplied && c.autoInflationAdjust;
          const newAmount = shouldAdjust
            ? Number((Number(c.amount) * ipcFactor).toFixed(2))
            : c.amount;
          if (shouldAdjust) ipcAdjustedCount += 1;
          // Nota pedagogica: agregamos al notes existente la marca de ajuste
          // IPC para auditoria posterior.
          const adjustedNote = shouldAdjust
            ? `[IPC ${Math.round((ipcFactor - 1) * 100 * 10) / 10}% aplicado — ${body.copyFrom} → ${body.targetMonth}]`
            : "";
          const mergedNotes = shouldAdjust
            ? [c.notes, adjustedNote].filter(Boolean).join(" ")
            : c.notes;
          return prisma.manualCost.create({
            data: {
              organizationId: orgId,
              category: c.category,
              subcategory: c.subcategory,
              name: c.name,
              serviceCode: c.serviceCode,
              amount: newAmount,
              rateType: c.rateType,
              rateBase: c.rateBase,
              socialCharges: c.socialCharges,
              type: c.type,
              month: body.targetMonth,
              notes: mergedNotes,
              // Fase 3 — preservar taxonomía al copiar
              fiscalType: c.fiscalType,
              behavior: c.behavior,
              driverFormula: c.driverFormula ?? undefined,
              autoInflationAdjust: c.autoInflationAdjust,
            },
          });
        })
      );

      return NextResponse.json({
        copied: created.length,
        month: body.targetMonth,
        ipcAdjusted: ipcAdjustedCount,
        ipcFactor: ipcApplied ? Number(ipcFactor.toFixed(4)) : null,
        ipcMessage,
      });
    }

    // Create single cost
    const { category, name, amount, type, month, notes,
            subcategory, serviceCode, rateType, rateBase, socialCharges,
            // Fase 3 — nuevos campos
            fiscalType, behavior, driverFormula, autoInflationAdjust } = body;

    if (!category || !name || amount === undefined || !month) {
      return NextResponse.json(
        { error: "category, name, amount, and month are required" },
        { status: 400 }
      );
    }

    if (!CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Valid: ${CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    // Fase 3 — validaciones de campos nuevos
    if (rateType && !RATE_TYPES.includes(rateType)) {
      return NextResponse.json(
        { error: `Invalid rateType. Valid: ${RATE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (fiscalType && !FISCAL_TYPES.includes(fiscalType)) {
      return NextResponse.json(
        { error: `Invalid fiscalType. Valid: ${FISCAL_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (behavior && !BEHAVIORS.includes(behavior)) {
      return NextResponse.json(
        { error: `Invalid behavior. Valid: ${BEHAVIORS.join(", ")}` },
        { status: 400 }
      );
    }
    const dfCheck = validateDriverFormula(driverFormula);
    if (!dfCheck.ok) {
      return NextResponse.json(
        { error: `driverFormula inválida: ${dfCheck.error}` },
        { status: 400 }
      );
    }
    if (rateType === "DRIVER_BASED" && !dfCheck.value) {
      return NextResponse.json(
        { error: "rateType DRIVER_BASED requiere driverFormula" },
        { status: 400 }
      );
    }

    const cost = await prisma.manualCost.create({
      data: {
        organizationId: orgId,
        category,
        subcategory: subcategory || null,
        name,
        serviceCode: serviceCode || null,
        amount: parseFloat(amount),
        rateType: rateType || "FIXED_MONTHLY",
        rateBase: rateBase || null,
        socialCharges: socialCharges !== undefined ? parseFloat(socialCharges) : null,
        type: type || "FIXED",
        month,
        notes: notes || null,
        // Fase 3 — nuevos campos (defaults razonables si no vienen)
        fiscalType: fiscalType || "DEDUCTIBLE_WITH_IVA",
        behavior: behavior || null,
        // Prisma tipa JSON input de forma estricta; casteamos porque ya
        // validamos la estructura con validateDriverFormula().
        driverFormula: (dfCheck.value ?? undefined) as any,
        autoInflationAdjust: Boolean(autoInflationAdjust),
      },
    });

    return NextResponse.json(cost);
  } catch (error: any) {
    console.error("Manual costs POST error:", error);
    return NextResponse.json(
      { error: "Error creating cost", details: error.message },
      { status: 500 }
    );
  }
}

// ── PUT: Update a cost ────────────────────────
export async function PUT(req: NextRequest) {
  const orgId = await getOrganizationId();
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    // Verify ownership
    const existing = await prisma.manualCost.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Cost not found" }, { status: 404 });
    }

    // Fase 3 — validar campos nuevos si vienen en el update
    if (updates.rateType !== undefined && !RATE_TYPES.includes(updates.rateType)) {
      return NextResponse.json(
        { error: `Invalid rateType. Valid: ${RATE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (updates.fiscalType !== undefined && !FISCAL_TYPES.includes(updates.fiscalType)) {
      return NextResponse.json(
        { error: `Invalid fiscalType. Valid: ${FISCAL_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (
      updates.behavior !== undefined &&
      updates.behavior !== null &&
      !BEHAVIORS.includes(updates.behavior)
    ) {
      return NextResponse.json(
        { error: `Invalid behavior. Valid: ${BEHAVIORS.join(", ")} or null` },
        { status: 400 }
      );
    }
    let dfValidated: Record<string, unknown> | undefined | null = undefined;
    if (updates.driverFormula !== undefined) {
      if (updates.driverFormula === null) {
        dfValidated = null;
      } else {
        const check = validateDriverFormula(updates.driverFormula);
        if (!check.ok) {
          return NextResponse.json(
            { error: `driverFormula inválida: ${check.error}` },
            { status: 400 }
          );
        }
        dfValidated = check.value;
      }
    }

    const cost = await prisma.manualCost.update({
      where: { id },
      data: {
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.amount !== undefined && { amount: parseFloat(updates.amount) }),
        ...(updates.category !== undefined && { category: updates.category }),
        ...(updates.subcategory !== undefined && { subcategory: updates.subcategory }),
        ...(updates.serviceCode !== undefined && { serviceCode: updates.serviceCode }),
        ...(updates.rateType !== undefined && { rateType: updates.rateType }),
        ...(updates.rateBase !== undefined && { rateBase: updates.rateBase }),
        ...(updates.socialCharges !== undefined && { socialCharges: updates.socialCharges !== null ? parseFloat(updates.socialCharges) : null }),
        ...(updates.type !== undefined && { type: updates.type }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        // Fase 3 — campos nuevos
        ...(updates.fiscalType !== undefined && { fiscalType: updates.fiscalType }),
        ...(updates.behavior !== undefined && { behavior: updates.behavior }),
        ...(dfValidated !== undefined && {
          // Prisma tipa JSON input de forma estricta; casteamos porque
          // ya validamos la estructura con validateDriverFormula().
          driverFormula: (dfValidated === null ? null : dfValidated) as any,
        }),
        ...(updates.autoInflationAdjust !== undefined && {
          autoInflationAdjust: Boolean(updates.autoInflationAdjust),
        }),
      },
    });

    return NextResponse.json(cost);
  } catch (error: any) {
    console.error("Manual costs PUT error:", error);
    return NextResponse.json(
      { error: "Error updating cost", details: error.message },
      { status: 500 }
    );
  }
}

// ── DELETE: Remove a cost ─────────────────────
export async function DELETE(req: NextRequest) {
  const orgId = await getOrganizationId();
  const { searchParams } = req.nextUrl;
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id param required" }, { status: 400 });
  }

  try {
    // Verify ownership
    const existing = await prisma.manualCost.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Cost not found" }, { status: 404 });
    }

    await prisma.manualCost.delete({ where: { id } });

    return NextResponse.json({ deleted: true });
  } catch (error: any) {
    console.error("Manual costs DELETE error:", error);
    return NextResponse.json(
      { error: "Error deleting cost", details: error.message },
      { status: 500 }
    );
  }
}
