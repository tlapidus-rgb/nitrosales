// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-scenarios-fase5
// ═══════════════════════════════════════════════════════════════════
// Fase 5 — Escenarios (what-if). Crea la tabla `financial_scenarios`
// para soportar escenarios guardados por organizacion con sus drivers,
// ranges (min/max por driver) y cache del ultimo compute.
//
// No crea tabla DriverValue separada: los drivers viven en JSONB dentro
// del escenario. La taxonomia de drivers la define el engine del API
// (keys conocidas: trafficPerDay, conversionRate, aov, adSpendPerDay,
// roas, cogsPct, headcount, opexBase, inflationMonthly, fxMonthly).
//
// El seed de los 3 escenarios default (Conservador / Base / Optimista)
// se hace lazy desde el GET /api/finance/scenarios: si la org no tiene
// ningun escenario, se crean los 3 defaults + el Base queda activo.
// Asi evitamos backfill masivo aqui.
//
// ORDEN DE MIGRACIONES (CLAUDE.md regla #13 / error #S36):
//   1. Este endpoint se pushea PRIMERO (sin tocar schema.prisma).
//   2. Tomy lo ejecuta manualmente con la key.
//   3. Luego en sub-fase 5b se agrega el modelo a `schema.prisma` + API.
//
// Uso:
//   curl "https://nitrosales.vercel.app/api/admin/migrate-scenarios-fase5?key=<NEXTAUTH_SECRET>"
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
    // 1. Tabla `financial_scenarios`
    //
    //    Columnas:
    //      id                 TEXT PK
    //      organizationId     TEXT FK -> organizations(id) ON DELETE CASCADE
    //      name               TEXT NOT NULL            (ej "Base", "Optimista")
    //      kind               TEXT NOT NULL default 'CUSTOM'
    //                         ('BASE' | 'OPTIMIST' | 'CONSERVATIVE' | 'CUSTOM')
    //      color              TEXT nullable            (hex opcional para UI)
    //      description        TEXT nullable
    //      isActive           BOOLEAN NOT NULL default false
    //      drivers            JSONB NOT NULL default '{}'
    //                         DSL:
    //                         {
    //                           "trafficPerDay":   { "value": 1200, "min": 1000, "max": 1400, "unit": "visitas/dia" },
    //                           "conversionRate":  { "value": 2.1, "min": 1.8, "max": 2.4, "unit": "%" },
    //                           "aov":             { "value": 18500, "unit": "ARS" },
    //                           "adSpendPerDay":   { "value": 45000, "unit": "ARS" },
    //                           "roas":            { "value": 2.8, "min": 2.3, "max": 3.2 },
    //                           "cogsPct":         { "value": 38, "min": 36, "max": 42, "unit": "%" },
    //                           "headcount":       { "value": 7, "unit": "personas" },
    //                           "opexBase":        { "value": 3500000, "unit": "ARS/mes" },
    //                           "inflationMonthly":{ "value": 2.5, "unit": "%" },
    //                           "fxMonthly":       { "value": 1.8, "unit": "%" }
    //                         }
    //      horizonMonths      INTEGER NOT NULL default 12
    //      lastComputedAt     TIMESTAMP nullable       (ultimo /compute)
    //      lastComputedJson   JSONB nullable           (cache del forecast)
    //      createdById        TEXT nullable            (userId creador)
    //      createdAt          TIMESTAMP NOT NULL default NOW()
    //      updatedAt          TIMESTAMP NOT NULL default NOW()
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "financial_scenarios" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "kind" TEXT NOT NULL DEFAULT 'CUSTOM',
        "color" TEXT,
        "description" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT FALSE,
        "drivers" JSONB NOT NULL DEFAULT '{}',
        "horizonMonths" INTEGER NOT NULL DEFAULT 12,
        "lastComputedAt" TIMESTAMP(3),
        "lastComputedJson" JSONB,
        "createdById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ─────────────────────────────────────────────────────────────
    // 2. Indices
    //    - org_idx: lookup por organizacion (N-per-org)
    //    - org_kind_idx: filtrar por tipo dentro de org
    //    - org_active_unique: unique parcial — solo 1 activo por org
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "financial_scenarios_org_idx"
      ON "financial_scenarios"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "financial_scenarios_org_kind_idx"
      ON "financial_scenarios"("organizationId", "kind");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "financial_scenarios_org_active_unique"
      ON "financial_scenarios"("organizationId")
      WHERE "isActive" = TRUE;
    `);

    // ─────────────────────────────────────────────────────────────
    // 3. FK a organizations (ignora si ya existe)
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "financial_scenarios"
          ADD CONSTRAINT "financial_scenarios_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // ─────────────────────────────────────────────────────────────
    // 4. Sanity check — contar scenarios existentes
    // ─────────────────────────────────────────────────────────────
    const countRows = await prisma.$queryRawUnsafe<
      Array<{ count: bigint }>
    >(`SELECT COUNT(*)::bigint AS count FROM "financial_scenarios"`);
    const existingCount = Number(countRows?.[0]?.count ?? 0);

    return NextResponse.json({
      ok: true,
      message:
        "Tabla financial_scenarios lista (idempotente). Los 3 defaults se crean lazy al primer GET /api/finance/scenarios.",
      existingCount,
      driversKeys: [
        "trafficPerDay",
        "conversionRate",
        "aov",
        "adSpendPerDay",
        "roas",
        "cogsPct",
        "headcount",
        "opexBase",
        "inflationMonthly",
        "fxMonthly",
      ],
    });
  } catch (error: any) {
    console.error("[migrate-scenarios-fase5] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: String(error?.message ?? error),
      },
      { status: 500 }
    );
  }
}
