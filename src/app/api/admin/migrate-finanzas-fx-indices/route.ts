// ═══════════════════════════════════════════════════════════════════
// /api/admin/migrate-finanzas-fx-indices
// ═══════════════════════════════════════════════════════════════════
// Endpoint idempotente para crear las 2 tablas globales que alimentan
// el toggle de moneda USD / ARS-nominal / ARS-ajustada del modulo Finanzas:
//
//   - ExchangeRateDaily     -> cotizaciones diarias (oficial / MEP / CCL / blue)
//   - InflationIndexMonthly -> IPC mensual (INDEC)
//
// Ambas tablas son GLOBALES (sin organizationId) porque el dolar MEP del
// 15/04/2026 y el IPC de marzo 2026 son identicos para cualquier empresa
// argentina. Cache compartido entre orgs.
//
// Uso:
//   curl "https://nitrosales.vercel.app/api/admin/migrate-finanzas-fx-indices?key=<NEXTAUTH_SECRET>"
//
// Ver PROPUESTA_PNL_REORG.md, Fase 0, seccion "Schema nuevo".
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
    // ExchangeRateDaily
    // ─────────────────────────────────────────────────────────────
    // Una fila por dia. "date" es UNIQUE. Las 4 cotizaciones son
    // nullables para tolerar fuentes que solo devuelvan algunas.
    // DECIMAL(12,4) aguanta hasta 99,999,999.9999 (el dolar llego a
    // $1500 en 2024; 4 decimales porque algunas fuentes publican
    // con precision fina tipo 1432.50).
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ExchangeRateDaily" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "date" DATE NOT NULL,
        "oficial" DECIMAL(12,4),
        "mep" DECIMAL(12,4),
        "ccl" DECIMAL(12,4),
        "blue" DECIMAL(12,4),
        "source" TEXT NOT NULL DEFAULT 'dolarapi.com',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeRateDaily_date_key"
      ON "ExchangeRateDaily"("date");
    `);

    // Indice descendente por fecha para obtener la ultima cotizacion rapido
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ExchangeRateDaily_date_desc_idx"
      ON "ExchangeRateDaily"("date" DESC);
    `);

    // ─────────────────────────────────────────────────────────────
    // InflationIndexMonthly
    // ─────────────────────────────────────────────────────────────
    // Una fila por mes. "month" es UNIQUE (se guarda como DATE del
    // primer dia del mes: 2026-03-01, 2026-04-01, etc.).
    //
    //   - ipc:           variacion % mensual (ej: 2.45 = 2.45% en el mes)
    //   - ipcAcumulado:  indice acumulado base 100 desde "baseDate"
    //                    (ej: si baseDate=2024-12-01 y ipcAcumulado=152.3,
    //                    los precios aumentaron 52.3% desde diciembre 2024)
    //   - baseDate:      fecha base del indice acumulado (para reconstruir
    //                    la serie si INDEC cambia el mes base)
    // ─────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "InflationIndexMonthly" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "month" DATE NOT NULL,
        "ipc" DECIMAL(8,4),
        "ipcAcumulado" DECIMAL(12,4),
        "baseDate" DATE,
        "source" TEXT NOT NULL DEFAULT 'INDEC',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "InflationIndexMonthly_month_key"
      ON "InflationIndexMonthly"("month");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "InflationIndexMonthly_month_desc_idx"
      ON "InflationIndexMonthly"("month" DESC);
    `);

    return NextResponse.json({
      ok: true,
      tables: ["ExchangeRateDaily", "InflationIndexMonthly"],
      indexes: [
        "ExchangeRateDaily_date_key",
        "ExchangeRateDaily_date_desc_idx",
        "InflationIndexMonthly_month_key",
        "InflationIndexMonthly_month_desc_idx",
      ],
      note:
        "Tablas creadas. Paso siguiente: Commit 3 va a sumar los modelos Prisma + crons + hook useCurrencyView() + toggle en /finanzas/estado.",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
