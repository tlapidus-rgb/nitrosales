// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-cash-balance-override
// ═══════════════════════════════════════════════════════════════════
// Endpoint idempotente para crear la tabla que permite a Tomy corregir
// el cash balance automático del Pulso con el saldo real de su banco.
//
// Tabla: cash_balance_overrides
//   - 1 override vigente por (organizationId, month)
//   - se hace upsert por esa combo
//   - note opcional, currency default ARS
//
// Uso:
//   curl "https://nitrosales.vercel.app/api/admin/migrate-cash-balance-override?key=<NEXTAUTH_SECRET>"
//
// Ver plan linear-pondering-lemur.md § Sub-fase 1e.
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
    // cash_balance_overrides
    // ─────────────────────────────────────────────────────────────
    // month se guarda como texto "YYYY-MM" para facilitar comparaciones
    // directas con el mes corriente del Pulso (también YYYY-MM).
    // amount es DECIMAL(15,2) — soporta saldos grandes en pesos.
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "cash_balance_overrides" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "month" TEXT NOT NULL,
        "amount" DECIMAL(15,2) NOT NULL,
        "currency" TEXT NOT NULL DEFAULT 'ARS',
        "note" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Unique compuesto para garantizar 1 override por org + mes
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "cash_balance_overrides_org_month_key"
      ON "cash_balance_overrides"("organizationId", "month");
    `);

    // Index descendente para buscar último override rápido
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "cash_balance_overrides_org_month_desc_idx"
      ON "cash_balance_overrides"("organizationId", "month" DESC);
    `);

    // FK (ignora si ya existe)
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "cash_balance_overrides"
          ADD CONSTRAINT "cash_balance_overrides_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    return NextResponse.json({
      ok: true,
      tables: ["cash_balance_overrides"],
      indexes: [
        "cash_balance_overrides_org_month_key",
        "cash_balance_overrides_org_month_desc_idx",
      ],
      note:
        "Tabla creada. Paso siguiente: pushear los endpoints /api/finanzas/cash-balance/override y el modal CashBalanceOverride.",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
