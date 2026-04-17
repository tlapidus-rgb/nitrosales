// ═══════════════════════════════════════════════════════════════════
// /api/cron/inflation-index
// ═══════════════════════════════════════════════════════════════════
// Cron mensual (dia 15 ~10:00 ART) que actualiza la tabla
// `InflationIndexMonthly` con la serie de IPC publicada por INDEC.
//
// Fuente: argentinadatos.com (republica los datos del INDEC, gratis,
// sin auth, JSON). Endpoint:
//   GET https://api.argentinadatos.com/v1/finanzas/indices/inflacion
//   -> [{ fecha: "2026-03-01", valor: 2.45 }, ...]
//
// Estrategia:
//  1. Fetch la serie completa.
//  2. Calcular ipcAcumulado (base 100 desde el primer mes de la serie)
//     iterativamente: idx_n = idx_(n-1) * (1 + ipc_n / 100).
//  3. Upsert cada mes (idempotente — re-correr es seguro).
//
// ¿Por que cron mensual y no diario? El IPC es mensual. INDEC publica
// el dato del mes anterior alrededor del dia 14-15 de cada mes. Correr
// el dia 15 garantiza que ya este disponible. Re-correrlo cualquier dia
// es seguro (idempotente).
//
// Auth: SYNC_KEY via ?key=... o Authorization: Bearer ...
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type IpcRow = { fecha: string; valor: number };

export async function GET(req: NextRequest) {
  // Auth
  const { searchParams } = req.nextUrl;
  const syncKey = searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (syncKey !== process.env.SYNC_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(
      "https://api.argentinadatos.com/v1/finanzas/indices/inflacion",
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      }
    );
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `argentinadatos devolvio ${res.status}` },
        { status: 200 }
      );
    }

    const series: IpcRow[] = await res.json();
    if (!Array.isArray(series) || series.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Serie vacia o malformada" },
        { status: 200 }
      );
    }

    // Ordenar cronologicamente por si la fuente devuelve mezclado
    const ordered = [...series].sort((a, b) => a.fecha.localeCompare(b.fecha));

    // baseDate = primer mes de la serie. ipcAcumulado base = 100.
    const baseDate = new Date(`${ordered[0].fecha.split("T")[0]}T00:00:00.000Z`);
    let cumulativeIndex = 100;
    let upserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < ordered.length; i++) {
      const row = ordered[i];
      const month = new Date(`${row.fecha.split("T")[0]}T00:00:00.000Z`);
      const ipc = typeof row.valor === "number" ? row.valor : null;
      if (ipc === null) continue;

      // Para el primer mes, ipcAcumulado = 100 (base).
      // Para los siguientes, multiplicamos por (1 + ipc/100).
      if (i > 0) {
        cumulativeIndex = cumulativeIndex * (1 + ipc / 100);
      }

      try {
        await prisma.inflationIndexMonthly.upsert({
          where: { month },
          create: {
            month,
            ipc,
            ipcAcumulado: cumulativeIndex,
            baseDate,
            source: "INDEC via argentinadatos.com",
          },
          update: {
            ipc,
            ipcAcumulado: cumulativeIndex,
            baseDate,
            source: "INDEC via argentinadatos.com",
            updatedAt: new Date(),
          },
        });
        upserted++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${row.fecha}: ${msg}`);
      }
    }

    const lastMonth = ordered[ordered.length - 1];

    return NextResponse.json({
      ok: true,
      upserted,
      totalInSeries: ordered.length,
      baseDate: baseDate.toISOString().split("T")[0],
      lastMonth: lastMonth.fecha.split("T")[0],
      lastIpc: lastMonth.valor,
      lastCumulativeIndex: Number(cumulativeIndex.toFixed(4)),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
