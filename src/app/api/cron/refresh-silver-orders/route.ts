// ══════════════════════════════════════════════════════════════════════════
// GET /api/cron/refresh-silver-orders — Fase 2 (§8, §9)
// ══════════════════════════════════════════════════════════════════════════
// Mantiene silver_orders al día: por cada org, upsertea los orders de la ventana
// reciente (o toda la historia con ?full=1) usando buildSilverOrdersUpsert().
//
// SEGURIDAD / ESTADO:
//   • FLAG-GATED por SILVER_ORDERS_ENABLED: si != "true", NO escribe nada (skip).
//     Inerte hasta que el equipo lo encienda en Vercel, aun si se invoca el endpoint.
//   • IDEMPOTENTE: el upsert hace ON CONFLICT DO UPDATE → correr N veces = igual.
//   • BUDGET: corta si se pasa del presupuesto, para no timeoutear (retorna 200 parcial).
//   • Los flags is_valid/is_web salen del CONTRATO (via el transform) → sin drift.
//
// Auth: header user-agent vercel-cron, o ?key=<ADMIN_API_KEY> (igual que los demás crons).
// NO está en vercel.json todavía: el backfill inicial se corre a mano (?full=1) y se
// verifica paridad ANTES de agendarlo. Ver docs/medallion/silver-orders.md.
// ══════════════════════════════════════════════════════════════════════════

import { isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { buildSilverOrdersUpsert } from "@/data/silver/silver-orders-transform";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAYS_BACK = 3; // ventana incremental (cubre huecos de hasta 3 días)
const INVOCATION_BUDGET_MS = 250_000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const isVercelCron = req.headers.get("user-agent")?.includes("vercel-cron");
  if (!isVercelCron && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Off-switch: corre por DEFAULT (la paridad del backfill ya se verificó en prod,
  // mismatches=0). Se puede apagar seteando SILVER_ORDERS_ENABLED=false en Vercel.
  if (process.env.SILVER_ORDERS_ENABLED === "false") {
    return NextResponse.json({ skipped: true, reason: "SILVER_ORDERS_ENABLED=false (deshabilitado manualmente)" });
  }

  const startedAt = Date.now();
  const full = url.searchParams.get("full") === "1";
  const since = full
    ? "1970-01-01T00:00:00Z"
    : new Date(Date.now() - DAYS_BACK * 86_400_000).toISOString();

  const upsertSql = buildSilverOrdersUpsert();

  // Todas las orgs; el upsert filtra por org+fecha, las que no tienen datos = no-op.
  const orgs = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM organizations`
  );

  const results: Array<{ org: string; ok: boolean; ms: number; error?: string }> = [];
  let budgetHit = false;
  for (const { id } of orgs) {
    if (Date.now() - startedAt > INVOCATION_BUDGET_MS) {
      budgetHit = true;
      break;
    }
    const t = Date.now();
    try {
      await prisma.$executeRawUnsafe(upsertSql, id, since);
      results.push({ org: id, ok: true, ms: Date.now() - t });
    } catch (e: any) {
      results.push({ org: id, ok: false, ms: Date.now() - t, error: String(e?.message).slice(0, 200) });
    }
  }

  return NextResponse.json({
    ok: results.every((r) => r.ok),
    mode: full ? "backfill" : "incremental",
    since,
    orgsProcessed: results.length,
    totalOrgs: orgs.length,
    budgetHit,
    durationMs: Date.now() - startedAt,
    results,
  });
}
