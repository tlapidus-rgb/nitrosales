// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-manualcost-fase3
// ═══════════════════════════════════════════════════════════════════
// Fase 3 — Costos pro. Agrega 4 columnas nuevas a `manual_costs`
// para soportar: clasificacion fiscal, taxonomia de comportamiento
// (fijo/variable/semifijo), fórmula driver-based, y ajuste IPC
// automático al copiar al mes siguiente.
//
// Columnas agregadas (todas nullable / con default seguro):
//   - fiscalType          VARCHAR(32) DEFAULT 'DEDUCTIBLE_WITH_IVA'
//                         ('DEDUCTIBLE_WITH_IVA' | 'DEDUCTIBLE_NO_IVA' | 'NON_DEDUCTIBLE')
//   - behavior            VARCHAR(16)  — 'FIXED' | 'VARIABLE' | 'SEMI_FIXED'
//                         null = inferir desde `type` legacy (no pisa nada)
//   - driverFormula       JSONB nullable — DSL: { drivers: [{key,label,value}], formula: "..." }
//                         solo tiene sentido con rateType='DRIVER_BASED'
//   - autoInflationAdjust BOOLEAN DEFAULT FALSE — si true, al copiar al mes
//                         siguiente suma el IPC mensual al amount
//
// Extension del check de rateType: se agrega 'DRIVER_BASED' como valor
// valido (se usa solo a nivel app — el schema no tiene check constraint
// sobre rateType, asi que no hay nada que ajustar en SQL aqui).
//
// ORDEN DE MIGRACIONES (CLAUDE.md regla #13):
//   1. Este endpoint se pushea PRIMERO (sin tocar schema.prisma).
//   2. Tomy lo ejecuta manualmente con la key.
//   3. Luego en Sub-fase 3b se agregan los campos a `schema.prisma` + codigo.
//
// Uso:
//   curl "https://nitrosales.vercel.app/api/admin/migrate-manualcost-fase3?key=<NEXTAUTH_SECRET>"
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (!key || key !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // ─────────────────────────────────────────────────────────────
    // 1. fiscalType — clasificacion fiscal del costo
    //    'DEDUCTIBLE_WITH_IVA' (default) | 'DEDUCTIBLE_NO_IVA' | 'NON_DEDUCTIBLE'
    //
    //    Usado en Fase 5 (Fiscal) para construir bridge contable.
    //    Default seguro: asume deducible con IVA porque es el caso mas
    //    comun en costos operativos (alquiler, sueldos tienen su propio
    //    tratamiento pero el default no rompe nada — se puede sobreescribir).
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "manual_costs"
        ADD COLUMN IF NOT EXISTS "fiscalType" VARCHAR(32)
        NOT NULL DEFAULT 'DEDUCTIBLE_WITH_IVA';
    `);

    // ─────────────────────────────────────────────────────────────
    // 2. behavior — taxonomia granular de comportamiento
    //    'FIXED' | 'VARIABLE' | 'SEMI_FIXED'
    //
    //    Nullable a proposito: si null, la UI cae al campo `type` legacy
    //    (FIXED / VARIABLE). Asi no forzamos backfill masivo.
    //    Fase 2d (Estado) ya tiene mapeo por categoria como fallback;
    //    este campo lo sobreescribe cuando existe.
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "manual_costs"
        ADD COLUMN IF NOT EXISTS "behavior" VARCHAR(16);
    `);

    // ─────────────────────────────────────────────────────────────
    // 3. driverFormula — DSL JSON para rate type DRIVER_BASED
    //
    //    Shape esperado:
    //    {
    //      drivers: [
    //        { key: "headcount_atencion", label: "Headcount atencion", value: 2, unit: "personas" },
    //        { key: "salario_promedio",   label: "Salario promedio",   value: 800000, unit: "ARS" }
    //      ],
    //      formula: "headcount_atencion * salario_promedio * 1.30",
    //      lastComputedAmount: 2080000,
    //      lastComputedAt: "2026-04-18T10:00:00.000Z"
    //    }
    //
    //    Nullable: solo tiene sentido con rateType='DRIVER_BASED'.
    //    Para otros rateTypes queda null.
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "manual_costs"
        ADD COLUMN IF NOT EXISTS "driverFormula" JSONB;
    `);

    // ─────────────────────────────────────────────────────────────
    // 4. autoInflationAdjust — copy-from-prev ajusta por IPC
    //
    //    false default: mantener comportamiento actual (no pisa datos
    //    existentes al copiar mes anterior).
    //    true: al hacer copy-from-prev en Sub-fase 3e, suma IPC del mes
    //    anterior al amount y lo anota en `notes`.
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "manual_costs"
        ADD COLUMN IF NOT EXISTS "autoInflationAdjust" BOOLEAN
        NOT NULL DEFAULT FALSE;
    `);

    // ─────────────────────────────────────────────────────────────
    // Index opcional — para filtrar rapido "costos con driver"
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "manual_costs_driver_idx"
        ON "manual_costs"("organizationId")
        WHERE "driverFormula" IS NOT NULL;
    `);

    // ─────────────────────────────────────────────────────────────
    // Verificacion — devuelve las columnas existentes para que Tomy
    // confirme que el ADD corrio en las 4.
    // ─────────────────────────────────────────────────────────────
    const columns = await prisma.$queryRawUnsafe<
      Array<{ column_name: string; data_type: string; column_default: string | null }>
    >(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'manual_costs'
        AND column_name IN ('fiscalType', 'behavior', 'driverFormula', 'autoInflationAdjust')
      ORDER BY column_name;
    `);

    return NextResponse.json({
      ok: true,
      phase: "3a",
      table: "manual_costs",
      addedColumns: columns,
      expected: ["autoInflationAdjust", "behavior", "driverFormula", "fiscalType"],
      note:
        "Columnas agregadas. Paso siguiente: actualizar prisma/schema.prisma + tipos (Sub-fase 3b).",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
