import { NextRequest, NextResponse } from "next/server";
import { isValidAdminKey } from "@/lib/admin-key";
import { prisma } from "@/lib/db/client";
import { SEED_CHANNEL_RULES } from "@/lib/pixel/channel-rules";
import {
  CHANNEL_RULE_DDL,
  INSERT_CHANNEL_RULE_SQL,
  ruleInsertParams,
} from "@/lib/pixel/channel-rules-store";

// ══════════════════════════════════════════════════════════════════════════
// POST /api/admin/channel-rules-setup?key=<ADMIN_API_KEY>
// ══════════════════════════════════════════════════════════════════════════
// Crea la tabla `channel_rule` (IF NOT EXISTS) y siembra las reglas GLOBALES
// (idempotente por id). Es la fase (1) CREATE del orden de migraciones de
// CLAUDE.md — el código que lee la tabla se deploya después. Correrlo N veces
// re-escribe las mismas reglas seed, nunca duplica.
//
// ⚠️ NO cambia números de nadie por sí solo: hasta que el rollup lea la tabla
// (Fase 3 completa), esto es infraestructura inerte.
// ══════════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const key = new URL(req.url).searchParams.get("key");
  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // CHANNEL_RULE_DDL trae dos statements (tabla + índice); $executeRawUnsafe corre
  // uno por vez.
  const ddl = CHANNEL_RULE_DDL.split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of ddl) {
    await prisma.$executeRawUnsafe(stmt);
  }

  let seededGlobals = 0;
  for (const rule of SEED_CHANNEL_RULES) {
    await prisma.$executeRawUnsafe(INSERT_CHANNEL_RULE_SQL, ...ruleInsertParams(rule));
    seededGlobals++;
  }

  return NextResponse.json({ ok: true, table: "channel_rule", seededGlobals });
}
