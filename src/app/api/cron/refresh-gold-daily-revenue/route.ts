// ══════════════════════════════════════════════════════════════════════════
// GET /api/cron/refresh-gold-daily-revenue — Fase 1 (§8, §9)
// ══════════════════════════════════════════════════════════════════════════
// Recomputa gold_daily_revenue (rollup diario pack-aware) para la ventana reciente,
// leyendo silver_orders. Se agenda DESPUÉS de refresh-silver-orders (5 min) para
// leer Silver ya actualizado.
//
//   • Off-switch: SILVER_ORDERS_ENABLED=false lo apaga (junto con Silver).
//   • Una sola sentencia (agrupa todas las orgs); idempotente (ON CONFLICT).
//   • Resiliente: si la tabla gold no existe aún, no rompe (devuelve error json).
//
// Auth: user-agent vercel-cron, o ?key=<ADMIN_API_KEY>.
// ══════════════════════════════════════════════════════════════════════════

import { isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  buildGoldDailyRevenueUpsert,
  buildGoldDailyRevenueDeleteOrphans,
} from "@/data/gold/gold-daily-revenue-transform";
import {
  buildGoldSegmentsUpsert,
  buildGoldSegmentsDeleteOrphans,
} from "@/data/gold/gold-order-segments-transform";
import {
  buildGoldProductSalesUpsert,
  buildGoldProductSalesDeleteOrphans,
} from "@/data/gold/gold-product-sales-transform";
import {
  buildGoldCustomerDailyUpsert,
  buildGoldCustomerDailyDeleteOrphans,
} from "@/data/gold/gold-customer-daily-transform";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAYS_BACK = 4; // cubre la ventana de Silver (3d) + margen de borde

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const isVercelCron = req.headers.get("user-agent")?.includes("vercel-cron");
  if (!isVercelCron && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (process.env.SILVER_ORDERS_ENABLED === "false") {
    return NextResponse.json({ skipped: true, reason: "SILVER_ORDERS_ENABLED=false" });
  }

  const startedAt = Date.now();
  const full = url.searchParams.get("full") === "1";
  const since = full
    ? "1970-01-01T00:00:00Z"
    : new Date(Date.now() - DAYS_BACK * 86_400_000).toISOString();

  try {
    // ⚠️ runStartedAt sale del reloj de la BASE, no de `new Date()`.
    // `gold_updated_at` lo escribe Postgres con now(); si los relojes de Vercel y
    // Neon divergen en la dirección equivocada, un runStartedAt "del futuro"
    // haría que el DELETE de huérfanas borre las filas que el upsert acaba de
    // escribir. Una query barata elimina la clase entera de problema.
    const nowRow = await prisma.$queryRawUnsafe<Array<{ now: Date }>>(
      `SELECT now() AS now`
    );
    const runStartedAt = new Date(nowRow[0].now).toISOString();

    // Los 4 rollups siguen el MISMO patrón (auditoría 2026-07-21): upsert +
    // borrado de huérfanas en UNA transacción. Antes sólo `segments` lo hacía,
    // aunque la lección de 2026-07-17 decía explícitamente que aplicaba a
    // cualquier rollup bucket-izado con upsert incremental.
    // Ahora es obligatorio además por otro motivo: al recomputar días VIEJOS
    // (cancelaciones retroactivas), si la orden cancelada era la única de su
    // bucket el upsert no emite la fila y la vieja sobrevive con el valor viejo
    // → sin el DELETE, el fix de la ventana no arregla nada.
    let dailyOk = true;
    let dailyError: string | null = null;
    try {
      await prisma.$transaction([
        prisma.$executeRawUnsafe(buildGoldDailyRevenueUpsert(), since),
        prisma.$executeRawUnsafe(
          buildGoldDailyRevenueDeleteOrphans(),
          since,
          runStartedAt
        ),
      ]);
    } catch (de: any) {
      dailyOk = false;
      dailyError = String(de?.message).slice(0, 200);
    }
    // Segmentos — independiente: si la tabla todavía no existe, no rompe el daily.
    let segmentsOk = true;
    let segmentsError: string | null = null;
    try {
      await prisma.$transaction([
        prisma.$executeRawUnsafe(buildGoldSegmentsUpsert(), since),
        prisma.$executeRawUnsafe(buildGoldSegmentsDeleteOrphans(), since, runStartedAt),
      ]);
    } catch (se: any) {
      segmentsOk = false;
      segmentsError = String(se?.message).slice(0, 200);
    }
    // Ventas por producto (tanda 2) — independiente, mismo patrón resiliente.
    let productSalesOk = true;
    let productSalesError: string | null = null;
    try {
      await prisma.$transaction([
        prisma.$executeRawUnsafe(buildGoldProductSalesUpsert(), since),
        prisma.$executeRawUnsafe(
          buildGoldProductSalesDeleteOrphans(),
          since,
          runStartedAt
        ),
      ]);
    } catch (pe: any) {
      productSalesOk = false;
      productSalesError = String(pe?.message).slice(0, 200);
    }
    // Ventas por cliente (top customers) — independiente, mismo patrón resiliente.
    let customerOk = true;
    let customerError: string | null = null;
    try {
      await prisma.$transaction([
        prisma.$executeRawUnsafe(buildGoldCustomerDailyUpsert(), since),
        prisma.$executeRawUnsafe(
          buildGoldCustomerDailyDeleteOrphans(),
          since,
          runStartedAt
        ),
      ]);
    } catch (ce: any) {
      customerOk = false;
      customerError = String(ce?.message).slice(0, 200);
    }
    // `ok` refleja los 4 rollups (auditoría 2026-07-21, A3). Antes era `true`
    // fijo: los try/catch degradaban a silencio y nadie lee este JSON — es un
    // cron de Vercel. gold_product_sales podía fallar 30 días seguidos, dejar
    // `topProducts` con datos de hace un mes, y reportar ok:true igual.
    const allOk = dailyOk && segmentsOk && productSalesOk && customerOk;
    return NextResponse.json(
      {
        ok: allOk,
        mode: full ? "backfill" : "incremental",
        since,
        runStartedAt,
        dailyOk,
        ...(dailyError ? { dailyError } : {}),
        segmentsOk,
        ...(segmentsError ? { segmentsError } : {}),
        productSalesOk,
        ...(productSalesError ? { productSalesError } : {}),
        customerOk,
        ...(customerError ? { customerError } : {}),
        durationMs: Date.now() - startedAt,
      },
      // 500 para que Vercel lo marque como fallido y aparezca en los logs de
      // cron. Sin esto el fallo parcial es invisible.
      { status: allOk ? 200 : 500 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message).slice(0, 300), durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}
