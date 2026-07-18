// ══════════════════════════════════════════════════════════════════════════
// GET /api/cron/refresh-gold-attribution — Medallion tanda 5
// ══════════════════════════════════════════════════════════════════════════
// Recomputa gold_attribution_source (rollup de revenue de atribución por
// org×día×source) para la ventana reciente, leyendo pixel_attributions (Bronze).
//
// A diferencia de los otros crons Gold, este NO lee silver_orders: los
// touchpoints son JSONB pesado (no van a Silver). El scan de pixel_attributions
// es aceptable POR CRON (1×/30min), no por request (15×/request era el dolor).
//
//   • Off-switch propio: ATTRIBUTION_ROLLUP_ENABLED=false lo apaga. Corre por
//     DEFAULT para que la tabla esté fresca ANTES de flipear PIXEL_USE_GOLD (el
//     flag que controla la LECTURA del serve — independiente de este cron).
//   • Resiliente: si la tabla todavía no existe (runbook pendiente), no rompe.
//   • ?full=1 → backfill de toda la historia.
//
// Auth: user-agent vercel-cron, o ?key=<ADMIN_API_KEY>.
// ══════════════════════════════════════════════════════════════════════════

import { isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { buildGoldAttributionSourceUpsert } from "@/data/gold/gold-attribution-source-transform";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAYS_BACK = 4; // ventana incremental + margen de borde

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const isVercelCron = req.headers.get("user-agent")?.includes("vercel-cron");
  if (!isVercelCron && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (process.env.ATTRIBUTION_ROLLUP_ENABLED === "false") {
    return NextResponse.json({ skipped: true, reason: "ATTRIBUTION_ROLLUP_ENABLED=false" });
  }

  const startedAt = Date.now();
  const full = url.searchParams.get("full") === "1";
  const since = full
    ? "1970-01-01T00:00:00Z"
    : new Date(Date.now() - DAYS_BACK * 86_400_000).toISOString();

  try {
    await prisma.$executeRawUnsafe(buildGoldAttributionSourceUpsert(), since);
    return NextResponse.json({
      ok: true,
      mode: full ? "backfill" : "incremental",
      since,
      durationMs: Date.now() - startedAt,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message).slice(0, 300), durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
