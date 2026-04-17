// ═══════════════════════════════════════════════════════════════════
// /api/finanzas/fx-ipc
// ═══════════════════════════════════════════════════════════════════
// Endpoint que alimenta el hook `useCurrencyView()` con:
//   - latestFx: ultima cotizacion disponible (oficial / MEP / CCL / blue)
//   - currentIpcAcumulado: indice de inflacion del ultimo mes disponible
//   - ipcByMonth: mapa { "YYYY-MM-DD" -> { ipc, ipcAcumulado } }
//                 para convertir montos viejos al poder adquisitivo de hoy
//
// Fuente de datos: las tablas `ExchangeRateDaily` e `InflationIndexMonthly`
// pobladas por los crons /api/cron/exchange-rates y /inflation-index.
//
// Este endpoint es publico dentro de la app (no requiere auth especifica
// porque FX y IPC son datos publicos e identicos para todas las orgs).
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function decimalToNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  // Decimal de Prisma viene como string o Decimal object
  const n = Number(v as string);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  try {
    const [latestFx, allIpc] = await Promise.all([
      prisma.exchangeRateDaily.findFirst({
        orderBy: { date: "desc" },
      }),
      prisma.inflationIndexMonthly.findMany({
        orderBy: { month: "asc" },
      }),
    ]);

    const ipcByMonth: Record<string, { ipc: number | null; ipcAcumulado: number | null }> = {};
    let currentIpcAcumulado: number | null = null;
    let latestIpcMonth: string | null = null;

    for (const row of allIpc) {
      const key = row.month.toISOString().split("T")[0]; // "2026-03-01"
      ipcByMonth[key] = {
        ipc: decimalToNumber(row.ipc),
        ipcAcumulado: decimalToNumber(row.ipcAcumulado),
      };
    }
    if (allIpc.length > 0) {
      const last = allIpc[allIpc.length - 1];
      latestIpcMonth = last.month.toISOString().split("T")[0];
      currentIpcAcumulado = decimalToNumber(last.ipcAcumulado);
    }

    return NextResponse.json({
      latestFx: latestFx
        ? {
            date: latestFx.date.toISOString().split("T")[0],
            oficial: decimalToNumber(latestFx.oficial),
            mep: decimalToNumber(latestFx.mep),
            ccl: decimalToNumber(latestFx.ccl),
            blue: decimalToNumber(latestFx.blue),
            source: latestFx.source,
          }
        : null,
      latestIpcMonth,
      currentIpcAcumulado,
      ipcByMonth,
      loadedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
