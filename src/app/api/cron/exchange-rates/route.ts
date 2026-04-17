// ═══════════════════════════════════════════════════════════════════
// /api/cron/exchange-rates
// ═══════════════════════════════════════════════════════════════════
// Cron diario (1x/dia ~09:00 ART) que actualiza la tabla
// `ExchangeRateDaily` con las 4 cotizaciones del dolar:
//   - oficial, MEP (bolsa), CCL (contado con liqui), blue
//
// Fuente: dolarapi.com (API publica, gratis, sin auth, muy estable).
//
// Estrategia:
//  1. Fetch en paralelo las 4 endpoints. Si alguna falla, seguimos
//     con las demas (la fila se guarda con null en las que fallaron).
//  2. Upsert en la fila del dia de hoy en zona America/Argentina/Buenos_Aires.
//  3. Si ya existe la fila, se actualiza con valores mas recientes.
//
// Auth: SYNC_KEY via ?key=... o Authorization: Bearer ...
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────
// Fecha de hoy en Argentina (ART = UTC-3)
// ─────────────────────────────────────────────────────────────
function argentinaDateToday(): Date {
  const now = new Date();
  const art = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  // Construir un Date con solo year-month-day, a medianoche UTC
  return new Date(`${art.toISOString().split("T")[0]}T00:00:00.000Z`);
}

// ─────────────────────────────────────────────────────────────
// Fetch de una cotizacion puntual. Devuelve null si la API falla
// o si el payload no es el esperado, en vez de tirar error.
// ─────────────────────────────────────────────────────────────
async function fetchDolar(kind: "oficial" | "bolsa" | "contadoconliqui" | "blue"): Promise<number | null> {
  try {
    const res = await fetch(`https://dolarapi.com/v1/dolares/${kind}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      // Sin cache — siempre queremos el valor mas fresco
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[cron exchange-rates] dolarapi ${kind} devolvio ${res.status}`);
      return null;
    }
    const json = await res.json();
    // dolarapi.com devuelve { compra: number, venta: number, ... }
    // Usamos "venta" (lo que pagas para comprar USD) por convencion estandar.
    const venta = typeof json?.venta === "number" ? json.venta : null;
    return venta;
  } catch (e) {
    console.warn(`[cron exchange-rates] fetch ${kind} fallo:`, e);
    return null;
  }
}

export async function GET(req: NextRequest) {
  // Auth
  const { searchParams } = req.nextUrl;
  const syncKey = searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (syncKey !== process.env.SYNC_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [oficial, mep, ccl, blue] = await Promise.all([
      fetchDolar("oficial"),
      fetchDolar("bolsa"),
      fetchDolar("contadoconliqui"),
      fetchDolar("blue"),
    ]);

    const date = argentinaDateToday();
    const fetchedAny = oficial !== null || mep !== null || ccl !== null || blue !== null;

    if (!fetchedAny) {
      return NextResponse.json(
        {
          ok: false,
          warning: "dolarapi.com no devolvio ninguna cotizacion. No se guardo nada.",
          date: date.toISOString().split("T")[0],
        },
        { status: 200 }
      );
    }

    // Upsert: si ya existe la fila del dia, la actualiza con valores nuevos
    // (pero solo sobreescribe los que vinieron no-null).
    const existing = await prisma.exchangeRateDaily.findUnique({ where: { date } });

    const result = await prisma.exchangeRateDaily.upsert({
      where: { date },
      create: {
        date,
        oficial,
        mep,
        ccl,
        blue,
        source: "dolarapi.com",
      },
      update: {
        oficial: oficial ?? existing?.oficial ?? null,
        mep: mep ?? existing?.mep ?? null,
        ccl: ccl ?? existing?.ccl ?? null,
        blue: blue ?? existing?.blue ?? null,
        source: "dolarapi.com",
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      date: date.toISOString().split("T")[0],
      rates: {
        oficial: result.oficial ? Number(result.oficial) : null,
        mep: result.mep ? Number(result.mep) : null,
        ccl: result.ccl ? Number(result.ccl) : null,
        blue: result.blue ? Number(result.blue) : null,
      },
      source: "dolarapi.com",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
