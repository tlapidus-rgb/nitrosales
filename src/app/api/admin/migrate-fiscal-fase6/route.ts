// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-fiscal-fase6
// ═══════════════════════════════════════════════════════════════════
// Fase 6 — Fiscal enhanced + Bridge. Crea la tabla
// `fiscal_obligation_overrides` que permite a cada organizacion
// agregar/editar obligaciones fiscales custom (ej: "pago contador dia 5")
// por encima de las que se derivan automaticamente del `fiscalProfile`
// (Monotributo, IIBB, IVA, Ganancias).
//
// El calendario fiscal final que consume la UI lo arma
// /api/finance/fiscal/calendar combinando:
//   (a) defaults derivados del fiscalProfile (hardcoded en TS).
//   (b) overrides de esta tabla (per-org, editable).
//
// No se guarda el calendario entero en DB — es derivado per-request.
// Esta tabla solo guarda los "diffs" que el usuario hizo (custom adds,
// custom hides de defaults, custom amounts).
//
// ORDEN DE MIGRACIONES (CLAUDE.md regla #13 / error #S36):
//   1. Este endpoint se pushea PRIMERO (sin tocar schema.prisma).
//   2. Tomy lo ejecuta manualmente con la key.
//   3. Luego en sub-fase 6b se agrega el modelo a `schema.prisma` + API.
//
// Uso:
//   curl "https://nitrosales.vercel.app/api/admin/migrate-fiscal-fase6?key=<NEXTAUTH_SECRET>"
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
    // 1. Tabla `fiscal_obligation_overrides`
    //
    //    Columnas:
    //      id                 TEXT PK
    //      organizationId     TEXT FK -> organizations(id) ON DELETE CASCADE
    //      kind               TEXT NOT NULL default 'CUSTOM'
    //                         ('CUSTOM' = agregado por el usuario
    //                          'OVERRIDE_DEFAULT' = edita un default — usa defaultKey)
    //      defaultKey         TEXT nullable
    //                         (ej "MONOTRIBUTO", "IIBB_CABA", "IVA_RI", "GANANCIAS_ANUAL")
    //                         Solo presente si kind = 'OVERRIDE_DEFAULT'.
    //      name               TEXT NOT NULL
    //                         (ej "Pago contador", "Monotributo cat H")
    //      category           TEXT NOT NULL default 'CUSTOM'
    //                         ('MONOTRIBUTO'|'IIBB'|'IVA'|'GANANCIAS'|'CUSTOM')
    //      dueDay             INTEGER NOT NULL default 1 (1..31, o 99 si = ultimo)
    //      frequency          TEXT NOT NULL default 'MONTHLY'
    //                         ('MONTHLY'|'BIMONTHLY'|'QUARTERLY'|'SEMIANNUAL'|'YEARLY')
    //      yearlyMonth        INTEGER nullable (1..12)
    //                         Solo usado si frequency = 'YEARLY'. Mes del vencimiento.
    //      amount             DECIMAL(20,2) nullable
    //                         Monto conocido. null = "a calcular".
    //      amountSource       TEXT NOT NULL default 'MANUAL'
    //                         ('MANUAL'|'AUTO_MONOTRIBUTO'|'AUTO_PROFILE')
    //      isActive           BOOLEAN NOT NULL default TRUE
    //                         (si = false, se ignora en el calendario)
    //      hideDefault        BOOLEAN NOT NULL default FALSE
    //                         (si kind = 'OVERRIDE_DEFAULT' y hideDefault = true,
    //                          el default se oculta en el calendario renderizado)
    //      note               TEXT nullable
    //      startMonth         TEXT nullable (YYYY-MM)
    //      endMonth           TEXT nullable (YYYY-MM)
    //      createdAt          TIMESTAMP NOT NULL default NOW()
    //      updatedAt          TIMESTAMP NOT NULL default NOW()
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "fiscal_obligation_overrides" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "kind" TEXT NOT NULL DEFAULT 'CUSTOM',
        "defaultKey" TEXT,
        "name" TEXT NOT NULL,
        "category" TEXT NOT NULL DEFAULT 'CUSTOM',
        "dueDay" INTEGER NOT NULL DEFAULT 1,
        "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
        "yearlyMonth" INTEGER,
        "amount" DECIMAL(20,2),
        "amountSource" TEXT NOT NULL DEFAULT 'MANUAL',
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "hideDefault" BOOLEAN NOT NULL DEFAULT FALSE,
        "note" TEXT,
        "startMonth" TEXT,
        "endMonth" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ─────────────────────────────────────────────────────────────
    // 2. Indices
    //    - org_idx: lookup por organizacion
    //    - org_active_idx: filtrar por activos
    //    - org_default_unique: un override por (org, defaultKey)
    //      para evitar dos overrides del mismo default.
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "fiscal_obligation_overrides_org_idx"
      ON "fiscal_obligation_overrides"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "fiscal_obligation_overrides_org_active_idx"
      ON "fiscal_obligation_overrides"("organizationId", "isActive");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_obligation_overrides_org_defaultKey_unique"
      ON "fiscal_obligation_overrides"("organizationId", "defaultKey")
      WHERE "defaultKey" IS NOT NULL;
    `);

    // ─────────────────────────────────────────────────────────────
    // 3. FK a organizations (ignora si ya existe)
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "fiscal_obligation_overrides"
          ADD CONSTRAINT "fiscal_obligation_overrides_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // ─────────────────────────────────────────────────────────────
    // 4. Sanity check
    // ─────────────────────────────────────────────────────────────
    const countRows = await prisma.$queryRawUnsafe<
      Array<{ count: bigint }>
    >(`SELECT COUNT(*)::bigint AS count FROM "fiscal_obligation_overrides"`);
    const existingCount = Number(countRows?.[0]?.count ?? 0);

    return NextResponse.json({
      ok: true,
      message:
        "Tabla fiscal_obligation_overrides lista (idempotente). Los defaults viven en codigo TS — esta tabla solo guarda overrides per-org.",
      existingCount,
      defaultKeys: [
        "MONOTRIBUTO",
        "IVA_RI_MENSUAL",
        "IIBB_PRIMARY",
        "IIBB_CONVENIO",
        "GANANCIAS_ANUAL",
        "GANANCIAS_MENSUAL_RI",
        "PERCEPCION_MELI_IIBB",
        "PERCEPCION_MELI_IVA",
        "RETENCION_MELI_GANANCIAS",
      ],
    });
  } catch (error: any) {
    console.error("[migrate-fiscal-fase6] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: String(error?.message ?? error),
      },
      { status: 500 }
    );
  }
}
