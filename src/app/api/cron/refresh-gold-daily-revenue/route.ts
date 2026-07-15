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
import { buildGoldDailyRevenueUpsert } from "@/data/gold/gold-daily-revenue-transform";

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
    await prisma.$executeRawUnsafe(buildGoldDailyRevenueUpsert(), since);
    return NextResponse.json({
      ok: true,
      mode: full ? "backfill" : "incremental",
      since,
      durationMs: Date.now() - startedAt,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message).slice(0, 300), durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}
